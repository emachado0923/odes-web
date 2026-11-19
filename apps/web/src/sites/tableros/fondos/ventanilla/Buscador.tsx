/**
 * Buscador de la ventanilla de consulta de los fondos.
 *
 * Sin resultado es la entrada de la pantalla: el campo del documento, grande y
 * listo para escribir. Con resultado se vuelve una barra compacta que se queda
 * arriba al desplazarse, para consultar otro documento sin perder el expediente.
 *
 * En el mismo archivo van los dos estados vecinos de la consulta: el esqueleto
 * de la primera carga (CargandoResultado) y el aviso de documento sin
 * beneficios (SinResultados).
 *
 * Datos personales: las consultas recientes llegan por props y viven solo en
 * la memoria de la página; aquí no se guarda nada.
 */
import { type FormEvent, type KeyboardEvent as TeclaReact, useEffect, useId, useRef, useState } from 'react'
import type { ConsultaReciente } from './tipos'
import { formatoDocumento, nombrePropio } from './ficha'
import { useTextosOrigen } from './origen'
import Icono from './iconos'
import './buscador.css'

export interface PropsBuscador {
  documento: string
  alCambiar: (valor: string) => void
  /** Consulta el documento escrito, o el que se pasa (una consulta reciente). */
  alConsultar: (documento?: string) => void
  buscando: boolean
  error: string | null
  /** Consultas de esta sesión (solo en memoria), la más reciente primero. */
  recientes: readonly ConsultaReciente[]
  /** Ya hay un resultado en pantalla: el buscador cede el protagonismo. */
  compacto: boolean
}

/** Como se busca un documento: sin espacios, puntos ni guiones, y en mayúsculas. */
function limpiarDocumento(valor: string): string {
  return valor.replaceAll(/[\s.-]/g, '').toUpperCase()
}

function textoBeneficios(cuantos: number): string {
  if (cuantos <= 0) return 'Sin beneficios'
  return cuantos === 1 ? '1 beneficio' : `${cuantos} beneficios`
}

/** ¿Se está escribiendo en otro control? Ahí la tecla «/» es un carácter más. */
function escribeEnOtroControl(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false
  return destino.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName)
}

