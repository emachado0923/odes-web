import type { PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstadoVisor } from './estado'
import { VisorEdificio, type OpcionesVisor } from './VisorEdificio'

/*
 * Motor real (three.js, OrbitControls, GLTFLoader) con un renderizador falso:
 * jsdom no tiene WebGL. fetch se simula para controlar la respuesta del .glb.
 */
vi.mock('three', async (importOriginal) => {
  const real = await importOriginal<typeof import('three')>()

  /** Renderizador sin WebGL, con un <canvas> real para OrbitControls. */
  class WebGLRenderer {
    readonly domElement = document.createElement('canvas')
    outputColorSpace = ''
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }

  return { ...real, WebGLRenderer }
})

const codificar = (texto: string) => new TextEncoder().encode(texto)

/**
 * .glb mínimo: un triángulo de 2 × 2 usado por dos nodos, la PUERTA delante
 * (z = 5) y otro detrás (z = −5). El edificio mide 2 × 2 × 10.
 */
function crearGlb(): Uint8Array<ArrayBuffer> {
  const posiciones = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0])
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: 'PUERTA', mesh: 0, translation: [0, 0, 5] },
      { name: 'fondo', mesh: 0, translation: [0, 0, -5] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }],
    bufferViews: [{ buffer: 0, byteLength: posiciones.byteLength }],
    buffers: [{ byteLength: posiciones.byteLength }],
  })
  const relleno = (n: number) => (4 - (n % 4)) % 4
  const datosJson = codificar(json + ' '.repeat(relleno(codificar(json).length)))
  const datosBin = new Uint8Array(posiciones.buffer)
  const total = 12 + 8 + datosJson.length + 8 + datosBin.length
  const glb = new Uint8Array(total)
  const vista = new DataView(glb.buffer)
  vista.setUint32(0, 0x46546c67, true) // "glTF"
  vista.setUint32(4, 2, true)
  vista.setUint32(8, total, true)
  vista.setUint32(12, datosJson.length, true)
  vista.setUint32(16, 0x4e4f534a, true) // "JSON"
  glb.set(datosJson, 20)
  const inicioBin = 20 + datosJson.length
  vista.setUint32(inicioBin, datosBin.length, true)
  vista.setUint32(inicioBin + 4, 0x004e4942, true) // "BIN"
  glb.set(datosBin, inicioBin + 8)
  return glb
}

/** fetch que responde una sola vez con este cuerpo. */
function responderCon(cuerpo: BodyInit | null, estado = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(cuerpo, { status: estado })),
  )
}

/** fetch que no responde nunca (se rechaza al abortar). */
function responderNunca() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolver, rechazar) => {
          init?.signal?.addEventListener('abort', () => rechazar(new DOMException('Cancelada', 'AbortError')))
        }),
    ),
  )
}

let visor: VisorEdificio | null = null
let estados: EstadoVisor[] = []
let contenedor: HTMLElement

function crearVisor(opciones: OpcionesVisor = {}): VisorEdificio {
  visor = new VisorEdificio(contenedor, {
    urlModelo: '/sivu/edificiofinal.glb',
    rutaDecodificadorDraco: '/sivu/draco/',
    alCambiarEstado: (estado) => estados.push(estado),
    reducirMovimiento: false,
    ...opciones,
  })
  return visor
}

const ultimo = (): EstadoVisor => {
  const estado = estados.at(-1)
  if (!estado) throw new Error('El visor no informó ningún estado')
  return estado
}

async function esperarFase(fase: EstadoVisor['fase']) {
  await vi.waitFor(() => expect(ultimo().fase).toBe(fase))
}

/** Partes privadas del motor que las pruebas necesitan mirar. */
const camaraDe = (motor: VisorEdificio) => Reflect.get(motor, 'camara') as PerspectiveCamera
const controlesDe = (motor: VisorEdificio) =>
  (Reflect.get(motor, 'nucleo') as { controles: OrbitControls; renderizador: { domElement: HTMLCanvasElement } })
    .controles
const lienzoDe = (motor: VisorEdificio) =>
  (Reflect.get(motor, 'nucleo') as { renderizador: { domElement: HTMLCanvasElement } }).renderizador.domElement

function rueda(conCtrl: boolean): WheelEvent {
  return new WheelEvent('wheel', { deltaY: 100, ctrlKey: conCtrl, bubbles: true, cancelable: true, clientY: 50 })
}

