/**
 * Ficha de un beneficio de la ventanilla: el expediente de un programa
 * (Fondo EPM, Mejores Bachilleres, Enlaza Mundos…) de la persona consultada.
 *
 * La cabecera siempre se ve y es el botón que despliega: plegada basta para
 * saber programa, convocatoria, estado, cuánto se ha girado y entre qué
 * periodos. Desplegada va de la respuesta al detalle: lo esencial (el total
 * girado manda), el recorrido por periodo (HistorialPeriodos) y los datos de
 * la ficha por secciones.
 *
 * La ficha es genérica: cada programa trae secciones, etiquetas y columnas
 * distintas, así que todo se busca por nombre y lo que no viene no se muestra.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import ChipEstado from './ChipEstado'
import Copiar from './Copiar'
import { categoriaEstado, claveTexto, COLOR_ESTADO } from './estados'
import {
  campo,
  formatoDocumento,
  nombrePrograma,
  nombrePropio,
  oracionLegible,
  pesos,
  pesosCortos,
  resumenBeneficio,
  tituloLegible,
  type ResumenBeneficio,
} from './ficha'
import HistorialPeriodos from './HistorialPeriodos'
import Icono from './iconos'
import type { FichaFondos } from './tipos'
import './ficha.css'

export interface PropsFichaBeneficio {
  ficha: FichaFondos
  /** id del elemento raíz: la persona y sus chips saltan aquí. */
  id: string
  abierta: boolean
  alAlternar: () => void
}

/** El filete de la ficha toma el color del estado actual por variable CSS. */
type EstiloFicha = CSSProperties & { '--vcf-color': string }

/** «Datos personales» ya se ve en la cabecera de la persona: llega cerrada. */
const SECCIONES_CERRADAS = new Set(['DATOS PERSONALES'])

/** Etiquetas cuyo valor es el nombre de una persona, que la base guarda EN MAYÚSCULAS. */
const PREFIJOS_PERSONA = ['NOMBRE', 'TUTOR']

/**
 * Etiquetas cuyo valor es una institución, un programa académico o un lugar:
 * mayúscula por palabra, con sus tildes y siglas («Institución Universitaria ITM»).
 */
const PREFIJOS_TITULO = [
  'IES',
  'INSTITUCION',
  'UNIVERSIDAD',
  'COLEGIO',
  'PROGRAMA',
  'MUNICIPIO',
  'CIUDAD',
  'DEPARTAMENTO',
  'BARRIO',
  'PAIS',
  'OPERADOR',
  'DEPORTE',
]

/**
 * Etiquetas de valores corrientes en mayúsculas («MATRICULA Y SOSTENIMIENTO»,
 * «CEDULA DE CIUDADANIA»): se leen como una frase. Lo que no está en ninguna
 * lista se deja como viene, para no tocar códigos ni nombres propios.
 */
const PREFIJOS_ORACION = [
  'MODALIDAD',
  'TIPO',
  'MOTIVO',
  'CAUSA',
  'NIVEL',
  'JORNADA',
  'METODOLOGIA',
  'ZONA',
  'SEXO',
  'GENERO',
  'ESTADO CIVIL',
]

/** En Medellín estos códigos son corregimientos; del 1 al 16, comunas. */
const CORREGIMIENTOS = new Set([50, 60, 70, 80, 90])

/** Lo que quien atiende pega en otro sistema o en un correo. */
const PREFIJOS_COPIAR = ['CELULAR', 'TELEFONO', 'CORREO', 'CONTRATO']
const EXACTAS_COPIAR = new Set(['DOCUMENTO', 'TARJETA DE IDENTIDAD', 'ID SOLICITUD'])

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** «2025-08-14» → «14 de agosto de 2025»; null si el texto no es una fecha. */
function fechaLegible(valor: string): string | null {
  // Algunas bases exportan la fecha con la hora en ceros («2025-08-14 00:00:00»).
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00:00(?:\.0+)?)?$/.exec(valor)
  if (!partes) return null
  const anio = Number(partes[1])
  const mes = Number(partes[2])
  const dia = Number(partes[3])
  // En UTC para que el día no se corra con la zona horaria del navegador.
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  // Date «corrige» un 31 de febrero a marzo: si no coincide, no era una fecha.
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null
  return FORMATO_FECHA.format(fecha)
}

