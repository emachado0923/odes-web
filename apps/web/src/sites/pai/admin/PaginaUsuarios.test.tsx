import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF, PATRON_USUARIO_PAI } from '../api-pai'
import { CSRF_PRUEBA } from '../pruebas/datosPrueba'
import { ALFABETO_TEMPORAL, LONGITUD_TEMPORAL, generarContrasenaTemporal } from './contrasenaTemporal'
import PaginaUsuarios from './PaginaUsuarios'
import { ApiSimuladaPai, errorSimulado } from './pruebas/apiSimulada'
import { boton, renderizarPagina } from './pruebas/renderizar'
import { erroresUsuario, formularioInicial } from './usuarios'

let api: ApiSimuladaPai

beforeEach(() => {
  api = new ApiSimuladaPai()
  api.iniciarComo('administrador')
  api.instalar()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderizar() {
  renderizarPagina(<PaginaUsuarios />, { ruta: '/pai/admin/usuarios' })
  return screen.findByRole('table', { name: 'Cuentas del Plan de Acción Institucional' })
}

function fila(tabla: HTMLElement, nombre: string | RegExp) {
  return within(tabla).getByRole('rowheader', { name: nombre }).closest('tr') as HTMLElement
}

function modal() {
  return screen.getByRole('dialog')
}

describe('lista de usuarios', () => {
  it('muestra rol, estado, asignaciones y último ingreso; la propia cuenta no se puede desactivar', async () => {
    const tabla = await renderizar()
    expect(within(tabla).getAllByRole('row')).toHaveLength(4)
    const admin = fila(tabla, /Planeación Estratégica/)
    expect(admin).toHaveTextContent('(usted)')
    expect(admin).toHaveTextContent('Administrador(a)')
    expect(admin).toHaveTextContent('Ve todo')
    expect(within(admin).queryByRole('button', { name: /Desactivar/ })).not.toBeInTheDocument()
    expect(within(admin).queryByRole('button', { name: /Asignar/ })).not.toBeInTheDocument()
    const responsable = fila(tabla, /Responsable SAF/)
    expect(responsable).toHaveTextContent('1 proceso completo')
    expect(responsable).toHaveTextContent('Nunca')
    expect(boton('Asignar indicadores a Responsable SAF')).toBeInTheDocument()
    const carlos = fila(tabla, /Carlos Ruiz/)
    expect(within(carlos).getByText('Contraseña temporal')).toBeInTheDocument()
    expect(carlos).toHaveTextContent('1 indicador suelto')
  })

  it('la búsqueda filtra por nombre, usuario, correo o cargo (sin tildes)', async () => {
    const tabla = await renderizar()
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'planeacion' } })
    expect(within(tabla).getAllByRole('row')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'universitaria' } })
    expect(within(tabla).getByRole('rowheader', { name: /Responsable SAF/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'nadie' } })
    expect(screen.getByText('Ninguna cuenta coincide con la búsqueda.')).toBeInTheDocument()
  })
})

