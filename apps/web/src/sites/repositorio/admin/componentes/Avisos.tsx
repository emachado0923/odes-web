/**
 * Avisos breves de la administración ("Cambios guardados", "«…» quedó
 * publicado"): se ven abajo a la derecha y se anuncian por una región
 * role="status" (sin mover el foco). Desaparecen solos a los 8 s o con
 * "Cerrar". Los errores no van aquí: se muestran junto a lo que falló, con
 * role="alert".
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ContextoAvisos, type Avisar } from './avisar'
import Icono from './IconoAdmin'

interface Aviso {
  id: number
  texto: string
}

const DURACION_MS = 8000

export default function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguiente = useRef(1)
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const quitar = useCallback((id: number) => {
    setAvisos((lista) => lista.filter((a) => a.id !== id))
    const t = temporizadores.current.get(id)
    if (t) clearTimeout(t)
    temporizadores.current.delete(id)
  }, [])

  const avisar = useCallback<Avisar>(
    (texto) => {
      const id = siguiente.current++
      setAvisos((lista) => [...lista.slice(-2), { id, texto }])
      temporizadores.current.set(
        id,
        setTimeout(() => quitar(id), DURACION_MS),
      )
    },
    [quitar],
  )

  useEffect(() => {
    const mapa = temporizadores.current
    return () => {
      for (const t of mapa.values()) clearTimeout(t)
      mapa.clear()
    }
  }, [])

  return (
    <ContextoAvisos value={avisar}>
      {children}
      <div className="ra-avisos" role="status" aria-live="polite" aria-atomic="false">
        {avisos.map((a) => (
          <div className="ra-aviso-flotante" key={a.id}>
            <Icono nombre="check" />
            <p>{a.texto}</p>
            <button type="button" className="ra-cerrar-aviso" onClick={() => quitar(a.id)}>
              <Icono nombre="cerrar" />
              <span className="rp-oculto">Cerrar aviso</span>
            </button>
          </div>
        ))}
      </div>
    </ContextoAvisos>
  )
}
