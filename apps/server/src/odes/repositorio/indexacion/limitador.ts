/** Limita cuántas tareas asíncronas (procesos externos) corren a la vez. */
export class Limitador {
  private activas = 0;
  private readonly espera: (() => void)[] = [];

  constructor(private readonly maximo: number) {
    if (!Number.isInteger(maximo) || maximo < 1) {
      throw new RangeError('El límite de concurrencia debe ser un entero ≥ 1.');
    }
  }

  async ejecutar<T>(tarea: () => Promise<T>): Promise<T> {
    if (this.activas >= this.maximo) {
      // Quien termina le pasa su cupo directamente (activas no baja).
      await new Promise<void>((resolver) => this.espera.push(resolver));
    } else {
      this.activas += 1;
    }
    try {
      return await tarea();
    } finally {
      const siguiente = this.espera.shift();
      if (siguiente) siguiente();
      else this.activas -= 1;
    }
  }
}
