/**
 * /pai/admin/autorizaciones (solo administrador): otorgar a un responsable
 * permiso para reportar otro bimestre (usuario, bimestre, proceso completo o
 * un indicador, vigente hasta, motivo), listar las vigentes y las vencidas o
 * revocadas, y revocar con confirmación. Solo se ofrecen los procesos e
 * indicadores que el responsable tiene asignados (autorizaciones.ts).
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import {
  BIMESTRES_PAI,
  LIMITES_PAI,
  type AutorizacionPai,
  type DatosAutorizacionPai,
  type NumeroBimestre,
  type TableroPai,
  type UsuarioPai,
} from '../api-pai'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import ModalPai from '../componentes/ModalPai'
import { useTituloPai } from '../componentes/useTituloPai'
import { esErrorPai, mensajeDe } from '../datos/clientePai'
import { formatoFecha, formatoFechaHora, formatoNumero } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { useClientePai, useSesionPai } from '../sesion/contexto'
import { alcancesDeUsuario, dividirAutorizaciones, ordenarAutorizaciones } from './autorizaciones'
import { diaMaxAutorizacion, finDelDiaColombia, hoyColombia } from './fechas'
import './admin.css'

/** El servidor trae todas las vigentes y, de las demás (vencidas o revocadas), a lo sumo las 1000 más recientes. */
const MAX_OTRAS_AUTORIZACIONES = 1000

interface Catalogos {
  usuarios: UsuarioPai[]
  tablero: TableroPai
}

export default function PaginaAutorizaciones() {
  useTituloPai('Autorizaciones')
  const { cliente, vigenciaElegida } = useSesionPai()
  const id = useId()
  const lista = useCarga(
    (signal) => cliente.listarAutorizaciones(signal).then((r) => ordenarAutorizaciones(r.autorizaciones)),
    'autorizaciones',
  )
  // Responsables con sus asignaciones y los procesos de la vigencia elegida en la barra.
  const catalogos = useCarga<Catalogos>(async (signal) => {
    const [usuarios, tablero] = await Promise.all([
      cliente.listarUsuarios(signal, vigenciaElegida),
      cliente.obtenerTablero(vigenciaElegida, signal),
    ])
    return { usuarios: usuarios.usuarios, tablero }
  }, `catalogos-autorizaciones-${vigenciaElegida ?? 'actual'}`)
  const [revocando, setRevocando] = useState<AutorizacionPai | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /** Al revocar, la fila pasa a la otra tabla y su botón desaparece: el foco va al aviso. */
  const refAviso = useRef<HTMLDivElement>(null)

  function reemplazar(autorizacion: AutorizacionPai) {
    lista.setDatos((previo) =>
      ordenarAutorizaciones([autorizacion, ...previo.filter((a) => a.id !== autorizacion.id)]),
    )
  }

  const divididas = lista.estado.fase === 'listo' ? dividirAutorizaciones(lista.estado.datos) : null

  return (
    <div className="pai-pagina pai-admin">
      <h1 className="h3">Autorizaciones</h1>
      <p className="pai-admin-intro">
        Una autorización permite a un responsable reportar un bimestre que no está abierto (por ejemplo, para corregir
        un reporte pasado) hasta la fecha que usted elija. Puede revocarla en cualquier momento.
      </p>
      <div role="status" aria-live="polite">
        {aviso && (
          <div className="alert alert-success" tabIndex={-1} ref={refAviso}>
            {aviso}
          </div>
        )}
      </div>

      <section className="card card-lg mb-4" aria-labelledby={`${id}-otorgar`}>
        <div className="card-header">
          <h2 className="card-title h5 mb-0" id={`${id}-otorgar`}>
            Otorgar una autorización
          </h2>
        </div>
        <div className="card-body">
          {catalogos.estado.fase === 'cargando' && <Cargando texto="Cargando responsables e indicadores…" />}
          {catalogos.estado.fase === 'error' && (
            <ErrorCarga mensaje={catalogos.estado.mensaje} onReintentar={catalogos.recargar} />
          )}
          {catalogos.estado.fase === 'listo' && (
            <FormularioAutorizacion
              catalogos={catalogos.estado.datos}
              onCambio={() => setAviso(null)}
              onOtorgada={(autorizacion) => {
                reemplazar(autorizacion)
                setAviso(
                  `Se autorizó a ${autorizacion.nombreUsuario} para reportar el bimestre ${autorizacion.bimestre} (${autorizacion.alcance}) hasta el ${formatoFecha(autorizacion.vigenteHasta)}.`,
                )
              }}
            />
          )}
        </div>
      </section>

      {lista.estado.fase === 'cargando' && <Cargando texto="Cargando las autorizaciones…" />}
      {lista.estado.fase === 'error' && <ErrorCarga mensaje={lista.estado.mensaje} onReintentar={lista.recargar} />}
      {divididas && (
        <>
          <TablaAutorizaciones
            titulo="Vigentes"
            vacio="No hay autorizaciones vigentes."
            autorizaciones={divididas.vigentes}
            onRevocar={(a) => {
              setAviso(null)
              setRevocando(a)
            }}
          />
          <TablaAutorizaciones
            titulo="Vencidas y revocadas"
            vacio="No hay autorizaciones vencidas ni revocadas."
            autorizaciones={divididas.otras}
            nota={
              divididas.otras.length >= MAX_OTRAS_AUTORIZACIONES
                ? `Se muestran las ${formatoNumero(MAX_OTRAS_AUTORIZACIONES)} más recientes.`
                : undefined
            }
          />
        </>
      )}

      {revocando && (
        <ConfirmarRevocacion
          autorizacion={revocando}
          enfoqueFinal={refAviso}
          onCerrar={() => setRevocando(null)}
          onRevocada={(autorizacion) => {
            reemplazar(autorizacion)
            setRevocando(null)
            setAviso(`Se revocó la autorización de ${autorizacion.nombreUsuario} para el bimestre ${autorizacion.bimestre}.`)
          }}
        />
      )}
    </div>
  )
}

