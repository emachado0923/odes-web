/**
 * Bandeja de correos del líder (/crm/lider/correos): los avisos que el CRM
 * manda al asignar, terminar o devolver una tarea (crm_correos; el servidor
 * da los 200 más recientes), con un filtro por estado y «Reintentar» en los
 * que no salieron.
 *
 * - Tabla en pantallas anchas; en el celular cada correo es una tarjeta (la
 *   misma tabla con otra disposición, en administracion.css; los roles ARIA
 *   van explícitos porque al cambiar el display algunos navegadores quitan
 *   la semántica de tabla).
 * - El filtro conserva la lista anterior mientras llega la nueva (no
 *   parpadea); cada carga recuerda de qué filtro es.
 * - Reintentar reemplaza la fila con lo que devuelve el servidor, aunque ya no
 *   cumpla el filtro (así se ve que salió), y llama avisarCambioCorreos() para
 *   que la insignia del menú se recargue.
 * - Arriba de todo, CuentaCorreo: desde qué cuenta salen los avisos (y, si no
 *   hay, el formulario para guardarla).
 * - Si alguno está sin_configurar, una nota arriba dice qué hacer.
 * - Ante un 401 llama vencida(): SitioLider vuelve al ingreso.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ETIQUETAS_ESTADO_CORREO, ETIQUETAS_TIPO_CORREO, type CorreoCrm, type EstadoCorreo } from '../api-crm'
import { esNoAutenticado, mensajeDe } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import { Cargando, ErrorCarga, fechaHora, Icono, plural, useAvisar, useTituloCrm, Vacio, type NombreIcono } from '../ui'
import { useLider } from './contexto'
import CuentaCorreo from './CuentaCorreo'
import './administracion.css'

/** El servidor devuelve a lo sumo estos (los más recientes). */
const MAXIMO_CORREOS = 200

interface Filtro {
  /** undefined: todos. */
  estado: EstadoCorreo | undefined
  texto: string
  /** Para el lector de pantalla (caption de la tabla). */
  titulo: string
  vacio: string
}

const FILTROS: readonly Filtro[] = [
  { estado: undefined, texto: 'Todos', titulo: 'Todos los correos', vacio: 'Todavía no hay correos.' },
  { estado: 'pendiente', texto: 'Pendientes', titulo: 'Correos pendientes', vacio: 'No hay correos pendientes.' },
  { estado: 'error', texto: 'Fallaron', titulo: 'Correos que fallaron', vacio: 'No hay correos que fallaron.' },
  { estado: 'sin_configurar', texto: 'Sin configurar', titulo: 'Correos sin configurar', vacio: 'No hay correos sin configurar.' },
  { estado: 'enviado', texto: 'Enviados', titulo: 'Correos enviados', vacio: 'No hay correos enviados.' },
]

function filtroDe(estado: EstadoCorreo | undefined): Filtro {
  return FILTROS.find((f) => f.estado === estado) ?? FILTROS[0]
}

const ICONO_ESTADO: Readonly<Record<EstadoCorreo, NombreIcono>> = {
  pendiente: 'reloj',
  enviado: 'check',
  error: 'alerta',
  sin_configurar: 'info',
}

/** Por qué no salió, cuando el servidor no lo dice. */
const SIN_ENVIO: Readonly<Record<EstadoCorreo, string>> = {
  pendiente: 'quedó pendiente; intente de nuevo en unos minutos.',
  enviado: '',
  error: 'el servidor de correo no lo aceptó.',
  sin_configurar: 'el correo todavía no está configurado en el servidor.',
}

function conPunto(texto: string): string {
  return /[.!?…]$/.test(texto) ? texto : `${texto}.`
}

/** El estado de un correo: ícono, color y su nombre (el color nunca va solo). */
function MarcaCorreo({ estado }: { estado: EstadoCorreo }) {
  return (
    <span className="crm-la-estado" data-estado={estado}>
      <Icono nombre={ICONO_ESTADO[estado] ?? 'info'} tamano={15} />
      {ETIQUETAS_ESTADO_CORREO[estado] ?? estado}
    </span>
  )
}

function FilaCorreo({
  correo,
  reintentando,
  alReintentar,
}: {
  correo: CorreoCrm
  reintentando: boolean
  alReintentar: () => void
}) {
  return (
    <tr role="row" className="crm-la-correo" data-estado={correo.estado}>
      <td role="cell" className="crm-la-c-fecha">
        <time dateTime={correo.creadoEn}>{fechaHora(correo.creadoEn)}</time>
      </td>
      <td role="cell" className="crm-la-c-aviso">
        <span className="crm-la-tipo">{ETIQUETAS_TIPO_CORREO[correo.tipo] ?? correo.tipo}</span>
        <span className="crm-la-asunto">{correo.asunto}</span>
        {correo.tareaId !== null ? (
          <span className="crm-la-tarea">
            Tarea: <Link to={`/crm/lider/tareas/${correo.tareaId}`}>{correo.tareaTitulo ?? `n.º ${correo.tareaId}`}</Link>
          </span>
        ) : null}
      </td>
      <td role="cell" className="crm-la-c-para">
        <span className="crm-la-rotulo" aria-hidden="true">
          Para{' '}
        </span>
        <span className="crm-la-para">{correo.para}</span>
      </td>
      <td role="cell" className="crm-la-c-estado">
        <MarcaCorreo estado={correo.estado} />
        <span className="crm-la-cifras crm-num">
          <span>Intentos: {correo.intentos}</span>
          <span>Adjuntos: {correo.adjuntos}</span>
        </span>
        {correo.error ? <span className="crm-la-error">{correo.error}</span> : null}
      </td>
      <td role="cell" className="crm-la-c-accion">
        {correo.estado !== 'enviado' ? (
          <button type="button" className="crm-boton crm-boton-secundario crm-boton-sm" disabled={reintentando} onClick={alReintentar}>
            <Icono nombre="reintentar" tamano={16} />
            {reintentando ? 'Reintentando…' : 'Reintentar'}
            {' '}<span className="crm-sr">el correo a {correo.para}</span>
          </button>
        ) : null}
      </td>
    </tr>
  )
}

