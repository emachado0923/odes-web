/**
 * Fichas FICTICIAS con la forma real de las que arma etl_consulta.py (mismas
 * secciones, etiquetas y columnas de cada base), para pruebas y para ver la
 * ventanilla sin datos personales. Ninguna persona, documento, teléfono ni
 * correo de aquí existe. Documento de la primera persona: 999000111 (Fondo
 * EPM, Mejores Bachilleres, Enlaza Mundos y eventos); de la segunda: 999000222.
 */
import type { FichaFondos } from './tipos'

export const FICHAS_EJEMPLO: FichaFondos[] = [
  {
    "p": "EPM",
    "c": "2019-2",
    "n": "MARIA FERNANDA RESTREPO DE LA OSSA",
    "e": "NOTIFICADO",
    "s": [
      [
        "Beneficio",
        [
          [
            "Fondo",
            "EPM"
          ],
          [
            "Convocatoria",
            "2019-2"
          ],
          [
            "Estado general",
            "NOTIFICADO"
          ],
          [
            "Resolución reglamentaria",
            "Decreto 1643 de 2015"
          ],
          [
            "Operador financiero",
            "FIDUCIARIA BANCOLOMBIA"
          ],
          [
            "ID solicitud",
            "304512"
          ],
          [
            "Contrato",
            "4600012345"
          ],
          [
            "Contrato fiduciario",
            "FID-2019-0871"
          ],
          [
            "También en Mejores Bachilleres",
            "SI"
          ],
          [
            "También en Mejores Deportistas",
            "NO"
          ]
        ]
      ],
      [
        "Cierre y PACC",
        [
          [
            "Total desembolsado",
            "$ 33.060.000"
          ],
          [
            "Motivo de finalización",
            "Culmino periodos pactados"
          ],
          [
            "Fecha máxima del periodo de gracia",
            "2025-06-30"
          ],
          [
            "PACC",
            "SI"
          ],
          [
            "Fecha PACC",
            "2025-08-14"
          ]
        ]
      ],
      [
        "Datos personales",
        [
          [
            "Nombre",
            "MARIA FERNANDA RESTREPO DE LA OSSA"
          ],
          [
            "Tipo de documento",
            "CEDULA DE CIUDADANIA"
          ],
          [
            "Documento",
            "999000111"
          ],
          [
            "ID usuario TI",
            "48213"
          ],
          [
            "Celular",
            "3005550101"
          ],
          [
            "Celular alternativo",
            "3015550102"
          ],
          [
            "Teléfono",
            "6045550103"
          ],
          [
            "Correo",
            "maria.ficticia@ejemplo.org"
          ],
          [
            "Correo alternativo",
            "mf.restrepo@ejemplo.org"
          ],
          [
            "Municipio de residencia",
            "MEDELLIN"
          ],
          [
            "Comuna de residencia",
            "7 - ROBLEDO"
          ]
        ]
      ],
      [
        "Información académica",
        [
          [
            "IES de legalización",
            "UNIVERSIDAD DE ANTIOQUIA"
          ],
          [
            "Programa de legalización",
            "INGENIERIA DE SISTEMAS"
          ],
          [
            "IES actual",
            "INSTITUCION UNIVERSITARIA ITM"
          ],
          [
            "Programa actual",
            "INGENIERIA DE SOFTWARE"
          ],
          [
            "Semestres del programa",
            "10"
          ],
          [
            "Créditos del programa",
            "164"
          ]
        ]
      ]
    ],
    "t": [
      [
        "Historial por periodo",
        [
          "Periodo",
          "Estado",
          "Motivo",
          "Modalidad",
          "Giros realizados",
          "Giros pendientes",
          "Semestres a financiar",
          "Matrícula",
          "Sostenimiento",
          "Monto total"
        ],
        [
          [
            "2019-2",
            "ACTIVO",
            "Legalizado",
            "MATRICULA Y SOSTENIMIENTO",
            "1",
            "7",
            "8",
            "$ 2.535.000",
            "$ 1.300.000",
            "$ 3.835.000"
          ],
          [
            "2020-1",
            "ACTIVO",
            "Renovado",
            "MATRICULA Y SOSTENIMIENTO",
            "2",
            "6",
            "8",
            "$ 2.620.000",
            "$ 1.300.000",
            "$ 3.920.000"
          ],
          [
            "2020-2",
            "ACTIVO",
            "Renovado",
            "MATRICULA Y SOSTENIMIENTO",
            "3",
            "5",
            "8",
            "$ 2.705.000",
            "$ 1.300.000",
            "$ 4.005.000"
          ],
          [
            "2021-1",
            "SUSPENSION TEMPORAL",
            "No presentación oportuna de los documentos",
            "MATRICULA Y SOSTENIMIENTO",
            "3",
            "5",
            "8",
            "",
            "",
            ""
          ],
          [
            "2021-2",
            "ACTIVO",
            "Renovado",
            "MATRICULA Y SOSTENIMIENTO",
            "4",
            "4",
            "8",
            "$ 2.790.000",
            "$ 1.300.000",
            "$ 4.090.000"
          ],
          [
            "2022-1",
            "ACTIVO",
            "Renovado",
            "MATRICULA Y SOSTENIMIENTO",
            "5",
            "3",
            "8",
            "$ 2.875.000",
            "$ 1.300.000",
            "$ 4.175.000"
          ],
          [
            "2022-2",
            "ACTIVO",
            "Renovado",
            "MATRICULA Y SOSTENIMIENTO",
            "6",
            "2",
            "8",
            "$ 2.960.000",
            "$ 1.300.000",
            "$ 4.260.000"
          ],
          [
            "2023-1",
            "ACTIVO",
            "Renovado",
            "MATRICULA Y SOSTENIMIENTO",
            "7",
            "1",
            "8",
            "$ 3.045.000",
            "$ 1.300.000",
            "$ 4.345.000"
          ],
          [
            "2023-2",
            "ACTIVO",
            "Renovado",
            "MATRICULA Y SOSTENIMIENTO",
            "8",
            "0",
            "8",
            "$ 3.130.000",
            "$ 1.300.000",
            "$ 4.430.000"
          ],
          [
            "2024-1",
            "FINALIZACION",
            "Culmino periodos pactados",
            "MATRICULA Y SOSTENIMIENTO",
            "8",
            "0",
            "8",
            "",
            "",
            ""
          ],
          [
            "2024-2",
            "PERIODO DE GRACIA",
            "Periodo de gracia",
            "MATRICULA Y SOSTENIMIENTO",
            "8",
            "0",
            "8",
            "",
            "",
            ""
          ],
          [
            "2025-1",
            "PERIODO DE GRACIA",
            "Periodo de gracia",
            "MATRICULA Y SOSTENIMIENTO",
            "8",
            "0",
            "8",
            "",
            "",
            ""
          ],
          [
            "2025-2",
            "NOTIFICADO",
            "Paso al cobro a sapiencia",
            "MATRICULA Y SOSTENIMIENTO",
            "8",
            "0",
            "8",
            "",
            "",
            ""
          ]
        ]
      ]
    ]
  },
  {
    "p": "MB",
    "c": "2019-1",
    "n": "MARIA FERNANDA RESTREPO DE LA OSSA",
    "e": "GRADUADO",
    "s": [
      [
        "Beneficio",
        [
          [
            "Convocatoria",
            "2019-1"
          ],
          [
            "Estado general",
            "GRADUADO"
          ],
          [
            "Motivo del estado",
            "Entrega documentos de grado"
          ],
          [
            "Habilitado para renovar",
            "NO"
          ],
          [
            "Resolución de selección",
            "Resolución 0412 de 2019"
          ]
        ]
      ],
      [
        "Datos personales",
        [
          [
            "Nombre",
            "MARIA FERNANDA RESTREPO DE LA OSSA"
          ],
          [
            "Tipo de documento",
            "CC"
          ],
          [
            "Documento",
            "999000111"
          ],
          [
            "ID usuario TI",
            "48213"
          ],
          [
            "Celular",
            "3005550101"
          ],
          [
            "Teléfono fijo",
            "6045550103"
          ],
          [
            "Correo",
            "maria.ficticia@ejemplo.org"
          ],
          [
            "Municipio de residencia",
            "MEDELLIN"
          ],
          [
            "Comuna de residencia",
            "7 - ROBLEDO"
          ]
        ]
      ],
      [
        "Información académica",
        [
          [
            "IES actual",
            "UNIVERSIDAD NACIONAL DE COLOMBIA"
          ],
          [
            "Programa actual",
            "INGENIERIA DE SISTEMAS E INFORMATICA"
          ],
          [
            "Cambió de programa o universidad",
            "NO"
          ],
          [
            "Semestres del pregrado",
            "10"
          ],
          [
            "Créditos del pregrado",
            "172"
          ]
        ]
      ]
    ],
    "t": [
      [
        "Historial por periodo",
        [
          "Periodo",
          "Estado",
          "Modalidad",
          "Promedio acumulado",
          "Giros realizados",
          "Giros pendientes",
          "Giros proyectados",
          "Desembolsado en el periodo",
          "Total desembolsado"
        ],
        [
          [
            "2019-1",
            "ACTIVO",
            "PRESENCIAL",
            "4,10",
            "1",
            "9",
            "10",
            "$ 3.200.000",
            "$ 3.200.000"
          ],
          [
            "2019-2",
            "ACTIVO",
            "PRESENCIAL",
            "4,15",
            "2",
            "8",
            "10",
            "$ 3.200.000",
            "$ 6.400.000"
          ],
          [
            "2020-1",
            "ACTIVO",
            "PRESENCIAL",
            "4,20",
            "3",
            "7",
            "10",
            "$ 3.200.000",
            "$ 9.600.000"
          ],
          [
            "2020-2",
            "SUSPENSION VOLUNTARIA",
            "PRESENCIAL",
            "4,25",
            "3",
            "6",
            "10",
            "",
            "$ 9.600.000"
          ],
          [
            "2021-1",
            "ACTIVO",
            "PRESENCIAL",
            "4,30",
            "4",
            "5",
            "10",
            "$ 3.200.000",
            "$ 12.800.000"
          ],
          [
            "2021-2",
            "ACTIVO",
            "PRESENCIAL",
            "4,35",
            "5",
            "4",
            "10",
            "$ 3.200.000",
            "$ 16.000.000"
          ],
          [
            "2022-1",
            "GRADUADO",
            "PRESENCIAL",
            "4,40",
            "5",
            "3",
            "10",
            "",
            "$ 16.000.000"
          ]
        ]
      ]
    ]
  },
  {
    "p": "EM",
    "c": "2022-1",
    "n": "MARIA FERNANDA RESTREPO DE LA OSSA",
    "e": "CONDONACIÓN TOTAL",
    "s": [
      [
        "Beneficio",
        [
          [
            "Convocatoria",
            "2022-1"
          ],
          [
            "Modalidad",
            "PASANTIA DE INVESTIGACION"
          ],
          [
            "Estado",
            "CONDONACIÓN TOTAL"
          ],
          [
            "PACC",
            "NO"
          ],
          [
            "Operador financiero",
            "ICETEX"
          ]
        ]
      ],
      [
        "Datos personales",
        [
          [
            "Nombre",
            "MARIA FERNANDA RESTREPO DE LA OSSA"
          ],
          [
            "Tipo de documento",
            "CC"
          ],
          [
            "Documento",
            "999000111"
          ],
          [
            "Celular",
            "3005550101"
          ],
          [
            "Correo",
            "maria.ficticia@ejemplo.org"
          ],
          [
            "Municipio de residencia",
            "MEDELLIN"
          ],
          [
            "Comuna de residencia",
            "7 - ROBLEDO"
          ]
        ]
      ],
      [
        "Destino",
        [
          [
            "Universidad de destino",
            "UNIVERSIDAD POLITECNICA DE VALENCIA"
          ],
          [
            "País",
            "ESPAÑA"
          ],
          [
            "Programa en el exterior",
            "PASANTIA EN CIENCIA DE DATOS"
          ],
          [
            "Fecha de inicio",
            "2022-09-01"
          ],
          [
            "Fecha de terminación",
            "2023-02-28"
          ],
          [
            "Fecha límite de entrega de documentos",
            "2023-08-31"
          ],
          [
            "Total condonado",
            "$ 31.100.435"
          ]
        ]
      ]
    ],
    "t": [
      [
        "Historial por periodo",
        [
          "Periodo",
          "Estado",
          "Giro Sapiencia",
          "Giro 1 ICETEX",
          "Giro 2 ICETEX",
          "Giros realizados",
          "Desembolsado en el periodo"
        ],
        [
          [
            "2022-2",
            "CONDONACIÓN TOTAL",
            "$ 11.100.435",
            "$ 10.000.000",
            "$ 10.000.000",
            "3",
            "$ 31.100.435"
          ]
        ]
      ]
    ]
  },
  {
    "p": "EVENTOS",
    "c": "",
    "n": "",
    "e": "",
    "s": [],
    "t": [
      [
        "Historial de eventos",
        [
          "Fecha",
          "Periodo",
          "Evento",
          "Detalle",
          "Convocatoria",
          "Fondo",
          "Radicado PQRS"
        ],
        [
          [
            "2021-02-11",
            "2021-1",
            "Suspensión temporal",
            "No presentó la liquidación de matrícula dentro del plazo de renovación.",
            "2019-2",
            "EPM",
            ""
          ],
          [
            "2021-07-20",
            "2021-2",
            "Cambio de programa",
            "Pasa de Ingeniería de Sistemas (Universidad de Antioquia) a Ingeniería de Software (ITM). No afecta los giros proyectados.",
            "2019-2",
            "EPM",
            "202130045871"
          ],
          [
            "2022-06-30",
            "2022-1",
            "Estudiante obtiene grado",
            "Entrega acta de grado del pregrado.",
            "2019-1",
            "MB",
            "202230018822"
          ],
          [
            "2025-03-04",
            "2025-1",
            "Prórroga del periodo de gracia",
            "Se aprueba prórroga de seis meses por situación laboral.",
            "2019-2",
            "EPM",
            "202530009913"
          ]
        ]
      ]
    ]
  }
]

