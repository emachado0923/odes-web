import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF } from '../../api-repositorio'
import type { PortadaGenerada } from '../portada/generarPortada'
import { ApiSimulada, CSRF_PRUEBA, DESCRIPCION_PRUEBA, error, instalarApi, seisClaves } from '../pruebas/apiSimulada'
import { boton, enlace, esperarTitulo, renderAdmin } from '../pruebas/renderAdmin'

// La portada real usa pdf.js y canvas (no existen en jsdom): se simula el módulo.
const generar = vi.hoisted(() => ({
  portadaDesdePdf: vi.fn<(f: Blob | ArrayBuffer) => Promise<PortadaGenerada>>(),
  portadaDesdeImagen: vi.fn<(f: Blob) => Promise<PortadaGenerada>>(),
}))
vi.mock('../portada/generarPortada', () => ({
  ...generar,
  ErrorPortada: class ErrorPortada extends Error {
    name = 'ErrorPortada'
  },
}))

function portadaFalsa(origen: PortadaGenerada['origen'] = 'pdf'): PortadaGenerada {
  return {
    portada: new Blob(['jpeg'], { type: 'image/jpeg' }),
    miniatura: { datos: new Blob(['webp'], { type: 'image/webp' }), nombre: 'miniatura.webp' },
    url: 'blob:portada-nueva',
    urlMiniatura: 'blob:miniatura-nueva',
    origen,
    origenAncho: 1400,
    origenAlto: 1980,
    recortada: false,
    corte: null,
  }
}

let api: ApiSimulada