type CampoAutorizacion = 'usuario' | 'bimestre' | 'proceso' | 'fecha' | 'motivo'

const ORDEN: CampoAutorizacion[] = ['usuario', 'bimestre', 'proceso', 'fecha', 'motivo']

function FormularioAutorizacion({
  catalogos,
  onOtorgada,
  onCambio,
}: {
  catalogos: Catalogos
  onOtorgada: (autorizacion: AutorizacionPai) => void
  onCambio: () => void
}) {
  const cliente = useClientePai()
  const id = useId()
  const [usuarioId, setUsuarioId] = useState('')
  const [bimestre, setBimestre] = useState('')
  const [procesoId, setProcesoId] = useState('')
  const [indicadorId, setIndicadorId] = useState('')
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errores, setErrores] = useState<Partial<Record<CampoAutorizacion, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [enfocar, setEnfocar] = useState(0)
  const refFormulario = useRef<HTMLFormElement>(null)
  const hoy = hoyColombia()
  const maximo = diaMaxAutorizacion()

  // Después de validar o de un error del servidor (ya sin `guardando`, que deshabilita los campos),
  // el foco va al primer campo con error o al aviso.
  useEffect(() => {
    if (enfocar === 0 || !refFormulario.current) return
    const primero = ORDEN.find((c) => errores[c])
    const destino = primero
      ? refFormulario.current.querySelector<HTMLElement>(`[data-campo="${primero}"]`)
      : refFormulario.current.querySelector<HTMLElement>('.alert')
    destino?.focus()
    // Solo cuando se pide (enfocar cambia).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [enfocar])

  const responsables = useMemo(
    () => catalogos.usuarios.filter((u) => u.rol === 'responsable' && u.activo),
    [catalogos.usuarios],
  )
  const usuario = responsables.find((u) => String(u.id) === usuarioId) ?? null
  const alcances = useMemo(
    () => (usuario ? alcancesDeUsuario(usuario, catalogos.tablero) : []),
    [usuario, catalogos.tablero],
  )
  const alcance = alcances.find((a) => String(a.proceso.id) === procesoId) ?? null

  function limpiarError(campo: CampoAutorizacion) {
    onCambio()
    if (errores[campo]) setErrores((previo) => ({ ...previo, [campo]: undefined }))
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando) return
    const encontrados: Partial<Record<CampoAutorizacion, string>> = {}
    if (!usuario) encontrados.usuario = 'Elija el responsable.'
    if (!bimestre) encontrados.bimestre = 'Elija el bimestre.'
    if (usuario && !alcance) encontrados.proceso = 'Elija el proceso.'
    const vigenteHasta = fecha ? finDelDiaColombia(fecha) : null
    if (!fecha) encontrados.fecha = 'Elija hasta qué día vale la autorización.'
    else if (!vigenteHasta) encontrados.fecha = 'Escriba una fecha válida.'
    else if (fecha < hoy) encontrados.fecha = 'La fecha debe ser hoy o una fecha futura.'
    else if (fecha > maximo) encontrados.fecha = 'La fecha puede ser, como mucho, un año después de hoy.'
    const motivoLimpio = motivo.trim()
    if (!motivoLimpio) encontrados.motivo = 'Escriba el motivo.'
    else if (motivoLimpio.length > LIMITES_PAI.maxMotivoAutorizacion) {
      encontrados.motivo = `El motivo puede tener hasta ${LIMITES_PAI.maxMotivoAutorizacion} caracteres.`
    }
    setErrores(encontrados)
    setError(null)
    if (Object.keys(encontrados).length > 0 || !usuario || !alcance || !vigenteHasta) {
      setEnfocar((n) => n + 1)
      return
    }
    const cuerpo: DatosAutorizacionPai = {
      usuarioId: usuario.id,
      bimestre: Number(bimestre) as NumeroBimestre,
      procesoId: indicadorId ? null : alcance.proceso.id,
      indicadorId: indicadorId ? Number(indicadorId) : null,
      vigenteHasta,
      motivo: motivoLimpio,
    }
    setGuardando(true)
    try {
      const autorizacion = await cliente.otorgarAutorizacion(cuerpo)
      setGuardando(false)
      setBimestre('')
      setIndicadorId('')
      setMotivo('')
      onOtorgada(autorizacion)
    } catch (e) {
      setGuardando(false)
      const delServidor: Partial<Record<CampoAutorizacion, string>> = {}
      if (esErrorPai(e)) {
        const c = e.campos
        if (c.usuarioId) delServidor.usuario = c.usuarioId
        if (c.bimestre) delServidor.bimestre = c.bimestre
        if (c.procesoId || c.indicadorId) delServidor.proceso = c.procesoId ?? c.indicadorId
        if (c.vigenteHasta) delServidor.fecha = c.vigenteHasta
        if (c.motivo) delServidor.motivo = c.motivo
      }
      setErrores(delServidor)
      setError(mensajeDe(e))
      setEnfocar((n) => n + 1)
    }
  }

  function descripcion(campo: CampoAutorizacion, ayuda = false): string | undefined {
    return (
      [errores[campo] ? `${id}-${campo}-error` : null, ayuda ? `${id}-${campo}-ayuda` : null]
        .filter(Boolean)
        .join(' ') || undefined
    )
  }

  function errorDe(campo: CampoAutorizacion) {
    return errores[campo] ? (
      <div className="invalid-feedback d-block" id={`${id}-${campo}-error`}>
        {errores[campo]}
      </div>
    ) : null
  }

  if (responsables.length === 0) {
    return (
      <p className="mb-0">
        No hay responsables activos. Cree las cuentas en «Usuarios» y asígneles indicadores antes de autorizarlos.
      </p>
    )
  }

  return (
    <form ref={refFormulario} onSubmit={enviar} noValidate>
      {error && (
        <div className="alert alert-danger" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className="row g-3">
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor={`${id}-usuario`}>
            Responsable
          </label>
          <select
            id={`${id}-usuario`}
            data-campo="usuario"
            className={`form-select${errores.usuario ? ' is-invalid' : ''}`}
            value={usuarioId}
            onChange={(e) => {
              setUsuarioId(e.target.value)
              setProcesoId('')
              setIndicadorId('')
              limpiarError('usuario')
            }}
            aria-invalid={errores.usuario ? true : undefined}
            aria-describedby={descripcion('usuario')}
            disabled={guardando}
          >
            <option value="">Elija…</option>
            {responsables.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.usuario})
              </option>
            ))}
          </select>
          {errorDe('usuario')}
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor={`${id}-bimestre`}>
            Bimestre que podrá reportar
          </label>
          <select
            id={`${id}-bimestre`}
            data-campo="bimestre"
            className={`form-select${errores.bimestre ? ' is-invalid' : ''}`}
            value={bimestre}
            onChange={(e) => {
              setBimestre(e.target.value)
              limpiarError('bimestre')
            }}
            aria-invalid={errores.bimestre ? true : undefined}
            aria-describedby={descripcion('bimestre')}
            disabled={guardando}
          >
            <option value="">Elija…</option>
            {BIMESTRES_PAI.map((b) => (
              <option key={b.numero} value={b.numero}>
                {b.nombre} ({b.meses})
              </option>
            ))}
          </select>
          {errorDe('bimestre')}
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor={`${id}-proceso`}>
            Proceso o proyecto
          </label>
          <select
            id={`${id}-proceso`}
            data-campo="proceso"
            className={`form-select${errores.proceso ? ' is-invalid' : ''}`}
            value={procesoId}
            onChange={(e) => {
              setProcesoId(e.target.value)
              setIndicadorId('')
              limpiarError('proceso')
            }}
            aria-invalid={errores.proceso ? true : undefined}
            aria-describedby={descripcion('proceso', true)}
            disabled={guardando || !usuario || alcances.length === 0}
          >
            <option value="">{usuario ? 'Elija…' : 'Primero elija el responsable'}</option>
            {alcances.map((a) => (
              <option key={a.proceso.id} value={a.proceso.id}>
                {a.proceso.codigo} · {a.proceso.nombre}
              </option>
            ))}
          </select>
          {errorDe('proceso')}
          <div className="form-text" id={`${id}-proceso-ayuda`}>
            {usuario && alcances.length === 0
              ? 'Este responsable no tiene indicadores asignados: asígnelos en «Usuarios».'
              : 'Solo aparecen los procesos con indicadores asignados al responsable.'}
          </div>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor={`${id}-indicador`}>
            Alcance
          </label>
          <select
            id={`${id}-indicador`}
            className="form-select"
            value={indicadorId}
            onChange={(e) => {
              setIndicadorId(e.target.value)
              onCambio()
            }}
            disabled={guardando || !alcance}
          >
            <option value="">
              {alcance && !alcance.completo ? 'Todos sus indicadores de este proceso' : 'Todo el proceso'}
            </option>
            {alcance?.indicadores.map((i) => (
              <option key={i.id} value={i.id}>
                Solo {i.codigo} · {i.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor={`${id}-fecha`}>
            Vigente hasta
          </label>
          <input
            id={`${id}-fecha`}
            data-campo="fecha"
            className={`form-control${errores.fecha ? ' is-invalid' : ''}`}
            type="date"
            min={hoy}
            max={maximo}
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value)
              limpiarError('fecha')
            }}
            aria-invalid={errores.fecha ? true : undefined}
            aria-describedby={descripcion('fecha', true)}
            disabled={guardando}
          />
          {errorDe('fecha')}
          <div className="form-text" id={`${id}-fecha-ayuda`}>
            Vale hasta el final de ese día (hora de Colombia); como mucho, un año después de hoy.
          </div>
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor={`${id}-motivo`}>
            Motivo
          </label>
          <textarea
            id={`${id}-motivo`}
            data-campo="motivo"
            className={`form-control${errores.motivo ? ' is-invalid' : ''}`}
            rows={2}
            maxLength={LIMITES_PAI.maxMotivoAutorizacion}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value)
              limpiarError('motivo')
            }}
            aria-invalid={errores.motivo ? true : undefined}
            aria-describedby={descripcion('motivo', true)}
            disabled={guardando}
          />
          {errorDe('motivo')}
          <div className="form-text" id={`${id}-motivo-ayuda`}>
            Queda en el registro. {motivo.length} de {LIMITES_PAI.maxMotivoAutorizacion} caracteres.
          </div>
        </div>
      </div>
      <button type="submit" className="btn btn-primary mt-3" disabled={guardando}>
        {guardando ? 'Otorgando…' : 'Otorgar autorización'}
      </button>
    </form>
  )
}

