/**
 * Crear o editar un documento: todos los campos de DatosDocumento con
 * etiqueta, ayuda y error; palabras clave con sugerencias; archivo (arrastrar
 * o elegir, con progreso); portada (generada desde el PDF o desde una
 * imagen); vista previa con la tarjeta pública; publicar/despublicar y
 * borrado definitivo con confirmación.
 *
 * "Guardar" aplica todo en orden: datos (POST/PUT), quitar archivo, subir
 * archivo, subir portada. Si algo falla, se detiene y lo que falta sigue
 * pendiente. Con cambios sin guardar, salir de la página pide confirmación.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Link, useBlocker, useNavigate } from 'react-router'
import type { CategoriaAdmin, DocumentoAdmin, PalabraClaveAdmin } from '../../api-repositorio'
import TarjetaDocumento from '../../componentes/TarjetaDocumento'
import { urlSegura } from '../../datos/enlaces'
import { useAvisar } from '../componentes/avisar'
import { useCambiosPendientes } from '../componentes/cambiosPendientes'
import Campo, { Contador, MensajeError } from '../componentes/Campo'
import Dialogo from '../componentes/Dialogo'
import Icono from '../componentes/IconoAdmin'
import { Cargando, ErrorCarga, TituloPagina } from '../componentes/Pagina'
import { esAborto, esErrorAdmin, mensajeDe } from '../datos/clienteAdmin'
import { MESES, extensionDeTipo, fechaHora, textoLinea, tipoPermitido } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import type { PortadaGenerada } from '../portada/generarPortada'
import { RUTA_CATEGORIAS, RUTA_DOCUMENTOS, rutaCambiosDe, rutaDocumento } from '../rutasAdmin'
import { useCliente } from '../sesion/contexto'
import CampoClaves from './CampoClaves'
import DialogoBorrar from './DialogoBorrar'
import EditorPortada from './EditorPortada'
import {
  ETIQUETAS,
  LIMITES,
  ORDEN_CAMPOS,
  aDatos,
  documentoVistaPrevia,
  contarPalabras,
  esSoloEnlace,
  faltasParaPublicar,
  hayCambios,
  validar,
  valoresIniciales,
  type CampoFormulario,
  type Errores,
  type ValoresFormulario,
} from './formulario'
import { tieneDestino } from './listado'
import SubidaArchivo from './SubidaArchivo'

interface Datos {
  doc: DocumentoAdmin | null
  categorias: CategoriaAdmin[]
  palabras: PalabraClaveAdmin[]
}

export default function PaginaDocumento({ id }: { id: string | null }) {
  const cliente = useCliente()
  const { estado, recargar } = useCarga<Datos>(async (signal) => {
    const [doc, categorias, palabras] = await Promise.all([
      id ? cliente.obtenerDocumento(id, signal) : Promise.resolve(null),
      cliente.listarCategorias(signal),
      cliente.listarPalabras(signal),
    ])
    return { doc, categorias, palabras }
  }, id ?? '')

  const volver = (
    <p className="ra-migas">
      <Link to={RUTA_DOCUMENTOS}>
        <Icono nombre="ver" className="ra-girado" />
        Documentos
      </Link>
    </p>
  )

  if (estado.fase !== 'listo') {
    return (
      <div className="ra-pagina">
        <TituloPagina documento={id ? 'Editar documento' : 'Nuevo documento'} antes={volver}>
          {id ? 'Editar documento' : 'Nuevo documento'}
        </TituloPagina>
        {estado.fase === 'cargando' ? (
          <Cargando texto="Cargando el documento…" />
        ) : (
          <ErrorCarga
            titulo={
              esErrorAdmin(estado.error) && estado.error.estado === 404
                ? 'Este documento no existe'
                : 'No se pudo cargar el documento'
            }
            mensaje={estado.mensaje}
            onReintentar={esErrorAdmin(estado.error) && estado.error.estado === 404 ? undefined : recargar}
          />
        )}
      </div>
    )
  }
  return <Editor datos={estado.datos} volver={volver} />
}

/**
 * Alto de la barra fija «Guardar cambios» en --ra-alto-barra, para que
 * admin.css reserve ese espacio (scroll-padding-bottom) y el campo que se
 * enfoca con el teclado no quede tapado por ella. Se vuelve a medir cuando la
 * barra cambia de alto (sus botones pasan a otra línea en pantallas angostas).
 */
function useAltoBarra(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const barra = ref.current
    if (!barra) return
    const raiz = document.documentElement
    const medir = () => {
      const alto = Math.ceil(barra.getBoundingClientRect().height)
      if (alto > 0) raiz.style.setProperty('--ra-alto-barra', `${alto}px`)
      else raiz.style.removeProperty('--ra-alto-barra')
    }
    medir()
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    observador?.observe(barra)
    return () => {
      observador?.disconnect()
      raiz.style.removeProperty('--ra-alto-barra')
    }
  }, [ref])
}

type Paso = 'datos' | 'archivo' | 'portada' | 'publicar' | 'despublicar'

