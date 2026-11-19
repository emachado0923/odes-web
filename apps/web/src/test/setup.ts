// Archivo de preparación de Vitest (vite.config.ts → test.setupFiles).
// - Matchers de jest-dom (toBeInTheDocument, toHaveAttribute, ...) con tipos para `expect` de Vitest.
// - Limpieza del DOM después de cada prueba (Vitest corre sin globals, así que
//   Testing Library no puede registrar su cleanup automático).
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
