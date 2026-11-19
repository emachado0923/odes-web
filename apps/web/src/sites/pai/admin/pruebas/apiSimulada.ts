/**
 * API del PAI simulada para las pruebas de la sesión y de la administración:
 * reemplaza fetch (vi.stubGlobal) y responde como el servidor según el
 * contrato (api-pai.ts): sesión con cookie (aquí, un estado), CSRF en las
 * mutaciones, 401 sin sesión, 403 cambio_contrasena_requerido, 403 en
 * /admin para responsables, y los datos de datos.ts. Registra cada petición.
 *
 *   const api = new ApiSimuladaPai()
 *   api.iniciarComo('administrador')   // con sesión desde el principio
 *   api.instalar()
 *   api.forzar('GET', '/admin/usuarios', { estado: 503, cuerpo: {...}, cabeceras: { 'Retry-After': '0' } })
 */
import { vi } from 'vitest'
import {
  CABECERA_CSRF,
  RUTA_API_PAI,
  type AutorizacionPai,
  type CambiosUsuarioPai,
  type DatosAutorizacionPai,
  type DatosUsuarioNuevoPai,
  type DatosVigenciaPai,
  type EntradaRegistroPai,
  type RolPai,
  type SesionPai,
  type TableroPai,
  type UsuarioPai,
  type VigenciaPai,
} from '../../api-pai'
import { sesionPrueba, vigenciaPrueba } from '../../pruebas/datosPrueba'
import { CONTRASENA_PRUEBA, autorizacionPrueba, entradaRegistroPrueba, tableroPrueba, usuarioPrueba, usuariosPrueba } from './datos'

export interface PeticionSimulada {
  metodo: string
  /** Ruta relativa a /api/pai, con la consulta (p. ej., /admin/registro?pagina=2). */
  ruta: string
  cuerpo: unknown
  cabeceras: Record<string, string>
}

export interface RespuestaSimulada {
  estado: number
  cuerpo?: unknown
  cabeceras?: Record<string, string>
}

interface Cuenta {
  contrasena: string
  sesion: SesionPai
}

export function errorSimulado(estado: number, codigo: string, mensaje: string, campos?: Record<string, string>): RespuestaSimulada {
  return { estado, cuerpo: campos ? { codigo, mensaje, campos } : { codigo, mensaje } }
}

export class ApiSimuladaPai {
  /** Sesión abierta en el "servidor" (la cookie); null = sin sesión. */
  sesion: SesionPai | null = null
  cuentas = new Map<string, Cuenta>([
    ['responsable.saf', { contrasena: CONTRASENA_PRUEBA, sesion: sesionPrueba('responsable') }],
    ['planeacion', { contrasena: CONTRASENA_PRUEBA, sesion: sesionPrueba('administrador') }],
  ])
  vigencia: VigenciaPai = vigenciaPrueba()
  tablero: TableroPai = tableroPrueba(this.vigencia)
  usuarios: UsuarioPai[] = usuariosPrueba()
  autorizaciones: AutorizacionPai[] = [
    autorizacionPrueba(1),
    autorizacionPrueba(2, {
      bimestre: 1,
      estado: 'revocada',
      revocadaEn: '2026-08-10T15:00:00.000Z',
      revocadaPor: 'Planeación Estratégica',
      motivo: 'Ajuste del bimestre 1',
    }),
  ]
  registro: EntradaRegistroPai[] = [entradaRegistroPrueba(1)]
  registroPorPagina = 50
  peticiones: PeticionSimulada[] = []
  private forzadas = new Map<string, RespuestaSimulada[]>()

  /** Abre una sesión de ese rol (como si la cookie ya existiera). */
  iniciarComo(rol: RolPai, cambios: Partial<SesionPai> = {}): SesionPai {
    const usuario = rol === 'administrador' ? 'planeacion' : 'responsable.saf'
    const cuenta = this.cuentas.get(usuario)!
    cuenta.sesion = { ...cuenta.sesion, ...cambios }
    this.sesion = cuenta.sesion
    return this.sesion
  }

  /** La próxima petición `metodo ruta` (ruta sin la consulta) responde esto (una vez por respuesta). */
  forzar(metodo: string, ruta: string, ...respuestas: RespuestaSimulada[]): void {
    this.forzadas.set(`${metodo} ${ruta}`, [...(this.forzadas.get(`${metodo} ${ruta}`) ?? []), ...respuestas])
  }

  mutaciones(): PeticionSimulada[] {
    return this.peticiones.filter((p) => p.metodo !== 'GET')
  }

  ultima(metodo: string, ruta: string): PeticionSimulada | undefined {
    return [...this.peticiones].reverse().find((p) => p.metodo === metodo && p.ruta.split('?')[0] === ruta)
  }

  instalar(): void {
    vi.stubGlobal('fetch', (url: string, opciones: RequestInit = {}) => this.atender(url, opciones))
  }

