import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { OdesController } from './odes.controller.js';
import { OdesService } from './odes.service.js';

describe('OdesController', () => {
  it('responde el nombre del sitio y del asistente', async () => {
    const modulo = await Test.createTestingModule({
      controllers: [OdesController],
      providers: [OdesService],
    }).compile();

    expect(modulo.get(OdesController).obtenerInformacion()).toEqual({
      sitio: 'odes',
      nombre: 'Asistente ODES',
    });
  });
});
