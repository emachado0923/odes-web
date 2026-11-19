/**
 * Eventos reportados de la persona: la línea de tiempo que cierra el expediente.
 * Son los reportes que el equipo registra (suspensiones, cambios de programa,
 * grados, prórrogas, renuncias). Es contenido de apoyo frente a los beneficios:
 * un trazo vertical, un punto por evento y la fecha como ancla; nada más.
 */
import { useState } from 'react'
import Copiar from './Copiar'
import { claveTexto } from './estados'
import {
  PROGRAMAS,
  cortoPrograma,
  indiceColumna,
  oracionLegible,
  tablaHistorial,
  tituloLegible,
} from './ficha'
import type { FichaFondos } from './tipos'
import './eventos.css'

export interface PropsEventosPersona {
  /** Ficha con p = 'EVENTOS': una tabla con Fecha, Periodo, Evento, Detalle, Convocatoria, Fondo y Radicado PQRS. */
  ficha: FichaFondos
  /** id del elemento raíz: la persona salta aquí. */
  id: string
}

interface FechaLeida {
  /** AAAA-MM-DD, para el atributo dateTime. */
  iso: string
  /** «4 de marzo de 2025». */
  legible: string
  /** Milisegundos del día, para ordenar. */
  orden: number
}

interface Evento {
  /** Posición de la fila en la tabla: los eventos no traen id y la tabla no cambia mientras se ve. */
  indice: number
  fecha: FechaLeida | null
  /** La fecha como llegó: se muestra tal cual cuando no se pudo leer. */
  fechaCruda: string
  periodo: string
  tipo: string
  claveTipo: string
  detalle: string
  /** «Fondo EPM, convocatoria 2019-2». */
  beneficio: string
  radicado: string
}

interface TipoEvento {
  clave: string
  nombre: string
  cantidad: number
}

/** Lo que la persona eligió sobre ESTA ficha; con otra ficha se parte de cero. */
interface Vista {
  de: FichaFondos
  filtro: string | null
  abiertos: readonly number[]
}

// En UTC: la fecha es un día del calendario, no un instante; así no se corre por la zona horaria.
const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Desde cuántos caracteres se recorta el detalle, y dónde se corta. */
const LIMITE_DETALLE = 220
const CORTE_DETALLE = 200

/** Lee «AAAA-MM-DD» (con o sin hora). Si no es una fecha real, null: se mostrará como llegó. */
function leerFecha(texto: string): FechaLeida | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?![\d-])/.exec(texto)
  if (!partes) return null
  const [, anio = '', mes = '', dia = ''] = partes
  const orden = Date.UTC(Number(anio), Number(mes) - 1, Number(dia))
  const fecha = new Date(orden)
  // Date acepta «2025-02-31» y lo corre a marzo, y toma el año «0025» como 1925:
  // eso no es una fecha leída.
  if (
    fecha.getUTCFullYear() !== Number(anio) ||
    fecha.getUTCMonth() !== Number(mes) - 1 ||
    fecha.getUTCDate() !== Number(dia)
  ) {
    return null
  }
  return { iso: `${anio}-${mes}-${dia}`, legible: FORMATO_FECHA.format(fecha), orden }
}

/** A qué beneficio corresponde el evento, en una frase. */
function beneficioDe(fondo: string, convocatoria: string): string {
  // La clave del programa puede llegar en minúsculas o con espacios de más.
  const clave = fondo.toUpperCase().replaceAll(/\s+/g, ' ')
  let nombre = ''
  if (fondo) nombre = Object.hasOwn(PROGRAMAS, clave) ? cortoPrograma(clave) : tituloLegible(fondo)
  if (nombre && convocatoria) return `${nombre}, convocatoria ${convocatoria}`
  if (convocatoria) return `Convocatoria ${convocatoria}`
  return nombre
}

/** Corta el detalle en un espacio, sin dejar puntuación colgando antes de los puntos suspensivos. */
function recortar(texto: string): string {
  const trozo = texto.slice(0, CORTE_DETALLE)
  const espacio = trozo.lastIndexOf(' ')
  const hastaPalabra = espacio > CORTE_DETALLE * 0.6 ? trozo.slice(0, espacio) : trozo
  return `${hastaPalabra.replace(/[\s,;:.]+$/, '')}…`
}

