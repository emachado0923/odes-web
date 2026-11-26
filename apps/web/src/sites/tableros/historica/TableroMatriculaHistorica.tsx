/* ====================================================================== */
/*  Tablero matrícula en educación superior en Medellín (2000-2025)       */
/*  Observatorio de Educación de Sapiencia                                */
/*                                                                        */
/*  Mismo aspecto que el tablero de matrícula 2025 (../matricula): las    */
/*  piezas visuales (formatos, descargas, selectores, tarjetas, barras,   */
/*  tabla e indicadores) son copias tipadas de las del tablero de los     */
/*  fondos (../fondos/TableroFondos.tsx), con sus mismas clases y estilos */
/*  (tablero-matricula.css; lo propio, en tablero-historica.css).         */
/*                                                                        */
/*  Lo que cambia: arriba va la evolución 2000-2025 de Medellín, con      */
/*  Antioquia y Colombia como referencia (índice y participación), y una  */
/*  tira de años; el año elegido manda en los indicadores y en los        */
/*  cortes de las secciones. Los datos llegan por props                   */
/*  (PaginaMatriculaHistorica.tsx, desde el JSON del ETL) y los cálculos  */
/*  son los de calculos.ts, puros y probados aparte.                      */
/* ====================================================================== */

import * as echarts from 'echarts'
import type { EChartsOption, EChartsType } from 'echarts'
import {
  Children,
  createContext,
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  alternar,
  type Campo,
  delAnio,
  FILTROS_VACIOS,
  type FiltrosHistoricos,
  filtrar,
  indice,
  matrizPorAnio,
  opcionesDisponibles,
  ordenPorValor,
  participacion,
  porCategoria,
  porCategoriaYSexo,
  programasDelAnio,
  referenciaFiltrada,
  referenciaSexo,
  resumenAnio,
  seriePorAnio,
  sexoPorAnio,
  suma,
  textoRecorte,
  variacion,
} from './calculos'
import { escribirEstado, leerEstado } from './estado-url'
import type { MatriculaHistorica, Territorio } from './tipos'

/* ---------------------------------------------------------------- color */

/* Rubik, la letra de la plantilla de Sapiencia. La página espera a que cargue
   antes de montar el tablero: el lienzo pinta con la letra que haya. */
const TIPO = '"Rubik", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const TAM = 10.5
const ALTO = 380
const TAM_BARRAS = 12
const TAM_CIFRA = 15
const TAM_PARTE = 13

/* Colores de la plantilla de Sapiencia, los mismos de matrícula 2025. */
const BASE = '#0B3A56'
const AZUL = '#3AB6E6'
const MORADO = '#9B48A4'
const NARANJA = '#ED7203'
const VERDE = '#2EA14E'
const AMARILLO = '#E0B81A'
const PIZARRA = '#6B747A'

const TINTA = '#151717'
const TINTA2 = '#3D4041'
const GRIS = '#4E5254'
const LINEA = '#DCDCDC'
const PISTA = '#F4F4F4'

/** Mezcla un color con blanco. */
function aclarar(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const m = (c: number) => Math.round(c + (255 - c) * t)
  return '#' + [m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map((v) => ('0' + v.toString(16)).slice(-2)).join('')
}

/* Categorías en orden fijo: una categoría conserva su color en todo el tablero. */
const PALETA = [BASE, AZUL, MORADO, NARANJA, VERDE, AMARILLO, PIZARRA, aclarar(BASE, 0.45), aclarar(MORADO, 0.45), aclarar(AZUL, 0.45)]
const colorDe = (i: number): string => PALETA[i % PALETA.length]
const SIN_CLASIFICAR = '#B7BEC2'
/* Antioquia va en líneas: el celeste de la plantilla (#3AB6E6) da 2,3:1 sobre blanco; este, 4:1. */
const COLOR_TERRITORIO = { Medellín: BASE, Antioquia: '#1E86B8', Colombia: NARANJA } as const
const COLOR_SEXO = [MORADO, BASE, VERDE, NARANJA]

/* -------------------------------------------------------------- formatos */

const fNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const vacio = (v: number | null | undefined): boolean => v === null || v === undefined || Number.isNaN(v)
const num = (v: number | null | undefined): string => (vacio(v) ? '—' : fNum.format(Math.round(v as number)))
const decimal = (v: number | null | undefined, d = 1): string => (vacio(v) ? '—' : (v as number).toFixed(d).replace('.', ','))
/** Cifras de los ejes: «250 mil», «2,7 M». */
function compacto(v: number | null | undefined): string {
  if (vacio(v)) return '—'
  const n = v as number
  if (Math.abs(n) >= 1e6) return decimal(n / 1e6, n % 1e6 ? 1 : 0) + ' M'
  if (Math.abs(n) >= 1e3) return fNum.format(n / 1e3) + ' mil'
  return fNum.format(n)
}
const pct = (v: number | null | undefined, d = 1): string => (vacio(v) ? '—' : (v as number).toFixed(d).replace('.', ',') + '%')
const conSigno = (v: number | null | undefined): string => (vacio(v) ? '—' : ((v as number) > 0 ? '+' : (v as number) < 0 ? '−' : '') + pct(Math.abs(v as number)))
const parte = (v: number, total: number): number | null => (!total ? null : (v * 100) / total)

const clave = (t: string): string =>
  String(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const sinTilde = (t: string): string => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const recortar = (t: string, n: number): string => (String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t))

/** Los nombres van en el HTML de las ayudas de ECharts. */
const escapar = (t: string): string =>
  String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

/** Ancho en píxeles de un texto con la letra de los gráficos (el lienzo se crea al primer uso). */
let contextoMedida: CanvasRenderingContext2D | null | undefined
function medirTexto(texto: string | number, tam: number, peso?: number): number {
  if (contextoMedida === undefined) contextoMedida = document.createElement('canvas').getContext('2d')
  if (!contextoMedida) return String(texto).length * tam * 0.55
  contextoMedida.font = (peso ? peso + ' ' : '') + tam + 'px ' + TIPO
  return contextoMedida.measureText(String(texto)).width
}

/** Cuántas líneas ocupa un rótulo partido por palabras en un ancho dado. */
function lineasRotulo(texto: string, ancho: number, tam: number): number {
  const espacio = medirTexto(' ', tam)
  let lineas = 1
  let actual = 0
  String(texto)
    .split(' ')
    .forEach((p) => {
      const w = medirTexto(p, tam)
      if (!actual) actual = w
      else if (actual + espacio + w <= ancho) actual += espacio + w
      else {
        lineas++
        actual = w
      }
    })
  return lineas
}

/** Ventana de categorías visibles cuando no caben todas: [desde, hasta], o null si caben. */
function ventana(total: number, caben: number): [number, number] | null {
  const n = Math.max(1, Math.floor(caben))
  return total <= n ? null : [0, n - 1]
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** «2026-11-25» -> «25 de noviembre de 2026». */
function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return a && m && d ? d + ' de ' + MESES[m - 1] + ' de ' + a : iso
}

const ARCH = 'matricula-medellin-2000-2025'
const nombreArchivo = (...partes: Array<string | number | false | null | undefined>): string =>
  [ARCH, ...partes]
    .filter((p): p is string | number => p !== false && p !== null && p !== undefined && p !== '')
    .map((p) => clave(String(p)))
    .join('_')

/* =================================================================== */
/*  Textos del tablero                                                  */
/* =================================================================== */

interface Textos {
  /** Pie de las tarjetas. */
  fuente: string
  /** Última línea de los CSV y de las imágenes. */
  nota: string
  /** Los filtros aplicados, en palabras («Universidad de Antioquia · Presencial»); vacío sin filtros. Va bajo cada
      título y en cada descarga, para que una cifra filtrada no pase por la de toda la ciudad. */
  recorte: string
}

const TextosTablero = createContext<Textos>({ fuente: '', nota: '', recorte: '' })

/* =================================================================== */
/*  Descargas                                                           */
/* =================================================================== */

type ValorCsv = string | number | null | undefined
interface DatosCsv {
  encabezados: string[]
  filas: ValorCsv[][]
}

function descargarCsv(nombre: string, datos: DatosCsv, nota: string, recorte: string) {
  const celda = (v: ValorCsv) => {
    if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return ''
    if (typeof v === 'number') return String(v).replace('.', ',')
    const t = String(v)
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
  }
  const lineas: ValorCsv[][] = [datos.encabezados, ...datos.filas]
  lineas.push([])
  if (recorte) lineas.push(['Filtros aplicados: ' + recorte])
  lineas.push([nota])
  const texto = lineas.map((f) => f.map(celda).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre + '.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function descargarPng(ec: EChartsType, nombre: string, titulo: string, nota: string, recorte: string) {
  const pr = 3
  const imagen = ec.getDataURL({ type: 'png', pixelRatio: pr, backgroundColor: '#fff' })
  const img = new Image()
  img.onload = function () {
    const cabecera = 76 * pr
    const pie = 38 * pr
    const margen = 22 * pr
    const lienzo = document.createElement('canvas')
    lienzo.width = img.width
    lienzo.height = img.height + cabecera + pie
    const c = lienzo.getContext('2d')
    if (!c) return
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, lienzo.width, lienzo.height)
    c.textBaseline = 'middle'
    c.fillStyle = BASE
    c.font = '600 ' + 16 * pr + 'px ' + TIPO
    c.fillText(titulo, margen, 30 * pr)
    c.fillStyle = GRIS
    c.font = 11 * pr + 'px ' + TIPO
    /* Con filtros, la segunda línea dice cuáles: la imagen no debe circular como la cifra de toda la ciudad. */
    if (recorte) {
      c.fillStyle = MORADO
      c.font = '500 ' + 11 * pr + 'px ' + TIPO
      c.fillText('Filtros aplicados: ' + recorte, margen, 54 * pr)
    } else c.fillText('Observatorio de Educación de Sapiencia', margen, 54 * pr)
    c.strokeStyle = LINEA
    c.lineWidth = 1 * pr
    c.beginPath()
    c.moveTo(margen, cabecera - 8 * pr)
    c.lineTo(lienzo.width - margen, cabecera - 8 * pr)
    c.stroke()
    c.drawImage(img, 0, cabecera)
    c.fillStyle = GRIS
    c.font = 10 * pr + 'px ' + TIPO
    c.fillText(nota, margen, img.height + cabecera + pie / 2)
    const a = document.createElement('a')
    a.href = lienzo.toDataURL('image/png')
    a.download = nombre + '.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  img.src = imagen
}

/** Ícono de la fuente Material Symbols de la plantilla. */
const Icono = ({ nombre, className }: { nombre: string; className?: string }) => (
  <span className={'material-symbols-outlined' + (className ? ' ' + className : '')} aria-hidden="true">
    {nombre}
  </span>
)

/** Botón de ícono de la plantilla (btn-icon), pequeño y con contorno neutro. */
const BotonIcono = ({ icono, rotulo, onClick }: { icono: string; rotulo: string; onClick: () => void }) => (
  <button type="button" className="btn btn-icon btn-outline-neutral btn-mn" title={rotulo} aria-label={rotulo} onClick={onClick}>
    <Icono nombre={icono} />
  </button>
)

function Descargas({
  csv,
  instancia,
  titulo,
  nombre,
}: {
  csv?: () => DatosCsv | null
  instancia?: RefObject<EChartsType | null>
  titulo: string
  nombre: string
}) {
  const textos = useContext(TextosTablero)
  const archivo = textos.recorte ? nombre + '_filtrado_' + clave(textos.recorte).slice(0, 60) : nombre
  return (
    <span className="acciones-grafico">
      {csv ? (
        <BotonIcono
          icono="download"
          rotulo="Descargar los datos en CSV"
          onClick={() => {
            const d = csv()
            if (d) descargarCsv(archivo, d, textos.nota, textos.recorte)
          }}
        />
      ) : null}
      {instancia ? (
        <BotonIcono
          icono="image"
          rotulo="Descargar el gráfico en PNG"
          onClick={() => {
            const ec = instancia.current
            if (ec) descargarPng(ec, archivo, titulo, textos.nota, textos.recorte)
          }}
        />
      ) : null}
    </span>
  )
}

/* =================================================================== */
/*  Piezas de interfaz                                                  */
/* =================================================================== */

/** Abre y cierra una lista desplegable: se cierra con un clic fuera o con Escape. */
function useDesplegable() {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])
  return { abierto, setAbierto, caja }
}

