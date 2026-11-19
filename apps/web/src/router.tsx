/**
 * Rutas de la aplicación (React Router 8, modo data router).
 *
 *   /          Inicio: enlaces a las ramas.
 *   /sivu/*    SIVU — Sistema de Visualización de Datos: edificio en 3D y
 *              tableros (chunk diferido, three.js solo aquí).
 *   /odes/*    ODES (chunk diferido).
 *   /repositorio/*  Repositorio de productos del Observatorio (chunk diferido;
 *              su administración, /repositorio/admin/*, va en otro chunk).
 *   /tableros/*  Tableros de información (chunk diferido; cada tablero y
 *              ECharts, en otros), con la plantilla de Sapiencia como /odes.
 *   /pai/*     PAI — Plan de Acción Institucional (chunk diferido): reporte
 *              bimestral de indicadores con sesión, plantilla de Sapiencia.
 *   /pertinencia/*  Medida de pertinencia (chunk diferido): presentación,
 *              espacio del tablero de consulta y accesos a la normativa.
 *   *          404 global.
 *
 * /principal no está aquí: es una página de HTML puro (el bloque de
 * WordPress) que Vite compila aparte (principal/) y NestJS sirve con su
 * propia CSP. Se llega a ella con recarga completa, como a toda rama.
 *
 * Cada rama es independiente: se carga con route.lazy, define sus subrutas con
 * <Routes> descendientes y tiene su propio errorElement, de modo que un fallo
 * en una rama (incluido un chunk que no se pudo descargar tras un despliegue)
 * muestra un mensaje amable sin tumbar las demás.
 *
 * `rutas` se exporta para que las pruebas creen un router en memoria
 * (createMemoryRouter); la aplicación usa crearRouter() en src/main.tsx.
 *
 * Nota: se usa la forma de función de `lazy` (no la de objeto). React Router
 * vacía en sitio el objeto `lazy` compartido al resolverlo, lo que rompería
 * crear varios routers con el mismo arreglo `rutas` (pruebas, HMR).
 */
import { createBrowserRouter, type RouteObject } from 'react-router'
import CargaRama from './compartido/CargaRama'
import ErrorRama from './compartido/ErrorRama'
import NoEncontrado from './compartido/NoEncontrado'
import Raiz from './compartido/Raiz'
import Inicio from './inicio/Inicio'

export const rutas: RouteObject[] = [
  {
    id: 'raiz',
    path: '/',
    Component: Raiz,
    ErrorBoundary: ErrorRama,
    children: [
      { index: true, Component: Inicio },
      {
        id: 'sivu',
        path: 'sivu/*',
        // HydrateFallback: se muestra al entrar directo por URL mientras baja el chunk.
        // Al navegar desde otra página, Raiz muestra una barra de carga en su lugar.
        HydrateFallback: CargaRama,
        ErrorBoundary: ErrorRama,
        lazy: async () => ({ Component: (await import('./sites/sivu/SivuSitio')).default }),
      },
      {
        id: 'odes',
        path: 'odes/*',
        HydrateFallback: CargaRama,
        ErrorBoundary: ErrorRama,
        lazy: async () => ({ Component: (await import('./sites/odes/OdesSitio')).default }),
      },
      {
        id: 'repositorio',
        path: 'repositorio/*',
        HydrateFallback: CargaRama,
        ErrorBoundary: ErrorRama,
        lazy: async () => ({ Component: (await import('./sites/repositorio/RepositorioSitio')).default }),
      },
      {
        id: 'tableros',
        path: 'tableros/*',
        HydrateFallback: CargaRama,
        ErrorBoundary: ErrorRama,
        lazy: async () => ({ Component: (await import('./sites/tableros/TablerosSitio')).default }),
      },
      {
        id: 'pai',
        path: 'pai/*',
        HydrateFallback: CargaRama,
        ErrorBoundary: ErrorRama,
        lazy: async () => ({ Component: (await import('./sites/pai/PaiSitio')).default }),
      },
      {
        id: 'pertinencia',
        path: 'pertinencia/*',
        HydrateFallback: CargaRama,
        ErrorBoundary: ErrorRama,
        lazy: async () => ({ Component: (await import('./sites/pertinencia/PertinenciaSitio')).default }),
      },
      { path: '*', Component: NoEncontrado },
    ],
  },
]

/** Crea el router del navegador. Llamar una sola vez, fuera del árbol de React. */
export function crearRouter() {
  return createBrowserRouter(rutas)
}
