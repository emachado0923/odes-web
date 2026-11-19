/* ====================================================================== */
/*  Tablero beneficiarios de los fondos de Sapiencia (2026)               */
/*  Observatorio de Educación de Sapiencia                                */
/*                                                                        */
/*  Mismo aspecto que el tablero de matrícula (../matricula): las piezas  */
/*  visuales (formatos, descargas, selectores, bienvenida, tarjetas,      */
/*  gráficos de barras, anillo, tabla, indicadores y filtros) son copias  */
/*  tipadas de TableroMatricula.tsx, con sus mismas clases y estilos      */
/*  (tablero-matricula.css; lo propio, en tablero-fondos.css). No se      */
/*  importa nada de allá: ese módulo lee window.ODES al importarse.       */
/*                                                                        */
/*  Los datos llegan por props (PaginaFondos.tsx, desde                   */
/*  /api/sivu/tableros/fondos-2026) y los cálculos son los de             */
/*  calculos.ts, puros y probados aparte. Cambios frente a matrícula:     */
/*  el periodo es un filtro de un solo valor, las series por periodo se   */
/*  recorren con un control (y resaltan el periodo elegido), las barras   */
/*  y las apiladas aceptan un color por categoría (los estados tienen     */
/*  colores fijos), los montos van en millones de pesos y las descargas   */
/*  llevan nombre de archivo y la fuente (definiciones.nota) en el CSV.   */
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
import { LOGO_OBSERVATORIO } from '../recursos/recursos'
import {
  activosPorCategoria,
  activosPorPrograma,
  alternar,
  beneficiosPorPeriodo,
  type CampoFiltro,
  cohortesPorConvocatoria,
  conValor,
  destinosPorConvocatoria,
  destinosPorPais,
  estadosDelPeriodo,
  estadosPorPeriodo,
  estadosPorPrograma,
  fechaLarga,
  filasDetalle,
  filtrosIniciales,
  type FiltrosFondos,
  filtrosQueNoAplican,
  girosPorPeriodo,
  girosPorPrograma,
  lineasDe,
  millones,
  millonesCorto,
  opcionesConvocatoria,
  opcionesPrograma,
  ordenPorValor,
  periodosRegulares,
  programasConDesglose,
  resumir,
  suma,
  textoNoAplican,
  ventana,
} from './calculos'
import type { ConjuntoFondos, DatosTableroFondos, DefinicionesFondos } from './tipos'

/* ---------------------------------------------------------------- color */

/* Rubik, la letra de la plantilla de Sapiencia. PaginaFondos espera a que
   cargue antes de montar el tablero, porque el lienzo pinta con la letra que
   haya en ese momento. */
const TIPO = '"Rubik", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

/* Todo el texto de los gráficos comparte tamaño y queda por debajo del de la
   interfaz, para que las cifras no compitan con los títulos. */
const TAM = 10.5

/* Alto único de las tarjetas de gráfico. Las categorías que no caben se
   recorren con el control lateral (o inferior) del propio gráfico. */
const ALTO = 380

/* Gráficos de barras: los mismos tamaños que en matrícula. */
const TAM_BARRAS = 12
const TAM_CIFRA = 15
const TAM_PARTE = 13

/* Colores de la plantilla de Sapiencia, los mismos de matrícula. */
const BASE = '#0B3A56'
const AZUL = '#3AB6E6'
const MORADO = '#9B48A4'
const NARANJA = '#ED7203'
const VERDE = '#2EA14E'

const SERIES = [BASE, AZUL, MORADO, NARANJA]

/* Cada dimensión conserva su color en todo el tablero. */
const COLOR = {
  periodo: BASE,
  programa: MORADO,
  monto: VERDE,
  convocatoria: AZUL,
  comuna: NARANJA,
  institucion: BASE,
  pais: AZUL,
  destino: NARANJA,
}

/* Tintas y líneas: los grises (neutral) del kit. */
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

/** Texto blanco sobre colores oscuros y negro sobre los claros. */
function tintaSobre(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lineal = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * lineal((n >> 16) & 255) + 0.7152 * lineal((n >> 8) & 255) + 0.0722 * lineal(n & 255)
  return l > 0.4 ? TINTA : '#fff'
}

/* Cada estado tiene su color en todo el tablero, en el orden de recorrido:
   los cinco de la plantilla y, para los demás, tonos que se distinguen de
   ellos (el amarillo y el rojo de los pasos de la bienvenida y un gris). */
const COLOR_ESTADO: Record<string, string> = {
  Activo: BASE,
  Suspensión: NARANJA,
  'Finalizó los giros': AZUL,
  Graduado: VERDE,
  'Periodo de gracia': MORADO,
  'Proceso de consolidación': aclarar(MORADO, 0.5),
  'Cobro o condonación (PACC)': '#F8DB1B',
  Desertor: '#C62F2F',
  'Terminación o cancelación': '#6B747A',
}

const colorEstado = (nombre: string, i: number): string => COLOR_ESTADO[nombre] ?? SERIES[i % SERIES.length]

/* -------------------------------------------------------------- formatos */

const fNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const vacio = (v: number | null | undefined): boolean => v === null || v === undefined || Number.isNaN(v)
const num = (v: number | null | undefined): string => (vacio(v) ? '—' : fNum.format(Math.round(v as number)))
const pct = (v: number | null | undefined, d = 1): string => (vacio(v) ? '—' : (v as number).toFixed(d).replace('.', ',') + '%')
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

const nombreArchivo = (partes: Array<string | false | null | undefined>): string =>
  partes
    .filter((p): p is string => Boolean(p))
    .map(clave)
    .join('_')

const ARCH = 'fondos-sapiencia-2026'

/* =================================================================== */
/*  Textos del tablero                                                  */
/* =================================================================== */

/** definiciones.json: fuente, nota, observatorio… (lo usan las tarjetas y las descargas). */
const Textos = createContext<DefinicionesFondos>({})

/* =================================================================== */
/*  Descargas                                                           */
/* =================================================================== */

type ValorCsv = string | number | null | undefined
interface DatosCsv {
  encabezados: string[]
  filas: ValorCsv[][]
}

