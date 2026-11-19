/**
 * La persona: cabecera del expediente. Responde «quién es» (nombre, documento,
 * contacto y residencia) y «qué tiene» (total girado e índice de beneficios)
 * antes de entrar al detalle de cada ficha.
 *
 * No guarda nada ni pide nada a la red: todo sale de las fichas que recibe.
 */
import { useId, useMemo, type ReactNode } from 'react'
import ChipEstado from './ChipEstado'
import Copiar from './Copiar'
import { claveTexto, estadoLegible } from './estados'
import {
  campo,
  cortoPrograma,
  formatoDocumento,
  nombrePropio,
  oracionLegible,
  pesos,
  pesosCortos,
  resumenBeneficio,
  seccion,
  tablaHistorial,
  tituloLegible,
} from './ficha'
import Icono from './iconos'
import { useTextosOrigen } from './origen'
import type { FichaFondos } from './tipos'
import './persona.css'

export interface PropsResumenPersona {
  /** Documento consultado, normalizado. */
  documento: string
  /** Fichas de beneficios (sin la de eventos), en el orden en que se muestran. */
  beneficios: readonly FichaFondos[]
  /** Ficha de eventos de la persona, si tiene. */
  eventos: FichaFondos | null
  /** Índices de los beneficios desplegados. */
  abiertas: ReadonlySet<number>
  /** Despliega ese beneficio (o los eventos) y lleva la vista hasta él. */
  alIrA: (destino: number | 'eventos') => void
  alAbrirTodas: () => void
  alCerrarTodas: () => void
}

/** Rellenos que las bases traen en lugar de dejar el campo vacío. */
const SIN_VALOR = new Set([
  '',
  '0',
  '-',
  'NO',
  'NA',
  'N/A',
  'NO APLICA',
  'NO REGISTRA',
  'NO REGISTRADO',
  'NO REPORTA',
  'NO INFORMA',
  'NO TIENE',
  'NINGUNO',
  'NINGUNA',
  'SIN DATO',
  'SIN DATOS',
  'SIN REGISTRO',
  'SIN INFORMACION',
  'NULL',
  'NONE',
  'NAN',
  'N.A',
  'N.A.',
  'N/D',
  'ND',
  'NR',
  'S/D',
  'SD',
])

/** Un relleno no es un dato: ni las frases de arriba ni lo que solo trae ceros o signos («000», «--»). */
function esRelleno(valor: string): boolean {
  const clave = claveTexto(valor)
  // Las bases también marcan la falta con texto pegado: «.sinregistro», «SIN_REGISTRO», «sin-correo».
  const pegado = clave.replaceAll(/[^A-ZÑ0-9]/g, '')
  return SIN_VALOR.has(clave) || !/[1-9A-ZÑ]/.test(clave) || /^(SIN|NO)(REGISTRO|DATO|DATOS|CORREO|TELEFONO|CELULAR|INFORMACION|APLICA|TIENE|REGISTRA)$/.test(pegado)
}

/** Rótulos de contacto que son de otra persona (tutor, acudiente, codeudor, referencias). */
const DE_OTRA_PERSONA = /TUTOR|ACUDIENTE|CODEUDOR|REFERENCIA|FAMILIAR|EMERGENCIA|APODERADO|REPRESENTANTE/

const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Contacto {
  celulares: string[]
  telefonos: string[]
  correos: string[]
  municipios: string[]
  comunas: string[]
}

function soloDigitos(valor: string): string {
  return valor.replaceAll(/\D/g, '')
}

/** Dos formas de escribir el mismo número («300 555 0101», «3005550101», «+57 300 555 0101») son uno solo. */
function claveTelefono(valor: string): string {
  const cifras = soloDigitos(valor)
  if (cifras.length === 12 && cifras.startsWith('57')) return cifras.slice(2)
  return cifras || claveTexto(valor)
}

/** Solo se reagrupa un número limpio de 10 dígitos; lo demás se deja como viene. */
function telefonoLegible(valor: string): string {
  if (!/^\d{10}$/.test(valor)) return valor
  return `${valor.slice(0, 3)} ${valor.slice(3, 6)} ${valor.slice(6)}`
}

