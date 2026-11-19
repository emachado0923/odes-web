import { Injectable } from '@nestjs/common';

export interface InformacionSivu {
  sitio: 'sivu';
  nombre: string;
}

@Injectable()
export class SivuService {
  obtenerInformacion(): InformacionSivu {
    return { sitio: 'sivu', nombre: 'Sistema de Visualización de Datos de Sapiencia' };
  }
}