function empiezaPor(clave: string, prefijos: string[]): boolean {
  return prefijos.some((prefijo) => clave.startsWith(prefijo))
}

/** «IES actual» y también «Nombre de la universidad»: no es una persona. */
function esTitulo(clave: string): boolean {
  if (empiezaPor(clave, PREFIJOS_TITULO)) return true
  return clave.startsWith('NOMBRE') && PREFIJOS_TITULO.some((palabra) => clave.includes(` ${palabra}`))
}

/**
 * «7 - ROBLEDO» → «Robledo, comuna 7»; «80 - SAN ANTONIO DE PRADO» → «San
 * Antonio de Prado, corregimiento 80». Con otro código no se sabe qué es: se
 * deja el código como viene y solo se arregla el nombre.
 */
function leerComuna(valor: string): string {
  const partes = /^(\d+)\s*-\s*(.+)$/.exec(valor)
  if (!partes) return tituloLegible(valor)
  const [, codigo = '', nombre = ''] = partes
  const numero = Number(codigo)
  const lugar = tituloLegible(nombre.trim())
  if (CORREGIMIENTOS.has(numero)) return `${lugar}, corregimiento ${numero}`
  if (numero >= 1 && numero <= 16) return `${lugar}, comuna ${numero}`
  return `${codigo} - ${lugar}`
}

/** El valor de un campo como se lee, no como está en la base. */
function leerValor(clave: string, valor: string): { texto: string; cifra: boolean } {
  const plano = claveTexto(valor)
  if (plano === 'SI') return { texto: 'Sí', cifra: false }
  if (plano === 'NO') return { texto: 'No', cifra: false }
  const fecha = fechaLegible(valor)
  if (fecha) return { texto: fecha, cifra: false }
  if (valor.startsWith('$')) return { texto: valor, cifra: true }
  if (clave === 'DOCUMENTO') return { texto: formatoDocumento(valor), cifra: true }
  if (clave.startsWith('COMUNA')) return { texto: leerComuna(valor), cifra: false }
  if (esTitulo(clave)) return { texto: tituloLegible(valor), cifra: false }
  if (empiezaPor(clave, PREFIJOS_PERSONA)) return { texto: nombrePropio(valor), cifra: false }
  if (empiezaPor(clave, PREFIJOS_ORACION)) return { texto: oracionLegible(valor), cifra: false }
  return { texto: valor, cifra: false }
}

/** Complemento del nombre accesible del botón: «Copiar el celular alternativo». */
function queCopia(etiqueta: string, clave: string): string {
  if (clave === 'ID SOLICITUD') return 'el ID de la solicitud'
  const articulo = clave.startsWith('TARJETA') ? 'la' : 'el'
  return `${articulo} ${etiqueta.charAt(0).toLowerCase()}${etiqueta.slice(1)}`
}

/** Primer valor no vacío entre varias etiquetas: cada programa nombra distinto lo mismo. */
function primerValor(ficha: FichaFondos, ...etiquetas: string[]): string {
  for (const etiqueta of etiquetas) {
    const valor = campo(ficha, etiqueta).trim()
    if (valor) return valor
  }
  return ''
}

function textoGiros(realizados: number | null, pendientes: number | null): string {
  const partes: string[] = []
  if (realizados !== null) {
    partes.push(realizados === 1 ? '1 giro realizado' : `${realizados} giros realizados`)
  }
  if (pendientes !== null) {
    // Tras «giros realizados» no hace falta repetir la palabra.
    const sustantivo = realizados === null ? (pendientes === 1 ? 'giro ' : 'giros ') : ''
    partes.push(`${pendientes} ${sustantivo}${pendientes === 1 ? 'pendiente' : 'pendientes'}`)
  }
  return partes.join(', ')
}

