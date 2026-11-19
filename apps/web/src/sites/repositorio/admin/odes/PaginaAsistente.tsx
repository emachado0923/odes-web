/**
 * Asistente ODES: estado de su índice de búsqueda y botón "Reindexar"
 * (GET /api/repositorio/admin/odes/indice y POST …/odes/reindexar; el
 * contrato es sites/odes/chat/protocolo.ts). El asistente de /odes responde
 * con ese índice: después de publicar, editar o retirar documentos, conviene
 * reindexar para que los tenga en cuenta.
 *
 * Mientras hay una reindexación en curso, la página pide el estado cada 3 s y
 * anuncia solo los cambios de estado (no cada línea del registro).
 */
import { useEffect, useId, useState } from 'react'
import type { EstadoIndiceAdmin, EstadoReindexacion } from '../../../odes/chat/protocolo'
import { useAvisar } from '../componentes/avisar'
import Icono from '../componentes/IconoAdmin'
import { Cargando, ErrorCarga, TituloPagina } from '../componentes/Pagina'
import { esAborto, esErrorAdmin, mensajeDe } from '../datos/clienteAdmin'
import { cantidad, fechaHora, tamanoLegible } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { useCliente } from '../sesion/contexto'

/** Cada cuánto se pide el estado mientras se reindexa. */
export const INTERVALO_ESTADO_MS = 3000

const TEXTO_ESTADO: Record<EstadoReindexacion, string> = {
  inactiva: 'No se ha pedido ninguna reindexación desde que arrancó el servidor.',
  en_curso: 'Reindexando…',
  completada: 'La última reindexación terminó bien.',
  fallida: 'La última reindexación falló. El índice anterior sigue en uso.',
}

export default function PaginaAsistente() {
  const cliente = useCliente()
  const { estado, recargar, setDatos } = useCarga((signal) => cliente.estadoIndiceOdes(signal), 'asistente')
  return (
    <div className="ra-pagina ra-pagina-angosta">
      <TituloPagina documento="Asistente ODES">Asistente ODES</TituloPagina>
      <p className="ra-introduccion">
        El Asistente ODES (<a href="/odes">/odes</a>) responde con un índice de búsqueda de los documentos publicados.
        Después de agregar, editar, publicar o despublicar documentos, reindexe para que el asistente los tenga en
        cuenta. Mientras tanto sigue respondiendo con el índice anterior.
      </p>
      {estado.fase === 'cargando' && <Cargando texto="Consultando el índice…" />}
      {estado.fase === 'error' && (
        <ErrorCarga titulo="No se pudo consultar el índice del asistente" mensaje={estado.mensaje} onReintentar={recargar} />
      )}
      {estado.fase === 'listo' && <Estado estado={estado.datos} onEstado={setDatos} />}
    </div>
  )
}

