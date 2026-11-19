// El reinicio global va primero para que el CSS de cada rama tenga prioridad.
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { crearRouter } from './router'

const contenedor = document.getElementById('root')
if (!contenedor) {
  throw new Error('No se encontró el elemento #root en index.html')
}

const router = crearRouter()

createRoot(contenedor).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
