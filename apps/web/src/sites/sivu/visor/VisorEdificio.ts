/**
 * VisorEdificio — motor 3D del Edificio Sapiencia, independiente de React.
 *
 * Port de script.js original (Sebastian Aguilar, three.js r180) con el
 * comportamiento del bloque del Observatorio
 * (Septiembre/observatorio/edificio-3d/edificio-3d-bloque.html, v1.2): el
 * edificio vive dentro de una página con scroll (debajo van los tableros), así
 * que no se adueña de la página.
 *
 * Del original se conservan la iluminación, la cámara inicial frente a la
 * PUERTA, el giro automático, el enfoque de la puerta (doble clic o "Ingresar")
 * y la protección para que la cámara no atraviese el edificio.
 *
 * Como en el bloque:
 * - Sin teclado propio (WASD, flechas, Espacio): le robarían esas teclas a
 *   toda la página. La barra de botones (giro, girar, acercar, alejar) es la
 *   alternativa para teclado y para un solo dedo.
 * - Sin desplazamiento lateral (pan) y sin bajar del suelo (maxPolarAngle),
 *   para que el edificio no se salga del encuadre.
 * - La rueda solo acerca con Ctrl o Cmd (el pellizco del trackpad llega así):
 *   sin tecla, la página baja y se llama a alUsarRuedaSinTecla para avisar.
 * - En pantallas táctiles el deslizamiento vertical mueve la página
 *   (touch-action: pan-y) y el horizontal gira el edificio.
 * - Con el panel encima de la escena, el centro de la vista se corre a la
 *   derecha (fijarZonaTapada → setViewOffset) para que el edificio quede en la
 *   zona libre.
 * - Solo dibuja mientras la escena está en pantalla y algo se mueve (giro
 *   automático, enfoque de la puerta o la inercia de un arrastre); quieto no
 *   gasta batería y cualquier gesto lo despierta.
 * - Con prefers-reduced-motion: reduce, el giro automático empieza en pausa y
 *   el enfoque de la puerta es instantáneo.
 * - Si la cámara deja de avanzar hacia la puerta (la protección del edificio o
 *   la distancia mínima no la dejan llegar), el enfoque termina ahí mismo.
 *
 * Robustez (de la primera versión del port):
 * - dispose() libera todo (bucle, oyentes, observadores, controles,
 *   geometrías/materiales/texturas, Draco, renderizador y contexto WebGL) y
 *   cancela la descarga; si el modelo llega después, se libera y se ignora.
 *   React StrictMode monta los efectos dos veces en desarrollo.
 * - El .glb se descarga con fetch (AbortController y progreso) y se lee con
 *   GLTFLoader.parseAsync + DRACOLoader: cualquier fallo de lectura (HTML,
 *   cuerpo vacío) termina en el estado de error. Al terminar la lectura se
 *   liberan los Workers de Draco.
 * - El acercamiento a la puerta (lerp 0,035 por fotograma a 60 fps) se
 *   normaliza por tiempo: 1 − (1 − 0,035)^n con n = delta × 60.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import type { ErrorVisor, EstadoVisor, FaseVisor } from './estado'
import {
  ALTURA_ENFOQUE_PUERTA,
  DISTANCIA_ENFOQUE_PUERTA,
  SUAVIZADO_ENFOQUE_PUERTA,
  UMBRAL_LLEGADA_PUERTA,
  calcularDistanciaEntrada,
  corregirPosicionHorizontal,
  elegirDireccionPuerta,
  factorPorFotogramas,
  type Punto3,
} from './geometria'

export interface OpcionesVisor {
  /** URL del modelo. Por defecto '/sivu/edificiofinal.glb'. */
  urlModelo?: string
  /** Carpeta del decodificador Draco. Por defecto '/sivu/draco/'. */
  rutaDecodificadorDraco?: string
  /** Se llama con cada cambio de estado (y una vez al construir). */
  alCambiarEstado?: (estado: EstadoVisor) => void
  /** La rueda se usó sin Ctrl/Cmd sobre el edificio ya cargado (la página bajó). */
  alUsarRuedaSinTecla?: (evento: WheelEvent) => void
  /** Empezar con el giro automático en pausa y enfocar la puerta sin animación. Por defecto: prefers-reduced-motion. */
  reducirMovimiento?: boolean
}

export type SentidoGiro = 'izquierda' | 'derecha'