describe('crear usuario', () => {
  it('valida antes de enviar, genera la contraseña temporal y crea la cuenta (POST con CSRF)', async () => {
    const tabla = await renderizar()
    fireEvent.click(boton('Crear usuario'))
    const dialogo = modal()
    expect(dialogo).toHaveAccessibleName('Crear usuario')
    expect(within(dialogo).getByLabelText(/^Usuario/)).toHaveFocus()

    fireEvent.click(boton('Crear usuario', dialogo))
    expect(await within(dialogo).findByText('Escriba el usuario.')).toBeInTheDocument()
    expect(within(dialogo).getByText('Escriba el nombre.')).toBeInTheDocument()
    expect(within(dialogo).getByText('Escriba o genere la contraseña temporal.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText(/^Usuario/)).toHaveFocus()
    expect(api.mutaciones()).toHaveLength(0)

    fireEvent.change(within(dialogo).getByLabelText(/^Usuario/), { target: { value: 'María Gómez' } })
    fireEvent.click(boton('Crear usuario', dialogo))
    expect(await within(dialogo).findByText(/minúsculas sin tildes/)).toBeInTheDocument()

    fireEvent.change(within(dialogo).getByLabelText(/^Usuario/), { target: { value: 'Maria.Gomez' } })
    expect(within(dialogo).getByLabelText(/^Usuario/)).toHaveValue('maria.gomez')
    fireEvent.change(within(dialogo).getByLabelText(/^Nombre completo/), { target: { value: '  María Gómez ' } })
    fireEvent.change(within(dialogo).getByLabelText('Cargo'), { target: { value: 'Profesional' } })
    fireEvent.click(boton('Generar', dialogo))
    const contrasena = within(dialogo).getByLabelText('Contraseña temporal') as HTMLInputElement
    expect(contrasena.value).toHaveLength(LONGITUD_TEMPORAL)
    expect(contrasena).toHaveAttribute('type', 'text')

    const temporal = contrasena.value
    await act(async () => fireEvent.click(boton('Crear usuario', dialogo)))
    const creacion = api.ultima('POST', '/admin/usuarios')!
    expect(creacion.cuerpo).toEqual({
      usuario: 'maria.gomez',
      nombre: 'María Gómez',
      correo: null,
      cargo: 'Profesional',
      rol: 'responsable',
      contrasenaTemporal: temporal,
    })
    expect(creacion.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    // La lista ya tiene la cuenta, pero el modal sigue abierto con los datos para entregar.
    expect(within(tabla).getByRole('rowheader', { name: /María Gómez/ })).toBeInTheDocument()
    const entrega = await within(dialogo).findByText('Se creó la cuenta de María Gómez.')
    expect(entrega.closest('.alert')).toHaveFocus()
    expect(within(dialogo).getByText('maria.gomez')).toBeInTheDocument()
    expect(within(dialogo).getByText(temporal)).toBeInTheDocument()
    expect(within(dialogo).getByText(/ya no se volverá a mostrar/)).toBeInTheDocument()
    // Sin cambios pendientes: «Listo» cierra sin preguntar.
    fireEvent.click(boton('Listo', dialogo))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Se creó la cuenta de María Gómez (maria.gomez).')
  })

  it('409 del servidor: el error queda junto al campo usuario', async () => {
    await renderizar()
    fireEvent.click(boton('Crear usuario'))
    const dialogo = modal()
    fireEvent.change(within(dialogo).getByLabelText(/^Usuario/), { target: { value: 'carlos.ruiz' } })
    fireEvent.change(within(dialogo).getByLabelText(/^Nombre completo/), { target: { value: 'Otro Carlos' } })
    fireEvent.change(within(dialogo).getByLabelText('Contraseña temporal'), { target: { value: 'temporal-segura-1' } })
    await act(async () => fireEvent.click(boton('Crear usuario', dialogo)))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Ya existe una cuenta con ese usuario.')
    expect(within(dialogo).getByLabelText(/^Usuario/)).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialogo).getByLabelText(/^Usuario/)).toHaveFocus()
  })

  it('cerrar con cambios sin guardar pregunta antes de descartarlos', async () => {
    await renderizar()
    fireEvent.click(boton('Crear usuario'))
    const dialogo = modal()
    fireEvent.change(within(dialogo).getByLabelText(/^Nombre completo/), { target: { value: 'A medias' } })
    fireEvent.click(boton('Cancelar', dialogo))
    expect(within(dialogo).getByText('Hay cambios sin guardar. ¿Descartarlos?')).toBeInTheDocument()
    fireEvent.click(boton('Seguir editando', dialogo))
    expect(within(dialogo).getByLabelText(/^Nombre completo/)).toHaveValue('A medias')
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    fireEvent.click(boton('Descartar cambios', dialogo))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('editar usuario', () => {
  it('envía solo lo que cambió y, si se pide, una contraseña temporal nueva', async () => {
    const tabla = await renderizar()
    fireEvent.click(boton('Editar a Carlos Ruiz'))
    const dialogo = modal()
    expect(dialogo).toHaveAccessibleName('Editar a Carlos Ruiz')
    expect(within(dialogo).getByLabelText(/^Usuario/)).toHaveAttribute('readonly')
    expect(within(dialogo).getByLabelText(/^Nombre completo/)).toHaveFocus()
    fireEvent.change(within(dialogo).getByLabelText('Correo'), { target: { value: 'carlos@sapiencia.gov.co' } })
    fireEvent.change(within(dialogo).getByLabelText('Rol'), { target: { value: 'administrador' } })
    expect(within(dialogo).queryByLabelText('Contraseña temporal')).not.toBeInTheDocument()
    fireEvent.click(within(dialogo).getByLabelText('Asignar una contraseña temporal nueva'))
    fireEvent.click(boton('Generar', dialogo))
    const nueva = (within(dialogo).getByLabelText('Contraseña temporal') as HTMLInputElement).value
    await act(async () => fireEvent.click(boton('Guardar cambios', dialogo)))
    expect(api.ultima('PATCH', '/admin/usuarios/3')?.cuerpo).toEqual({
      correo: 'carlos@sapiencia.gov.co',
      rol: 'administrador',
      contrasenaTemporal: nueva,
    })
    expect(fila(tabla, /Carlos Ruiz/)).toHaveTextContent('Administrador(a)')
    // La contraseña nueva se muestra para entregarla; Escape cierra sin preguntar.
    expect(await within(dialogo).findByText(/Se asignó una contraseña temporal nueva a Carlos Ruiz/)).toBeInTheDocument()
    expect(within(dialogo).getByText(nueva)).toBeInTheDocument()
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin contraseña temporal nueva, guardar cierra el modal', async () => {
    const tabla = await renderizar()
    fireEvent.click(boton('Editar a Carlos Ruiz'))
    fireEvent.change(within(modal()).getByLabelText('Cargo'), { target: { value: 'Coordinador' } })
    await act(async () => fireEvent.click(boton('Guardar cambios', modal())))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.ultima('PATCH', '/admin/usuarios/3')?.cuerpo).toEqual({ cargo: 'Coordinador' })
    expect(fila(tabla, /Carlos Ruiz/)).toHaveTextContent('Coordinador')
  })

  it('sin cambios no llama al servidor', async () => {
    await renderizar()
    fireEvent.click(boton('Editar a Responsable SAF'))
    fireEvent.click(boton('Guardar cambios', modal()))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(0)
  })

  it('en la propia cuenta, el rol y el estado no se pueden cambiar', async () => {
    await renderizar()
    fireEvent.click(boton('Editar a Planeación Estratégica'))
    const dialogo = modal()
    expect(within(dialogo).getByLabelText('Rol')).toBeDisabled()
    expect(within(dialogo).getByRole('switch', { name: 'Cuenta activa' })).toBeDisabled()
    expect(within(dialogo).getByText('No puede desactivar su propia cuenta.')).toBeInTheDocument()
  })

  it('desactivar pide confirmación y envía PATCH { activo: false }', async () => {
    const tabla = await renderizar()
    fireEvent.click(boton('Desactivar a Carlos Ruiz'))
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Desactivar la cuenta de Carlos Ruiz?' })
    expect(confirmacion).toHaveTextContent('se cerrarán sus sesiones abiertas')
    expect(boton('Cancelar', confirmacion)).toHaveFocus()
    await act(async () => fireEvent.click(boton('Desactivar', confirmacion)))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.ultima('PATCH', '/admin/usuarios/3')?.cuerpo).toEqual({ activo: false })
    expect(within(fila(tabla, /Carlos Ruiz/)).getByText('Inactiva')).toBeInTheDocument()
    expect(boton('Activar a Carlos Ruiz')).toBeInTheDocument()
  })
})

describe('asignaciones (árbol dependencia -> proceso -> indicador)', () => {
  it('casillas de tres estados y PUT con los procesos completos y los indicadores sueltos', async () => {
    const tabla = await renderizar()
    fireEvent.click(boton('Asignar indicadores a Responsable SAF'))
    const dialogo = await screen.findByRole('dialog', { name: 'Asignaciones de Responsable SAF' })
    const saf = await within(dialogo).findByRole('checkbox', { name: /SAF · Subdirección/ })
    const th = within(dialogo).getByRole('checkbox', { name: /SAF-TH · Gestión del Talento Humano/ })
    const dtf = within(dialogo).getByRole('checkbox', { name: /DTF · Dirección/ })
    expect(saf).toBePartiallyChecked()
    expect(th).toBeChecked()
    expect(dtf).not.toBeChecked()
    expect(within(dialogo).getByRole('status')).toHaveTextContent('Seleccionado: 1 proceso completo')

    // Los indicadores se despliegan con su botón.
    const desplegar = boton('Ver los indicadores de SAF-TH', dialogo)
    expect(desplegar).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialogo).queryByRole('checkbox', { name: /SAF-TH-01/ })).not.toBeInTheDocument()
    fireEvent.click(desplegar)
    expect(boton('Ocultar los indicadores de SAF-TH', dialogo)).toHaveAttribute('aria-expanded', 'true')
    const th01 = within(dialogo).getByRole('checkbox', { name: /SAF-TH-01/ })
    expect(th01).toBeChecked()

    // Quitar un indicador de un proceso completo deja suelto el otro.
    fireEvent.click(th01)
    expect(th).toBePartiallyChecked()
    expect(within(dialogo).getByRole('status')).toHaveTextContent('Seleccionado: 1 indicador suelto')

    // Marcar la dependencia DTF asigna su proceso completo.
    fireEvent.click(dtf)
    expect(within(dialogo).getByRole('checkbox', { name: /DTF-GF · Gestión de Fondos/ })).toBeChecked()

    await act(async () => fireEvent.click(boton('Guardar asignaciones', dialogo)))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const guardado = api.ultima('PUT', '/admin/usuarios/2/asignaciones')!
    expect(guardado.cuerpo).toEqual({ procesos: [21], indicadores: [1002] })
    expect(guardado.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(fila(tabla, /Responsable SAF/)).toHaveTextContent('1 proceso completo y 1 indicador suelto')
  })

  it('con una búsqueda, marcar una dependencia o un proceso solo asigna lo que se ve', async () => {
    await renderizar()
    fireEvent.click(boton('Asignar indicadores a Carlos Ruiz'))
    const dialogo = await screen.findByRole('dialog', { name: 'Asignaciones de Carlos Ruiz' })
    await within(dialogo).findByRole('checkbox', { name: /DTF · Dirección/ })
    fireEvent.change(within(dialogo).getByLabelText('Buscar proceso o indicador'), { target: { value: 'condonados' } })
    // Solo se ve DTF-GF-02: la dependencia y el proceso dicen cuántos se ven.
    const proceso = within(dialogo).getByRole('checkbox', { name: /DTF-GF · Gestión de Fondos/ })
    expect(proceso).toHaveAccessibleName(/1 de 2 indicadores: los que coinciden/)
    expect(proceso).not.toBeChecked()
    fireEvent.click(proceso)
    expect(within(dialogo).getByRole('checkbox', { name: /DTF-GF-02/ })).toBeChecked()
    // Al quitar la búsqueda: los dos indicadores del proceso quedaron marcados (el 01 ya lo estaba) = proceso completo.
    fireEvent.change(within(dialogo).getByLabelText('Buscar proceso o indicador'), { target: { value: '' } })
    expect(within(dialogo).getByRole('checkbox', { name: /DTF-GF · Gestión de Fondos/ })).toBeChecked()
    // Desmarcar con la búsqueda quita solo el visible.
    fireEvent.change(within(dialogo).getByLabelText('Buscar proceso o indicador'), { target: { value: 'condonados' } })
    fireEvent.click(within(dialogo).getByRole('checkbox', { name: /DTF · Dirección/ }))
    fireEvent.change(within(dialogo).getByLabelText('Buscar proceso o indicador'), { target: { value: '' } })
    expect(within(dialogo).getByRole('checkbox', { name: /DTF-GF · Gestión de Fondos/ })).toBePartiallyChecked()
    expect(within(dialogo).getByRole('status')).toHaveTextContent('Seleccionado: 1 indicador suelto')
  })

  it('la búsqueda muestra solo lo que coincide, con los indicadores desplegados', async () => {
    await renderizar()
    fireEvent.click(boton('Asignar indicadores a Carlos Ruiz'))
    const dialogo = await screen.findByRole('dialog', { name: 'Asignaciones de Carlos Ruiz' })
    await within(dialogo).findByRole('checkbox', { name: /DTF · Dirección/ })
    expect(within(dialogo).getByRole('checkbox', { name: /DTF-GF · Gestión de Fondos/ })).toBePartiallyChecked()
    fireEvent.change(within(dialogo).getByLabelText('Buscar proceso o indicador'), { target: { value: 'condonados' } })
    expect(within(dialogo).queryByRole('checkbox', { name: /SAF/ })).not.toBeInTheDocument()
    expect(within(dialogo).getByRole('checkbox', { name: /DTF-GF-02/ })).not.toBeChecked()
    expect(within(dialogo).queryByRole('checkbox', { name: /DTF-GF-01/ })).not.toBeInTheDocument()
    fireEvent.change(within(dialogo).getByLabelText('Buscar proceso o indicador'), { target: { value: 'xyz' } })
    expect(within(dialogo).getByText('Ningún proceso coincide con la búsqueda.')).toBeInTheDocument()
  })

  it('si no carga el árbol, el modal lo dice y permite reintentar', async () => {
    const no = { ...errorSimulado(503, 'no_disponible', 'Sin base.'), cabeceras: { 'Retry-After': '0' } }
    api.forzar('GET', '/tablero', no, no, no)
    await renderizar()
    fireEvent.click(boton('Asignar indicadores a Responsable SAF'))
    const dialogo = screen.getByRole('dialog')
    expect(await within(dialogo).findByText('Sin base.')).toBeInTheDocument()
    fireEvent.click(boton('Reintentar', dialogo))
    expect(await screen.findByRole('checkbox', { name: /SAF-TH · Gestión/ })).toBeChecked()
  })
})

describe('lógica del formulario y del generador', () => {
  it('erroresUsuario: usuario solo al crear, correo válido, contraseña solo si se pide', () => {
    const base = { ...formularioInicial(null), usuario: 'ana.diaz', nombre: 'Ana' }
    expect(erroresUsuario({ ...base, contrasena: 'temporal-segura-1' }, true)).toEqual({})
    expect(erroresUsuario({ ...base, correo: 'no-es-correo', contrasena: 'temporal-segura-1' }, true).correo).toMatch(/correo válido/)
    expect(erroresUsuario({ ...base, usuario: '' }, false)).toEqual({})
    expect(erroresUsuario({ ...base, restablecer: true, contrasena: 'corta' }, false).contrasena).toMatch(/al menos 12/)
  })

  it('el correo se revisa con el mismo patrón del servidor (sin puntos vacíos en el dominio)', () => {
    const base = { ...formularioInicial(null), usuario: 'ana.diaz', nombre: 'Ana', contrasena: 'temporal-segura-1' }
    const aceptados = ['a@b..co', 'a@.b.co', 'a@b.co.', '@x.y', 'a@b'].filter((malo) => !erroresUsuario({ ...base, correo: malo }, true).correo)
    expect(aceptados).toEqual([])
    for (const bueno of ['ana@sapiencia.gov.co', 'a.b+c@d-e.co']) expect(erroresUsuario({ ...base, correo: bueno }, true)).toEqual({})
  })

  it('generarContrasenaTemporal: longitud, alfabeto sin caracteres ambiguos y descarte del último tramo', () => {
    const contrasena = generarContrasenaTemporal()
    expect(contrasena).toHaveLength(LONGITUD_TEMPORAL)
    expect([...contrasena].every((c) => ALFABETO_TEMPORAL.includes(c))).toBe(true)
    expect(ALFABETO_TEMPORAL).not.toMatch(/[0O1lI]/)
    expect(generarContrasenaTemporal(4)).toHaveLength(12)
    // Valores del último tramo incompleto (>= límite) se descartan; luego se usan los siguientes.
    let llamada = 0
    const fija = (destino: Uint32Array<ArrayBuffer>) => {
      destino.fill(llamada++ === 0 ? 0xffffffff : 0)
    }
    expect(generarContrasenaTemporal(12, fija)).toBe(ALFABETO_TEMPORAL[0].repeat(12))
    expect(PATRON_USUARIO_PAI.test('ana.diaz')).toBe(true)
  })
})
