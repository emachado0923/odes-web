import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF } from '../../api-repositorio'
import { ApiSimulada, CLAVE_PRUEBA, CSRF_PRUEBA, USUARIO_PRUEBA, error, instalarApi } from '../pruebas/apiSimulada'
import { boton, enlace, esperarTitulo, renderAdmin } from '../pruebas/renderAdmin'
import { textoBloqueo } from './textos'

let api: ApiSimulada

beforeEach(() => {
  api = new ApiSimulada()
  instalarApi(api)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function formularioIngreso() {
  const usuario = await screen.findByLabelText('Usuario', {}, { timeout: 3000 })
  return { usuario, contrasena: screen.getByLabelText('Contraseña') }
}

async function entrar(usuario = USUARIO_PRUEBA, contrasena = CLAVE_PRUEBA) {
  const campos = await formularioIngreso()
  fireEvent.change(campos.usuario, { target: { value: usuario } })
  fireEvent.change(campos.contrasena, { target: { value: contrasena } })
  fireEvent.click(boton('Ingresar'))
}

describe('inicio de sesión', () => {
  it('sin sesión muestra el formulario, con los atributos que reconocen los gestores de contraseñas', async () => {
    renderAdmin()
    const { usuario, contrasena } = await formularioIngreso()
    expect(usuario).toHaveAttribute('autocomplete', 'username')
    expect(usuario).toHaveAttribute('name', 'username')
    expect(contrasena).toHaveAttribute('autocomplete', 'current-password')
    expect(contrasena).toHaveAttribute('type', 'password')
    expect(usuario.closest('form')).toHaveAttribute('method', 'post')
    expect(screen.getByText('Administración', { selector: '.ra-barra-etiqueta' })).toBeInTheDocument()
    expect(api.peticiones[0]).toMatchObject({ metodo: 'GET', ruta: '/api/repositorio/admin/sesion' })
  })

  it('"Mostrar" alterna la contraseña visible', async () => {
    renderAdmin()
    const { contrasena } = await formularioIngreso()
    const mostrar = boton('Mostrar contraseña')
    expect(mostrar).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(mostrar)
    expect(contrasena).toHaveAttribute('type', 'text')
    expect(boton('Ocultar contraseña')).toHaveAttribute('aria-pressed', 'true')
  })

  it('campos vacíos: aviso junto al campo, sin llamar al servidor', async () => {
    renderAdmin()
    await formularioIngreso()
    fireEvent.click(boton('Ingresar'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escriba su usuario.')
    expect(screen.getByLabelText('Usuario')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Usuario')).toHaveFocus()
    expect(api.mutaciones()).toHaveLength(0)
  })

  it('credenciales incorrectas: mensaje genérico y la contraseña se borra', async () => {
    renderAdmin()
    await entrar(USUARIO_PRUEBA, 'equivocada')
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(screen.getByLabelText('Usuario')).toHaveValue(USUARIO_PRUEBA)
  })

  it('429: aviso de bloqueo con los minutos de Retry-After', async () => {
    api.forzar('POST', '/api/repositorio/admin/sesion', {
      ...error(429, 'demasiados_intentos', 'Demasiados intentos.'),
      cabeceras: { 'Retry-After': '900' },
    })
    renderAdmin()
    await entrar()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.',
    )
    expect(textoBloqueo(30)).toMatch(/Espere 1 minuto e/)
    expect(textoBloqueo(null)).toMatch(/Espere unos minutos/)
  })

  it('al entrar llega a la página que se pidió (la ruta se conserva)', async () => {
    const { router } = renderAdmin('/repositorio/admin/categorias')
    await entrar()
    expect(await esperarTitulo('Categorías')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/repositorio/admin/categorias')
    const login = api.peticiones.find((p) => p.metodo === 'POST')!
    expect(login.cuerpo).toEqual({ usuario: USUARIO_PRUEBA, contrasena: CLAVE_PRUEBA })
  })

  it('503 al verificar la sesión: mensaje y "Intentar de nuevo"', async () => {
    api.forzar('GET', '/api/repositorio/admin/sesion', error(503, 'no_disponible', 'El repositorio no está disponible.'))
    renderAdmin()
    expect(await screen.findByText('No se pudo abrir la administración', {}, { timeout: 3000 })).toBeInTheDocument()
    fireEvent.click(boton('Intentar de nuevo'))
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
  })
})

describe('con sesión', () => {
  beforeEach(() => {
    api.sesionActiva = true
  })

  it('muestra la barra "Administración" con la navegación y el usuario', async () => {
    renderAdmin()
    expect(await esperarTitulo('Documentos')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Administración' })
    expect(enlace('Documentos', nav)).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Editora de prueba')).toBeInTheDocument()
  })

  it('cerrar sesión: DELETE con el token CSRF y vuelve el formulario', async () => {
    renderAdmin('/repositorio/admin/cambios')
    await esperarTitulo('Registro de cambios')
    fireEvent.click(boton('Cerrar sesión'))
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    const salida = api.peticiones.find((p) => p.metodo === 'DELETE')!
    expect(salida.ruta).toBe('/api/repositorio/admin/sesion')
    expect(salida.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
  })

  it('un 401 trabajando muestra "Su sesión venció" sin perder lo editado ni la ruta', async () => {
    const id = api.documentos[0].id
    const { router } = renderAdmin(`/repositorio/admin/documentos/${id}`)
    const titulo = await screen.findByLabelText(/^Título/, {}, { timeout: 3000 })
    fireEvent.change(titulo, { target: { value: 'Título editado sin guardar' } })

    // La sesión vence en el servidor: guardar responde 401.
    api.sesionActiva = false
    fireEvent.click(boton('Guardar cambios'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Su sesión venció' })).toBeInTheDocument()
    expect(screen.getByText(/Lo que estaba editando se conserva/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/repositorio/admin/documentos/${id}`)

    await entrar()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Su sesión venció' })).not.toBeInTheDocument())
    expect(screen.getByLabelText(/^Título/)).toHaveValue('Título editado sin guardar')
    expect(screen.getByRole('alert')).toHaveTextContent('La sesión había vencido y no se guardó todo.')

    // Al guardar de nuevo, ahora sí.
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    await waitFor(() => expect(api.documento(id).titulo).toBe('Título editado sin guardar'))
  })

  it('cerrar sesión con cambios sin guardar pregunta antes', async () => {
    const id = api.documentos[0].id
    renderAdmin(`/repositorio/admin/documentos/${id}`)
    fireEvent.change(await screen.findByLabelText(/^Título/, {}, { timeout: 3000 }), { target: { value: 'Sin guardar' } })
    fireEvent.click(boton('Cerrar sesión'))
    const aviso = screen.getByRole('alertdialog', { name: 'Hay cambios sin guardar' })
    expect(aviso).toHaveTextContent('Si cierra la sesión ahora, se perderán los cambios')
    fireEvent.click(boton('Seguir editando', aviso))
    expect(screen.getByLabelText(/^Título/)).toHaveValue('Sin guardar')
    expect(api.mutaciones()).toHaveLength(0)

    fireEvent.click(boton('Cerrar sesión'))
    await act(async () => fireEvent.click(boton('Cerrar sesión sin guardar', screen.getByRole('alertdialog'))))
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(api.mutaciones().map((p) => p.metodo)).toEqual(['DELETE'])
  })

  it('con la sesión vencida, salir de la página con cambios muestra el aviso (visible, no dentro de la página oculta)', async () => {
    const id = api.documentos[0].id
    const { router } = renderAdmin(`/repositorio/admin/documentos/${id}`)
    fireEvent.change(await screen.findByLabelText(/^Título/, {}, { timeout: 3000 }), { target: { value: 'Sin guardar' } })
    api.sesionActiva = false
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    await screen.findByRole('heading', { level: 1, name: 'Su sesión venció' })
    fireEvent.click(screen.getAllByRole('link').find((a) => a.textContent === 'Ver el repositorio público')!)
    const aviso = await screen.findByRole('alertdialog', { name: 'Hay cambios sin guardar' })
    expect(aviso.closest('[hidden]')).toBeNull()
    fireEvent.click(boton('Salir sin guardar', aviso))
    await waitFor(() => expect(router.state.location.pathname).toBe('/repositorio'))
  })
})
