/**
 * ODES (rama /odes): el Asistente ODES, un chat que responde preguntas con
 * los documentos del repositorio del Observatorio de Sapiencia.
 *
 * - "/odes": pantalla de ingreso «¡Pregúntale a OdeS!» (paginas/IngresoOdes);
 *   su botón «Ingresar» lleva a "/odes/chat", el chat (paginas/ConversacionOdes).
 *
 * - Export por defecto montado por src/router.tsx en "/odes/*" con carga
 *   diferida (route.lazy): todo lo que se importe desde aquí queda en el
 *   chunk de ODES (react-markdown incluido).
 * - Usa la plantilla de Sapiencia (kit): ver kit/KitPlantilla.tsx y LEEME.md.
 *   Su CSS es global, por eso todo enlace que sale de la rama recarga la
 *   página (reloadDocument) y el kit nunca convive con /sivu.
 * - Los estilos propios viven en odes.css, anidados bajo .odes.
 */
import { useEffect, useState, type MouseEvent } from 'react'
import { Route, Routes, useMatch } from 'react-router'
import { ID_ENTRADA } from './chat/ChatOdes'
import CabeceraOdes from './componentes/CabeceraOdes'
import PieOdes from './componentes/PieOdes'
import KitPlantilla from './kit/KitPlantilla'
import ConversacionOdes from './paginas/ConversacionOdes'
import IngresoOdes from './paginas/IngresoOdes'
import NoEncontradoOdes from './paginas/NoEncontradoOdes'
import { RUTA_CHAT_ODES } from './paginas/rutas'
import './odes.css'

/** Mientras no carga la fuente de iconos, sus ligaduras ("search", "send"...) se verían como texto: se ocultan. */
function useFuenteIconos(): boolean {
  // Sin la API de fuentes (jsdom, navegadores muy viejos) se muestran directamente.
  const [lista, setLista] = useState(() => !(document.fonts as FontFaceSet | undefined))
  useEffect(() => {
    let vigente = true
    const fuentes = document.fonts as FontFaceSet | undefined
    if (!fuentes) return
    fuentes.load('24px "Material Symbols Outlined"').then(
      () => vigente && setLista(true),
      () => vigente && setLista(true),
    )
    return () => {
      vigente = false
    }
  }, [])
  return lista
}

/** Mueve el foco al destino del enlace «Saltar…» (el campo del chat o el contenido de las demás páginas). */
function saltarA(id: string) {
  return (evento: MouseEvent<HTMLAnchorElement>) => {
    const destino = document.getElementById(id)
    if (!destino) return
    evento.preventDefault()
    destino.focus()
  }
}

export default function OdesSitio() {
  const iconos = useFuenteIconos()
  const enChat = useMatch(RUTA_CHAT_ODES) !== null
  const destino = enChat ? ID_ENTRADA : 'odes-contenido'
  return (
    <div className={['odes', iconos && 'odes--iconos', enChat && 'odes--cielo'].filter(Boolean).join(' ')}>
      <KitPlantilla />
      <a className="odes-saltar" href={`#${destino}`} onClick={saltarA(destino)}>
        {enChat ? 'Saltar al campo de mensaje' : 'Saltar al contenido'}
      </a>
      <CabeceraOdes />
      <Routes>
        <Route index element={<IngresoOdes />} />
        {/* "/odes/chat" (RUTA_CHAT_ODES en paginas/rutas.ts) */}
        <Route path="chat" element={<ConversacionOdes />} />
        <Route path="*" element={<NoEncontradoOdes />} />
      </Routes>
      <PieOdes />
    </div>
  )
}
