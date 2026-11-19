import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { urlsMiniatura } from '../chat/enlaces'
import type { DocumentoResumen } from '../chat/protocolo'
import Miniatura from './Miniatura'

const BASE: DocumentoResumen = {
  id: 'boletin-19-fe-erratas-boletin-n-19-2021',
  titulo: 'Fe de erratas del Boletín N.º 19',
  categoria: 'Boletín',
  anio: '2021',
  idioma: 'es',
  tipo: 'pdf',
  url: '/api/repositorio/documentos/boletin-19-fe-erratas-boletin-n-19-2021/ver',
}
const DESDE_BD = '/api/repositorio/documentos/boletin-19-fe-erratas-boletin-n-19-2021/miniatura?v=0123456789abcdef'
const ESTATICA = '/odes/portadas/boletin-19-fe-erratas-boletin-n-19-2021.webp'

const imagen = (contenedor: HTMLElement) => contenedor.querySelector('img')

describe('urlsMiniatura', () => {
  it('prefiere la miniatura de la base y luego la estática, sin repetir', () => {
    expect(urlsMiniatura({ urlMiniatura: DESDE_BD, portada: `${BASE.id}.webp` })).toEqual([DESDE_BD, ESTATICA])
    expect(urlsMiniatura({ portada: `${BASE.id}.webp` })).toEqual([ESTATICA])
    expect(urlsMiniatura({ urlMiniatura: ESTATICA, portada: `${BASE.id}.webp` })).toEqual([ESTATICA])
    expect(urlsMiniatura({})).toEqual([])
  })

  it('descarta URL que no son http(s) ni relativas y nombres de portada con rutas', () => {
    expect(urlsMiniatura({ urlMiniatura: 'javascript:alert(1)', portada: '../secreto.webp' })).toEqual([])
    expect(urlsMiniatura({ urlMiniatura: 'data:image/png;base64,AAAA' })).toEqual([])
  })
})

describe('Miniatura', () => {
  it('usa la miniatura de la base; si no carga, la estática; si tampoco, el icono del tipo', () => {
    const { container } = render(<Miniatura documento={{ ...BASE, urlMiniatura: DESDE_BD, portada: `${BASE.id}.webp` }} />)
    expect(imagen(container)).toHaveAttribute('src', DESDE_BD)
    expect(imagen(container)).toHaveAttribute('alt', '')

    fireEvent.error(imagen(container)!)
    expect(imagen(container)).toHaveAttribute('src', ESTATICA)

    fireEvent.error(imagen(container)!)
    expect(imagen(container)).toBeNull()
    expect(container.querySelector('.odes-miniatura--vacia')).toHaveAttribute('aria-hidden', 'true')
  })

  it('un índice anterior (solo portada) sigue usando /odes/portadas/', () => {
    const { container } = render(<Miniatura documento={{ ...BASE, portada: `${BASE.id}.webp` }} />)
    expect(imagen(container)).toHaveAttribute('src', ESTATICA)
  })

  it('vuelve a probar desde la primera si cambia el documento', () => {
    const { container, rerender } = render(<Miniatura documento={{ ...BASE, urlMiniatura: DESDE_BD }} />)
    fireEvent.error(imagen(container)!)
    expect(imagen(container)).toBeNull()
    const otra = '/api/repositorio/documentos/otro/miniatura?v=fedcba9876543210'
    rerender(<Miniatura documento={{ ...BASE, id: 'otro', urlMiniatura: otra }} />)
    expect(imagen(container)).toHaveAttribute('src', otra)
  })
})
