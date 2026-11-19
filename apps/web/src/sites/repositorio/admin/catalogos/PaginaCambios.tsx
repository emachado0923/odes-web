/**
 * Registro de cambios: los últimos cambios (quién, qué y cuándo), de todo el
 * repositorio o de un documento (?documento=<id>).
 */
import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { AccionCambio } from '../../api-repositorio'
import Icono from '../componentes/IconoAdmin'
import { Cargando, ErrorCarga, TituloPagina } from '../componentes/Pagina'
import { fechaHora } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { RUTA_CAMBIOS, rutaDocumento } from '../rutasAdmin'
import { useCliente } from '../sesion/contexto'

const TEXTOS_ACCION: Record<AccionCambio, string> = {
  crear: 'Creó',
  editar: 'Editó',
  publicar: 'Publicó',
  despublicar: 'Despublicó',
  borrar: 'Borró',
  subir_archivo: 'Archivo',
  quitar_archivo: 'Quitó archivo',
  subir_portada: 'Portada',
  categoria: 'Categorías',
  palabra_clave: 'Palabras clave',
  sesion: 'Sesión',
}

const LIMITES = [50, 100, 200, 500]

export default function PaginaCambios() {
  const cliente = useCliente()
  const id = useId()
  const [parametros, setParametros] = useSearchParams()
  const documento = parametros.get('documento')
  const limitePedido = Number(parametros.get('limite'))
  const limite = LIMITES.includes(limitePedido) ? limitePedido : 50
  const { estado, recargar } = useCarga(
    (signal) => cliente.listarCambios(limite, documento, signal),
    `${limite}|${documento ?? ''}`,
  )

  function cambiarLimite(valor: number) {
    const p = new URLSearchParams(parametros)
    if (valor === 50) p.delete('limite')
    else p.set('limite', String(valor))
    setParametros(p, { replace: true })
  }

  return (
    <div className="ra-pagina">
      <TituloPagina documento={documento ? `Historial de ${documento}` : 'Registro de cambios'}>
        {documento ? 'Historial del documento' : 'Registro de cambios'}
      </TituloPagina>
      {documento && (
        <p className="ra-introduccion">
          Cambios de <Link to={rutaDocumento(documento)}><code className="ra-codigo">{documento}</code></Link>.{' '}
          <Link to={RUTA_CAMBIOS}>Ver todo el registro</Link>
        </p>
      )}
      <div className="ra-filtros ra-filtros-cambios">
        <div className="ra-campo">
          <label className="ra-etiqueta" htmlFor={`${id}-limite`}>
            Mostrar
          </label>
          <div className="rp-select">
            <select id={`${id}-limite`} value={limite} onChange={(e) => cambiarLimite(Number(e.target.value))}>
              {LIMITES.map((l) => (
                <option key={l} value={l}>
                  Los últimos {l}
                </option>
              ))}
            </select>
            <Icono nombre="flecha" />
          </div>
        </div>
        <button type="button" className="rp-boton rp-boton-borde ra-boton-chico" onClick={recargar}>
          <Icono nombre="reintentar" />
          Actualizar
        </button>
      </div>
      {estado.fase === 'cargando' && <Cargando texto="Cargando el registro…" />}
      {estado.fase === 'error' && (
        <ErrorCarga titulo="No se pudo cargar el registro de cambios" mensaje={estado.mensaje} onReintentar={recargar} />
      )}
      {estado.fase === 'listo' &&
        (estado.datos.length === 0 ? (
          <p className="rp-vacio">Todavía no hay cambios registrados.</p>
        ) : (
          <div className="ra-tabla-marco">
            <table className="ra-tabla ra-tabla-cambios">
              <caption>
                {estado.datos.length === 1 ? 'El último cambio' : `Los últimos ${estado.datos.length} cambios`}, del
                más reciente al más antiguo
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col" className="ra-col-usuario">
                    Usuario
                  </th>
                  <th scope="col">Acción</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {estado.datos.map((c) => (
                  <tr key={c.id}>
                    <td className="ra-sin-salto">
                      {fechaHora(c.fecha)}
                      {/* En celular la columna "Usuario" se oculta y el usuario va aquí. */}
                      {c.usuario && <span className="ra-tenue ra-usuario-angosto">{c.usuario}</span>}
                    </td>
                    <td className="ra-col-usuario">{c.usuario ?? <span className="ra-tenue">—</span>}</td>
                    <td>
                      <span className={`ra-accion ra-accion-${c.accion}`}>{TEXTOS_ACCION[c.accion]}</span>
                    </td>
                    <td>
                      {c.detalle ?? ''}
                      {c.documentoId && c.accion !== 'borrar' && (
                        <>
                          {' '}
                          <Link className="ra-enlace-chico" to={rutaDocumento(c.documentoId)}>
                            Abrir<span className="rp-oculto"> el documento {c.documentoId}</span>
                          </Link>
                        </>
                      )}
                      {c.documentoId && c.accion === 'borrar' && (
                        <span className="ra-tenue ra-bloque">
                          <code className="ra-codigo">{c.documentoId}</code>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  )
}
