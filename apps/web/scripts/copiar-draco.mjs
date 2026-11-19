// Copia el decodificador Draco de three.js a public/sivu/draco/ para que el
// visor del edificio (SIVU) lo sirva desde nuestro propio origen, sin CDN.
//
// Se ejecuta en postinstall, predev y prebuild. La carpeta de destino está
// ignorada por git (ver .gitignore de la raíz): siempre se regenera desde
// node_modules/three, así el decodificador coincide con la versión de three.
//
// El visor usa: dracoLoader.setDecoderPath('/sivu/draco/')
// DRACOLoader carga draco_wasm_wrapper.js + draco_decoder.wasm cuando el
// navegador soporta WebAssembly, y draco_decoder.js como respaldo en JS.

import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ARCHIVOS = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']

const raizWeb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destino = path.join(raizWeb, 'public', 'sivu', 'draco')

let raizThree
try {
  // "three" resuelve a <paquete>/build/three.cjs con la condición require.
  const require = createRequire(import.meta.url)
  raizThree = path.resolve(path.dirname(require.resolve('three')), '..')
} catch {
  console.error('[copiar-draco] No se encontró el paquete "three". Ejecuta "npm install" en apps/web.')
  process.exit(1)
}

const origen = path.join(raizThree, 'examples', 'jsm', 'libs', 'draco')
const { version } = JSON.parse(await readFile(path.join(raizThree, 'package.json'), 'utf8'))

await mkdir(destino, { recursive: true })

for (const archivo of ARCHIVOS) {
  try {
    await copyFile(path.join(origen, archivo), path.join(destino, archivo))
  } catch (error) {
    console.error(`[copiar-draco] No se pudo copiar ${archivo} desde ${origen}:`, error)
    process.exit(1)
  }
}

console.log(
  `[copiar-draco] Decodificador Draco de three@${version} copiado a ${path.relative(raizWeb, destino)}/ (${ARCHIVOS.join(', ')})`,
)