/** Giro de cada pulsación de los botones de la barra (22,5°). */
const PASO_GIRO = Math.PI / 8
/** Factor de cada pulsación de "Acercar" y "Alejar". */
const PASO_ZOOM = 1.25
/** El original ocupaba casi toda la ventana (unos 720 px de alto): misma sensibilidad al arrastrar. */
const ALTO_REFERENCIA = 720
/** Segundos sin avanzar tras los que el enfoque de la puerta se da por terminado. */
const ESPERA_ENFOQUE_DETENIDO = 0.5
/** Píxeles que el dedo recorre antes de decidir si el gesto es vertical (página) u horizontal (giro). */
const UMBRAL_GESTO_TACTIL = 10

/** Métodos internos de OrbitControls r180 (no declarados en @types/three). */
type ControlesInternos = OrbitControls & {
  _rotateLeft(angulo: number): void
  /** Divide la distancia: acerca. */
  _dollyOut(escala: number): void
  /** Multiplica la distancia: aleja. */
  _dollyIn(escala: number): void
}

/* =========================================================
   UTILIDADES
========================================================= */

function prefiereMovimientoReducido(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function aVector(punto: Punto3): THREE.Vector3 {
  return new THREE.Vector3(punto.x, punto.y, punto.z)
}

class ErrorDescarga extends Error {
  readonly estado: number

  constructor(estado: number, url: string) {
    super(`La descarga de ${url} respondió con ${estado}`)
    this.name = 'ErrorDescarga'
    this.estado = estado
  }
}

/** Descarga un archivo como ArrayBuffer informando el porcentaje (o null si no se conoce el tamaño). */
async function descargarConProgreso(
  url: string,
  senal: AbortSignal,
  alProgresar: (porcentaje: number | null) => void,
): Promise<ArrayBuffer> {
  const respuesta = await fetch(url, { signal: senal, credentials: 'same-origin' })

  if (!respuesta.ok) throw new ErrorDescarga(respuesta.status, url)

  const codificacion = respuesta.headers.get('Content-Encoding')
  const longitud = Number(respuesta.headers.get('X-File-Size') ?? respuesta.headers.get('Content-Length'))
  // Con compresión HTTP, Content-Length es el tamaño comprimido: no sirve para el porcentaje.
  const total = (!codificacion || codificacion === 'identity') && longitud > 0 ? longitud : 0

  const lector = respuesta.body?.getReader()
  if (!lector) {
    const datos = await respuesta.arrayBuffer()
    alProgresar(100)
    return datos
  }

  const trozos: Uint8Array[] = []
  let recibidos = 0
  alProgresar(total ? 0 : null)

  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    trozos.push(value)
    recibidos += value.byteLength
    if (total) alProgresar(Math.min(100, Math.floor((recibidos / total) * 100)))
  }

  const datos = new Uint8Array(recibidos)
  let desplazamiento = 0
  for (const trozo of trozos) {
    datos.set(trozo, desplazamiento)
    desplazamiento += trozo.byteLength
  }
  alProgresar(100)
  return datos.buffer
}

/** Libera geometrías, materiales y texturas de un objeto cargado. */
function liberarObjeto(raiz: THREE.Object3D): void {
  const texturas = new Set<THREE.Texture>()
  const materiales = new Set<THREE.Material>()

  raiz.traverse((objeto) => {
    if (objeto instanceof THREE.Mesh || objeto instanceof THREE.Line || objeto instanceof THREE.Points) {
      ;(objeto.geometry as THREE.BufferGeometry).dispose()
      const lista: THREE.Material[] = Array.isArray(objeto.material) ? objeto.material : [objeto.material]
      for (const material of lista) materiales.add(material)
    }
  })

  for (const material of materiales) {
    for (const valor of Object.values(material)) {
      if (valor instanceof THREE.Texture) texturas.add(valor)
    }
    material.dispose()
  }

  for (const textura of texturas) {
    textura.dispose()
    const imagen: unknown = textura.image
    if (typeof ImageBitmap !== 'undefined' && imagen instanceof ImageBitmap) imagen.close()
  }
}

const MENSAJE_LECTURA = 'No se pudo leer el modelo 3D del edificio.'

/** Mensaje de un fallo de descarga (fetch). Los fallos al leer el .glb usan MENSAJE_LECTURA. */
function mensajeDeDescarga(error: unknown): string {
  if (error instanceof ErrorDescarga) {
    return `No se pudo descargar el modelo del edificio (error ${error.estado}).`
  }
  if (error instanceof TypeError) {
    return 'No se pudo descargar el modelo del edificio. Revisa tu conexión a internet.'
  }
  return MENSAJE_LECTURA
}

/** decoderPending existe en DRACOLoader (r180) pero @types/three no lo declara. */
type DracoConPendiente = DRACOLoader & { decoderPending?: Promise<unknown> | null }