export default function CorreosLider() {
  useTituloCrm('Correos')
  const { api, vencida, avisarCambioCorreos } = useLider()
  const avisar = useAvisar()
  const [filtro, setFiltro] = useState<EstadoCorreo | undefined>(undefined)
  const [reintentando, setReintentando] = useState<ReadonlySet<number>>(() => new Set())

  const { estado, datos, error, recargar, ponerDatos } = useCarga(
    async (signal) => ({ filtro, correos: await api.correos(filtro, signal) }),
    [filtro],
    { conservarAlCambiar: true },
  )

  useEffect(() => {
    if (estado === 'error' && esNoAutenticado(error)) vencida()
  }, [estado, error, vencida])

  function soltar(id: number) {
    setReintentando((previos) => {
      const nuevos = new Set(previos)
      nuevos.delete(id)
      return nuevos
    })
  }

  async function reintentar(correo: CorreoCrm) {
    if (reintentando.has(correo.id)) return
    setReintentando((previos) => new Set(previos).add(correo.id))
    try {
      const nuevo = await api.reintentarCorreo(correo.id)
      ponerDatos((anterior) => anterior && { ...anterior, correos: anterior.correos.map((c) => (c.id === nuevo.id ? nuevo : c)) })
      avisarCambioCorreos()
      if (nuevo.estado === 'enviado') {
        avisar(`Se envió el correo a ${nuevo.para}.`, 'exito')
      } else {
        const motivo = nuevo.error?.trim() || SIN_ENVIO[nuevo.estado] || 'intente de nuevo más tarde.'
        avisar(`No se envió el correo a ${nuevo.para}: ${conPunto(motivo)}`, 'error')
      }
    } catch (fallo) {
      if (esNoAutenticado(fallo)) {
        vencida()
        return
      }
      avisar(mensajeDe(fallo), 'error')
    } finally {
      soltar(correo.id)
    }
  }

  const correos = datos?.correos ?? []
  // Lo que se ve es de este filtro (mientras llega el nuevo se conserva el anterior).
  const mostrado = datos ? filtroDe(datos.filtro) : filtroDe(filtro)
  const cargandoOtro = estado === 'cargando' && datos !== null
  const haySinConfigurar = correos.some((c) => c.estado === 'sin_configurar')
  const anuncio =
    estado === 'listo' && datos ? (correos.length > 0 ? `${plural(correos.length, 'correo', 'correos')}.` : mostrado.vacio) : ''

  let contenido
  if (estado === 'error') {
    contenido = <ErrorCarga error={error} alReintentar={recargar} titulo="No se pudieron cargar los correos." />
  } else if (!datos) {
    contenido = <Cargando texto="Cargando los correos…" />
  } else if (correos.length === 0) {
    contenido = (
      <Vacio
        titulo={mostrado.vacio}
        texto={mostrado.estado === undefined ? 'Aparecen aquí cuando se asigna, se termina o se devuelve una tarea.' : undefined}
      />
    )
  } else {
    contenido = (
      <table role="table" className="crm-tabla crm-la-tabla" aria-busy={cargandoOtro || undefined}>
        <caption className="crm-sr">{mostrado.titulo}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">
              Fecha
            </th>
            <th role="columnheader" scope="col">
              Aviso
            </th>
            <th role="columnheader" scope="col">
              Para
            </th>
            <th role="columnheader" scope="col">
              Estado
            </th>
            <th role="columnheader" scope="col">
              <span className="crm-sr">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {correos.map((correo) => (
            <FilaCorreo key={correo.id} correo={correo} reintentando={reintentando.has(correo.id)} alReintentar={() => void reintentar(correo)} />
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className="crm-contenedor crm-pagina">
      <header className="crm-encabezado">
        <div className="crm-encabezado-texto">
          <h1 className="crm-titulo-pagina">Correos</h1>
          <p className="crm-bajada">Avisos que el CRM envía al asignar, terminar o devolver tareas.</p>
        </div>
      </header>

      <CuentaCorreo />

      <div className="crm-la-barra">
        <div className="crm-la-segmentos" role="group" aria-label="Mostrar los correos">
          {FILTROS.map((f) => (
            <button
              key={f.texto}
              type="button"
              className="crm-la-segmento"
              aria-pressed={filtro === f.estado}
              onClick={() => setFiltro(f.estado)}
            >
              {f.texto}
            </button>
          ))}
        </div>
        {datos && correos.length > 0 && estado !== 'error' ? (
          <p className="crm-la-cuenta">
            {plural(correos.length, 'correo', 'correos')}
            {correos.length >= MAXIMO_CORREOS ? ', los más recientes' : ''}.
          </p>
        ) : null}
      </div>
      <p className="crm-sr" role="status">
        {anuncio}
      </p>

      {haySinConfigurar && estado !== 'error' ? (
        <div className="crm-la-nota">
          <Icono nombre="info" tamano={20} />
          <p>
            Algunos avisos no salieron porque el correo no estaba configurado. La cuenta se configura aquí arriba, en «Cuenta de envío»;
            después use «Reintentar» para enviarlos.
          </p>
        </div>
      ) : null}

      {contenido}
    </div>
  )
}
