/** Textos fijos de la bienvenida del Asistente ODES. */

/** Preguntas de ejemplo que el repositorio puede responder (deserción, tránsito, Matrícula Cero, expectativas). */
export const SUGERENCIAS: readonly string[] = [
  '¿Cómo ha evolucionado la deserción de las personas beneficiarias de los programas de Sapiencia?',
  '¿Qué porcentaje de bachilleres de Medellín transita de inmediato a la educación superior?',
  '¿Cómo ha contribuido Matrícula Cero al acceso y la permanencia en la educación superior?',
  '¿Qué expectativas tienen los estudiantes de grado 11 para continuar sus estudios?',
]

/** Respuesta al nombre (también se anuncia al lector de pantalla). */
export function lineaDeBienvenida(nombre: string | null): string {
  return nombre ? `¡Mucho gusto, ${nombre}! ¿En qué te puedo ayudar?` : '¡Listo! ¿En qué te puedo ayudar?'
}