/** Un enlace tel: solo tiene sentido si el valor es un número y nada más. */
function esMarcable(valor: string): boolean {
  const cifras = soloDigitos(valor).length
  return cifras >= 7 && cifras <= 12 && /^[\d\s()+-]+$/.test(valor)
}

/** El «+» del indicativo internacional hace parte del número que se marca. */
function hrefTelefono(valor: string): string {
  return `tel:${valor.trim().startsWith('+') ? '+' : ''}${soloDigitos(valor)}`
}

/** Una celda con dos números («300… - 301…», «300… / 301…») son dos contactos; solo se parte si cada trozo es un número. */
function partirNumeros(valor: string): string[] {
  const trozos = valor.split(/\s*[;,/]\s*|\s+[-–y]\s+/).filter(Boolean)
  return trozos.length > 1 && trozos.every(esMarcable) ? trozos : [valor]
}

/**
 * Una celda con varios correos son varios contactos; solo se parte si cada trozo
 * es un correo. Si no, es uno solo y los espacios que traiga sobran.
 */
function partirCorreos(valor: string): string[] {
  const trozos = valor.split(/[\s;,/]+/).filter(Boolean)
  if (trozos.length > 1 && trozos.every((trozo) => ES_CORREO.test(trozo))) return trozos
  return [valor.replaceAll(/\s+/g, '')]
}

/** En Medellín las comunas van de la 1 a la 16 y los corregimientos son 50, 60, 70, 80 y 90. */
const CORREGIMIENTOS = new Set([50, 60, 70, 80, 90])

function divisionTerritorial(codigo: string): string | null {
  const numero = Number(codigo)
  if (numero >= 1 && numero <= 16) return `comuna ${numero}`
  if (CORREGIMIENTOS.has(numero)) return `corregimiento ${numero}`
  return null
}

/**
 * «7 - ROBLEDO» → «Robledo, comuna 7»; «80 - SAN ANTONIO DE PRADO» → «San Antonio
 * de Prado, corregimiento 80». Un código que no es comuna ni corregimiento se
 * muestra tal cual, sin rotularlo; si no trae esa forma, solo se arregla la caja.
 */
function comunaLegible(valor: string): string {
  if (/^\d+$/.test(valor)) {
    const division = divisionTerritorial(valor)
    return division ? division.charAt(0).toUpperCase() + division.slice(1) : valor
  }
  const partes = /^(\d+)\s*[-–]\s*(.+)$/.exec(valor)
  const codigo = partes?.[1]
  const nombre = partes?.[2]
  if (!codigo || !nombre) return tituloLegible(valor)
  const division = divisionTerritorial(codigo)
  return division ? `${tituloLegible(nombre)}, ${division}` : `${tituloLegible(nombre)} (${codigo})`
}

/**
 * Junta el contacto de todos los beneficios: cada base guarda el suyo y suelen
 * repetirse. Se conserva la primera aparición de cada valor y nunca los datos
 * del tutor, que son de otra persona.
 */
