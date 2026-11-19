/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vite'
import { ENTRADA_PRINCIPAL, paginaPrincipal } from './principal/plugin-vite.ts'
import { scriptBloquePertinencia } from './pertinencia/plugin-vite.ts'

/**
 * API de NestJS en desarrollo (apps/server, `npm run start:dev`). Se leen PORT
 * y HOST igual que el servidor: primero el entorno del proceso
 * (`PORT=3001 npm run dev`) y luego apps/server/.env. Así el proxy de /api
 * sigue al servidor aunque se cambie su puerto. Por defecto, localhost:3000.
 */
function urlApiDesarrollo(): string {
  const rutaEnv = fileURLToPath(new URL('../server/.env', import.meta.url))
  const archivo = existsSync(rutaEnv) ? parseEnv(readFileSync(rutaEnv, 'utf8')) : {}
  const leer = (nombre: string) => process.env[nombre]?.trim() || archivo[nombre]?.trim() || undefined

  const puerto = leer('PORT') ?? '3000'
  const host = leer('HOST')
  // 0.0.0.0 / :: escuchan en todas las interfaces: se llega por localhost.
  const destino = !host || host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host
  return `http://${destino}:${puerto}`
}

const API_DESARROLLO = urlApiDesarrollo()

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  // paginaPrincipal: /principal, página de HTML puro con el bloque de WordPress (ver principal/LEEME.md).
  // scriptBloquePertinencia: el script del bloque de WordPress de /pertinencia como módulo (ver pertinencia/LEEME.md).
  plugins: [react(), paginaPrincipal(), scriptBloquePertinencia()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_DESARROLLO, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': { target: API_DESARROLLO, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // three.js (~590 kB minificado) vive solo en el chunk diferido de SIVU;
    // el límite por defecto (500 kB) avisaría siempre por ese chunk.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      // Dos páginas: la SPA de React (/, /sivu, /odes, /repositorio) y
      // /principal, que no usa React (dist/principal/index.html).
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        principal: ENTRADA_PRINCIPAL,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'principal/**/*.test.ts', 'pertinencia/**/*.test.ts'],
    // Las hojas no se procesan en las pruebas (jsdom no aplica CSS), salvo las
    // del PAI importadas como texto (?raw) por src/sites/pai/estilos.test.ts.
    // También la de /pertinencia (?raw), por src/sites/pertinencia/estilos.test.ts.
    css: { include: [/\/src\/sites\/pai\/[^?]*\.css\?raw$/, /\/src\/sites\/pertinencia\/[^?]*\.css\?raw$/] },
  },
})