beforeEach(() => {
  estados = []
  contenedor = document.createElement('div')
  document.body.append(contenedor)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  visor?.dispose()
  visor = null
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('VisorEdificio: lectura del modelo', () => {
  it.each([
    ['una página HTML', codificar('<!doctype html><html><body>SPA</body></html>')],
    ['un cuerpo vacío', codificar('')],
    ['un puntero de Git LFS', codificar('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 10700000\n')],
  ])('si el .glb llega como %s (200), termina en error y libera Draco', async (_caso, cuerpo) => {
    const liberarDraco = vi.spyOn(DRACOLoader.prototype, 'dispose')
    responderCon(cuerpo)
    crearVisor()

    await esperarFase('error')

    expect(estados.some((estado) => estado.fase === 'procesando')).toBe(true)
    expect(ultimo().error).toEqual({ tipo: 'carga', mensaje: 'No se pudo leer el modelo 3D del edificio.' })
    // Los Workers de Draco se liberan al terminar la lectura, sin esperar a dispose().
    expect(liberarDraco).toHaveBeenCalled()
  })

  it('un 404 informa el código de la descarga', async () => {
    responderCon('No encontrado', 404)
    crearVisor()

    await esperarFase('error')

    expect(ultimo().error?.mensaje).toBe('No se pudo descargar el modelo del edificio (error 404).')
  })

  it('con un modelo válido llega a "listo", encuentra la PUERTA y libera los Workers de Draco', async () => {
    const liberarDraco = vi.spyOn(DRACOLoader.prototype, 'dispose')
    responderCon(crearGlb())
    crearVisor()

    await esperarFase('listo')

    expect(ultimo()).toMatchObject({ listo: true, puertaEncontrada: true, error: null, progreso: 100 })
    expect(liberarDraco).toHaveBeenCalled()
  })
})

describe('VisorEdificio: una página con scroll (como el bloque del Observatorio)', () => {
  it('no se adueña del teclado: Espacio y las flechas siguen siendo de la página', () => {
    responderNunca()
    crearVisor()

    for (const key of [' ', 'ArrowDown', 'w']) {
      const evento = new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true })
      document.body.dispatchEvent(evento)
      expect(evento.defaultPrevented).toBe(false)
    }
    expect(ultimo().rotacionActiva).toBe(true)
  })

  it('sin desplazamiento lateral, sin bajar del suelo y con touch-action: pan-y para poder bajar por la página', () => {
    responderNunca()
    const motor = crearVisor()

    const controles = controlesDe(motor)
    expect(controles.enablePan).toBe(false)
    expect(controles.maxPolarAngle).toBeCloseTo(Math.PI * 0.49, 10)
    expect(lienzoDe(motor).style.touchAction).toBe('pan-y')
  })

  it('la rueda solo acerca con Ctrl o Cmd; sin tecla avisa (con el edificio cargado) y deja bajar la página', async () => {
    const alUsarRuedaSinTecla = vi.fn<(evento: WheelEvent) => void>()
    responderCon(crearGlb())
    const motor = crearVisor({ alUsarRuedaSinTecla })
    const lienzo = lienzoDe(motor)
    await esperarFase('listo')

    const sinTecla = rueda(false)
    lienzo.dispatchEvent(sinTecla)
    expect(controlesDe(motor).enableZoom).toBe(false)
    expect(sinTecla.defaultPrevented).toBe(false)
    expect(alUsarRuedaSinTecla).toHaveBeenCalledTimes(1)

    const conCtrl = rueda(true)
    lienzo.dispatchEvent(conCtrl)
    expect(controlesDe(motor).enableZoom).toBe(true)
    // OrbitControls toma la rueda (y evita que la página baje).
    expect(conCtrl.defaultPrevented).toBe(true)
    expect(alUsarRuedaSinTecla).toHaveBeenCalledTimes(1)
  })

  it('antes de cargar el edificio, la rueda sin tecla no avisa', () => {
    const alUsarRuedaSinTecla = vi.fn<(evento: WheelEvent) => void>()
    responderNunca()
    const motor = crearVisor({ alUsarRuedaSinTecla })

    lienzoDe(motor).dispatchEvent(rueda(false))

    expect(alUsarRuedaSinTecla).not.toHaveBeenCalled()
  })

  it('con el panel encima, corre el centro de la vista a la derecha la mitad de lo tapado', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500)
    responderNunca()
    const motor = crearVisor()
    const camara = camaraDe(motor)

    motor.fijarZonaTapada(400)
    expect(camara.view?.enabled).toBe(true)
    expect(camara.view?.offsetX).toBe(-200)

    // Nunca más del 60 % del ancho.
    motor.fijarZonaTapada(900)
    expect(camara.view?.offsetX).toBe(-300)

    motor.fijarZonaTapada(0)
    expect(camara.view?.enabled ?? false).toBe(false)
  })
})