  private async atender(url: string, opciones: RequestInit): Promise<Response> {
    const metodo = (opciones.method ?? 'GET').toUpperCase()
    const completa = new URL(url, 'http://localhost')
    const ruta = completa.pathname.slice(RUTA_API_PAI.length)
    const cabeceras: Record<string, string> = {}
    for (const [nombre, valor] of Object.entries((opciones.headers as Record<string, string>) ?? {})) {
      cabeceras[nombre.toLowerCase()] = valor
    }
    const cuerpo = typeof opciones.body === 'string' ? JSON.parse(opciones.body) : undefined
    this.peticiones.push({ metodo, ruta: ruta + completa.search, cuerpo, cabeceras })
    const forzada = this.forzadas.get(`${metodo} ${ruta}`)?.shift()
    const respuesta = forzada ?? this.responder(metodo, ruta, completa.searchParams, cuerpo, cabeceras)
    const estado = respuesta.estado
    return new Response(estado === 204 || respuesta.cuerpo === undefined ? null : JSON.stringify(respuesta.cuerpo), {
      status: estado,
      headers: { 'Content-Type': 'application/json', ...respuesta.cabeceras },
    })
  }

  private responder(
    metodo: string,
    ruta: string,
    consulta: URLSearchParams,
    cuerpo: unknown,
    cabeceras: Record<string, string>,
  ): RespuestaSimulada {
    const sinSesion = errorSimulado(401, 'no_autenticado', 'Inicie sesión para continuar.')
    const csrfValido = this.sesion !== null && cabeceras[CABECERA_CSRF.toLowerCase()] === this.sesion.csrf

    if (ruta === '/sesion') {
      if (metodo === 'POST') {
        const { usuario, contrasena } = cuerpo as { usuario: string; contrasena: string }
        const cuenta = this.cuentas.get(usuario)
        if (!cuenta || cuenta.contrasena !== contrasena) {
          return errorSimulado(401, 'no_autenticado', 'Usuario o contraseña incorrectos.')
        }
        this.sesion = cuenta.sesion
        return { estado: 200, cuerpo: this.sesion }
      }
      if (metodo === 'GET') return this.sesion ? { estado: 200, cuerpo: this.sesion } : sinSesion
      if (metodo === 'DELETE') {
        if (!this.sesion) return sinSesion
        if (!csrfValido) return errorSimulado(403, 'prohibido', 'Falta el token CSRF.')
        this.sesion = null
        return { estado: 204 }
      }
    }
    if (!this.sesion) return sinSesion
    if (metodo !== 'GET' && !csrfValido) return errorSimulado(403, 'prohibido', 'Falta el token CSRF.')

    if (ruta === '/sesion/contrasena' && metodo === 'PUT') {
      const { actual, nueva } = cuerpo as { actual: string; nueva: string }
      const cuenta = [...this.cuentas.values()].find((c) => c.sesion.id === this.sesion?.id)!
      if (cuenta.contrasena !== actual) {
        return errorSimulado(400, 'solicitud_invalida', 'La contraseña actual no es correcta.', {
          actual: 'La contraseña actual no es correcta.',
        })
      }
      cuenta.contrasena = nueva
      cuenta.sesion = { ...cuenta.sesion, debeCambiarContrasena: false }
      this.sesion = cuenta.sesion
      return { estado: 200, cuerpo: this.sesion }
    }
    if (this.sesion.debeCambiarContrasena) {
      return errorSimulado(403, 'cambio_contrasena_requerido', 'Debe cambiar su contraseña temporal antes de continuar.')
    }

    if (metodo === 'GET' && ruta === '/vigencia') return { estado: 200, cuerpo: this.vigencia }
    if (metodo === 'GET' && ruta === '/tablero') return { estado: 200, cuerpo: { ...this.tablero, vigencia: this.vigencia } }

    if (ruta.startsWith('/admin')) {
      if (this.sesion.rol !== 'administrador') return errorSimulado(403, 'prohibido', 'Solo para el administrador.')
      return this.responderAdmin(metodo, ruta, consulta, cuerpo)
    }
    return errorSimulado(404, 'no_encontrado', `No hay ruta simulada para ${metodo} ${ruta}.`)
  }

