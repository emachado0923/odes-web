/**
 * /pai/admin/registro (solo administrador): auditoría paginada
 * (LIMITES_PAI.registroPorPagina por página) con filtros por usuario,
 * indicador (código o id) y acción. Los filtros y la página van en la URL
 * (?usuario=&indicador=&accion=&pagina=), así que se pueden compartir y el
 * botón Atrás los recorre. El formulario no se vuelve a montar al aplicar un
 * filtro (el foco se queda en el control que se cambió) y revisa el
 * indicador como el servidor (id o código completo) antes de buscar.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ACCIONES_REGISTRO_PAI, type AccionRegistroPai, type EntradaRegistroPai, type PaginaRegistroPai } from '../api-pai'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import { useTituloPai } from '../componentes/useTituloPai'
import { formatoFechaHora } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { RUTA_ADMIN_REGISTRO, rutaFicha } from '../rutas'
import { useClientePai } from '../sesion/contexto'
import {
  NOMBRES_ACCION,
  MAX_INDICADOR_REGISTRO,
  consultaRegistro,
  etiquetaCampo,
  leerFiltrosRegistro,
  lineasDetalle,
  parametrosRegistro,
  problemaIndicadorRegistro,
  totalPaginas,
  type FiltrosRegistro,
} from './registro'
import './admin.css'

export default function PaginaRegistro() {
  useTituloPai('Registro')
  const cliente = useClientePai()
  const [parametros, setParametros] = useSearchParams()
  const filtros = leerFiltrosRegistro(parametros)
  const clave = parametrosRegistro(filtros).toString()
  const pagina = useCarga((signal) => cliente.listarRegistro(consultaRegistro(filtros), signal), clave)
  const usuarios = useCarga((signal) => cliente.listarUsuarios(signal).then((l) => l.usuarios), 'usuarios-registro')

  function aplicar(cambios: Partial<FiltrosRegistro>) {
    // Cambiar un filtro vuelve a la primera página.
    setParametros(parametrosRegistro({ ...filtros, pagina: 1, ...cambios }))
  }

  return (
    <div className="pai-pagina pai-admin">
      <h1 className="h3">Registro de cambios</h1>
      <p className="pai-admin-intro">
        Quién hizo qué y cuándo: ingresos, reportes guardados, evidencias, cuentas, asignaciones, bimestres y
        autorizaciones.
      </p>
      <FiltrosRegistroFormulario
        filtros={filtros}
        usuarios={usuarios.estado.fase === 'listo' ? usuarios.estado.datos : null}
        onAplicar={aplicar}
      />
      {pagina.estado.fase === 'cargando' && <Cargando texto="Cargando el registro…" />}
      {pagina.estado.fase === 'error' && <ErrorCarga mensaje={pagina.estado.mensaje} onReintentar={pagina.recargar} />}
      {pagina.estado.fase === 'listo' && <TablaRegistro pagina={pagina.estado.datos} filtros={filtros} />}
    </div>
  )
}

function FiltrosRegistroFormulario({
  filtros,
  usuarios,
  onAplicar,
}: {
  filtros: FiltrosRegistro
  usuarios: { id: number; nombre: string; usuario: string }[] | null
  onAplicar: (cambios: Partial<FiltrosRegistro>) => void
}) {
  const id = useId()
  const [indicador, setIndicador] = useState(filtros.indicador)
  const [error, setError] = useState<string | null>(null)
  const refIndicador = useRef<HTMLInputElement>(null)
  const hayFiltros = filtros.usuario !== null || filtros.indicador !== '' || filtros.accion !== null

  // La URL cambió por fuera (Atrás, "Quitar los filtros"): el campo muestra el filtro aplicado.
  const [indicadorVisto, setIndicadorVisto] = useState(filtros.indicador)
  if (filtros.indicador !== indicadorVisto) {
    setIndicadorVisto(filtros.indicador)
    setIndicador(filtros.indicador)
    setError(null)
  }

  /** El indicador escrito si es válido; si no, el que ya estaba aplicado. */
  const indicadorAplicable = problemaIndicadorRegistro(indicador) ? filtros.indicador : indicador

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const problema = problemaIndicadorRegistro(indicador)
    setError(problema)
    if (problema) {
      refIndicador.current?.focus()
      return
    }
    onAplicar({ indicador })
  }

  return (
    <section className="card card-lg mb-4" aria-labelledby={`${id}-titulo`}>
      <div className="card-header">
        <h2 className="card-title h5 mb-0" id={`${id}-titulo`}>
          Filtros
        </h2>
      </div>
      <div className="card-body">
        <form className="row g-3 align-items-end" onSubmit={enviar} role="search" aria-labelledby={`${id}-titulo`}>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor={`${id}-usuario`}>
              Usuario
            </label>
            <select
              id={`${id}-usuario`}
              className="form-select"
              value={filtros.usuario ?? ''}
              onChange={(e) => onAplicar({ usuario: e.target.value ? Number(e.target.value) : null, indicador: indicadorAplicable })}
            >
              <option value="">Todos</option>
              {filtros.usuario !== null && !usuarios?.some((u) => u.id === filtros.usuario) && (
                <option value={filtros.usuario}>Usuario {filtros.usuario}</option>
              )}
              {usuarios?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.usuario})
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor={`${id}-accion`}>
              Acción
            </label>
            <select
              id={`${id}-accion`}
              className="form-select"
              value={filtros.accion ?? ''}
              onChange={(e) =>
                onAplicar({ accion: (e.target.value || null) as AccionRegistroPai | null, indicador: indicadorAplicable })
              }
            >
              <option value="">Todas</option>
              {ACCIONES_REGISTRO_PAI.map((accion) => (
                <option key={accion} value={accion}>
                  {NOMBRES_ACCION[accion]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor={`${id}-indicador`}>
              Indicador
            </label>
            <div className="input-group">
              <input
                ref={refIndicador}
                id={`${id}-indicador`}
                className={`form-control${error ? ' is-invalid' : ''}`}
                type="search"
                value={indicador}
                maxLength={MAX_INDICADOR_REGISTRO}
                placeholder="Código, p. ej. SAF-TH-02"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-indicador-error` : undefined}
                onChange={(e) => {
                  setIndicador(e.target.value)
                  if (error) setError(null)
                }}
              />
              <button type="submit" className="btn btn-primary">
                Buscar
              </button>
            </div>
            {error && (
              <div className="invalid-feedback d-block" id={`${id}-indicador-error`}>
                {error}
              </div>
            )}
          </div>
          {hayFiltros && (
            <div className="col-12">
              <Link to={RUTA_ADMIN_REGISTRO} className="btn btn-outline-neutral btn-sm">
                Quitar los filtros
              </Link>
            </div>
          )}
        </form>
      </div>
    </section>
  )
}

function TablaRegistro({ pagina, filtros }: { pagina: PaginaRegistroPai; filtros: FiltrosRegistro }) {
  const id = useId()
  const paginas = totalPaginas(pagina.total, pagina.porPagina)
  const desde = pagina.total === 0 ? 0 : (pagina.pagina - 1) * pagina.porPagina + 1
  const hasta = Math.min(pagina.total, desde + pagina.entradas.length - 1)

  // Al cambiar de página, la tabla queda arriba de la vista.
  useEffect(() => {
    if (pagina.pagina > 1) document.getElementById(`${id}-titulo`)?.scrollIntoView?.({ block: 'start' })
  }, [id, pagina.pagina])

  return (
    <section className="card card-lg" aria-labelledby={`${id}-titulo`}>
      <div className="card-header d-flex flex-wrap justify-content-between align-items-baseline gap-2">
        <h2 className="card-title h5 mb-0" id={`${id}-titulo`}>
          Entradas
        </h2>
        <p className="mb-0 pai-tenue" role="status">
          {pagina.total === 0 ? 'Sin resultados' : `${desde}–${hasta} de ${pagina.total}`}
        </p>
      </div>
      <div className="card-body">
        {pagina.entradas.length === 0 ? (
          <p className="mb-0">No hay entradas con estos filtros.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-top pai-tabla-registro">
              <caption className="pai-solo-lector">Registro de cambios, página {pagina.pagina} de {paginas}</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Usuario</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Indicador</th>
                  <th scope="col">Bimestre</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {pagina.entradas.map((entrada) => (
                  <FilaRegistro key={entrada.id} entrada={entrada} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {paginas > 1 && <Paginacion pagina={pagina.pagina} paginas={paginas} filtros={filtros} />}
      </div>
    </section>
  )
}

function FilaRegistro({ entrada }: { entrada: EntradaRegistroPai }) {
  const lineas = lineasDetalle(entrada.detalle, entrada.accion)
  return (
    <tr>
      <td className="text-nowrap">{formatoFechaHora(entrada.fecha)}</td>
      <td>{entrada.usuario ?? '—'}</td>
      <td>{NOMBRES_ACCION[entrada.accion] ?? entrada.accion}</td>
      <td className="text-nowrap">
        {entrada.codigoIndicador ? <Link to={rutaFicha(entrada.codigoIndicador)}>{entrada.codigoIndicador}</Link> : '—'}
      </td>
      <td>{entrada.bimestre ?? '—'}</td>
      <td className="pai-celda-texto">
        {lineas.length === 0 ? (
          '—'
        ) : (
          <details>
            <summary>Ver detalle</summary>
            <ul className="pai-detalle-registro">
              {lineas.map((linea) => (
                <li key={linea.campo}>
                  <span className="pai-detalle-campo">{etiquetaCampo(linea.campo)}:</span>{' '}
                  {linea.antes !== undefined ? (
                    <>
                      <span className="pai-detalle-antes">{linea.antes}</span> → {linea.valor}
                    </>
                  ) : (
                    linea.valor
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </td>
    </tr>
  )
}

function Paginacion({ pagina, paginas, filtros }: { pagina: number; paginas: number; filtros: FiltrosRegistro }) {
  const enlace = (numero: number) => {
    const consulta = parametrosRegistro({ ...filtros, pagina: numero }).toString()
    return consulta ? `${RUTA_ADMIN_REGISTRO}?${consulta}` : RUTA_ADMIN_REGISTRO
  }
  return (
    <nav aria-label="Páginas del registro" className="mt-3">
      <ul className="pagination pai-paginacion">
        <li className={`page-item${pagina <= 1 ? ' disabled' : ''}`}>
          {pagina <= 1 ? (
            <span className="page-link">Anterior</span>
          ) : (
            <Link className="page-link" to={enlace(pagina - 1)}>
              Anterior
            </Link>
          )}
        </li>
        <li className="page-item active">
          <span className="page-link" aria-current="page">
            Página {pagina} de {paginas}
          </span>
        </li>
        <li className={`page-item${pagina >= paginas ? ' disabled' : ''}`}>
          {pagina >= paginas ? (
            <span className="page-link">Siguiente</span>
          ) : (
            <Link className="page-link" to={enlace(pagina + 1)}>
              Siguiente
            </Link>
          )}
        </li>
      </ul>
    </nav>
  )
}