/** Opciones visibles con el buscador (hasta 400, como en matrícula). */
function useBuscar(opciones: readonly number[], texto: string, rotulo: (v: number) => string): number[] {
  return useMemo(() => {
    if (!texto) return opciones.slice(0, 400)
    const t = sinTilde(texto)
    return opciones.filter((o) => sinTilde(rotulo(o)).includes(t)).slice(0, 400)
  }, [opciones, texto, rotulo])
}

/**
 * Selector de varias categorías con buscador, con las piezas de la plantilla:
 * un botón con el aspecto de form-select y, al abrirlo, un dropdown-menu con
 * un form-control para buscar y una casilla (form-check) por opción.
 */
function SelectorMultiple({
  etiqueta,
  opciones,
  valores,
  onCambio,
  rotulo,
  resumenVacio,
}: {
  etiqueta: string
  opciones: readonly number[]
  valores: readonly number[]
  onCambio: (valores: number[]) => void
  rotulo: (v: number) => string
  resumenVacio: string
}) {
  const { abierto, setAbierto, caja } = useDesplegable()
  const boton = useRef<HTMLButtonElement>(null)
  const [texto, setTexto] = useState('')
  const id = 'sel-' + clave(etiqueta)
  const visibles = useBuscar(opciones, texto, rotulo)
  /* Las teclas dentro de la lista no siguen hasta el documento: el kit (Bootstrap) maneja ahí las de sus .dropdown-menu
     y falla con esta, que no abrió él. Escape cierra la lista y devuelve el foco al botón. */
  const teclasLista = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (e.key !== 'Escape') return
    e.preventDefault()
    setAbierto(false)
    boton.current?.focus()
  }
  const resumen = valores.length === 0 ? resumenVacio : valores.length === 1 ? rotulo(valores[0]) : valores.length + ' seleccionados'

  return (
    <div className="selector" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="form-select"
        id={id}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={id + '-lista'}
        aria-label={etiqueta + ': ' + resumen}
        title={resumen}
        data-activo={valores.length ? '1' : '0'}
        onClick={() => setAbierto((a) => !a)}
      >
        {resumen}
      </button>
      {abierto ? (
        <div className="dropdown-menu show" id={id + '-lista'} role="group" aria-label={etiqueta} onKeyDown={teclasLista}>
          {opciones.length > 10 ? (
            <input
              className="form-control form-control-sm mb-2"
              type="search"
              value={texto}
              autoFocus
              placeholder={'Buscar en ' + etiqueta.toLowerCase()}
              aria-label={'Buscar en ' + etiqueta.toLowerCase()}
              onChange={(e) => setTexto(e.target.value)}
            />
          ) : null}
          <div className="selector-lista">
            {visibles.length === 0 ? (
              <p className="small text-neutral-50 text-center my-3">Sin resultados</p>
            ) : (
              visibles.map((o, i) => (
                <div className="form-check" key={o}>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={id + '-' + i}
                    checked={valores.includes(o)}
                    onChange={() => onCambio(alternar(valores, o))}
                  />
                  <label className="form-check-label" htmlFor={id + '-' + i}>
                    {rotulo(o)}
                  </label>
                </div>
              ))
            )}
          </div>
          {!texto && opciones.length > visibles.length ? <p className="small text-neutral-50 mt-2 mb-0">Use el buscador para ver el resto.</p> : null}
          <div className="border-top mt-2 pt-2">
            <button type="button" className="btn btn-outline-neutral btn-sm" onClick={() => onCambio([])}>
              Quitar selección
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Tarjeta de la plantilla (card) con título y acciones en el encabezado.
 * Queda en el tema claro aunque el visitante active el modo oscuro: los
 * gráficos están pensados para fondo blanco.
 */
function Ficha({ titulo, accion, pie, id, children }: { titulo: string; accion?: ReactNode; pie?: ReactNode; id?: string; children: ReactNode }) {
  const textos = useContext(TextosTablero)
  return (
    <section className="card card-lg h-100" data-bs-theme="light" aria-labelledby={id}>
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div className="ficha-titulos">
          <h3 className="card-title mb-0" id={id}>
            {titulo}
          </h3>
          {textos.recorte ? <p className="ficha-recorte">{textos.recorte}</p> : null}
        </div>
        {accion || null}
      </div>
      <div className="card-body">{children}</div>
      <div className="card-footer small ficha-fuente">{pie || textos.fuente}</div>
    </section>
  )
}

const SinDatos = ({ texto }: { texto?: string }) => (
  <p className="text-neutral-50 text-center py-5 mb-0">{texto || 'Sin datos para la selección activa.'}</p>
)

/** Opción de ECharts que arman los constructores de abajo (se entrega tal cual a setOption). */
interface Opcion {
  series: unknown[]
  [parte: string]: unknown
}
type ConstructorOpcion = Opcion | ((ancho: number) => Opcion | null) | null

/** Lo que ECharts entrega al clic y a los formateadores (solo lo que se usa aquí). */
interface Punto {
  dataIndex: number
  name: string
  value: number
  seriesName: string
  marker: string
}

function Grafico({
  opcion,
  altoPx,
  alIniciar,
  alSeleccionar,
  resumen,
}: {
  opcion: ConstructorOpcion
  altoPx?: number
  /** Recibe la instancia de ECharts al crearse (y null al desmontarse), para la descarga en PNG. */
  alIniciar?: (ec: EChartsType | null) => void
  alSeleccionar?: (p: Punto) => void
  /** Lo que muestra el gráfico, en texto: el lienzo no se puede leer con un lector de pantalla. */
  resumen?: string
}) {
  const caja = useRef<HTMLDivElement>(null)
  const inst = useRef<EChartsType | null>(null)
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    const el = caja.current
    if (!el) return undefined
    const ec = echarts.init(el, null, { renderer: 'canvas' })
    inst.current = ec
    alIniciar?.(ec)
    const medir = () => setAncho(el.clientWidth)
    const redimensionar = () => {
      ec.resize()
      medir()
    }
    medir()
    const obs = window.ResizeObserver ? new ResizeObserver(redimensionar) : null
    obs?.observe(el)
    window.addEventListener('resize', redimensionar)
    void document.fonts?.ready.then(() => {
      if (inst.current === ec) ec.resize()
    })
    return () => {
      window.removeEventListener('resize', redimensionar)
      obs?.disconnect()
      ec.dispose()
      inst.current = null
      alIniciar?.(null)
    }
  }, [alIniciar])

  /* La opción puede ser una función del ancho del gráfico, para los que
     acomodan sus rótulos al espacio disponible. */
  const op = typeof opcion === 'function' ? (ancho ? opcion(ancho) : null) : opcion

  useEffect(() => {
    if (inst.current && op) inst.current.setOption(op as EChartsOption, true)
  }, [op])

  useEffect(() => {
    const ec = inst.current
    if (!ec) return undefined
    ec.off('click')
    if (alSeleccionar) ec.on('click', (p) => alSeleccionar(p as unknown as Punto))
    return () => {
      ec.off('click')
    }
  })

  return <div ref={caja} className="grafico" role="img" aria-label={resumen} style={altoPx ? { height: altoPx } : undefined} />
}

function FichaGrafico({
  titulo,
  altoPx = ALTO,
  opcion,
  csv,
  archivo,
  pie,
  extra,
  vacio: textoVacio,
  alSeleccionar,
  resumen,
}: {
  titulo: string
  altoPx?: number
  opcion: ConstructorOpcion
  csv?: () => DatosCsv | null
  archivo: string
  pie?: ReactNode
  /** Controles del encabezado, antes de las descargas. */
  extra?: ReactNode
  vacio?: string
  alSeleccionar?: (p: Punto) => void
  resumen?: string
}) {
  const instancia = useRef<EChartsType | null>(null)
  const alIniciar = useCallback((ec: EChartsType | null) => {
    instancia.current = ec
  }, [])
  const id = 'ficha-' + clave(archivo)
  return (
    <Ficha
      titulo={titulo}
      id={id}
      pie={pie}
      accion={
        <span className="d-flex flex-wrap align-items-center gap-2">
          {extra}
          <Descargas csv={csv} instancia={instancia} nombre={archivo} titulo={titulo} />
        </span>
      }
    >
      {opcion ? (
        <Grafico opcion={opcion} altoPx={altoPx} alIniciar={alIniciar} alSeleccionar={alSeleccionar} resumen={resumen ?? titulo} />
      ) : (
        <SinDatos texto={textoVacio} />
      )}
    </Ficha>
  )
}

type Celda = string | number | null | undefined
type FilaTabla = Record<string, Celda>
interface Columna {
  clave: string
  rotulo: string
  tipo: 'texto' | 'num' | 'pct' | 'var'
  ancho?: number
}

/**
 * Tabla ordenable con el estilo de tabla de la plantilla. La primera columna
 * queda alineada a la izquierda y fija; las demás van a la derecha, con
 * cifras tabulares. Un clic (o Enter) en el título de una columna ordena por
 * ella. Con `limite`, muestra solo esas filas y lo dice debajo.
 */
function Tabla({
  columnas,
  filas,
  altura,
  orden,
  limite,
  resaltar,
}: {
  columnas: Columna[]
  filas: FilaTabla[]
  altura?: number
  orden?: string
  limite?: number
  /** Filas que van marcadas (el año elegido). */
  resaltar?: (f: FilaTabla) => boolean
}) {
  const [col, setCol] = useState(orden ?? columnas[0].clave)
  const [asc, setAsc] = useState(false)

  const ordenadas = useMemo(() => {
    const s = filas.slice().sort((a, b) => {
      const va = a[col]
      const vb = b[col]
      if (typeof va === 'string' || typeof vb === 'string') return String(va ?? '').localeCompare(String(vb ?? ''), 'es')
      return (va ?? -Infinity) - (vb ?? -Infinity)
    })
    return asc ? s : s.reverse()
  }, [filas, col, asc])

  if (!filas.length) return <SinDatos texto="Sin registros para la selección activa." />
  const visibles = limite ? ordenadas.slice(0, limite) : ordenadas
  const celda = (c: Columna, v: Celda) =>
    c.tipo === 'texto' ? v : c.tipo === 'pct' ? pct(v as number | null) : c.tipo === 'var' ? conSigno(v as number | null) : num(v as number | null)

  return (
    <Fragment>
      <div className="tabla-caja" style={altura ? { maxHeight: altura } : undefined}>
        <table className="table table-hover table-sm align-middle tabla-cifras">
          <thead>
            <tr>
              {columnas.map((c, i) => {
                const ordenar = () => {
                  if (col === c.clave) setAsc((a) => !a)
                  else {
                    setCol(c.clave)
                    setAsc(c.tipo === 'texto')
                  }
                }
                return (
                  <th
                    key={c.clave}
                    className={i === 0 ? 'fija' : ''}
                    style={c.ancho ? { minWidth: c.ancho } : undefined}
                    tabIndex={0}
                    onClick={ordenar}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        ordenar()
                      }
                    }}
                    aria-sort={col === c.clave ? (asc ? 'ascending' : 'descending') : undefined}
                  >
                    <span className="th-texto">
                      {c.rotulo}
                      {col === c.clave ? <Icono nombre={asc ? 'arrow_upward' : 'arrow_downward'} className="orden activo" /> : null}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, j) => (
              <tr key={j} className={resaltar?.(f) ? 'table-active' : undefined} aria-current={resaltar?.(f) ? 'true' : undefined}>
                {columnas.map((c, i) => (
                  <td key={c.clave} className={i === 0 ? 'izq fija' : c.tipo === 'texto' ? 'izq' : ''}>
                    {celda(c, f[c.clave])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length < ordenadas.length ? (
        <p className="nota-grafico">
          Se muestran {num(visibles.length)} de {num(ordenadas.length)} filas, en el orden elegido. La descarga en CSV trae todas.
        </p>
      ) : null}
    </Fragment>
  )
}

/** Datos de una tabla para el CSV: las columnas de la tabla, con los porcentajes a un decimal. */
const csvDeTabla = (columnas: Columna[], filas: FilaTabla[]) => (): DatosCsv => ({
  encabezados: columnas.map((c) => c.rotulo),
  filas: filas.map((f) =>
    columnas.map((c) => (c.tipo === 'pct' || c.tipo === 'var' ? (f[c.clave] === null ? null : Number(Number(f[c.clave] ?? 0).toFixed(1))) : f[c.clave])),
  ),
})

/** Indicador en una tarjeta de la plantilla; el recuadro del ícono toma un color de Sapiencia. */
const COLOR_SAPIENCIA = {
  secondary: '#163854',
  info: '#51ADE5',
  primary: '#9F339E',
  'tertiary-pink': '#2E9E49',
  success: '#F8DB1B',
  warning: '#F36522',
}

function Kpi({ icono, familia, etiqueta, valor, pie }: { icono: string; familia: keyof typeof COLOR_SAPIENCIA; etiqueta: string; valor: ReactNode; pie?: string }) {
  return (
    <div className={'card card-lg h-100 kpi kpi-' + familia}>
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div className="kpi-etiqueta text-neutral-40">{etiqueta}</div>
          <span className="kpi-icono" style={{ background: COLOR_SAPIENCIA[familia] }}>
            <Icono nombre={icono} />
          </span>
        </div>
        <div className={'kpi-valor text-' + familia + '-40'}>{valor}</div>
        {pie ? (
          <div className="kpi-pie small text-neutral-50 text-truncate" title={pie}>
            {pie}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* =================================================================== */
/*  Configuración de los gráficos                                       */
/* =================================================================== */

type Formato = (v: number) => string

/** Quien pide menos movimiento ve los gráficos sin animación. */
const MOVIMIENTO_REDUCIDO = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

const base = () => ({
  textStyle: { fontFamily: TIPO, fontSize: TAM, color: TINTA2 },
  animation: !MOVIMIENTO_REDUCIDO,
  animationDuration: 240,
  tooltip: {
    trigger: 'item',
    confine: true,
    backgroundColor: '#ffffff',
    borderColor: LINEA,
    borderWidth: 1,
    padding: [8, 11],
    textStyle: { color: TINTA, fontSize: TAM, fontFamily: TIPO },
  },
})

const leyenda = () => ({
  top: 0,
  left: 0,
  icon: 'rect',
  itemWidth: 11,
  itemHeight: 11,
  itemGap: 16,
  textStyle: { color: TINTA2, fontSize: TAM_BARRAS, fontFamily: TIPO },
})

/** Alto de la leyenda de arriba cuando sus entradas no caben en una línea. */
function altoLeyenda(nombres: string[], ancho: number): number {
  const disponible = Math.max(120, ancho - 8)
  let filas = 1
  let actual = 0
  for (const n of nombres) {
    const w = 11 + 5 + medirTexto(n, TAM_BARRAS) + 16
    if (actual && actual + w > disponible) {
      filas++
      actual = w
    } else actual += w
  }
  return filas * 15 + (filas - 1) * 16
}

/* Control para recorrer las categorías que no caben (el de matrícula). */
const ESTILO_RECORRIDO = {
  showDetail: false,
  brushSelect: false,
  zoomLock: true,
  borderColor: LINEA,
  backgroundColor: '#FAFAFA',
  fillerColor: 'rgba(11,58,86,.14)',
  handleStyle: { color: '#fff', borderColor: '#CCCCCC' },
  moveHandleStyle: { color: LINEA },
  dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
  selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
}

const recorridoV = ([desde, hasta]: [number, number], top: number, bottom: number) => [
  { type: 'inside', yAxisIndex: 0, startValue: desde, endValue: hasta, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: false },
  { type: 'slider', yAxisIndex: 0, startValue: desde, endValue: hasta, right: 4, width: 14, top, bottom, ...ESTILO_RECORRIDO },
]

interface OpcionesBarras {
  color?: string
  colores?: string[]
  total?: number
  conParte?: boolean
  anchoMax?: number
  alto?: number
  /** Posiciones de las categorías elegidas en los filtros: van en el color pleno y las demás, más claras. */
  elegidas?: boolean[]
  /** Ancho del gráfico; por debajo de ANCHO_ANGOSTO el rótulo va encima de la barra y la barra usa todo el ancho. */
  anchoGrafico?: number
}

const ANCHO_ANGOSTO = 520
const PASO_ANGOSTO = 42

/* Barras: rótulos de 12 px con los nombres completos (en dos líneas si no
   caben en una), la cifra en 15 px y el porcentaje en 13 px. */
const opcionesBarras = (ancho: number, extra?: OpcionesBarras): OpcionesBarras => ({
  anchoMax: Math.round(Math.min(400, Math.max(120, ancho * 0.4))),
  anchoGrafico: ancho,
  ...extra,
})

/**
 * Barras para pantallas angostas: el nombre va encima de su barra, la barra ocupa todo el ancho y a la derecha solo
 * va la cifra (el porcentaje queda en la ayuda). Sin control de recorrido: se ven las que caben, de mayor a menor;
 * la lista completa está en el CSV y en Datos.
 */
function barrasAngostas(categorias: string[], valores: number[], o: OpcionesBarras): Opcion {
  const alto = o.alto ?? ALTO
  const n = Math.min(categorias.length, Math.max(3, Math.floor((alto - 24) / PASO_ANGOSTO)))
  const cats = categorias.slice(0, n)
  const vals = valores.slice(0, n)
  const total = o.total || suma(valores)
  const maximo = Math.max(1, ...vals)
  const derecha = Math.ceil(medirTexto(num(maximo), TAM_CIFRA, 600)) + 16
  const ancho = o.anchoGrafico ?? 320
  const hayElegidas = o.elegidas?.some(Boolean)
  const b = base()
  return {
    ...b,
    grid: { left: 2, right: derecha, top: 20, bottom: 4, containLabel: false },
    xAxis: { type: 'value', max: maximo, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: {
      type: 'category',
      data: cats,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      z: 3,
      axisLabel: { inside: true, align: 'left', verticalAlign: 'bottom', padding: [0, 0, 10, 0], color: TINTA2, fontSize: TAM_BARRAS, width: ancho - derecha - 8, overflow: 'truncate' },
    },
    tooltip: {
      ...b.tooltip,
      formatter: (p: Punto) => '<b>' + escapar(p.name) + '</b><br/>' + num(p.value) + ' matriculados' + (total ? '<br/>' + pct(parte(p.value, total)) + ' del total' : ''),
    },
    series: [
      {
        type: 'bar',
        data: vals.map((v, i) => {
          const c = o.colores?.[i] ?? o.color ?? BASE
          const pleno = !hayElegidas || o.elegidas?.[i]
          return { value: v, itemStyle: { color: pleno ? c : aclarar(c, 0.55) } }
        }),
        barMaxWidth: 11,
        showBackground: true,
        backgroundStyle: { color: PISTA, borderRadius: 4 },
        itemStyle: { borderRadius: 4 },
        label: { show: true, position: 'right', distance: 8, formatter: (p: Punto) => num(p.value), color: TINTA, fontSize: TAM_PARTE, fontWeight: 500, fontFamily: TIPO },
      },
    ],
  }
}

/** Barras horizontales de una sola serie, en color plano y con pista (las de matrícula). */
function barrasH(categorias: string[], valores: number[], o: OpcionesBarras = {}): Opcion {
  if ((o.anchoGrafico ?? Infinity) < ANCHO_ANGOSTO) return barrasAngostas(categorias, valores, o)
  const color = o.color ?? BASE
  const total = o.total || suma(valores)
  const maximo = Math.max(1, ...valores)
  const letra = TAM_BARRAS
  const masLargo = Math.max(0, ...categorias.map((c) => medirTexto(c, letra)))
  const anchoCol = Math.round(Math.min(o.anchoMax ?? 260, masLargo + 18))
  const anchoRotulo = anchoCol - 14
  const altoLinea = Math.round(letra * 1.2)
  const lineas = Math.max(1, ...categorias.map((c) => lineasRotulo(c, anchoRotulo, letra)))
  const paso = Math.max(28, lineas * altoLinea + 10)
  const alto = o.alto ?? ALTO
  const vista = ventana(categorias.length, Math.max(3, Math.floor((alto - 34) / paso)))
  const anchoEtiqueta =
    medirTexto(num(maximo), TAM_CIFRA, 600) + (o.conParte && total ? medirTexto('  ', letra) + medirTexto(pct(parte(maximo, total)), TAM_PARTE, 500) : 0)
  const b = base()
  const hayElegidas = o.elegidas?.some(Boolean)
  return {
    ...b,
    grid: { left: anchoCol, right: Math.max(o.conParte ? 151 : 106, Math.ceil(anchoEtiqueta) + 24) + (vista ? 30 : 0), top: 14, bottom: 20, containLabel: false },
    dataZoom: vista ? recorridoV(vista, 14, 20) : undefined,
    xAxis: { type: 'value', max: maximo * 1.02, axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: {
      type: 'category',
      data: categorias,
      inverse: true,
      axisLine: { show: true, lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: { color: TINTA2, fontSize: letra, margin: 12, lineHeight: altoLinea, width: anchoRotulo, overflow: 'break' },
    },
    tooltip: {
      ...b.tooltip,
      formatter: (p: Punto) => '<b>' + escapar(p.name) + '</b><br/>' + num(p.value) + ' matriculados' + (total && o.conParte ? '<br/>' + pct(parte(p.value, total)) + ' del total' : ''),
    },
    series: [
      {
        type: 'bar',
        data: valores.map((v, i) => {
          const c = o.colores?.[i] ?? color
          const pleno = !hayElegidas || o.elegidas?.[i]
          return { value: v, itemStyle: { color: pleno ? c : aclarar(c, 0.55) }, emphasis: { itemStyle: { color: aclarar(c, 0.2) } } }
        }),
        barMaxWidth: 15,
        showBackground: true,
        backgroundStyle: { color: PISTA, borderRadius: 4 },
        itemStyle: { borderRadius: 4 },
        label: {
          show: true,
          position: 'right',
          distance: 9,
          fontSize: letra,
          fontFamily: TIPO,
          formatter: (p: Punto) => (o.conParte && total ? '{v|' + num(p.value) + '}  {p|' + pct(parte(p.value, total)) + '}' : '{v|' + num(p.value) + '}'),
          rich: {
            v: { color: TINTA, fontSize: TAM_CIFRA, fontWeight: 500, fontFamily: TIPO },
            p: { color: GRIS, fontSize: TAM_PARTE, fontFamily: TIPO, fontWeight: 500 },
          },
        },
      },
    ],
  }
}

/** Una serie en el tiempo. */
interface SerieTiempo {
  nombre: string
  datos: Array<number | null>
  color: string
  /** Relleno claro bajo la línea (solo la serie principal). */
  area?: boolean
  discontinua?: boolean
}

/** Márgenes fijos del gráfico cuando la tira de años va debajo como eje (ver Evolucion). */
interface EjeFijo {
  left: number
  right: number
}

/** Rótulos de los años con el elegido en seminegrita; en pantallas angostas, uno de cada tantos. Con la tira como eje, sin rótulos. */
function ejeAnios(anios: string[], seleccion: number, ancho: number, sinRotulos?: boolean) {
  const caben = Math.max(4, Math.floor((ancho - 80) / 38))
  const cada = Math.max(1, Math.ceil(anios.length / caben))
  return {
    type: 'category' as const,
    data: anios,
    boundaryGap: false,
    axisLine: { lineStyle: { color: LINEA } },
    axisTick: { show: false },
    axisLabel: {
      show: !sinRotulos,
      color: TINTA2,
      fontSize: TAM_BARRAS,
      margin: 12,
      interval: (i: number) => {
        if (i === seleccion) return true
        const lejos = Math.abs(i - seleccion) > Math.floor(cada / 2)
        return lejos && (i % cada === 0 || i === anios.length - 1)
      },
      formatter: (v: string, i: number) => (i === seleccion ? '{r|' + v + '}' : v),
      rich: { r: { color: TINTA, fontWeight: 600, fontSize: TAM_BARRAS, fontFamily: TIPO } },
    },
  }
}

const lineaDelAnio = (seleccion: number) => ({
  silent: true,
  symbol: 'none',
  label: { show: false },
  lineStyle: { color: TINTA2, type: 'dashed', width: 1.25 },
  data: [{ xAxis: seleccion }],
})

/**
 * Líneas por año (la evolución): el año elegido lleva una guía vertical, sus
 * puntos van más grandes y la primera serie rotula su cifra. Un clic en
 * cualquier punto elige ese año.
 */
function lineasTiempo(
  anios: string[],
  series: SerieTiempo[],
  o: {
    seleccion: number
    ancho: number
    formato: Formato
    formatoEje: Formato
    unidad?: string
    desdeCero?: boolean
    eje?: EjeFijo
    /** Rotular la cifra del año elegido en todas las series (no solo en la primera). */
    rotularTodas?: boolean
    /** Guía horizontal en 50 % (paridad), para el porcentaje de mujeres. */
    paridad?: boolean
  },
): Opcion {
  const b = base()
  const conLeyenda = series.length > 1
  const arriba = conLeyenda ? altoLeyenda(series.map((s) => s.nombre), o.ancho) + 22 : 18
  /* La cifra del año elegido va centrada sobre su punto: a la derecha queda media cifra de espacio. */
  const elegido = series[0]?.datos[o.seleccion]
  const derecha = Math.max(24, Math.ceil(medirTexto(vacio(elegido) ? '' : o.formato(elegido as number), TAM_CIFRA, 600) / 2) + 10)
  return {
    ...b,
    legend: conLeyenda ? { ...leyenda(), data: series.map((s) => s.nombre) } : undefined,
    grid: o.eje
      ? { left: o.eje.left, right: o.eje.right, top: arriba + 18, bottom: 6, containLabel: false }
      : { left: 8, right: derecha, top: arriba + 18, bottom: 8, containLabel: true },
    tooltip: {
      ...b.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: LINEA } },
      formatter: (ps: Punto[]) =>
        '<b>' +
        escapar(ps[0]?.name ?? '') +
        '</b>' +
        ps.map((p) => '<br/>' + p.marker + escapar(p.seriesName) + ': <b>' + (vacio(p.value) ? '—' : o.formato(p.value)) + '</b>' + (o.unidad ? ' ' + o.unidad : '')).join(''),
    },
    xAxis: ejeAnios(anios, o.seleccion, o.ancho, Boolean(o.eje)),
    yAxis: {
      type: 'value',
      scale: !o.desdeCero,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: GRIS, fontSize: TAM_BARRAS, formatter: o.formatoEje },
      splitLine: { lineStyle: { color: PISTA } },
    },
    series: series.map((s, k) => ({
      type: 'line',
      name: s.nombre,
      data: s.datos.map((v, i) =>
        i === o.seleccion
          ? {
              value: v,
              symbolSize: 11,
              itemStyle: { color: s.color, borderColor: '#fff', borderWidth: 2 },
              label: k === 0 || o.rotularTodas ? { show: !vacio(v), position: 'top', distance: 10, formatter: () => o.formato(v as number), color: TINTA, fontSize: TAM_CIFRA, fontWeight: 600, fontFamily: TIPO } : undefined,
            }
          : v,
      ),
      color: s.color,
      symbol: 'circle',
      symbolSize: 5,
      showSymbol: true,
      connectNulls: false,
      lineStyle: { width: k === 0 ? 2.75 : 2, type: s.discontinua ? 'dashed' : 'solid' },
      areaStyle: s.area ? { color: aclarar(s.color, 0.88) } : undefined,
      emphasis: { focus: 'series' },
      markLine:
        k === 0
          ? o.paridad
            ? { ...lineaDelAnio(o.seleccion), data: [{ xAxis: o.seleccion }, { yAxis: 50, lineStyle: { color: GRIS, type: 'dotted', width: 1 }, label: { show: true, position: 'insideStartTop', formatter: 'Paridad (50 %)', color: GRIS, fontSize: TAM_BARRAS, fontFamily: TIPO } }] }
            : lineaDelAnio(o.seleccion)
          : undefined,
      z: series.length - k,
    })),
  }
}

/**
 * Áreas apiladas por año (composición): en cifras o, con `porcentaje`, cada
 * año suma 100 %. La guía vertical marca el año elegido.
 */
function areasApiladas(anios: string[], series: SerieTiempo[], o: { seleccion: number; ancho: number; porcentaje?: boolean; eje?: EjeFijo }): Opcion {
  const b = base()
  const totales = anios.map((_, i) => suma(series.map((s) => s.datos[i] ?? 0)))
  const datos = series.map((s) => (o.porcentaje ? s.datos.map((v, i) => (totales[i] ? ((v ?? 0) * 100) / totales[i] : null)) : s.datos))
  const arriba = altoLeyenda(series.map((s) => s.nombre), o.ancho) + 22
  return {
    ...b,
    legend: { ...leyenda(), data: series.map((s) => s.nombre) },
    grid: o.eje
      ? { left: o.eje.left, right: o.eje.right, top: arriba + 12, bottom: 6, containLabel: false }
      : { left: 8, right: 24, top: arriba + 12, bottom: 8, containLabel: true },
    tooltip: {
      ...b.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: LINEA } },
      formatter: (ps: Punto[]) => {
        const i = ps[0]?.dataIndex ?? 0
        return (
          '<b>' +
          escapar(anios[i]) +
          '</b>' +
          [...ps]
            .reverse()
            .map((p) => {
              const v = series.find((s) => s.nombre === p.seriesName)?.datos[i] ?? null
              return '<br/>' + p.marker + escapar(p.seriesName) + ': <b>' + num(v) + '</b> (' + pct(parte(v ?? 0, totales[i])) + ')'
            })
            .join('') +
          '<br/>Total: <b>' +
          num(totales[i]) +
          '</b>'
        )
      },
    },
    xAxis: ejeAnios(anios, o.seleccion, o.ancho, Boolean(o.eje)),
    yAxis: {
      type: 'value',
      max: o.porcentaje ? 100 : undefined,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: GRIS, fontSize: TAM_BARRAS, formatter: o.porcentaje ? (v: number) => v + '%' : compacto },
      splitLine: { lineStyle: { color: PISTA } },
    },
    series: series.map((s, k) => ({
      type: 'line',
      name: s.nombre,
      stack: 'total',
      data: datos[k],
      color: s.color,
      symbol: 'none',
      lineStyle: { width: 1, color: '#fff' },
      areaStyle: { color: s.color, opacity: 0.92 },
      emphasis: { focus: 'series' },
      markLine: k === series.length - 1 ? lineaDelAnio(o.seleccion) : undefined,
    })),
  }
}

/** Variación anual (%): barras hacia arriba o hacia abajo, con el año elegido resaltado y rotulado. */
function barrasVariacion(anios: string[], valores: Array<number | null>, o: { seleccion: number; ancho: number }): Opcion {
  const b = base()
  return {
    ...b,
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    tooltip: { ...b.tooltip, formatter: (p: Punto) => '<b>' + escapar(p.name) + '</b><br/>' + conSigno(p.value) + ' frente al año anterior' },
    xAxis: { ...ejeAnios(anios, o.seleccion, o.ancho), boundaryGap: true },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: GRIS, fontSize: TAM_BARRAS, formatter: (v: number) => v + '%' },
      splitLine: { lineStyle: { color: PISTA } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        data: valores.map((v, i) => {
          const c = (v ?? 0) < 0 ? NARANJA : BASE
          const elegido = i === o.seleccion
          return {
            value: v,
            itemStyle: { color: elegido ? c : aclarar(c, 0.5), borderRadius: (v ?? 0) < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0] },
            label: elegido && !vacio(v) ? { show: true, position: (v ?? 0) < 0 ? 'bottom' : 'top', formatter: () => conSigno(v), color: TINTA, fontSize: TAM_PARTE, fontWeight: 600, fontFamily: TIPO } : undefined,
          }
        }),
      },
    ],
  }
}

/** Barras horizontales apiladas al 100 % (mujeres y hombres por categoría). */
function apiladas100(categorias: string[], series: SerieTiempo[], ancho: number): Opcion {
  const b = base()
  const totales = categorias.map((_, i) => suma(series.map((s) => s.datos[i] ?? 0)))
  const masLargo = Math.max(0, ...categorias.map((c) => medirTexto(c, TAM_BARRAS)))
  const anchoCol = Math.round(Math.min(Math.max(120, ancho * 0.35), masLargo + 18))
  const arriba = altoLeyenda(series.map((s) => s.nombre), ancho) + 18
  return {
    ...b,
    legend: { ...leyenda(), data: series.map((s) => s.nombre) },
    grid: { left: anchoCol, right: 16, top: arriba + 8, bottom: 8 },
    tooltip: {
      ...b.tooltip,
      formatter: (p: Punto) => {
        const v = series.find((s) => s.nombre === p.seriesName)?.datos[p.dataIndex] ?? 0
        return '<b>' + escapar(p.name) + '</b><br/>' + p.marker + escapar(p.seriesName) + ': <b>' + num(v) + '</b> (' + pct(parte(v, totales[p.dataIndex])) + ')'
      },
    },
    xAxis: { type: 'value', max: 100, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: {
      type: 'category',
      data: categorias,
      inverse: true,
      axisLine: { show: true, lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: { color: TINTA2, fontSize: TAM_BARRAS, margin: 12, width: anchoCol - 14, overflow: 'break', lineHeight: 15 },
    },
    series: series.map((s) => ({
      type: 'bar',
      name: s.nombre,
      stack: 'total',
      barMaxWidth: 22,
      color: s.color,
      data: s.datos.map((v, i) => (totales[i] ? ((v ?? 0) * 100) / totales[i] : 0)),
      label: {
        show: true,
        formatter: (p: Punto) => (p.value >= 9 ? pct(p.value, 0) : ''),
        color: '#fff',
        fontSize: TAM_PARTE,
        fontWeight: 500,
        fontFamily: TIPO,
      },
    })),
  }
}

/* =================================================================== */
/*  Secciones                                                           */
/* =================================================================== */

/* Anchos de las tarjetas en la rejilla de 12 columnas de la plantilla. */
const UNA = ['col-12']
const DOS = ['col-12 col-xl-6']

function Fila({ cols, children }: { cols: string[]; children: ReactNode }) {
  const hijos = Children.toArray(children)
  return (
    <div className="row g-4 mb-4">
      {hijos.map((h, i) => (
        <div key={i} className={cols[i % cols.length]}>
          {h}
        </div>
      ))}
    </div>
  )
}

interface PropsSeccion {
  c: MatriculaHistorica
  f: FiltrosHistoricos
  /** Filas con los filtros aplicados, de todos los años. */
  filas: MatriculaHistorica['filas']
  /** Posición del año elegido en c.anios. */
  anio: number
  anios: string[]
  elegirAnio: (i: number) => void
  alternarFiltro: (campo: keyof FiltrosHistoricos, i: number) => void
}

/**
 * Puesto de cada categoría por su matrícula en toda la serie (sin filtros): la más grande toma el primer color de la
 * paleta. Se calcula una vez por dimensión, así una categoría conserva su color aunque cambien los filtros. El nivel
 * de formación va en su orden natural (de técnica profesional a doctorado).
 */
const puestos = new WeakMap<MatriculaHistorica, Partial<Record<Campo, number[]>>>()
function puestoDe(c: MatriculaHistorica, campo: Campo): number[] {
  const deC = puestos.get(c) ?? {}
  puestos.set(c, deC)
  if (!deC[campo]) {
    const totales = matrizPorAnio(c, c.filas, campo).map(suma)
    const puesto = totales.map(() => 0)
    totales
      .map((v, i) => [v, i] as const)
      .sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .forEach(([, i], k) => (puesto[i] = k))
    deC[campo] = campo === 'nivel' ? totales.map((_, i) => i) : puesto
  }
  return deC[campo]
}

/** Series por año de una dimensión: solo las categorías con matrícula, de la más grande a la más chica (el nivel, en su orden). */
function seriesDe(c: MatriculaHistorica, matriz: number[][], campo: Campo): SerieTiempo[] {
  const nombres = campo === 'ies' ? c.dim.ies.map((i) => i.nombre) : c.dim[campo]
  const puesto = puestoDe(c, campo)
  /* «Sin clasificar» no es una categoría: un vacío de clasificación del SNIES. Va en gris y al final. */
  return nombres
    .map((nombre, i) =>
      nombre === 'Sin clasificar'
        ? { nombre, datos: matriz[i], color: SIN_CLASIFICAR, puesto: Infinity }
        : { nombre, datos: matriz[i], color: colorDe(puesto[i]), puesto: puesto[i] },
    )
    .filter((s) => suma(s.datos) > 0)
    .sort((a, b) => a.puesto - b.puesto)
    .map(({ nombre, datos, color }) => ({ nombre, datos, color }))
}

/* Resúmenes en texto de los gráficos, para lectores de pantalla (cada gráfico es un lienzo). */

const masCategorias = (n: number): string => (n === 1 ? 'una categoría más.' : n + ' categorías más.')

function resumenBarras(titulo: string, nombres: string[], datos: number[], total: number): string {
  if (!nombres.length) return titulo + ': sin datos para la selección activa.'
  const primeros = nombres.slice(0, 5).map((n, i) => n + ' ' + num(datos[i]) + ' (' + pct(parte(datos[i], total)) + ')')
  return (
    titulo + '. Total ' + num(total) + '. ' + primeros.join('; ') + (nombres.length > 5 ? '; y ' + masCategorias(nombres.length - 5) : '.')
  )
}

function resumenSeries(titulo: string, anios: string[], series: SerieTiempo[], formato: Formato): string {
  const partes = series.map((s) => {
    const con = s.datos.map((v, i) => [v, i] as const).filter(([v]) => !vacio(v)) as Array<readonly [number, number]>
    if (!con.length) return s.nombre + ': sin datos'
    const [v0, i0] = con[0]
    const [vn, iN] = con[con.length - 1]
    const [vm, im] = con.reduce((a, b) => (b[0] > a[0] ? b : a))
    return s.nombre + ': ' + formato(v0) + ' en ' + anios[i0] + ' y ' + formato(vn) + ' en ' + anios[iN] + '; máximo ' + formato(vm) + ' en ' + anios[im]
  })
  return titulo + '. ' + partes.join('. ') + '.'
}

function resumenComposicion(titulo: string, anios: string[], series: SerieTiempo[]): string {
  const ultimo = anios.length - 1
  const total = (i: number) => suma(series.map((s) => s.datos[i] ?? 0))
  const partes = series.slice(0, 5).map((s) => s.nombre + ': ' + pct(parte(s.datos[0] ?? 0, total(0))) + ' en ' + anios[0] + ' y ' + pct(parte(s.datos[ultimo] ?? 0, total(ultimo))) + ' en ' + anios[ultimo])
  return titulo + '. Participación de cada categoría. ' + partes.join('; ') + (series.length > 5 ? '; y ' + masCategorias(series.length - 5) : '.')
}

const csvPorAnio = (anios: string[], series: SerieTiempo[], rotulo = 'Año') => (): DatosCsv => ({
  encabezados: [rotulo, ...series.map((s) => s.nombre), 'Total'],
  filas: anios.map((a, i) => [a, ...series.map((s) => s.datos[i]), suma(series.map((s) => s.datos[i] ?? 0))]),
})

const csvBarras = (rotulo: string, nombres: string[], valores: number[]) => (): DatosCsv => {
  const total = suma(valores)
  return { encabezados: [rotulo, 'Matriculados', 'Participación (%)'], filas: nombres.map((n, i) => [n, valores[i], Number((parte(valores[i], total) ?? 0).toFixed(1))]) }
}

const NINGUNO: number[] = []

/** Barras del año elegido por una dimensión: un clic agrega o quita esa categoría de los filtros. */
function FichaBarras({
  titulo,
  campo,
  filtro,
  p,
  alto = ALTO,
  limite,
}: {
  titulo: string
  campo: Campo
  filtro?: keyof FiltrosHistoricos
  p: PropsSeccion
  alto?: number
  limite?: number
}) {
  const { c, f, filas, anio, anios } = p
  /* El gráfico de una dimensión no se filtra por esa misma dimensión: así lo elegido queda pleno, el resto pálido y se
     puede sumar otra categoría. Los demás filtros sí se aplican. */
  const elegidosAqui = filtro ? f[filtro] : NINGUNO
  const base = useMemo(() => (filtro && elegidosAqui.length ? filtrar(c, { ...f, [filtro]: [] }) : filas), [c, f, filtro, elegidosAqui, filas])
  const valores = useMemo(() => porCategoria(c, delAnio(base, anio), campo), [c, base, anio, campo])
  const orden = useMemo(() => {
    /* El nivel de formación va en su orden natural, como en el resto del tablero; lo demás, de mayor a menor. */
    const o = campo === 'nivel' ? valores.map((_, i) => i).filter((i) => valores[i] > 0) : ordenPorValor(valores)
    return limite ? o.slice(0, limite) : o
  }, [valores, limite, campo])
  const nombreDe = (i: number) => (campo === 'ies' ? c.dim.ies[i].nombre : c.dim[campo][i])
  const nombres = orden.map(nombreDe)
  const datos = orden.map((i) => valores[i])
  const elegidas = filtro ? orden.map((i) => elegidosAqui.includes(i)) : undefined
  const total = suma(valores)
  const fichas = filtro && elegidosAqui.length ? (
    <span className="filtrado-por">
      <span className="filtrado-por-tit">Filtrado por:</span>
      {elegidosAqui.map((i) => (
        <button
          key={i}
          type="button"
          className="tag tag-light-primary"
          onClick={() => p.alternarFiltro(filtro, i)}
          aria-label={'Quitar el filtro ' + nombreDe(i)}
          title={'Quitar el filtro ' + nombreDe(i)}
        >
          <span>{recortar(nombreDe(i), 32)}</span>
          <span className="btn-close" aria-hidden="true" />
        </button>
      ))}
    </span>
  ) : null
  return (
    <FichaGrafico
      titulo={titulo + ', ' + anios[anio]}
      archivo={nombreArchivo(titulo, anios[anio])}
      altoPx={alto}
      extra={fichas}
      opcion={orden.length ? (ancho: number) => barrasH(nombres, datos, opcionesBarras(ancho, { conParte: true, total, alto, elegidas })) : null}
      resumen={resumenBarras(titulo + ', ' + anios[anio], nombres, datos, total)}
      csv={csvBarras(titulo, nombres, datos)}
      alSeleccionar={filtro ? (pt) => p.alternarFiltro(filtro, orden[pt.dataIndex]) : undefined}
      pie={
        filtro ? (
          <PieConNota nota="Un clic en una barra filtra todo el tablero por esa categoría y la resalta aquí; otro clic la quita. Este gráfico no se filtra por su propia categoría." />
        ) : undefined
      }
    />
  )
}

/** Pie de una tarjeta con una nota encima de la fuente. */
function PieConNota({ nota }: { nota: string }) {
  const textos = useContext(TextosTablero)
  return (
    <Fragment>
      {nota}
      <br />
      {textos.fuente}
    </Fragment>
  )
}

/** Áreas apiladas por año de una dimensión, en cifras o en porcentaje. */
function FichaComposicion({ titulo, campo, p, porcentaje }: { titulo: string; campo: Campo; p: PropsSeccion; porcentaje?: boolean }) {
  const { c, filas, anio, anios } = p
  const series = useMemo(() => seriesDe(c, matrizPorAnio(c, filas, campo), campo), [c, filas, campo])
  return (
    <FichaGrafico
      titulo={titulo}
      archivo={nombreArchivo(titulo)}
      opcion={series.length ? (ancho: number) => areasApiladas(anios, series, { seleccion: anio, ancho, porcentaje }) : null}
      resumen={resumenComposicion(titulo, anios, series)}
      csv={csvPorAnio(anios, series)}
      alSeleccionar={(pt) => p.elegirAnio(pt.dataIndex)}
      pie={<PieConNota nota={porcentaje ? 'Cada año suma 100 %. Un clic elige el año.' : 'Un clic elige el año.'} />}
    />
  )
}

function resumenVariacion(anios: string[], variaciones: Array<number | null>, anio: number): string {
  const con = variaciones.map((v, i) => [v, i] as const).filter(([v]) => !vacio(v)) as Array<readonly [number, number]>
  if (!con.length) return 'Variación anual de la matrícula: sin datos.'
  const alza = con.reduce((a, b) => (b[0] > a[0] ? b : a))
  const caida = con.reduce((a, b) => (b[0] < a[0] ? b : a))
  return (
    'Variación anual de la matrícula. Mayor alza: ' + conSigno(alza[0]) + ' en ' + anios[alza[1]] + '. Mayor caída: ' + conSigno(caida[0]) + ' en ' + anios[caida[1]] +
    '. En ' + anios[anio] + ': ' + conSigno(variaciones[anio]) + '.'
  )
}

function Composicion(p: PropsSeccion) {
  const { c, filas, anio, anios } = p
  const serie = useMemo(() => seriePorAnio(c, filas), [c, filas])
  const variaciones = useMemo(() => serie.map((_, i) => variacion(serie, i)), [serie])
  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaComposicion titulo="Matrícula por nivel de formación, 2000-2025" campo="nivel" p={p} />
        <FichaComposicion titulo="Sector de la institución, 2000-2025" campo="sector" p={p} porcentaje />
      </Fila>
      <Fila cols={UNA}>
        <FichaGrafico
          titulo="Variación anual de la matrícula"
          archivo={nombreArchivo('variacion anual')}
          altoPx={300}
          opcion={suma(serie) ? (ancho: number) => barrasVariacion(anios, variaciones, { seleccion: anio, ancho }) : null}
          resumen={resumenVariacion(anios, variaciones, anio)}
          csv={() => ({ encabezados: ['Año', 'Matriculados', 'Variación anual (%)'], filas: anios.map((a, i) => [a, serie[i], variaciones[i] === null ? null : Number(variaciones[i]!.toFixed(1))]) })}
          alSeleccionar={(pt) => p.elegirAnio(pt.dataIndex)}
          pie={<PieConNota nota="Cambio frente al año anterior. En naranja, los años en que la matrícula bajó." />}
        />
      </Fila>
    </Fragment>
  )
}

function Instituciones(p: PropsSeccion) {
  const { c, filas, anio, anios } = p
  const delAnioIes = useMemo(() => porCategoria(c, delAnio(filas, anio), 'ies'), [c, filas, anio])
  /* Las seis con más matrícula en el año elegido, en el tiempo. */
  const series = useMemo(() => {
    const matriz = matrizPorAnio(c, filas, 'ies')
    return ordenPorValor(delAnioIes)
      .slice(0, 6)
      .map((i) => ({ nombre: c.dim.ies[i].nombre, datos: matriz[i].map((v) => v || null), color: colorDe(puestoDe(c, 'ies')[i]) }))
  }, [c, filas, delAnioIes])
  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaBarras titulo="Matrícula por institución" campo="ies" filtro="ies" p={p} alto={560} />
      </Fila>
      <Fila cols={UNA}>
        <FichaGrafico
          titulo={'Evolución de las seis instituciones con más matrícula en ' + anios[anio]}
          archivo={nombreArchivo('evolucion instituciones', anios[anio])}
          altoPx={420}
          opcion={series.length ? (ancho: number) => lineasTiempo(anios, series, { seleccion: anio, ancho, formato: num, formatoEje: compacto, unidad: 'matriculados' }) : null}
          resumen={resumenSeries('Evolución de las seis instituciones con más matrícula en ' + anios[anio], anios, series, num)}
          csv={() => ({ encabezados: ['Año', ...series.map((s) => s.nombre)], filas: anios.map((a, i) => [a, ...series.map((s) => s.datos[i] ?? 0)]) })}
          alSeleccionar={(pt) => p.elegirAnio(pt.dataIndex)}
          pie={<PieConNota nota="Los años sin punto son años en que la institución no reportó matrícula en Medellín." />}
        />
      </Fila>
    </Fragment>
  )
}

function NivelModalidad(p: PropsSeccion) {
  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaBarras titulo="Nivel de formación" campo="nivel" filtro="nivel" p={p} />
        <FichaBarras titulo="Modalidad" campo="modalidad" filtro="modalidad" p={p} />
      </Fila>
      <Fila cols={UNA}>
        <FichaComposicion titulo="Modalidad, 2000-2025" campo="modalidad" p={p} porcentaje />
      </Fila>
    </Fragment>
  )
}

function Areas(p: PropsSeccion) {
  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaBarras titulo="Área de conocimiento" campo="area" filtro="area" p={p} />
        <FichaBarras titulo="Núcleo básico del conocimiento" campo="nbc" p={p} />
      </Fila>
      <Fila cols={UNA}>
        <FichaComposicion titulo="Áreas de conocimiento, 2000-2025" campo="area" p={p} porcentaje />
      </Fila>
    </Fragment>
  )
}

function Genero(p: PropsSeccion) {
  const { c, f, filas, anio, anios } = p
  const series = useMemo(() => {
    const deMedellin = sexoPorAnio(c, filas)
    const lista: SerieTiempo[] = [{ nombre: 'Medellín', datos: participacion(deMedellin[0], deMedellin.reduce((t, s) => t.map((v, i) => v + s[i]), anios.map(() => 0))), color: COLOR_TERRITORIO.Medellín, area: false }]
    for (const t of ['Antioquia', 'Colombia'] as Territorio[]) {
      const ref = referenciaSexo(c, t, f)
      if (ref) lista.push({ nombre: t, datos: participacion(ref[0], ref.reduce((tot, s) => tot.map((v, i) => v + s[i]), anios.map(() => 0))), color: COLOR_TERRITORIO[t], discontinua: true })
    }
    return lista
  }, [c, f, filas, anios])
  const porNivel = useMemo(() => {
    const m = porCategoriaYSexo(c, delAnio(filas, anio), 'nivel')
    const presentes = c.dim.nivel.map((_, i) => i).filter((i) => suma(m[i]) > 0)
    const sexos = c.dim.sexo.map((_, s) => s).filter((s) => presentes.some((i) => m[i][s] > 0))
    return {
      categorias: presentes.map((i) => c.dim.nivel[i]),
      series: sexos.map((s) => ({ nombre: c.dim.sexo[s], datos: presentes.map((i) => m[i][s]), color: COLOR_SEXO[s] })),
    }
  }, [c, filas, anio])
  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico
          titulo="Porcentaje de mujeres en la matrícula, 2000-2025"
          archivo={nombreArchivo('porcentaje mujeres')}
          altoPx={360}
          opcion={(ancho: number) => lineasTiempo(anios, series, { seleccion: anio, ancho, formato: (v) => pct(v), formatoEje: (v) => v + '%', paridad: true })}
          resumen={resumenSeries('Porcentaje de mujeres en la matrícula', anios, series, (v) => pct(v))}
          csv={() => ({ encabezados: ['Año', ...series.map((s) => s.nombre + ' (%)')], filas: anios.map((a, i) => [a, ...series.map((s) => (s.datos[i] === null ? null : Number(s.datos[i]!.toFixed(1))))]) })}
          alSeleccionar={(pt) => p.elegirAnio(pt.dataIndex)}
          pie={<PieConNota nota="Desde 2024 el SNIES también registra matrícula de personas no binarias y trans; se cuentan en el total." />}
        />
      </Fila>
      <Fila cols={UNA}>
        <FichaGrafico
          titulo={'Matrícula por sexo y nivel de formación, ' + anios[anio]}
          archivo={nombreArchivo('sexo por nivel', anios[anio])}
          altoPx={340}
          opcion={porNivel.categorias.length ? (ancho: number) => apiladas100(porNivel.categorias, porNivel.series, ancho) : null}
          resumen={
            'Matrícula por sexo y nivel de formación, ' + anios[anio] + '. ' +
            porNivel.categorias
              .map((n, i) => {
                const total = suma(porNivel.series.map((s) => s.datos[i] ?? 0))
                return n + ': ' + porNivel.series.map((s) => s.nombre.toLowerCase() + ' ' + pct(parte(s.datos[i] ?? 0, total))).join(', ')
              })
              .join('; ') + '.'
          }
          csv={() => ({ encabezados: ['Nivel de formación', ...porNivel.series.map((s) => s.nombre)], filas: porNivel.categorias.map((n, i) => [n, ...porNivel.series.map((s) => s.datos[i])]) })}
        />
      </Fila>
    </Fragment>
  )
}