/** Una persona con un solo beneficio (el caso más común). */
export const FICHAS_EJEMPLO_UNA: FichaFondos[] = [
  {
    "p": "FA",
    "c": "2023-2",
    "n": "CARLOS ANDRES MUÑOZ GIRALDO",
    "e": "ACTIVO",
    "s": [
      [
        "Beneficio",
        [
          [
            "Convocatoria",
            "2023-2"
          ],
          [
            "Estado general",
            "ACTIVO"
          ],
          [
            "Estado del periodo",
            "ACTIVO"
          ],
          [
            "Habilitado para renovar",
            "SI"
          ],
          [
            "Operador financiero",
            "ICETEX"
          ],
          [
            "Contrato",
            "2023-0456"
          ],
          [
            "PACC",
            "NO"
          ]
        ]
      ],
      [
        "Datos personales",
        [
          [
            "Nombre",
            "CARLOS ANDRES MUÑOZ GIRALDO"
          ],
          [
            "Tipo de documento",
            "CC"
          ],
          [
            "Documento",
            "999000222"
          ],
          [
            "Celular",
            "3105550201"
          ],
          [
            "Correo",
            "carlos.ficticio@ejemplo.org"
          ],
          [
            "Municipio de residencia",
            "MEDELLIN"
          ],
          [
            "Comuna de residencia",
            "16 - BELEN"
          ]
        ]
      ],
      [
        "Información académica",
        [
          [
            "Universidad",
            "UNIVERSIDAD EAFIT"
          ],
          [
            "Programa",
            "MAESTRIA EN CIENCIAS DE LOS DATOS Y ANALITICA"
          ],
          [
            "Modalidad de estudio",
            "PRESENCIAL"
          ]
        ]
      ]
    ],
    "t": [
      [
        "Historial por periodo",
        [
          "Periodo",
          "Estado",
          "Modalidad",
          "Semestres del posgrado",
          "Giros pactados",
          "Giros realizados",
          "Giros pendientes",
          "Girado en el periodo",
          "Total desembolsado"
        ],
        [
          [
            "2023-2",
            "ACTIVO",
            "CONDONABLE",
            "4",
            "4",
            "1",
            "3",
            "$ 9.800.000",
            "$ 9.800.000"
          ],
          [
            "2024-1",
            "ACTIVO",
            "CONDONABLE",
            "4",
            "4",
            "2",
            "2",
            "$ 10.100.000",
            "$ 19.900.000"
          ],
          [
            "2024-2",
            "ACTIVO",
            "CONDONABLE",
            "4",
            "4",
            "3",
            "1",
            "$ 10.100.000",
            "$ 30.000.000"
          ],
          [
            "2025-1",
            "ACTIVO",
            "CONDONABLE",
            "4",
            "4",
            "4",
            "0",
            "$ 10.400.000",
            "$ 40.400.000"
          ]
        ]
      ]
    ]
  }
]

