/**
 * /pai/admin/usuarios (solo administrador): tabla de cuentas con búsqueda;
 * crear y editar (ModalUsuario: rol, activo, contraseña temporal con
 * generador), activar o desactivar con confirmación, y asignar procesos
 * completos o indicadores sueltos a los responsables (ModalAsignaciones, con
 * el árbol armado desde GET /tablero).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { UsuarioPai } from '../api-pai'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import ModalPai from '../componentes/ModalPai'
import { useTituloPai } from '../componentes/useTituloPai'
import { mensajeDe } from '../datos/clientePai'
import { formatoFechaHora } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { nombreRol, useClientePai, useSesionActivaPai, useSesionPai } from '../sesion/contexto'
import { arbolAsignaciones, normalizar, resumenAsignaciones } from './asignaciones'
import ModalAsignaciones from './ModalAsignaciones'
import ModalUsuario from './ModalUsuario'
import './admin.css'

export default function PaginaUsuarios() {
  useTituloPai('Usuarios')
  const { cliente, vigenciaElegida } = useSesionPai()
  const sesion = useSesionActivaPai()
  // Las asignaciones son por vigencia: las de la vigencia elegida en la barra.
  const usuarios = useCarga(
    (signal) => cliente.listarUsuarios(signal, vigenciaElegida).then((lista) => lista.usuarios),
    `usuarios-${vigenciaElegida ?? 'actual'}`,
  )
  const arbol = useCarga(
    (signal) => cliente.obtenerTablero(vigenciaElegida, signal).then(arbolAsignaciones),
    `arbol-asignaciones-${vigenciaElegida ?? 'actual'}`,
  )
  const id = useId()
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<{ usuario: UsuarioPai | null } | null>(null)
  const [asignando, setAsignando] = useState<UsuarioPai | null>(null)
  const [cambiandoEstado, setCambiandoEstado] = useState<UsuarioPai | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const lista = usuarios.estado.fase === 'listo' ? usuarios.estado.datos : null
  const visibles = useMemo(() => {
    if (!lista) return []
    const texto = normalizar(busqueda)
    if (!texto) return lista
    return lista.filter((u) =>
      [u.usuario, u.nombre, u.correo ?? '', u.cargo ?? ''].some((campo) => normalizar(campo).includes(texto)),
    )
  }, [lista, busqueda])

  function reemplazar(usuario: UsuarioPai) {
    usuarios.setDatos((previo) => {
      const existe = previo.some((u) => u.id === usuario.id)
      return existe ? previo.map((u) => (u.id === usuario.id ? usuario : u)) : [...previo, usuario]
    })
  }

  /** La cuenta quedó guardada; el modal se cierra solo (o, con contraseña temporal, al pulsar «Listo»). */
  function alGuardar(usuario: UsuarioPai, creado: boolean) {
    reemplazar(usuario)
    setAviso(creado ? `Se creó la cuenta de ${usuario.nombre} (${usuario.usuario}).` : `Se guardaron los cambios de ${usuario.nombre}.`)
  }

  return (
    <div className="pai-pagina pai-admin">
      <div className="pai-admin-encabezado">
        <h1 className="h3 mb-0">Usuarios</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setAviso(null)
            setEditando({ usuario: null })
          }}
          disabled={!lista}
        >
          Crear usuario
        </button>
      </div>
      <p className="pai-admin-intro">
        Los responsables reportan solo los indicadores que se les asignan; los administradores ven todo en solo lectura
        y administran el aplicativo.
      </p>
      <div role="status" aria-live="polite">
        {aviso && <div className="alert alert-success">{aviso}</div>}
      </div>

      {usuarios.estado.fase === 'cargando' && <Cargando texto="Cargando los usuarios…" />}
      {usuarios.estado.fase === 'error' && (
        <ErrorCarga mensaje={usuarios.estado.mensaje} onReintentar={usuarios.recargar} />
      )}
      {lista && (
        <section className="card card-lg" aria-labelledby={`${id}-titulo`}>
          <div className="card-header d-flex flex-wrap align-items-end justify-content-between gap-3">
            <h2 className="card-title h5 mb-0" id={`${id}-titulo`}>
              Cuentas ({lista.length})
            </h2>
            <div className="pai-admin-filtro">
              <label className="form-label mb-1" htmlFor={`${id}-buscar`}>
                Buscar
              </label>
              <input
                id={`${id}-buscar`}
                className="form-control form-control-sm"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, usuario, correo o cargo"
              />
            </div>
          </div>
          <div className="card-body">
            {lista.length === 0 ? (
              <p className="mb-0">Todavía no hay cuentas. Cree la primera con «Crear usuario».</p>
            ) : visibles.length === 0 ? (
              <p className="mb-0">Ninguna cuenta coincide con la búsqueda.</p>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle pai-tabla-usuarios">
                  <caption className="pai-solo-lector">Cuentas del Plan de Acción Institucional</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Usuario</th>
                      <th scope="col">Rol</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Asignaciones</th>
                      <th scope="col">Último ingreso</th>
                      <th scope="col">
                        <span className="pai-solo-lector">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((usuario) => {
                      const propio = usuario.id === sesion.id
                      const nombre = usuario.nombre || usuario.usuario
                      return (
                        <tr key={usuario.id} className={usuario.activo ? undefined : 'pai-fila-inactiva'}>
                          <th scope="row">
                            {usuario.nombre}
                            {propio && <span className="pai-tenue"> (usted)</span>}
                            {(usuario.cargo || usuario.correo) && (
                              <span className="pai-detalle-usuario">
                                {[usuario.cargo, usuario.correo].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </th>
                          <td>
                            <code>{usuario.usuario}</code>
                          </td>
                          <td>{nombreRol(usuario.rol)}</td>
                          <td>
                            <span className="pai-etiquetas">
                              <span className={`tag ${usuario.activo ? 'tag-light-success' : 'tag-light-neutral'}`}>
                                {usuario.activo ? 'Activa' : 'Inactiva'}
                              </span>
                              {usuario.debeCambiarContrasena && (
                                <span className="tag tag-light-warning">Contraseña temporal</span>
                              )}
                            </span>
                          </td>
                          <td>{usuario.rol === 'administrador' ? 'Ve todo' : resumenAsignaciones(usuario.asignaciones)}</td>
                          <td className="text-nowrap">{usuario.ultimoAcceso ? formatoFechaHora(usuario.ultimoAcceso) : 'Nunca'}</td>
                          <td>
                            <div className="pai-acciones-fila">
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm"
                                onClick={() => {
                                  setAviso(null)
                                  setEditando({ usuario })
                                }}
                              >
                                Editar{' '}<span className="pai-solo-lector">a {nombre}</span>
                              </button>
                              {usuario.rol === 'responsable' && (
                                <button
                                  type="button"
                                  className="btn btn-outline-primary btn-sm"
                                  onClick={() => {
                                    setAviso(null)
                                    setAsignando(usuario)
                                  }}
                                >
                                  Asignar{' '}<span className="pai-solo-lector">indicadores a {nombre}</span>
                                </button>
                              )}
                              {!propio && (
                                <button
                                  type="button"
                                  className="btn btn-outline-neutral btn-sm"
                                  onClick={() => {
                                    setAviso(null)
                                    setCambiandoEstado(usuario)
                                  }}
                                >
                                  {usuario.activo ? 'Desactivar' : 'Activar'}
                                  {' '}<span className="pai-solo-lector">a {nombre}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {editando && (
        <ModalUsuario
          usuario={editando.usuario}
          propio={editando.usuario?.id === sesion.id}
          onCerrar={() => setEditando(null)}
          onGuardado={alGuardar}
        />
      )}
      {asignando && (
        <ModalAsignaciones
          usuario={asignando}
          arbol={arbol.estado}
          onReintentar={arbol.recargar}
          onCerrar={() => setAsignando(null)}
          onGuardado={(usuario) => {
            reemplazar(usuario)
            setAsignando(null)
            setAviso(`Se guardaron las asignaciones de ${usuario.nombre}: ${resumenAsignaciones(usuario.asignaciones)}.`)
          }}
        />
      )}
      {cambiandoEstado && (
        <ConfirmarEstado
          usuario={cambiandoEstado}
          onCerrar={() => setCambiandoEstado(null)}
          onCambiado={(usuario) => {
            reemplazar(usuario)
            setCambiandoEstado(null)
            setAviso(
              usuario.activo
                ? `Se activó la cuenta de ${usuario.nombre}.`
                : `Se desactivó la cuenta de ${usuario.nombre}; sus sesiones se cerraron.`,
            )
          }}
        />
      )}
    </div>
  )
}

function ConfirmarEstado({
  usuario,
  onCerrar,
  onCambiado,
}: {
  usuario: UsuarioPai
  onCerrar: () => void
  onCambiado: (usuario: UsuarioPai) => void
}) {
  const cliente = useClientePai()
  const idTexto = useId()
  const refCancelar = useRef<HTMLButtonElement>(null)
  const refError = useRef<HTMLDivElement>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activar = !usuario.activo

  // Los botones se deshabilitan mientras guarda: si falla, el foco va al aviso (no se queda en <body>).
  useEffect(() => {
    if (error) refError.current?.focus()
  }, [error])
  const nombre = usuario.nombre || usuario.usuario

  async function confirmar() {
    setGuardando(true)
    setError(null)
    try {
      onCambiado(await cliente.actualizarUsuario(usuario.id, { activo: activar }))
    } catch (e) {
      setGuardando(false)
      setError(mensajeDe(e))
    }
  }

  return (
    <ModalPai
      abierto
      rol="alertdialog"
      titulo={activar ? `¿Activar la cuenta de ${nombre}?` : `¿Desactivar la cuenta de ${nombre}?`}
      idDescripcion={idTexto}
      onCerrar={onCerrar}
      bloqueado={guardando}
      enfoqueInicial={refCancelar}
      pie={
        <>
          <button
            ref={refCancelar}
            type="button"
            className="btn btn-outline-neutral"
            onClick={onCerrar}
            disabled={guardando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={activar ? 'btn btn-primary' : 'btn btn-danger'}
            onClick={() => void confirmar()}
            disabled={guardando}
          >
            {guardando ? 'Guardando…' : activar ? 'Activar' : 'Desactivar'}
          </button>
        </>
      }
    >
      {error && (
        <div className="alert alert-danger" role="alert" tabIndex={-1} ref={refError}>
          {error}
        </div>
      )}
      <p id={idTexto} className="mb-0">
        {activar
          ? `${nombre} podrá volver a ingresar con su usuario y su contraseña.`
          : `${nombre} no podrá ingresar y se cerrarán sus sesiones abiertas. Sus asignaciones se conservan.`}
      </p>
    </ModalPai>
  )
}