describe('VisorEdificio: barra de controles', () => {
  it('alternarRotacion detiene y reanuda el giro automático', () => {
    responderNunca()
    const motor = crearVisor()

    motor.alternarRotacion()
    expect(ultimo().rotacionActiva).toBe(false)
    motor.alternarRotacion()
    expect(ultimo().rotacionActiva).toBe(true)
  })

  it('con prefers-reduced-motion el giro automático empieza en pausa', () => {
    responderNunca()
    crearVisor({ reducirMovimiento: true })

    expect(ultimo().rotacionActiva).toBe(false)
  })

  it('girar, acercar y alejar mueven la cámara y detienen el giro automático; antes de cargar no hacen nada', async () => {
    responderCon(crearGlb())
    const motor = crearVisor()
    const camara = camaraDe(motor)

    motor.girar('derecha')
    expect(ultimo().rotacionActiva).toBe(true)

    await esperarFase('listo')
    const objetivo = controlesDe(motor).target

    const distanciaInicial = camara.position.distanceTo(objetivo)
    motor.acercar()
    expect(ultimo().rotacionActiva).toBe(false)
    expect(camara.position.distanceTo(objetivo)).toBeLessThan(distanciaInicial)

    const distanciaCerca = camara.position.distanceTo(objetivo)
    motor.alejar()
    expect(camara.position.distanceTo(objetivo)).toBeGreaterThan(distanciaCerca)

    const antes = camara.position.clone()
    motor.girar('izquierda')
    expect(camara.position.distanceTo(antes)).toBeGreaterThan(0)
  })
})

describe('VisorEdificio: entrada', () => {
  it('enfocarPuerta no aplica antes de cargar', () => {
    responderNunca()
    const motor = crearVisor()

    expect(motor.enfocarPuerta()).toBe(false)
    expect(ultimo().enfocandoPuerta).toBe(false)
  })

  it('con movimiento reducido la cámara llega a la puerta sin animación', async () => {
    responderCon(crearGlb())
    const motor = crearVisor({ reducirMovimiento: true })
    await esperarFase('listo')

    expect(motor.enfocarPuerta()).toBe(true)

    // Pasó por "enfocando" y ya terminó, con los controles otra vez activos.
    expect(estados.some((estado) => estado.enfocandoPuerta)).toBe(true)
    expect(ultimo()).toMatchObject({ enfocandoPuerta: false, rotacionActiva: false })
    expect(controlesDe(motor).enabled).toBe(true)
    // Frente a la puerta (z = 5), del lado de afuera.
    expect(camaraDe(motor).position.z).toBeGreaterThan(5)
  })

  it('el doble clic también lleva a la entrada', async () => {
    responderCon(crearGlb())
    crearVisor()
    await esperarFase('listo')

    contenedor.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(ultimo().enfocandoPuerta).toBe(true)
  })
})

describe('VisorEdificio: contexto WebGL', () => {
  it('si el navegador retira el contexto, informa el error; al devolverlo, vuelve a "listo"', async () => {
    responderCon(crearGlb())
    const motor = crearVisor()
    await esperarFase('listo')

    const perdido = new Event('webglcontextlost', { cancelable: true })
    lienzoDe(motor).dispatchEvent(perdido)
    expect(perdido.defaultPrevented).toBe(true)
    expect(ultimo()).toMatchObject({ fase: 'error', listo: false, error: { tipo: 'contexto' } })
    expect(motor.enfocarPuerta()).toBe(false)

    lienzoDe(motor).dispatchEvent(new Event('webglcontextrestored'))
    expect(ultimo()).toMatchObject({ fase: 'listo', listo: true, error: null })
  })
})

describe('VisorEdificio: dispose', () => {
  it('quita los oyentes: la rueda ya no avisa ni el doble clic enfoca', async () => {
    const alUsarRuedaSinTecla = vi.fn<(evento: WheelEvent) => void>()
    responderCon(crearGlb())
    const motor = crearVisor({ alUsarRuedaSinTecla })
    await esperarFase('listo')
    const lienzo = lienzoDe(motor)
    const antes = estados.length

    motor.dispose()
    contenedor.append(lienzo)
    lienzo.dispatchEvent(rueda(false))
    contenedor.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(alUsarRuedaSinTecla).not.toHaveBeenCalled()
    expect(estados).toHaveLength(antes)
  })
})
