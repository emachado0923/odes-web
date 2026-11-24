import type { EstadoTarea } from '../api-crm'

/**
 * La marca de cada estado, que cuenta el avance con la forma y no solo con el
 * color: círculo vacío (pendiente), medio lleno (en proceso) y lleno con
 * visto bueno (terminada). Toma el color del texto (currentColor) y mide 1em
 * salvo que se dé `tamano`. Decorativa: el nombre del estado va escrito al lado.
 */
export default function MarcaEstado({ estado, tamano }: { estado: EstadoTarea; tamano?: number }) {
  const medida = tamano ?? '1em'
  return (
    <svg
      className="crm-marca-estado"
      data-estado={estado}
      width={medida}
      height={medida}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {estado === 'terminada' ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m4.9 8.3 2.1 2.1 4.1-4.3" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
          {estado === 'en_proceso' ? <path d="M8 3.6a4.4 4.4 0 0 1 0 8.8Z" fill="currentColor" /> : null}
        </>
      )}
    </svg>
  )
}
