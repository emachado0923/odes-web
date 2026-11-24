import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Muestrario from './Muestrario'
import ProveedorAvisos from './ProveedorAvisos'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/crm/muestrario']}>
      <div className="crm">
        <ProveedorAvisos>
          <Muestrario />
        </ProveedorAvisos>
      </div>
    </MemoryRouter>,
  )
}

/** La región de avisos de la página (la que no está dentro de un modal). */
function avisosDeLaPagina(): HTMLElement {
  const region = screen.getAllByRole('status').find((r) => r.classList.contains('crm-avisos') && !r.closest('dialog'))
  if (!region) throw new Error('No está la región de avisos')
  return region
}

describe('Muestrario: las piezas juntas', () => {
  it('pinta el inicio con las ocho personas (el líder pide contraseña) y los dos tableros', () => {
    montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Muestrario del CRM' })).toBeInTheDocument()
    const lider = screen.getByRole('link', { name: 'Martha Lucía Giraldo Arango Líder pide contraseña' })
    expect(lider).toHaveAttribute('href', '/crm/lider')
    const ana = screen.getByRole('link', { name: 'Ana María Restrepo Gil' })
    expect(ana).toHaveAttribute('href', '/crm/equipo/2')
    expect(ana).toHaveAccessibleDescription('3 pendientes, 2 en proceso y 1 vencida.')
    expect(screen.getByRole('link', { name: 'Juan Esteban Ochoa Ríos' })).toHaveAccessibleDescription('Sin tareas pendientes.')
    expect(screen.getAllByRole('region', { name: /^Pendiente: \d+ tareas?$/ })).toHaveLength(2)
  })

  it('el diálogo recibe el foco, se cierra con Escape y devuelve el foco a quien lo abrió', () => {
    montar()
    const abrir = screen.getByRole('button', { name: 'Abrir un diálogo' })
    abrir.focus()
    fireEvent.click(abrir)
    const dialogo = screen.getByRole('dialog', { name: '¿Eliminar la tarea?' })
    expect(dialogo).toHaveAccessibleDescription(/dejará de verse en los tableros/)
    // Sin controles en el contenido, el foco va al primero del pie: «Cancelar», no a borrar.
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus()

    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abrir).toHaveFocus()
  })

  it('con un modal abierto, los avisos se pintan dentro de él; al cerrarlo, en la página', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir el panel lateral' }))
    const panel = screen.getByRole('dialog', { name: /Preparar la presentación/ })

    fireEvent.click(within(panel).getByRole('button', { name: 'Avisar por correo' }))
    expect(within(panel).getByRole('status')).toHaveTextContent('Se le avisó por correo.')
    expect(avisosDeLaPagina()).toBeEmptyDOMElement()

    fireEvent.click(within(panel).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(avisosDeLaPagina()).toHaveTextContent('Se le avisó por correo.')

    fireEvent.click(within(avisosDeLaPagina()).getByRole('button', { name: 'Cerrar el aviso' }))
    expect(avisosDeLaPagina()).toBeEmptyDOMElement()
  })

  it('pasar a Terminada una tarea que pide entregable abre la confirmación y no deja terminar sin él', () => {
    montar()
    const tablero = screen.getAllByRole('region', { name: /^Pendiente/ })[0].closest('.crm-tablero') as HTMLElement
    fireEvent.click(within(tablero).getByRole('button', { name: /^Mover «Consolidar el informe trimestral.*» a Terminada$/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Terminar la tarea' })
    expect(dialogo).toHaveAccessibleDescription(/Consolidar el informe trimestral/)
    expect(within(dialogo).getByRole('button', { name: 'Elegir archivo' })).toHaveFocus()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Terminar tarea' }))
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Esta tarea pide un entregable')
    expect(screen.getByRole('dialog', { name: 'Terminar la tarea' })).toBeInTheDocument()
  })
})
