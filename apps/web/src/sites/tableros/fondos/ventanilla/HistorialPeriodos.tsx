/**
 * Recorrido por periodo: el camino de un beneficio dibujado como una línea de
 * transporte. Cada periodo es una parada del color de su estado, agrupadas por
 * año; sobre la parada sube una barra con lo girado ese periodo. Al elegir una
 * parada (clic, flechas, o desde la tabla) se ve su detalle debajo de la línea.
 * La tabla completa queda tras un botón para quien necesita todas las cifras.
 *
 * La ficha es genérica: las columnas se buscan por nombre y cualquiera puede
 * faltar. Sin columna «Periodo» se muestra solo la tabla; con un solo periodo
 * (frecuente en Enlaza Mundos) se muestra su detalle sin dibujar la línea.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import ChipEstado from './ChipEstado'
import Icono from './iconos'
import { CATEGORIAS_ESTADO, COLOR_ESTADO, estadoLegible, type CategoriaEstado } from './estados'
import {
  aNumero,
  campo,
  indiceColumna,
  oracionLegible,
  partirPeriodo,
  pesos,
  resumenBeneficio,
  tablaHistorial,
  type PeriodoBeneficio,
} from './ficha'
import type { FichaFondos, Tabla } from './tipos'
import './historial.css'

export interface PropsHistorialPeriodos {
  ficha: FichaFondos
}

/** Posición de las columnas con trato propio; -1 si la tabla no la trae. */
interface ColumnasClave {
  periodo: number
  estado: number
  motivo: number
  monto: number
}

interface Parada {
  clave: string
  indice: number
  parte: string
  datos: PeriodoBeneficio
}

interface GrupoAnio {
  clave: string
  rotulo: string
  paradas: Parada[]
}

/** Una fila de la tabla y, si corresponde a un periodo del recorrido, cuál. */
interface Renglon {
  clave: string
  fila: string[]
  indice: number | null
}

function celda(fila: string[], i: number): string {
  return i >= 0 ? (fila[i] ?? '').trim() : ''
}

/** Color pleno y tono oscuro de la categoría, como variables para la hoja. */
function tintes(categoria: CategoriaEstado, alto?: number): CSSProperties {
  const { color, texto } = COLOR_ESTADO[categoria]
  const variables: Record<string, string | number> = { '--c': color, '--t': texto }
  if (alto !== undefined) variables['--h'] = alto
  return variables as CSSProperties
}

/** «MATRICULA Y SOSTENIMIENTO» → «Matrícula y sostenimiento», con tildes y siglas; las cifras y lo vacío quedan como vienen. */
function legible(valor: string): string {
  if (valor === '' || aNumero(valor) !== null) return valor
  return oracionLegible(valor)
}

function enMinuscula(texto: string): string {
  return texto.charAt(0).toLocaleLowerCase('es-CO') + texto.slice(1)
}

function periodoEnPalabras(texto: string): string {
  const partes = partirPeriodo(texto)
  if (!partes) return ''
  if (partes.parte === 1) return `Primer semestre de ${partes.anio}`
  if (partes.parte === 2) return `Segundo semestre de ${partes.anio}`
  // Solo el «-3» es intersemestral; otra numeración no se interpreta.
  if (partes.parte === 3) return `Intersemestral de ${partes.anio}`
  return ''
}

function nombreParada(datos: PeriodoBeneficio, conMonto: boolean): string {
  const base = `${datos.periodo}, ${estadoLegible(datos.estado)}`
  if (!conMonto) return base
  return datos.monto !== null && datos.monto > 0 ? `${base}, giro de ${pesos(datos.monto)}` : `${base}, sin giro`
}

/** Paradas agrupadas por año consecutivo; la clave no depende de la posición. */
function agrupar(periodos: PeriodoBeneficio[]): GrupoAnio[] {
  const vistos = new Map<string, number>()
  const grupos: GrupoAnio[] = []
  periodos.forEach((datos, indice) => {
    const veces = (vistos.get(datos.periodo) ?? 0) + 1
    vistos.set(datos.periodo, veces)
    const partes = partirPeriodo(datos.periodo)
    const rotulo = partes ? String(partes.anio) : datos.periodo
    const parada: Parada = {
      clave: `${datos.periodo}#${veces}`,
      indice,
      parte: partes ? String(partes.parte) : '',
      datos,
    }
    const anterior = grupos.at(-1)
    if (partes && anterior && anterior.rotulo === rotulo) anterior.paradas.push(parada)
    else grupos.push({ clave: parada.clave, rotulo, paradas: [parada] })
  })
  return grupos
}

