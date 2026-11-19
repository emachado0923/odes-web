import { Injectable } from '@nestjs/common';
import { NOMBRE_ASISTENTE } from './chat/protocolo.js';

export interface InformacionOdes {
  sitio: 'odes';
  nombre: typeof NOMBRE_ASISTENTE;
}

@Injectable()
export class OdesService {
  obtenerInformacion(): InformacionOdes {
    return { sitio: 'odes', nombre: NOMBRE_ASISTENTE };
  }
}
