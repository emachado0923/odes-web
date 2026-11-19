/**
 * Robustez de la ventanilla con las fichas reales. OPCIONAL: se salta si no está la variable de entorno
 * VITE_FICHAS_CSV con la ruta del CSV que escribe etl_consulta.py (ese archivo va fuera del repositorio:
 * tiene datos personales). Sirve después de cada carga nueva de datos:
 *
 *   VITE_FICHAS_CSV=/ruta/privada/fichas.csv npx vitest run src/sites/tableros/fondos/ventanilla/fichas-reales.test.tsx
 *
 * Recorre TODAS las fichas por la lectura (resumenBeneficio) y pinta una muestra amplia con las piezas de
 * la pantalla, para comprobar que ningún dato real las rompe. Nunca imprime datos de las fichas: solo
 * conteos, claves de programa y textos de estado (que no son de nadie en particular). Con VITE_FICHAS_INFORME
 * (una ruta), deja ahí ese resumen en texto.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EventosPersona from './EventosPersona'
import FichaBeneficio from './FichaBeneficio'
import { aNumero, campo, resumenBeneficio } from './ficha'
import ResumenPersona from './ResumenPersona'
import type { FichaFondos } from './tipos'

const RUTA = (import.meta.env.VITE_FICHAS_CSV as string | undefined) ?? ''
const INFORME = (import.meta.env.VITE_FICHAS_INFORME as string | undefined) ?? ''

/** Agrega una línea al resumen (solo conteos) y, si se pidió, lo deja en el archivo del informe. */
const lineas: string[] = []
async function anotar(linea: string): Promise<void> {
  lineas.push(linea)
  console.info(linea)
  if (!INFORME) return
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as ModuloFs
  fs.writeFileSync(INFORME, `${lineas.join('\n')}\n`)
}

// El proyecto de la web no carga los tipos de Node (corre en el navegador): aquí basta con esto.
interface ModuloFs {
  readFileSync(ruta: string, codificacion: 'utf8'): string
  writeFileSync(ruta: string, contenido: string): void
}
interface ModuloZlib {
  inflateSync(datos: Uint8Array, opciones?: { dictionary?: Uint8Array }): Uint8Array
}

const bytes = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (c) => c.codePointAt(0) ?? 0)

/** Fichas por documento, en el orden del archivo (el mismo de la base). La clave no se usa para nada más. */
async function leerFichas(ruta: string): Promise<FichaFondos[][]> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as ModuloFs
  const zlib = (await import(/* @vite-ignore */ ['node', 'zlib'].join(':'))) as ModuloZlib
  const lineas = fs.readFileSync(ruta, 'utf8').split(/\r?\n/).filter(Boolean)
  const ultimoCampo = (linea: string) => linea.slice(linea.lastIndexOf(',') + 1)
  // La primera fila es el diccionario de compresión (etl_consulta.py).
  const diccionario = bytes(ultimoCampo(lineas[0]))
  const decodificador = new TextDecoder()
  const porDocumento = new Map<string, FichaFondos[]>()
  for (const linea of lineas.slice(1)) {
    const documento = linea.slice(0, linea.indexOf(','))
    const json = decodificador.decode(zlib.inflateSync(bytes(ultimoCampo(linea)), { dictionary: diccionario }))
    const lista = porDocumento.get(documento) ?? []
    lista.push(JSON.parse(json) as FichaFondos)
    porDocumento.set(documento, lista)
  }
  return [...porDocumento.values()]
}

const nada = () => undefined