/** Los extremos del recorrido; vacíos si la ficha no trae historial. */
function extremos(resumen: ResumenBeneficio): { primero: string; ultimo: string } {
  const primero = resumen.primerPeriodo ?? ''
  return { primero, ultimo: resumen.ultimoPeriodo ?? primero }
}

/** «13 periodos, de 2019-2 a 2025-2». */
function textoPeriodos(resumen: ResumenBeneficio): string {
  const cuantos = resumen.periodos.length
  const { primero, ultimo } = extremos(resumen)
  if (cuantos === 0 || !primero) return ''
  if (cuantos === 1) return `1 periodo, ${primero}`
  if (primero === ultimo) return `${cuantos} periodos, ${primero}`
  return `${cuantos} periodos, de ${primero} a ${ultimo}`
}

/** El rango para la cabecera plegada: «De 2019-2 a 2025-2». */
function textoRango(resumen: ResumenBeneficio): string {
  const { primero, ultimo } = extremos(resumen)
  if (resumen.periodos.length === 0 || !primero) return ''
  return primero === ultimo ? `Periodo ${primero}` : `De ${primero} a ${ultimo}`
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const clave = claveTexto(etiqueta)
  const copiable = EXACTAS_COPIAR.has(clave) || empiezaPor(clave, PREFIJOS_COPIAR)
  // «Estado civil» no es un estado del beneficio: no lleva chip.
  const esEstado = clave.startsWith('ESTADO') && !clave.startsWith('ESTADO CIVIL')
  const leido = leerValor(clave, valor)
  return (
    <div className="vcf-campo">
      <dt className="vcf-rotulo">{etiqueta}</dt>
      <dd className="vcf-valor">
        {esEstado ? (
          <span className="vcf-valor-chip">
            <ChipEstado estado={valor} />
          </span>
        ) : (
          <span className={leido.cifra ? 'vcf-valor-texto vc-num' : 'vcf-valor-texto'}>
            {leido.texto}
          </span>
        )}
        {/* Se copia el valor de la base, no el que se muestra con puntos. */}
        {copiable && <Copiar valor={valor} que={queCopia(etiqueta, clave)} className="vcf-copiar" />}
      </dd>
    </div>
  )
}

function SeccionDatos({ titulo, campos }: { titulo: string; campos: [string, string][] }) {
  const [abierta, setAbierta] = useState(() => !SECCIONES_CERRADAS.has(claveTexto(titulo)))
  return (
    <details
      className="vcf-seccion"
      open={abierta}
      onToggle={(evento) => setAbierta(evento.currentTarget.open)}
    >
      <summary className="vcf-seccion-cabecera">
        <Icono nombre="chevron" tamano={16} className="vcf-seccion-flecha" />
        <h4 className="vcf-seccion-titulo">{titulo}</h4>
      </summary>
      <dl className="vcf-lista">
        {/* Con la posición: una sección puede repetir etiquetas y la lista no se reordena. */}
        {campos.map(([etiqueta, valor], indice) => (
          <Campo key={`${indice}-${etiqueta}`} etiqueta={etiqueta} valor={valor} />
        ))}
      </dl>
    </details>
  )
}