/* =========================================================
   VISOR
========================================================= */

export class VisorEdificio {
  private readonly contenedor: HTMLElement
  private readonly urlModelo: string
  private readonly reducirMovimiento: boolean
  private alCambiarEstado: ((estado: EstadoVisor) => void) | null
  private alUsarRuedaSinTecla: ((evento: WheelEvent) => void) | null

  /* ESCENA, CÁMARA, RENDERIZADOR Y CONTROLES */
  private readonly escena = new THREE.Scene()
  private readonly camara: THREE.PerspectiveCamera
  /** null si el navegador no pudo crear el contexto WebGL. */
  private readonly nucleo: { renderizador: THREE.WebGLRenderer; controles: ControlesInternos } | null

  /* CARGA */
  private readonly cargador = new GLTFLoader()
  private readonly dracoLoader = new DRACOLoader()
  private readonly cancelacion = new AbortController()
  private fase: FaseVisor = 'descargando'
  private progreso: number | null = null
  private error: ErrorVisor | null = null

  /* EDIFICIO */
  private edificio: THREE.Object3D | null = null
  private puntoPuerta: THREE.Object3D | null = null
  private tamañoEdificio = new THREE.Vector3()
  private centroEdificio = new THREE.Vector3()

  /* ENFOQUE DE LA PUERTA */
  private enfocandoPuerta = false
  private objetivoCamara = new THREE.Vector3()
  private objetivoVista = new THREE.Vector3()
  private readonly posicionAnterior = new THREE.Vector3()
  private readonly vistaAnterior = new THREE.Vector3()
  private tiempoQuieto = 0

  /* ENCUADRE: píxeles de la izquierda de la escena que tapa el panel */
  private zonaTapada = 0

  /* GESTOS TÁCTILES */
  private toqueInicio: { x: number; y: number } | null = null
  private toqueEje: '' | 'h' | 'v' = ''

  /* BUCLE DE DIBUJO */
  private readonly reloj = new THREE.Clock()
  private idFotograma = 0
  /** Un fotograma está corriendo: despertar() no abre un segundo bucle (controles.update emite "change"). */
  private enFotograma = false
  private redibujar = true
  private visible = true
  private contextoPerdido = false

  /* CICLO DE VIDA */
  private observadorTamaño: ResizeObserver | null = null
  private observadorVisibilidad: IntersectionObserver | null = null
  private desechado = false
  private ultimoEstado: EstadoVisor | null = null