const TEXTO_PASO: Record<Paso, string> = {
  datos: 'Guardando los datos…',
  archivo: 'Subiendo el archivo…',
  portada: 'Guardando la portada…',
  publicar: 'Publicando…',
  despublicar: 'Despublicando…',
}

function Editor({ datos, volver }: { datos: Datos; volver: ReactNode }) {
  const cliente = useCliente()
  const avisar = useAvisar()
  const navigate = useNavigate()
  const uid = useId()
  const campoId = (c: string) => `${uid}-${c}`

  const categoriaPorDefecto = datos.categorias[0]?.nombre ?? ''
  const [original, setOriginal] = useState<DocumentoAdmin | null>(datos.doc)
  const [base, setBase] = useState<ValoresFormulario>(() => valoresIniciales(datos.doc, categoriaPorDefecto))
  const [valores, setValores] = useState<ValoresFormulario>(base)
  const valoresRef = useRef(valores)
  useEffect(() => {
    valoresRef.current = valores
  }, [valores])

  const [validado, setValidado] = useState(false)
  const [erroresServidor, setErroresServidor] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [quitarArchivo, setQuitarArchivo] = useState(false)
  const [portada, setPortada] = useState<PortadaGenerada | null>(null)
  const [portadaAutomatica, setPortadaAutomatica] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [errorPortada, setErrorPortada] = useState<string | null>(null)
  const [paso, setPaso] = useState<Paso | null>(null)
  const [progreso, setProgreso] = useState<number | null>(null)
  const [errorEstado, setErrorEstado] = useState<string | null>(null)
  const [borrar, setBorrar] = useState(false)
  const refResumen = useRef<HTMLDivElement>(null)
  const refBarra = useRef<HTMLDivElement>(null)
  useAltoBarra(refBarra)
  const saltarGuardia = useRef(false)
  const portadaRef = useRef<PortadaGenerada | null>(null)

  const creando = original === null
  /** La página se abrió para crear (/documentos/nuevo): al terminar de guardar se va a la URL del documento. */
  const montadoComoNuevo = datos.doc === null
  const soloEnlace = esSoloEnlace(valores.tipo)
  const errores = useMemo<Errores>(
    () => ({
      ...(validado ? validar(valores, { creando, publicado: original?.publicado ?? false }) : {}),
      ...erroresServidor,
    }),
    [validado, valores, creando, original, erroresServidor],
  )
  const sucio = hayCambios(valores, base) || archivo !== null || quitarArchivo || portada !== null
  const ocupado = paso !== null

  // La portada pendiente se libera al reemplazarla y al salir.
  useEffect(() => {
    portadaRef.current = portada
  }, [portada])
  useEffect(
    () => () => {
      const p = portadaRef.current
      if (p) {
        URL.revokeObjectURL(p.url)
        URL.revokeObjectURL(p.urlMiniatura)
      }
    },
    [],
  )

  // ── Cambios sin guardar ──────────────────────────────────────────────────
  useCambiosPendientes(sucio)
  const bloqueador = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        sucio && !saltarGuardia.current && currentLocation.pathname !== nextLocation.pathname,
      [sucio],
    ),
  )
  useEffect(() => {
    if (!sucio) return
    const avisarSalida = (evento: BeforeUnloadEvent) => {
      if (saltarGuardia.current) return
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avisarSalida)
    return () => window.removeEventListener('beforeunload', avisarSalida)
  }, [sucio])

  // ── Campos ───────────────────────────────────────────────────────────────
  function cambiar<K extends CampoFormulario>(campo: K, valor: ValoresFormulario[K]) {
    // Tableros y entradas solo enlazan a la URL externa: un archivo elegido y
    // aún sin subir se descarta (si se subiera, el servidor no lo publicaría).
    if (campo === 'tipo' && esSoloEnlace(valor as ValoresFormulario['tipo']) && archivo) {
      descartarArchivoNuevo()
      avisar(
        `Se descartó el archivo elegido («${archivo.name}»): los tableros y las entradas de blog no llevan archivo propio.`,
      )
    }
    setValores((v) => {
      const siguiente = { ...v, [campo]: valor }
      if (campo === 'tipo' && esSoloEnlace(valor as ValoresFormulario['tipo'])) siguiente.permiteDescarga = false
      if (campo === 'anio' && !String(valor).trim()) siguiente.mes = ''
      return siguiente
    })
    if (erroresServidor[campo]) {
      setErroresServidor((e) => {
        const { [campo]: _quitado, ...resto } = e
        return resto
      })
    }
  }

  const existentes = useMemo(
    () => datos.palabras.map((p) => ({ texto: p.texto, documentos: p.documentos })),
    [datos.palabras],
  )
  const categorias = useMemo(() => {
    const nombres = datos.categorias.map((c) => c.nombre)
    if (valores.categoria && !nombres.includes(valores.categoria)) nombres.push(valores.categoria)
    return nombres
  }, [datos.categorias, valores.categoria])

  // ── Portada ──────────────────────────────────────────────────────────────
  const reemplazarPortada = useCallback((nueva: PortadaGenerada | null) => {
    setPortada((anterior) => {
      if (anterior && anterior !== nueva) {
        URL.revokeObjectURL(anterior.url)
        URL.revokeObjectURL(anterior.urlMiniatura)
      }
      return nueva
    })
  }, [])

  async function generar(tarea: () => Promise<PortadaGenerada>, automatica: boolean) {
    setGenerando(true)
    setErrorPortada(null)
    try {
      const nueva = await tarea()
      reemplazarPortada(nueva)
      setPortadaAutomatica(automatica)
      setErroresServidor(({ portada: _p, ...resto }) => resto)
    } catch (e) {
      if (esAborto(e)) return
      // Los errores propios (ErrorPortada) traen un mensaje en español; los demás, no.
      const propio = e instanceof Error && e.name === 'ErrorPortada' && e.message
      setErrorPortada(`No se pudo generar la portada. ${propio || 'Intente de nuevo o con otro archivo.'}`)
    } finally {
      setGenerando(false)
    }
  }

  const pdfActual = original?.archivo?.tipo === 'application/pdf' && !quitarArchivo ? original : null
  const pdfPendiente = archivo && tipoPermitido(archivo) === 'application/pdf' ? archivo : null

  function generarDesdePdf() {
    void generar(async () => {
      const { ErrorPortada, portadaDesdePdf } = await import('../portada/generarPortada')
      if (pdfPendiente) return portadaDesdePdf(pdfPendiente)
      const url = urlSegura(pdfActual?.urlVer)
      if (!url) throw new ErrorPortada('No hay un PDF del que generar la portada.')
      const respuesta = await fetch(url, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null)
      if (!respuesta?.ok) {
        throw new ErrorPortada(
          respuesta ? `No se pudo descargar el PDF actual (error ${respuesta.status}).` : 'No hay conexión con el servidor.',
        )
      }
      return portadaDesdePdf(await respuesta.arrayBuffer())
    }, false)
  }

  function elegirImagen(imagen: File) {
    void generar(async () => {
      const { portadaDesdeImagen } = await import('../portada/generarPortada')
      return portadaDesdeImagen(imagen)
    }, false)
  }

  function descartarArchivoNuevo() {
    setArchivo(null)
    // La portada que se generó sola con ese PDF se va con él.
    if (portadaAutomatica) {
      reemplazarPortada(null)
      setPortadaAutomatica(false)
    }
  }

  function elegirArchivo(nuevo: File) {
    setArchivo(nuevo)
    setQuitarArchivo(false)
    setErroresServidor(({ archivo: _a, ...resto }) => resto)
    // PDF sin portada (o con una que se generó sola del PDF anterior): se genera con la primera página.
    if (tipoPermitido(nuevo) === 'application/pdf' && ((!original?.urlPortada && !portada) || portadaAutomatica)) {
      void generar(async () => {
        const { portadaDesdePdf } = await import('../portada/generarPortada')
        return portadaDesdePdf(nuevo)
      }, true)
    }
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  function enfocarResumen() {
    requestAnimationFrame(() => refResumen.current?.focus())
  }

  async function guardar(opciones: { publicar?: boolean } = {}) {
    if (ocupado || generando) return
    setValidado(true)
    setErrorGeneral(null)
    setErrorEstado(null)
    const problemas = validar(valores, {
      creando,
      publicado: Boolean(original?.publicado) || Boolean(opciones.publicar),
    })
    if (Object.keys(problemas).length) {
      enfocarResumen()
      return
    }
    setErroresServidor({})
    const enviados = valores
    let doc = original
    let creado = false
    try {
      if (!doc || hayCambios(enviados, base)) {
        setPaso('datos')
        doc = doc ? await cliente.actualizarDocumento(doc.id, aDatos(enviados, doc)) : await cliente.crearDocumento(aDatos(enviados, null))
        creado = original === null
        setOriginal(doc)
        const guardados = valoresIniciales(doc)
        setBase(guardados)
        // Lo que se escribió mientras se guardaba se conserva.
        if (valoresRef.current === enviados) setValores(guardados)
      }
      if (quitarArchivo && doc.archivo) {
        setPaso('archivo')
        doc = await cliente.quitarArchivo(doc.id)
        setOriginal(doc)
      }
      setQuitarArchivo(false)
      if (archivo) {
        setPaso('archivo')
        setProgreso(0)
        doc = await cliente.subirArchivo(doc.id, archivo, (p) => setProgreso(p.total ? p.cargado / p.total : 0))
        setOriginal(doc)
        setArchivo(null)
        setProgreso(null)
      }
      if (portada) {
        setPaso('portada')
        doc = await cliente.subirPortada(doc.id, portada.portada, portada.miniatura)
        setOriginal(doc)
        reemplazarPortada(null)
      }
      if (opciones.publicar && !doc.publicado) {
        setPaso('publicar')
        doc = await cliente.publicar(doc.id, true)
        setOriginal(doc)
      }
      setPaso(null)
      if (creado || montadoComoNuevo) {
        avisar(`Se creó «${doc.titulo}»${doc.publicado ? ' y quedó publicado' : ' (despublicado)'}.`)
        saltarGuardia.current = true
        navigate(rutaDocumento(doc.id), { replace: true })
        return
      }
      avisar(opciones.publicar ? `Se guardó y publicó «${doc.titulo}».` : 'Cambios guardados.')
    } catch (e) {
      setPaso(null)
      setProgreso(null)
      if (doc) setOriginal(doc)
      if (esErrorAdmin(e) && e.estado === 401) {
        setErrorGeneral('La sesión había vencido y no se guardó todo. Vuelva a pulsar «Guardar cambios».')
      } else {
        const campos = esErrorAdmin(e) ? e.campos : {}
        const propios: Errores = {}
        for (const [campo, texto] of Object.entries(campos)) {
          if (campo === 'miniatura') propios.portada = texto
          else if ((ORDEN_CAMPOS as string[]).includes(campo) || campo === 'archivo' || campo === 'portada') {
            propios[campo as CampoFormulario] = texto
          }
        }
        setErroresServidor(propios)
        setErrorGeneral(
          (montadoComoNuevo && doc
            ? `El documento ya se creó (despublicado) con el identificador «${doc.id}», pero no se terminó de guardar. `
            : '') + mensajeDe(e),
        )
      }
      enfocarResumen()
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    void guardar()
  }

  function descartar() {
    setValores(base)
    setArchivo(null)
    setQuitarArchivo(false)
    reemplazarPortada(null)
    setValidado(false)
    setErroresServidor({})
    setErrorGeneral(null)
    setErrorPortada(null)
    avisar('Se descartaron los cambios sin guardar.')
  }

  // ── Publicar / despublicar ───────────────────────────────────────────────
  async function cambiarPublicacion(publicar: boolean) {
    if (!original || ocupado) return
    if (publicar && sucio) {
      await guardar({ publicar: true })
      return
    }
    setErrorEstado(null)
    setPaso(publicar ? 'publicar' : 'despublicar')
    try {
      const doc = await cliente.publicar(original.id, publicar)
      setOriginal(doc)
      avisar(`«${doc.titulo}» ${doc.publicado ? 'quedó publicado' : 'quedó despublicado'}.`)
    } catch (e) {
      if (!(esErrorAdmin(e) && e.estado === 401)) setErrorEstado(mensajeDe(e))
    } finally {
      setPaso(null)
    }
  }

  // ── Vista previa ─────────────────────────────────────────────────────────
  const vista = useMemo(
    () =>
      documentoVistaPrevia(valores, original, {
        archivoPendiente: archivo
          ? {
              extension: extensionDeTipo(tipoPermitido(archivo) ?? ''),
              tipo: tipoPermitido(archivo) ?? '',
              bytes: archivo.size,
            }
          : null,
        quitarArchivo,
      }),
    [valores, original, archivo, quitarArchivo],
  )

  const listaErrores = (Object.keys(errores) as (keyof Errores)[]).filter((c) => errores[c])
  const conDestino = original
    ? tieneDestino({
        archivo: archivo ? { tipo: '', bytes: 0, extension: '', sha256: '' } : quitarArchivo ? null : original.archivo,
        urlVerExterna: valores.urlVerExterna.trim() || null,
      })
    : false
  /** Lo que falta para publicar (año, descripción, 6 palabras clave, ser documento). */
  const faltas = Object.values(faltasParaPublicar(valores))
  const puedePublicar = conDestino && faltas.length === 0
  const titulo = creando ? 'Nuevo documento' : 'Editar documento'

  return (
    <div className="ra-pagina">
      <TituloPagina documento={creando ? titulo : `${titulo}: ${original.titulo}`} antes={volver}>
        {titulo}
      </TituloPagina>
      {!creando && (
        <p className="ra-subtitulo-pagina" lang={original.idioma === 'en' ? 'en' : undefined}>
          {original.titulo}
        </p>
      )}

      <div className="ra-editor">
        <section className="ra-editor-estado ra-panel" aria-labelledby={`${uid}-estado`}>
          <h2 className="ra-panel-titulo" id={`${uid}-estado`}>
            Estado
          </h2>
          {creando ? (
            <p className="ra-tenue">
              El documento se crea <strong>despublicado</strong>. Después de guardarlo podrá publicarlo.
            </p>
          ) : (
            <>
              <p>
                <span className={`ra-estado ${original.publicado ? 'ra-estado-publicado' : 'ra-estado-despublicado'}`}>
                  {original.publicado ? 'Publicado' : 'Despublicado'}
                </span>
              </p>
              <dl className="ra-datos-estado">
                <dt>Identificador</dt>
                <dd>
                  <code className="ra-codigo">{original.id}</code>
                </dd>
                <dt>Creado</dt>
                <dd>{fechaHora(original.creadoEn)}</dd>
                <dt>Modificado</dt>
                <dd>
                  {fechaHora(original.actualizadoEn)}
                  {original.actualizadoPor ? ` por ${original.actualizadoPor}` : ''}
                </dd>
              </dl>
              {errorEstado && (
                <div className="ra-aviso ra-aviso-error" role="alert">
                  <Icono nombre="error" />
                  <p>{errorEstado}</p>
                </div>
              )}
              <div className="ra-acciones-estado">
                {original.publicado ? (
                  <button type="button" className="rp-boton rp-boton-borde" onClick={() => void cambiarPublicacion(false)} disabled={ocupado}>
                    {paso === 'despublicar' ? 'Despublicando…' : 'Despublicar'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rp-boton"
                    onClick={() => void cambiarPublicacion(true)}
                    disabled={ocupado || generando || !puedePublicar}
                    aria-describedby={!puedePublicar ? `${uid}-sin-destino` : undefined}
                  >
                    {paso === 'publicar' ? 'Publicando…' : sucio ? 'Guardar y publicar' : 'Publicar'}
                  </button>
                )}
                {!original.publicado && !puedePublicar && (
                  <div className="ra-ayuda" id={`${uid}-sin-destino`}>
                    <p>Para publicarlo falta:</p>
                    <ul>
                      {!conDestino && <li>El archivo o una URL externa.</li>}
                      {faltas.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="ra-acciones-texto">
                  <Link to={rutaCambiosDe(original.id)}>
                    <Icono nombre="historial" />
                    Historial de cambios
                  </Link>
                </p>
              </div>
              <div className="ra-zona-peligro">
                {original.publicado ? (
                  <p className="ra-ayuda">Para borrarlo definitivamente, primero despublíquelo.</p>
                ) : (
                  <button type="button" className="ra-boton-texto ra-peligro" onClick={() => setBorrar(true)} disabled={ocupado}>
                    <Icono nombre="borrar" />
                    Borrar definitivamente…
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        <form className="ra-editor-formulario" onSubmit={enviar} noValidate aria-labelledby={`${uid}-form`}>
          <h2 className="rp-oculto" id={`${uid}-form`}>
            Datos del documento
          </h2>
          {(listaErrores.length > 0 || errorGeneral) && (
            <div className="ra-resumen-errores" role="alert" tabIndex={-1} ref={refResumen}>
              <p className="ra-resumen-titulo">
                <Icono nombre="error" />
                {errorGeneral && listaErrores.length === 0
                  ? 'No se pudo guardar'
                  : `Revise ${listaErrores.length === 1 ? 'un campo' : `${listaErrores.length} campos`} antes de guardar`}
              </p>
              {errorGeneral && <p>{errorGeneral}</p>}
              {listaErrores.length > 0 && (
                <ul>
                  {listaErrores.map((c) => (
                    <li key={c}>
                      <a
                        href={`#${campoId(c)}`}
                        onClick={(e) => {
                          e.preventDefault()
                          document.getElementById(campoId(c))?.focus()
                        }}
                      >
                        {c === 'archivo' ? 'Archivo' : c === 'portada' ? 'Portada' : ETIQUETAS[c as CampoFormulario]}:{' '}
                        {errores[c]}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <fieldset className="ra-grupo">
            <legend>Datos básicos</legend>
            {creando && (
              <Campo
                id={campoId('id')}
                etiqueta="Identificador"
                error={errores.id}
                ayuda="Opcional. Si lo deja vacío, se genera con la categoría, el número, el título y el año. Solo minúsculas sin tildes, números y guiones; no se puede cambiar después."
              >
                {(a) => (
                  <input
                    {...a}
                    className="ra-control ra-control-codigo"
                    type="text"
                    value={valores.id}
                    onChange={(e) => cambiar('id', e.target.value)}
                    maxLength={LIMITES.maxId}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                )}
              </Campo>
            )}
            <Campo
              id={campoId('titulo')}
              etiqueta="Título"
              obligatorio
              error={errores.titulo}
              ayuda={`Tal como aparece en la portada. Máximo ${LIMITES.maxTitulo} caracteres.`}
              extra={<Contador actual={textoLinea(valores.titulo).length} maximo={LIMITES.maxTitulo} />}
            >
              {(a) => (
                <textarea
                  {...a}
                  className="ra-control ra-control-titulo"
                  rows={2}
                  value={valores.titulo}
                  onChange={(e) => cambiar('titulo', e.target.value)}
                  lang={valores.idioma === 'en' ? 'en' : undefined}
                />
              )}
            </Campo>
            <Campo
              id={campoId('subtitulo')}
              etiqueta="Subtítulo"
              error={errores.subtitulo}
              ayuda={`Opcional. Máximo ${LIMITES.maxSubtitulo} caracteres.`}
              extra={<Contador actual={textoLinea(valores.subtitulo).length} maximo={LIMITES.maxSubtitulo} />}
            >
              {(a) => (
                <textarea
                  {...a}
                  className="ra-control"
                  rows={2}
                  value={valores.subtitulo}
                  onChange={(e) => cambiar('subtitulo', e.target.value)}
                  lang={valores.idioma === 'en' ? 'en' : undefined}
                />
              )}
            </Campo>
            <Campo
              id={campoId('descripcion')}
              etiqueta="Descripción"
              error={errores.descripcion}
              ayuda={`Unas ${LIMITES.palabrasDescripcion.recomendado} palabras (entre ${LIMITES.palabrasDescripcion.minimo} y ${LIMITES.palabrasDescripcion.maximo} para publicar), en tercera persona y tono expositivo: qué es el producto y qué contiene. Se muestra en la tarjeta, entre el título y las palabras clave.`}
              extra={
                <span
                  className={`ra-contador${
                    contarPalabras(valores.descripcion) > LIMITES.palabrasDescripcion.maximo ? ' ra-contador-excedido' : ''
                  }`}
                  aria-hidden="true"
                >
                  {contarPalabras(valores.descripcion)} / {LIMITES.palabrasDescripcion.recomendado} palabras
                </span>
              }
            >
              {(a) => (
                <textarea
                  {...a}
                  className="ra-control"
                  rows={5}
                  value={valores.descripcion}
                  onChange={(e) => cambiar('descripcion', e.target.value)}
                  maxLength={LIMITES.maxDescripcion}
                  lang={valores.idioma === 'en' ? 'en' : undefined}
                />
              )}
            </Campo>
            <div className="ra-fila-campos">
              <Campo
                id={campoId('categoria')}
                etiqueta="Categoría"
                obligatorio
                error={errores.categoria}
                ayuda={
                  <>
                    <Link to={RUTA_CATEGORIAS}>Gestionar categorías</Link>
                  </>
                }
                className="ra-campo-ancho"
              >
                {(a) => (
                  <div className="rp-select">
                    <select {...a} value={valores.categoria} onChange={(e) => cambiar('categoria', e.target.value)}>
                      {!valores.categoria && <option value="">Elija una categoría</option>}
                      {categorias.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <Icono nombre="flecha" />
                  </div>
                )}
              </Campo>
              <Campo
                id={campoId('numero')}
                etiqueta="N.º de edición"
                error={errores.numero}
                ayuda="Opcional (boletines, notas…)."
              >
                {(a) => (
                  <input
                    {...a}
                    className="ra-control"
                    type="text"
                    inputMode="numeric"
                    value={valores.numero}
                    onChange={(e) => cambiar('numero', e.target.value)}
                    maxLength={LIMITES.maxNumero}
                    autoComplete="off"
                  />
                )}
              </Campo>
            </div>
            <div className="ra-fila-campos">
              <Campo id={campoId('anio')} etiqueta="Año" error={errores.anio} ayuda="Obligatorio para publicar.">
                {(a) => (
                  <input
                    {...a}
                    className="ra-control"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={valores.anio}
                    onChange={(e) => cambiar('anio', e.target.value)}
                    autoComplete="off"
                  />
                )}
              </Campo>
              <Campo id={campoId('mes')} etiqueta="Mes" error={errores.mes} ayuda="Opcional; sirve para ordenar.">
                {(a) => (
                  <div className="rp-select">
                    <select
                      {...a}
                      value={valores.mes}
                      onChange={(e) => cambiar('mes', e.target.value)}
                      disabled={!valores.anio.trim()}
                    >
                      <option value="">Sin mes</option>
                      {MESES.map((m, i) => (
                        <option key={m} value={String(i + 1)}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <Icono nombre="flecha" />
                  </div>
                )}
              </Campo>
            </div>
            <fieldset className="ra-opciones" aria-describedby={`${uid}-idioma-ayuda`}>
              <legend className="ra-etiqueta">Idioma</legend>
              <p className="ra-ayuda" id={`${uid}-idioma-ayuda`}>
                Las versiones en inglés usan las mismas palabras clave (en español) que su original.
              </p>
              <div className="ra-radios">
                {(
                  [
                    ['es', 'Español'],
                    ['en', 'Inglés'],
                  ] as const
                ).map(([valor, texto], i) => (
                  <label key={valor} className="ra-radio">
                    <input
                      type="radio"
                      name={`${uid}-idioma`}
                      id={i === 0 ? campoId('idioma') : undefined}
                      value={valor}
                      checked={valores.idioma === valor}
                      onChange={() => cambiar('idioma', valor)}
                    />
                    {texto}
                  </label>
                ))}
              </div>
            </fieldset>
            {(valores.idioma === 'en' || valores.equivalenteEnEspanol) && (
              <Campo
                id={campoId('equivalenteEnEspanol')}
                etiqueta="Equivalente en español"
                error={errores.equivalenteEnEspanol}
                ayuda="Título, categoría y año del original en español. No se muestra en la tarjeta."
              >
                {(a) => (
                  <input
                    {...a}
                    className="ra-control"
                    type="text"
                    value={valores.equivalenteEnEspanol}
                    onChange={(e) => cambiar('equivalenteEnEspanol', e.target.value)}
                    maxLength={LIMITES.maxEquivalente + 50}
                  />
                )}
              </Campo>
            )}
          </fieldset>

          <fieldset className="ra-grupo">
            <legend>Tipo y enlaces</legend>
            <fieldset className="ra-opciones">
              <legend className="ra-etiqueta">Tipo</legend>
              <div className="ra-radios ra-radios-columna">
                {(
                  [
                    ['documento', 'Documento', 'Archivo propio (PDF, imagen, DOCX o PPTX): «Ver documento» y «Descargar».'],
                    ['tablero', 'Tablero interactivo', 'Solo enlace (Power BI): «Abrir tablero», sin descarga. Necesita la URL externa.'],
                    ['entrada', 'Entrada de blog', 'Solo enlace: «Ver entrada», sin descarga. Necesita la URL externa.'],
                  ] as const
                ).map(([valor, texto, ayuda], i) => (
                  <label key={valor} className="ra-radio ra-radio-detalle">
                    <input
                      type="radio"
                      name={`${uid}-tipo`}
                      id={i === 0 ? campoId('tipo') : undefined}
                      value={valor}
                      checked={valores.tipo === valor}
                      onChange={() => cambiar('tipo', valor)}
                      aria-describedby={`${uid}-tipo-${valor}`}
                    />
                    <span>
                      <span className="ra-radio-texto">{texto}</span>
                      <span className="ra-ayuda" id={`${uid}-tipo-${valor}`}>
                        {ayuda}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Campo
              id={campoId('urlVerExterna')}
              etiqueta="URL externa"
              obligatorio={soloEnlace}
              error={errores.urlVerExterna}
              ayuda={
                soloEnlace
                  ? 'Dirección completa (https://…) del tablero o de la entrada.'
                  : 'Opcional si sube el archivo: con archivo, «Ver documento» abre la copia propia. Sirve para documentos que aún no tienen archivo.'
              }
            >
              {(a) => (
                <input
                  {...a}
                  className="ra-control"
                  type="url"
                  inputMode="url"
                  value={valores.urlVerExterna}
                  onChange={(e) => cambiar('urlVerExterna', e.target.value)}
                  placeholder="https://"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Campo>
            <Campo
              id={campoId('urlEntradaBlog')}
              etiqueta="Entrada del blog"
              error={errores.urlEntradaBlog}
              ayuda="Opcional. La tarjeta muestra «Ver entrada del blog»."
            >
              {(a) => (
                <input
                  {...a}
                  className="ra-control"
                  type="url"
                  inputMode="url"
                  value={valores.urlEntradaBlog}
                  onChange={(e) => cambiar('urlEntradaBlog', e.target.value)}
                  placeholder="https://"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Campo>
            <div className={`ra-campo ra-casilla${soloEnlace ? ' ra-campo-deshabilitado' : ''}`}>
              <label className="ra-radio">
                <input
                  type="checkbox"
                  id={campoId('permiteDescarga')}
                  checked={valores.permiteDescarga && !soloEnlace}
                  disabled={soloEnlace}
                  onChange={(e) => cambiar('permiteDescarga', e.target.checked)}
                  aria-describedby={`${uid}-descarga-ayuda${errores.permiteDescarga ? ` ${campoId('permiteDescarga')}-error` : ''}`}
                />
                Permitir la descarga del archivo
              </label>
              <p className="ra-ayuda" id={`${uid}-descarga-ayuda`}>
                {soloEnlace
                  ? 'Los tableros y las entradas no tienen descarga.'
                  : 'Muestra «Descargar documento» con el nombre limpio. Solo funciona si hay archivo propio.'}
              </p>
              {errores.permiteDescarga && (
                <MensajeError id={`${campoId('permiteDescarga')}-error`} texto={errores.permiteDescarga} />
              )}
            </div>
            <Campo
              id={campoId('nota')}
              etiqueta="Nota visible"
              error={errores.nota}
              ayuda={`Advertencia corta en la tarjeta, con un ícono de información (por ejemplo, que el archivo está en OneDrive). Máximo ${LIMITES.maxNota} caracteres.`}
              extra={<Contador actual={textoLinea(valores.nota).length} maximo={LIMITES.maxNota} />}
            >
              {(a) => (
                <textarea
                  {...a}
                  className="ra-control"
                  rows={2}
                  value={valores.nota}
                  onChange={(e) => cambiar('nota', e.target.value)}
                />
              )}
            </Campo>
          </fieldset>

          <fieldset className="ra-grupo">
            <legend>Palabras clave</legend>
            <div className={`ra-campo${errores.claves ? ' ra-campo-con-error' : ''}`}>
              <label className="ra-etiqueta" htmlFor={campoId('claves')}>
                Agregar palabra clave
              </label>
              <p className="ra-ayuda" id={`${uid}-claves-ayuda`}>
                {LIMITES.clavesParaPublicar} para publicar, en el orden en que se muestran. Prefiera las que ya existen
                (aparecen como sugerencias): así se escriben igual en todas las tarjetas.
              </p>
              <CampoClaves
                id={campoId('claves')}
                claves={valores.claves}
                onCambio={(c) => cambiar('claves', c)}
                existentes={existentes}
                error={errores.claves}
                idAyuda={`${uid}-claves-ayuda`}
              />
              {errores.claves && <MensajeError id={`${campoId('claves')}-error`} texto={errores.claves} />}
            </div>
          </fieldset>

          <fieldset className="ra-grupo">
            <legend>Archivo</legend>
            <div id={campoId('archivo')} tabIndex={-1}>
              <SubidaArchivo
                doc={original}
                pendiente={archivo}
                quitar={quitarArchivo}
                soloEnlace={soloEnlace}
                progreso={progreso}
                ocupado={ocupado}
                errorServidor={errores.archivo}
                onElegir={elegirArchivo}
                onDescartar={descartarArchivoNuevo}
                onQuitar={() => setQuitarArchivo(true)}
                onDeshacerQuitar={() => setQuitarArchivo(false)}
              />
            </div>
          </fieldset>

          <fieldset className="ra-grupo">
            <legend>Portada</legend>
            <div id={campoId('portada')} tabIndex={-1}>
              <EditorPortada
                doc={original}
                pendiente={portada}
                automatica={portadaAutomatica}
                generando={generando}
                puedeGenerar={Boolean(pdfPendiente || pdfActual)}
                ocupado={ocupado}
                error={errorPortada ?? errores.portada}
                onGenerarPdf={generarDesdePdf}
                onElegirImagen={elegirImagen}
                onErrorImagen={(m) => setErrorPortada(m)}
                onDescartar={() => {
                  reemplazarPortada(null)
                  setPortadaAutomatica(false)
                }}
              />
            </div>
          </fieldset>

          <fieldset className="ra-grupo">
            <legend>Gestión</legend>
            <Campo
              id={campoId('orden')}
              etiqueta="Posición en «Más recientes»"
              error={errores.orden}
              ayuda={
                creando
                  ? 'Opcional (1 = el más reciente). Si la deja vacía, se calcula con el año y el mes.'
                  : '1 = el más reciente. Si cambia el año o el mes y no toca la posición, se recalcula sola.'
              }
            >
              {(a) => (
                <input
                  {...a}
                  className="ra-control ra-control-corto"
                  type="text"
                  inputMode="numeric"
                  value={valores.orden}
                  onChange={(e) => cambiar('orden', e.target.value)}
                  autoComplete="off"
                />
              )}
            </Campo>
            <Campo
              id={campoId('notasInternas')}
              etiqueta="Notas internas"
              error={errores.notasInternas}
              ayuda="Solo se ven en la administración: de dónde salieron los datos, dudas, pendientes."
            >
              {(a) => (
                <textarea
                  {...a}
                  className="ra-control"
                  rows={4}
                  value={valores.notasInternas}
                  onChange={(e) => cambiar('notasInternas', e.target.value)}
                />
              )}
            </Campo>
          </fieldset>

          <div className="ra-barra-guardar" ref={refBarra}>
            <button type="submit" className="rp-boton" disabled={ocupado || generando}>
              {paso ? TEXTO_PASO[paso] : creando ? 'Crear documento' : 'Guardar cambios'}
            </button>
            {sucio && !ocupado && (
              <button type="button" className="rp-boton rp-boton-borde" onClick={descartar}>
                Descartar cambios
              </button>
            )}
            <p className="ra-estado-guardado" role="status">
              {ocupado ? (paso ? TEXTO_PASO[paso] : '') : generando ? 'Espere a que termine la portada.' : sucio ? 'Hay cambios sin guardar.' : creando ? '' : 'Todo está guardado.'}
            </p>
          </div>
        </form>

        <section className="ra-editor-vista ra-panel" aria-labelledby={`${uid}-vista`}>
          <h2 className="ra-panel-titulo" id={`${uid}-vista`}>
            Vista previa
          </h2>
          <p className="ra-ayuda">Así se verá la tarjeta en el repositorio (los botones no funcionan aquí).</p>
          <div className="ra-vista-previa" inert>
            <TarjetaDocumento documento={vista} idTitulo={`${uid}-vista-titulo`} urlPortadaLocal={portada?.url} />
          </div>
        </section>
      </div>

      {original && (
        <DialogoBorrar
          doc={original}
          abierto={borrar}
          onCerrar={() => setBorrar(false)}
          onBorrado={() => {
            saltarGuardia.current = true
            avisar(`Se borró definitivamente «${original.titulo}».`)
            navigate(RUTA_DOCUMENTOS, { replace: true })
          }}
        />
      )}

      <Dialogo
        abierto={bloqueador.state === 'blocked'}
        titulo="Hay cambios sin guardar"
        rol="alertdialog"
        onCerrar={() => bloqueador.reset?.()}
        idDescripcion={`${uid}-salir`}
      >
        <p id={`${uid}-salir`}>Si sale ahora, se perderán los cambios que no ha guardado.</p>
        <div className="ra-dialogo-acciones">
          <button type="button" className="rp-boton" onClick={() => bloqueador.reset?.()}>
            Seguir editando
          </button>
          <button type="button" className="rp-boton rp-boton-borde ra-peligro-borde" onClick={() => bloqueador.proceed?.()}>
            Salir sin guardar
          </button>
        </div>
      </Dialogo>
    </div>
  )
}
