/**
 * El script de un componente como función (plugin scriptsDelCatalogo de
 * vite.config.ts): `import ejecutar from './x/x.js?ejecutar'` corre el script.
 */
declare module '*.js?ejecutar' {
  const ejecutar: () => void
  export default ejecutar
}
