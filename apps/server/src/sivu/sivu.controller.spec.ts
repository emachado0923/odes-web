import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { SivuController } from './sivu.controller.js';
import { SivuService } from './sivu.service.js';

describe('SivuController', () => {
  it('responde la información del sitio (inyección por constructor)', async () => {
    const modulo = await Test.createTestingModule({
      controllers: [SivuController],
      providers: [SivuService],
    }).compile();

    expect(modulo.get(SivuController).obtenerInformacion()).toEqual({
      sitio: 'sivu',
      nombre: 'Sistema de Visualización de Datos de Sapiencia',
    });
  });
});