  constructor(contenedor: HTMLElement, opciones: OpcionesVisor = {}) {
    this.contenedor = contenedor
    this.urlModelo = opciones.urlModelo ?? '/sivu/edificiofinal.glb'
    this.reducirMovimiento = opciones.reducirMovimiento ?? prefiereMovimientoReducido()
    this.alCambiarEstado = opciones.alCambiarEstado ?? null
    this.alUsarRuedaSinTecla = opciones.alUsarRuedaSinTecla ?? null

    /* ESCENA */
    this.escena.background = null

    /* CÁMARA */
    const ancho = Math.max(contenedor.clientWidth, 1)
    const alto = Math.max(contenedor.clientHeight, 1)
    this.camara = new THREE.PerspectiveCamera(45, ancho / alto, 0.01, 10000)

    /* RENDERIZADOR */
    let renderizador: THREE.WebGLRenderer
    try {
      renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch (error) {
      console.error('[SIVU] No se pudo iniciar WebGL:', error)
      this.nucleo = null
      this.fase = 'error'
      this.error = {
        tipo: 'webgl',
        mensaje: 'Tu navegador no puede mostrar el edificio en 3D.',
      }
      this.notificar()
      return
    }

    renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    // Sin tocar el style del lienzo: el CSS lo estira al 100 % del contenedor.
    renderizador.setSize(ancho, alto, false)
    renderizador.outputColorSpace = THREE.SRGBColorSpace
    contenedor.appendChild(renderizador.domElement)

    /* ILUMINACIÓN (igual al original) */
    this.escena.add(new THREE.AmbientLight(0xffffff, 2))
    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1)
    luzPrincipal.position.set(10, 10, 10)
    this.escena.add(luzPrincipal)

    /* CONTROLES: girar y acercar, sin desplazamiento lateral ni bajar del suelo */
    const controles = new OrbitControls(this.camara, renderizador.domElement) as ControlesInternos
    controles.enableDamping = true
    controles.dampingFactor = 0.05
    controles.enableZoom = true
    controles.enablePan = false
    controles.autoRotate = !this.reducirMovimiento
    controles.autoRotateSpeed = 0.5
    controles.maxPolarAngle = Math.PI * 0.49
    // OrbitControls pone touch-action: none, que en el celular atrapa el dedo y
    // no deja bajar por la página. Con pan-y el deslizamiento vertical mueve la
    // página y el horizontal gira el edificio.
    renderizador.domElement.style.touchAction = 'pan-y'
    controles.addEventListener('change', this.despertar)
    controles.addEventListener('start', this.despertar)

    this.nucleo = { renderizador, controles }

    /* OYENTES */
    contenedor.addEventListener('dblclick', this.alHacerDobleClic)
    contenedor.addEventListener('wheel', this.alUsarRueda, { capture: true, passive: true })
    contenedor.addEventListener('pointerdown', this.alTocar, true)
    contenedor.addEventListener('pointermove', this.alMoverToque, true)
    renderizador.domElement.addEventListener('webglcontextlost', this.alPerderContexto)
    renderizador.domElement.addEventListener('webglcontextrestored', this.alRecuperarContexto)
    document.addEventListener('visibilitychange', this.despertar)

    if (typeof ResizeObserver === 'function') {
      this.observadorTamaño = new ResizeObserver(this.ajustarTamaño)
      this.observadorTamaño.observe(contenedor)
    }
    window.addEventListener('resize', this.ajustarTamaño)

    if (typeof IntersectionObserver === 'function') {
      this.observadorVisibilidad = new IntersectionObserver((entradas) => {
        const ultima = entradas.at(-1)
        if (ultima) this.visible = ultima.isIntersecting
        this.despertar()
      })
      this.observadorVisibilidad.observe(contenedor)
    }

    /* DRACO */
    this.dracoLoader.setDecoderPath(opciones.rutaDecodificadorDraco ?? '/sivu/draco/')
    this.cargador.setDRACOLoader(this.dracoLoader)

    this.ajustarTamaño()
    this.notificar()

    /* CARGAR EDIFICIO */
    void this.cargarEdificio()
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */

  /** Estado actual (el mismo que recibe alCambiarEstado). */
  obtenerEstado(): EstadoVisor {
    return {
      fase: this.fase,
      progreso: this.progreso,
      listo: this.fase === 'listo',
      error: this.error,
      rotacionActiva: this.nucleo?.controles.autoRotate ?? false,
      enfocandoPuerta: this.enfocandoPuerta,
      puertaEncontrada: this.puntoPuerta !== null,
    }
  }

  /** Detiene o reanuda el giro automático. Sin efecto mientras la cámara va hacia la puerta. */
  alternarRotacion(): void {
    if (!this.nucleo || this.desechado || this.enfocandoPuerta) return
    const { controles } = this.nucleo
    controles.autoRotate = !controles.autoRotate
    this.notificar()
    this.despertar()
  }

  /** Gira 22,5° en el mismo sentido que arrastrar hacia ese lado. Detiene el giro automático. */
  girar(sentido: SentidoGiro): void {
    this.tomarControl((controles) => controles._rotateLeft(sentido === 'derecha' ? PASO_GIRO : -PASO_GIRO))
  }

  acercar(): void {
    this.tomarControl((controles) => controles._dollyOut(PASO_ZOOM))
  }

  alejar(): void {
    this.tomarControl((controles) => controles._dollyIn(PASO_ZOOM))
  }

  /**
   * Lleva la cámara a la entrada (lo mismo que el doble clic). Devuelve false
   * si no aplica: antes de cargar, sin PUERTA o mientras ya va hacia ella.
   */
  enfocarPuerta(): boolean {
    if (!this.nucleo || this.desechado || this.contextoPerdido) return false
    if (!this.edificio || !this.puntoPuerta || this.enfocandoPuerta) return false

    this.iniciarEnfoquePuerta(this.edificio, this.puntoPuerta)
    this.notificar()
    if (this.reducirMovimiento) this.terminarEnfoque(true)
    this.despertar()
    return true
  }

  /**
   * Píxeles de la izquierda de la escena que tapa el panel morado (0 si el
   * panel va arriba, sin superponerse): el centro de la vista se corre a la
   * derecha la mitad de eso.
   */
  fijarZonaTapada(pixeles: number): void {
    const valor = Math.max(0, Math.round(pixeles))
    if (valor === this.zonaTapada) return
    this.zonaTapada = valor
    this.ajustarTamaño()
  }

  /** Libera todos los recursos. El visor no se puede volver a usar. */
  dispose(): void {
    if (this.desechado) return
    this.desechado = true
    this.alCambiarEstado = null
    this.alUsarRuedaSinTecla = null

    cancelAnimationFrame(this.idFotograma)
    this.idFotograma = 0
    this.cancelacion.abort()

    this.contenedor.removeEventListener('dblclick', this.alHacerDobleClic)
    this.contenedor.removeEventListener('wheel', this.alUsarRueda, { capture: true })
    this.contenedor.removeEventListener('pointerdown', this.alTocar, true)
    this.contenedor.removeEventListener('pointermove', this.alMoverToque, true)
    document.removeEventListener('visibilitychange', this.despertar)
    window.removeEventListener('resize', this.ajustarTamaño)
    this.observadorTamaño?.disconnect()
    this.observadorTamaño = null
    this.observadorVisibilidad?.disconnect()
    this.observadorVisibilidad = null

    if (this.edificio) {
      this.escena.remove(this.edificio)
      liberarObjeto(this.edificio)
      this.edificio = null
      this.puntoPuerta = null
    }

    this.liberarDraco()

    if (this.nucleo) {
      const { renderizador, controles } = this.nucleo
      controles.removeEventListener('change', this.despertar)
      controles.removeEventListener('start', this.despertar)
      renderizador.domElement.removeEventListener('webglcontextlost', this.alPerderContexto)
      renderizador.domElement.removeEventListener('webglcontextrestored', this.alRecuperarContexto)
      controles.dispose()
      renderizador.dispose()
      // Libera el contexto WebGL ya (no al recolectar basura): el navegador
      // limita los contextos activos y StrictMode/la navegación crean varios.
      renderizador.forceContextLoss()
      renderizador.domElement.remove()
    }
  }

  /* =========================================================
     CARGAR EDIFICIO
  ========================================================= */

  private async cargarEdificio(): Promise<void> {
    if (!this.nucleo) return
    let datos: ArrayBuffer

    try {
      datos = await descargarConProgreso(this.urlModelo, this.cancelacion.signal, (porcentaje) => {
        if (this.desechado) return
        this.progreso = porcentaje
        this.notificar()
      })
    } catch (error) {
      if (!this.desechado) this.fallarCarga(error, mensajeDeDescarga(error))
      return
    }

    if (this.desechado) return

    this.fase = 'procesando'
    this.notificar()

    let gltf: GLTF
    try {
      // parseAsync convierte en rechazo lo que parse lanza de forma síncrona
      // (JSON.parse de un cuerpo HTML, un ArrayBuffer vacío...).
      gltf = await this.cargador.parseAsync(datos, THREE.LoaderUtils.extractUrlBase(this.urlModelo))
    } catch (error) {
      if (!this.desechado) this.fallarCarga(error, MENSAJE_LECTURA)
      return
    } finally {
      this.liberarDraco()
    }

    if (this.desechado) {
      liberarObjeto(gltf.scene)
      return
    }
    this.alCargarEdificio(gltf)
  }

  /**
   * Termina los Workers de Draco y revoca su blob URL. Se llama al terminar la
   * lectura del modelo (ya no se decodifica nada más) y en dispose().
   */
  private liberarDraco(): void {
    const draco = this.dracoLoader as DracoConPendiente
    draco.dispose()
    // Si el decodificador seguía descargándose, DRACOLoader crea sus Workers
    // cuando termina: liberarlos también en ese momento.
    void draco.decoderPending?.then(
      () => draco.dispose(),
      () => {},
    )
  }

  private fallarCarga(error: unknown, mensaje: string): void {
    console.error('[SIVU] Error cargando el edificio:', error)
    this.fase = 'error'
    this.error = { tipo: 'carga', mensaje }
    this.notificar()
  }

  private alCargarEdificio(gltf: GLTF): void {
    if (!this.nucleo) return
    const { controles } = this.nucleo

    const edificio = gltf.scene
    this.edificio = edificio
    this.escena.add(edificio)

    /* CONFIGURAR MALLAS */
    edificio.traverse((objeto) => {
      if (objeto instanceof THREE.Mesh) {
        objeto.castShadow = false
        objeto.receiveShadow = false

        if (objeto.material) {
          const lista: THREE.Material[] = Array.isArray(objeto.material) ? objeto.material : [objeto.material]
          for (const material of lista) material.needsUpdate = true
        }
      }
    })

    /* CENTRAR EDIFICIO */
    const caja = new THREE.Box3().setFromObject(edificio)
    edificio.position.sub(caja.getCenter(new THREE.Vector3()))

    /* BUSCAR PUERTA (gana la última coincidencia, como en el original) */
    edificio.traverse((objeto) => {
      if (objeto.name && objeto.name.trim().toUpperCase() === 'PUERTA') {
        this.puntoPuerta = objeto
      }
    })

    /* NUEVA CAJA */
    const cajaNueva = new THREE.Box3().setFromObject(edificio)
    const tamaño = cajaNueva.getSize(new THREE.Vector3())
    this.tamañoEdificio = tamaño.clone()
    this.centroEdificio = cajaNueva.getCenter(new THREE.Vector3())

    const mayor = Math.max(tamaño.x, tamaño.y, tamaño.z)
    const distanciaMinimaEdificio = Math.max(mayor * 0.18, 0.5)

    /* CÁMARA INICIAL: frente a la entrada */
    this.colocarCamaraEnEntrada(mayor)

    /* DISTANCIAS ORBIT CONTROLS */
    controles.minDistance = Math.max(mayor * 0.1, distanciaMinimaEdificio)
    controles.maxDistance = mayor * 3
    controles.update()

    this.fase = 'listo'
    this.progreso = 100
    this.notificar()
    this.despertar()
  }

  /* =========================================================
     COLOCAR CÁMARA FRENTE A LA ENTRADA
  ========================================================= */

  private colocarCamaraEnEntrada(mayor: number): void {
    if (!this.nucleo || !this.edificio) return
    const { controles } = this.nucleo
    const camara = this.camara

    /* SI NO SE ENCUENTRA LA PUERTA */
    if (!this.puntoPuerta) {
      console.warn('No se encontró el objeto PUERTA. Se usará una cámara alternativa.')
      camara.position.set(-mayor * 0.08, mayor * 0.2, mayor * 0.4)
      controles.target.set(0, mayor * 0.08, 0)
      controles.update()
      return
    }

    const cajaPuerta = new THREE.Box3().setFromObject(this.puntoPuerta)
    const centroPuerta = cajaPuerta.getCenter(new THREE.Vector3())
    const tamañoPuerta = cajaPuerta.getSize(new THREE.Vector3())
    const centro = new THREE.Box3().setFromObject(this.edificio).getCenter(new THREE.Vector3())

    /* FRENTE DE LA PUERTA, APUNTANDO HACIA AFUERA */
    const direccionPuerta = aVector(this.direccionPuerta(this.puntoPuerta, this.haciaAfuera(centroPuerta, centro)))

    /* POSICIÓN: frente a la puerta, un poco a la izquierda y en picado suave */
    const distanciaEntrada = calcularDistanciaEntrada(mayor, tamañoPuerta.x, tamañoPuerta.z)
    const posicionCamara = centroPuerta.clone().add(direccionPuerta.clone().multiplyScalar(distanciaEntrada))
    const lateral = new THREE.Vector3(-direccionPuerta.z, 0, direccionPuerta.x).normalize()
    posicionCamara.add(lateral.multiplyScalar(mayor * 0.1))
    posicionCamara.y = centroPuerta.y + mayor * 0.18

    const objetivo = centroPuerta.clone()
    objetivo.y = centroPuerta.y + mayor * 0.02

    camara.position.copy(posicionCamara)
    controles.target.copy(objetivo)
    controles.update()
  }

  /** Dirección horizontal centro del edificio → puerta (o +Z si coinciden). */
  private haciaAfuera(centroPuerta: THREE.Vector3, centro: THREE.Vector3): THREE.Vector3 {
    const haciaAfuera = new THREE.Vector3().subVectors(centroPuerta, centro)
    haciaAfuera.y = 0
    if (haciaAfuera.lengthSq() > 0.0001) haciaAfuera.normalize()
    else haciaAfuera.set(0, 0, 1)
    return haciaAfuera
  }

  /** Ejes X y Z de la puerta en el mundo → frente de la puerta (ver elegirDireccionPuerta). */
  private direccionPuerta(puerta: THREE.Object3D, haciaAfuera: THREE.Vector3): Punto3 {
    const quaternionPuerta = new THREE.Quaternion()
    puerta.getWorldQuaternion(quaternionPuerta)

    const normalX = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternionPuerta).normalize()
    const normalZ = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternionPuerta).normalize()

