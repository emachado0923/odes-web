/**
 * API del PAI simulada para las pruebas del tablero, los modales y la ficha
 * (solo para las pruebas: ningún componente lo importa). Reemplaza fetch y
 * XMLHttpRequest (subidas) con un manejador por petición y registra cada
 * petición (método, ruta, cabeceras y cuerpo) para revisarla después.
 * Llamar en cada prueba; vi.unstubAllGlobals() en afterEach.
 */
import { vi } from 'vitest'
import type { CodigoErrorPai } from '../api-pai'

export interface PeticionPai {
  metodo: string
  /** Ruta con la consulta, p. ej. /api/pai/tablero. */
  ruta: string
  cabeceras: Record<string, string>
  /** JSON ya leído, FormData, o null. */
  cuerpo: unknown
}

export interface RespuestaPai {
  estado: number
  cuerpo?: unknown
  cabeceras?: Record<string, string>
}

/** Devuelve la respuesta o undefined (404). */
export type ManejadorPai = (peticion: PeticionPai) => RespuestaPai | undefined

export function ok(cuerpo: unknown, estado = 200): RespuestaPai {
  return { estado, cuerpo }
}

export function falla(estado: number, codigo: CodigoErrorPai, mensaje: string, campos?: Record<string, string>): RespuestaPai {
  return { estado, cuerpo: { codigo, mensaje, ...(campos ? { campos } : {}) } }
}

function cabecerasDe(cabeceras: HeadersInit | undefined): Record<string, string> {
  const resultado: Record<string, string> = {}
  new Headers(cabeceras).forEach((valor, nombre) => {
    resultado[nombre] = valor
  })
  return resultado
}

const NO_ENCONTRADO: RespuestaPai = { estado: 404, cuerpo: { codigo: 'no_encontrado', mensaje: 'No se encontró.' } }

/** Instala fetch y XMLHttpRequest simulados; devuelve la lista (viva) de peticiones. */
export function simularApiPai(manejador: ManejadorPai): PeticionPai[] {
  const peticiones: PeticionPai[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
      if (init.signal?.aborted) throw new DOMException('Petición cancelada', 'AbortError')
      const peticion: PeticionPai = {
        metodo: (init.method ?? 'GET').toUpperCase(),
        ruta: String(entrada),
        cabeceras: cabecerasDe(init.headers),
        cuerpo: typeof init.body === 'string' ? JSON.parse(init.body) : (init.body ?? null),
      }
      peticiones.push(peticion)
      const r = manejador(peticion) ?? NO_ENCONTRADO
      return new Response(r.estado === 204 || r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), {
        status: r.estado,
        headers: { 'Content-Type': 'application/json', ...r.cabeceras },
      })
    }),
  )

  class XhrSimulado {
    status = 0
    responseText = ''
    responseType = ''
    private metodo = 'GET'
    private ruta = ''
    private cabeceras: Record<string, string> = {}
    private respuestaCabeceras: Record<string, string> = {}
    private oyentes = new Map<string, (() => void)[]>()
    upload = {
      oyentes: [] as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void)[],
      addEventListener(_tipo: string, oyente: (e: { lengthComputable: boolean; loaded: number; total: number }) => void) {
        this.oyentes.push(oyente)
      },
    }
    open(metodo: string, ruta: string) {
      this.metodo = metodo
      this.ruta = ruta
    }
    setRequestHeader(nombre: string, valor: string) {
      this.cabeceras[nombre.toLowerCase()] = valor
    }
    getResponseHeader(nombre: string) {
      return this.respuestaCabeceras[nombre] ?? null
    }
    addEventListener(tipo: string, oyente: () => void) {
      this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), oyente])
    }
    abort() {
      for (const oyente of this.oyentes.get('abort') ?? []) oyente()
    }
    send(cuerpo: unknown) {
      setTimeout(() => {
        for (const oyente of this.upload.oyentes) oyente({ lengthComputable: true, loaded: 50, total: 100 })
        const peticion: PeticionPai = { metodo: this.metodo, ruta: this.ruta, cabeceras: this.cabeceras, cuerpo }
        peticiones.push(peticion)
        const r = manejador(peticion) ?? NO_ENCONTRADO
        this.status = r.estado
        this.respuestaCabeceras = r.cabeceras ?? {}
        this.responseText = r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo)
        for (const oyente of this.upload.oyentes) oyente({ lengthComputable: true, loaded: 100, total: 100 })
        for (const oyente of this.oyentes.get('load') ?? []) oyente()
      }, 0)
    }
  }
  vi.stubGlobal('XMLHttpRequest', XhrSimulado)
  return peticiones
}