function Datos(p: PropsSeccion) {
  const { c, f, filas, anio, anios } = p
  const serieAnual = useMemo(() => {
    const serie = seriePorAnio(c, filas)
    const mujeres = sexoPorAnio(c, filas)[0]
    const ant = referenciaFiltrada(c, 'Antioquia', f)
    const col = referenciaFiltrada(c, 'Colombia', f)
    return anios.map((a, i) => {
      const r = resumenAnio(c, filas, i, serie)
      return {
        anio: a,
        medellin: serie[i],
        variacion: variacion(serie, i),
        antioquia: ant ? ant[i] : null,
        colombia: col ? col[i] : null,
        enAntioquia: ant ? parte(serie[i], ant[i]) : null,
        enColombia: col ? parte(serie[i], col[i]) : null,
        mujeres: parte(mujeres[i], serie[i]),
        ies: r.ies,
        programas: r.programas,
      }
    })
  }, [c, f, filas, anios])
  const columnasSerie: Columna[] = [
    { clave: 'anio', rotulo: 'Año', tipo: 'texto' },
    { clave: 'medellin', rotulo: 'Medellín', tipo: 'num' },
    { clave: 'variacion', rotulo: 'Variación anual', tipo: 'var' },
    { clave: 'antioquia', rotulo: 'Antioquia', tipo: 'num' },
    { clave: 'colombia', rotulo: 'Colombia', tipo: 'num' },
    { clave: 'enAntioquia', rotulo: 'Medellín en Antioquia', tipo: 'pct' },
    { clave: 'enColombia', rotulo: 'Medellín en Colombia', tipo: 'pct' },
    { clave: 'mujeres', rotulo: 'Mujeres', tipo: 'pct' },
    { clave: 'ies', rotulo: 'Instituciones', tipo: 'num' },
    { clave: 'programas', rotulo: 'Programas', tipo: 'num' },
  ]
  const programas = useMemo(
    () =>
      programasDelAnio(filas, anio).map((r) => {
        const prog = c.dim.programa[r.programa]
        return {
          programa: prog.nombre,
          codigo: prog.codigo,
          ies: c.dim.ies[prog.ies].nombre,
          nivel: c.dim.nivel[r.nivel],
          modalidad: c.dim.modalidad[r.modalidad],
          area: c.dim.area[r.area],
          sector: c.dim.sector[r.sector],
          matriculados: r.matriculados,
          mujeres: parte(r.mujeres, r.matriculados),
        }
      }),
    [c, filas, anio],
  )
  const columnasProgramas: Columna[] = [
    { clave: 'programa', rotulo: 'Programa', tipo: 'texto', ancho: 260 },
    { clave: 'codigo', rotulo: 'Código SNIES', tipo: 'texto' },
    { clave: 'ies', rotulo: 'Institución', tipo: 'texto', ancho: 220 },
    { clave: 'nivel', rotulo: 'Nivel de formación', tipo: 'texto' },
    { clave: 'modalidad', rotulo: 'Modalidad', tipo: 'texto' },
    { clave: 'area', rotulo: 'Área de conocimiento', tipo: 'texto', ancho: 200 },
    { clave: 'sector', rotulo: 'Sector', tipo: 'texto' },
    { clave: 'matriculados', rotulo: 'Matriculados', tipo: 'num' },
    { clave: 'mujeres', rotulo: 'Mujeres', tipo: 'pct' },
  ]
  const titProgramas = 'Programas con matrícula en ' + anios[anio]
  const [busqueda, setBusqueda] = useState('')
  const encontrados = useMemo(() => {
    const t = sinTilde(busqueda.trim())
    if (!t) return programas
    return programas.filter((r) => sinTilde(r.programa + ' ' + r.ies + ' ' + r.codigo).includes(t))
  }, [programas, busqueda])
  return (
    <Fragment>
      <Fila cols={UNA}>
        <Ficha
          titulo="Serie anual 2000-2025"
          id="ficha-serie-anual"
          accion={<Descargas csv={csvDeTabla(columnasSerie, serieAnual)} nombre={nombreArchivo('serie anual')} titulo="Serie anual 2000-2025" />}
        >
          <Tabla columnas={columnasSerie} filas={serieAnual} orden="anio" altura={560} resaltar={(f) => f.anio === anios[anio]} />
        </Ficha>
      </Fila>
      <Fila cols={UNA}>
        <Ficha
          titulo={titProgramas}
          id="ficha-programas"
          accion={<Descargas csv={csvDeTabla(columnasProgramas, encontrados)} nombre={nombreArchivo('programas', anios[anio])} titulo={titProgramas} />}
        >
          <div className="buscador-tabla">
            <label className="form-label" htmlFor="buscar-programa">
              Buscar programa, institución o código SNIES
            </label>
            <input
              id="buscar-programa"
              className="form-control"
              type="search"
              value={busqueda}
              placeholder="Por ejemplo: medicina, ITM o 1234"
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <p className="nota-grafico mb-2" aria-live="polite">
              {busqueda.trim() ? num(encontrados.length) + ' de ' + num(programas.length) + ' programas' : num(programas.length) + ' programas'}
            </p>
          </div>
          <Tabla columnas={columnasProgramas} filas={encontrados} orden="matriculados" altura={560} limite={300} />
        </Ficha>
      </Fila>
    </Fragment>
  )
}