function reunirContacto(beneficios: readonly FichaFondos[]): Contacto {
  const celulares = new Map<string, string>()
  const telefonos = new Map<string, string>()
  const correos = new Map<string, string>()
  const municipios = new Map<string, string>()
  const comunas = new Map<string, string>()
  const anotar = (mapa: Map<string, string>, clave: string, valor: string) => {
    if (!mapa.has(clave)) mapa.set(clave, valor)
  }

  for (const ficha of beneficios) {
    for (const [etiqueta, crudo] of seccion(ficha, 'Datos personales')) {
      const valor = crudo.trim().replaceAll(/\s+/g, ' ')
      if (esRelleno(valor)) continue
      const rotulo = claveTexto(etiqueta)
      if (DE_OTRA_PERSONA.test(rotulo)) continue

      if (rotulo.startsWith('CELULAR')) {
        for (const numero of partirNumeros(valor)) anotar(celulares, claveTelefono(numero), numero)
      } else if (rotulo.startsWith('TELEFONO')) {
        for (const numero of partirNumeros(valor)) anotar(telefonos, claveTelefono(numero), numero)
      } else if (rotulo.startsWith('CORREO')) {
        for (const correo of partirCorreos(valor.toLowerCase())) anotar(correos, correo, correo)
      } else if (rotulo === 'MUNICIPIO DE RESIDENCIA') {
        // Se compara lo que se va a leer: «MEDELLIN» y «Medellín» son el mismo renglón.
        const legible = tituloLegible(valor)
        anotar(municipios, claveTexto(legible), legible)
      } else if (rotulo === 'COMUNA DE RESIDENCIA') {
        const legible = comunaLegible(valor)
        anotar(comunas, claveTexto(legible), legible)
      }
    }
  }

  // Un número que ya salió como celular no se repite como teléfono.
  for (const clave of celulares.keys()) telefonos.delete(clave)

  return {
    celulares: [...celulares.values()],
    telefonos: [...telefonos.values()],
    correos: [...correos.values()],
    municipios: [...municipios.values()],
    comunas: [...comunas.values()],
  }
}

/** El tipo de documento más explícito que traigan las fichas («Cédula…» antes que «CC»). */
function tipoDocumento(beneficios: readonly FichaFondos[]): string {
  let mejor = ''
  for (const ficha of beneficios) {
    const tipo = campo(ficha, 'Tipo de documento', 'Datos personales').trim()
    if (!esRelleno(tipo) && tipo.length > mejor.length) mejor = tipo
  }
  // Las siglas (CC, TI, PPT…) se dejan como siglas.
  return mejor.length <= 4 ? mejor.toUpperCase() : oracionLegible(mejor)
}

function rotuloTotal(conDato: number, cuantos: number, corte: string): string {
  if (cuantos === 1) return `Total girado en su beneficio, ${corte}.`
  if (conDato === cuantos) return `Total girado en sus ${cuantos} beneficios, ${corte}.`
  // Precisión: la suma no cubre los beneficios cuya base no trae el monto.
  const faltan = cuantos - conDato
  const resto = faltan === 1 ? 'El otro no trae ese dato.' : `Los otros ${faltan} no traen ese dato.`
  return `Total girado en ${conDato} de sus ${cuantos} beneficios, ${corte}. ${resto}`
}

function rangoPeriodos(primero: string | null, ultimo: string | null): { rotulo: string; valor: string } | null {
  const desde = primero ?? ultimo
  const hasta = ultimo ?? primero
  if (!desde || !hasta) return null
  if (desde === hasta) return { rotulo: 'Periodo', valor: desde }
  return { rotulo: 'Periodos', valor: `${desde} a ${hasta}` }
}

function cuentaEventos(eventos: FichaFondos): string {
  const filas = tablaHistorial(eventos)?.[2].length ?? 0
  if (filas === 0) return 'Sin registros'
  return filas === 1 ? '1 registro' : `${filas} registros`
}

interface PropsFila {
  rotulo: string
  /** Un valor por renglón (correos, residencia) en vez de seguidos. */
  enColumna?: boolean
  children: ReactNode
}

/** Un renglón del contacto: el rótulo y sus valores. */
function Fila({ rotulo, enColumna = false, children }: PropsFila) {
  return (
    <div className="vcp-fila">
      <dt className="vcp-rotulo">{rotulo}</dt>
      <dd className="vcp-dato">
        <ul className={enColumna ? 'vcp-valores vcp-valores--columna' : 'vcp-valores'}>{children}</ul>
      </dd>
    </div>
  )
}

/** Un celular o teléfono: se puede marcar (si es un número) y copiar. */
function Numero({ valor, que }: { valor: string; que: string }) {
  const legible = telefonoLegible(valor)
  return (
    <li className="vcp-valor">
      {esMarcable(valor) ? (
        <a className="vcp-enlace vc-num" href={hrefTelefono(valor)}>
          {legible}
        </a>
      ) : (
        <span className="vcp-texto">{legible}</span>
      )}
      <Copiar valor={valor} que={`${que} ${legible}`} />
    </li>
  )
}