function Estado({ estado, onEstado }: { estado: EstadoIndiceAdmin; onEstado: (e: EstadoIndiceAdmin) => void }) {
  const cliente = useCliente()
  const avisar = useAvisar()
  const id = useId()
  const [pidiendo, setPidiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { indice, repositorio, reindexacion } = estado
  const enCurso = reindexacion.estado === 'en_curso'

  // Mientras se reindexa, se pide el estado cada 3 s.
  useEffect(() => {
    if (!enCurso) return
    const control = new AbortController()
    const t = setTimeout(() => {
      cliente
        .estadoIndiceOdes(control.signal)
        .then((nuevo) => {
          if (nuevo.reindexacion.estado === 'completada') avisar('La reindexación del Asistente ODES terminó.')
          if (nuevo.reindexacion.estado === 'fallida') avisar('La reindexación del Asistente ODES falló.')
          onEstado(nuevo)
        })
        .catch((e: unknown) => {
          if (esAborto(e) || (esErrorAdmin(e) && e.estado === 401)) return
          setError(`No se pudo consultar el progreso. ${mensajeDe(e)}`)
        })
    }, INTERVALO_ESTADO_MS)
    return () => {
      clearTimeout(t)
      control.abort()
    }
  }, [enCurso, estado, cliente, avisar, onEstado])

  async function reindexar() {
    setPidiendo(true)
    setError(null)
    try {
      onEstado(await cliente.reindexarOdes())
      avisar('Se inició la reindexación del Asistente ODES.')
    } catch (e) {
      if (!(esErrorAdmin(e) && e.estado === 401)) setError(mensajeDe(e))
    } finally {
      setPidiendo(false)
    }
  }

  return (
    <>
      <section className="ra-panel ra-asistente" aria-labelledby={`${id}-indice`}>
        <h2 className="ra-panel-titulo" id={`${id}-indice`}>
          Índice actual
        </h2>
        {indice.disponible ? (
          <dl className="ra-datos-estado">
            <dt>Generado</dt>
            <dd>{indice.generado ? fechaHora(indice.generado) : '—'}</dd>
            <dt>Origen</dt>
            <dd>
              {indice.origen === 'mysql'
                ? 'La base de datos del repositorio'
                : indice.origen === 'paquete'
                  ? 'El paquete de datos de la carga inicial'
                  : 'No consta (índice generado con una versión anterior)'}
            </dd>
            <dt>Documentos</dt>
            <dd>
              {cantidad(indice.documentos, 'documento')} ({indice.documentosConTexto} con texto)
            </dd>
            <dt>Páginas</dt>
            <dd>
              {cantidad(indice.paginas, 'página')}
              {indice.paginasOcr > 0 ? ` (${indice.paginasOcr} leídas con OCR)` : ''}
            </dd>
            <dt>Tamaño</dt>
            <dd>{tamanoLegible(indice.bytes)}</dd>
          </dl>
        ) : (
          <p>No hay un índice utilizable: el asistente no puede responder hasta que se genere.</p>
        )}
        {indice.error && (
          <div className="ra-aviso ra-aviso-error">
            <Icono nombre="error" />
            <p>{indice.error}</p>
          </div>
        )}
        {repositorio.cambiado === true && (
          <div className="ra-aviso ra-aviso-atencion">
            <Icono nombre="aviso" />
            <p>
              <strong>Conviene reindexar.</strong> {repositorio.motivo}
            </p>
          </div>
        )}
        {repositorio.cambiado === false && (
          <div className="ra-aviso ra-aviso-ok">
            <Icono nombre="check" />
            <p>
              El índice está al día con los {cantidad(repositorio.publicados ?? 0, 'documento publicado', 'documentos publicados')}.
            </p>
          </div>
        )}
        {repositorio.cambiado === null && repositorio.motivo && <p className="ra-tenue">{repositorio.motivo}</p>}
      </section>

      <section className="ra-panel ra-asistente" aria-labelledby={`${id}-reindexar`}>
        <h2 className="ra-panel-titulo" id={`${id}-reindexar`}>
          Reindexación
        </h2>
        <p role="status" className="ra-estado-reindexacion">
          {enCurso && <span className="rp-indicador" aria-hidden="true" />}
          {TEXTO_ESTADO[reindexacion.estado]}
        </p>
        {(reindexacion.inicio || reindexacion.usuario) && (
          <dl className="ra-datos-estado">
            {reindexacion.inicio && (
              <>
                <dt>Inicio</dt>
                <dd>{fechaHora(reindexacion.inicio)}</dd>
              </>
            )}
            {reindexacion.fin && (
              <>
                <dt>Fin</dt>
                <dd>{fechaHora(reindexacion.fin)}</dd>
              </>
            )}
            {reindexacion.usuario && (
              <>
                <dt>Pedida por</dt>
                <dd>{reindexacion.usuario}</dd>
              </>
            )}
          </dl>
        )}
        {reindexacion.error && (
          <div className="ra-aviso ra-aviso-error">
            <Icono nombre="error" />
            <p>{reindexacion.error}</p>
          </div>
        )}
        {reindexacion.registro.length > 0 && (
          <details className="ra-registro" open={enCurso}>
            <summary>Registro del indexador</summary>
            <pre tabIndex={0} aria-label="Registro del indexador">
              {reindexacion.registro.join('\n')}
            </pre>
          </details>
        )}
        {error && (
          <div className="ra-aviso ra-aviso-error" role="alert">
            <Icono nombre="error" />
            <p>{error}</p>
          </div>
        )}
        <p>
          <button
            type="button"
            className="rp-boton"
            onClick={() => void reindexar()}
            disabled={enCurso || pidiendo}
            aria-describedby={`${id}-ayuda`}
          >
            <Icono nombre="reintentar" />
            {enCurso ? 'Reindexando…' : pidiendo ? 'Iniciando…' : 'Reindexar'}
          </button>
        </p>
        <p className="ra-ayuda" id={`${id}-ayuda`}>
          Lee de nuevo todos los documentos publicados (texto de los PDF y, si hace falta, OCR). Puede tardar varios
          minutos; puede seguir trabajando o cerrar esta página.
        </p>
      </section>
    </>
  )
}
