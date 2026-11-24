import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ContextoAvisos, ContextoRegionAvisos, type Avisar, type Aviso, type RegionAvisos as ValorRegion } from './avisos'
import RegionAvisos from './RegionAvisos'

const DURACION_MS = 6000
const MAXIMO = 3

/**
 * Da useAvisar() a todo lo de adentro y pinta los avisos abajo a la derecha
 * (abajo y a lo ancho en el celular), en una región role="status" que los
 * anuncia sin mover el foco. Cada aviso se va a los 6 segundos; mientras el
 * puntero o el foco están sobre ellos, esperan. Se ven a lo sumo tres. Con un
 * modal abierto se pintan dentro de él (ver avisos.ts).
 */
export default function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [modales, setModales] = useState<string[]>([])
  const avisosRef = useRef<Aviso[]>([])
  const siguiente = useRef(1)
  const relojes = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const pausados = useRef(false)

  const soltarReloj = useCallback((id: number) => {
    const reloj = relojes.current.get(id)
    if (reloj) clearTimeout(reloj)
    relojes.current.delete(id)
  }, [])

  /** La lista vive en avisosRef (así dos avisos seguidos ven la misma) y se copia al estado para pintar. */
  const poner = useCallback((lista: Aviso[]) => {
    avisosRef.current = lista
    setAvisos(lista)
  }, [])

  const quitar = useCallback(
    (id: number) => {
      soltarReloj(id)
      poner(avisosRef.current.filter((a) => a.id !== id))
    },
    [poner, soltarReloj],
  )

  const programar = useCallback(
    (id: number) => {
      soltarReloj(id)
      relojes.current.set(
        id,
        setTimeout(() => quitar(id), DURACION_MS),
      )
    },
    [quitar, soltarReloj],
  )

  const avisar = useCallback<Avisar>(
    (texto, tipo = 'exito') => {
      const id = siguiente.current++
      const lista = avisosRef.current
      const sobran = Math.max(0, lista.length - (MAXIMO - 1))
      for (const viejo of lista.slice(0, sobran)) soltarReloj(viejo.id)
      poner([...lista.slice(sobran), { id, texto, tipo }])
      if (!pausados.current) programar(id)
    },
    [poner, programar, soltarReloj],
  )

  const pausar = useCallback(() => {
    pausados.current = true
    for (const reloj of relojes.current.values()) clearTimeout(reloj)
    relojes.current.clear()
  }, [])

  const seguir = useCallback(() => {
    pausados.current = false
    for (const aviso of avisosRef.current) programar(aviso.id)
  }, [programar])

  const registrarModal = useCallback((id: string) => {
    setModales((lista) => [...lista.filter((m) => m !== id), id])
    return () => setModales((lista) => lista.filter((m) => m !== id))
  }, [])

  useEffect(() => {
    const mapa = relojes.current
    return () => {
      for (const reloj of mapa.values()) clearTimeout(reloj)
      mapa.clear()
    }
  }, [])

  const region = useMemo<ValorRegion>(
    () => ({ avisos, quitar, pausar, seguir, modales, registrarModal }),
    [avisos, quitar, pausar, seguir, modales, registrarModal],
  )

  return (
    <ContextoAvisos value={avisar}>
      <ContextoRegionAvisos value={region}>
        {children}
        <RegionAvisos mostrar={modales.length === 0} />
      </ContextoRegionAvisos>
    </ContextoAvisos>
  )
}