const NOMBRES_ESTADO: Record<AutorizacionPai['estado'], { texto: string; clase: string }> = {
  vigente: { texto: 'Vigente', clase: 'tag-light-success' },
  vencida: { texto: 'Vencida', clase: 'tag-light-neutral' },
  revocada: { texto: 'Revocada', clase: 'tag-light-danger' },
}

function TablaAutorizaciones({
  titulo,
  vacio,
  autorizaciones,
  onRevocar,
  nota,
}: {
  titulo: string
  vacio: string
  autorizaciones: AutorizacionPai[]
  onRevocar?: (autorizacion: AutorizacionPai) => void
  /** Aclaración bajo el título (p. ej., que la lista está recortada). */
  nota?: string
}) {
  const id = useId()
  return (
    <section className="card card-lg mb-4" aria-labelledby={`${id}-titulo`}>
      <div className="card-header">
        <h2 className="card-title h5 mb-0" id={`${id}-titulo`}>
          {titulo} ({autorizaciones.length})
        </h2>
        {nota && <p className="form-text mb-0">{nota}</p>}
      </div>
      <div className="card-body">
        {autorizaciones.length === 0 ? (
          <p className="mb-0">{vacio}</p>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle pai-tabla-autorizaciones">
              <caption className="pai-solo-lector">Autorizaciones: {titulo.toLowerCase()}</caption>
              <thead>
                <tr>
                  <th scope="col">Responsable</th>
                  <th scope="col">Bimestre</th>
                  <th scope="col">Alcance</th>
                  <th scope="col">Vigente hasta</th>
                  <th scope="col">Motivo</th>
                  <th scope="col">Otorgada</th>
                  <th scope="col">Estado</th>
                  {onRevocar && (
                    <th scope="col">
                      <span className="pai-solo-lector">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {autorizaciones.map((a) => (
                  <tr key={a.id}>
                    <th scope="row">
                      {a.nombreUsuario}
                      <span className="pai-detalle-usuario">{a.usuario}</span>
                    </th>
                    <td>{a.bimestre}</td>
                    <td className="pai-celda-texto">{a.alcance}</td>
                    <td>{formatoFecha(a.vigenteHasta)}</td>
                    <td className="pai-celda-texto">{a.motivo}</td>
                    <td>
                      {formatoFechaHora(a.otorgadaEn)}
                      {a.otorgadaPor && <span className="pai-detalle-usuario">por {a.otorgadaPor}</span>}
                    </td>
                    <td>
                      <span className={`tag ${NOMBRES_ESTADO[a.estado].clase}`}>{NOMBRES_ESTADO[a.estado].texto}</span>
                      {a.estado === 'revocada' && a.revocadaEn && (
                        <span className="pai-detalle-usuario">
                          {formatoFechaHora(a.revocadaEn)}
                          {a.revocadaPor ? ` por ${a.revocadaPor}` : ''}
                        </span>
                      )}
                    </td>
                    {onRevocar && (
                      <td>
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => onRevocar(a)}>
                          Revocar{' '}<span className="pai-solo-lector">la autorización de {a.nombreUsuario}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function ConfirmarRevocacion({
  autorizacion,
  enfoqueFinal,
  onCerrar,
  onRevocada,
}: {
  autorizacion: AutorizacionPai
  /** Recibe el foco al cerrar si el botón Revocar de la fila ya no existe. */
  enfoqueFinal?: RefObject<HTMLElement | null>
  onCerrar: () => void
  onRevocada: (autorizacion: AutorizacionPai) => void
}) {
  const cliente = useClientePai()
  const idTexto = useId()
  const refCancelar = useRef<HTMLButtonElement>(null)
  const refError = useRef<HTMLDivElement>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Los botones se deshabilitan mientras revoca: si falla, el foco va al aviso.
  useEffect(() => {
    if (error) refError.current?.focus()
  }, [error])

  async function confirmar() {
    setGuardando(true)
    setError(null)
    try {
      onRevocada(await cliente.revocarAutorizacion(autorizacion.id))
    } catch (e) {
      setGuardando(false)
      setError(mensajeDe(e))
    }
  }

  return (
    <ModalPai
      abierto
      rol="alertdialog"
      titulo="¿Revocar la autorización?"
      idDescripcion={idTexto}
      onCerrar={onCerrar}
      bloqueado={guardando}
      enfoqueInicial={refCancelar}
      enfoqueFinal={enfoqueFinal}
      pie={
        <>
          <button ref={refCancelar} type="button" className="btn btn-outline-neutral" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void confirmar()} disabled={guardando}>
            {guardando ? 'Revocando…' : 'Revocar'}
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
        {autorizacion.nombreUsuario} ya no podrá reportar el bimestre {autorizacion.bimestre} ({autorizacion.alcance}),
        que tenía autorizado hasta el {formatoFecha(autorizacion.vigenteHasta)}.
      </p>
    </ModalPai>
  )
}
