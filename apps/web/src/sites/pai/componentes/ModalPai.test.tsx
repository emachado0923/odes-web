import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import ModalPai from './ModalPai'

function Prueba({ onCerrar = vi.fn<() => void>(), bloqueado = false }: { onCerrar?: () => void; bloqueado?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      <ModalPai
        abierto={abierto}
        titulo="Observaciones · SAF-TH-02"
        bloqueado={bloqueado}
        onCerrar={() => {
          onCerrar()
          setAbierto(false)
        }}
        pie={<button type="button">Guardar</button>}
      >
        <label htmlFor="logros">Logros</label>
        <textarea id="logros" />
      </ModalPai>
    </>
  )
}

describe('ModalPai', () => {
  it('abre con el foco en el primer campo, lo atrapa y lo devuelve al cerrar con Escape', () => {
    render(<Prueba />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    abrir.focus()
    fireEvent.click(abrir)
    const modal = screen.getByRole('dialog', { name: 'Observaciones · SAF-TH-02' })
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Logros')).toHaveFocus()
    // Tab desde el último control vuelve al primero (la X del encabezado).
    screen.getByRole('button', { name: 'Guardar' }).focus()
    fireEvent.keyDown(modal, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    fireEvent.keyDown(modal, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus()
    fireEvent.keyDown(modal, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abrir).toHaveFocus()
  })

  it('bloqueado: Escape y la X no cierran', () => {
    const onCerrar = vi.fn<() => void>()
    render(<Prueba onCerrar={onCerrar} bloqueado />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled()
    expect(onCerrar).not.toHaveBeenCalled()
  })
})

/** Un formulario cuyo botón Guardar se deshabilita al pulsarlo (como el de Observaciones). */
function ConGuardar({ onCerrar = vi.fn<() => void>() }: { onCerrar?: () => void }) {
  const [guardando, setGuardando] = useState(false)
  return (
    <div className="pai">
      <a href="#pie">Enlace de la página, detrás del modal</a>
      <ModalPai
        abierto
        titulo="Observaciones"
        onCerrar={onCerrar}
        pie={
          <button type="button" disabled={guardando} onClick={() => setGuardando(true)}>
            Guardar
          </button>
        }
      >
        <label htmlFor="campo">Logros</label>
        <textarea id="campo" />
      </ModalPai>
    </div>
  )
}

describe('ModalPai: la trampa del foco no depende de dónde esté el foco', () => {
  it('si el control enfocado se deshabilita (foco en <body>), Tab vuelve al modal y Escape lo sigue cerrando', () => {
    const onCerrar = vi.fn<() => void>()
    render(<ConGuardar onCerrar={onCerrar} />)
    const guardar = screen.getByRole('button', { name: 'Guardar' })
    // Como hace el navegador con un botón enfocado que se deshabilita: el foco queda en <body>.
    guardar.focus()
    guardar.blur()
    fireEvent.click(guardar)
    expect(guardar).toBeDisabled()
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(document.body, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true })
    // Mayús+Tab desde fuera va al último control habilitado (el textarea: Guardar está deshabilitado).
    expect(screen.getByLabelText('Logros')).toHaveFocus()
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('el foco que llega a la página detrás del modal vuelve a él', () => {
    render(<ConGuardar />)
    screen.getByRole('link', { name: /detrás del modal/ }).focus()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
  })

  it('con dos modales abiertos solo responde el de arriba', () => {
    const abajo = vi.fn<() => void>()
    const arriba = vi.fn<() => void>()
    render(
      <>
        <ModalPai abierto titulo="Abajo" onCerrar={abajo}>
          <button type="button">Uno</button>
        </ModalPai>
        <ModalPai abierto titulo="Arriba" onCerrar={arriba}>
          <button type="button">Dos</button>
        </ModalPai>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Dos' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dos' }), { key: 'Escape' })
    expect(arriba).toHaveBeenCalledTimes(1)
    expect(abajo).not.toHaveBeenCalled()
  })

  it('un modal oculto (la sesión venció y la página quedó debajo del ingreso) no atrapa nada', () => {
    const onCerrar = vi.fn<() => void>()
    render(
      <>
        <input aria-label="Usuario del ingreso" />
        <div hidden>
          <ModalPai abierto titulo="Oculto" onCerrar={onCerrar}>
            <button type="button">Dentro</button>
          </ModalPai>
        </div>
      </>,
    )
    const ingreso = screen.getByLabelText('Usuario del ingreso')
    ingreso.focus()
    expect(ingreso).toHaveFocus()
    fireEvent.keyDown(ingreso, { key: 'Escape' })
    expect(onCerrar).not.toHaveBeenCalled()
  })

  it('al cerrar, si el control que abrió ya no existe, el foco va a enfoqueFinal', () => {
    function Revocar() {
      const [fila, setFila] = useState(true)
      const [abierto, setAbierto] = useState(false)
      const aviso = useRef<HTMLParagraphElement>(null)
      return (
        <>
          <p tabIndex={-1} ref={aviso}>
            Aviso
          </p>
          {fila && (
            <button type="button" onClick={() => setAbierto(true)}>
              Revocar
            </button>
          )}
          <ModalPai
            abierto={abierto}
            titulo="¿Revocar?"
            enfoqueFinal={aviso}
            onCerrar={() => setAbierto(false)}
            pie={
              <button
                type="button"
                onClick={() => {
                  setFila(false)
                  setAbierto(false)
                }}
              >
                Sí, revocar
              </button>
            }
          >
            <p>Texto</p>
          </ModalPai>
        </>
      )
    }
    render(<Revocar />)
    const revocar = screen.getByRole('button', { name: 'Revocar' })
    revocar.focus()
    fireEvent.click(revocar)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, revocar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Aviso')).toHaveFocus()
  })
})
