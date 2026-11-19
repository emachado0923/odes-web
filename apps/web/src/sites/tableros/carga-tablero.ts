import { ErrorSinSesion } from './sesion-tableros'
import type { ComponentType } from 'react'
import { esFalloDeCarga, olvidarRecarga, recargarUnaVez } from '../../compartido/fallo-de-carga'

/**
 * Lo común a la carga de los tableros que llegaron como tableros estáticos
 * (matrícula 2025 y batería de indicadores): cada página trae sus datos,
 * espera las fuentes y luego importa el módulo del tablero, que va en su
 * propio chunk. La pantalla de espera y el aviso de error son los de
 * componentes/CargaTablero.tsx.
 */

/**
 * Los gráficos se pintan en un lienzo con la letra disponible en ese momento y
 * guardan lo que mide cada rótulo; los iconos son ligaduras de Material
 * Symbols. Como en los tableros estáticos, se espera a las dos fuentes, sin
 * pasar de 2,5 s (si tardan, arranca con la letra del sistema).
 */
export function esperarFuentes(): Promise<unknown> {
  const fuentes = document.fonts as FontFaceSet | undefined
  if (!fuentes?.load) return Promise.resolve()
  const carga = Promise.all([
    fuentes.load('400 1em Rubik').catch(() => undefined),
    fuentes.load('24px "Material Symbols Outlined"').catch(() => undefined),
  ])
  return Promise.race([carga, new Promise((listo) => setTimeout(listo, 2500))])
}

/**
 * Importa el módulo de un tablero (su export por defecto). Si el chunk ya no
 * existe porque la página quedó de un despliegue anterior, recarga la página
 * una sola vez por pestaña (marca `claveRecarga`), que trae la versión
 * vigente; mientras tanto la promesa no se resuelve y sigue el aviso de carga.
 */
export async function importarTablero(
  importar: () => Promise<{ default: unknown }>,
  claveRecarga: string,
): Promise<ComponentType> {
  try {
    const modulo = await importar()
    olvidarRecarga(claveRecarga)
    return modulo.default as ComponentType
  } catch (error) {
    if (!esFalloDeCarga(error)) throw error
    if (recargarUnaVez(claveRecarga)) return new Promise<never>(() => undefined)
    throw new Error('No se pudo descargar el tablero. Es posible que el sitio se haya actualizado: recargue la página.')
  }
}

/** Reintentos ante un 503: la base puede estar en un corte momentáneo. */
const REINTENTOS_NO_DISPONIBLE = 2

/** Espera antes de reintentar: la que pide Retry-After, de 0 a 3 s (1 s si no viene). */
function esperaReintento(respuesta: Response): Promise<void> {
  const segundos = Number(respuesta.headers.get('Retry-After') ?? 1)
  const ms = Number.isFinite(segundos) ? Math.min(3, Math.max(0, segundos)) * 1000 : 1000
  return new Promise((listo) => setTimeout(listo, ms))
}

/**
 * Pide los datos de un tablero a /api/sivu/tableros/:id, con dos reintentos
 * ante un 503 y un mensaje claro si falla (lo muestra CargaTablero). Es la
 * misma lógica que matricula/PaginaMatricula.tsx, que conserva su copia.
 */
export async function pedirDatosTablero<T>(url: string): Promise<T> {
  for (let intento = 0; ; intento++) {
    const respuesta = await fetch(url, { headers: { Accept: 'application/json' } })
    if (respuesta.ok) return (await respuesta.json()) as T
    if (respuesta.status === 503 && intento < REINTENTOS_NO_DISPONIBLE) {
      await esperaReintento(respuesta)
      continue
    }
    // Tablero privado sin sesión (o con la sesión vencida): la página pide ingresar.
    if (respuesta.status === 401) throw new ErrorSinSesion()
    throw new Error(
      respuesta.status === 503
        ? 'La base de datos no está disponible en este momento. Intente de nuevo en unos minutos.'
        : respuesta.status === 404
          ? 'El tablero todavía no tiene datos cargados.'
          : `El servidor respondió con el código ${respuesta.status}.`,
    )
  }
}