export default function ResumenPersona({
  documento,
  beneficios,
  eventos,
  abiertas,
  alIrA,
  alAbrirTodas,
  alCerrarTodas,
}: PropsResumenPersona) {
  const textos = useTextosOrigen()
  const idNombre = useId()
  const entradas = useMemo(
    () => beneficios.map((ficha) => ({ ficha, resumen: resumenBeneficio(ficha) })),
    [beneficios],
  )
  const contacto = useMemo(() => reunirContacto(beneficios), [beneficios])
  const tipo = useMemo(() => tipoDocumento(beneficios), [beneficios])

  const nombre = beneficios.find((f) => f.n.trim())?.n.trim() ?? ''
  const documentoLegible = formatoDocumento(documento)

  // El total solo suma los beneficios cuya base trae el monto; si ninguna lo trae, no se muestra.
  let conTotal = 0
  let suma = 0
  for (const { resumen } of entradas) {
    if (resumen.totalGirado !== null && Number.isFinite(resumen.totalGirado)) {
      conTotal += 1
      suma += resumen.totalGirado
    }
  }
  const hayTotal = conTotal > 0

  const residencia = [
    ...contacto.municipios.map((valor) => ({ clave: `m-${valor}`, valor })),
    ...contacto.comunas.map((valor) => ({ clave: `c-${valor}`, valor })),
  ]
  const hayContacto =
    contacto.celulares.length > 0 ||
    contacto.telefonos.length > 0 ||
    contacto.correos.length > 0 ||
    residencia.length > 0

  // Se mira beneficio por beneficio: «abiertas» puede traer índices de una consulta anterior.
  const todasAbiertas = beneficios.every((_, i) => abiertas.has(i))
  const hayIndice = beneficios.length > 0 || eventos !== null

  return (
    <section className="vcp" aria-labelledby={idNombre}>
      <div className={hayTotal ? 'vcp-cabecera vcp-cabecera--con-total' : 'vcp-cabecera'}>
        <div className="vcp-identidad">
          <h2 id={idNombre} className="vcp-nombre">
            {nombre ? nombrePropio(nombre) : `Documento ${documentoLegible}`}
          </h2>
          <div className="vcp-doc">
            {nombre ? (
              <span className="vcp-doc-texto">
                {tipo || 'Documento'} <span className="vcp-doc-numero vc-num">{documentoLegible}</span>
              </span>
            ) : (
              // Sin nombre, el número ya está en el título: aquí solo el tipo y el botón.
              tipo && <span className="vcp-doc-texto">{tipo}</span>
            )}
            <Copiar valor={documento} que="el documento" />
          </div>
        </div>

        {hayTotal && (
          <div className="vcp-total">
            <div className="vcp-total-cifra vc-num">{pesos(suma)}</div>
            <div className="vcp-total-rotulo">{rotuloTotal(conTotal, beneficios.length, textos.segun)}</div>
          </div>
        )}

        {hayContacto && (
          <dl className="vcp-contacto">
            {contacto.celulares.length > 0 && (
              <Fila rotulo="Celular">
                {contacto.celulares.map((valor) => (
                  <Numero key={valor} valor={valor} que="el celular" />
                ))}
              </Fila>
            )}
            {contacto.telefonos.length > 0 && (
              <Fila rotulo="Teléfono">
                {contacto.telefonos.map((valor) => (
                  <Numero key={valor} valor={valor} que="el teléfono" />
                ))}
              </Fila>
            )}
            {contacto.correos.length > 0 && (
              <Fila rotulo="Correo" enColumna>
                {contacto.correos.map((correo) => (
                  <li key={correo} className="vcp-valor">
                    {ES_CORREO.test(correo) ? (
                      <a className="vcp-enlace" href={`mailto:${correo}`}>
                        {correo}
                      </a>
                    ) : (
                      <span className="vcp-texto">{correo}</span>
                    )}
                    <Copiar valor={correo} que={`el correo ${correo}`} />
                  </li>
                ))}
              </Fila>
            )}
            {residencia.length > 0 && (
              <Fila rotulo="Residencia" enColumna>
                {residencia.map(({ clave, valor }) => (
                  <li key={clave} className="vcp-valor">
                    <span className="vcp-texto">{valor}</span>
                  </li>
                ))}
              </Fila>
            )}
          </dl>
        )}
      </div>

      {hayIndice && (
        <nav className="vcp-indice" aria-label="Índice del expediente">
          <div className="vcp-indice-cabeza">
            <h3 className="vcp-indice-titulo">
              {beneficios.length === 0
                ? 'Sin beneficios registrados'
                : beneficios.length === 1
                  ? '1 beneficio'
                  : `${beneficios.length} beneficios`}
            </h3>
            {beneficios.length > 1 && (
              <button type="button" className="vcp-todos" onClick={todasAbiertas ? alCerrarTodas : alAbrirTodas}>
                {todasAbiertas ? 'Plegar todos' : 'Desplegar todos'}
              </button>
            )}
          </div>

          <ul className="vcp-lista">
            {entradas.map(({ ficha, resumen }, i) => {
              const programa = cortoPrograma(ficha.p)
              const rango = rangoPeriodos(resumen.primerPeriodo, resumen.ultimoPeriodo)
              const girado =
              resumen.totalGirado !== null && Number.isFinite(resumen.totalGirado)
                ? pesosCortos(resumen.totalGirado)
                : null
              // Nombre accesible armado a mano: el contenido son columnas sueltas y
              // leídas de corrido se pegarían unas con otras.
              const lectura = [
                programa,
                ficha.c ? `convocatoria ${ficha.c}` : '',
                estadoLegible(resumen.estadoActual),
                rango ? `${rango.rotulo.toLowerCase()} ${rango.valor}` : '',
                girado ? `girado ${girado}` : '',
              ]
                .filter(Boolean)
                .join(', ')
              return (
                // eslint-disable-next-line react/no-array-index-key -- una por beneficio, en el orden de la base; programa y convocatoria pueden repetirse
                <li key={i} className="vcp-item">
                  <button
                    type="button"
                    className="vcp-entrada"
                    aria-label={lectura}
                    aria-expanded={abiertas.has(i)}
                    onClick={() => alIrA(i)}
                  >
                    <span className="vcp-prog">
                      <span className="vcp-prog-nombre">{programa}</span>
                      {ficha.c && <span className="vcp-prog-conv">Convocatoria {ficha.c}</span>}
                    </span>
                    <span className="vcp-estado">
                      <ChipEstado estado={resumen.estadoActual} />
                    </span>
                    <span className="vcp-cifras">
                      {rango && (
                        <span className="vcp-periodos">
                          <span className="vcp-apoyo">{rango.rotulo}</span> <span className="vc-num">{rango.valor}</span>
                        </span>
                      )}
                      {girado && (
                        <span className="vcp-girado">
                          <span className="vcp-apoyo">Girado</span>{' '}
                          <span className="vcp-girado-valor vc-num">{girado}</span>
                        </span>
                      )}
                    </span>
                    <span className="vcp-flecha">
                      <Icono nombre="chevron" tamano={18} />
                    </span>
                  </button>
                </li>
              )
            })}

            {eventos && (
              <li className="vcp-item">
                <button
                  type="button"
                  className="vcp-entrada"
                  aria-label={`Eventos, ${cuentaEventos(eventos).toLowerCase()}`}
                  onClick={() => alIrA('eventos')}
                >
                  <span className="vcp-prog">
                    <span className="vcp-prog-nombre">Eventos</span>
                  </span>
                  <span className="vcp-eventos-cuenta">{cuentaEventos(eventos)}</span>
                  <span className="vcp-flecha">
                    <Icono nombre="chevron" tamano={18} />
                  </span>
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}
    </section>
  )
}
