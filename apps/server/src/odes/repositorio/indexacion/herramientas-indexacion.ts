import { execFile } from 'node:child_process';

/**
 * Comprobación previa de las herramientas externas del indexador. Sin ella,
 * una máquina sin poppler o sin tesseract produciría un índice SIN TEXTO
 * (cada archivo fallaría por separado). Con ella, la indexación se detiene
 * antes de empezar, con un mensaje que dice qué instalar, y el índice
 * vigente queda intacto.
 *
 * Herramientas (solo en la máquina que indexa; el servidor web no las usa):
 *   poppler-utils  pdftotext, pdftoppm, pdfinfo
 *   tesseract-ocr  tesseract, con los idiomas spa y eng (tesseract-ocr-spa)
 *   unzip          DOCX y PPTX
 *   webp           cwebp (solo con --miniaturas)
 */

export interface RequisitosHerramientas {
  /** false = sin OCR: no hace falta tesseract. */
  ocr: boolean;
  /** Idiomas de tesseract, p. ej. "spa+eng". */
  idiomasOcr: string;
  /** true = también cwebp (miniaturas del paquete). */
  miniaturas: boolean;
}

export interface SalidaComando {
  /** null si el comando no existe o no se pudo ejecutar. */
  stdout: string | null;
  stderr: string;
}

export type EjecutorComando = (
  comando: string,
  argumentos: readonly string[],
) => Promise<SalidaComando>;

/** Ejecuta un comando corto; stdout null si no existe (ENOENT/EACCES). El código de salida no importa. */
export const ejecutarComando: EjecutorComando = (comando, argumentos) =>
  new Promise((resolver) => {
    execFile(
      comando,
      [...argumentos],
      { timeout: 15_000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const codigo = (error as NodeJS.ErrnoException | null)?.code;
        if (codigo === 'ENOENT' || codigo === 'EACCES') {
          resolver({ stdout: null, stderr: '' });
          return;
        }
        resolver({ stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
  });

interface Faltante {
  queFalta: string;
  paqueteApt: string;
  paqueteBrew: string;
}

/** Idiomas que lista `tesseract --list-langs` (una línea por idioma tras el encabezado). */
export function idiomasTesseract(salida: string): Set<string> {
  return new Set(
    salida
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => /^[A-Za-z_]+$/.test(linea)),
  );
}

/**
 * Devuelve la lista de lo que falta (vacía si está todo). No lanza.
 */
export async function herramientasFaltantes(
  requisitos: RequisitosHerramientas,
  ejecutar: EjecutorComando = ejecutarComando,
): Promise<Faltante[]> {
  const faltantes: Faltante[] = [];
  const poppler = await Promise.all(
    ['pdftotext', 'pdftoppm', 'pdfinfo'].map(async (comando) => ({
      comando,
      existe: (await ejecutar(comando, ['-v'])).stdout !== null,
    })),
  );
  const sinPoppler = poppler.filter((h) => !h.existe).map((h) => h.comando);
  if (sinPoppler.length > 0) {
    faltantes.push({
      queFalta: sinPoppler.join(', '),
      paqueteApt: 'poppler-utils',
      paqueteBrew: 'poppler',
    });
  }
  if ((await ejecutar('unzip', ['-v'])).stdout === null) {
    faltantes.push({ queFalta: 'unzip', paqueteApt: 'unzip', paqueteBrew: 'unzip' });
  }
  if (requisitos.ocr) {
    const salida = await ejecutar('tesseract', ['--list-langs']);
    if (salida.stdout === null) {
      faltantes.push({
        queFalta: 'tesseract',
        paqueteApt: 'tesseract-ocr tesseract-ocr-spa',
        paqueteBrew: 'tesseract tesseract-lang',
      });
    } else {
      // Según la versión, la lista sale por stdout o por stderr.
      const disponibles = idiomasTesseract(`${salida.stdout}\n${salida.stderr}`);
      for (const idioma of requisitos.idiomasOcr.split('+').filter(Boolean)) {
        if (!disponibles.has(idioma)) {
          faltantes.push({
            queFalta: `el idioma "${idioma}" de tesseract`,
            paqueteApt: `tesseract-ocr-${idioma}`,
            paqueteBrew: 'tesseract-lang',
          });
        }
      }
    }
  }
  if (requisitos.miniaturas && (await ejecutar('cwebp', ['-version'])).stdout === null) {
    faltantes.push({ queFalta: 'cwebp', paqueteApt: 'webp', paqueteBrew: 'webp' });
  }
  return faltantes;
}

/** Mensaje para la persona (CLI y estado de la administración), o null si no falta nada. */
export function mensajeHerramientasFaltantes(faltantes: readonly Faltante[]): string | null {
  if (faltantes.length === 0) return null;
  const apt = [...new Set(faltantes.flatMap((f) => f.paqueteApt.split(' ')))];
  const brew = [...new Set(faltantes.flatMap((f) => f.paqueteBrew.split(' ')))];
  return (
    `Faltan herramientas de indexación en esta máquina: ${faltantes.map((f) => f.queFalta).join('; ')}. ` +
    `Instálelas en la máquina que indexa (Ubuntu/Debian: sudo apt-get install ${apt.join(' ')}; ` +
    `macOS: brew install ${brew.join(' ')}) y vuelva a intentarlo. El índice anterior no se modificó.`
  );
}