beforeEach(() => {
  api = new ApiSimulada()
  api.sesionActiva = true
  instalarApi(api)
  URL.createObjectURL = vi.fn<(o: Blob | MediaSource) => string>(() => 'blob:x')
  URL.revokeObjectURL = vi.fn<(url: string) => void>()
  generar.portadaDesdePdf.mockReset().mockResolvedValue(portadaFalsa())
  generar.portadaDesdeImagen.mockReset().mockResolvedValue(portadaFalsa('imagen'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Documento con archivo PDF propio. */
function conPdf() {
  return api.documentos.find((d) => d.tipo === 'documento' && d.archivo)!
}

async function abrir(id: string) {
  const r = renderAdmin(`/repositorio/admin/documentos/${encodeURIComponent(id)}`)
  await screen.findByLabelText(/^Título/, {}, { timeout: 3000 })
  return r
}

const campo = (etiqueta: RegExp) => screen.getByLabelText(etiqueta)
const entradaArchivo = () => document.querySelector<HTMLInputElement>('.ra-archivo input[type=file]')!
const comboClaves = () => screen.getByRole('combobox', { name: 'Agregar palabra clave' })

/** Un texto de `n` palabras. */
function palabras(n: number): string {
  return Array.from({ length: n }, (_, i) => `palabra${i + 1}`).join(' ')
}

/** Escribe una palabra clave y la agrega con Enter. */
function agregarPalabra(texto: string) {
  fireEvent.change(comboClaves(), { target: { value: texto } })
  fireEvent.keyDown(comboClaves(), { key: 'Enter' })
}

/** El botón del panel de estado: «Publicar» o, con cambios sin guardar, «Guardar y publicar». */
const botonPublicar = () => boton(/^(Publicar|Guardar y publicar)$/)

/** Lo que la ayuda del botón «Publicar» dice que falta, renglón por renglón (vacío si no hay ayuda). */
function faltasPublicar(): string[] {
  const id = botonPublicar().getAttribute('aria-describedby')
  const ayuda = id ? document.getElementById(id) : null
  return ayuda ? within(ayuda).getAllByRole('listitem').map((li) => li.textContent ?? '') : []
}

describe('editar un documento', () => {
  it('muestra todos los campos con sus datos, la vista previa con la tarjeta pública y el estado', async () => {
    const d = conPdf()
    await abrir(d.id)
    expect(campo(/^Título/)).toHaveValue(d.titulo)
    expect(campo(/^Categoría/)).toHaveValue(d.categoria)
    expect(campo(/^Año/)).toHaveValue(String(d.anio ?? ''))
    for (const etiqueta of [/^Subtítulo/, /^Descripción/, /^N\.º de edición/, /^Mes/, /^URL externa/, /^Entrada del blog/, /^Nota visible/, /^Posición/, /^Notas internas/]) {
      expect(campo(etiqueta)).toBeInTheDocument()
    }
    const vista = screen.getByRole('region', { name: 'Vista previa' })
    expect(within(vista).getByRole('heading', { level: 2, name: d.titulo })).toBeInTheDocument()
    // La vista previa sigue lo que se escribe.
    fireEvent.change(campo(/^Título/), { target: { value: 'Título nuevo de prueba' } })
    expect(within(vista).getByRole('heading', { level: 2, name: 'Título nuevo de prueba' })).toBeInTheDocument()
    expect(screen.getByText('Publicado', { selector: '.ra-editor-estado .ra-estado' })).toBeInTheDocument()
  })

  it('guarda con PUT (solo los datos editables y el token CSRF)', async () => {
    const d = conPdf()
    await abrir(d.id)
    fireEvent.change(campo(/^Subtítulo/), { target: { value: '  Un   subtítulo nuevo ' } })
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    const put = await waitFor(() => {
      const p = api.peticiones.find((x) => x.metodo === 'PUT')
      expect(p).toBeDefined()
      return p!
    })
    expect(put.ruta).toBe(`/api/repositorio/admin/documentos/${d.id}`)
    expect(put.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(put.cuerpo).toMatchObject({ subtitulo: 'Un subtítulo nuevo', titulo: d.titulo, orden: null })
    expect(put.cuerpo).not.toHaveProperty('id')
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
    expect(screen.getByText('Todo está guardado.')).toBeInTheDocument()
  })

  it('valida antes de enviar: resumen de errores con enlaces y el campo marcado', async () => {
    await abrir(conPdf().id)
    fireEvent.change(campo(/^Título/), { target: { value: '   ' } })
    fireEvent.change(campo(/^Año/), { target: { value: '1800' } })
    fireEvent.click(boton('Guardar cambios'))
    const resumen = await screen.findByRole('alert')
    expect(resumen).toHaveTextContent('Revise 2 campos antes de guardar')
    expect(within(resumen).getByRole('link', { name: /Título: Escriba el título\./ })).toBeInTheDocument()
    const titulo = campo(/^Título/)
    expect(titulo).toHaveAttribute('aria-invalid', 'true')
    expect(titulo.getAttribute('aria-describedby')).toMatch(/-error/)
    expect(api.mutaciones()).toHaveLength(0)
    // El enlace del resumen lleva al campo.
    fireEvent.click(within(resumen).getByRole('link', { name: /Título/ }))
    expect(titulo).toHaveFocus()
  })

  it('muestra junto a cada campo los errores que devuelve el servidor (ErrorRepositorio.campos)', async () => {
    const d = conPdf()
    api.forzar(
      'PUT',
      `/api/repositorio/admin/documentos/${d.id}`,
      error(400, 'solicitud_invalida', 'Revise los campos marcados.', {
        subtitulo: 'El subtítulo: máximo 400 caracteres.',
        urlEntradaBlog: 'La URL de la entrada del blog debe ser una dirección completa.',
      }),
    )
    await abrir(d.id)
    fireEvent.change(campo(/^Subtítulo/), { target: { value: 'Otro' } })
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    const resumen = await screen.findByRole('alert')
    expect(resumen).toHaveTextContent('Revise los campos marcados.')
    expect(campo(/^Subtítulo/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('El subtítulo: máximo 400 caracteres.', { selector: '.ra-error span' })).toBeInTheDocument()
    expect(campo(/^Entrada del blog/)).toHaveAttribute('aria-invalid', 'true')
    // Al corregir el campo, su error del servidor se va.
    fireEvent.change(campo(/^Subtítulo/), { target: { value: 'Corregido' } })
    expect(campo(/^Subtítulo/)).not.toHaveAttribute('aria-invalid')
  })

  it('tipo tablero (en un borrador): la URL externa es obligatoria y no hay descarga', async () => {
    // Un borrador, para que el guardado no dependa de las reglas para publicar.
    const d = conPdf()
    d.publicado = false
    await abrir(d.id)
    const descarga = screen.getByRole('checkbox', { name: 'Permitir la descarga del archivo' })
    expect(descarga).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /Tablero interactivo/ }))
    expect(descarga).not.toBeChecked()
    expect(descarga).toBeDisabled()
    expect(screen.getByText('Los tableros y las entradas no tienen descarga.')).toBeInTheDocument()
    expect(campo(/^URL externa/)).toHaveAttribute('aria-required', 'true')
    fireEvent.click(boton('Guardar cambios'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Un tablero necesita la URL externa')

    fireEvent.change(campo(/^URL externa/), { target: { value: 'https://app.powerbi.com/view?r=nuevo' } })
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    await waitFor(() => expect(api.peticiones.some((p) => p.metodo === 'PUT')).toBe(true))
    expect(api.peticiones.find((p) => p.metodo === 'PUT')!.cuerpo).toMatchObject({
      tipo: 'tablero',
      permiteDescarga: false,
      urlVerExterna: 'https://app.powerbi.com/view?r=nuevo',
    })
  })

  it('un documento publicado puede pasar a tablero: los tableros también se publican', async () => {
    const d = conPdf()
    await abrir(d.id)
    fireEvent.click(screen.getByRole('radio', { name: /Tablero interactivo/ }))
    fireEvent.change(campo(/^URL externa/), { target: { value: 'https://app.powerbi.com/view?r=nuevo' } })
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    await waitFor(() => expect(api.peticiones.some((p) => p.metodo === 'PUT')).toBe(true))
    expect(api.peticiones.find((p) => p.metodo === 'PUT')!.cuerpo).toMatchObject({
      tipo: 'tablero',
      urlVerExterna: 'https://app.powerbi.com/view?r=nuevo',
    })
    expect(screen.queryByText(/solo se publican documentos/)).not.toBeInTheDocument()
  })

  it('pasar a tablero descarta el archivo elegido sin subir (y su portada automática): no se sube al guardar', async () => {
    const d = conPdf()
    d.urlPortada = null
    // Un borrador, para que el guardado no dependa de las reglas para publicar.
    d.publicado = false
    await abrir(d.id)
    const pdf = new File(['%PDF-1.7 prueba'], 'vertical.pdf', { type: 'application/pdf' })
    fireEvent.change(entradaArchivo(), { target: { files: [pdf] } })
    expect(screen.getByText('Archivo nuevo (reemplaza al actual al guardar)')).toBeInTheDocument()
    expect(await screen.findByText('Nueva portada')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Tablero interactivo/ }))
    expect(await screen.findByText(/Se descartó el archivo elegido \(«vertical\.pdf»\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Archivo nuevo/)).not.toBeInTheDocument()
    expect(screen.queryByText('Nueva portada')).not.toBeInTheDocument()
    // No se puede elegir otro: el archivo que ya tenía no se publica y se puede quitar.
    expect(document.querySelector('.ra-zona')).toBeNull()
    expect(entradaArchivo()).toBeNull()
    expect(screen.getByText(/Este archivo no se publica/)).toBeInTheDocument()
    expect(boton('Quitar archivo')).toBeEnabled()
    expect(screen.queryByText(/no llevan archivo propio: «Ver» abre la URL externa\./)).not.toBeInTheDocument()

    fireEvent.change(campo(/^URL externa/), { target: { value: 'https://app.powerbi.com/view?r=tablero-de-prueba' } })
    // La vista previa abre el tablero, no el archivo.
    const vista = screen.getByRole('region', { name: 'Vista previa' })
    expect(within(vista).getByRole('link', { name: /Abrir tablero/ })).toHaveAttribute(
      'href',
      'https://app.powerbi.com/view?r=tablero-de-prueba',
    )
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    await screen.findByText('Cambios guardados.')
    expect(api.mutaciones().map((p) => `${p.metodo} ${p.ruta.split('/').pop()}`)).toEqual([`PUT ${d.id}`])
  })

  it('un tablero sin archivo no ofrece subir uno; al quitar el archivo de uno convertido queda la ayuda', async () => {
    const d = conPdf()
    d.publicado = false
    await abrir(d.id)
    fireEvent.click(screen.getByRole('radio', { name: /Entrada de blog/ }))
    expect(screen.getByText(/Este archivo no se publica/)).toBeInTheDocument()
    fireEvent.click(boton('Quitar archivo'))
    expect(screen.getByText('El archivo actual se quitará al guardar.')).toBeInTheDocument()
    expect(screen.queryByText(/Este archivo no se publica/)).not.toBeInTheDocument()
    expect(screen.getByText('Los tableros y las entradas de blog no llevan archivo propio: «Ver» abre la URL externa.')).toBeInTheDocument()
    expect(document.querySelector('.ra-zona')).toBeNull()
  })

  it('mide la barra fija «Guardar cambios» en --ra-alto-barra (scroll-padding del CSS) y la quita al salir', async () => {
    const medida = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.classList.contains('ra-barra-guardar') ? 72 : 0 } as DOMRect
    })
    const { unmount } = await abrir(conPdf().id)
    // La medida está en un useEffect: con la máquina cargada puede llegar
    // después de que aparezca el formulario.
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--ra-alto-barra')).toBe('72px'))
    unmount()
    expect(document.documentElement.style.getPropertyValue('--ra-alto-barra')).toBe('')
    medida.mockRestore()
  })

  it('palabras clave: máximo 6 (las que se piden para publicar), sugerencias de las existentes y la misma forma escrita', async () => {
    const d = conPdf()
    d.claves = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis']
    await abrir(d.id)
    const combo = comboClaves()
    expect(combo).toBeDisabled()
    expect(combo).toHaveAttribute('placeholder', 'Máximo 6 palabras clave')
    expect(combo).toHaveAccessibleDescription(/^6 para publicar, en el orden en que se muestran\./)
    expect(screen.getByText('6 de 6')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar «Seis»' }))
    expect(combo).toBeEnabled()

    fireEvent.change(combo, { target: { value: 'acc' } })
    const lista = screen.getByRole('listbox', { name: 'Palabras clave existentes' })
    expect(within(lista).getAllByRole('option').map((o) => o.textContent)).toEqual(['Acceso30 documentos'])
    fireEvent.change(combo, { target: { value: 'educacion  SUPERIOR' } })
    fireEvent.keyDown(combo, { key: 'Enter' })
    const elegidas = screen.getByRole('list', { name: 'Palabras clave del documento' })
    expect(within(elegidas).getAllByRole('listitem').at(-1)).toHaveTextContent('Educación superior')
    expect(screen.getByText(/Se agregó «Educación superior», como ya está escrita en el repositorio\./)).toBeInTheDocument()
    expect(combo).toBeDisabled()
    // Enter en el campo no envía el formulario.
    expect(api.mutaciones()).toHaveLength(0)
  })

  it('rechaza un archivo de un tipo no permitido (elegido o arrastrado) sin subirlo', async () => {
    await abrir(conPdf().id)
    fireEvent.change(entradaArchivo(), { target: { files: [new File(['hola'], 'notas.txt', { type: 'text/plain' })] } })
    expect(screen.getByText('«notas.txt» no es un tipo permitido. Se aceptan PDF, PNG, JPEG, DOCX y PPTX.')).toBeInTheDocument()
    expect(screen.queryByText(/Archivo nuevo/)).not.toBeInTheDocument()

    const zona = document.querySelector('.ra-zona')!
    fireEvent.drop(zona, { dataTransfer: { files: [new File(['MZ'], 'programa.exe', { type: 'application/x-msdownload' })] } })
    expect(screen.getByText(/«programa\.exe» no es un tipo permitido/)).toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(0)
  })

  it('un PDF para un documento sin portada genera la portada; al guardar sube archivo y portada, en orden', async () => {
    const d = conPdf()
    d.urlPortada = null
    await abrir(d.id)
    const pdf = new File(['%PDF-1.7 prueba'], 'boletin.pdf', { type: 'application/pdf' })
    fireEvent.change(entradaArchivo(), { target: { files: [pdf] } })
    expect(screen.getByText('Archivo nuevo (reemplaza al actual al guardar)')).toBeInTheDocument()
    await waitFor(() => expect(generar.portadaDesdePdf).toHaveBeenCalledWith(pdf))
    expect(await screen.findByText(/Portada generada automáticamente\./)).toBeInTheDocument()
    expect(screen.getByText('Nueva portada')).toBeInTheDocument()
    // La vista previa ya muestra la portada nueva (URL blob: local).
    const vista = screen.getByRole('region', { name: 'Vista previa' })
    expect(vista.querySelector('.rp-portada img')).toHaveAttribute('src', 'blob:portada-nueva')

    await act(async () => fireEvent.click(boton('Guardar cambios')))
    await screen.findByText('Cambios guardados.')
    const pasos = api.mutaciones().map((p) => `${p.metodo} ${p.ruta.split('/').pop()}`)
    // POST subidas: el servidor dice cómo subir (aquí, multipart, sin Storage).
    expect(pasos).toEqual(['POST subidas', 'PUT archivo', 'PUT portada'])
    for (const p of api.mutaciones()) expect(p.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    const formulario = api.mutaciones()[2].cuerpo as FormData
    expect(formulario.get('portada')).toBeInstanceOf(Blob)
    expect((formulario.get('miniatura') as File).name).toBe('miniatura.webp')
  })

  it('con portada, un PDF nuevo no la reemplaza solo; "Generar desde el PDF" y "Usar una imagen…" sí', async () => {
    await abrir(conPdf().id)
    const pdf = new File(['%PDF-1.7'], 'otro.pdf', { type: 'application/pdf' })
    fireEvent.change(entradaArchivo(), { target: { files: [pdf] } })
    expect(generar.portadaDesdePdf).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(boton('Generar desde el PDF')))
    expect(generar.portadaDesdePdf).toHaveBeenCalledWith(pdf)

    const imagen = new File(['png'], 'tablero.png', { type: 'image/png' })
    const entradaImagen = document.querySelector<HTMLInputElement>('.ra-portada input[type=file]')!
    await act(async () => fireEvent.change(entradaImagen, { target: { files: [imagen] } }))
    expect(generar.portadaDesdeImagen).toHaveBeenCalledWith(imagen)
    expect(await screen.findByText(/Compuesta con la imagen elegida/)).toBeInTheDocument()
  })

  it('si falla la portada, lo explica en español', async () => {
    const d = conPdf()
    d.urlPortada = null
    generar.portadaDesdePdf.mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
    await abrir(d.id)
    fireEvent.change(entradaArchivo(), { target: { files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByText('No se pudo generar la portada. Intente de nuevo o con otro archivo.')).toBeInTheDocument()
  })

  it('quitar el archivo se aplica al guardar (DELETE …/archivo)', async () => {
    const d = conPdf()
    d.publicado = false
    await abrir(d.id)
    fireEvent.click(boton('Quitar archivo'))
    expect(screen.getByText('El archivo actual se quitará al guardar.')).toBeInTheDocument()
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    await screen.findByText('Cambios guardados.')
    expect(api.mutaciones().map((p) => `${p.metodo} ${p.ruta.split('/').pop()}`)).toEqual(['DELETE archivo'])
  })

  it('publicar y despublicar desde el panel de estado', async () => {
    const d = conPdf()
    await abrir(d.id)
    await act(async () => fireEvent.click(boton('Despublicar')))
    expect(await screen.findByText(`«${d.titulo}» quedó despublicado.`)).toBeInTheDocument()
    expect(api.documento(d.id).publicado).toBe(false)
    await act(async () => fireEvent.click(boton('Publicar')))
    await waitFor(() => expect(api.documento(d.id).publicado).toBe(true))
  })

  it('sin archivo ni URL no se puede publicar, y lo dice', async () => {
    const d = conPdf()
    d.publicado = false
    d.archivo = null
    d.urlVerExterna = null
    await abrir(d.id)
    expect(boton('Publicar')).toBeDisabled()
    expect(boton('Publicar')).toHaveAccessibleDescription(/^Para publicarlo falta:\s*El archivo o una URL externa\./)
    // Lo demás (año, descripción y 6 palabras clave) ya lo tiene.
    expect(faltasPublicar()).toEqual(['El archivo o una URL externa.'])
  })
})

describe('descripción y lo que se exige para publicar', () => {
  it('Descripción: muestra la guardada, cuenta las palabras y la vista previa la sigue', async () => {
    await abrir(conPdf().id)
    const descripcion = campo(/^Descripción/)
    expect(descripcion.tagName).toBe('TEXTAREA')
    expect(descripcion).toHaveValue(DESCRIPCION_PRUEBA)
    expect(descripcion).toHaveAttribute('maxlength', '700')
    expect(descripcion).toHaveAccessibleDescription(/^Unas 30 palabras \(entre 25 y 35 para publicar\)/)
    expect(screen.getByText('30 / 30 palabras')).toBeInTheDocument()
    const vista = screen.getByRole('region', { name: 'Vista previa' })
    expect(vista.querySelector('.rp-descripcion')).toHaveTextContent(DESCRIPCION_PRUEBA)

    // El contador y la vista previa siguen lo que se escribe (los saltos de línea separan palabras).
    fireEvent.change(descripcion, { target: { value: ' Una   descripción\ncorta de prueba ' } })
    expect(screen.getByText('5 / 30 palabras')).not.toHaveClass('ra-contador-excedido')
    expect(vista.querySelector('.rp-descripcion')).toHaveTextContent('Una descripción corta de prueba')
    // Más de 70 palabras: el contador se marca.
    fireEvent.change(descripcion, { target: { value: `${DESCRIPCION_PRUEBA} ${palabras(6)}` } })
    expect(screen.getByText('36 / 30 palabras')).toHaveClass('ra-contador', 'ra-contador-excedido')
    // Vacía: la tarjeta queda sin descripción.
    fireEvent.change(descripcion, { target: { value: '' } })
    expect(screen.getByText('0 / 30 palabras')).toBeInTheDocument()
    expect(vista.querySelector('.rp-descripcion')).toBeNull()
    // En inglés, se marca el idioma (como el título y el subtítulo).
    fireEvent.click(screen.getByRole('radio', { name: 'Inglés' }))
    expect(descripcion).toHaveAttribute('lang', 'en')
  })

  it('un documento publicado no se guarda sin año, con la descripción fuera de 25–35 palabras o sin 6 palabras clave', async () => {
    const d = conPdf()
    await abrir(d.id)
    fireEvent.change(campo(/^Año/), { target: { value: '' } })
    fireEvent.change(campo(/^Descripción/), { target: { value: palabras(24) } })
    fireEvent.click(screen.getByRole('button', { name: `Quitar «${d.claves.at(-1)}»` }))
    fireEvent.click(boton('Guardar cambios'))

    const resumen = await screen.findByRole('alert')
    expect(resumen).toHaveTextContent('Revise 3 campos antes de guardar')
    for (const nombre of [
      'Año: Para publicar, indique el año de publicación.',
      'Descripción: La descripción tiene 24 palabras: para publicar debe tener entre 25 y 35 (se piden 30).',
      'Palabras clave: Para publicar, el documento necesita 6 palabras clave (tiene 5).',
    ]) {
      expect(within(resumen).getByRole('link', { name: nombre })).toBeInTheDocument()
    }
    // Cada error, también junto a su campo.
    expect(campo(/^Año/)).toHaveAttribute('aria-invalid', 'true')
    expect(campo(/^Año/)).toHaveAccessibleDescription(/Para publicar, indique el año de publicación\./)
    expect(campo(/^Descripción/)).toHaveAttribute('aria-invalid', 'true')
    expect(campo(/^Descripción/)).toHaveAccessibleDescription(/La descripción tiene 24 palabras/)
    expect(comboClaves()).toHaveAttribute('aria-invalid', 'true')
    expect(comboClaves()).toHaveAccessibleDescription(/necesita 6 palabras clave \(tiene 5\)/)
    expect(api.mutaciones()).toHaveLength(0)

    // Con más de 35 palabras, tampoco.
    fireEvent.change(campo(/^Descripción/), { target: { value: `${DESCRIPCION_PRUEBA} ${palabras(6)}` } })
    expect(campo(/^Descripción/)).toHaveAccessibleDescription(/La descripción tiene 36 palabras/)
    fireEvent.click(boton('Guardar cambios'))
    expect(api.mutaciones()).toHaveLength(0)

    // Completo, se guarda y sigue publicado.
    fireEvent.change(campo(/^Año/), { target: { value: '2024' } })
    fireEvent.change(campo(/^Descripción/), { target: { value: DESCRIPCION_PRUEBA } })
    agregarPalabra('Matrícula')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(1)
    expect(api.mutaciones()[0]).toMatchObject({
      metodo: 'PUT',
      cuerpo: { anio: 2024, descripcion: DESCRIPCION_PRUEBA, claves: [...d.claves.slice(0, 5), 'Matrícula'] },
    })
    expect(api.documento(d.id).publicado).toBe(true)
  })

  it('si el servidor rechaza un publicado incompleto (400), marca la descripción y las palabras clave', async () => {
    const d = conPdf()
    api.forzar(
      'PUT',
      `/api/repositorio/admin/documentos/${d.id}`,
      error(400, 'solicitud_invalida', 'El documento está publicado: complete los campos marcados o despublíquelo para guardarlo incompleto.', {
        descripcion: 'La descripción tiene 45 palabras: para publicar debe tener entre 25 y 35 (se piden 30).',
        claves: 'Para publicar, el documento necesita 6 palabras clave (tiene 5).',
      }),
    )
    await abrir(d.id)
    fireEvent.change(campo(/^Subtítulo/), { target: { value: 'Otro' } })
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    const resumen = await screen.findByRole('alert')
    expect(resumen).toHaveTextContent('complete los campos marcados o despublíquelo para guardarlo incompleto.')
    expect(within(resumen).getByRole('link', { name: /^Descripción: La descripción tiene 45 palabras/ })).toBeInTheDocument()
    expect(campo(/^Descripción/)).toHaveAttribute('aria-invalid', 'true')
    expect(comboClaves()).toHaveAttribute('aria-invalid', 'true')
    // Al corregir la descripción, su error del servidor se va.
    fireEvent.change(campo(/^Descripción/), { target: { value: palabras(30) } })
    expect(campo(/^Descripción/)).not.toHaveAttribute('aria-invalid')
  })

  it('un borrador sí se guarda incompleto: sin año, sin descripción y con menos de 6 palabras clave', async () => {
    const d = conPdf()
    d.publicado = false
    const cinco = d.claves.slice(0, 5)
    await abrir(d.id)
    fireEvent.change(campo(/^Año/), { target: { value: '' } })
    fireEvent.change(campo(/^Descripción/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: `Quitar «${d.claves.at(-1)}»` }))
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(1)
    expect(api.mutaciones()[0]).toMatchObject({
      metodo: 'PUT',
      cuerpo: { anio: null, mes: null, descripcion: null, claves: cinco },
    })
    expect(api.documento(d.id)).toMatchObject({ publicado: false, anio: null, descripcion: null, claves: cinco })
    // Guardado, sigue sin poder publicarse.
    expect(boton('Publicar')).toBeDisabled()
  })

  it('un borrador incompleto no se puede publicar: «Publicar» queda deshabilitado y la ayuda lista lo que falta', async () => {
    const d = conPdf()
    Object.assign(d, { publicado: false, anio: null, descripcion: null, claves: ['Acceso', 'Matrícula'] })
    await abrir(d.id)
    expect(boton('Publicar')).toBeDisabled()
    expect(boton('Publicar')).toHaveAccessibleDescription(/^Para publicarlo falta:/)
    // Sin importar el orden de los renglones.
    expect(new Set(faltasPublicar())).toEqual(
      new Set([
        'Para publicar, indique el año de publicación.',
        'Para publicar, escriba la descripción (unas 30 palabras).',
        'Para publicar, el documento necesita 6 palabras clave (tiene 2).',
      ]),
    )
    expect(campo(/^Año/)).toHaveAccessibleDescription('Obligatorio para publicar.')

    // La lista sigue lo que se escribe, antes de guardar.
    fireEvent.change(campo(/^Año/), { target: { value: '2024' } })
    fireEvent.change(campo(/^Descripción/), { target: { value: palabras(20) } })
    expect(new Set(faltasPublicar())).toEqual(
      new Set([
        'La descripción tiene 20 palabras: para publicar debe tener entre 25 y 35 (se piden 30).',
        'Para publicar, el documento necesita 6 palabras clave (tiene 2).',
      ]),
    )
    // Un tablero se publica con las mismas reglas: la lista no cambia.
    fireEvent.click(screen.getByRole('radio', { name: /Tablero interactivo/ }))
    expect(faltasPublicar()).not.toContain(expect.stringMatching(/solo se publican documentos/))
    expect(botonPublicar()).toBeDisabled()
    expect(api.mutaciones()).toHaveLength(0)
  })

  it('con todo completo se publica: «Guardar y publicar» guarda los datos y publica', async () => {
    const d = conPdf()
    Object.assign(d, { publicado: false, anio: null, descripcion: null, claves: ['Acceso'] })
    await abrir(d.id)
    expect(boton('Publicar')).toBeDisabled()

    fireEvent.change(campo(/^Año/), { target: { value: '2024' } })
    fireEvent.change(campo(/^Descripción/), { target: { value: ` ${DESCRIPCION_PRUEBA}\n` } })
    const claves = seisClaves(['Acceso'])
    for (const clave of claves.slice(1)) agregarPalabra(clave)
    // Con 6 ya no se pueden agregar más.
    expect(comboClaves()).toBeDisabled()
    const publicar = boton('Guardar y publicar')
    expect(publicar).toBeEnabled()
    expect(publicar).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText('Para publicarlo falta:')).not.toBeInTheDocument()

    await act(async () => fireEvent.click(publicar))
    expect(await screen.findByText(`Se guardó y publicó «${d.titulo}».`)).toBeInTheDocument()
    expect(api.mutaciones().map((p) => `${p.metodo} ${p.ruta.split('/').pop()}`)).toEqual([`PUT ${d.id}`, 'POST publicar'])
    expect(api.mutaciones()[0].cuerpo).toMatchObject({ anio: 2024, descripcion: DESCRIPCION_PRUEBA, claves })
    expect(api.documento(d.id).publicado).toBe(true)
    expect(screen.getByText('Publicado', { selector: '.ra-editor-estado .ra-estado' })).toBeInTheDocument()
  })

  it('si el servidor no deja publicar (409), lo explica en el panel de estado y el documento sigue despublicado', async () => {
    const d = conPdf()
    d.publicado = false
    const motivo = 'No se puede publicar todavía. Para publicar, el documento necesita 6 palabras clave (tiene 5).'
    api.forzar('POST', `/api/repositorio/admin/documentos/${d.id}/publicar`, error(409, 'conflicto', motivo))
    await abrir(d.id)
    // Para el formulario está completo: «Publicar» está habilitado y no hay ayuda.
    expect(boton('Publicar')).toBeEnabled()
    expect(faltasPublicar()).toEqual([])
    await act(async () => fireEvent.click(boton('Publicar')))
    const estado = screen.getByRole('region', { name: 'Estado' })
    expect(await within(estado).findByRole('alert')).toHaveTextContent(motivo)
    expect(api.mutaciones().map((p) => `${p.metodo} ${p.ruta.split('/').pop()}`)).toEqual(['POST publicar'])
    expect(api.documento(d.id).publicado).toBe(false)
    expect(within(estado).getByText('Despublicado', { selector: '.ra-estado' })).toBeInTheDocument()
    expect(boton('Publicar')).toBeEnabled()
  })

  it('un documento con 7 palabras clave (de antes del límite de 6) no se guarda hasta quitar una', async () => {
    const d = conPdf()
    d.claves = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete']
    await abrir(d.id)
    expect(comboClaves()).toBeDisabled()
    expect(comboClaves()).toHaveAttribute('placeholder', 'Máximo 6 palabras clave')
    expect(screen.getByText('7 de 6')).toBeInTheDocument()

    fireEvent.change(campo(/^Subtítulo/), { target: { value: 'Subtítulo corregido' } })
    fireEvent.click(boton('Guardar cambios'))
    const resumen = await screen.findByRole('alert')
    // El error de formato (más de 6) se muestra en lugar de «necesita 6 (tiene 7)».
    expect(resumen).toHaveTextContent('Revise un campo antes de guardar')
    expect(within(resumen).getByRole('link', { name: 'Palabras clave: Máximo 6 palabras clave.' })).toBeInTheDocument()
    expect(comboClaves()).toHaveAttribute('aria-invalid', 'true')
    expect(api.mutaciones()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Quitar «Siete»' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('6 de 6')).toBeInTheDocument()
    await act(async () => fireEvent.click(boton('Guardar cambios')))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(1)
    expect(api.mutaciones()[0]).toMatchObject({
      metodo: 'PUT',
      cuerpo: { subtitulo: 'Subtítulo corregido', claves: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis'] },
    })
    expect(api.documento(d.id).publicado).toBe(true)
  })
})

describe('borrado definitivo', () => {
  it('un documento publicado no se puede borrar: primero hay que despublicarlo', async () => {
    await abrir(conPdf().id)
    expect(screen.queryByText(/Borrar definitivamente/)).not.toBeInTheDocument()
    expect(screen.getByText('Para borrarlo definitivamente, primero despublíquelo.')).toBeInTheDocument()
  })

  it('pide escribir el identificador; con el correcto borra y vuelve al listado', async () => {
    const d = conPdf()
    d.publicado = false
    const { router } = await abrir(d.id)
    fireEvent.click(boton('Borrar definitivamente…'))
    const dialogo = screen.getByRole('alertdialog', { name: '¿Borrar definitivamente?' })
    const confirmar = within(dialogo).getByLabelText(/Para confirmar, escriba el identificador/)
    expect(confirmar).toHaveFocus()

    fireEvent.change(confirmar, { target: { value: 'otro-id' } })
    fireEvent.click(boton('Borrar definitivamente', dialogo))
    expect(within(dialogo).getByText(`Escriba exactamente «${d.id}» para confirmar.`)).toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(0)

    fireEvent.change(confirmar, { target: { value: d.id } })
    await act(async () => fireEvent.click(boton('Borrar definitivamente', dialogo)))
    await esperarTitulo('Documentos')
    expect(router.state.location.pathname).toBe('/repositorio/admin')
    const borrado = api.mutaciones()[0]
    expect(borrado).toMatchObject({ metodo: 'DELETE', ruta: `/api/repositorio/admin/documentos/${d.id}`, cuerpo: { confirmarId: d.id } })
    expect(borrado.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(api.documentos.some((x) => x.id === d.id)).toBe(false)
    expect(screen.getByText(`Se borró definitivamente «${d.titulo}».`)).toBeInTheDocument()
  })

  it('"Cancelar" y Esc cierran el diálogo sin borrar', async () => {
    const d = conPdf()
    d.publicado = false
    await abrir(d.id)
    fireEvent.click(boton('Borrar definitivamente…'))
    fireEvent.click(boton('Cancelar', screen.getByRole('alertdialog')))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.click(boton('Borrar definitivamente…'))
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(0)
  })
})

describe('cambios sin guardar', () => {
  it('al salir con cambios pide confirmación; "Seguir editando" se queda y "Salir sin guardar" sale', async () => {
    const d = conPdf()
    const { router } = await abrir(d.id)
    fireEvent.change(campo(/^Título/), { target: { value: 'Sin guardar' } })
    expect(screen.getByText('Hay cambios sin guardar.')).toBeInTheDocument()

    fireEvent.click(enlace('Documentos', document.querySelector<HTMLElement>('.ra-migas')!))
    const aviso = await screen.findByRole('alertdialog', { name: 'Hay cambios sin guardar' })
    fireEvent.click(boton('Seguir editando', aviso))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(campo(/^Título/)).toHaveValue('Sin guardar')
    expect(router.state.location.pathname).toBe(`/repositorio/admin/documentos/${d.id}`)

    fireEvent.click(enlace('Categorías', screen.getByRole('navigation', { name: 'Administración' })))
    fireEvent.click(boton('Salir sin guardar', await screen.findByRole('alertdialog')))
    expect(await esperarTitulo('Categorías')).toBeInTheDocument()
  })

  it('sin cambios no pregunta; "Descartar cambios" vuelve a lo guardado', async () => {
    const d = conPdf()
    await abrir(d.id)
    fireEvent.change(campo(/^Título/), { target: { value: 'Temporal' } })
    fireEvent.click(boton('Descartar cambios'))
    expect(campo(/^Título/)).toHaveValue(d.titulo)
    fireEvent.click(enlace('Documentos', document.querySelector<HTMLElement>('.ra-migas')!))
    expect(await esperarTitulo('Documentos')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('nuevo documento', () => {
  it('crea despublicado (POST) y pasa a la URL del documento nuevo', async () => {
    const { router } = renderAdmin('/repositorio/admin/documentos/nuevo')
    const titulo = await screen.findByLabelText(/^Título/, {}, { timeout: 3000 })
    expect(screen.getByRole('heading', { level: 1, name: 'Nuevo documento' })).toBeInTheDocument()
    expect(screen.getByText(/El documento se crea/)).toHaveTextContent('El documento se crea despublicado.')
    fireEvent.change(titulo, { target: { value: 'Boletín de prueba 2026' } })
    fireEvent.change(campo(/^Identificador/), { target: { value: 'boletin-prueba-2026' } })
    await act(async () => fireEvent.click(boton('Crear documento')))
    await waitFor(() => expect(router.state.location.pathname).toBe('/repositorio/admin/documentos/boletin-prueba-2026'))
    expect(api.mutaciones()[0]).toMatchObject({
      metodo: 'POST',
      ruta: '/api/repositorio/admin/documentos',
      cuerpo: { id: 'boletin-prueba-2026', titulo: 'Boletín de prueba 2026', categoria: 'Boletín', permiteDescarga: true },
    })
    expect(await screen.findByText('Se creó «Boletín de prueba 2026» (despublicado).')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar documento' })).toBeInTheDocument()
  })

  it('se crea aunque le falte lo necesario para publicar (es un borrador); después, «Publicar» dice qué falta', async () => {
    renderAdmin('/repositorio/admin/documentos/nuevo')
    const titulo = await screen.findByLabelText(/^Título/, {}, { timeout: 3000 })
    expect(campo(/^Descripción/)).toHaveValue('')
    expect(screen.getByText('0 / 30 palabras')).toBeInTheDocument()
    fireEvent.change(titulo, { target: { value: 'Borrador incompleto' } })
    fireEvent.change(campo(/^Descripción/), { target: { value: palabras(20) } })
    await act(async () => fireEvent.click(boton('Crear documento')))
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar documento' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.mutaciones()).toHaveLength(1)
    expect(api.mutaciones()[0]).toMatchObject({
      metodo: 'POST',
      cuerpo: { titulo: 'Borrador incompleto', descripcion: palabras(20), claves: [] },
    })

    expect(boton('Publicar')).toBeDisabled()
    expect(boton('Publicar')).toHaveAccessibleDescription(/^Para publicarlo falta:/)
    expect(new Set(faltasPublicar())).toEqual(
      new Set([
        'El archivo o una URL externa.',
        'La descripción tiene 20 palabras: para publicar debe tener entre 25 y 35 (se piden 30).',
        'Para publicar, el documento necesita 6 palabras clave (tiene 0).',
      ]),
    )
  })

  it('un identificador repetido (409) se explica sin perder lo escrito', async () => {
    api.forzar('POST', '/api/repositorio/admin/documentos', error(409, 'conflicto', 'Ya existe un documento con el identificador "boletin-1".'))
    renderAdmin('/repositorio/admin/documentos/nuevo')
    fireEvent.change(await screen.findByLabelText(/^Título/, {}, { timeout: 3000 }), { target: { value: 'Repetido' } })
    await act(async () => fireEvent.click(boton('Crear documento')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un documento con el identificador "boletin-1".')
    expect(campo(/^Título/)).toHaveValue('Repetido')
  })

  it('un documento que no existe muestra 404 sin "Intentar de nuevo"', async () => {
    renderAdmin('/repositorio/admin/documentos/no-existe')
    expect(await screen.findByText('Este documento no existe', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText('Intentar de nuevo')).not.toBeInTheDocument()
  })
})
