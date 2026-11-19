/**
 * Buscador y filtros (formulario role="search"), como en el bloque v4.2:
 * buscador difuso, botón "Filtros" (solo en celular), los tres filtros de
 * casillas (Categoría, Año y Palabra clave), "Ordenar por", el conteo en una
 * región aria-live y "Limpiar filtros". Solo un panel abierto a la vez.
 *
 * Debajo de los filtros, siempre a la vista (también en celular con los
 * filtros plegados), van las palabras clave seleccionadas, cada una con su
 * botón para quitarla (comentarios del Observatorio, 12 de noviembre de 2026).
 * Al quitar una, el foco pasa a la siguiente o, si era la última, al filtro
 * "Palabra clave".
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type Ref } from 'react'
import { FACETAS, ORDENES, type NombreFaceta, type Orden, type Seleccion } from '../filtros/estado'
import type { OpcionesFacetas } from '../filtros/facetas'
import type { Conteo } from '../filtros/textos'
import FacetaCasillas from './FacetaCasillas'
import Icono from './Icono'

interface Props {
  q: string
  seleccion: Seleccion
  orden: Orden
  opciones: OpcionesFacetas
  /** Lo que muestra (y anuncia) el conteo. */
  conteo: Conteo
  filtrando: boolean
  activos: number
  refBuscar: Ref<HTMLInputElement>
  onQ: (q: string) => void
  onSeleccion: (faceta: NombreFaceta, valores: string[]) => void
  onOrden: (orden: Orden) => void
  onEnviar: () => void
  onLimpiar: () => void
}

function TextoConteo({ coinciden, total, filtrando }: Conteo) {
  if (!coinciden) return 'Ningún documento coincide con la búsqueda.'
  const palabra = total === 1 ? 'documento' : 'documentos'
  if (!filtrando) {
    return (
      <>
        <span className="rp-num">{total}</span> {palabra} en el repositorio
      </>
    )
  }
  return (
    <>
      <span className="rp-num">{coinciden}</span> de {total} {palabra} {coinciden === 1 ? 'coincide' : 'coinciden'}
    </>
  )
}

export default function PanelFiltros({
  q,
  seleccion,
  orden,
  opciones,
  conteo,
  filtrando,
  activos,
  refBuscar,
  onQ,
  onSeleccion,
  onOrden,
  onEnviar,
  onLimpiar,
}: Props) {
  const [abierta, setAbierta] = useState<NombreFaceta | null>(null)
  const [verFiltros, setVerFiltros] = useState(false)
  const listaActivas = useRef<HTMLUListElement>(null)
  /** Posición de la palabra quitada: el foco pasa a la que quede en ese lugar. */
  const enfocarActiva = useRef<number | null>(null)

  const textoClave = useMemo(() => new Map(opciones.clave.map((o) => [o.valor, o.texto])), [opciones.clave])
  const activas = seleccion.clave

  useEffect(() => {
    const posicion = enfocarActiva.current
    if (posicion === null) return
    enfocarActiva.current = null
    const botones = listaActivas.current?.querySelectorAll('button')
    if (botones?.length) {
      botones[Math.min(posicion, botones.length - 1)].focus()
      return
    }
    // Sin palabras: al filtro "Palabra clave" o, si está plegado (celular), al buscador.
    const filtro = document.getElementById('rp-clave-boton')
    ;(filtro?.offsetParent ? filtro : document.getElementById('rp-q'))?.focus()
  }, [activas])

  function quitarClave(valor: string) {
    enfocarActiva.current = activas.indexOf(valor)
    onSeleccion(
      'clave',
      activas.filter((v) => v !== valor),
    )
  }

  const abrir = useCallback((nombre: NombreFaceta) => setAbierta(nombre), [])
  const cerrar = useCallback((nombre: NombreFaceta) => setAbierta((actual) => (actual === nombre ? null : actual)), [])

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    onEnviar()
  }

  function limpiar() {
    setAbierta(null)
    onLimpiar()
  }

  function alternarFiltros() {
    setVerFiltros((v) => !v)
    if (verFiltros) setAbierta(null)
  }

  return (
    <form
      className={verFiltros ? 'rp-filtros rp-abierto' : 'rp-filtros'}
      role="search"
      aria-label="Buscar y filtrar documentos"
      autoComplete="off"
      onSubmit={enviar}
    >
      <div className="rp-campo rp-campo-buscar">
        <label className="rp-etiqueta" htmlFor="rp-q">
          Buscar
        </label>
        <div className="rp-fila-buscar">
          <div className="rp-buscar">
            <Icono nombre="buscar" />
            <input
              ref={refBuscar}
              className="rp-entrada"
              id="rp-q"
              type="search"
              placeholder="Título, tema o palabra clave"
              autoComplete="off"
              spellCheck={false}
              value={q}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onQ(e.target.value)}
            />
          </div>
          {/* Solo en celular: muestra u oculta los demás filtros. */}
          <button
            type="button"
            className="rp-ver-filtros"
            aria-expanded={verFiltros}
            aria-controls="rp-filtros-extra"
            onClick={alternarFiltros}
          >
            <Icono nombre="filtros" />
            Filtros
            <span className="rp-filtros-activos">{activos ? ` (${activos})` : ''}</span>
            <Icono nombre="flecha" className="rp-flecha" />
          </button>
        </div>
      </div>
      <div className="rp-extra" id="rp-filtros-extra">
        {FACETAS.map((nombre) => (
          <FacetaCasillas
            key={nombre}
            nombre={nombre}
            opciones={opciones[nombre]}
            seleccion={seleccion[nombre]}
            abierta={abierta === nombre}
            onAbrir={abrir}
            onCerrar={cerrar}
            onCambiar={onSeleccion}
            conTotal={nombre !== 'clave'}
          />
        ))}
        <div className="rp-campo rp-campo-orden">
          <label className="rp-etiqueta" htmlFor="rp-orden">
            Ordenar por
          </label>
          <div className="rp-select">
            <select id="rp-orden" value={orden} onChange={(e) => onOrden(e.target.value as Orden)}>
              {ORDENES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
            <Icono nombre="flecha" />
          </div>
        </div>
      </div>
      {activas.length > 0 && (
        <div className="rp-activas">
          <p className="rp-activas-titulo" id="rp-activas-titulo">
            Palabras clave seleccionadas
          </p>
          <ul className="rp-activas-lista" ref={listaActivas} aria-labelledby="rp-activas-titulo">
            {activas.map((valor) => {
              const texto = textoClave.get(valor) ?? valor
              return (
                <li key={valor}>
                  <button
                    type="button"
                    className="rp-activa"
                    aria-label={`Quitar la palabra clave «${texto}»`}
                    onClick={() => quitarClave(valor)}
                  >
                    <span>{texto}</span>
                    <Icono nombre="cerrar" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div className="rp-estado">
        <p className="rp-conteo" role="status" aria-live="polite" aria-atomic="true">
          <TextoConteo {...conteo} />
        </p>
        <button type="button" className="rp-texto-boton rp-limpiar" hidden={!filtrando} onClick={limpiar}>
          <Icono nombre="cerrar" />
          Limpiar filtros
        </button>
      </div>
    </form>
  )
}
