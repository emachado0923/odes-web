/**
 * Buscador, filtros y tarjetas del repositorio (la parte con datos de la
 * página pública). Recibe el listado ya cargado.
 *
 * - Filtra y ordena en el navegador con el mismo motor que el bloque v4.2.
 * - Muestra las tarjetas de 12 en 12; "Mostrar 12 más" pasa el foco al
 *   título de la primera tarjeta nueva.
 * - El conteo se anuncia al momento, salvo mientras se escribe en el
 *   buscador (espera 400 ms, como el bloque, para no anunciar cada letra).
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentoPublico, ListadoPublico } from '../api-repositorio'
import { indexar } from '../busqueda/indice'
import { idTituloDocumento } from '../datos/presentacion'
import { alternar, seleccionVacia, type EstadoFiltros, type NombreFaceta, type Orden } from '../filtros/estado'
import { construirFacetas } from '../filtros/facetas'
import { filtrar } from '../filtros/filtrar'
import { textoSeMuestran, type Conteo } from '../filtros/textos'
import { useEstadoUrl } from '../filtros/useEstadoUrl'
import Icono from './Icono'
import PanelFiltros from './PanelFiltros'
import TarjetaDocumento from './TarjetaDocumento'

export const POR_PAGINA = 12
const PAUSA_CONTEO = 400

export default function Explorador({ listado }: { listado: ListadoPublico }) {
  const indice = useMemo(() => indexar(listado.documentos), [listado])
  const opciones = useMemo(() => construirFacetas(indice, listado.categorias), [indice, listado])
  const existentes = useMemo(() => {
    const valores = (f: NombreFaceta): ReadonlySet<string> => new Set(opciones[f].map((o) => o.valor))
    return { categoria: valores('categoria'), anio: valores('anio'), clave: valores('clave') }
  }, [opciones])
  const [estado, setEstado] = useEstadoUrl(existentes)
  const total = indice.length

  // Mientras se escribe, el filtrado puede ir un paso atrás del campo (sin trabar la escritura).
  const qDiferida = useDeferredValue(estado.q)
  const resultado = useMemo(
    () => filtrar(indice, { q: qDiferida, seleccion: estado.seleccion, orden: estado.orden }),
    [indice, qDiferida, estado.seleccion, estado.orden],
  )
  const coinciden = resultado.coinciden

  // Paginación: vuelve a 12 cada vez que cambia el resultado (búsqueda, filtros u orden).
  const [pagina, setPagina] = useState({ resultado, limite: POR_PAGINA })
  let limite = pagina.limite
  if (pagina.resultado !== resultado) {
    limite = POR_PAGINA
    setPagina({ resultado, limite })
  }
  const mostradas = Math.min(limite, coinciden.length)
  const restantes = coinciden.length - mostradas

  // Conteo anunciado (región aria-live).
  const nCoinciden = coinciden.length
  const filtrando = resultado.filtrando
  const [conteo, setConteo] = useState<Conteo>({ coinciden: nCoinciden, total, filtrando })
  const anunciarYa = useRef(true)
  useEffect(() => {
    const siguiente: Conteo = { coinciden: nCoinciden, total, filtrando }
    if (anunciarYa.current) {
      setConteo(siguiente)
      return
    }
    const espera = window.setTimeout(() => setConteo(siguiente), PAUSA_CONTEO)
    return () => window.clearTimeout(espera)
  }, [nCoinciden, total, filtrando])

  const [aviso, setAviso] = useState('')
  const refBuscar = useRef<HTMLInputElement>(null)
  const enfocar = useRef<string | null>(null)

  // Después de "Mostrar más", el foco pasa al título de la primera tarjeta nueva
  // (en cuanto exista: un efecto pendiente de un render anterior puede correr antes).
  useEffect(() => {
    if (!enfocar.current) return
    const titulo = document.getElementById(enfocar.current)
    if (!titulo) return
    enfocar.current = null
    titulo.focus()
  })

  /** Cambia el estado; `inmediato` = anunciar el conteo al momento (no mientras se escribe). */
  const cambiar = useCallback(
    (actualizar: (e: EstadoFiltros) => EstadoFiltros, inmediato = true) => {
      anunciarYa.current = inmediato
      enfocar.current = null
      setEstado(actualizar)
    },
    [setEstado],
  )

  const onQ = (q: string) => cambiar((e) => ({ ...e, q }), false)
  const onSeleccion = (faceta: NombreFaceta, valores: string[]) =>
    cambiar((e) => ({ ...e, seleccion: { ...e.seleccion, [faceta]: valores } }))
  const onOrden = (orden: Orden) => cambiar((e) => ({ ...e, orden }))
  const onEnviar = () => {
    anunciarYa.current = true
    setConteo({ coinciden: nCoinciden, total, filtrando })
  }
  const limpiar = () => {
    cambiar((e) => ({ q: '', seleccion: seleccionVacia(), orden: e.orden }))
    refBuscar.current?.focus()
  }
  const onClave = useCallback(
    (valor: string) => cambiar((e) => ({ ...e, seleccion: { ...e.seleccion, clave: alternar(e.seleccion.clave, valor) } })),
    [cambiar],
  )
  const onDescargar = useCallback((d: DocumentoPublico) => setAviso(`Descargando «${d.titulo.trim()}».`), [])

  function mostrarMas() {
    const antes = limite
    const nuevo = limite + POR_PAGINA
    setPagina({ resultado, limite: nuevo })
    const primera = coinciden[antes]
    if (primera) enfocar.current = idTituloDocumento(primera.d.doc.id)
    setAviso(textoSeMuestran(Math.min(nuevo, coinciden.length), coinciden.length))
  }

  const clavesActivas = useMemo(() => new Set(estado.seleccion.clave), [estado.seleccion.clave])

  return (
    <>
      <PanelFiltros
        q={estado.q}
        seleccion={estado.seleccion}
        orden={estado.orden}
        opciones={opciones}
        conteo={conteo}
        filtrando={filtrando}
        activos={resultado.activos}
        refBuscar={refBuscar}
        onQ={onQ}
        onSeleccion={onSeleccion}
        onOrden={onOrden}
        onEnviar={onEnviar}
        onLimpiar={limpiar}
      />

      <ul className="rp-lista" aria-label="Documentos del repositorio" hidden={!coinciden.length}>
        {coinciden.slice(0, mostradas).map(({ d }) => (
          <li key={d.doc.id} className="rp-item">
            <TarjetaDocumento
              documento={d.doc}
              consulta={resultado.consulta}
              clavesActivas={clavesActivas}
              onClave={onClave}
              onDescargar={onDescargar}
            />
          </li>
        ))}
      </ul>

      <div className="rp-mas" hidden={restantes <= 0}>
        <p className="rp-mas-texto">{`Viendo ${mostradas} de ${coinciden.length}`}</p>
        <button type="button" className="rp-boton rp-boton-borde rp-mas-boton" onClick={mostrarMas}>
          {`Mostrar ${Math.min(POR_PAGINA, restantes)} más`}
          <Icono nombre="flecha" />
        </button>
      </div>

      <div className="rp-vacio" hidden={coinciden.length > 0}>
        <Icono nombre="buscar" />
        <p className="rp-vacio-titulo">No encontramos documentos con esos criterios</p>
        <p className="rp-vacio-texto">Prueba con otra palabra o quita alguno de los filtros.</p>
        <button type="button" className="rp-texto-boton rp-limpiar" onClick={limpiar}>
          <Icono nombre="cerrar" />
          Limpiar filtros
        </button>
      </div>

      {/* Avisos para lectores de pantalla (descargas, "Mostrar más"). */}
      <p className="rp-oculto rp-aviso" role="status" aria-live="polite" aria-atomic="true">
        {aviso}
      </p>
    </>
  )
}
