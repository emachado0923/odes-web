import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router'
import { inicialesDe, type ArchivoCrm, type PersonaAdminCrm, type TareaDetalleCrm } from '../../api-crm'
import { ErrorCrmHttp, type ApiLider } from '../../datos/clienteCrm'
import ProveedorAvisos from '../../ui/ProveedorAvisos'
import { ContextoLiderCrm, type ContextoLider } from '../contexto'
import FormularioTarea from './FormularioTarea'

function persona(id: number, nombre: string, extra: Partial<PersonaAdminCrm> = {}): PersonaAdminCrm {
  return {
    id,
    nombre,
    iniciales: inicialesDe(nombre),
    esLider: false,
    puedeCrearTareas: false,
    foto: null,
    conteo: { pendientes: 0, enProceso: 0, terminadasRecientes: 0, vencidas: 0 },
    correo: `persona${id}@ejemplo.org`,
    activo: true,
    orden: id,
    ...extra,
  }
}

const ANA = persona(2, 'Ana María Restrepo Gil')
const PEDRO = persona(9, 'Pedro Pablo Gómez Ruiz', { activo: false })
const CARLOS = persona(3, 'Carlos Andrés Mejía Duque')

function tarea(cambios: Partial<TareaDetalleCrm> = {}): TareaDetalleCrm {
  return {
    id: 42,
    titulo: 'Consolidar el informe trimestral',
    estado: 'pendiente',
    responsable: { id: ANA.id, nombre: ANA.nombre, iniciales: ANA.iniciales, foto: null },
    fechaLimite: null,
    vencida: false,
    requiereEntregable: false,
    adjuntos: 0,
    entregables: 0,
    creadaEn: '2026-11-24T15:00:00.000Z',
    actualizadaEn: '2026-11-24T15:00:00.000Z',
    terminadaEn: null,
    descripcion: '',
    notaCierre: null,
    archivos: [],
    eventos: [],
    avisada: false,
    correos: [],
    ...cambios,
  }
}

function adjunto(nombre: string): ArchivoCrm {
  return {
    id: nombre.length,
    tipo: 'adjunto',
    nombre,
    mime: 'application/pdf',
    bytes: 20,
    subidoEn: '2026-11-24T15:01:00.000Z',
    url: `/api/crm/lider/tareas/42/archivos/${nombre.length}`,
  }
}

function archivo(nombre: string): File {
  return new File(['contenido de prueba'], nombre, { type: 'application/octet-stream' })
}

/** El detalle de mentiras: a qué tarea llegó y, si los hay, los adjuntos que no subieron. */
function DetalleFalso() {
  const { id } = useParams()
  const estado = useLocation().state as { noSubidos?: string[] } | null
  const faltan = estado?.noSubidos ?? []
  return (
    <p>
      Detalle de la tarea {id}
      {faltan.length > 0 ? `; faltan ${faltan.join(', ')}` : ''}
    </p>
  )
}

function montar(api: Partial<ApiLider>, ruta = '/crm/lider/tareas/nueva') {
  const contexto: ContextoLider = {
    sesion: { nombre: 'Martha', csrf: 'csrf-de-prueba', expira: '2026-11-25T05:00:00.000Z' },
    api: api as ApiLider,
    vencida: vi.fn<ContextoLider['vencida']>(),
    salir: vi.fn<ContextoLider['salir']>(async () => {}),
    avisarCambioCorreos: vi.fn<ContextoLider['avisarCambioCorreos']>(),
  }
  const vista = render(
    <ProveedorAvisos>
      <ContextoLiderCrm value={contexto}>
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route path="/crm/lider" element={<p>Panel del líder</p>} />
            <Route path="/crm/lider/tareas/nueva" element={<FormularioTarea modo="nueva" />} />
            <Route path="/crm/lider/tareas/:id/editar" element={<FormularioTarea modo="editar" />} />
            <Route path="/crm/lider/tareas/:id" element={<DetalleFalso />} />
          </Routes>
        </MemoryRouter>
      </ContextoLiderCrm>
    </ProveedorAvisos>,
  )
  return { ...vista, contexto }
}

function elegirArchivos(contenedor: HTMLElement, archivos: File[]) {
  const entrada = contenedor.querySelector<HTMLInputElement>('input[type="file"]')
  if (!entrada) throw new Error('No está el selector de archivos')
  fireEvent.change(entrada, { target: { files: archivos } })
}

/** Espera la lista de personas y llena lo obligatorio. */
async function llenarObligatorios(titulo: string, responsable: PersonaAdminCrm) {
  await screen.findByRole('option', { name: responsable.nombre })
  fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: titulo } })
  fireEvent.change(screen.getByLabelText(/^Responsable/), { target: { value: String(responsable.id) } })
}

