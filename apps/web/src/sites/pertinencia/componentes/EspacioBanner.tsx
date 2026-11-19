/**
 * ESPACIO PARA EL BANNER (marcador de posición, como en el diseño).
 *
 * Cuando llegue el banner, reemplaza el contenido de este componente (o el
 * componente entero en paginas/PaginaPertinencia.tsx) por la imagen o el
 * componente del banner. El marco punteado (.pe-espacio-banner) mantiene la
 * proporción del diseño (935 × 207 en escritorio) para que la página no
 * salte cuando se cambie.
 */
export default function EspacioBanner() {
  return (
    <div className="pe-espacio-banner" data-espacio="banner">
      <p className="pe-espacio-banner-texto">Espacio para el banner</p>
    </div>
  )
}