/** Filas de la tabla en el orden del recorrido cuando calzan una a una; si no, como vienen. */
function enRenglones(filas: string[][], periodos: PeriodoBeneficio[], conRecorrido: boolean): Renglon[] {
  const vistos = new Map<string, number>()
  const conClave = (fila: string[], indice: number | null, base: string): Renglon => {
    const veces = (vistos.get(base) ?? 0) + 1
    vistos.set(base, veces)
    return { clave: `${base}#${veces}`, fila, indice }
  }
  if (conRecorrido && periodos.length === filas.length) {
    return periodos.map((datos, indice) => conClave(datos.fila, indice, datos.periodo))
  }
  return filas.map((fila) => {
    const encontrado = conRecorrido ? periodos.findIndex((datos) => datos.fila === fila) : -1
    return conClave(fila, encontrado >= 0 ? encontrado : null, fila.join('|'))
  })
}

/** El recorrido dicho en palabras, para leerlo sin mirar la línea. */
function fraseResumen(
  total: number,
  primero: string | null,
  ultimo: string | null,
  presentes: CategoriaEstado[],
  conteo: Map<CategoriaEstado, number>,
): string {
  if (total === 1) return primero ? `Un solo periodo, ${primero}.` : 'Un solo periodo.'
  const rango = primero && ultimo && primero !== ultimo ? `, de ${primero} a ${ultimo}` : ''
  const orden = presentes
    .map((categoria) => ({ categoria, veces: conteo.get(categoria) ?? 0 }))
    .toSorted((a, b) => b.veces - a.veces)
  const [mayor, segunda] = orden
  if (!mayor) return `${total} periodos${rango}.`
  if (!segunda) return `${total} periodos${rango}. ${mayor.categoria} en todos.`
  return `${total} periodos${rango}. ${mayor.categoria} en ${mayor.veces} y ${enMinuscula(segunda.categoria)} en ${segunda.veces}.`
}

/** Lleva el marco de selección hasta la parada elegida, midiendo sobre la página. Dice si pudo colocarlo. */
function colocarCursor(pista: HTMLElement, cursor: HTMLElement, animar: boolean): boolean {
  const boton = pista.querySelector<HTMLElement>('.vch-parada[aria-pressed="true"]')
  if (!boton) return false
  const marco = pista.getBoundingClientRect()
  const caja = boton.getBoundingClientRect()
  // Con la ficha plegada no hay medidas: se coloca cuando vuelva a tener tamaño.
  if (caja.width === 0) return false
  if (!animar) cursor.style.transition = 'none'
  cursor.style.width = `${caja.width}px`
  cursor.style.height = `${caja.height}px`
  cursor.style.transform = `translate(${caja.left - marco.left}px, ${caja.top - marco.top}px)`
  cursor.style.opacity = '1'
  if (!animar) {
    // Se fuerza el cálculo de estilos para que el salto no se anime al devolver la transición.
    cursor.getBoundingClientRect()
    cursor.style.transition = ''
  }
  return true
}

/**
 * Deja la fila a la vista dentro del marco de la tabla moviendo solo el desplazamiento
 * del marco (nunca el de la página), y descontando el encabezado y el pie pegados.
 */
function traerFilaALaVista(marco: HTMLElement, fila: HTMLElement): void {
  const caja = marco.getBoundingClientRect()
  const cajaFila = fila.getBoundingClientRect()
  // Sin medidas (marco oculto) no hay nada que ajustar.
  if (caja.height === 0 || cajaFila.height === 0) return
  const cabeza = marco.querySelector('thead')?.getBoundingClientRect().height ?? 0
  const pie = marco.querySelector('tfoot')?.getBoundingClientRect().height ?? 0
  const techo = caja.top + marco.clientTop + cabeza
  const suelo = caja.top + marco.clientTop + (marco.clientHeight || caja.height) - pie
  if (cajaFila.top < techo) {
    marco.scrollTop -= techo - cajaFila.top
  } else if (cajaFila.bottom > suelo) {
    // Si la fila no cabe entera, manda su borde de arriba.
    marco.scrollTop += Math.min(cajaFila.bottom - suelo, cajaFila.top - techo)
  }
}

interface PropsPista {
  grupos: GrupoAnio[]
  total: number
  indice: number
  resaltada: CategoriaEstado | null
  maximo: number
  conMonto: boolean
  alElegir: (destino: number) => void
}