export default function Buscador({
  documento,
  alCambiar,
  alConsultar,
  buscando,
  error,
  recientes,
  compacto,
}: PropsBuscador) {
  const textos = useTextosOrigen()
  const id = useId()
  const idCampo = `${id}-doc`
  const idPrevia = `${id}-previa`
  const idPanel = `${id}-recientes`
  const idTituloRecientes = `${id}-recientes-titulo`

  const refRaiz = useRef<HTMLDivElement>(null)
  const refCampo = useRef<HTMLInputElement>(null)
  const refAlternar = useRef<HTMLButtonElement>(null)

  // En la barra compacta las recientes esperan tras un botón, para no estorbar.
  const [recientesAbiertas, setRecientesAbiertas] = useState(false)
  // El aviso de error de la barra compacta cuelga sobre el expediente: se puede cerrar.
  const [errorCerrado, setErrorCerrado] = useState<string | null>(null)

  // Lo abierto o cerrado a mano no sobrevive a un cambio de modo ni a otra consulta:
  // el panel no reaparece solo al volver a la barra, y el aviso cerrado vuelve a
  // salir si la consulta siguiente (la lance quien la lance) falla igual.
  const [previo, setPrevio] = useState({ compacto, buscando })
  if (previo.compacto !== compacto || previo.buscando !== buscando) {
    setPrevio({ compacto, buscando })
    if (previo.compacto !== compacto) setRecientesAbiertas(false)
    if (buscando && !previo.buscando) setErrorCerrado(null)
  }

  const limpio = limpiarDocumento(documento)
  // Una fila por documento: es la llave de la lista y lo que se vuelve a consultar.
  const unicas = recientes.filter(
    (consulta, i) => recientes.findIndex((otra) => otra.documento === consulta.documento) === i,
  )
  const hayRecientes = unicas.length > 0
  const panelAbierto = compacto && hayRecientes && recientesAbiertas
  const mostrarRecientes = hayRecientes && (!compacto || recientesAbiertas)
  // El aviso solo se puede cerrar en la barra: en la entrada siempre se ve.
  const errorVisible = error !== null && error.trim() !== '' && !(compacto && error === errorCerrado)

  // La tecla «/» trae el foco al campo desde cualquier parte de la página.
  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey) return
      if (evento.defaultPrevented || evento.isComposing) return
      if (escribeEnOtroControl(evento.target)) return
      const campo = refCampo.current
      if (!campo) return
      // La página mantiene montada la ventanilla aunque muestre el tablero (la
      // esconde con hidden en un contenedor): oculta, el atajo no es suyo.
      if (campo.closest('[hidden]') !== null) return
      evento.preventDefault()
      campo.focus()
      campo.select()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [])

  // El panel de recientes se cierra al salir de él: clic o foco fuera, o Escape.
  useEffect(() => {
    if (!panelAbierto) return undefined
    function estaFuera(destino: EventTarget | null): boolean {
      const raiz = refRaiz.current
      return raiz !== null && destino instanceof Node && !raiz.contains(destino)
    }
    function alSalir(evento: Event) {
      if (estaFuera(evento.target)) setRecientesAbiertas(false)
    }
    function alEscape(evento: KeyboardEvent) {
      // Dentro del campo, Escape ya tiene oficio: limpiarlo.
      if (evento.key !== 'Escape' || evento.target === refCampo.current) return
      setRecientesAbiertas(false)
      refAlternar.current?.focus()
    }
    document.addEventListener('pointerdown', alSalir)
    document.addEventListener('focusin', alSalir)
    document.addEventListener('keydown', alEscape)
    return () => {
      document.removeEventListener('pointerdown', alSalir)
      document.removeEventListener('focusin', alSalir)
      document.removeEventListener('keydown', alEscape)
    }
  }, [panelAbierto])

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErrorCerrado(null)
    setRecientesAbiertas(false)
    alConsultar()
  }

  function consultarReciente(reciente: string) {
    setErrorCerrado(null)
    setRecientesAbiertas(false)
    // En la barra el panel se cierra y su botón desaparece: el foco vuelve a «Recientes».
    if (compacto) refAlternar.current?.focus()
    // El campo queda con el documento que se está viendo.
    alCambiar(reciente)
    alConsultar(reciente)
  }

  function cerrarAviso() {
    setErrorCerrado(error)
    // El botón de cerrar desaparece con el aviso: el foco no se queda en el aire.
    refCampo.current?.focus()
  }

  function borrar() {
    alCambiar('')
    refCampo.current?.focus()
  }

  function alTeclaCampo(evento: TeclaReact<HTMLInputElement>) {
    if (evento.key !== 'Escape') return
    if (documento !== '') {
      evento.preventDefault()
      alCambiar('')
    } else if (panelAbierto) {
      // Con el campo ya vacío, Escape cierra el panel de recientes.
      evento.preventDefault()
      setRecientesAbiertas(false)
    }
  }

  // El atajo «/» funciona igual, pero no se anuncia en pantalla (pedido del 18-nov-2026).
  const descritoPor = limpio ? idPrevia : ''

  return (
    <div ref={refRaiz} className={`vcb ${compacto ? 'vcb--compacto' : 'vcb--entrada'}`}>
      {!compacto && (
        <div className="vcb-intro">
          <h2 className="vcb-titulo">Consulte el expediente de un beneficiario</h2>
          <div className="vcb-bajada">
            Escriba el documento de la persona para ver sus beneficios, el estado de cada uno, cuánto se le ha
            girado y su recorrido periodo por periodo.
          </div>
        </div>
      )}

      <form className="vcb-form" onSubmit={enviar} role="search" aria-busy={buscando}>
        <label className={compacto ? 'vc-sr' : 'vcb-etiqueta'} htmlFor={idCampo}>
          Número de documento
        </label>

        <div className="vcb-caja">
          <Icono nombre="buscar" tamano={compacto ? 18 : 22} className="vcb-lupa" />
          <input
            ref={refCampo}
            id={idCampo}
            className="vcb-campo"
            type="text"
            value={documento}
            onChange={(evento) => alCambiar(evento.target.value)}
            onKeyDown={alTeclaCampo}
            placeholder={compacto ? 'Otro documento' : undefined}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={40}
            aria-describedby={descritoPor || undefined}
            aria-keyshortcuts="/"
            // La ventanilla se abre para escribir un documento: el campo recibe el foco.
            autoFocus
          />
          {documento !== '' ? (
            <button type="button" className="vcb-borrar" aria-label="Borrar el documento" onClick={borrar}>
              <Icono nombre="cerrar" tamano={16} />
            </button>
          ) : (
            <kbd className="vcb-tecla vcb-tecla--caja" aria-hidden="true">
              /
            </kbd>
          )}
        </div>

        <button type="submit" className="vcb-consultar" disabled={buscando || limpio === ''}>
          {buscando ? 'Consultando…' : 'Consultar'}
        </button>

        <div className="vcb-apoyo">
          {limpio !== '' && (
            <span id={idPrevia} className="vcb-previa">
              Se consultará <span className="vc-num vcb-previa-doc">{formatoDocumento(limpio)}</span>
            </span>
          )}
        </div>

        {compacto && hayRecientes && (
          <button
            ref={refAlternar}
            type="button"
            className="vcb-alternar"
            aria-expanded={recientesAbiertas}
            aria-controls={panelAbierto ? idPanel : undefined}
            onClick={() => setRecientesAbiertas((abiertas) => !abiertas)}
          >
            <Icono nombre="reloj" tamano={16} />
            <span>Recientes</span>
            <span className="vc-num vcb-conteo" aria-hidden="true">
              {unicas.length}
            </span>
            <span className="vc-sr">, {unicas.length} en esta sesión</span>
            <Icono nombre="chevron" tamano={14} className="vcb-alternar-chevron" />
          </button>
        )}
      </form>

      {(errorVisible || mostrarRecientes) && (
        <div className="vcb-bajo">
          {errorVisible && (
            <div className="vcb-error" role="alert">
              <Icono nombre="alerta" tamano={20} className="vcb-error-icono" />
              <div className="vcb-error-texto">
                <div className="vcb-error-que">{error}</div>
                <div className="vcb-error-hacer">Revise el número y la conexión, y consulte de nuevo.</div>
              </div>
              {compacto && (
                <button
                  type="button"
                  className="vcb-error-cerrar"
                  aria-label="Cerrar el aviso"
                  onClick={cerrarAviso}
                >
                  <Icono nombre="cerrar" tamano={16} />
                </button>
              )}
            </div>
          )}

          {mostrarRecientes && (
            <div id={idPanel} className="vcb-recientes">
              <div className="vcb-recientes-cabeza">
                <span id={idTituloRecientes} className="vcb-recientes-titulo">
                  Consultas de esta sesión
                </span>{' '}
                <span className="vcb-recientes-nota">Solo se conservan mientras esta página esté abierta.</span>
              </div>
              <ul className="vcb-recientes-lista" aria-labelledby={idTituloRecientes}>
                {unicas.map((consulta) => (
                  <li key={consulta.documento} className="vcb-recientes-item">
                    <button
                      type="button"
                      className="vcb-reciente"
                      disabled={buscando}
                      onClick={() => consultarReciente(consulta.documento)}
                    >
                      <span className="vcb-reciente-nombre">
                        {consulta.nombre?.trim() ? nombrePropio(consulta.nombre) : 'Sin nombre'}
                      </span>{' '}
                      <span className="vcb-reciente-dato">
                        <span className="vc-num">{formatoDocumento(consulta.documento)}</span>{' '}
                        <span>{textoBeneficios(consulta.beneficios)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!compacto && (
        <ul className="vcb-avisos">
          <li className="vcb-aviso">
            <Icono nombre="calendario" tamano={16} className="vcb-aviso-icono" />
            <span>{textos.aviso}</span>
          </li>
          <li className="vcb-aviso">
            <Icono nombre="lista" tamano={16} className="vcb-aviso-icono" />
            <span>Cada consulta queda registrada.</span>
          </li>
        </ul>
      )}
    </div>
  )
}

/** Celdas de la pista de periodos del esqueleto (llaves fijas: no son datos). */
const PISTA_ESQUELETO = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] as const

/**
 * Mientras llega la respuesta de la primera consulta: anticipa la forma del
 * expediente (la persona y un beneficio con su recorrido por periodos).
 */
export function CargandoResultado() {
  return (
    <div className="vcb-cargando" role="status">
      <span className="vc-sr">Consultando…</span>
      <div className="vcb-esq-persona" aria-hidden="true">
        <span className="vcb-hueso vcb-hueso--nombre" />
        <span className="vcb-hueso vcb-hueso--linea" />
        <div className="vcb-esq-fila">
          <span className="vcb-hueso vcb-hueso--corto" />
          <span className="vcb-hueso vcb-hueso--corto" />
          <span className="vcb-hueso vcb-hueso--corto" />
        </div>
      </div>
      <div className="vcb-esq-ficha" aria-hidden="true">
        <div className="vcb-esq-cabeza">
          <span className="vcb-hueso vcb-hueso--titulo" />
          <span className="vcb-hueso vcb-hueso--chip" />
        </div>
        <div className="vcb-esq-pista">
          {PISTA_ESQUELETO.map((celda) => (
            <span key={celda} className="vcb-hueso vcb-hueso--periodo" />
          ))}
        </div>
        <div className="vcb-esq-fila">
          <span className="vcb-hueso vcb-hueso--corto" />
          <span className="vcb-hueso vcb-hueso--linea" />
          <span className="vcb-hueso vcb-hueso--corto" />
        </div>
      </div>
    </div>
  )
}

/** El documento no tiene beneficios registrados: se dice y se orienta qué revisar. */
export function SinResultados({ documento }: { documento: string }) {
  const textos = useTextosOrigen()
  const limpio = limpiarDocumento(documento)
  return (
    <div className="vcb-vacio" role="status">
      <div className="vcb-vacio-titulo">
        {limpio !== '' ? (
          <>
            No hay beneficios registrados con el documento{' '}
            <span className="vc-num">{formatoDocumento(limpio)}</span>
          </>
        ) : (
          'No hay beneficios registrados con ese documento'
        )}
      </div>
      <div className="vcb-vacio-bajada">Antes de darlo por definitivo, revise lo siguiente:</div>
      <ul className="vcb-vacio-lista">
        <li className="vcb-vacio-item">Que el número esté completo, sin dígitos de más ni de menos.</li>
        <li className="vcb-vacio-item">
          Si la persona se inscribió con tarjeta de identidad, consulte también ese número.
        </li>
        <li className="vcb-vacio-item">
          {textos.sinResultados}
        </li>
      </ul>
    </div>
  )
}