/** Las columnas se buscan por nombre: cualquiera puede faltar o venir vacía. */
function leerEventos(ficha: FichaFondos): Evento[] {
  const tabla = tablaHistorial(ficha)
  if (!tabla) return []
  const [, , filas] = tabla
  const columna = {
    fecha: indiceColumna(tabla, 'Fecha'),
    periodo: indiceColumna(tabla, 'Periodo'),
    evento: indiceColumna(tabla, 'Evento'),
    detalle: indiceColumna(tabla, 'Detalle'),
    convocatoria: indiceColumna(tabla, 'Convocatoria'),
    fondo: indiceColumna(tabla, 'Fondo'),
    radicado: indiceColumna(tabla, 'Radicado PQRS', 'Radicado'),
  }
  const celda = (fila: string[], i: number): string => (i >= 0 ? (fila[i] ?? '').trim() : '')

  const eventos: Evento[] = []
  for (const [indice, fila] of filas.entries()) {
    const fechaCruda = celda(fila, columna.fecha)
    const periodo = celda(fila, columna.periodo)
    const tipo = celda(fila, columna.evento)
    const detalle = celda(fila, columna.detalle)
    const beneficio = beneficioDe(celda(fila, columna.fondo), celda(fila, columna.convocatoria))
    const radicado = celda(fila, columna.radicado)
    // Una fila sin nada que mostrar no es un evento.
    const vacia = !fechaCruda && !periodo && !tipo && !detalle && !beneficio && !radicado
    if (!vacia) {
      eventos.push({
        indice,
        fecha: leerFecha(fechaCruda),
        fechaCruda,
        periodo,
        // En MAYÚSCULAS sostenidas pasa a oración, con sus tildes y siglas; si ya trae minúsculas queda igual.
        tipo: tipo ? oracionLegible(tipo) : '',
        claveTipo: claveTexto(tipo),
        detalle,
        beneficio,
        radicado,
      })
    }
  }
  return eventos
}

