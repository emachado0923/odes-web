/**
 * /pai/admin/bimestre (solo administrador): abrir un bimestre (1-6, con
 * fecha límite opcional) o cerrarlo, con confirmación (ModalPai). La fecha
 * límite vale hasta el final de ese día en hora de Colombia (fechas.ts); el
 * servidor la evalúa en cada petición (no hay temporizadores). Al guardar
 * actualiza también la vigencia de la barra (actualizarVigencia).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BIMESTRES_PAI, infoBimestre, type DatosVigenciaPai, type NumeroBimestre, type VigenciaPai } from '../api-pai'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import ModalPai from '../componentes/ModalPai'
import { fechaLimite, textoVigencia } from '../componentes/textoVigencia'
import { useTituloPai } from '../componentes/useTituloPai'
import { mensajeDe } from '../datos/clientePai'
import { formatoFechaHora } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { useClientePai, useSesionPai } from '../sesion/contexto'
import { diaColombia, finDelDiaColombia, hoyColombia } from './fechas'
import './admin.css'

/** "… 9:02 p. m." ya termina en punto: no se agrega otro. */
function terminarFrase(frase: string): string {
  return frase.endsWith('.') ? frase : `${frase}.`
}

export default function PaginaBimestre() {
  useTituloPai('Bimestre')
  const { cliente, actualizarVigencia, vigenciaElegida } = useSesionPai()
  const { estado, recargar, setDatos } = useCarga(
    (signal) => cliente.obtenerVigencia(vigenciaElegida, signal),
    `vigencia-admin-${vigenciaElegida ?? 'actual'}`,
  )
  const [aviso, setAviso] = useState<string | null>(null)
  const refAviso = useRef<HTMLDivElement>(null)

  // Después de guardar, el foco va al aviso (el formulario se vuelve a montar con los datos nuevos).
  useEffect(() => {
    if (aviso) refAviso.current?.focus()
  }, [aviso])

  return (
    <div className="pai-pagina pai-admin">
      <h1 className="h3">Bimestre habilitado</h1>
      <p className="pai-admin-intro">
        Los responsables solo pueden reportar el bimestre abierto (o el que les autorice en «Autorizaciones»). Ábralo
        cuando empiece el periodo de reporte y ciérrelo al terminar, o déjele una fecha límite.
      </p>
      <div role="status" aria-live="polite">
        {aviso && (
          <div className="alert alert-success" tabIndex={-1} ref={refAviso}>
            {aviso}
          </div>
        )}
      </div>
      {estado.fase === 'cargando' && <Cargando texto="Cargando el bimestre…" />}
      {estado.fase === 'error' && <ErrorCarga mensaje={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && (
        <FormularioBimestre
          key={`${estado.datos.bimestreAbierto}-${estado.datos.abiertoHasta}`}
          vigencia={estado.datos}
          onCambio={() => setAviso(null)}
          onGuardada={(vigencia) => {
            setDatos(vigencia)
            actualizarVigencia(vigencia)
            setAviso(
              vigencia.bimestreAbierto === null
                ? 'Se cerró el bimestre. Los responsables ya no pueden reportar.'
                : `Listo: ${textoVigencia(vigencia)}.`,
            )
          }}
        />
      )}
    </div>
  )
}

type Accion = { tipo: 'abrir'; datos: DatosVigenciaPai } | { tipo: 'cerrar' }

function textoConfirmacion(vigencia: VigenciaPai, accion: Accion): string {
  const actual = vigencia.bimestreAbierto
  if (accion.tipo === 'cerrar') {
    return `Se cerrará el bimestre ${actual}. Los responsables ya no podrán reportarlo, salvo con una autorización.`
  }
  const nuevo = accion.datos.bimestreAbierto as NumeroBimestre
  const info = infoBimestre(nuevo)
  const hasta = accion.datos.abiertoHasta
    ? `hasta el ${fechaLimite(accion.datos.abiertoHasta, vigencia.anio)} (al terminar ese día, hora de Colombia)`
    : 'sin fecha límite (quedará abierto hasta que lo cierre)'
  if (actual === nuevo) return `Se cambiará la fecha límite del ${info.nombre}: quedará abierto ${hasta}.`
  const cierre = actual ? `Se cerrará el bimestre ${actual} y se` : 'Se'
  return `${cierre} abrirá el ${info.nombre} (${info.meses}) ${hasta}. Los responsables podrán reportar sus indicadores de ese bimestre.`
}

function FormularioBimestre({
  vigencia,
  onGuardada,
  onCambio,
}: {
  vigencia: VigenciaPai
  onGuardada: (v: VigenciaPai) => void
  /** Se llama al empezar otra acción (para quitar el aviso anterior). */
  onCambio: () => void
}) {
  const cliente = useClientePai()
  const id = useId()
  const [bimestre, setBimestre] = useState<NumeroBimestre | null>(vigencia.bimestreAbierto)
  const [fecha, setFecha] = useState(diaColombia(vigencia.abiertoHasta))
  const [errores, setErrores] = useState<{ bimestre?: string; fecha?: string }>({})
  const [accion, setAccion] = useState<Accion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refPrimerBimestre = useRef<HTMLInputElement>(null)
  const refFecha = useRef<HTMLInputElement>(null)
  const refCancelar = useRef<HTMLButtonElement>(null)
  const refError = useRef<HTMLDivElement>(null)
  const hoy = hoyColombia()

  // Si no se pudo guardar, el modal se cierra y el foco va al aviso del error.
  useEffect(() => {
    if (error) refError.current?.focus()
  }, [error])
  const abierto = vigencia.bimestreAbierto

  function pedirApertura(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const encontrados: { bimestre?: string; fecha?: string } = {}
    if (bimestre === null) encontrados.bimestre = 'Elija el bimestre que va a abrir.'
    let abiertoHasta: string | null = null
    if (fecha) {
      abiertoHasta = finDelDiaColombia(fecha)
      if (!abiertoHasta) encontrados.fecha = 'Escriba una fecha válida.'
      else if (fecha < hoy) encontrados.fecha = 'La fecha límite debe ser hoy o una fecha futura.'
    }
    setErrores(encontrados)
    onCambio()
    setError(null)
    if (encontrados.bimestre) {
      refPrimerBimestre.current?.focus()
      return
    }
    if (encontrados.fecha) {
      refFecha.current?.focus()
      return
    }
    setAccion({ tipo: 'abrir', datos: { bimestreAbierto: bimestre, abiertoHasta } })
  }

  async function confirmar() {
    if (!accion) return
    setGuardando(true)
    setError(null)
    const datos: DatosVigenciaPai = accion.tipo === 'abrir' ? accion.datos : { bimestreAbierto: null, abiertoHasta: null }
    try {
      const nueva = await cliente.actualizarVigencia(datos, vigencia.anio)
      setAccion(null)
      setGuardando(false)
      onGuardada(nueva)
    } catch (e) {
      setGuardando(false)
      setAccion(null)
      setError(mensajeDe(e))
    }
  }

  const sinCambios = bimestre === abierto && fecha === diaColombia(vigencia.abiertoHasta)

  return (
    <>
      {error && (
        <div className="alert alert-danger" role="alert" tabIndex={-1} ref={refError}>
          {error}
        </div>
      )}
      <div className="row g-4">
        <div className="col-12 col-lg-5">
          <section className="card card-lg h-100" aria-labelledby={`${id}-estado`}>
            <div className="card-header">
              <h2 className="card-title h5 mb-0" id={`${id}-estado`}>
                Estado actual (PAI {vigencia.anio})
              </h2>
            </div>
            <div className="card-body">
              <p className="pai-estado-bimestre">{textoVigencia(vigencia)}</p>
              {abierto !== null && !vigencia.abiertoAhora && (
                <p className="alert alert-warning">
                  La fecha límite ya pasó: los responsables no pueden reportar. Cambie la fecha o cierre el bimestre.
                </p>
              )}
              {vigencia.actualizadoEn && (
                <p className="form-text">
                  {terminarFrase(
                    `Último cambio: ${formatoFechaHora(vigencia.actualizadoEn)}${vigencia.actualizadoPor ? `, por ${vigencia.actualizadoPor}` : ''}`,
                  )}
                </p>
              )}
              {abierto !== null && (
                <button
                  type="button"
                  className="btn btn-outline-danger mt-2"
                  onClick={() => {
                    onCambio()
                    setError(null)
                    setAccion({ tipo: 'cerrar' })
                  }}
                >
                  Cerrar el bimestre
                </button>
              )}
            </div>
          </section>
        </div>
        <div className="col-12 col-lg-7">
          <section className="card card-lg h-100" aria-labelledby={`${id}-abrir`}>
            <div className="card-header">
              <h2 className="card-title h5 mb-0" id={`${id}-abrir`}>
                {abierto === null ? 'Abrir un bimestre' : 'Cambiar el bimestre o su fecha límite'}
              </h2>
            </div>
            <div className="card-body">
              <form onSubmit={pedirApertura} noValidate>
                <fieldset className="mb-3" aria-describedby={errores.bimestre ? `${id}-bimestre-error` : undefined}>
                  <legend className="form-label">Bimestre</legend>
                  <div className="pai-opciones-bimestre">
                    {BIMESTRES_PAI.map((b, i) => (
                      <div className="form-check" key={b.numero}>
                        <input
                          ref={i === 0 ? refPrimerBimestre : undefined}
                          className="form-check-input"
                          type="radio"
                          name={`${id}-bimestre`}
                          id={`${id}-bimestre-${b.numero}`}
                          checked={bimestre === b.numero}
                          onChange={() => {
                            setBimestre(b.numero)
                            setErrores((previo) => ({ ...previo, bimestre: undefined }))
                          }}
                          aria-invalid={errores.bimestre ? true : undefined}
                        />
                        <label className="form-check-label" htmlFor={`${id}-bimestre-${b.numero}`}>
                          {b.nombre} <span className="pai-tenue">({b.meses})</span>
                          {b.numero === abierto && <span className="tag tag-light-success ms-2">Abierto</span>}
                        </label>
                      </div>
                    ))}
                  </div>
                  {errores.bimestre && (
                    <div className="invalid-feedback d-block" id={`${id}-bimestre-error`}>
                      {errores.bimestre}
                    </div>
                  )}
                </fieldset>
                <div className="mb-3 pai-campo-fecha">
                  <label className="form-label" htmlFor={`${id}-fecha`}>
                    Fecha límite (opcional)
                  </label>
                  <input
                    ref={refFecha}
                    id={`${id}-fecha`}
                    className={`form-control${errores.fecha ? ' is-invalid' : ''}`}
                    type="date"
                    min={hoy}
                    value={fecha}
                    onChange={(e) => {
                      setFecha(e.target.value)
                      setErrores((previo) => ({ ...previo, fecha: undefined }))
                    }}
                    aria-invalid={errores.fecha ? true : undefined}
                    aria-describedby={[errores.fecha ? `${id}-fecha-error` : null, `${id}-fecha-ayuda`]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  {errores.fecha && (
                    <div className="invalid-feedback d-block" id={`${id}-fecha-error`}>
                      {errores.fecha}
                    </div>
                  )}
                  <div className="form-text" id={`${id}-fecha-ayuda`}>
                    El bimestre se cierra solo al terminar ese día (hora de Colombia). Déjela vacía para cerrarlo a mano.
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={sinCambios && abierto !== null}>
                  {abierto === null ? 'Abrir el bimestre' : 'Guardar cambios'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>

      <ModalPai
        abierto={accion !== null}
        rol="alertdialog"
        titulo={accion?.tipo === 'cerrar' ? '¿Cerrar el bimestre?' : '¿Abrir el bimestre?'}
        idDescripcion={`${id}-confirmacion`}
        onCerrar={() => setAccion(null)}
        bloqueado={guardando}
        enfoqueInicial={refCancelar}
        pie={
          <>
            <button
              ref={refCancelar}
              type="button"
              className="btn btn-outline-neutral"
              onClick={() => setAccion(null)}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={accion?.tipo === 'cerrar' ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={() => void confirmar()}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : accion?.tipo === 'cerrar' ? 'Sí, cerrar' : 'Sí, abrir'}
            </button>
          </>
        }
      >
        <p id={`${id}-confirmacion`} className="mb-0">
          {accion ? textoConfirmacion(vigencia, accion) : ''}
        </p>
      </ModalPai>
    </>
  )
}