function descargarCsv(nombre: string, datos: DatosCsv, nota?: string) {
  const celda = (v: ValorCsv) => {
    if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return ''
    if (typeof v === 'number') return String(v).replace('.', ',')
    const t = String(v)
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
  }
  const lineas: ValorCsv[][] = [datos.encabezados, ...datos.filas]
  if (nota) lineas.push([], [nota])
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

function descargarPng(ec: EChartsType, nombre: string, titulo: string, textos: DefinicionesFondos) {
  const pr = 3
  const base = ec.getDataURL({ type: 'png', pixelRatio: pr, backgroundColor: '#fff' })
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
    c.fillText(textos.observatorio ?? '', margen, 54 * pr)

    c.strokeStyle = LINEA
    c.lineWidth = 1 * pr
    c.beginPath()
    c.moveTo(margen, cabecera - 8 * pr)
    c.lineTo(lienzo.width - margen, cabecera - 8 * pr)
    c.stroke()

    c.drawImage(img, 0, cabecera)

    c.fillStyle = GRIS
    c.font = 10 * pr + 'px ' + TIPO
    c.fillText(textos.nota ?? '', margen, img.height + cabecera + pie / 2)

    const a = document.createElement('a')
    a.href = lienzo.toDataURL('image/png')
    a.download = nombre + '.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  img.src = base
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
  nombre?: string
}) {
  const textos = useContext(Textos)
  return (
    <span className="acciones-grafico">
      {csv ? (
        <BotonIcono
          icono="download"
          rotulo="Descargar los datos en CSV"
          onClick={() => {
            const d = csv()
            if (d) descargarCsv(nombre || 'datos_odes', d, textos.nota)
          }}
        />
      ) : null}
      {instancia ? (
        <BotonIcono
          icono="image"
          rotulo="Descargar el gráfico en PNG"
          onClick={() => {
            const ec = instancia.current
            if (ec) descargarPng(ec, nombre || 'grafico_odes', titulo, textos)
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
function useBuscar<T>(opciones: readonly T[], texto: string, rotulo: (v: T) => string, secundario?: (v: T) => string): T[] {
  return useMemo(() => {
    if (!texto) return opciones.slice(0, 400)
    const t = sinTilde(texto)
    return opciones
      .filter((o) => sinTilde(rotulo(o)).includes(t) || (secundario ? sinTilde(secundario(o)).includes(t) : false))
      .slice(0, 400)
  }, [opciones, texto, rotulo, secundario])
}

interface PropsSelector<T extends string | number> {
  etiqueta: string
  opciones: readonly T[]
  valores: readonly T[]
  onCambio: (valores: T[]) => void
  rotulo: (v: T) => string
  secundario?: (v: T) => string
  resumenVacio?: string
}

/**
 * Selector de varias categorías con buscador, con las piezas de la plantilla:
 * un botón con el aspecto de form-select y, al abrirlo, un dropdown-menu con
 * un form-control para buscar y una casilla (form-check) por opción.
 */
function SelectorMultiple<T extends string | number>({
  etiqueta,
  opciones,
  valores,
  onCambio,
  rotulo,
  secundario,
  resumenVacio,
}: PropsSelector<T>) {
  const { abierto, setAbierto, caja } = useDesplegable()
  const [texto, setTexto] = useState('')
  const id = 'sel-' + clave(etiqueta)
  const visibles = useBuscar(opciones, texto, rotulo, secundario)

  const resumen = valores.length === 0 ? resumenVacio || 'Todos' : valores.length === 1 ? rotulo(valores[0]) : valores.length + ' seleccionados'

  const alternarValor = (v: T) => onCambio(alternar(valores, v))

  return (
    <div className="selector" ref={caja}>
      <button
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
        <div className="dropdown-menu show" id={id + '-lista'} role="group" aria-label={etiqueta}>
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
                <div className="form-check" key={String(o)}>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={id + '-' + i}
                    checked={valores.includes(o)}
                    onChange={() => alternarValor(o)}
                  />
                  <label className="form-check-label" htmlFor={id + '-' + i}>
                    {rotulo(o)}
                    {secundario ? <span className="secundario">{secundario(o)}</span> : null}
                  </label>
                </div>
              ))
            )}
          </div>
          {opciones.length > visibles.length ? <p className="small text-neutral-50 mt-2 mb-0">Use el buscador para ver el resto.</p> : null}
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
 * Selector de una sola categoría (el periodo), con el mismo aspecto que el
 * de varias: un botón de opción (radio) por categoría. Elegir cierra la
 * lista; el botón de abajo vuelve al valor por defecto.
 */
function SelectorUnico<T extends string | number>({
  etiqueta,
  opciones,
  valor,
  porDefecto,
  onCambio,
  rotulo,
}: {
  etiqueta: string
  opciones: readonly T[]
  valor: T
  porDefecto: T
  onCambio: (valor: T) => void
  rotulo: (v: T) => string
}) {
  const { abierto, setAbierto, caja } = useDesplegable()
  const [texto, setTexto] = useState('')
  const id = 'sel-' + clave(etiqueta)
  const visibles = useBuscar(opciones, texto, rotulo)
  const resumen = rotulo(valor)

  const elegir = (v: T) => {
    onCambio(v)
    setAbierto(false)
  }

  return (
    <div className="selector" ref={caja}>
      <button
        type="button"
        className="form-select"
        id={id}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={id + '-lista'}
        aria-label={etiqueta + ': ' + resumen}
        title={resumen}
        data-activo={valor !== porDefecto ? '1' : '0'}
        onClick={() => setAbierto((a) => !a)}
      >
        {resumen}
      </button>
      {abierto ? (
        <div className="dropdown-menu show" id={id + '-lista'} role="radiogroup" aria-label={etiqueta}>
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
                <div className="form-check" key={String(o)}>
                  <input
                    className="form-check-input"
                    type="radio"
                    name={id}
                    id={id + '-' + i}
                    checked={o === valor}
                    onChange={() => elegir(o)}
                  />
                  <label className="form-check-label" htmlFor={id + '-' + i}>
                    {rotulo(o)}
                  </label>
                </div>
              ))
            )}
          </div>
          <div className="border-top mt-2 pt-2">
            <button type="button" className="btn btn-outline-neutral btn-sm" onClick={() => elegir(porDefecto)}>
              Volver a {rotulo(porDefecto)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Colores de los círculos de la bienvenida (los de matrícula). */
const COLORES_PASOS = ['#163854', '#51ADE5', '#9F339E', '#2E9E49', '#F8DB1B', '#F36522']

/** Ventana de bienvenida: encabezado del Observatorio, seis pasos con círculo
    de color y el botón de ingreso. */
function Intro({ onCerrar }: { onCerrar: () => void }) {
  const textos = useContext(Textos)
  const t = textos.intro ?? {}
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', esc)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = antes
    }
  }, [onCerrar])
  return (
    <div
      className="bienvenida-fondo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div className="bienvenida" role="dialog" aria-modal="true" aria-labelledby="intro-tit">
        <div className="bienvenida-cabecera">
          <img
            src={LOGO_OBSERVATORIO.src}
            alt="Observatorio de Sapiencia"
            width={LOGO_OBSERVATORIO.ancho}
            height={LOGO_OBSERVATORIO.alto}
          />
          <button type="button" className="bienvenida-cerrar" aria-label="Cerrar" onClick={onCerrar}>
            <Icono nombre="close" />
          </button>
        </div>
        <div className="bienvenida-cuerpo">
          <div className="bienvenida-etiqueta">{t.etiqueta}</div>
          <h2 className="bienvenida-titulo" id="intro-tit">
            {t.titulo}
          </h2>
          <p className="bienvenida-texto">{t.texto}</p>
          <h3 className="bienvenida-sub">{t.subtitulo}</h3>
          <ul className="bienvenida-pasos">
            {(t.pasos ?? []).map((p, i) => (
              <li key={p.titulo}>
                <span className="bienvenida-circulo" style={{ background: COLORES_PASOS[i % COLORES_PASOS.length] }}>
                  <Icono nombre={p.icono} />
                </span>
                <div>
                  <div className="bienvenida-paso-tit">{p.titulo}</div>
                  <div className="bienvenida-paso-txt">{p.texto}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="bienvenida-pie">
          <span className="bienvenida-fuente">{textos.nota}</span>
          <button type="button" className="bienvenida-boton" onClick={onCerrar} autoFocus>
            {t.boton || 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Tarjeta de la plantilla (card) con título y acciones en el encabezado.
 * `claro` la mantiene en el tema claro aunque el visitante active el modo
 * oscuro: los gráficos están pensados para fondo blanco.
 */
function Ficha({
  titulo,
  accion,
  pie,
  claro,
  children,
}: {
  titulo: string
  accion?: ReactNode
  pie?: ReactNode
  claro?: boolean
  children: ReactNode
}) {
  const textos = useContext(Textos)
  return (
    <section className="card card-lg h-100" data-bs-theme={claro ? 'light' : undefined}>
      <div className="card-header d-flex justify-content-between align-items-center gap-3">
        <h3 className="card-title mb-0">{titulo}</h3>
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
interface Clic {
  dataIndex: number
  name: string
}
interface Punto extends Clic {
  value: number
  seriesIndex: number
  seriesName: string
  marker: string
}

function Grafico({
  opcion,
  altoPx,
  alIniciar,
  alSeleccionar,
}: {
  opcion: ConstructorOpcion
  altoPx?: number
  /** Recibe la instancia de ECharts al crearse (y null al desmontarse), para la descarga en PNG. */
  alIniciar?: (ec: EChartsType | null) => void
  alSeleccionar?: (p: Clic) => void
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
    /* Al terminar de cargar Rubik hay que volver a dibujar: el lienzo se pinta
       con la tipografía disponible en ese momento. */
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

  /* Un clic sobre una barra aplica ese filtro. */
  useEffect(() => {
    const ec = inst.current
    if (!ec) return undefined
    ec.off('click')
    if (alSeleccionar) ec.on('click', (p) => alSeleccionar(p))
    return () => {
      ec.off('click')
    }
  })

  return <div ref={caja} className="grafico" style={altoPx ? { height: altoPx } : undefined} />
}

function FichaGrafico({
  titulo,
  altoPx = ALTO,
  opcion,
  csv,
  archivo,
  pie,
  alSeleccionar,
}: {
  titulo: string
  altoPx?: number
  opcion: ConstructorOpcion
  csv?: () => DatosCsv | null
  archivo?: string
  pie?: ReactNode
  alSeleccionar?: (p: Clic) => void
}) {
  const instancia = useRef<EChartsType | null>(null)
  const alIniciar = useCallback((ec: EChartsType | null) => {
    instancia.current = ec
  }, [])
  return (
    <Ficha titulo={titulo} pie={pie} claro accion={<Descargas csv={csv} instancia={instancia} nombre={archivo} titulo={titulo} />}>
      {opcion ? <Grafico opcion={opcion} altoPx={altoPx} alIniciar={alIniciar} alSeleccionar={alSeleccionar} /> : <SinDatos />}
    </Ficha>
  )
}

type Celda = string | number | null | undefined
interface FilaTabla {
  /** Valor que se filtra al hacer clic en la fila. */
  k?: number
  [campo: string]: Celda
}
interface Columna {
  clave: string
  rotulo: string
  tipo: 'texto' | 'num' | 'pct'
  ancho?: number
  total?: 'suma'
}

/**
 * Tabla ordenable con el estilo de tabla de la plantilla. La primera columna
 * queda alineada a la izquierda y fija; las demás van centradas. Un clic (o
 * Enter) en el título de una columna ordena por ella. Con `limite`, muestra
 * solo esas filas (en el orden elegido) y lo dice debajo.
 */
function Tabla({
  columnas,
  filas,
  altura,
  orden,
  limite,
  alSeleccionar,
  seleccion,
}: {
  columnas: Columna[]
  filas: FilaTabla[]
  altura?: number
  orden?: string
  limite?: number
  alSeleccionar?: (f: FilaTabla) => void
  seleccion?: readonly number[]
}) {
  const [col, setCol] = useState(orden ?? columnas[1]?.clave ?? columnas[0].clave)
  const [asc, setAsc] = useState(false)

  const ordenadas = useMemo(() => {
    const s = filas.slice().sort((a, b) => {
      const va = a[col]
      const vb = b[col]
      if (typeof va === 'string' || typeof vb === 'string') return String(va ?? '').localeCompare(String(vb ?? ''), 'es')
      return (va || 0) - (vb || 0)
    })
    return asc ? s : s.reverse()
  }, [filas, col, asc])

  const totales = useMemo(() => {
    const t: Record<string, number> = {}
    columnas.forEach((c) => {
      if (c.total === 'suma') t[c.clave] = filas.reduce((s, f) => s + (Number(f[c.clave]) || 0), 0)
    })
    return t
  }, [filas, columnas])

  if (!filas.length) return <SinDatos texto="Sin registros para la selección activa." />

  const visibles = limite ? ordenadas.slice(0, limite) : ordenadas
  const hayTotal = columnas.some((c) => c.total === 'suma')

  return (
    <Fragment>
      <div className="tabla-caja" style={altura ? { maxHeight: altura } : undefined}>
        <table className="table table-hover table-sm align-middle">
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
              <tr
                key={j}
                className={
                  (alSeleccionar ? 'clicable' : '') + (seleccion && f.k !== undefined && seleccion.includes(f.k) ? ' table-active' : '')
                }
                onClick={alSeleccionar ? () => alSeleccionar(f) : undefined}
              >
                {columnas.map((c, i) => (
                  <td key={c.clave} className={i === 0 ? 'izq fija' : ''}>
                    {c.tipo === 'texto' ? f[c.clave] : c.tipo === 'pct' ? pct(f[c.clave] as number | null) : num(f[c.clave] as number | null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hayTotal ? (
            <tfoot>
              <tr>
                {columnas.map((c, i) => (
                  <td key={c.clave} className={i === 0 ? 'izq fija' : ''}>
                    {i === 0 ? 'Total' : c.total === 'suma' ? num(totales[c.clave]) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {visibles.length < ordenadas.length ? (
        <p className="nota-grafico">
          Se muestran {num(visibles.length)} de {num(ordenadas.length)} filas, en el orden elegido. La descarga en CSV trae
          todas.
        </p>
      ) : null}
    </Fragment>
  )
}

/** Datos de una tabla para el CSV: las columnas de la tabla, con los porcentajes a un decimal. */
const csvDeTabla = (columnas: Columna[], filas: FilaTabla[]) => (): DatosCsv => ({
  encabezados: columnas.map((c) => c.rotulo),
  filas: filas.map((f) =>
    columnas.map((c) => (c.tipo === 'pct' ? (f[c.clave] === null ? null : Number(Number(f[c.clave] || 0).toFixed(1))) : f[c.clave])),
  ),
})

/**
 * Indicador en una tarjeta de la plantilla. El recuadro del ícono toma un
 * color de la plantilla de Sapiencia.
 */
const COLOR_SAPIENCIA = {
  secondary: '#163854',
  info: '#51ADE5',
  primary: '#9F339E',
  'tertiary-pink': '#2E9E49',
  success: '#F8DB1B',
  warning: '#F36522',
}

function Kpi({
  icono,
  familia,
  etiqueta,
  valor,
  pie,
}: {
  icono: string
  familia: keyof typeof COLOR_SAPIENCIA
  etiqueta: string
  valor: ReactNode
  pie?: string
}) {
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

const base = () => ({
  textStyle: { fontFamily: TIPO, fontSize: TAM, color: TINTA2 },
  animationDuration: 240,
  tooltip: {
    trigger: 'item',
    /* Dentro del área del gráfico: la tarjeta del kit recorta lo que sobresale. */
    confine: true,
    backgroundColor: '#ffffff',
    borderColor: LINEA,
    borderWidth: 1,
    padding: [8, 11],
    textStyle: { color: TINTA, fontSize: TAM, fontFamily: TIPO },
  },
})

const leyenda = (tam?: number) => ({
  top: 0,
  left: 0,
  icon: 'rect',
  itemWidth: 11,
  itemHeight: 11,
  itemGap: 16,
  textStyle: { color: TINTA2, fontSize: tam || TAM, fontFamily: TIPO },
})

/** Alto de la leyenda de arriba cuando sus entradas no caben en una línea. */
function altoLeyenda(nombres: string[], ancho: number, letra: number): number {
  const disponible = Math.max(120, ancho - 8)
  let filas = 1
  let actual = 0
  for (const n of nombres) {
    const w = 11 + 5 + medirTexto(n, letra) + 16
    if (actual && actual + w > disponible) {
      filas++
      actual = w
    } else actual += w
  }
  const alto = Math.max(11, Math.round(letra * 1.25))
  return filas * alto + (filas - 1) * 16
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

/** Recorrido vertical (barras horizontales): a la derecha del gráfico. */
const recorridoV = ([desde, hasta]: [number, number], top: number, bottom: number) => [
  {
    type: 'inside',
    yAxisIndex: 0,
    startValue: desde,
    endValue: hasta,
    zoomOnMouseWheel: false,
    moveOnMouseWheel: true,
    moveOnMouseMove: true,
  },
  { type: 'slider', yAxisIndex: 0, startValue: desde, endValue: hasta, right: 4, width: 14, top, bottom, ...ESTILO_RECORRIDO },
]

/** Recorrido horizontal (series por periodo): debajo del gráfico. */
const recorridoH = ([desde, hasta]: [number, number]) => [
  {
    type: 'inside',
    xAxisIndex: 0,
    startValue: desde,
    endValue: hasta,
    zoomOnMouseWheel: false,
    moveOnMouseWheel: true,
    moveOnMouseMove: true,
  },
  { type: 'slider', xAxisIndex: 0, startValue: desde, endValue: hasta, left: 16, right: 16, bottom: 4, height: 14, ...ESTILO_RECORRIDO },
]

interface OpcionesBarras {
  color?: string
  /** Un color por categoría (los estados). */
  colores?: string[]
  total?: number
  conParte?: boolean
  unidad?: string
  /** Cómo se escribe la cifra (num por defecto; millones para los montos). */
  formato?: Formato
  letra?: number
  letraCifra?: number
  letraParte?: number
  anchoMax?: number
  nombresCompletos?: boolean
  grosor?: number
  paso?: number
  alto?: number
  /** Líneas de más en la ayuda de cada barra (HTML). */
  detalle?: (i: number) => string
}

/* Barras: rótulos de 12 px con los nombres completos (en dos líneas si no
   caben en una), la cifra en 15 px y el porcentaje en 13 px. La columna de
   nombres toma el ancho del nombre más largo, sin pasar del 40 % del gráfico
   ni de 400 px. */
const opcionesBarras = (ancho: number, extra?: OpcionesBarras): OpcionesBarras => ({
  anchoMax: Math.round(Math.min(400, Math.max(120, ancho * 0.4))),
  letra: TAM_BARRAS,
  letraCifra: TAM_CIFRA,
  letraParte: TAM_PARTE,
  nombresCompletos: true,
  grosor: 15,
  paso: 28,
  ...extra,
})

/** Barras horizontales de una sola serie, en color plano y con pista. */
function barrasH(categorias: string[], valores: number[], o: OpcionesBarras = {}): Opcion {
  const color = o.color ?? BASE
  const formato = o.formato ?? num
  const total = o.total || suma(valores)
  const maximo = Math.max(1, ...valores)
  const letra = o.letra ?? TAM
  const letraCifra = o.letraCifra ?? letra
  const letraParte = o.letraParte ?? letra
  /* Con anchoMax, la columna de nombres se ajusta al nombre más largo. */
  let anchoCol = 180
  if (o.nombresCompletos && o.anchoMax) {
    const masLargo = Math.max(0, ...categorias.map((c) => medirTexto(c, letra)))
    anchoCol = Math.round(Math.min(o.anchoMax, masLargo + 18))
  }
  const anchoRotulo = anchoCol - 14
  /* Con nombresCompletos el rótulo no se recorta: se parte en líneas y cada
     categoría reserva el alto de la más larga. */
  const altoLinea = Math.round(letra * 1.2)
  const lineas = o.nombresCompletos ? Math.max(1, ...categorias.map((c) => lineasRotulo(c, anchoRotulo, letra))) : 1
  const paso = Math.max(o.paso ?? 26, lineas * altoLinea + 10)
  const alto = o.alto ?? ALTO
  /* Cuántas categorías caben en la tarjeta. El resto queda disponible con el
     control lateral. */
  const caben = Math.max(3, Math.floor((alto - 34) / paso))
  const vista = ventana(categorias.length, caben, -1, false)
  /* A la derecha cabe la etiqueta de la barra más larga: la cifra y, si se
     pide, el porcentaje. */
  const anchoEtiqueta =
    medirTexto(formato(maximo), letraCifra, 600) +
    (o.conParte && total ? medirTexto('  ', letra) + medirTexto(pct(parte(maximo, total)), letraParte, 500) : 0)
  const b = base()
  const grosor = o.grosor ?? 16
  return {
    ...b,
    grid: {
      left: anchoCol,
      right: Math.max(Math.round(((o.conParte ? 132 : 92) * letra) / TAM), Math.ceil(anchoEtiqueta) + 24) + (vista ? 30 : 0),
      top: 14,
      bottom: 20,
      containLabel: false,
    },
    dataZoom: vista ? recorridoV(vista, 14, 20) : undefined,
    xAxis: {
      type: 'value',
      max: maximo * 1.02,
      axisLine: { show: true, lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: categorias,
      inverse: true,
      axisLine: { show: true, lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: {
        color: TINTA2,
        fontSize: letra,
        margin: 12,
        lineHeight: o.nombresCompletos ? altoLinea : 15,
        width: anchoRotulo,
        overflow: o.nombresCompletos ? 'break' : 'truncate',
      },
    },
    tooltip: {
      ...b.tooltip,
      formatter: (p: Punto) =>
        '<b>' +
        escapar(p.name) +
        '</b><br/>' +
        formato(p.value) +
        (o.unidad ? ' ' + o.unidad : '') +
        (total && o.conParte ? '<br/>' + pct(parte(p.value, total)) + ' del total' : '') +
        (o.detalle ? o.detalle(p.dataIndex) : ''),
    },
    series: [
      {
        type: 'bar',
        data: valores.map((v, i) => {
          const c = o.colores?.[i] ?? color
          return { value: v, itemStyle: { color: c }, emphasis: { itemStyle: { color: aclarar(c, 0.2) } } }
        }),
        barMaxWidth: grosor,
        showBackground: true,
        backgroundStyle: { color: PISTA, borderRadius: 4 },
        itemStyle: { borderRadius: 4 },
        label: {
          show: true,
          position: 'right',
          distance: 9,
          fontSize: letra,
          fontFamily: TIPO,
          formatter: (p: Punto) =>
            o.conParte && total ? '{v|' + formato(p.value) + '}  {p|' + pct(parte(p.value, total)) + '}' : '{v|' + formato(p.value) + '}',
          rich: {
            v: { color: TINTA, fontSize: letraCifra, fontWeight: 500, fontFamily: TIPO },
            p: { color: GRIS, fontSize: letraParte, fontFamily: TIPO, fontWeight: letraParte > letra ? 500 : 'normal' },
          },
        },
      },
    ],
  }
}

interface OpcionesSerie {
  /** Ancho del gráfico: decide cuántos periodos se ven sin recorrer. */
  ancho: number
  color?: string
  /** Cifra encima de la barra (num por defecto). */
  formato?: Formato
  /** Cifra en la ayuda (la de la barra por defecto). */
  formatoAyuda?: Formato
  unidad?: string
  /** Categoría resaltada (el periodo elegido); las demás van en un tono claro. */
  resaltar?: number
  detalle?: (i: number) => string
}

/** Rótulo del eje con la categoría resaltada en seminegrita. */
const ejeResaltado = (resaltar: number | undefined, letra: number) => ({
  formatter: (v: string, i: number) => (i === resaltar ? '{r|' + v + '}' : v),
  rich: { r: { color: TINTA, fontWeight: 600, fontSize: letra, fontFamily: TIPO } },
})

/** Cuántos periodos caben a lo ancho con su cifra encima. */
function periodosQueCaben(categorias: string[], cifraMasLarga: string, ancho: number): number {
  const paso = Math.max(medirTexto(cifraMasLarga, TAM_BARRAS, 500), medirTexto(categorias[0] ?? '', TAM_BARRAS)) + 16
  return Math.max(3, Math.floor((ancho - 40) / paso))
}

/**
 * Serie por periodo: barras verticales de una sola serie (las de matrícula)
 * con la cifra encima, el periodo elegido en su color y los demás en un tono
 * claro. Si no caben todos, arranca en los más recientes y se recorre con el
 * control de abajo.
 */
function serieV(categorias: string[], valores: number[], o: OpcionesSerie): Opcion {
  const color = o.color ?? BASE
  const formato = o.formato ?? num
  const formatoAyuda = o.formatoAyuda ?? formato
  const letra = TAM_BARRAS
  const maximo = Math.max(1, ...valores)
  const vista = ventana(categorias.length, periodosQueCaben(categorias, formato(maximo), o.ancho), o.resaltar ?? -1)
  const conResalte = o.resaltar !== undefined && o.resaltar >= 0
  const tenue = aclarar(color, 0.55)
  const b = base()
  return {
    ...b,
    grid: { left: 12, right: 12, top: Math.max(36, Math.round(letra * 2.2)), bottom: vista ? 30 : 8, containLabel: true },
    dataZoom: vista ? recorridoH(vista) : undefined,
    xAxis: {
      type: 'category',
      data: categorias,
      axisLine: { lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: { color: TINTA2, fontSize: letra, interval: 0, ...ejeResaltado(o.resaltar, letra) },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: true, lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    tooltip: {
      ...b.tooltip,
      formatter: (p: Punto) =>
        '<b>' +
        escapar(p.name) +
        '</b><br/>' +
        formatoAyuda(p.value) +
        (o.unidad ? ' ' + o.unidad : '') +
        (o.detalle ? o.detalle(p.dataIndex) : ''),
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 56,
        data: valores.map((v, i) => ({
          value: v,
          itemStyle: { color: !conResalte || i === o.resaltar ? color : tenue },
        })),
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: aclarar(color, 0.2) } },
        label: {
          show: true,
          position: 'top',
          fontSize: letra,
          fontFamily: TIPO,
          color: TINTA,
          fontWeight: 500,
          formatter: (p: Punto) => formato(p.value),
        },
      },
    ],
  }
}

interface SerieDatos {
  nombre: string
  datos: number[]
  color?: string
}

/**
 * Serie por periodo apilada (matrícula y sostenimiento): las partes una
 * sobre otra, el total encima, la leyenda arriba y el mismo resalte y
 * recorrido que serieV.
 */
function serieApiladaV(categorias: string[], series: SerieDatos[], o: OpcionesSerie): Opcion {
  const formato = o.formato ?? num
  const formatoAyuda = o.formatoAyuda ?? formato
  const letra = TAM_BARRAS
  const totales = categorias.map((_, i) => series.reduce((s, e) => s + (e.datos[i] || 0), 0))
  const maximo = Math.max(1, ...totales)
  const vista = ventana(categorias.length, periodosQueCaben(categorias, formato(maximo), o.ancho), o.resaltar ?? -1)
  const conResalte = o.resaltar !== undefined && o.resaltar >= 0
  const b = base()
  return {
    ...b,
    legend: { ...leyenda(letra), data: series.map((s) => s.nombre) },
    grid: { left: 12, right: 12, top: 30 + Math.round(letra * 2.2), bottom: vista ? 30 : 8, containLabel: true },
    dataZoom: vista ? recorridoH(vista) : undefined,
    xAxis: {
      type: 'category',
      data: categorias,
      axisLine: { lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: { color: TINTA2, fontSize: letra, interval: 0, ...ejeResaltado(o.resaltar, letra) },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: true, lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    tooltip: {
      ...b.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(11,58,86,.05)' } },
      formatter: (ps: Punto[]) => {
        if (!ps.length) return ''
        const i = ps[0].dataIndex
        return (
          '<b>' +
          escapar(categorias[i]) +
          '</b><br/>' +
          ps
            .map(
              (p) =>
                p.marker +
                ' ' +
                escapar(p.seriesName) +
                ': ' +
                formatoAyuda(series[p.seriesIndex].datos[i]) +
                '  (' +
                pct(parte(series[p.seriesIndex].datos[i], totales[i])) +
                ')',
            )
            .join('<br/>') +
          '<br/>Total: ' +
          formatoAyuda(totales[i])
        )
      },
    },
    series: series.map((s, k) => {
      const color = s.color ?? SERIES[k % SERIES.length]
      const ultima = k === series.length - 1
      return {
        name: s.nombre,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 56,
        data: s.datos.map((v, i) => ({
          value: v,
          itemStyle: { color: !conResalte || i === o.resaltar ? color : aclarar(color, 0.4) },
        })),
        itemStyle: { color, borderRadius: ultima ? [4, 4, 0, 0] : 0 },
        label: {
          show: ultima,
          position: 'top',
          fontSize: letra,
          fontFamily: TIPO,
          color: TINTA,
          fontWeight: 500,
          formatter: (p: Punto) => formato(totales[p.dataIndex]),
        },
      }
    }),
  }
}

interface OpcionesApiladas {
  letra?: number
  anchoMax?: number
  /** Ancho del gráfico: mide si cada porcentaje cabe en su segmento y cuántas líneas ocupa la leyenda. */
  anchoGrafico: number
  /** Categoría resaltada (el periodo elegido). */
  resaltar?: number
  alto?: number
}

/* Barras apiladas al 100 %: los mismos rótulos de 12 px y, dentro de cada
   segmento, el porcentaje solo cuando cabe. */
const opcionesApiladas = (ancho: number, extra?: Partial<OpcionesApiladas>): OpcionesApiladas => ({
  anchoMax: Math.round(Math.min(320, Math.max(120, ancho * 0.35))),
  letra: TAM_BARRAS,
  anchoGrafico: ancho,
  ...extra,
})

/**
 * Barras horizontales apiladas al cien por ciento (las de matrícula). Cada
 * serie puede traer su color; si hay más categorías de las que caben, se
 * recorren con el control lateral desde la primera.
 */
function apiladas100(categorias: string[], series: SerieDatos[], o: OpcionesApiladas): Opcion {
  const letra = o.letra ?? TAM
  const totales = categorias.map((_, i) => series.reduce((s, e) => s + (e.datos[i] || 0), 0))
  const nombres = series.map((s) => s.nombre)
  const top = Math.max(34, Math.round(letra * 2.6), altoLeyenda(nombres, o.anchoGrafico, letra) + 14)
  /* Con anchoMax, la columna de nombres se ajusta al más largo y los que no
     caben se parten en líneas. */
  let anchoCol = 200
  if (o.anchoMax) {
    const masLargo = Math.max(0, ...categorias.map((c) => medirTexto(c, letra)))
    anchoCol = Math.round(Math.min(o.anchoMax, masLargo + 18))
  }
  const lineas = o.anchoMax ? Math.max(1, ...categorias.map((c) => lineasRotulo(c, anchoCol - 14, letra))) : 1
  const paso = Math.max(28, lineas * Math.round(letra * 1.2) + 10)
  const caben = Math.max(3, Math.floor(((o.alto ?? ALTO) - top - 8) / paso))
  const vista = ventana(categorias.length, caben, o.resaltar ?? -1, false)
  const derecha = vista ? 40 : 60
  /* El porcentaje va dentro del segmento solo si cabe con holgura. */
  const anchoTrazo = o.anchoGrafico - anchoCol - derecha
  const cabe = (v: number) => (v / 100) * anchoTrazo >= medirTexto(pct(v), letra, 600) + 12
  const b = base()
  return {
    ...b,
    tooltip: {
      ...b.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(11,58,86,.05)' } },
      formatter: (ps: Punto[]) => {
        if (!ps.length) return ''
        const i = ps[0].dataIndex
        const t = totales[i]
        return (
          '<b>' +
          escapar(categorias[i]) +
          '</b><br/>' +
          ps
            .filter((p) => series[p.seriesIndex].datos[i] > 0)
            .map(
              (p) =>
                p.marker +
                ' ' +
                escapar(p.seriesName) +
                ': ' +
                num(series[p.seriesIndex].datos[i]) +
                '  (' +
                pct(parte(series[p.seriesIndex].datos[i], t)) +
                ')',
            )
            .join('<br/>') +
          '<br/>Total: ' +
          num(t)
        )
      },
    },
    legend: { ...leyenda(letra), data: nombres },
    grid: { left: anchoCol, right: derecha, top, bottom: 8, containLabel: false },
    dataZoom: vista ? recorridoV(vista, top, 8) : undefined,
    xAxis: {
      type: 'value',
      max: 100,
      axisLine: { show: true, lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: categorias,
      inverse: true,
      axisLine: { show: true, lineStyle: { color: LINEA } },
      axisTick: { show: false },
      axisLabel: {
        color: TINTA2,
        fontSize: letra,
        width: anchoCol - 14,
        margin: 12,
        overflow: o.anchoMax ? 'break' : 'truncate',
        lineHeight: Math.round(letra * 1.2),
        ...(o.resaltar !== undefined ? ejeResaltado(o.resaltar, letra) : {}),
      },
    },
    series: series.map((s, k) => {
      const color = s.color ?? SERIES[k % SERIES.length]
      return {
        name: s.nombre,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 18,
        data: categorias.map((_, i) => (totales[i] ? (s.datos[i] * 100) / totales[i] : 0)),
        itemStyle: { color, borderColor: '#fff', borderWidth: 2, borderRadius: 9 },
        label: {
          show: true,
          fontSize: letra,
          fontFamily: TIPO,
          color: tintaSobre(color),
          fontWeight: 500,
          formatter: (p: Punto) => (cabe(p.value) ? pct(p.value) : ''),
        },
      }
    }),
  }
}

/** Anillo con el total en el centro. */
function anillo(datos: Array<{ name: string; value: number }>, o: { colores?: string[]; rotuloCentro?: string; unidad?: string } = {}): Opcion {
  const total = datos.reduce((s, d) => s + d.value, 0)
  const b = base()
  return {
    ...b,
    tooltip: {
      ...b.tooltip,
      formatter: (p: Punto) =>
        '<b>' + escapar(p.name) + '</b><br/>' + num(p.value) + ' ' + (o.unidad ?? 'beneficios') + '<br/>' + pct(parte(p.value, total)) + ' del total',
    },
    series: [
      {
        type: 'pie',
        radius: ['56%', '78%'],
        center: ['50%', '48%'],
        avoidLabelOverlap: true,
        padAngle: 1.5,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: {
          show: true,
          position: 'outside',
          fontSize: TAM,
          fontFamily: TIPO,
          lineHeight: 15,
          formatter: (p: Punto) => '{n|' + p.name + '}\n{v|' + pct(parte(p.value, total)) + '}',
          rich: {
            n: { color: TINTA2, fontSize: TAM, fontFamily: TIPO },
            v: { color: TINTA, fontSize: 12, fontWeight: 500, fontFamily: TIPO },
          },
        },
        labelLine: { length: 10, length2: 12, lineStyle: { color: LINEA } },
        /* `colores` fija el color de cada porción por categoría. */
        data: datos.map((d, i) => ({ ...d, itemStyle: { color: o.colores?.[i] ?? SERIES[i % SERIES.length] } })),
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '41%',
        style: { text: num(total), fontSize: 22, fontWeight: 500, fill: TINTA, fontFamily: TIPO, textAlign: 'center' },
      },
      {
        type: 'text',
        left: 'center',
        top: '51%',
        style: { text: o.rotuloCentro ?? 'beneficios', fontSize: TAM, fill: GRIS, fontFamily: TIPO, textAlign: 'center' },
      },
    ],
  }
}

/* =================================================================== */
/*  Secciones                                                           */
/* =================================================================== */

/* Anchos de las tarjetas en la rejilla de 12 columnas de la plantilla. */
const UNA = ['col-12']
const DOS = ['col-12 col-lg-6']

/** Fila de tarjetas con la rejilla (row y col) de la plantilla. */
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

/** Lo que hace un clic en un gráfico: agrega o quita ese filtro (el periodo vuelve al de por defecto). */
interface Acciones {
  programa: (i: number) => void
  convocatoria: (i: number) => void
  periodo: (i: number) => void
}

interface PropsSeccion {
  c: ConjuntoFondos
  f: FiltrosFondos
  acciones: Acciones
}

const NOTA_MILLONES = 'Cifras en millones de pesos corrientes (sin ajuste por inflación).'

/** Pie de una tarjeta con una nota encima de la fuente, como en matrícula. */
function PieConNota({ nota }: { nota: string }) {
  const textos = useContext(Textos)
  return (
    <Fragment>
      Nota: {nota}
      <br />
      {textos.fuente}
    </Fragment>
  )
}

/** Series de estados (solo los que tienen beneficios), con su color fijo y en el orden de recorrido. */
function seriesEstados(c: ConjuntoFondos, matriz: number[][], filas: number[]): SerieDatos[] {
  return c.dim.estado.flatMap((nombre, e) => {
    const datos = filas.map((r) => matriz[r][e])
    return suma(datos) > 0 ? [{ nombre, datos, color: colorEstado(nombre, e) }] : []
  })
}

/** CSV de una matriz categoría × estado, con el total. */
const csvEstados = (rotulo: string, nombres: string[], series: SerieDatos[]) => (): DatosCsv => ({
  encabezados: [rotulo, ...series.map((s) => s.nombre), 'Total'],
  filas: nombres.map((n, i) => [n, ...series.map((s) => s.datos[i]), suma(series.map((s) => s.datos[i]))]),
})

function PanoramaGeneral({ c, f, acciones }: PropsSeccion) {
  const regulares = useMemo(() => periodosRegulares(c.dim), [c])
  const activos = useMemo(() => beneficiosPorPeriodo(c, f, true), [c, f])
  const porPrograma = useMemo(() => activosPorPrograma(c, f), [c, f])
  const estados = useMemo(() => estadosDelPeriodo(c, f), [c, f])
  const periodo = c.dim.periodo[f.periodo]

  const serie = regulares.map((i) => activos[i])
  const nombresPeriodo = regulares.map((i) => c.dim.periodo[i])
  const programas = ordenPorValor(porPrograma)
  const totalActivos = suma(porPrograma)
  const conEstado = conValor(estados)
  const totalEstados = suma(estados)

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico
          titulo="Beneficios activos por periodo"
          opcion={
            suma(serie)
              ? (ancho) =>
                  serieV(nombresPeriodo, serie, {
                    ancho,
                    color: COLOR.periodo,
                    unidad: 'beneficios activos',
                    resaltar: regulares.indexOf(f.periodo),
                  })
              : null
          }
          csv={() => ({ encabezados: ['Periodo', 'Beneficios activos'], filas: nombresPeriodo.map((p, i) => [p, serie[i]]) })}
          alSeleccionar={(p) => acciones.periodo(regulares[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'activos-por-periodo'])}
        />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico
          titulo={'Beneficios activos por programa en ' + periodo}
          opcion={
            programas.length
              ? (ancho) =>
                  barrasH(
                    programas.map((i) => c.dim.programa[i].nombre),
                    programas.map((i) => porPrograma[i]),
                    opcionesBarras(ancho, { total: totalActivos, conParte: true, color: COLOR.programa, unidad: 'beneficios activos' }),
                  )
              : null
          }
          csv={() => ({
            encabezados: ['Programa', 'Línea', 'Beneficios activos', 'Participación (%)'],
            filas: programas.map((i) => [
              c.dim.programa[i].nombre,
              c.dim.programa[i].linea,
              porPrograma[i],
              Number((parte(porPrograma[i], totalActivos) ?? 0).toFixed(1)),
            ]),
          })}
          alSeleccionar={(p) => acciones.programa(programas[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'activos-por-programa', periodo])}
        />

        <FichaGrafico
          titulo={'Estado de los beneficios en ' + periodo}
          opcion={
            conEstado.length
              ? (ancho) =>
                  barrasH(
                    conEstado.map((e) => c.dim.estado[e]),
                    conEstado.map((e) => estados[e]),
                    opcionesBarras(ancho, {
                      total: totalEstados,
                      conParte: true,
                      colores: conEstado.map((e) => colorEstado(c.dim.estado[e], e)),
                      unidad: 'beneficios',
                    }),
                  )
              : null
          }
          csv={() => ({
            encabezados: ['Estado', 'Beneficios', 'Participación (%)'],
            filas: conEstado.map((e) => [c.dim.estado[e], estados[e], Number((parte(estados[e], totalEstados) ?? 0).toFixed(1))]),
          })}
          archivo={nombreArchivo([ARCH, 'estados', periodo])}
        />
      </Fila>
    </Fragment>
  )
}

function Estados({ c, f, acciones }: PropsSeccion) {
  const textos = useContext(Textos)
  const matrizPeriodo = useMemo(() => estadosPorPeriodo(c, f), [c, f])
  const matrizPrograma = useMemo(() => estadosPorPrograma(c, f), [c, f])
  const periodo = c.dim.periodo[f.periodo]

  /* Periodos regulares con registros, del más reciente al más antiguo. */
  const periodos = periodosRegulares(c.dim)
    .filter((p) => suma(matrizPeriodo[p]) > 0)
    .reverse()
  const seriesPeriodo = seriesEstados(c, matrizPeriodo, periodos)
  const nombresPeriodo = periodos.map((p) => c.dim.periodo[p])

  const programas = conValor(matrizPrograma.map(suma))
  const seriesPrograma = seriesEstados(c, matrizPrograma, programas)
  const nombresPrograma = programas.map((p) => c.dim.programa[p].nombre)

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico
          titulo="Estados por periodo"
          opcion={
            periodos.length
              ? (ancho) =>
                  apiladas100(nombresPeriodo, seriesPeriodo, opcionesApiladas(ancho, { resaltar: periodos.indexOf(f.periodo) }))
              : null
          }
          csv={csvEstados('Periodo', nombresPeriodo, seriesPeriodo)}
          alSeleccionar={(p) => acciones.periodo(periodos[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'estados-por-periodo'])}
        />

        <FichaGrafico
          titulo={'Estados por programa en ' + periodo}
          opcion={programas.length ? (ancho) => apiladas100(nombresPrograma, seriesPrograma, opcionesApiladas(ancho)) : null}
          csv={csvEstados('Programa', nombresPrograma, seriesPrograma)}
          alSeleccionar={(p) => acciones.programa(programas[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'estados-por-programa', periodo])}
        />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Qué significa cada estado">
          <ul className="estados-lista">
            {c.dim.estado.map((nombre, e) => (
              <li key={nombre}>
                <i style={{ background: colorEstado(nombre, e) }} />
                <div>
                  <span className="estados-nombre">{nombre}</span>
                  <span className="estados-texto">{textos.estados?.[nombre] ?? ''}</span>
                </div>
              </li>
            ))}
          </ul>
        </Ficha>
      </Fila>
    </Fragment>
  )
}

function Giros({ c, f, acciones }: PropsSeccion) {
  const regulares = useMemo(() => periodosRegulares(c.dim), [c])
  const g = useMemo(() => girosPorPeriodo(c, f), [c, f])
  const porPrograma = useMemo(() => girosPorPrograma(c, f), [c, f])
  const desglose = useMemo(() => programasConDesglose(c), [c])
  const periodo = c.dim.periodo[f.periodo]

  const nombresPeriodo = regulares.map((i) => c.dim.periodo[i])
  const monto = regulares.map((i) => g.monto[i])
  const conGiro = regulares.map((i) => g.conGiro[i])

  const programas = ordenPorValor(porPrograma.monto)
  const totalPrograma = suma(porPrograma.monto)

  /* Línea Pregrado: los periodos regulares con matrícula o sostenimiento. */
  const conDesglose = regulares.filter((i) => g.matricula[i] + g.sostenimiento[i] > 0)
  const matricula = conDesglose.map((i) => g.matricula[i])
  const sostenimiento = conDesglose.map((i) => g.sostenimiento[i])
  const nombresDesglose = conDesglose.map((i) => c.dim.periodo[i])
  const fondosPregrado = desglose.map((i) => c.dim.programa[i].corto)

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico
          titulo="Monto girado por periodo"
          opcion={
            suma(monto)
              ? (ancho) =>
                  serieV(nombresPeriodo, monto, {
                    ancho,
                    color: COLOR.monto,
                    formato: millonesCorto,
                    formatoAyuda: millones,
                    resaltar: regulares.indexOf(f.periodo),
                    detalle: (i) => '<br/>' + num(conGiro[i]) + ' beneficios con giro',
                  })
              : null
          }
          pie={<PieConNota nota={NOTA_MILLONES} />}
          csv={() => ({
            encabezados: ['Periodo', 'Monto girado (pesos)', 'Beneficios con giro'],
            filas: nombresPeriodo.map((p, i) => [p, Math.round(monto[i]), conGiro[i]]),
          })}
          alSeleccionar={(p) => acciones.periodo(regulares[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'monto-girado-por-periodo'])}
        />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico
          titulo={'Monto girado por programa en ' + periodo}
          opcion={
            programas.length
              ? (ancho) =>
                  barrasH(
                    programas.map((i) => c.dim.programa[i].nombre),
                    programas.map((i) => porPrograma.monto[i]),
                    opcionesBarras(ancho, {
                      total: totalPrograma,
                      conParte: true,
                      color: COLOR.monto,
                      formato: millones,
                      detalle: (k) => '<br/>' + num(porPrograma.conGiro[programas[k]]) + ' beneficios con giro',
                    }),
                  )
              : null
          }
          pie={<PieConNota nota={NOTA_MILLONES} />}
          csv={() => ({
            encabezados: ['Programa', 'Línea', 'Monto girado (pesos)', 'Beneficios con giro'],
            filas: programas.map((i) => [
              c.dim.programa[i].nombre,
              c.dim.programa[i].linea,
              Math.round(porPrograma.monto[i]),
              porPrograma.conGiro[i],
            ]),
          })}
          alSeleccionar={(p) => acciones.programa(programas[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'monto-girado-por-programa', periodo])}
        />

        <FichaGrafico
          titulo="Línea Pregrado: matrícula y sostenimiento por periodo"
          opcion={
            conDesglose.length
              ? (ancho) =>
                  serieApiladaV(
                    nombresDesglose,
                    [
                      { nombre: 'Matrícula', datos: matricula, color: BASE },
                      { nombre: 'Sostenimiento', datos: sostenimiento, color: AZUL },
                    ],
                    {
                      ancho,
                      formato: millonesCorto,
                      formatoAyuda: millones,
                      resaltar: conDesglose.indexOf(f.periodo),
                    },
                  )
              : null
          }
          pie={
            <PieConNota
              nota={
                'Solo los fondos que separan matrícula y sostenimiento' +
                (fondosPregrado.length ? ' (' + fondosPregrado.join(', ') + ')' : '') +
                '. ' +
                NOTA_MILLONES
              }
            />
          }
          csv={() => ({
            encabezados: ['Periodo', 'Matrícula (pesos)', 'Sostenimiento (pesos)', 'Total (pesos)'],
            filas: nombresDesglose.map((p, i) => [
              p,
              Math.round(matricula[i]),
              Math.round(sostenimiento[i]),
              Math.round(matricula[i] + sostenimiento[i]),
            ]),
          })}
          alSeleccionar={(p) => acciones.periodo(conDesglose[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'linea-pregrado-matricula-sostenimiento'])}
        />
      </Fila>
    </Fragment>
  )
}

function Convocatorias({ c, f, acciones }: PropsSeccion) {
  const matriz = useMemo(() => cohortesPorConvocatoria(c, f), [c, f])
  const totales = matriz.map(suma)
  /* Convocatorias con beneficios, de la más reciente a la más antigua. */
  const convocatorias = conValor(totales).reverse()
  const nombres = convocatorias.map((i) => c.dim.convocatoria[i])
  const total = suma(totales)
  const series = seriesEstados(c, matriz, convocatorias)

  const columnas: Columna[] = [
    { clave: 'convocatoria', rotulo: 'Convocatoria', tipo: 'texto', ancho: 120 },
    ...series.map((s): Columna => ({ clave: 'e-' + s.nombre, rotulo: s.nombre, tipo: 'num', total: 'suma' })),
    { clave: 'total', rotulo: 'Total', tipo: 'num', total: 'suma' },
  ]
  const tabla: FilaTabla[] = convocatorias.map((conv, j) => {
    const fila: FilaTabla = { k: conv, convocatoria: c.dim.convocatoria[conv], total: totales[conv] }
    series.forEach((s) => {
      fila['e-' + s.nombre] = s.datos[j]
    })
    return fila
  })
  const pieEstadoActual = <PieConNota nota="Estado de cada beneficio en el último periodo registrado." />

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico
          titulo="Beneficios por convocatoria"
          opcion={
            convocatorias.length
              ? (ancho) =>
                  barrasH(
                    nombres,
                    convocatorias.map((i) => totales[i]),
                    opcionesBarras(ancho, { total, conParte: true, color: COLOR.convocatoria, unidad: 'beneficios' }),
                  )
              : null
          }
          csv={() => ({ encabezados: ['Convocatoria', 'Beneficios'], filas: convocatorias.map((i) => [c.dim.convocatoria[i], totales[i]]) })}
          alSeleccionar={(p) => acciones.convocatoria(convocatorias[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'beneficios-por-convocatoria'])}
        />

        <FichaGrafico
          titulo="Estado actual por convocatoria"
          opcion={convocatorias.length ? (ancho) => apiladas100(nombres, series, opcionesApiladas(ancho)) : null}
          pie={pieEstadoActual}
          csv={csvEstados('Convocatoria', nombres, series)}
          alSeleccionar={(p) => acciones.convocatoria(convocatorias[p.dataIndex])}
          archivo={nombreArchivo([ARCH, 'estado-actual-por-convocatoria'])}
        />
      </Fila>

      <Fila cols={UNA}>
        <Ficha
          titulo="Detalle por convocatoria y estado actual"
          pie={pieEstadoActual}
          accion={
            <Descargas
              csv={csvDeTabla(columnas, tabla)}
              titulo="Detalle por convocatoria y estado actual"
              nombre={nombreArchivo([ARCH, 'detalle-convocatorias'])}
            />
          }
        >
          <Tabla
            columnas={columnas}
            filas={tabla}
            altura={520}
            orden="convocatoria"
            alSeleccionar={(fila) => fila.k !== undefined && acciones.convocatoria(fila.k)}
            seleccion={f.convocatoria}
          />
        </Ficha>
      </Fila>
    </Fragment>
  )
}

function Poblacion({ c, f }: PropsSeccion) {
  const sexo = useMemo(() => activosPorCategoria(c.sexo, c.dim.sexo.length, c, f).beneficios, [c, f])
  const comunas = useMemo(() => activosPorCategoria(c.comunas, c.dim.comuna.length, c, f).beneficios, [c, f])
  const periodo = c.dim.periodo[f.periodo]

  const conSexo = conValor(sexo)
  const totalSexo = suma(sexo)
  const porComuna = ordenPorValor(comunas)
  const totalComunas = suma(comunas)

  return (
    <Fila cols={DOS}>
      <FichaGrafico
        titulo={'Sexo de los beneficios activos en ' + periodo}
        opcion={
          conSexo.length
            ? anillo(
                conSexo.map((i) => ({ name: c.dim.sexo[i], value: sexo[i] })),
                {
                  /* Cada categoría conserva su color aunque falte otra. */
                  colores: conSexo.map((i) => SERIES[i % SERIES.length]),
                  rotuloCentro: 'beneficios activos',
                  unidad: 'beneficios activos',
                },
              )
            : null
        }
        csv={() => ({
          encabezados: ['Sexo', 'Beneficios activos', 'Participación (%)'],
          filas: conSexo.map((i) => [c.dim.sexo[i], sexo[i], Number((parte(sexo[i], totalSexo) ?? 0).toFixed(1))]),
        })}
        archivo={nombreArchivo([ARCH, 'sexo', periodo])}
      />

      <FichaGrafico
        titulo={'Comuna o corregimiento en ' + periodo}
        opcion={
          porComuna.length
            ? (ancho) =>
                barrasH(
                  porComuna.map((i) => c.dim.comuna[i]),
                  porComuna.map((i) => comunas[i]),
                  opcionesBarras(ancho, { total: totalComunas, conParte: true, color: COLOR.comuna, unidad: 'beneficios activos' }),
                )
            : null
        }
        csv={() => ({
          encabezados: ['Comuna o corregimiento', 'Beneficios activos', 'Participación (%)'],
          filas: porComuna.map((i) => [c.dim.comuna[i], comunas[i], Number((parte(comunas[i], totalComunas) ?? 0).toFixed(1))]),
        })}
        archivo={nombreArchivo([ARCH, 'comuna', periodo])}
      />
    </Fila>
  )
}

function Instituciones({ c, f }: PropsSeccion) {
  const ies = useMemo(() => activosPorCategoria(c.ies, c.dim.ies.length, c, f), [c, f])
  const periodo = c.dim.periodo[f.periodo]
  const orden = ordenPorValor(ies.beneficios)
  const total = suma(ies.beneficios)

  const columnas: Columna[] = [
    { clave: 'ies', rotulo: 'Institución', tipo: 'texto', ancho: 280 },
    { clave: 'programas', rotulo: 'Programas con activos', tipo: 'num' },
    { clave: 'activos', rotulo: 'Beneficios activos', tipo: 'num', total: 'suma' },
    { clave: 'participacion', rotulo: 'Participación', tipo: 'pct' },
  ]
  const tabla: FilaTabla[] = orden.map((i) => ({
    ies: c.dim.ies[i],
    programas: ies.programas[i],
    activos: ies.beneficios[i],
    participacion: parte(ies.beneficios[i], total),
  }))
  const csvTabla = csvDeTabla(columnas, tabla)

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico
          titulo={'Beneficios activos por institución en ' + periodo}
          opcion={
            orden.length
              ? (ancho) =>
                  barrasH(
                    orden.map((i) => c.dim.ies[i]),
                    orden.map((i) => ies.beneficios[i]),
                    opcionesBarras(ancho, { total, conParte: true, color: COLOR.institucion, unidad: 'beneficios activos' }),
                  )
              : null
          }
          csv={csvTabla}
          archivo={nombreArchivo([ARCH, 'instituciones', periodo])}
        />
      </Fila>

      <Fila cols={UNA}>
        <Ficha
          titulo={'Detalle por institución en ' + periodo}
          accion={
            <Descargas
              csv={csvTabla}
              titulo={'Detalle por institución en ' + periodo}
              nombre={nombreArchivo([ARCH, 'detalle-instituciones', periodo])}
            />
          }
        >
          <Tabla columnas={columnas} filas={tabla} altura={520} orden="activos" />
        </Ficha>
      </Fila>
    </Fragment>
  )
}

function EnlazaMundos({ c, f, acciones }: PropsSeccion) {
  const porPais = useMemo(() => destinosPorPais(c, f), [c, f])
  const porConvocatoria = useMemo(() => destinosPorConvocatoria(c, f), [c, f])
  const paises = ordenPorValor(porPais)
  const totalPaises = suma(porPais)
  /* De la más reciente a la más antigua. */
  const convocatorias = conValor(porConvocatoria).reverse()
  const totalConvocatorias = suma(porConvocatoria)

  return (
    <Fila cols={DOS}>
      <FichaGrafico
        titulo="Destinos por país"
        opcion={
          paises.length
            ? (ancho) =>
                barrasH(
                  paises.map((i) => c.dim.pais[i]),
                  paises.map((i) => porPais[i]),
                  opcionesBarras(ancho, { total: totalPaises, conParte: true, color: COLOR.pais, unidad: 'beneficios' }),
                )
            : null
        }
        csv={() => ({
          encabezados: ['País', 'Beneficios', 'Participación (%)'],
          filas: paises.map((i) => [c.dim.pais[i], porPais[i], Number((parte(porPais[i], totalPaises) ?? 0).toFixed(1))]),
        })}
        archivo={nombreArchivo([ARCH, 'enlaza-mundos-destinos-por-pais'])}
      />

      <FichaGrafico
        titulo="Destinos por convocatoria"
        opcion={
          convocatorias.length
            ? (ancho) =>
                barrasH(
                  convocatorias.map((i) => c.dim.convocatoria[i]),
                  convocatorias.map((i) => porConvocatoria[i]),
                  opcionesBarras(ancho, { total: totalConvocatorias, conParte: true, color: COLOR.destino, unidad: 'beneficios' }),
                )
            : null
        }
        csv={() => ({
          encabezados: ['Convocatoria', 'Beneficios'],
          filas: convocatorias.map((i) => [c.dim.convocatoria[i], porConvocatoria[i]]),
        })}
        alSeleccionar={(p) => acciones.convocatoria(convocatorias[p.dataIndex])}
        archivo={nombreArchivo([ARCH, 'enlaza-mundos-destinos-por-convocatoria'])}
      />
    </Fila>
  )
}

/** Filas que se pintan en la tabla detallada (el CSV las trae todas). */
const LIMITE_DETALLE = 1000

function InformacionDetallada({ c, f, acciones }: PropsSeccion) {
  const filas = useMemo(() => filasDetalle(c, f), [c, f])
  const tabla: FilaTabla[] = useMemo(
    () =>
      filas.map((d) => ({
        k: d.programa,
        programa: c.dim.programa[d.programa].nombre,
        convocatoria: c.dim.convocatoria[d.convocatoria],
        periodo: c.dim.periodo[d.periodo],
        estado: c.dim.estado[d.estado],
        beneficios: d.beneficios,
      })),
    [c, filas],
  )
  const columnas: Columna[] = [
    { clave: 'programa', rotulo: 'Programa', tipo: 'texto', ancho: 220 },
    { clave: 'convocatoria', rotulo: 'Convocatoria', tipo: 'texto' },
    { clave: 'periodo', rotulo: 'Periodo', tipo: 'texto' },
    { clave: 'estado', rotulo: 'Estado', tipo: 'texto', ancho: 160 },
    { clave: 'beneficios', rotulo: 'Beneficios', tipo: 'num', total: 'suma' },
  ]

  return (
    <Fila cols={UNA}>
      <Ficha
        titulo="Beneficios por programa, convocatoria, periodo y estado"
        accion={
          <Descargas
            csv={csvDeTabla(columnas, tabla)}
            titulo="Beneficios por programa, convocatoria, periodo y estado"
            nombre={nombreArchivo([ARCH, 'informacion-detallada'])}
          />
        }
      >
        <Tabla
          columnas={columnas}
          filas={tabla}
          altura={640}
          orden="periodo"
          limite={LIMITE_DETALLE}
          alSeleccionar={(fila) => fila.k !== undefined && acciones.programa(fila.k)}
          seleccion={f.programa}
        />
      </Ficha>
    </Fila>
  )
}

interface Seccion {
  id: string
  rotulo: string
  panel: (props: PropsSeccion) => ReactNode
  /** Filtros que usa la sección. */
  usa: CampoFiltro[]
  /** Nota fija de la sección. */
  nota?: string
  /** Por qué no se aplican los demás filtros (va con la nota de filtros). */
  motivo?: string
}

const TODOS: CampoFiltro[] = ['linea', 'programa', 'periodo', 'convocatoria']

const SECCIONES: Seccion[] = [
  { id: 'panorama', rotulo: 'Panorama general', panel: PanoramaGeneral, usa: TODOS },
  { id: 'estados', rotulo: 'Estados', panel: Estados, usa: TODOS },
  {
    id: 'giros',
    rotulo: 'Giros',
    panel: Giros,
    usa: ['linea', 'programa', 'periodo'],
    motivo: 'El monto girado no se publica por convocatoria.',
  },
  {
    id: 'convocatorias',
    rotulo: 'Convocatorias',
    panel: Convocatorias,
    usa: ['linea', 'programa', 'convocatoria'],
    motivo: 'Cada convocatoria muestra el estado de sus beneficios en el último periodo registrado.',
  },
  {
    id: 'poblacion',
    rotulo: 'Población',
    panel: Poblacion,
    usa: ['linea', 'programa', 'periodo'],
    nota: 'Solo beneficios activos; sexo y comuna no se cruzan con el estado.',
    motivo: 'El sexo y la comuna no se publican por convocatoria.',
  },
  {
    id: 'instituciones',
    rotulo: 'Instituciones',
    panel: Instituciones,
    usa: ['linea', 'programa', 'periodo'],
    nota: 'Solo beneficios activos del periodo; la institución no se cruza con el estado.',
    motivo: 'La institución no se publica por convocatoria.',
  },
  {
    id: 'enlaza',
    rotulo: 'Enlaza Mundos',
    panel: EnlazaMundos,
    usa: ['convocatoria'],
    nota: 'Países de destino de los beneficios de Enlaza Mundos, el programa de movilidad internacional.',
    motivo: 'Los destinos se publican solo por convocatoria.',
  },
  {
    id: 'detalle',
    rotulo: 'Información detallada',
    panel: InformacionDetallada,
    usa: ['linea', 'programa', 'convocatoria'],
    motivo: 'La tabla trae todos los periodos, incluidos los intersemestrales.',
  },
]

/** Nota de la sección: la fija y, si alguno de los filtros aplicados no le sirve, cuál y por qué. */
function NotaSeccion({ seccion, f }: { seccion: Seccion; f: FiltrosFondos }) {
  const fuera = filtrosQueNoAplican(seccion.usa, f)
  const partes = [seccion.nota, fuera.length ? textoNoAplican(fuera) : '', fuera.length ? seccion.motivo : ''].filter(Boolean)
  if (!partes.length) return null
  return (
    <div className="nota-seccion" role="note">
      <Icono nombre="info" />
      <p className="mb-0">{partes.join(' ')}</p>
    </div>
  )
}

/* =================================================================== */
/*  Barra de filtros                                                    */
/* =================================================================== */

function Filtros({
  c,
  f,
  cambiar,
  periodoPorDefecto,
}: {
  c: ConjuntoFondos
  f: FiltrosFondos
  cambiar: (parcial: Partial<FiltrosFondos>) => void
  periodoPorDefecto: number
}) {
  const lineas = useMemo(() => lineasDe(c.dim), [c])
  const programas = useMemo(() => opcionesPrograma(c.dim, f), [c, f])
  const convocatorias = useMemo(() => opcionesConvocatoria(c, f), [c, f])
  /* Periodos regulares, del más reciente al más antiguo. */
  const periodos = useMemo(() => periodosRegulares(c.dim).reverse(), [c])
  const rotuloLinea = useCallback((l: string) => l, [])
  const rotuloPrograma = useCallback((i: number) => c.dim.programa[i].nombre, [c])
  const lineaPrograma = useCallback((i: number) => c.dim.programa[i].linea, [c])
  const rotuloConvocatoria = useCallback((i: number) => c.dim.convocatoria[i], [c])
  const rotuloPeriodo = useCallback((i: number) => c.dim.periodo[i], [c])

  return (
    <section className="card card-lg filtros" aria-labelledby="filtros-tit">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h2 className="card-title mb-0" id="filtros-tit">
            Filtros
          </h2>
          <p className="filtros-subtitulo">
            Segmente las visualizaciones con los filtros disponibles. Cada sección indica si alguno no se le aplica.
          </p>
        </div>
      </div>
      <div className="card-body" id="filtros-cuerpo">
        <div className="filtros-filas">
          <div className="filtros-rejilla" style={{ '--cols': 4 } as CSSProperties}>
            <div>
              <label className="form-label" htmlFor="sel-linea">
                Línea
              </label>
              <SelectorMultiple
                etiqueta="Línea"
                opciones={lineas}
                valores={f.linea}
                onCambio={(v) => cambiar({ linea: v })}
                rotulo={rotuloLinea}
                resumenVacio="Todas"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="sel-programa">
                Programa
              </label>
              <SelectorMultiple
                etiqueta="Programa"
                opciones={programas}
                valores={f.programa}
                onCambio={(v) => cambiar({ programa: v })}
                rotulo={rotuloPrograma}
                secundario={lineaPrograma}
                resumenVacio="Todos los programas"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="sel-periodo">
                Periodo
              </label>
              <SelectorUnico
                etiqueta="Periodo"
                opciones={periodos}
                valor={f.periodo}
                porDefecto={periodoPorDefecto}
                onCambio={(v) => cambiar({ periodo: v })}
                rotulo={rotuloPeriodo}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="sel-convocatoria">
                Convocatoria
              </label>
              <SelectorMultiple
                etiqueta="Convocatoria"
                opciones={convocatorias}
                valores={f.convocatoria}
                onCambio={(v) => cambiar({ convocatoria: v })}
                rotulo={rotuloConvocatoria}
                resumenVacio="Todas"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Fichas con los filtros activos; cada una se retira con un clic. */
function FichasActivas({
  c,
  f,
  cambiar,
  limpiar,
  periodoPorDefecto,
}: {
  c: ConjuntoFondos
  f: FiltrosFondos
  cambiar: (parcial: Partial<FiltrosFondos>) => void
  limpiar: () => void
  periodoPorDefecto: number
}) {
  const fichas: Array<{ etiqueta: string; texto: string; quitar: () => void }> = []
  f.linea.forEach((l) => fichas.push({ etiqueta: 'Línea', texto: l, quitar: () => cambiar({ linea: f.linea.filter((x) => x !== l) }) }))
  f.programa.forEach((i) =>
    fichas.push({
      etiqueta: 'Programa',
      texto: c.dim.programa[i].nombre,
      quitar: () => cambiar({ programa: f.programa.filter((x) => x !== i) }),
    }),
  )
  if (f.periodo !== periodoPorDefecto) {
    fichas.push({ etiqueta: 'Periodo', texto: c.dim.periodo[f.periodo], quitar: () => cambiar({ periodo: periodoPorDefecto }) })
  }
  f.convocatoria.forEach((i) =>
    fichas.push({
      etiqueta: 'Convocatoria',
      texto: c.dim.convocatoria[i],
      quitar: () => cambiar({ convocatoria: f.convocatoria.filter((x) => x !== i) }),
    }),
  )

  if (!fichas.length) return null

  /* Etiquetas (tag) de la plantilla. Cada una es un botón: un clic la retira. */
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

export default function TableroFondos({ datos }: { datos: DatosTableroFondos }) {
  const c = datos.fondos
  const textos = useMemo(() => datos.definiciones ?? {}, [datos.definiciones])
  const inicial = useMemo(() => filtrosIniciales(c), [c])
  const [tab, setTab] = useState(0)
  const [intro, setIntro] = useState(true)
  const refsTab = useRef<Array<HTMLButtonElement | null>>([])
  const [filtros, setFiltros] = useState<FiltrosFondos>(inicial)
  const sec = SECCIONES[tab]

  const res = useMemo(() => resumir(c, filtros), [c, filtros])

  const cambiar = useCallback((parcial: Partial<FiltrosFondos>) => setFiltros((f) => ({ ...f, ...parcial })), [])
  const limpiar = useCallback(() => setFiltros(inicial), [inicial])
  const cerrarIntro = useCallback(() => setIntro(false), [])

  /* Un clic sobre una barra de programa, periodo o convocatoria aplica ese
     filtro y otro clic lo retira (el periodo vuelve al de por defecto). */
  const acciones = useMemo<Acciones>(
    () => ({
      programa: (i) => setFiltros((f) => ({ ...f, programa: alternar(f.programa, i) })),
      convocatoria: (i) => setFiltros((f) => ({ ...f, convocatoria: alternar(f.convocatoria, i) })),
      periodo: (i) => {
        if (i === undefined || i < 0) return
        setFiltros((f) => ({ ...f, periodo: f.periodo === i ? inicial.periodo : i }))
      },
    }),
    [inicial],
  )

  /* Las flechas izquierda y derecha recorren los botones de sección. */
  const teclas = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const n = (i + (e.key === 'ArrowRight' ? 1 : SECCIONES.length - 1)) % SECCIONES.length
    setTab(n)
    refsTab.current[n]?.focus()
  }

  const periodo = c.dim.periodo[filtros.periodo]
  const conConvocatoria = filtros.convocatoria.length > 0
  const Panel = sec.panel

  return (
    <Textos.Provider value={textos}>
      {intro ? <Intro onCerrar={cerrarIntro} /> : null}

      <div className="body container-fluid p-4 p-xl-8">
        <nav aria-label="Ruta de navegación">
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <a href="https://sapiencia.gov.co/observatorio/">Observatorio</a>
            </li>
            <li className="breadcrumb-item">
              <a href="/sivu#tableros">SIVU</a>
            </li>
            <li className="breadcrumb-item">Beneficiarios de los fondos de Sapiencia 2026</li>
            <li className="breadcrumb-item active" aria-current="page">
              {sec.rotulo}
            </li>
          </ol>
        </nav>
        <h2 className="visually-hidden">{sec.rotulo}</h2>

        {/* Botones de sección, como en matrícula. */}
        <section className="secciones">
          <div className="tabs" role="tablist" aria-label="Secciones del tablero">
            {SECCIONES.map((p, i) => (
              <button
                key={p.id}
                ref={(el) => {
                  refsTab.current[i] = el
                }}
                type="button"
                className="tab"
                role="tab"
                id={'tab-' + p.id}
                aria-controls={'panel-' + p.id}
                aria-selected={i === tab}
                tabIndex={i === tab ? 0 : -1}
                onClick={() => setTab(i)}
                onKeyDown={(e) => teclas(e, i)}
              >
                <span className="tab-sec">Sección {i + 1}</span>
                <span className="tab-tit">{p.rotulo}</span>
              </button>
            ))}
          </div>
        </section>

        <Filtros c={c} f={filtros} cambiar={cambiar} periodoPorDefecto={inicial.periodo} />

        <FichasActivas c={c} f={filtros} cambiar={cambiar} limpiar={limpiar} periodoPorDefecto={inicial.periodo} />

        <section className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xxl-6 g-4 mb-5" aria-label="Indicadores de la selección">
          <div className="col">
            <Kpi icono="groups" familia="secondary" etiqueta="Beneficios activos" valor={num(res.activos)} pie={'Periodo ' + periodo} />
          </div>
          <div className="col">
            <Kpi
              icono="payments"
              familia="info"
              etiqueta="Monto girado"
              valor={'$ ' + millonesCorto(res.monto)}
              pie={'Millones de pesos, periodo ' + periodo}
            />
          </div>
          <div className="col">
            <Kpi
              icono="fact_check"
              familia="primary"
              etiqueta="Beneficios con registro en el periodo"
              valor={num(res.registros)}
              pie="En cualquier estado"
            />
          </div>
          <div className="col">
            <Kpi
              icono="female"
              familia="tertiary-pink"
              etiqueta="Mujeres"
              valor={pct(parte(res.mujeres, res.activosSexo))}
              pie={num(res.mujeres) + ' beneficiarias activas'}
            />
          </div>
          <div className="col">
            <Kpi
              icono="menu_book"
              familia="success"
              etiqueta="Programas con activos"
              valor={num(res.programas)}
              pie={'De ' + num(res.programasElegidos) + ' en la selección'}
            />
          </div>
          <div className="col">
            <Kpi
              icono="account_balance"
              familia="warning"
              etiqueta="Instituciones con activos"
              valor={num(res.instituciones)}
              pie="Con beneficios activos"
            />
          </div>
          {conConvocatoria ? (
            <div className="col-12 w-100">
              <div className="nota-seccion mb-0" role="note">
                <Icono nombre="info" />
                <p className="mb-0">
                  El monto girado, las mujeres y las instituciones no se publican por convocatoria: esos tres indicadores no usan
                  ese filtro.
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <div id={'panel-' + sec.id} role="tabpanel" aria-labelledby={'tab-' + sec.id}>
          <NotaSeccion seccion={sec} f={filtros} />
          <Panel key={sec.id} c={c} f={filtros} acciones={acciones} />
        </div>

        <section className="nota-pie" aria-label="Notas sobre los datos">
          {textos.beneficio ? (
            <p>
              <b>Beneficio.</b> {textos.beneficio}
            </p>
          ) : null}
          {textos.privacidad ? (
            <p>
              <b>Privacidad.</b> {textos.privacidad}
            </p>
          ) : null}
          <p>
            <b>Corte de los datos.</b> {fechaLarga(c.meta.corte)}.
          </p>
        </section>
      </div>
    </Textos.Provider>
  )
}
