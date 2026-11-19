/**
 * Sesión del PAI con el sitio completo (router real, fetch simulado):
 * ingreso en la misma URL, 401 / 429 / 503, cambio obligatorio de la
 * contraseña temporal, sesión vencida con la página montada debajo, barra de
 * navegación por rol, cerrar sesión (con cambios sin guardar), páginas solo
 * para Planeación y ruta desconocida.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../../router'
import { CABECERA_CSRF } from '../api-pai'
import { ApiSimuladaPai, errorSimulado } from '../admin/pruebas/apiSimulada'
import { CONTRASENA_PRUEBA } from '../admin/pruebas/datos'
import { CSRF_PRUEBA, vigenciaPrueba } from '../pruebas/datosPrueba'

// React espera a que carguen las hojas de la plantilla y jsdom nunca las carga.
vi.mock('../componentes/EstilosPai', () => ({ default: () => null }))

let api: ApiSimuladaPai

beforeEach(() => {
  api = new ApiSimuladaPai()
  api.instalar()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderizarEn(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(<RouterProvider router={router} />)
  return { router }
}

function boton(nombre: string | RegExp, dentro?: HTMLElement) {
  return (dentro ? within(dentro) : screen).getByRole('button', { name: nombre })
}

async function formularioIngreso() {
  const usuario = await screen.findByLabelText('Usuario', {}, { timeout: 3000 })
  return { usuario, contrasena: screen.getByLabelText('Contraseña') }
}

async function entrar(usuario = 'responsable.saf', contrasena = CONTRASENA_PRUEBA) {
  const campos = await formularioIngreso()
  fireEvent.change(campos.usuario, { target: { value: usuario } })
  fireEvent.change(campos.contrasena, { target: { value: contrasena } })
  fireEvent.click(boton('Ingresar'))
}

function barra() {
  return screen.getByRole('navigation', { name: 'Secciones del Plan de Acción Institucional' })
}

describe('ingreso', () => {
  it('sin sesión muestra el formulario en la misma URL, con los atributos de los gestores de contraseñas', async () => {
    renderizarEn('/pai/cuenta')
    const { usuario, contrasena } = await formularioIngreso()
    expect(screen.getByRole('heading', { level: 1, name: 'Ingresar' })).toBeInTheDocument()
    expect(usuario).toHaveAttribute('autocomplete', 'username')
    expect(usuario).toHaveAttribute('name', 'username')
    expect(contrasena).toHaveAttribute('autocomplete', 'current-password')
    expect(contrasena).toHaveAttribute('type', 'password')
    expect(usuario.closest('form')).toHaveAttribute('method', 'post')
    expect(usuario.closest('main')).toHaveAttribute('id', 'contenido')
    expect(screen.queryByRole('navigation', { name: /Secciones/ })).not.toBeInTheDocument()
    expect(api.peticiones[0]).toMatchObject({ metodo: 'GET', ruta: '/sesion' })
  })

  it('el ojo alterna la contraseña visible (botón de alternancia con nombre fijo y dibujo distinto)', async () => {
    renderizarEn('/pai')
    const { contrasena } = await formularioIngreso()
    const ojo = boton('Mostrar contraseña')
    expect(ojo).toHaveAttribute('aria-pressed', 'false')
    expect(ojo).toHaveAttribute('aria-controls', contrasena.id)
    const dibujo = () => ojo.querySelector('path')?.getAttribute('d')
    const abierto = dibujo()
    fireEvent.click(ojo)
    expect(contrasena).toHaveAttribute('type', 'text')
    expect(ojo).toHaveAttribute('aria-pressed', 'true')
    expect(dibujo()).not.toBe(abierto)
    fireEvent.click(ojo)
    expect(contrasena).toHaveAttribute('type', 'password')
    expect(dibujo()).toBe(abierto)
  })

  it('sin la etiqueta sobre "Ingresar" y con "¿Olvidó su contraseña?" como enlace de correo', async () => {
    renderizarEn('/pai')
    const { usuario } = await formularioIngreso()
    const tarjeta = screen.getByRole('region', { name: 'Ingresar' })
    expect(within(tarjeta).queryByText(/Plan de Acción Institucional/i)).not.toBeInTheDocument()
    const enlace = within(tarjeta).getByRole('link', { name: '¿Olvidó su contraseña?' })
    expect(enlace.getAttribute('href')).toMatch(/^mailto:juan\.escobar@sapiencia\.gov\.co\?subject=/)
    fireEvent.change(usuario, { target: { value: 'Responsable.SAF' } })
    expect(new URL(enlace.getAttribute('href') ?? '').searchParams.get('body')).toMatch(/Usuario: responsable\.saf$/)
  })

  it('campos vacíos: aviso junto al campo, foco en él y sin llamar al servidor', async () => {
    renderizarEn('/pai')
    await formularioIngreso()
    fireEvent.click(boton('Ingresar'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escriba su usuario.')
    expect(screen.getByLabelText('Usuario')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Usuario')).toHaveFocus()
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'alguien' } })
    fireEvent.click(boton('Ingresar'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escriba su contraseña.')
    expect(screen.getByLabelText('Contraseña')).toHaveFocus()
    expect(api.mutaciones()).toHaveLength(0)
  })

  it('401: mensaje genérico, la contraseña se borra y el usuario queda', async () => {
    renderizarEn('/pai')
    await entrar('responsable.saf', 'equivocada-123')
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(screen.getByLabelText('Usuario')).toHaveValue('responsable.saf')
    expect(screen.getByRole('alert')).toHaveFocus()
  })

  it('429: aviso de bloqueo con los minutos de Retry-After', async () => {
    api.forzar('POST', '/sesion', {
      ...errorSimulado(429, 'demasiados_intentos', 'Demasiados intentos.'),
      cabeceras: { 'Retry-After': '900' },
    })
    renderizarEn('/pai')
    await entrar()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.',
    )
  })

  it('503 al ingresar: el mensaje del servidor', async () => {
    api.forzar('POST', '/sesion', errorSimulado(503, 'no_disponible', 'El Plan de Acción Institucional no está disponible.'))
    renderizarEn('/pai')
    await entrar()
    expect(await screen.findByRole('alert')).toHaveTextContent('El Plan de Acción Institucional no está disponible.')
  })

  it('al entrar llega a la página pedida, con la barra, el nombre, el rol y el bimestre abierto', async () => {
    api.vigencia = vigenciaPrueba({ bimestreAbierto: 4, abiertoHasta: '2026-09-16T04:59:59.999Z', abiertoAhora: true })
    const { router } = renderizarEn('/pai/cuenta')
    await entrar('Responsable.SAF ')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pai/cuenta')
    expect(api.ultima('POST', '/sesion')?.cuerpo).toEqual({ usuario: 'responsable.saf', contrasena: CONTRASENA_PRUEBA })
    const nav = barra()
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Tablero', 'Mi cuenta'])
    expect(within(nav).getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Responsable SAF', { selector: '.pai-barra-usuario strong' })).toBeInTheDocument()
    expect(screen.getByText('Responsable', { selector: '.pai-barra-rol' })).toBeInTheDocument()
    expect(
      await screen.findByText('Bimestre 4 · julio–agosto · abierto hasta el 15 de septiembre', { exact: false }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Mi cuenta · Plan de Acción Institucional · Sapiencia')
  })

  it('503 al verificar la sesión: aviso con "Reintentar", que vuelve a preguntar', async () => {
    const no = { ...errorSimulado(503, 'no_disponible', 'Base caída.'), cabeceras: { 'Retry-After': '0' } }
    api.forzar('GET', '/sesion', no, no, no)
    renderizarEn('/pai')
    expect(await screen.findByText('No se pudo abrir el Plan de Acción Institucional.', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Base caída.')).toBeInTheDocument()
    fireEvent.click(boton('Reintentar'))
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
  })
})

describe('barra por rol', () => {
  it('el administrador ve Seguimiento, Usuarios, Bimestre, Autorizaciones y Registro', async () => {
    api.iniciarComo('administrador')
    api.vigencia = vigenciaPrueba({ bimestreAbierto: null })
    renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    expect(within(barra()).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Tablero',
      'Seguimiento',
      'Usuarios',
      'Bimestre',
      'Autorizaciones',
      'Registro',
      'Mi cuenta',
    ])
    expect(screen.getByText('Administrador(a)', { selector: '.pai-barra-rol' })).toBeInTheDocument()
    expect(await screen.findByText('No hay bimestre abierto')).toBeInTheDocument()
  })

  it('un responsable que entra a /pai/admin/* ve el aviso "solo para Planeación" sin pedir nada de administración', async () => {
    api.iniciarComo('responsable')
    renderizarEn('/pai/admin/usuarios')
    expect(await screen.findByRole('heading', { level: 1, name: 'Esta sección es solo para Planeación' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute('href', '/pai')
    expect(api.peticiones.some((p) => p.ruta.startsWith('/admin'))).toBe(false)
  })

  it('ruta desconocida: página no encontrada con enlace al tablero (y al seguimiento para el administrador)', async () => {
    api.iniciarComo('administrador')
    renderizarEn('/pai/no-existe')
    expect(await screen.findByRole('heading', { level: 1, name: 'No encontramos esa página' })).toBeInTheDocument()
    expect(screen.getByText('/pai/no-existe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute('href', '/pai')
    expect(screen.getByRole('link', { name: 'Ir al seguimiento' })).toHaveAttribute('href', '/pai/admin')
  })
})

describe('contraseña temporal', () => {
  beforeEach(() => {
    api.iniciarComo('responsable', { debeCambiarContrasena: true })
  })

  it('muestra solo el cambio de contraseña; la barra no tiene enlaces y no se pide la vigencia', async () => {
    renderizarEn('/pai/cuenta')
    expect(await screen.findByRole('heading', { level: 1, name: 'Cambie su contraseña temporal' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /Secciones/ })).not.toBeInTheDocument()
    expect(boton('Cerrar sesión')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña temporal')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('autocomplete', 'new-password')
    expect(api.peticiones.some((p) => p.ruta === '/vigencia')).toBe(false)
  })

  it('revisa las reglas antes de enviar y muestra el error del servidor junto al campo', async () => {
    renderizarEn('/pai')
    await screen.findByRole('heading', { level: 1, name: 'Cambie su contraseña temporal' })
    fireEvent.change(screen.getByLabelText('Contraseña temporal'), { target: { value: 'temporal-equivocada' } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'corta' } })
    fireEvent.click(boton('Guardar y continuar'))
    expect(await screen.findByText(/al menos 12 caracteres/)).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Contraseña nueva')).toHaveFocus()
    expect(api.mutaciones()).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.change(screen.getByLabelText('Confirme la contraseña nueva'), { target: { value: 'otra-clave-2026' } })
    fireEvent.click(boton('Guardar y continuar'))
    expect(await screen.findByText('La confirmación no coincide con la contraseña nueva.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Confirme la contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    await act(async () => fireEvent.click(boton('Guardar y continuar')))
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta.')
    expect(screen.getByLabelText('Contraseña temporal')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Contraseña temporal')).toHaveValue('')
  })

  it('al cambiarla (PUT con el CSRF) se ve la página pedida y aparece la barra', async () => {
    renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Cambie su contraseña temporal' })
    fireEvent.change(screen.getByLabelText('Contraseña temporal'), { target: { value: CONTRASENA_PRUEBA } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.change(screen.getByLabelText('Confirme la contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.click(boton('Guardar y continuar'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument()
    const cambio = api.ultima('PUT', '/sesion/contrasena')!
    expect(cambio.cuerpo).toEqual({ actual: CONTRASENA_PRUEBA, nueva: 'mi-clave-nueva-2026' })
    expect(cambio.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(barra()).toBeInTheDocument()
    await waitFor(() => expect(api.peticiones.some((p) => p.ruta === '/vigencia')).toBe(true))
  })
})

describe('con sesión', () => {
  beforeEach(() => {
    api.iniciarComo('responsable')
  })

  it('/pai/cuenta: datos de la cuenta y cambio de contraseña con aviso de éxito', async () => {
    renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    expect(screen.getByText('responsable.saf')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: CONTRASENA_PRUEBA } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.change(screen.getByLabelText('Confirme la contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    await act(async () => fireEvent.click(boton('Cambiar la contraseña')))
    expect(await screen.findByText(/Su contraseña se cambió/)).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
  })

  it('cerrar sesión: DELETE con el CSRF, vuelve el ingreso y lleva al tablero', async () => {
    const { router } = renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    await act(async () => fireEvent.click(boton('Cerrar sesión')))
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    const salida = api.ultima('DELETE', '/sesion')!
    expect(salida.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(router.state.location.pathname).toBe('/pai')
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })

  it('cerrar sesión con cambios sin guardar pregunta antes', async () => {
    renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'algo escrito' } })
    fireEvent.click(boton('Cerrar sesión'))
    const aviso = screen.getByRole('alertdialog', { name: 'Hay cambios sin guardar' })
    expect(aviso).toHaveTextContent('Si cierra la sesión ahora, se perderán los cambios')
    expect(boton('Seguir editando', aviso)).toHaveFocus()
    fireEvent.click(boton('Seguir editando', aviso))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('algo escrito')
    expect(api.mutaciones()).toHaveLength(0)

    fireEvent.click(boton('Cerrar sesión'))
    await act(async () => fireEvent.click(boton('Cerrar sesión sin guardar', screen.getByRole('alertdialog'))))
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(api.mutaciones().map((p) => p.metodo)).toEqual(['DELETE'])
  })

  it('un 401 trabajando muestra "Su sesión venció" encima, sin perder la página ni lo escrito', async () => {
    const { router } = renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: CONTRASENA_PRUEBA } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.change(screen.getByLabelText('Confirme la contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })

    // La sesión vence en el servidor: el PUT responde 401.
    api.sesion = null
    fireEvent.click(boton('Cambiar la contraseña'))
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Su sesión venció' })
    expect(titulo).toHaveFocus()
    expect(screen.getByText(/Lo que estaba haciendo se conserva/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mi cuenta' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña nueva').closest('[hidden]')).not.toBeNull()
    expect(screen.queryByRole('navigation', { name: /Secciones/ })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pai/cuenta')

    await entrar()
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Su sesión venció' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('mi-clave-nueva-2026')
  })

  it('si entra otra persona donde venció la sesión, la página se monta de nuevo (no ve lo de la anterior)', async () => {
    renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: CONTRASENA_PRUEBA } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.change(screen.getByLabelText('Confirme la contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    api.sesion = null
    fireEvent.click(boton('Cambiar la contraseña'))
    await screen.findByRole('heading', { level: 1, name: 'Su sesión venció' })

    await entrar('planeacion')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('')
    expect(screen.getByText('Administrador(a)', { selector: '.pai-barra-rol' })).toBeInTheDocument()
  })
})

describe('otra pestaña y cargas que fallaron por la sesión', () => {
  it('si en otra pestaña entró otra persona, un 403 (CSRF que ya no sirve) cambia a esa sesión y monta de nuevo la página', async () => {
    api.iniciarComo('responsable')
    renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    expect(screen.getByText('Responsable', { selector: '.pai-barra-rol' })).toBeInTheDocument()
    // Otra pestaña: cierra la sesión y entra Planeación (la cookie cambia; este CSRF ya no le sirve).
    api.iniciarComo('administrador', { csrf: 'csrf-de-la-otra-pestana' })
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: CONTRASENA_PRUEBA } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.change(screen.getByLabelText('Confirme la contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.click(boton('Cambiar la contraseña'))
    expect(await screen.findByText('Administrador(a)', { selector: '.pai-barra-rol' })).toBeInTheDocument()
    // La página se montó de nuevo: nada de lo escrito por la otra persona queda a la vista.
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('')
    // Y las escrituras usan el CSRF de la sesión nueva.
    await act(async () => fireEvent.click(boton('Cerrar sesión')))
    await screen.findByLabelText('Usuario')
    expect(api.ultima('DELETE', '/sesion')?.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe('csrf-de-la-otra-pestana')
  })

  it('una página que no cargó porque la sesión venció se carga sola al volver a entrar (sin "Reintentar")', async () => {
    api.iniciarComo('administrador')
    const { router } = renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    api.sesion = null
    await act(async () => router.navigate('/pai/admin'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Su sesión venció' })).toBeInTheDocument()
    await entrar('planeacion')
    expect(await screen.findByRole('region', { name: 'Avance general' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })
})

describe('vigencia elegida (año)', () => {
  it('con más de una vigencia, la barra deja elegir el año y las páginas lo consultan con ?vigencia=', async () => {
    api.iniciarComo('administrador')
    api.vigencia = vigenciaPrueba({ anio: 2027, vigencias: [2027, 2026] })
    const { router } = renderizarEn('/pai/admin')
    const selector = await screen.findByRole('combobox', { name: 'Vigencia' })
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual(['2027 (la más reciente)', '2026'])
    expect(selector).toHaveValue('2027')
    fireEvent.change(selector, { target: { value: '2026' } })
    await waitFor(() => expect(api.peticiones.some((p) => p.metodo === 'GET' && p.ruta === '/tablero?vigencia=2026')).toBe(true))
    await waitFor(() => expect(api.peticiones.some((p) => p.ruta === '/vigencia?vigencia=2026')).toBe(true))
    await act(async () => router.navigate('/pai/admin/usuarios'))
    await waitFor(() => expect(api.peticiones.some((p) => p.ruta === '/admin/usuarios?vigencia=2026')).toBe(true))
  })

  it('con una sola vigencia no hay selector', async () => {
    api.iniciarComo('responsable')
    renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    await screen.findByText(/Bimestre 4 · julio–agosto/)
    expect(screen.queryByRole('combobox', { name: 'Vigencia' })).not.toBeInTheDocument()
  })
})

describe('cambio de contraseña: demasiados intentos', () => {
  it('429 al cambiarla: aviso con los minutos de Retry-After', async () => {
    api.iniciarComo('responsable')
    api.forzar('PUT', '/sesion/contrasena', {
      ...errorSimulado(429, 'demasiados_intentos', 'Demasiados intentos.'),
      cabeceras: { 'Retry-After': '600' },
    })
    renderizarEn('/pai/cuenta')
    await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'equivocada-123' } })
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    fireEvent.change(screen.getByLabelText('Confirme la contraseña nueva'), { target: { value: 'mi-clave-nueva-2026' } })
    await act(async () => fireEvent.click(boton('Cambiar la contraseña')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos fallidos. Espere 10 minutos e intente de nuevo.')
  })
})
