import type { HelmetOptions } from 'helmet';

/**
 * Opciones de helmet con una Content-Security-Policy explícita (sin
 * `useDefaults`) pensada para el visor three.js de /sivu: GLTFLoader +
 * DRACOLoader con el decodificador servido localmente en /sivu/draco/.
 *
 * @param frameAncestors fuentes de CSP_FRAME_ANCESTORS (p. ej. `'self'` o
 *   `'self' https://www.sapiencia.gov.co` para incrustar /sivu en un iframe).
 * @param origenesArchivos orígenes de los archivos del repositorio en otro
 *   dominio (Supabase Storage): portadas y miniaturas (img-src), y la subida
 *   directa y pdf.js de la administración (connect-src).
 */
export function crearOpcionesHelmet(
  frameAncestors: readonly string[],
  origenesArchivos: readonly string[] = [],
): HelmetOptions {
  // X-Frame-Options solo sabe decir DENY o SAMEORIGIN. Si frame-ancestors
  // permite otros orígenes, X-Frame-Options: SAMEORIGIN contradiría a la CSP
  // (navegadores antiguos o proxies que solo miran XFO bloquearían el iframe),
  // así que en ese caso se desactiva y manda solo la CSP.
  const soloMismoOrigen = frameAncestors.every(
    (fuente) => fuente === "'self'" || fuente === "'none'",
  );
  const xFrameOptions: HelmetOptions['xFrameOptions'] = soloMismoOrigen
    ? { action: frameAncestors.includes("'none'") ? 'deny' : 'sameorigin' }
    : false;

  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // (Comprobado en Chrome con edificiofinal.glb: quitar cualquiera de
        // 'wasm-unsafe-eval', worker-src blob: o connect-src blob: rompe la
        // carga del modelo o de sus texturas.)
        //
        // El Worker de DRACOLoader compila draco_decoder.wasm con
        // WebAssembly.instantiate: sin 'wasm-unsafe-eval' la CSP lo bloquea.
        // No habilita eval() ni new Function() de JavaScript.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        // DRACOLoader crea su Worker desde un Blob (URL blob:) que concatena
        // draco_wasm_wrapper.js con el código del worker.
        workerSrc: ["'self'", 'blob:'],
        // GLTFLoader convierte las texturas embebidas en el .glb en URLs blob:.
        // En Safari < 17 y Firefox < 98 las carga con <img> (TextureLoader),
        // por eso blob: aquí; data: cubre imágenes base64 y el favicon en
        // data: del index.html.
        imgSrc: ["'self'", 'data:', 'blob:', ...origenesArchivos],
        // En el resto de navegadores ImageBitmapLoader descarga esas texturas
        // con fetch(blob:); FileLoader también acepta URIs data:.
        connectSrc: ["'self'", 'blob:', 'data:', ...origenesArchivos],
        // React (prop style) y three.js (el canvas del renderer) escriben
        // atributos style en línea.
        styleSrc: ["'self'", "'unsafe-inline'"],
        // Fuentes locales o embebidas en el CSS compilado por Vite.
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        // Igual que los valores por defecto de helmet: sin formularios hacia
        // otros orígenes ni manejadores inline (onclick="...").
        formAction: ["'self'"],
        scriptSrcAttr: ["'none'"],
        frameAncestors: [...frameAncestors],
        // Sin upgrade-insecure-requests a propósito: en un despliegue por http
        // plano (IP de la red interna, sin TLS) obligaría al navegador a pedir
        // los recursos por https y la página quedaría rota. Si hay TLS, el
        // propio nginx debe redirigir http -> https.
      },
    },
    xFrameOptions,
    // HSTS sin includeSubDomains: si el sitio queda bajo el dominio de
    // Sapiencia, no debe forzar https en otros subdominios de la entidad.
    // Los navegadores ignoran esta cabecera cuando llega por http plano.
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false },
  };
}
