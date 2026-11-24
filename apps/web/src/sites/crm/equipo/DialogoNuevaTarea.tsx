/**
 * Diálogo «Nueva tarea» del tablero de una persona con el permiso
 * puedeCrearTareas: se crea una tarea a sí misma (título obligatorio, con
 * contador; descripción y fecha límite opcionales, desde hoy en Bogotá).
 *
 * - apiEquipo.crearTareaPropia: queda de responsable, sin entregable y sin
 *   correo. Al crearla avisa «Tarea creada.» y llama a `alCreada` (el
 *   tablero cierra y recarga).
 * - Un 400 con `campos` pone cada error junto a su campo; un 403 (el líder
 *   quitó el permiso) se explica arriba de los botones.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { esFechaValida, LIMITES_CRM, type NuevaTareaPropiaCrm, type TareaDetalleCrm } from '../api-crm'
import { apiEquipo, ErrorCrmHttp, mensajeDe } from '../datos/clienteCrm'
import { ariaCampo, Campo, Dialogo, hoyBogota, Icono, useAvisar } from '../ui'

type CampoTarea = 'titulo' | 'descripcion' | 'fechaLimite'
type Errores = Partial<Record<CampoTarea, string>>

/** Id del control de cada campo, en el orden del formulario (el primero con error recibe el foco). */
const ID_CAMPO: Readonly<Record<CampoTarea, string>> = {
  titulo: 'eq-nt-titulo',
  descripcion: 'eq-nt-descripcion',
  fechaLimite: 'eq-nt-fecha',
}
const CAMPOS = Object.keys(ID_CAMPO) as CampoTarea[]
const ID_FORMULARIO = 'eq-nt-formulario'
const ID_CONTADOR = 'eq-nt-titulo-contador'
const ID_ERROR_GENERAL = 'eq-nt-error-general'
const AYUDA_DESCRIPCION = 'Opcional. Qué hay que hacer y qué se espera al terminar.'
const SIN_PERMISO = 'El líder ya no le permite crearse tareas. Si lo necesita, pídale que lo active de nuevo en la pantalla Equipo.'

function esCampo(campo: string): campo is CampoTarea {
  return Object.hasOwn(ID_CAMPO, campo)
}