    return elegirDireccionPuerta(normalX, normalZ, haciaAfuera)
  }

  /* =========================================================
     ENFOCAR PUERTA
  ========================================================= */

  private iniciarEnfoquePuerta(edificio: THREE.Object3D, puerta: THREE.Object3D): void {
    if (!this.nucleo) return
    const { controles } = this.nucleo

    controles.autoRotate = false

    const centroPuerta = new THREE.Box3().setFromObject(puerta).getCenter(new THREE.Vector3())
    const centroActual = new THREE.Box3().setFromObject(edificio).getCenter(new THREE.Vector3())
    const direccionPuerta = aVector(this.direccionPuerta(puerta, this.haciaAfuera(centroPuerta, centroActual)))

    this.objetivoCamara = centroPuerta.clone().add(direccionPuerta.multiplyScalar(DISTANCIA_ENFOQUE_PUERTA))
    this.objetivoCamara.y = centroPuerta.y + ALTURA_ENFOQUE_PUERTA
    this.objetivoVista = centroPuerta.clone()

    this.enfocandoPuerta = true
    controles.enabled = false
    this.tiempoQuieto = 0
    this.posicionAnterior.copy(this.camara.position)
    this.vistaAnterior.copy(controles.target)
  }

  /**
   * llego: true si la cámara alcanzó el destino (se ajusta exacto); false si se
   * detuvo antes porque la protección del edificio o la distancia mínima no la
   * dejan avanzar.
   */
  private terminarEnfoque(llego: boolean): void {
    if (!this.nucleo) return
    const { controles } = this.nucleo

    if (llego) {
      this.camara.position.copy(this.objetivoCamara)
      controles.target.copy(this.objetivoVista)
      this.protegerCamara()
    }
    this.enfocandoPuerta = false
    controles.enabled = true
    controles.autoRotate = false
    controles.update()
    this.notificar()
  }

  /* =========================================================
     PROTEGER CÁMARA (que no atraviese el edificio)
  ========================================================= */

  private protegerCamara(): void {
    if (!this.edificio) return

    const camara = this.camara
    const correccion = corregirPosicionHorizontal(
      camara.position.x - this.centroEdificio.x,
      camara.position.z - this.centroEdificio.z,
      this.tamañoEdificio.x,
      this.tamañoEdificio.z,
    )

    if (correccion) {
      camara.position.x = this.centroEdificio.x + correccion.x
      camara.position.z = this.centroEdificio.z + correccion.z
    }
  }

  /* =========================================================
     BOTONES DE LA BARRA
  ========================================================= */

  /** Quien toma el control detiene el giro automático, para que la vista elegida se quede. */
  private tomarControl(accion: (controles: ControlesInternos) => void): void {
    if (!this.nucleo || this.desechado || !this.edificio || this.enfocandoPuerta) return
    const { controles } = this.nucleo
    controles.autoRotate = false
    accion(controles)
    controles.update()
    this.notificar()
    this.despertar()
  }

  /* =========================================================
     BUCLE DE DIBUJO
  ========================================================= */

  private readonly animar = (): void => {
    this.idFotograma = 0
    if (!this.nucleo || this.desechado) return
    if (!this.visible || document.hidden || this.contextoPerdido) return
    const { renderizador, controles } = this.nucleo
    const camara = this.camara

    this.enFotograma = true
    const delta = Math.min(this.reloj.getDelta(), 0.1)

    if (this.enfocandoPuerta) {
      const factor = factorPorFotogramas(SUAVIZADO_ENFOQUE_PUERTA, delta * 60)
      camara.position.lerp(this.objetivoCamara, factor)
      controles.target.lerp(this.objetivoVista, factor)
      this.protegerCamara()

      if (
        camara.position.distanceTo(this.objetivoCamara) < UMBRAL_LLEGADA_PUERTA &&
        controles.target.distanceTo(this.objetivoVista) < UMBRAL_LLEGADA_PUERTA
      ) {
        this.terminarEnfoque(true)
      } else {
        // Red de seguridad: si la cámara y la mirada dejan de avanzar, termina
        // ahí mismo en vez de quedarse bloqueada.
        const avance = camara.position.distanceTo(this.posicionAnterior) + controles.target.distanceTo(this.vistaAnterior)
        this.tiempoQuieto = avance < 0.001 ? this.tiempoQuieto + delta : 0
        this.posicionAnterior.copy(camara.position)
        this.vistaAnterior.copy(controles.target)
        if (this.tiempoQuieto > ESPERA_ENFOQUE_DETENIDO) this.terminarEnfoque(false)
      }
    } else {
      this.protegerCamara()
    }

    const cambio = controles.update(delta)
    if (cambio || this.redibujar || this.enfocandoPuerta) {
      renderizador.render(this.escena, camara)
      this.redibujar = false
    }
    this.enFotograma = false

    if (cambio || this.enfocandoPuerta || (controles.autoRotate && this.edificio)) {
      this.idFotograma = requestAnimationFrame(this.animar)
    }
  }

  /** Pide un fotograma (y que se dibuje) si el bucle está quieto y la escena se ve. */
  private readonly despertar = (): void => {
    this.redibujar = true
    if (this.desechado || this.idFotograma || this.enFotograma) return
    if (!this.visible || document.hidden || this.contextoPerdido) return
    this.reloj.getDelta()
    this.idFotograma = requestAnimationFrame(this.animar)
  }

  /* =========================================================
     EVENTOS
  ========================================================= */

  private readonly alHacerDobleClic = (): void => {
    this.enfocarPuerta()
  }

  /**
   * Rueda: solo acerca con Ctrl o Cmd, para no secuestrar el scroll de la
   * página. Va en captura, antes que el oyente de OrbitControls en el lienzo.
   */
  private readonly alUsarRueda = (evento: WheelEvent): void => {
    if (!this.nucleo) return
    const conTecla = evento.ctrlKey || evento.metaKey
    this.nucleo.controles.enableZoom = conTecla
    if (!conTecla && this.edificio) this.alUsarRuedaSinTecla?.(evento)
  }

  /**
   * Toque: hasta saber hacia dónde va el dedo (y si va en vertical) sus
   * movimientos no llegan a los controles. Con un segundo dedo (pellizco) no
   * se filtra nada.
   */
  private readonly alTocar = (evento: PointerEvent): void => {
    // El pellizco y los botones deben poder acercar aunque antes se usó la rueda sin tecla.
    if (this.nucleo) this.nucleo.controles.enableZoom = true
    if (evento.pointerType !== 'touch') return
    this.toqueInicio = evento.isPrimary ? { x: evento.clientX, y: evento.clientY } : null
    this.toqueEje = ''
  }

  private readonly alMoverToque = (evento: PointerEvent): void => {
    if (!this.toqueInicio || evento.pointerType !== 'touch' || !evento.isPrimary) return
    if (!this.toqueEje) {
      const dx = Math.abs(evento.clientX - this.toqueInicio.x)
      const dy = Math.abs(evento.clientY - this.toqueInicio.y)
      if (dx < UMBRAL_GESTO_TACTIL && dy < UMBRAL_GESTO_TACTIL) {
        evento.stopPropagation()
        return
      }
      this.toqueEje = dx > dy ? 'h' : 'v'
    }
    if (this.toqueEje === 'v') evento.stopPropagation()
  }

  private readonly alPerderContexto = (evento: Event): void => {
    evento.preventDefault()
    this.contextoPerdido = true
    cancelAnimationFrame(this.idFotograma)
    this.idFotograma = 0
    if (this.enfocandoPuerta) this.terminarEnfoque(false)
    this.fase = 'error'
    this.error = { tipo: 'contexto', mensaje: 'Se perdió la imagen 3D.' }
    this.notificar()
  }

  private readonly alRecuperarContexto = (): void => {
    this.contextoPerdido = false
    if (!this.edificio) return
    this.fase = 'listo'
    this.error = null
    this.notificar()
    this.despertar()
  }

  /** Tamaño del lienzo, sensibilidad del arrastre y corrimiento de la vista por el panel. */
  private readonly ajustarTamaño = (): void => {
    if (!this.nucleo || this.desechado) return
    const { renderizador, controles } = this.nucleo

    const ancho = Math.max(this.contenedor.clientWidth, 1)
    const alto = Math.max(this.contenedor.clientHeight, 1)

    controles.rotateSpeed = Math.min(1, alto / ALTO_REFERENCIA)
    this.camara.aspect = ancho / alto
    const corrimiento = Math.min(this.zonaTapada, ancho * 0.6) / 2
    if (corrimiento) this.camara.setViewOffset(ancho, alto, -corrimiento, 0, ancho, alto)
    else this.camara.clearViewOffset()
    this.camara.updateProjectionMatrix()
    renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderizador.setSize(ancho, alto, false)
    this.despertar()
  }

  /* =========================================================
     ESTADO
  ========================================================= */

  private notificar(): void {
    if (!this.alCambiarEstado) return

    const estado = this.obtenerEstado()
    const anterior = this.ultimoEstado

    if (
      anterior &&
      anterior.fase === estado.fase &&
      anterior.progreso === estado.progreso &&
      anterior.error === estado.error &&
      anterior.rotacionActiva === estado.rotacionActiva &&
      anterior.enfocandoPuerta === estado.enfocandoPuerta &&
      anterior.puertaEncontrada === estado.puertaEncontrada
    ) {
      return
    }

    this.ultimoEstado = estado
    this.alCambiarEstado(estado)
  }
}