describe.skipIf(!RUTA)('la ventanilla con las fichas reales', () => {
  it(
    'lee todas las fichas y pinta una muestra amplia sin romperse',
    async () => {
      const personas = await leerFichas(RUTA)
      const fichas = personas.flat()
      expect(fichas.length).toBeGreaterThan(1000)

      // 1. La lectura de todas: periodos, estados y totales.
      let periodos = 0
      const estadosSinCategoria = new Map<string, number>()
      let pregradoConTotal = 0
      let pregradoTotalDistinto = 0
      let sinTotal = 0
      const porPrograma = new Map<string, number>()
      for (const ficha of fichas) {
        porPrograma.set(ficha.p, (porPrograma.get(ficha.p) ?? 0) + 1)
        const r = resumenBeneficio(ficha)
        if (ficha.p === 'EVENTOS') continue
        if (r.totalGirado === null) sinTotal++
        for (const p of r.periodos) {
          periodos++
          if (p.categoria === 'Sin dato' && p.estado.trim()) estadosSinCategoria.set(p.estado, (estadosSinCategoria.get(p.estado) ?? 0) + 1)
        }
        const delCampo = aNumero(campo(ficha, 'Total desembolsado', 'Cierre y PACC'))
        if (delCampo !== null) {
          pregradoConTotal++
          const suma = r.periodos.reduce((a, p) => a + (p.monto ?? 0), 0)
          if (Math.abs(suma - delCampo) > 1) pregradoTotalDistinto++
        }
      }
      const sinCategoria = [...estadosSinCategoria.values()].reduce((a, b) => a + b, 0)
      await anotar(
        `fichas ${fichas.length}, personas ${personas.length}, periodos ${periodos}; por programa ${JSON.stringify(Object.fromEntries(porPrograma))}; ` +
          `beneficios sin total girado ${sinTotal}; pregrado con total ${pregradoConTotal}, distinto de la suma por periodo ${pregradoTotalDistinto}; ` +
          `periodos con estado sin categoría ${sinCategoria}: ${JSON.stringify(Object.fromEntries([...estadosSinCategoria].toSorted((a, b) => b[1] - a[1]).slice(0, 25)))}`,
      )
      // Casi todo estado escrito cae en una categoría del tablero; lo demás se pinta como «Sin dato» con su texto.
      expect(sinCategoria / Math.max(1, periodos)).toBeLessThan(0.01)
      // En pregrado, el total del resumen es la suma de lo girado por periodo.
      expect(pregradoTotalDistinto / Math.max(1, pregradoConTotal)).toBeLessThan(0.001)

      // 2. Pintar: todas las personas con más de un beneficio o con programas poco comunes, una de cada 12 del resto
      //    y los 60 historiales más largos.
      const largos = new Set(
        personas
          .map((lista, i) => ({ i, n: Math.max(...lista.map((f) => f.t[0]?.[2].length ?? 0)) }))
          .toSorted((a, b) => b.n - a.n)
          .slice(0, 60)
          .map((x) => x.i),
      )
      const comunes = new Set(['EPM', 'PP'])
      let pintadas = 0
      let fallos = 0
      const errores = new Map<string, number>()
      personas.forEach((lista, i) => {
        const beneficios = lista.filter((f) => f.p !== 'EVENTOS')
        const eventos = lista.find((f) => f.p === 'EVENTOS') ?? null
        const interesa = largos.has(i) || lista.length > 1 || lista.some((f) => !comunes.has(f.p)) || i % 12 === 0
        if (!interesa) return
        try {
          const html = renderToStaticMarkup(
            <div className="vc">
              <ResumenPersona
                documento="0"
                beneficios={beneficios}
                eventos={eventos}
                abiertas={new Set(beneficios.map((_, j) => j))}
                alIrA={nada}
                alAbrirTodas={nada}
                alCerrarTodas={nada}
              />
              {beneficios.map((ficha, j) => (
                // eslint-disable-next-line react/no-array-index-key -- una ficha por beneficio, en el orden de la base
                <FichaBeneficio key={j} ficha={ficha} id={`b-${j}`} abierta alAlternar={nada} />
              ))}
              {eventos && <EventosPersona ficha={eventos} id="ev" />}
            </div>,
          )
          if (html.length < 200 || html.includes('undefined') || html.includes('NaN') || html.includes('[object Object]')) {
            fallos++
            const motivo = html.length < 200 ? 'casi vacío' : html.includes('NaN') ? 'NaN' : html.includes('[object Object]') ? 'objeto' : 'undefined'
            errores.set(motivo, (errores.get(motivo) ?? 0) + 1)
          }
          pintadas++
        } catch (error) {
          fallos++
          // Solo el tipo de error y los programas: nunca el contenido de la ficha.
          const clave = `${error instanceof Error ? error.message.slice(0, 80) : 'error'} [${lista.map((f) => f.p).join(',')}]`
          errores.set(clave, (errores.get(clave) ?? 0) + 1)
        }
      })
      await anotar(`personas pintadas ${pintadas}, con fallo ${fallos}: ${JSON.stringify(Object.fromEntries([...errores].slice(0, 12)))}`)
      expect(pintadas).toBeGreaterThan(500)
      expect(fallos).toBe(0)
    },
    600_000,
  )

  it(
    'recorre con clics cada parada de los historiales más largos',
    async () => {
      const personas = await leerFichas(RUTA)
      const beneficios = personas
        .flat()
        .filter((f) => f.p !== 'EVENTOS')
        .toSorted((a, b) => (b.t[0]?.[2].length ?? 0) - (a.t[0]?.[2].length ?? 0))
      // Los 25 más largos y 25 repartidos por el resto (cada programa aparece).
      const paso = Math.max(1, Math.floor(beneficios.length / 25))
      const muestra = [...beneficios.slice(0, 25), ...beneficios.filter((_, i) => i % paso === 0).slice(0, 25)]
      let paradas = 0
      for (const ficha of muestra) {
        const { unmount } = render(
          <div className="vc">
            <FichaBeneficio ficha={ficha} id="b" abierta alAlternar={nada} />
          </div>,
        )
        // Cada parada del recorrido es un botón que empieza por su periodo («2021-1, …»).
        const botones = within(screen.getByRole('article')).queryAllByRole('button', { name: /^\d{4}-\d, / })
        for (const boton of botones) {
          fireEvent.click(boton)
          paradas++
        }
        unmount()
      }
      await anotar(`beneficios recorridos ${muestra.length}, paradas pulsadas ${paradas}`)
      expect(paradas).toBeGreaterThan(100)
    },
    600_000,
  )
})