interface Seccion {
  id: string
  rotulo: string
  panel: (props: PropsSeccion) => ReactNode
}

const SECCIONES: Seccion[] = [
  { id: 'composicion', rotulo: 'Composición', panel: Composicion },
  { id: 'instituciones', rotulo: 'Instituciones', panel: Instituciones },
  { id: 'nivel', rotulo: 'Nivel y modalidad', panel: NivelModalidad },
  { id: 'areas', rotulo: 'Áreas de conocimiento', panel: Areas },
  { id: 'genero', rotulo: 'Género', panel: Genero },
  { id: 'datos', rotulo: 'Datos', panel: Datos },
]

/* =================================================================== */
/*  Evolución: la línea de tiempo                                       */
/* =================================================================== */

type Modo = 'matriculados' | 'indice' | 'participacion'

/* Márgenes del gráfico de la evolución cuando la tira de años hace de eje, y desde qué ancho. */
const EJE_EVOLUCION: EjeFijo = { left: 64, right: 52 }
const ANCHO_TIRA_COMO_EJE = 1000

const MODOS: Array<{ modo: Modo; rotulo: string }> = [
  { modo: 'matriculados', rotulo: 'Matriculados' },
  { modo: 'indice', rotulo: 'Índice 2000 = 100' },
  { modo: 'participacion', rotulo: 'Participación' },
]

