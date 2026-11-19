import { describe, expect, it } from 'vitest';
import { crearOpcionesHelmet } from './opciones-helmet.js';

describe('crearOpcionesHelmet', () => {
  it("con 'self' mantiene X-Frame-Options: SAMEORIGIN", () => {
    expect(crearOpcionesHelmet(["'self'"]).xFrameOptions).toEqual({
      action: 'sameorigin',
    });
  });

  it("con 'none' usa X-Frame-Options: DENY", () => {
    expect(crearOpcionesHelmet(["'none'"]).xFrameOptions).toEqual({
      action: 'deny',
    });
  });

  it('con otros orígenes desactiva X-Frame-Options y los pasa a frame-ancestors', () => {
    const opciones = crearOpcionesHelmet([
      "'self'",
      'https://www.sapiencia.gov.co',
    ]);
    expect(opciones.xFrameOptions).toBe(false);
    const csp = opciones.contentSecurityPolicy;
    expect(
      csp && typeof csp === 'object' && csp.directives?.frameAncestors,
    ).toEqual(["'self'", 'https://www.sapiencia.gov.co']);
  });
});