export default function FichaBeneficio({ ficha, id, abierta, alAlternar }: PropsFichaBeneficio) {
  const resumen = useMemo(() => resumenBeneficio(ficha), [ficha])
  const idCuerpo = `${id}-cuerpo`
  const idTitulo = `${id}-titulo`
  // Las secciones recuerdan si están abiertas: con otra ficha empiezan de nuevo.
  const claveFicha = `${ficha.p}|${ficha.c}|${ficha.n}`

  // Sin historial, el estado es el general de la ficha.
  const estadoActual = resumen.estadoActual || ficha.e
  const categoriaActual = resumen.estadoActual ? resumen.categoriaActual : categoriaEstado(ficha.e)

  const total = resumen.totalGirado
  const giros = textoGiros(resumen.girosRealizados, resumen.girosPendientes)
  const periodos = textoPeriodos(resumen)
  const rango = textoRango(resumen)
  const institucion = primerValor(ficha, 'IES actual', 'Universidad', 'Universidad de destino')
  const programaAcademico = primerValor(ficha, 'Programa actual', 'Programa', 'Programa en el exterior')

  // Lo que acompaña a la cifra, como texto. Sin total, los giros bajan aquí.
  const acompanan: [string, string][] = []
  if (total === null && giros) acompanan.push(['Giros', giros])
  if (periodos) acompanan.push(['Periodos', periodos])
  if (institucion) acompanan.push(['Institución', tituloLegible(institucion)])
  if (programaAcademico) acompanan.push(['Programa académico', tituloLegible(programaAcademico)])

  // Un campo vacío no se muestra; una sección sin campos tampoco.
  const secciones = ficha.s
    .map(([titulo, campos]): [string, [string, string][]] => [
      titulo,
      campos
        .map(([etiqueta, valor]): [string, string] => [etiqueta, valor.trim()])
        .filter(([, valor]) => valor !== ''),
    ])
    .filter(([, campos]) => campos.length > 0)

  const estilo: EstiloFicha = { '--vcf-color': COLOR_ESTADO[categoriaActual].color }

  return (
    <article className="vcf" id={id} tabIndex={-1} style={estilo} aria-labelledby={idTitulo}>
      <h3 className="vcf-cabecera" id={idTitulo}>
        <button
          type="button"
          className="vcf-boton"
          aria-expanded={abierta}
          aria-controls={idCuerpo}
          onClick={alAlternar}
        >
          <span className="vcf-identidad">
            <span className="vcf-programa">{nombrePrograma(ficha.p)}</span>
            {ficha.c && <span className="vcf-convocatoria">Convocatoria {ficha.c}</span>}
          </span>
          {/* El vistazo solo hace falta plegada: desplegada, lo esencial lo dice completo. */}
          {(total !== null || rango) && (
            <span className="vcf-vistazo">
              {total !== null && (
                <span className="vcf-vistazo-total vc-num">{pesosCortos(total)} girados</span>
              )}
              {rango && <span className="vcf-vistazo-rango vc-num">{rango}</span>}
            </span>
          )}
          <ChipEstado estado={estadoActual} className="vcf-estado" />
          <Icono nombre="chevron" tamano={20} className="vcf-flecha" />
        </button>
      </h3>

      <div
        id={idCuerpo}
        className={abierta ? 'vcf-cuerpo vcf-cuerpo-abierto' : 'vcf-cuerpo'}
        inert={!abierta}
        aria-hidden={abierta ? undefined : true}
      >
        {/* Tres cajas: la que anima la altura, la que recorta y la que lleva el relleno
            (el relleno en la que recorta impediría plegar hasta cero). */}
        <div className="vcf-recorte">
          <div className="vcf-contenido">
            {(total !== null || acompanan.length > 0) && (
              <div className={total === null ? 'vcf-esencial vcf-esencial-simple' : 'vcf-esencial'}>
                {total !== null && (
                  <div className="vcf-total">
                    <div className="vcf-total-rotulo">Total girado</div>
                    <div className="vcf-total-cifra vc-num">{pesos(total)}</div>
                    {giros && <div className="vcf-total-giros">{giros}</div>}
                  </div>
                )}
                {acompanan.length > 0 && (
                  <dl className="vcf-acompana">
                    {acompanan.map(([rotulo, valor]) => (
                      <div className="vcf-acompana-fila" key={rotulo}>
                        <dt className="vcf-acompana-rotulo">{rotulo}</dt>
                        <dd className="vcf-acompana-valor">{valor}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}

            <div className="vcf-historial">
              <HistorialPeriodos ficha={ficha} />
            </div>

            {secciones.length > 0 && (
              <div className="vcf-datos">
                {secciones.map(([titulo, campos]) => (
                  <SeccionDatos key={`${claveFicha}|${titulo}`} titulo={titulo} campos={campos} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