export default function DialogoNuevaTarea({
  personaId,
  alCerrar,
  alCreada,
}: {
  personaId: number
  alCerrar: () => void
  alCreada: (tarea: TareaDetalleCrm) => void
}) {
  const avisar = useAvisar()
  const [hoy] = useState(() => hoyBogota())
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enfocar = useRef<string | null>(null)

  useEffect(() => {
    if (!enfocar.current) return
    document.getElementById(enfocar.current)?.focus()
    enfocar.current = null
  })

  function limpiar(campo: CampoTarea) {
    if (!errores[campo]) return
    const resto = { ...errores }
    delete resto[campo]
    setErrores(resto)
  }

  function mostrarErrores(encontrados: Errores, general: string | null) {
    setErrores(encontrados)
    setErrorGeneral(general)
    const primero = CAMPOS.find((campo) => encontrados[campo])
    enfocar.current = primero ? ID_CAMPO[primero] : general ? ID_ERROR_GENERAL : null
  }

  function validar(): Errores {
    const encontrados: Errores = {}
    if (!titulo.trim()) encontrados.titulo = 'Escriba el título de la tarea.'
    if (fecha && !esFechaValida(fecha)) encontrados.fechaLimite = 'Escriba una fecha válida.'
    else if (fecha && fecha < hoy) encontrados.fechaLimite = 'La fecha límite no puede ser anterior a hoy.'
    return encontrados
  }

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    const encontrados = validar()
    if (Object.keys(encontrados).length > 0) {
      mostrarErrores(encontrados, null)
      return
    }
    const descripcionLimpia = descripcion.trim()
    const datos: NuevaTareaPropiaCrm = {
      titulo: titulo.trim(),
      fechaLimite: fecha || null,
      ...(descripcionLimpia ? { descripcion: descripcionLimpia } : {}),
    }
    setEnviando(true)
    mostrarErrores({}, null)
    try {
      const creada = await apiEquipo.crearTareaPropia(personaId, datos)
      avisar('Tarea creada.')
      alCreada(creada)
    } catch (error) {
      setEnviando(false)
      if (error instanceof ErrorCrmHttp && error.estado === 403) {
        mostrarErrores({}, SIN_PERMISO)
        return
      }
      const propios: Errores = {}
      const otros: string[] = []
      if (error instanceof ErrorCrmHttp && error.campos) {
        for (const [campo, texto] of Object.entries(error.campos)) {
          if (esCampo(campo)) propios[campo] = texto
          else otros.push(texto)
        }
      }
      const hayPropios = Object.keys(propios).length > 0
      mostrarErrores(propios, otros.length > 0 ? otros.join(' ') : hayPropios ? null : mensajeDe(error))
    }
  }

  const ariaTitulo = ariaCampo(ID_CAMPO.titulo, { error: errores.titulo })

  return (
    <Dialogo
      abierto
      titulo="Nueva tarea"
      descripcion="Queda a su nombre, en Pendiente. No se envía ningún correo."
      alCerrar={alCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="crm-boton crm-boton-secundario" disabled={enviando} onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" form={ID_FORMULARIO} className="crm-boton crm-boton-primario" disabled={enviando}>
            <Icono nombre="check" />
            {enviando ? 'Creando…' : 'Crear tarea'}
          </button>
        </>
      }
    >
      <form id={ID_FORMULARIO} className="crm-formulario" noValidate onSubmit={(evento) => void crear(evento)} aria-busy={enviando || undefined}>
        <Campo etiqueta="Título" id={ID_CAMPO.titulo} obligatorio error={errores.titulo}>
          <input
            className="crm-control"
            type="text"
            value={titulo}
            maxLength={LIMITES_CRM.titulo}
            autoComplete="off"
            disabled={enviando}
            onChange={(evento) => {
              setTitulo(evento.target.value)
              limpiar('titulo')
            }}
            {...ariaTitulo}
            aria-describedby={[ariaTitulo['aria-describedby'], ID_CONTADOR].filter(Boolean).join(' ')}
          />
          <p className="crm-eq-contador crm-num" id={ID_CONTADOR} data-cerca={titulo.length >= LIMITES_CRM.titulo - 10 ? '' : undefined}>
            <span aria-hidden="true">
              {titulo.length}/{LIMITES_CRM.titulo}
            </span>
            <span className="crm-sr">
              {titulo.length} de {LIMITES_CRM.titulo} caracteres
            </span>
          </p>
        </Campo>

        <Campo etiqueta="Descripción" id={ID_CAMPO.descripcion} ayuda={AYUDA_DESCRIPCION} error={errores.descripcion}>
          <textarea
            className="crm-control"
            rows={4}
            value={descripcion}
            maxLength={LIMITES_CRM.descripcion}
            disabled={enviando}
            onChange={(evento) => {
              setDescripcion(evento.target.value)
              limpiar('descripcion')
            }}
            {...ariaCampo(ID_CAMPO.descripcion, { ayuda: AYUDA_DESCRIPCION, error: errores.descripcion })}
          />
        </Campo>

        <Campo etiqueta="Fecha límite" id={ID_CAMPO.fechaLimite} error={errores.fechaLimite}>
          <input
            className="crm-control"
            type="date"
            value={fecha}
            min={hoy}
            disabled={enviando}
            onChange={(evento) => {
              setFecha(evento.target.value)
              limpiar('fechaLimite')
            }}
            {...ariaCampo(ID_CAMPO.fechaLimite, { error: errores.fechaLimite })}
          />
        </Campo>

        {errorGeneral ? (
          <p className="crm-campo-error" id={ID_ERROR_GENERAL} role="alert" tabIndex={-1}>
            <Icono nombre="alerta" tamano={16} />
            {errorGeneral}
          </p>
        ) : null}
      </form>
    </Dialogo>
  )
}
