import { Link } from 'react-router'

/**
 * Migas de pan: de dónde viene la página. Los elementos con `href` son
 * enlaces; el último (la página actual) va sin enlace y con aria-current.
 */
export default function Migas({ items }: { items: { texto: string; href?: string }[] }) {
  if (items.length === 0) return null
  return (
    <nav className="crm-migas" aria-label="Migas de pan">
      <ol>
        {items.map((item, i) => {
          const ultima = i === items.length - 1
          return (
            <li key={`${i}-${item.texto}`}>
              {item.href && !ultima ? (
                <Link to={item.href}>{item.texto}</Link>
              ) : (
                <span aria-current={ultima ? 'page' : undefined}>{item.texto}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