/** La línea con sus paradas. Foco itinerante: solo la parada elegida entra en el orden de tabulación. */
function Pista({ grupos, total, indice, resaltada, maximo, conMonto, alElegir }: PropsPista) {
  const pistaRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLSpanElement>(null)
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  const colocado = useRef(false)

  // El marco se desliza a la parada elegida; la primera vez aparece sin recorrer la pista.
  useLayoutEffect(() => {
    const pista = pistaRef.current
    const cursor = cursorRef.current
    if (!pista || !cursor) return
    // Mientras no haya podido medirse (ficha plegada) sigue contando como primera vez.
    if (colocarCursor(pista, cursor, colocado.current)) colocado.current = true
  }, [indice, total])

  // Si cambia el ancho (o la ficha se despliega) las paradas se reacomodan: se recoloca sin animar.
  useEffect(() => {
    const pista = pistaRef.current
    const cursor = cursorRef.current
    if (!pista || !cursor || typeof ResizeObserver === 'undefined') return undefined
    const observador = new ResizeObserver(() => {
      if (colocarCursor(pista, cursor, false)) colocado.current = true
    })
    observador.observe(pista)
    return () => observador.disconnect()
  }, [])

  function alTeclear(evento: KeyboardEvent<HTMLButtonElement>) {
    let destino: number | null = null
    if (evento.key === 'ArrowRight') destino = Math.min(total - 1, indice + 1)
    else if (evento.key === 'ArrowLeft') destino = Math.max(0, indice - 1)
    else if (evento.key === 'Home') destino = 0
    else if (evento.key === 'End') destino = total - 1
    if (destino === null) return
    evento.preventDefault()
    alElegir(destino)
    botones.current[destino]?.focus()
  }

  return (
    <div
      className="vch-pista"
      ref={pistaRef}
      role="toolbar"
      aria-label="Periodos del beneficio, del primero al último"
    >
      <span className="vch-cursor" ref={cursorRef} aria-hidden="true" />
      {grupos.map((grupo) => (
        <div className="vch-anio" key={grupo.clave}>
          <div className="vch-anio-paradas">
            {grupo.paradas.map((parada) => {
              const { datos } = parada
              const elegida = parada.indice === indice
              const nombre = nombreParada(datos, conMonto)
              // La barra más baja conserva algo de altura para que un giro pequeño no se confunda con ninguno.
              const alto =
                datos.monto !== null && datos.monto > 0 && maximo > 0
                  ? Math.max(8, Math.round((datos.monto / maximo) * 100))
                  : 0
              const clases = [
                'vch-parada',
                parada.indice === 0 ? 'vch-parada--primera' : '',
                parada.indice === total - 1 ? 'vch-parada--ultima' : '',
                resaltada !== null && datos.categoria !== resaltada ? 'vch-parada--tenue' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={parada.clave}
                  type="button"
                  className={clases}
                  style={tintes(datos.categoria, alto)}
                  aria-label={nombre}
                  title={nombre}
                  aria-pressed={elegida}
                  tabIndex={elegida ? 0 : -1}
                  onClick={() => alElegir(parada.indice)}
                  onKeyDown={alTeclear}
                  ref={(elemento) => {
                    botones.current[parada.indice] = elemento
                  }}
                >
                  {/* El alto de la barra se reserva solo donde hubo giro: una fila sin giros queda compacta. */}
                  {alto > 0 && (
                    <span className="vch-mastil">
                      <span className="vch-giro" />
                    </span>
                  )}
                  <span className="vch-riel">
                    <span className="vch-estacion" />
                  </span>
                  <span className="vch-parte vc-num" aria-hidden="true">
                    {parada.parte || ' '}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="vch-anio-rotulo vc-num" aria-hidden="true">
            {grupo.rotulo}
          </div>
        </div>
      ))}
    </div>
  )
}

interface PropsDetalle {
  datos: PeriodoBeneficio
  columnas: string[]
  col: ColumnasClave
  posicion: number
  total: number
  alMover: ((paso: number) => void) | null
}

/** El periodo elegido: estado, motivo, lo girado y el resto de su fila con el rótulo de cada columna. */
function Detalle({ datos, columnas, col, posicion, total, alMover }: PropsDetalle) {
  const motivo = celda(datos.fila, col.motivo)
  const enPalabras = periodoEnPalabras(datos.periodo)
  const aparte = new Set([col.periodo, col.estado, col.motivo, col.monto])
  const campos = columnas
    .map((rotulo, posicionColumna) => ({ rotulo, posicionColumna, valor: celda(datos.fila, posicionColumna) }))
    .filter((campo) => !aparte.has(campo.posicionColumna) && campo.valor !== '')
  const conGiro = datos.monto !== null && datos.monto > 0
  const hayCampos = col.monto >= 0 || campos.length > 0

  return (
    <div className={alMover ? 'vch-detalle' : 'vch-detalle vch-detalle--solo'}>
      {alMover && (
        <div className="vch-paso">
          <button
            type="button"
            className="vch-mover vch-mover--antes"
            aria-label="Periodo anterior"
            aria-disabled={posicion === 0}
            onClick={() => alMover(-1)}
          >
            <Icono nombre="chevron" tamano={16} />
          </button>
          <button
            type="button"
            className="vch-mover vch-mover--despues"
            aria-label="Periodo siguiente"
            aria-disabled={posicion === total - 1}
            onClick={() => alMover(1)}
          >
            <Icono nombre="chevron" tamano={16} />
          </button>
          <span className="vch-paso-texto vc-num">
            Periodo {posicion + 1} de {total}
          </span>
        </div>
      )}
      <div className="vch-ficha" aria-live="polite">
        <div className="vch-ahora">
          <div className="vch-periodo vc-num">{datos.periodo}</div>
          {enPalabras && <div className="vch-periodo-largo">{enPalabras}</div>}
          <ChipEstado estado={datos.estado} className="vch-chip" />
          {motivo && (
            <div className="vch-motivo">
              <span className="vch-motivo-rotulo">Motivo</span>
              {legible(motivo)}
            </div>
          )}
        </div>
        {hayCampos && (
          <dl className="vch-campos">
            {col.monto >= 0 && (
              <div className="vch-campo vch-campo--giro">
                <dt className="vch-campo-rotulo">Girado en el periodo</dt>
                <dd className={conGiro ? 'vch-campo-valor vc-num' : 'vch-campo-valor vch-campo-valor--vacio'}>
                  {conGiro && datos.monto !== null ? pesos(datos.monto) : 'Sin giro'}
                </dd>
              </div>
            )}
            {campos.map((campo) => (
              <div className="vch-campo" key={campo.posicionColumna}>
                <dt className="vch-campo-rotulo">{campo.rotulo}</dt>
                <dd className="vch-campo-valor vc-num">{legible(campo.valor)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}

interface PropsTablaCompleta {
  titulo: string
  columnas: string[]
  renglones: Renglon[]
  col: ColumnasClave
  indice: number | null
  alElegir: ((destino: number) => void) | null
}

/** Todas las cifras, en una tabla real; la fila del periodo elegido va marcada y elegir una fila mueve el recorrido. */
function TablaCompleta({ titulo, columnas, renglones, col, indice, alElegir }: PropsTablaCompleta) {
  // Una columna es numérica si todo lo que trae (sin contar vacíos) se lee como número.
  const numericas = columnas.map((_columna, i) => {
    if (i === col.periodo || i === col.estado) return false
    const valores = renglones.map((renglon) => celda(renglon.fila, i)).filter((valor) => valor !== '')
    return valores.length > 0 && valores.every((valor) => aNumero(valor) !== null)
  })
  const total =
    col.monto >= 0 ? renglones.reduce((suma, renglon) => suma + (aNumero(celda(renglon.fila, col.monto)) ?? 0), 0) : null
  const resto = columnas.length - col.monto - 1
  const marcoRef = useRef<HTMLDivElement>(null)
  const filaElegidaRef = useRef<HTMLTableRowElement>(null)

  // Al abrir la tabla y cada vez que cambia el periodo elegido, su fila queda a la vista dentro del marco.
  useEffect(() => {
    const marco = marcoRef.current
    const fila = filaElegidaRef.current
    if (marco && fila) traerFilaALaVista(marco, fila)
  }, [indice])

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- la región se desplaza con el teclado
    <div className="vch-tabla-marco" role="region" aria-label={`${titulo || 'Historial'}, tabla completa`} tabIndex={0} ref={marcoRef}>
      <table className="vch-tabla">
        <caption className="vc-sr">{titulo || 'Historial'}</caption>
        <thead>
          <tr>
            {columnas.map((columna, i) => (
              <th
                // eslint-disable-next-line react/no-array-index-key -- columnas fijas por posición
                key={i}
                scope="col"
                className={[
                  'vch-th',
                  i === 0 ? 'vch-th--primera' : '',
                  numericas[i] ? 'vch-th--num' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renglones.map((renglon) => {
            const destino = renglon.indice
            const elegida = destino !== null && destino === indice
            const elegir = destino !== null && alElegir ? () => alElegir(destino) : undefined
            return (
              // El clic en la fila es un atajo de ratón; con teclado se elige con el botón del periodo.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- el botón de la celda del periodo hace lo mismo con teclado
              <tr
                key={renglon.clave}
                className={['vch-fila', elegir ? 'vch-fila--elegible' : '', elegida ? 'vch-fila--elegida' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={elegir}
                ref={elegida ? filaElegidaRef : undefined}
              >
                {columnas.map((_columna, j) => {
                  const valor = celda(renglon.fila, j)
                  const clases = [
                    'vch-td',
                    j === 0 ? 'vch-td--primera' : '',
                    numericas[j] ? 'vch-td--num vc-num' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  let contenido: ReactNode = numericas[j] ? valor : legible(valor)
                  if (j === col.estado && valor) contenido = <ChipEstado estado={valor} />
                  if (j === col.periodo) {
                    return (
                      // eslint-disable-next-line react/no-array-index-key -- columnas fijas por posición
                      <th key={j} scope="row" className={`${clases} vch-td--periodo vc-num`}>
                        {elegir ? (
                          <button type="button" className="vch-fila-boton" aria-pressed={elegida}>
                            {valor}
                          </button>
                        ) : (
                          valor
                        )}
                      </th>
                    )
                  }
                  return (
                    // eslint-disable-next-line react/no-array-index-key -- columnas fijas por posición
                    <td key={j} className={clases}>
                      {contenido}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        {total !== null && (
          <tfoot>
            <tr>
              {col.monto > 0 && (
                <th scope="row" colSpan={col.monto} className="vch-pie-celda vch-pie-celda--rotulo">
                  Total girado
                </th>
              )}
              <td className="vch-pie-celda vch-pie-celda--total vc-num">
                {col.monto === 0 ? 'Total girado: ' : ''}
                {pesos(total)}
              </td>
              {resto > 0 && <td colSpan={resto} className="vch-pie-celda" />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

interface PropsHistorial {
  ficha: FichaFondos
  tabla: Tabla
}

function Historial({ ficha, tabla }: PropsHistorial) {
  const [titulo, columnas, filas] = tabla
  const resumen = useMemo(() => resumenBeneficio(ficha), [ficha])
  const { periodos } = resumen
  // null = sin elegir todavía: queda el último periodo, que es por donde va el beneficio.
  const [elegido, setElegido] = useState<number | null>(null)
  const [resaltadaElegida, setResaltada] = useState<CategoriaEstado | null>(null)
  const [tablaAbierta, setTablaAbierta] = useState(false)
  const idTitulo = useId()
  const idTabla = useId()

  const col = useMemo<ColumnasClave>(
    () => ({
      periodo: indiceColumna(tabla, 'Periodo'),
      estado: indiceColumna(tabla, 'Estado'),
      motivo: indiceColumna(tabla, 'Motivo'),
      monto: resumen.columnaMonto ? indiceColumna(tabla, resumen.columnaMonto) : -1,
    }),
    [tabla, resumen.columnaMonto],
  )
  const conRecorrido = col.periodo >= 0 && periodos.length > 0
  const grupos = useMemo(() => agrupar(periodos), [periodos])
  const renglones = useMemo(() => enRenglones(filas, periodos, conRecorrido), [filas, periodos, conRecorrido])

  const final = periodos.length - 1
  const indice = elegido !== null && elegido >= 0 && elegido <= final ? elegido : final
  const actual = conRecorrido ? periodos[indice] : undefined

  // Sin columna de periodo no hay camino que dibujar: queda la tabla, abierta.
  if (!actual) {
    return (
      <section className="vch" aria-labelledby={idTitulo}>
        <div className="vch-cabecera">
          <h4 className="vch-titulo" id={idTitulo}>
            {titulo || 'Historial'}
          </h4>
        </div>
        {filas.length === 0 ? (
          <div className="vch-resumen">Este beneficio no tiene periodos registrados.</div>
        ) : (
          <TablaCompleta titulo={titulo} columnas={columnas} renglones={renglones} col={col} indice={null} alElegir={null} />
        )}
      </section>
    )
  }

  const conteo = new Map<CategoriaEstado, number>()
  for (const datos of periodos) conteo.set(datos.categoria, (conteo.get(datos.categoria) ?? 0) + 1)
  const presentes = CATEGORIAS_ESTADO.filter((categoria) => conteo.has(categoria))
  // Un estado resaltado que ya no está en el recorrido no atenúa nada.
  const resaltada = resaltadaElegida !== null && conteo.has(resaltadaElegida) ? resaltadaElegida : null
  const maximo = Math.max(0, ...periodos.map((datos) => datos.monto ?? 0))
  const unSolo = periodos.length === 1
  const frase = fraseResumen(periodos.length, resumen.primerPeriodo, resumen.ultimoPeriodo, presentes, conteo)

  function mover(paso: number) {
    setElegido(Math.min(final, Math.max(0, indice + paso)))
  }

  return (
    <section className="vch" aria-labelledby={idTitulo}>
      <div className="vch-cabecera">
        <h4 className="vch-titulo" id={idTitulo}>
          Recorrido por periodo
        </h4>
        <div className="vch-resumen">{frase}</div>
      </div>

      {unSolo ? (
        <Detalle datos={actual} columnas={columnas} col={col} posicion={0} total={1} alMover={null} />
      ) : (
        <div className="vch-plano">
          <Pista
            grupos={grupos}
            total={periodos.length}
            indice={indice}
            resaltada={resaltada}
            maximo={maximo}
            conMonto={col.monto >= 0}
            alElegir={setElegido}
          />
          <div className="vch-claves">
            <ul className="vch-leyenda" aria-label="Estados del recorrido">
              {presentes.map((categoria) => {
                const veces = conteo.get(categoria) ?? 0
                const contenido = (
                  <>
                    <span className="vch-clave-muestra" style={tintes(categoria)} aria-hidden="true" />
                    {/* Los espacios separan las palabras del nombre accesible («Activo 8 periodos»); en pantalla no ocupan. */}
                    <span className="vch-clave-nombre">{categoria}</span>{' '}
                    <span className="vch-clave-cuenta vc-num">{veces}</span>{' '}
                    <span className="vc-sr">{veces === 1 ? 'periodo' : 'periodos'}</span>
                  </>
                )
                return (
                  <li className="vch-leyenda-item" key={categoria}>
                    {presentes.length > 1 ? (
                      <button
                        type="button"
                        className="vch-clave"
                        aria-pressed={resaltada === categoria}
                        title="Resaltar los periodos en este estado"
                        onClick={() => setResaltada(resaltada === categoria ? null : categoria)}
                      >
                        {contenido}
                      </button>
                    ) : (
                      <span className="vch-clave vch-clave--fija">{contenido}</span>
                    )}
                  </li>
                )
              })}
              {resaltada !== null && (
                <li className="vch-leyenda-item">
                  <button type="button" className="vch-todos" onClick={() => setResaltada(null)}>
                    Ver todos
                  </button>
                </li>
              )}
            </ul>
            {maximo > 0 && (
              <div className="vch-nota">
                La barra sobre cada parada es lo girado en ese periodo. La más alta, {pesos(maximo)}.
              </div>
            )}
          </div>
          <Detalle
            datos={actual}
            columnas={columnas}
            col={col}
            posicion={indice}
            total={periodos.length}
            alMover={mover}
          />
        </div>
      )}

      <div className="vch-tabla-zona">
        <button
          type="button"
          className="vch-alternar"
          aria-expanded={tablaAbierta}
          aria-controls={idTabla}
          onClick={() => setTablaAbierta(!tablaAbierta)}
        >
          <Icono nombre="tabla" tamano={16} />
          {tablaAbierta ? 'Ocultar la tabla' : 'Ver la tabla completa'}
          <Icono nombre="chevron" tamano={14} className="vch-alternar-giro" />
        </button>
        <div className="vch-tabla-sitio" id={idTabla}>
          {tablaAbierta && (
            <TablaCompleta
              titulo={titulo}
              columnas={columnas}
              renglones={renglones}
              col={col}
              indice={indice}
              alElegir={setElegido}
            />
          )}
        </div>
      </div>
    </section>
  )
}

export default function HistorialPeriodos({ ficha }: PropsHistorialPeriodos) {
  const tabla = tablaHistorial(ficha)
  if (!tabla) return null
  // La clave reinicia la selección cuando el componente pasa a mostrar otro beneficio;
  // lleva el documento porque dos personas pueden compartir programa, convocatoria y nombre.
  const documento = campo(ficha, 'Documento') ?? ''
  return <Historial key={`${ficha.p}|${ficha.c}|${ficha.n}|${documento}`} ficha={ficha} tabla={tabla} />
}