/**
 * Un beneficio ficticio de recorrido muy largo (de 2005-2 a 2026-3, con intersemestrales): el caso extremo
 * para la pista de periodos. Documento 999000333.
 */
export function fichaEjemploLarga(): FichaFondos {
  const filas: string[][] = []
  let giros = 0
  for (let anio = 2005; anio <= 2026; anio++) {
    for (const parte of [1, 2, 3]) {
      if (anio === 2005 && parte === 1) continue
      // Intersemestral solo algunos años, como en las bases.
      if (parte === 3 && anio % 4 !== 2) continue
      const estado =
        anio < 2011
          ? anio === 2008 && parte === 1
            ? 'SUSPENSION ESPECIAL'
            : 'ACTIVO'
          : anio < 2012
            ? 'FINALIZACION'
            : anio < 2014
              ? 'PERIODO DE GRACIA'
              : anio < 2016
                ? 'PROCESO DE CONSOLIDACION'
                : anio < 2025
                  ? 'NOTIFICADO'
                  : 'CANCELACION'
      const monto = estado === 'ACTIVO' ? 1_850_000 + (anio - 2005) * 140_000 + parte * 35_000 : 0
      if (monto > 0) giros++
      filas.push([
        `${anio}-${parte}`,
        estado,
        estado === 'ACTIVO' ? 'Renovado' : '',
        'MATRICULA',
        String(giros),
        String(Math.max(0, 12 - giros)),
        '12',
        monto > 0 ? `$ ${new Intl.NumberFormat('es-CO').format(monto)}` : '',
        '',
        monto > 0 ? `$ ${new Intl.NumberFormat('es-CO').format(monto)}` : '',
      ])
    }
  }
  return {
    p: 'PUAP PP',
    c: '2005-2',
    n: 'JOSE MARIA DE LOS ANGELES FERNANDEZ DE CORDOBA Y MONTOYA',
    e: 'NO ACTIVO',
    s: [
      ['Beneficio', [['Fondo', 'PUAP PP'], ['Convocatoria', '2005-2'], ['Estado general', 'NO ACTIVO'], ['Operador financiero', 'FIDUCIARIA DE PRUEBA']]],
      [
        'Datos personales',
        [
          ['Nombre', 'JOSE MARIA DE LOS ANGELES FERNANDEZ DE CORDOBA Y MONTOYA'],
          ['Tipo de documento', 'CC'],
          ['Documento', '999000333'],
          ['Correo', 'un.correo.electronico.verdaderamente.largo.de.prueba@dominio-institucional-ficticio.edu.co'],
          ['Municipio de residencia', 'MEDELLIN'],
          ['Comuna de residencia', '80 - SAN ANTONIO DE PRADO'],
        ],
      ],
      [
        'Información académica',
        [
          ['IES actual', 'INSTITUCION UNIVERSITARIA COLEGIO MAYOR DE ANTIOQUIA'],
          ['Programa actual', 'TECNOLOGIA EN GESTION DE SERVICIOS GASTRONOMICOS Y ADMINISTRACION DE EMPRESAS TURISTICAS'],
        ],
      ],
    ],
    t: [
      [
        'Historial por periodo',
        ['Periodo', 'Estado', 'Motivo', 'Modalidad', 'Giros realizados', 'Giros pendientes', 'Semestres a financiar', 'Matrícula', 'Sostenimiento', 'Monto total'],
        filas,
      ],
    ],
  }
}
