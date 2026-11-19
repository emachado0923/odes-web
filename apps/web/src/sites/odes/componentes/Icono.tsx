/** Icono de Material Symbols (fuente del kit). Decorativo: el texto del control da el nombre accesible. */
export default function Icono({ nombre, className }: { nombre: string; className?: string }) {
  return (
    <span className={className ? `material-symbols-outlined odes-icono ${className}` : 'material-symbols-outlined odes-icono'} aria-hidden="true">
      {nombre}
    </span>
  )
}
