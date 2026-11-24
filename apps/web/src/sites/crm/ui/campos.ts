/**
 * Atributos que el control dentro de <Campo> debe llevar para quedar unido a
 * su ayuda y a su error (los ids que pinta Campo: `${id}-ayuda` y
 * `${id}-error`):
 *
 *   <Campo etiqueta="Título" id="titulo" ayuda="…" error={errores.titulo}>
 *     <input className="crm-control" {...ariaCampo('titulo', { ayuda: '…', error: errores.titulo })} />
 *   </Campo>
 */
export function ariaCampo(
  id: string,
  { ayuda, error }: { ayuda?: string | null; error?: string | null } = {},
): { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true } {
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(' ')
  return {
    id,
    ...(describe ? { 'aria-describedby': describe } : {}),
    ...(error ? { 'aria-invalid': true as const } : {}),
  }
}
