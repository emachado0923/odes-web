import { type ComponentType, useEffect, useState } from 'react'

type Estado = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; Tablero: ComponentType }

/**
 * Monta el tablero que entrega `cargar` (sus datos, las fuentes y el chunk;
 * ver ../carga-tablero.ts). Mientras tanto muestra «Cargando el tablero…» y,
 * si falla, un aviso con el motivo. `cargar` debe ser una función estable
 * (de módulo): si cambia, la carga vuelve a empezar.
 */
export default function CargaTablero({ cargar }: { cargar: () => Promise<ComponentType> }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })

  useEffect(() => {
    let vigente = true
    cargar().then(
      (Tablero) => vigente && setEstado({ tipo: 'listo', Tablero }),
      (error: unknown) =>
        vigente &&
        setEstado({
          tipo: 'error',
          mensaje: error instanceof Error ? error.message : 'No se pudo cargar el tablero.',
        }),
    )
    return () => {
      vigente = false
    }
  }, [cargar])

  if (estado.tipo === 'listo') return <estado.Tablero />
  return (
    <div className="container-fluid p-4 p-xl-8">
      {estado.tipo === 'cargando' ? (
        <p className="text-neutral-50 mb-0" role="status">
          Cargando el tablero…
        </p>
      ) : (
        <div className="alert alert-danger" role="alert">
          <b>El tablero no pudo cargarse.</b>
          <br />
          {estado.mensaje}
        </div>
      )}
    </div>
  )
}