describe('FormularioTarea: nueva', () => {
  it('crea la tarea, sube cada adjunto y avisa, en ese orden, y va al detalle', async () => {
    const orden: string[] = []
    const api = {
      personas: vi.fn<ApiLider['personas']>(async () => [ANA, PEDRO, CARLOS]),
      crearTarea: vi.fn<ApiLider['crearTarea']>(async (datos) => {
        orden.push('crearTarea')
        return tarea({ titulo: datos.titulo })
      }),
      subirAdjunto: vi.fn<ApiLider['subirAdjunto']>(async (_id, archivo, opciones) => {
        orden.push(`subirAdjunto:${archivo.name}`)
        opciones?.alProgreso?.(0.5)
        return adjunto(archivo.name)
      }),
      avisar: vi.fn<ApiLider['avisar']>(async () => {
        orden.push('avisar')
        return { correoId: 5, estado: 'enviado', mensaje: 'Se le avisó a Carlos por correo.' }
      }),
    }
    const { container, contexto } = montar(api)

    // Solo las personas activas, en el orden en que llegan.
    await screen.findByRole('option', { name: CARLOS.nombre })
    expect(screen.getAllByRole('option').map((opcion) => opcion.textContent)).toEqual(['Elija a una persona', ANA.nombre, CARLOS.nombre])

    await llenarObligatorios('  Consolidar el informe trimestral  ', CARLOS)
    fireEvent.change(screen.getByLabelText('Fecha límite'), { target: { value: '2099-12-31' } })
    fireEvent.click(screen.getByLabelText('Pedir un documento al terminar'))
    elegirArchivos(container, [archivo('informe.pdf'), archivo('matriz.xlsx')])
    expect(screen.getByRole('button', { name: 'Quitar matriz.xlsx' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Asignar tarea' }))

    expect(await screen.findByText('Detalle de la tarea 42')).toBeInTheDocument()
    expect(orden).toEqual(['crearTarea', 'subirAdjunto:informe.pdf', 'subirAdjunto:matriz.xlsx', 'avisar'])
    expect(api.crearTarea).toHaveBeenCalledWith({
      titulo: 'Consolidar el informe trimestral',
      responsableId: CARLOS.id,
      fechaLimite: '2099-12-31',
      requiereEntregable: true,
    })
    expect(api.subirAdjunto.mock.calls.map(([id]) => id)).toEqual([42, 42])
    expect(api.avisar).toHaveBeenCalledWith(42)
    expect(await screen.findByText('Se le avisó a Carlos por correo.')).toBeInTheDocument()
    expect(contexto.avisarCambioCorreos).toHaveBeenCalled()
  })

  it('si un adjunto no sube, no avisa: va al detalle con el aviso de error', async () => {
    const api = {
      personas: vi.fn<ApiLider['personas']>(async () => [ANA]),
      crearTarea: vi.fn<ApiLider['crearTarea']>(async () => tarea()),
      subirAdjunto: vi.fn<ApiLider['subirAdjunto']>(async (_id, archivo) => {
        if (archivo.name === 'matriz.xlsx') throw new ErrorCrmHttp('demasiado_grande', 'El archivo es demasiado grande.', { estado: 413 })
        return adjunto(archivo.name)
      }),
      avisar: vi.fn<ApiLider['avisar']>(),
    }
    const { container } = montar(api)
    await llenarObligatorios('Informe', ANA)
    elegirArchivos(container, [archivo('informe.pdf'), archivo('matriz.xlsx')])
    fireEvent.click(screen.getByRole('button', { name: 'Asignar tarea' }))

    expect(await screen.findByText('Detalle de la tarea 42; faltan matriz.xlsx')).toBeInTheDocument()
    expect(api.subirAdjunto).toHaveBeenCalledTimes(2)
    expect(api.avisar).not.toHaveBeenCalled()
    expect(
      await screen.findByText('La tarea se creó, pero no se subió: «matriz.xlsx». Súbalo desde aquí y use «Avisar».'),
    ).toBeInTheDocument()
  })

  it('un error 400 con campos.titulo se muestra junto al título', async () => {
    const api = {
      personas: vi.fn<ApiLider['personas']>(async () => [ANA]),
      crearTarea: vi.fn<ApiLider['crearTarea']>(async () => {
        throw new ErrorCrmHttp('solicitud_invalida', 'Revise los datos.', {
          estado: 400,
          campos: { titulo: 'El título no puede ser solo espacios raros.' },
        })
      }),
      subirAdjunto: vi.fn<ApiLider['subirAdjunto']>(),
      avisar: vi.fn<ApiLider['avisar']>(),
    }
    const { container } = montar(api)
    await llenarObligatorios('Informe', ANA)
    elegirArchivos(container, [archivo('informe.pdf')])
    fireEvent.click(screen.getByRole('button', { name: 'Asignar tarea' }))

    const error = await screen.findByText('El título no puede ser solo espacios raros.')
    const titulo = screen.getByLabelText(/^Título/)
    expect(titulo).toHaveAttribute('aria-invalid', 'true')
    expect(titulo.getAttribute('aria-describedby')?.split(' ')).toContain(error.id)
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(api.subirAdjunto).not.toHaveBeenCalled()
    expect(api.avisar).not.toHaveBeenCalled()
    expect(screen.queryByText(/Detalle de la tarea/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Asignar tarea' })).toBeEnabled()
  })

  it('sin título ni responsable no llama al servidor y marca los dos campos', async () => {
    const api = {
      personas: vi.fn<ApiLider['personas']>(async () => [ANA]),
      crearTarea: vi.fn<ApiLider['crearTarea']>(),
    }
    montar(api)
    await screen.findByRole('option', { name: ANA.nombre })
    fireEvent.click(screen.getByRole('button', { name: 'Asignar tarea' }))

    expect(screen.getByText('Escriba el título de la tarea.')).toBeInTheDocument()
    expect(screen.getByText('Elija a la persona responsable.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Responsable/)).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(screen.getByLabelText(/^Título/)).toHaveFocus())
    expect(api.crearTarea).not.toHaveBeenCalled()
  })

  it('rechaza en el cliente un archivo de otro tipo y deja quitar los elegidos', async () => {
    const api = { personas: vi.fn<ApiLider['personas']>(async () => [ANA]) }
    const { container } = montar(api)
    await screen.findByRole('option', { name: ANA.nombre })
    elegirArchivos(container, [archivo('acta.zip'), archivo('informe.pdf')])

    expect(screen.getByRole('alert')).toHaveTextContent('«acta.zip» no se puede subir.')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar informe.pdf' }))
    expect(screen.queryByRole('button', { name: 'Quitar informe.pdf' })).toBeNull()
  })

  it('«Cancelar» vuelve al panel', async () => {
    montar({ personas: vi.fn<ApiLider['personas']>(async () => [ANA]) })
    await screen.findByRole('option', { name: ANA.nombre })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('Panel del líder')).toBeInTheDocument()
  })
})

describe('FormularioTarea: editar', () => {
  it('manda solo lo que cambió y, si cambió el responsable, le avisa', async () => {
    const original = tarea({ id: 7, titulo: 'Informe', descripcion: 'Texto de antes', fechaLimite: '2099-01-10', avisada: true })
    const api = {
      personas: vi.fn<ApiLider['personas']>(async () => [ANA, CARLOS]),
      tarea: vi.fn<ApiLider['tarea']>(async () => original),
      editarTarea: vi.fn<ApiLider['editarTarea']>(async (_id, cambios) => ({ ...original, ...cambios })),
      avisar: vi.fn<ApiLider['avisar']>(async () => ({ correoId: 8, estado: 'pendiente', mensaje: 'El aviso a Carlos quedó pendiente.' })),
    }
    const { contexto } = montar(api, '/crm/lider/tareas/7/editar')

    expect(await screen.findByDisplayValue('Texto de antes')).toBeInTheDocument()
    await screen.findByRole('option', { name: CARLOS.nombre })
    expect(screen.getByLabelText(/^Título/)).toHaveValue('Informe')
    expect(screen.getByLabelText('Fecha límite')).toHaveValue('2099-01-10')
    expect(screen.queryByText('Adjuntos')).toBeNull()

    fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: 'Informe final' } })
    fireEvent.change(screen.getByLabelText(/^Responsable/), { target: { value: String(CARLOS.id) } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Detalle de la tarea 7')).toBeInTheDocument()
    expect(api.editarTarea).toHaveBeenCalledWith(7, { titulo: 'Informe final', responsableId: CARLOS.id })
    expect(api.avisar).toHaveBeenCalledWith(7)
    expect(await screen.findByText('Cambios guardados. El aviso a Carlos quedó pendiente.')).toBeInTheDocument()
    expect(contexto.avisarCambioCorreos).toHaveBeenCalled()
  })

  it('si nada cambió, vuelve al detalle sin llamar; una terminada no se puede reasignar', async () => {
    const api = {
      personas: vi.fn<ApiLider['personas']>(async () => [ANA, CARLOS]),
      tarea: vi.fn<ApiLider['tarea']>(async () => tarea({ id: 7, estado: 'terminada', terminadaEn: '2026-11-23T20:00:00.000Z' })),
      editarTarea: vi.fn<ApiLider['editarTarea']>(),
      avisar: vi.fn<ApiLider['avisar']>(),
    }
    montar(api, '/crm/lider/tareas/7/editar')
    await screen.findByRole('option', { name: CARLOS.nombre })
    expect(screen.getByLabelText(/^Responsable/)).toBeDisabled()
    expect(screen.getByText(/no se puede reasignar/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Detalle de la tarea 7')).toBeInTheDocument()
    expect(api.editarTarea).not.toHaveBeenCalled()
    expect(api.avisar).not.toHaveBeenCalled()
  })

  it('una tarea que no existe muestra el aviso con el enlace al panel', async () => {
    const api = {
      personas: vi.fn<ApiLider['personas']>(async () => [ANA]),
      tarea: vi.fn<ApiLider['tarea']>(async () => {
        throw new ErrorCrmHttp('no_encontrado', 'No se encontró la tarea.', { estado: 404 })
      }),
    }
    montar(api, '/crm/lider/tareas/99/editar')
    expect(await screen.findByText('No se encontró la tarea')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al panel' })).toHaveAttribute('href', '/crm/lider')
  })
})