/** Tipos de evento, agrupados sin distinguir mayúsculas ni tildes; primero los que más se repiten. */
function contarTipos(eventos: Evento[]): TipoEvento[] {
  const porClave = new Map<string, TipoEvento>()
  for (const evento of eventos) {
    const previo = porClave.get(evento.claveTipo)
    if (previo) previo.cantidad += 1
    else {
      porClave.set(evento.claveTipo, {
        clave: evento.claveTipo,
        nombre: evento.tipo || 'Sin tipo',
        cantidad: 1,
      })
    }
  }
  return [...porClave.values()].toSorted(
    (a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'),
  )
}

/** Por fecha; los que no tienen fecha legible van al final en los dos sentidos. */
function ordenar(eventos: Evento[], antiguosPrimero: boolean): Evento[] {
  const conFecha = eventos
    .filter((evento) => evento.fecha !== null)
    .toSorted((a, b) => (a.fecha?.orden ?? 0) - (b.fecha?.orden ?? 0))
  const sinFecha = eventos.filter((evento) => evento.fecha === null)
  return [...(antiguosPrimero ? conFecha : conFecha.toReversed()), ...sinFecha]
}

function cuantos(n: number): string {
  return n === 1 ? '1 evento' : `${n} eventos`
}

interface PropsEntrada {
  evento: Evento
  idDetalle: string
  abierto: boolean
  alAlternar: () => void
}

function EntradaEvento({ evento, idDetalle, abierto, alAlternar }: PropsEntrada) {
  const titulo = evento.tipo || 'Evento sin tipo'
  const largo = evento.detalle.length > LIMITE_DETALLE
  const detalle = largo && !abierto ? recortar(evento.detalle) : evento.detalle

  return (
    <li className="vce-evento">
      <div className="vce-fecha">
        {evento.fecha ? (
          <time className="vce-dia" dateTime={evento.fecha.iso}>
            {evento.fecha.legible}
          </time>
        ) : (
          <span className="vce-dia vce-dia-suelta">{evento.fechaCruda || 'Sin fecha'}</span>
        )}
        {evento.periodo && <span className="vce-periodo vc-num">Periodo {evento.periodo}</span>}
      </div>
      <span className="vce-riel" aria-hidden="true" />
      <div className="vce-cuerpo">
        <h3 className="vce-tipo">{titulo}</h3>
        {evento.detalle && (
          <div className="vce-detalle" id={idDetalle}>
            {detalle}
          </div>
        )}
        {largo && (
          <button
            type="button"
            className="vce-mas"
            aria-expanded={abierto}
            aria-controls={idDetalle}
            onClick={alAlternar}
          >
            {abierto ? 'Ver menos' : 'Ver todo'}
            {/* Con la fecha: dos eventos del mismo tipo no quedan con el mismo nombre. */}
            <span className="vc-sr">
              : {titulo}
              {evento.fecha ? `, ${evento.fecha.legible}` : ''}
            </span>
          </button>
        )}
        {(evento.beneficio || evento.radicado) && (
          <div className="vce-pie">
            {evento.beneficio && <span className="vce-beneficio">{evento.beneficio}</span>}
            {evento.radicado && (
              <span className="vce-radicado">
                <span>Radicado PQRS</span>
                <span className="vce-radicado-valor vc-num">{evento.radicado}</span>
                {/* Con el número: cada botón de copiar se distingue de los demás. */}
                <Copiar valor={evento.radicado} que={`el radicado ${evento.radicado}`} />
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export default function EventosPersona({ ficha, id }: PropsEventosPersona) {
  // El orden es una preferencia de quien atiende: se conserva de una consulta a la siguiente.
  const [antiguosPrimero, setAntiguosPrimero] = useState(false)
  // El filtro y los detalles desplegados son de una persona: se guardan junto a su ficha y,
  // si llega otra, se descartan en el mismo render (sin efecto que reinicie). Descartarlos, y no
  // solo ignorarlos, evita que reaparezcan al volver a consultar a la persona anterior.
  const deCero: Vista = { de: ficha, filtro: null, abiertos: [] }
  const [guardada, setGuardada] = useState<Vista>(deCero)
  if (guardada.de !== ficha) setGuardada(deCero)
  const vista: Vista = guardada.de === ficha ? guardada : deCero

  const eventos = leerEventos(ficha)
  if (eventos.length === 0) return null

  const tipos = contarTipos(eventos)
  const hayFiltros = tipos.length > 1
  const filtro = hayFiltros && tipos.some((tipo) => tipo.clave === vista.filtro) ? vista.filtro : null
  const ordenados = ordenar(eventos, antiguosPrimero)
  const visibles = filtro === null ? ordenados : ordenados.filter((evento) => evento.claveTipo === filtro)

  const idTitulo = `${id}-titulo`

  const elegirFiltro = (clave: string | null) => {
    setGuardada({ ...vista, filtro: clave })
  }
  const alternarDetalle = (indice: number) => {
    const abiertos = vista.abiertos.includes(indice)
      ? vista.abiertos.filter((otro) => otro !== indice)
      : [...vista.abiertos, indice]
    setGuardada({ ...vista, abiertos })
  }

  return (
    <section className="vce" id={id} tabIndex={-1} aria-labelledby={idTitulo}>
      <div className="vce-cabeza">
        <div className="vce-encabezado">
          <h2 className="vce-titulo" id={idTitulo}>
            Eventos reportados
          </h2>
          <span className="vce-cuenta">{cuantos(eventos.length)}</span>
        </div>
        {eventos.length > 1 && (
          <button
            type="button"
            className="vce-orden"
            onClick={() => {
              setAntiguosPrimero(!antiguosPrimero)
            }}
          >
            {antiguosPrimero ? 'Ver primero los más recientes' : 'Ver primero los más antiguos'}
          </button>
        )}
      </div>

      {hayFiltros && (
        <div className="vce-filtrado">
          <div className="vce-filtros" role="group" aria-label="Filtrar por tipo de evento">
            <button
              type="button"
              className="vce-filtro"
              aria-pressed={filtro === null}
              onClick={() => {
                elegirFiltro(null)
              }}
            >
              Todos
              <span className="vce-filtro-n vc-num" aria-hidden="true">
                {eventos.length}
              </span>
              <span className="vc-sr">, {cuantos(eventos.length)}</span>
            </button>
            {tipos.map((tipo) => (
              <button
                key={tipo.clave}
                type="button"
                className="vce-filtro"
                aria-pressed={filtro === tipo.clave}
                onClick={() => {
                  // Volver a pulsar el tipo elegido lo suelta: es un botón de dos estados.
                  elegirFiltro(filtro === tipo.clave ? null : tipo.clave)
                }}
              >
                {tipo.nombre}
                <span className="vce-filtro-n vc-num" aria-hidden="true">
                  {tipo.cantidad}
                </span>
                <span className="vc-sr">, {cuantos(tipo.cantidad)}</span>
              </button>
            ))}
          </div>
          {/* Siempre montado para que el lector de pantalla anuncie el cambio al filtrar. */}
          <div className="vce-viendo" role="status">
            {filtro === null ? '' : `${visibles.length} de ${cuantos(eventos.length)}`}
          </div>
        </div>
      )}

      {/* role="list": sin viñetas (list-style: none) Safari deja de anunciarla como lista. */}
      <ol className="vce-linea" role="list">
        {visibles.map((evento) => (
          <EntradaEvento
            key={evento.indice}
            evento={evento}
            idDetalle={`${id}-detalle-${evento.indice}`}
            abierto={vista.abiertos.includes(evento.indice)}
            alAlternar={() => {
              alternarDetalle(evento.indice)
            }}
          />
        ))}
      </ol>
    </section>
  )
}