function Evolucion({
  anios,
  serie,
  antioquia,
  colombia,
  anio,
  elegirAnio,
  modo,
  setModo,
}: {
  anios: string[]
  serie: number[]
  antioquia: number[] | null
  colombia: number[] | null
  anio: number
  elegirAnio: (i: number) => void
  modo: Modo
  setModo: (m: Modo) => void
}) {
  /* Con espacio, la tira de años va justo debajo del gráfico como su eje: cada año bajo su punto. */
  const cuerpo = useRef<HTMLDivElement>(null)
  const [anchoCuerpo, setAnchoCuerpo] = useState(0)
  useEffect(() => {
    const el = cuerpo.current
    if (!el) return undefined
    const medir = () => setAnchoCuerpo(el.clientWidth)
    medir()
    const obs = window.ResizeObserver ? new ResizeObserver(medir) : null
    obs?.observe(el)
    return () => obs?.disconnect()
  }, [])
  const eje = anchoCuerpo >= ANCHO_TIRA_COMO_EJE ? EJE_EVOLUCION : undefined
  const comparable = Boolean(antioquia && colombia)
  /* El modo que se ve: Participación necesita las dos referencias; sin ellas se muestra Matriculados (y se recuerda la
     preferencia para cuando se quiten los filtros). */
  const efectivo: Modo = modo === 'participacion' && !comparable ? 'matriculados' : modo
  const { recorte } = useContext(TextosTablero)
  const titulo = 'Evolución de la matrícula en Medellín, ' + anios[0] + '-' + anios[anios.length - 1]
  const principal = recorte || 'Medellín'

  const { opcion, csv, nota, resumen } = useMemo(() => {
    if (efectivo === 'indice') {
      const series: SerieTiempo[] = [{ nombre: principal, datos: indice(serie), color: COLOR_TERRITORIO.Medellín }]
      if (antioquia) series.push({ nombre: 'Antioquia', datos: indice(antioquia), color: COLOR_TERRITORIO.Antioquia, discontinua: true })
      if (colombia) series.push({ nombre: 'Colombia', datos: indice(colombia), color: COLOR_TERRITORIO.Colombia, discontinua: true })
      return {
        opcion: (ancho: number) => lineasTiempo(anios, series, { seleccion: anio, ancho, formato: (v) => decimal(v), formatoEje: (v) => String(v), eje }),
        csv: () => ({
          encabezados: ['Año', ...series.map((s) => s.nombre + ' (índice ' + anios[0] + ' = 100)')],
          filas: anios.map((a, i) => [a, ...series.map((s) => (s.datos[i] === null ? null : Number(s.datos[i]!.toFixed(1))))]),
        }),
        nota: 'Cada territorio vale 100 en ' + anios[0] + ': compara cuánto creció cada uno, no su tamaño.',
        resumen: resumenSeries('Índice de la matrícula, ' + anios[0] + ' = 100', anios, series, (v) => decimal(v)),
      }
    }
    if (efectivo === 'participacion' && antioquia && colombia) {
      const series: SerieTiempo[] = [
        { nombre: 'Medellín en Antioquia', datos: participacion(serie, antioquia), color: COLOR_TERRITORIO.Antioquia },
        { nombre: 'Medellín en Colombia', datos: participacion(serie, colombia), color: COLOR_TERRITORIO.Colombia },
      ]
      return {
        opcion: (ancho: number) =>
          lineasTiempo(anios, series, { seleccion: anio, ancho, formato: (v) => pct(v), formatoEje: (v) => v + '%', eje, desdeCero: true, rotularTodas: true }),
        csv: () => ({
          encabezados: ['Año', 'Medellín', 'Antioquia', 'Colombia', 'Medellín en Antioquia (%)', 'Medellín en Colombia (%)'],
          filas: anios.map((a, i) => [a, serie[i], antioquia[i], colombia[i], ...series.map((s) => (s.datos[i] === null ? null : Number(s.datos[i]!.toFixed(1))))]),
        }),
        nota: 'Qué parte de la matrícula de Antioquia y de la del país está en Medellín.',
        resumen: resumenSeries('Participación de Medellín en la matrícula', anios, series, (v) => pct(v)),
      }
    }
    const series: SerieTiempo[] = [{ nombre: principal, datos: serie, color: COLOR_TERRITORIO.Medellín, area: true }]
    return {
      opcion: suma(serie)
        ? (ancho: number) => lineasTiempo(anios, series, { seleccion: anio, ancho, formato: num, formatoEje: compacto, unidad: 'matriculados', desdeCero: true, eje })
        : null,
      csv: () => ({ encabezados: ['Año', 'Matriculados: ' + principal], filas: anios.map((a, i) => [a, serie[i]]) }),
      nota: 'Un clic en un punto, o en un año de la tira, elige el año que muestran los indicadores y las secciones.',
      resumen: resumenSeries('Matrícula por año', anios, series, num),
    }
  }, [efectivo, anios, serie, antioquia, colombia, anio, eje, principal])

  const refsAnios = useRef<Array<HTMLButtonElement | null>>([])
  /* Cuando la tira se recorre de lado (pantallas angostas), el año elegido queda a la vista, sin mover la página. */
  const tira = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const caja = tira.current
    const boton = refsAnios.current[anio]
    if (!caja || !boton || caja.scrollWidth <= caja.clientWidth) return
    caja.scrollLeft = boton.offsetLeft - caja.offsetLeft - (caja.clientWidth - boton.offsetWidth) / 2
  }, [anio, eje])
  const teclasAnio = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = siguiente(e.key, i, anios.length, false)
    if (n === null) return
    e.preventDefault()
    elegirAnio(n)
    refsAnios.current[n]?.focus()
  }

  /* Los modos son botones de opción: una sola parada de tabulación y flechas para cambiar (saltan el desactivado). */
  const refsModos = useRef<Array<HTMLButtonElement | null>>([])
  const disponibles = MODOS.filter((m) => m.modo !== 'participacion' || comparable)
  const teclasModo = (e: KeyboardEvent<HTMLButtonElement>, m: Modo) => {
    const i = disponibles.findIndex((d) => d.modo === m)
    const n = siguiente(e.key, i, disponibles.length, true)
    if (n === null) return
    e.preventDefault()
    setModo(disponibles[n].modo)
    refsModos.current[MODOS.findIndex((d) => d.modo === disponibles[n].modo)]?.focus()
  }

  const instancia = useRef<EChartsType | null>(null)
  const alIniciar = useCallback((ec: EChartsType | null) => {
    instancia.current = ec
  }, [])
  return (
    <section className="card card-lg evolucion mb-4" data-bs-theme="light" aria-labelledby="evolucion-tit">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div className="ficha-titulos">
          <h2 className="card-title mb-0" id="evolucion-tit">
            {titulo}
          </h2>
          {recorte ? <p className="ficha-recorte">{recorte}</p> : null}
        </div>
        <span className="d-flex flex-wrap align-items-center gap-2">
          <div className="modos" role="radiogroup" aria-label="Forma de ver la evolución">
            {MODOS.map((m, i) => {
              const inactivo = m.modo === 'participacion' && !comparable
              return (
                <button
                  key={m.modo}
                  ref={(el) => {
                    refsModos.current[i] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={efectivo === m.modo}
                  tabIndex={efectivo === m.modo ? 0 : -1}
                  className="modo"
                  disabled={inactivo}
                  aria-describedby={inactivo ? 'evolucion-nota' : undefined}
                  onClick={() => setModo(m.modo)}
                  onKeyDown={(e) => teclasModo(e, m.modo)}
                >
                  {m.rotulo}
                </button>
              )
            })}
          </div>
          <Descargas csv={csv} instancia={instancia} titulo={titulo} nombre={nombreArchivo('evolucion', efectivo)} />
        </span>
      </div>
      <div className="card-body" ref={cuerpo}>
        {opcion ? (
          <Grafico key={efectivo} opcion={opcion} altoPx={400} alIniciar={alIniciar} alSeleccionar={(p) => elegirAnio(p.dataIndex)} resumen={resumen} />
        ) : (
          <SinDatos />
        )}
        <div
          ref={tira}
          className={'linea-anios' + (eje ? ' como-eje' : '')}
          role="radiogroup"
          aria-label="Año"
          style={eje ? ({ '--n': anios.length, '--izq': eje.left + 'px', '--der': eje.right + 'px' } as CSSProperties) : undefined}
        >
          {anios.map((a, i) => (
            <button
              key={a}
              ref={(el) => {
                refsAnios.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={i === anio}
              tabIndex={i === anio ? 0 : -1}
              className="anio"
              onClick={() => elegirAnio(i)}
              onKeyDown={(e) => teclasAnio(e, i)}
            >
              {a}
            </button>
          ))}
        </div>
        <p className="nota-grafico mb-0" id="evolucion-nota">
          {nota}
          {!comparable ? ' La participación no está disponible con filtros de institución, modalidad o área: no hay cifra comparable de Antioquia y Colombia.' : ''}
        </p>
      </div>
    </section>
  )
}

/** Tecla de un grupo de opciones (flechas, Inicio y Fin): la posición siguiente, o null si la tecla no aplica. */
function siguiente(tecla: string, i: number, total: number, circular: boolean): number | null {
  const ultimo = total - 1
  if (tecla === 'Home') return 0
  if (tecla === 'End') return ultimo
  const paso = tecla === 'ArrowRight' || tecla === 'ArrowDown' ? 1 : tecla === 'ArrowLeft' || tecla === 'ArrowUp' ? -1 : 0
  if (!paso) return null
  const n = i + paso
  return circular ? (n + total) % total : Math.min(ultimo, Math.max(0, n))
}

/**
 * Barra fija arriba con el año elegido y sus cifras, para cambiar de año desde las secciones sin volver a la línea de
 * tiempo. Solo aparece cuando los indicadores salieron de la vista.
 */
function BarraAnio({
  visible,
  anios,
  anio,
  elegirAnio,
  matriculados,
  variacion: cambio,
  recorte,
}: {
  visible: boolean
  anios: string[]
  anio: number
  elegirAnio: (i: number) => void
  matriculados: number
  variacion: number | null
  recorte: string
}) {
  if (!visible) return null
  return (
    <div className="barra-anio" role="region" aria-label="Año elegido">
      <button type="button" className="barra-anio-paso" onClick={() => elegirAnio(anio - 1)} disabled={anio === 0} aria-label={anio ? 'Año anterior: ' + anios[anio - 1] : 'Año anterior'}>
        <Icono nombre="chevron_left" />
      </button>
      <span className="barra-anio-anio">{anios[anio]}</span>
      <button
        type="button"
        className="barra-anio-paso"
        onClick={() => elegirAnio(anio + 1)}
        disabled={anio === anios.length - 1}
        aria-label={anio < anios.length - 1 ? 'Año siguiente: ' + anios[anio + 1] : 'Año siguiente'}
      >
        <Icono nombre="chevron_right" />
      </button>
      <span className="barra-anio-cifra">
        <b>{num(matriculados)}</b> matriculados <span className="barra-anio-cambio">{conSigno(cambio)}</span>
      </span>
      {recorte ? <span className="barra-anio-recorte">{recorte}</span> : null}
    </div>
  )
}

/* =================================================================== */
/*  Filtros                                                             */
/* =================================================================== */

const CAMPOS_FILTRO: Array<{ campo: keyof FiltrosHistoricos; etiqueta: string; vacio: string }> = [
  { campo: 'ies', etiqueta: 'Institución', vacio: 'Todas' },
  { campo: 'sector', etiqueta: 'Sector', vacio: 'Todos' },
  { campo: 'nivel', etiqueta: 'Nivel de formación', vacio: 'Todos' },
  { campo: 'modalidad', etiqueta: 'Modalidad', vacio: 'Todas' },
  { campo: 'area', etiqueta: 'Área de conocimiento', vacio: 'Todas' },
]

function Filtros({ c, f, cambiar }: { c: MatriculaHistorica; f: FiltrosHistoricos; cambiar: (parcial: Partial<FiltrosHistoricos>) => void }) {
  const rotulos = useMemo(
    () =>
      Object.fromEntries(
        CAMPOS_FILTRO.map(({ campo }) => [campo, (i: number) => (campo === 'ies' ? c.dim.ies[i].nombre : c.dim[campo][i])]),
      ) as Record<keyof FiltrosHistoricos, (i: number) => string>,
    [c],
  )
  const opciones = useMemo(
    () =>
      Object.fromEntries(
        CAMPOS_FILTRO.map(({ campo }) => {
          const lista = opcionesDisponibles(c, f, campo)
          return [campo, campo === 'ies' ? lista.sort((a, b) => rotulos.ies(a).localeCompare(rotulos.ies(b), 'es')) : lista.sort((a, b) => a - b)]
        }),
      ) as Record<keyof FiltrosHistoricos, number[]>,
    [c, f, rotulos],
  )
  /* En celulares los filtros empiezan plegados: lo primero que se ve es la evolución. En pantallas anchas el botón no
     se muestra y los filtros siempre están abiertos (ver tablero-historica.css). */
  const [plegado, setPlegado] = useState(true)
  const aplicados = CAMPOS_FILTRO.reduce((n, { campo }) => n + f[campo].length, 0)
  return (
    <section className="card card-lg filtros" aria-labelledby="filtros-tit" data-plegado={plegado ? 'si' : 'no'}>
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h2 className="card-title mb-0" id="filtros-tit">
            Filtros
          </h2>
          <p className="filtros-subtitulo">Se aplican a todos los años: la evolución, los indicadores, los gráficos y las tablas.</p>
        </div>
        <button type="button" className="btn btn-outline-neutral btn-sm filtros-alternar" aria-expanded={!plegado} aria-controls="filtros-cuerpo" onClick={() => setPlegado((v) => !v)}>
          <Icono nombre="tune" />
          {(plegado ? 'Mostrar filtros' : 'Ocultar filtros') + (aplicados ? ' (' + aplicados + ')' : '')}
        </button>
      </div>
      <div className="card-body" id="filtros-cuerpo">
        <div className="filtros-filas">
          <div className="filtros-rejilla" style={{ '--cols': CAMPOS_FILTRO.length } as CSSProperties}>
            {CAMPOS_FILTRO.map(({ campo, etiqueta, vacio: resumenVacio }) => (
              <div key={campo}>
                <label className="form-label" htmlFor={'sel-' + clave(etiqueta)}>
                  {etiqueta}
                </label>
                <SelectorMultiple
                  etiqueta={etiqueta}
                  opciones={opciones[campo]}
                  valores={f[campo]}
                  onCambio={(v) => cambiar({ [campo]: v })}
                  rotulo={rotulos[campo]}
                  resumenVacio={resumenVacio}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Fichas con los filtros activos; cada una se retira con un clic. */
function FichasActivas({ c, f, cambiar, limpiar }: { c: MatriculaHistorica; f: FiltrosHistoricos; cambiar: (parcial: Partial<FiltrosHistoricos>) => void; limpiar: () => void }) {
  const fichas = CAMPOS_FILTRO.flatMap(({ campo, etiqueta }) =>
    f[campo].map((i) => ({
      etiqueta,
      texto: campo === 'ies' ? c.dim.ies[i].nombre : c.dim[campo][i],
      quitar: () => cambiar({ [campo]: f[campo].filter((x) => x !== i) }),
    })),
  )
  if (!fichas.length) return null
  return (
    <div className="fichas-activas">
      <span className="fichas-activas-tit">Filtros aplicados</span>
      {fichas.map((ficha) => (
        <button
          key={ficha.etiqueta + ficha.texto}
          type="button"
          className="tag tag-light-primary"
          onClick={ficha.quitar}
          title={'Quitar ' + ficha.etiqueta + ': ' + ficha.texto}
          aria-label={'Quitar ' + ficha.etiqueta + ': ' + ficha.texto}
        >
          <span>
            {ficha.etiqueta}: {recortar(ficha.texto, 38)}
          </span>
          <span className="btn-close" aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="btn-filtro ms-auto" onClick={limpiar}>
        <Icono nombre="ink_eraser" />
        Borrar todos
      </button>
    </div>
  )
}

/* =================================================================== */
/*  Aplicación                                                          */
/* =================================================================== */

export default function TableroMatriculaHistorica({ datos: c }: { datos: MatriculaHistorica }) {
  const anios = useMemo(() => c.anios.map(String), [c])
  /* El estado empieza con lo que traiga la dirección (un enlace compartido) y la va actualizando. */
  const porDefecto = useMemo(() => ({ anio: c.anios.length - 1, seccion: SECCIONES[0].id, modo: 'matriculados' }), [c])
  const [inicial] = useState(() => leerEstado(c, window.location.search, porDefecto))
  const [anio, setAnio] = useState(inicial.anio)
  const [tab, setTab] = useState(() => Math.max(0, SECCIONES.findIndex((s) => s.id === inicial.seccion)))
  const [modo, setModo] = useState<Modo>(() => (MODOS.some((m) => m.modo === inicial.modo) ? (inicial.modo as Modo) : 'matriculados'))
  const [filtros, setFiltros] = useState<FiltrosHistoricos>(inicial.filtros)
  const refsTab = useRef<Array<HTMLButtonElement | null>>([])
  const sec = SECCIONES[tab]

  useEffect(() => {
    const busqueda = escribirEstado(c, { anio, seccion: SECCIONES[tab].id, modo, filtros }, porDefecto)
    if (busqueda === window.location.search) return
    window.history.replaceState(window.history.state, '', window.location.pathname + busqueda + window.location.hash)
  }, [c, anio, tab, modo, filtros, porDefecto])

  /* La barra del año aparece cuando los indicadores salen de la vista, para seguir cambiando de año en las secciones. */
  const indicadores = useRef<HTMLElement>(null)
  const [conBarra, setConBarra] = useState(false)
  useEffect(() => {
    const el = indicadores.current
    if (!el || !window.IntersectionObserver) return undefined
    const obs = new IntersectionObserver(([e]) => setConBarra(!e.isIntersecting && e.boundingClientRect.top < 0))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const recorte = useMemo(() => textoRecorte(c, filtros), [c, filtros])
  const textos = useMemo<Textos>(
    () => ({
      fuente: 'Fuente: ' + c.meta.fuente + '.',
      nota: 'Fuente: SNIES (MEN), matrícula anual oficial. Observatorio de Educación de Sapiencia.',
      recorte,
    }),
    [c, recorte],
  )

  const filas = useMemo(() => filtrar(c, filtros), [c, filtros])
  const serie = useMemo(() => seriePorAnio(c, filas), [c, filas])
  const antioquia = useMemo(() => referenciaFiltrada(c, 'Antioquia', filtros), [c, filtros])
  const colombia = useMemo(() => referenciaFiltrada(c, 'Colombia', filtros), [c, filtros])
  const res = useMemo(() => resumenAnio(c, filas, anio, serie), [c, filas, anio, serie])

  const cambiar = useCallback((parcial: Partial<FiltrosHistoricos>) => setFiltros((f) => ({ ...f, ...parcial })), [])
  const limpiar = useCallback(() => setFiltros(FILTROS_VACIOS), [])
  const elegirAnio = useCallback((i: number) => {
    if (Number.isInteger(i) && i >= 0) setAnio(i)
  }, [])
  const alternarFiltro = useCallback((campo: keyof FiltrosHistoricos, i: number) => setFiltros((f) => ({ ...f, [campo]: alternar(f[campo], i) })), [])

  /* Las flechas, Inicio y Fin recorren los botones de sección. */
  const teclas = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return
    const n = siguiente(e.key, i, SECCIONES.length, true)
    if (n === null) return
    e.preventDefault()
    setTab(n)
    refsTab.current[n]?.focus()
  }

  const elAnio = anios[anio]
  const enColombia = colombia ? parte(res.matriculados, colombia[anio]) : null
  const fuera = c.meta.fueraDelDatoAnual[anio] ?? 0
  const Panel = sec.panel
  const props: PropsSeccion = { c, f: filtros, filas, anio, anios, elegirAnio, alternarFiltro }

  return (
    <TextosTablero.Provider value={textos}>
        <div className="body container-fluid p-4 p-xl-8">
          <nav aria-label="Ruta de navegación">
            <ol className="breadcrumb">
              <li className="breadcrumb-item">
                <a href="https://sapiencia.gov.co/observatorio/">Observatorio</a>
              </li>
              <li className="breadcrumb-item">
                <a href="/sivu#tableros">SIVU</a>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                Matrícula en educación superior 2000-2025
              </li>
            </ol>
          </nav>

          <Filtros c={c} f={filtros} cambiar={cambiar} />
          <FichasActivas c={c} f={filtros} cambiar={cambiar} limpiar={limpiar} />

          <Evolucion anios={anios} serie={serie} antioquia={antioquia} colombia={colombia} anio={anio} elegirAnio={elegirAnio} modo={modo} setModo={setModo} />

          {/* El cambio de año o de filtros cambia los indicadores: se anuncia a los lectores de pantalla. */}
          <p className="visually-hidden" aria-live="polite">
            {'Año ' + elAnio + ': ' + num(res.matriculados) + ' matriculados' + (recorte ? ', ' + recorte : ' en Medellín') + '.'}
          </p>

          <BarraAnio
            visible={conBarra}
            anios={anios}
            anio={anio}
            elegirAnio={elegirAnio}
            matriculados={res.matriculados}
            variacion={res.variacion}
            recorte={recorte}
          />

          <section ref={indicadores} className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xxl-6 g-4 mb-5" aria-label={'Indicadores de ' + elAnio}>
            <div className="col">
              <Kpi icono="groups" familia="secondary" etiqueta={'Matriculados en ' + elAnio} valor={num(res.matriculados)} pie={recorte || 'Medellín, matrícula anual'} />
            </div>
            <div className="col">
              <Kpi
                icono={(res.variacion ?? 0) < 0 ? 'trending_down' : 'trending_up'}
                familia="info"
                etiqueta="Variación anual"
                valor={conSigno(res.variacion)}
                pie={res.anterior === null ? 'Primer año de la serie' : 'Frente a ' + anios[anio - 1] + ': ' + num(res.anterior)}
              />
            </div>
            <div className="col">
              <Kpi
                icono="public"
                familia="primary"
                etiqueta="Participación en Colombia"
                valor={pct(enColombia)}
                pie={colombia ? 'De ' + num(colombia[anio]) + ' en el país' : 'No aplica con los filtros elegidos'}
              />
            </div>
            <div className="col">
              <Kpi icono="account_balance" familia="tertiary-pink" etiqueta="Instituciones" valor={num(res.ies)} pie={'Con matrícula en ' + elAnio} />
            </div>
            <div className="col">
              <Kpi icono="menu_book" familia="success" etiqueta="Programas" valor={num(res.programas)} pie={'Con matrícula en ' + elAnio} />
            </div>
            <div className="col">
              <Kpi icono="female" familia="warning" etiqueta="Mujeres" valor={pct(res.pctMujeres)} pie={num(res.mujeres) + ' matriculadas'} />
            </div>
          </section>

          <section className="secciones">
            <h2 className="visually-hidden">Secciones del tablero</h2>
            <div className="tabs" role="tablist" aria-label="Secciones del tablero">
              {SECCIONES.map((s, i) => (
                <button
                  key={s.id}
                  ref={(el) => {
                    refsTab.current[i] = el
                  }}
                  type="button"
                  className="tab"
                  role="tab"
                  id={'tab-' + s.id}
                  aria-controls={i === tab ? 'panel-' + s.id : undefined}
                  aria-selected={i === tab}
                  tabIndex={i === tab ? 0 : -1}
                  onClick={() => setTab(i)}
                  onKeyDown={(e) => teclas(e, i)}
                >
                  <span className="tab-sec">Sección {i + 1}</span>
                  <span className="tab-tit">{s.rotulo}</span>
                </button>
              ))}
            </div>
          </section>

          <div id={'panel-' + sec.id} role="tabpanel" aria-labelledby={'tab-' + sec.id}>
            <Panel key={sec.id} {...props} />
          </div>

          <section className="nota-pie" aria-label="Notas sobre los datos">
            <p>
              <b>Dato anual.</b> La matrícula de cada año es la que el SNIES marca como oficial: el primer semestre en todas
              las instituciones, salvo el SENA, que reporta su matrícula anual en el segundo semestre.
            </p>
            {fuera ? (
              <p>
                <b>Fuera del dato anual en {elAnio}.</b> {num(fuera)} matriculados de programas que ese año solo reportaron el semestre
                que no es el oficial.
              </p>
            ) : null}
            <p>
              <b>Categorías.</b> Los nombres cambian entre años en el SNIES: se unificaron niveles (por ejemplo, «Universitaria» y
              «Universitario»), modalidades, núcleos básicos del conocimiento, sectores y sexo. Hasta 2013 la especialización no
              viene desagregada, por eso va en un solo nivel. Medellín es el municipio donde se ofrece el programa.
            </p>
            <p>
              <b>Fuente.</b> {c.meta.fuente}. Datos procesados el {fechaLarga(c.meta.generado)}.
            </p>
          </section>
        </div>
    </TextosTablero.Provider>
  )
}