  private responderAdmin(metodo: string, ruta: string, consulta: URLSearchParams, cuerpo: unknown): RespuestaSimulada {
    const usuarioId = /^\/admin\/usuarios\/(\d+)(\/asignaciones)?$/.exec(ruta)
    const autorizacionId = /^\/admin\/autorizaciones\/(\d+)$/.exec(ruta)

    if (ruta === '/admin/usuarios' && metodo === 'GET') return { estado: 200, cuerpo: { usuarios: this.usuarios } }
    if (ruta === '/admin/usuarios' && metodo === 'POST') {
      const datos = cuerpo as DatosUsuarioNuevoPai
      if (this.usuarios.some((u) => u.usuario === datos.usuario)) {
        return errorSimulado(409, 'conflicto', 'Ya existe una cuenta con ese usuario.', { usuario: 'Ya existe una cuenta con ese usuario.' })
      }
      const nuevo = usuarioPrueba(Math.max(...this.usuarios.map((u) => u.id)) + 1, {
        usuario: datos.usuario,
        nombre: datos.nombre,
        correo: datos.correo ?? null,
        cargo: datos.cargo ?? null,
        rol: datos.rol,
        debeCambiarContrasena: true,
      })
      this.usuarios = [...this.usuarios, nuevo]
      return { estado: 201, cuerpo: nuevo }
    }
    if (usuarioId) {
      const id = Number(usuarioId[1])
      const usuario = this.usuarios.find((u) => u.id === id)
      if (!usuario) return errorSimulado(404, 'no_encontrado', 'No existe ese usuario.')
      let cambiado: UsuarioPai
      if (usuarioId[2] && metodo === 'PUT') {
        cambiado = { ...usuario, asignaciones: cuerpo as UsuarioPai['asignaciones'] }
      } else if (!usuarioId[2] && metodo === 'PATCH') {
        const { contrasenaTemporal, ...cambios } = cuerpo as CambiosUsuarioPai
        cambiado = { ...usuario, ...cambios, debeCambiarContrasena: contrasenaTemporal ? true : usuario.debeCambiarContrasena }
      } else return errorSimulado(404, 'no_encontrado', 'Ruta simulada desconocida.')
      this.usuarios = this.usuarios.map((u) => (u.id === id ? cambiado : u))
      return { estado: 200, cuerpo: cambiado }
    }
    if (ruta === '/admin/vigencia' && metodo === 'PUT') {
      const datos = cuerpo as DatosVigenciaPai
      this.vigencia = {
        ...this.vigencia,
        ...datos,
        abiertoAhora: datos.bimestreAbierto !== null,
        actualizadoEn: '2026-10-11T15:00:00.000Z',
        actualizadoPor: this.sesion?.nombre ?? null,
      }
      return { estado: 200, cuerpo: this.vigencia }
    }
    if (ruta === '/admin/autorizaciones' && metodo === 'GET') {
      return { estado: 200, cuerpo: { autorizaciones: this.autorizaciones } }
    }
    if (ruta === '/admin/autorizaciones' && metodo === 'POST') {
      const datos = cuerpo as DatosAutorizacionPai
      const usuario = this.usuarios.find((u) => u.id === datos.usuarioId)!
      const proceso = this.tablero.procesos.find((p) => p.id === datos.procesoId)
      const indicador = this.tablero.indicadores.find((i) => i.id === datos.indicadorId)
      const nueva = autorizacionPrueba(Math.max(0, ...this.autorizaciones.map((a) => a.id)) + 1, {
        usuarioId: usuario.id,
        usuario: usuario.usuario,
        nombreUsuario: usuario.nombre,
        bimestre: datos.bimestre,
        procesoId: datos.procesoId ?? null,
        indicadorId: datos.indicadorId ?? null,
        alcance: indicador ? `${indicador.codigo} · ${indicador.nombre}` : `${proceso?.codigo} · ${proceso?.nombre}`,
        vigenteHasta: datos.vigenteHasta,
        motivo: datos.motivo,
        otorgadaEn: '2026-10-11T15:00:00.000Z',
      })
      this.autorizaciones = [nueva, ...this.autorizaciones]
      return { estado: 201, cuerpo: nueva }
    }
    if (autorizacionId && metodo === 'DELETE') {
      const id = Number(autorizacionId[1])
      const actual = this.autorizaciones.find((a) => a.id === id)
      if (!actual) return errorSimulado(404, 'no_encontrado', 'No existe esa autorización.')
      const revocada: AutorizacionPai = {
        ...actual,
        estado: 'revocada',
        revocadaEn: '2026-10-11T15:00:00.000Z',
        revocadaPor: this.sesion?.nombre ?? null,
      }
      this.autorizaciones = this.autorizaciones.map((a) => (a.id === id ? revocada : a))
      return { estado: 200, cuerpo: revocada }
    }
    if (ruta === '/admin/registro' && metodo === 'GET') {
      const pagina = Number(consulta.get('pagina') ?? '1')
      const usuario = consulta.get('usuario')
      const indicador = consulta.get('indicador')
      const accion = consulta.get('accion')
      const filtradas = this.registro.filter(
        (e) =>
          (!usuario || String(e.usuarioId) === usuario) &&
          (!indicador || e.codigoIndicador === indicador || String(e.indicadorId) === indicador) &&
          (!accion || e.accion === accion),
      )
      const inicio = (pagina - 1) * this.registroPorPagina
      return {
        estado: 200,
        cuerpo: {
          entradas: filtradas.slice(inicio, inicio + this.registroPorPagina),
          pagina,
          porPagina: this.registroPorPagina,
          total: filtradas.length,
        },
      }
    }
    return errorSimulado(404, 'no_encontrado', `No hay ruta simulada para ${metodo} ${ruta}.`)
  }
}
