#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convierte la base de inscritos de la convocatoria de pregrado de Sapiencia en
el módulo de datos del tablero.

    python3 etl_convocatoria.py BASE_2027-1.xlsx [OTRA_BASE.xlsx ...] datos

Cada archivo de Excel corresponde a una convocatoria. El periodo (2027-1) se
toma de la columna _123_Convocatoria y, si no está, del nombre del archivo. El
último argumento, si no termina en .xlsx, es la carpeta de salida. La salida es
`datos/convocatoria.js`, un módulo que declara `window.ODES.convocatoria` con
cuatro bloques:

    meta    convocatorias, totales, fechas de inscripción y de generación
    dim     diccionarios de convocatorias, instituciones, programas, comunas
            y categorías de cada variable
    filas   una fila por combinación de atributos, con el conteo de inscritos
    perfil  características protegidas (Sisbén, víctimas, grupo étnico,
            discapacidad y prueba Saber 11), agregadas por convocatoria,
            fuente de financiación, estado del formulario, sexo y grupo de edad

Los atributos que dependen del programa (institución, nivel de formación y
modalidad) viven en el diccionario de programas y no se repiten en cada fila.

La base trae también la verificación de requisitos, los impedimentos, la
admisión en cada fondo y el puntaje. El tablero no presenta esa información y
el script no la lee.

Reserva estadística. El módulo no lleva nombres, documentos, direcciones,
teléfonos, correos, barrios, fechas de nacimiento ni la edad exacta. Las
características protegidas no se cruzan con la comuna, la institución ni el
programa: van aparte, en `perfil`, y en los grupos de menos de RESERVA
inscritos su distribución se reemplaza por la categoría «reservado» (-1).

El script solo necesita openpyxl.
"""

import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime

try:
    from openpyxl import load_workbook
except ImportError:                                          # pragma: no cover
    sys.exit('Falta openpyxl. Instálelo con: pip install openpyxl')


RESERVA = 10

# --------------------------------------------------------------------------- #
#  Columnas de la base                                                        #
# --------------------------------------------------------------------------- #
# Nombre corto que usa el script y nombre de la columna en la base. Si alguna
# falta, el script se detiene y dice cuál.

COLUMNAS = {
    'numero': 'periodo',
    'convocatoria': '_123_Convocatoria',
    'ff_ro': '_1_FF_RecursoOrdinario',
    'ff_pp': '_1_FF_RecursoPresupuestoParticipativo',
    'edad': '_6_Edad',
    'sexo': '_7_SexoBiológico',
    'comuna': '_22_ComunaOCorregimientoResidencia',
    'estrato': '_29_EstratoViviendaDondeReside',
    'estrato_pp': '29a_EstratoViviendaDondeReside_PP',
    'sisben': '_30_PuntajeSisbén',
    'discapacidad': '_70_CondiciónDiscapacidadCertificada',
    'victima': '_74_VíctimaYReconocidoRegistroÚnicoVíctimas',
    'etnico': '_77_PerteneceGrupoÉtnico',
    'fecha': '_fechaRegistro_B1',
    'colegio': 'TIPO_ESTABLECIMIENTO',
    'grado': '_97_AñoGraduaciónEducaciónMedia',
    'prueba': '_100_PeríodoPresentóPruebasEstado',
    'percentil': '_101_PuestoPuntajePercentilPruebasICFESSaber',
    'mcero': '_124_BeneficiarioMatrículaCeroDistritoMedellín',
    'ies_mc': '_125_IES_PúblicaAdelantaFormaciónProfesionalMatrículaCero',
    'prog_mc': '_126_NombrePregradoEstudiandoMatrículaCero',
    'ies_otra': '_130_IES_AspiraIngresarEstaEstudiando',
    'prog_otra': '_131_ProgramaAcadémicoCursarOCursando_IES',
    'nivel': 'MOD_PROG',
    'semestre': '_133_SemestreAcadémicoCursaráPeríodo',
    'estado': 'Estado_Formulario_Fase_1',
    'ubicacion': '_93_CiudadUbicaciónColegioBachiller',
    'titulo_univ': '_102_PoseeTítuloUniversitarioOLicenciado',
    'titulo_tecnologo': '_103_PoseeTítuloTecnólogo',
    'titulo_tecnico': '_104_PoseeTítuloTécnicoProfesional',
    'medio': 'Como_se_entero_de_la_convocatoria',
}

# --------------------------------------------------------------------------- #
#  Nombres de las instituciones                                               #
# --------------------------------------------------------------------------- #
# La base entrega los nombres en mayúscula sostenida, sin tildes y con la sigla
# pegada. Este diccionario fija la denominación que se muestra, la forma corta
# de las etiquetas y el sector (el del SNIES). La llave es el nombre tal como
# llega en la base. Una institución que no esté aquí se rotula con su nombre en
# formato de título, con sector «Sin información», y no interrumpe la ejecución.

IES = {
    'UNIVERSIDAD CATOLICA LUIS AMIGO':
        ('Universidad Católica Luis Amigó', 'Luis Amigó', 'Privado'),
    'UNIVERSIDAD DE MEDELLIN':
        ('Universidad de Medellín', 'U. de Medellín', 'Privado'),
    'UNIVERSIDAD EAFIT':
        ('Universidad EAFIT', 'EAFIT', 'Privado'),
    'UNIVERSIDAD PONTIFICIA BOLIVARIANA':
        ('Universidad Pontificia Bolivariana', 'UPB', 'Privado'),
    'UNIVERSIDAD CES':
        ('Universidad CES', 'CES', 'Privado'),
    'UNIVERSIDAD COOPERATIVA DE COLOMBIA':
        ('Universidad Cooperativa de Colombia', 'UCC', 'Privado'),
    'POLITECNICO GRANCOLOMBIANO':
        ('Politécnico Grancolombiano', 'Grancolombiano', 'Privado'),
    'UNIVERSIDAD DE ANTIOQUIA':
        ('Universidad de Antioquia', 'U. de Antioquia', 'Oficial'),
    'CORPORACION UNIVERSITARIA MINUTO DE DIOS - UNIMINUTO':
        ('Corporación Universitaria Minuto de Dios', 'Uniminuto', 'Privado'),
    'FUNDACION UNIVERSITARIA MARIA CANO':
        ('Fundación Universitaria María Cano', 'María Cano', 'Privado'),
    'UNIVERSIDAD DE SAN BUENAVENTURA':
        ('Universidad de San Buenaventura', 'San Buenaventura', 'Privado'),
    'UNIVERSIDAD EIA':
        ('Universidad EIA', 'EIA', 'Privado'),
    'CORPORACION UNIVERSITARIA REMINGTON':
        ('Corporación Universitaria Remington', 'Remington', 'Privado'),
    'TECNOLOGICO DE ANTIOQUIA':
        ('Tecnológico de Antioquia', 'T. de Antioquia', 'Oficial'),
    'INSTITUCION UNIVERSITARIA - ITM':
        ('Instituto Tecnológico Metropolitano', 'ITM', 'Oficial'),
    'UNIVERSIDAD AUTONOMA LATINOAMERICANA - UNAULA':
        ('Universidad Autónoma Latinoamericana', 'UNAULA', 'Privado'),
    'INSTITUCION UNIVERSITARIA VISION DE LAS AMERICAS':
        ('Institución Universitaria Visión de las Américas', 'Visión Américas', 'Privado'),
    'FUNDACION UNIVERSITARIA - CEIPA':
        ('Fundación Universitaria CEIPA', 'CEIPA', 'Privado'),
    'INSTITUCION UNIVERSITARIA SALAZAR Y HERRERA':
        ('Institución Universitaria Salazar y Herrera', 'Salazar y Herrera', 'Privado'),
    'UNIVERSIDAD NACIONAL DE COLOMBIA':
        ('Universidad Nacional de Colombia', 'UNAL', 'Oficial'),
    'FUNDACION UNIVERSITARIA ESUMER':
        ('Fundación Universitaria Esumer', 'Esumer', 'Privado'),
    'POLITECNICO COLOMBIANO JAIME ISAZA CADAVID':
        ('Politécnico Colombiano Jaime Isaza Cadavid', 'Politécnico JIC', 'Oficial'),
    'FUNDACION UNIVERSITARIA SAN MARTIN':
        ('Fundación Universitaria San Martín', 'San Martín', 'Privado'),
    'INSTITUCION UNIVERSITARIA ESCOLME':
        ('Institución Universitaria Escolme', 'Escolme', 'Privado'),
    'INSTITUCION UNIVERSITARIA PASCUAL BRAVO':
        ('Institución Universitaria Pascual Bravo', 'Pascual Bravo', 'Oficial'),
    'CORPORACION UNIVERSITARIA ADVENTISTA - UNAC':
        ('Corporación Universitaria Adventista', 'UNAC', 'Privado'),
    'COLEGIO MAYOR DE ANTIOQUIA':
        ('Institución Universitaria Colegio Mayor de Antioquia', 'Colegio Mayor', 'Oficial'),
    'INSTITUCION UNIVERSITARIA DIGITAL DE ANTIOQUIA -IU. DIGITAL':
        ('Institución Universitaria Digital de Antioquia', 'IU Digital', 'Oficial'),
    'FUNDACION UNIVERSITARIA BELLAS ARTES':
        ('Fundación Universitaria Bellas Artes', 'Bellas Artes', 'Privado'),
    'CORPORACION UNIVERSITARIA AMERICANA':
        ('Corporación Universitaria Americana', 'Americana', 'Privado'),
    'CORPORACION COLEGIATURA COLOMBIANA':
        ('Corporación Colegiatura Colombiana', 'Colegiatura', 'Privado'),
    'FUNDACION UNIVERSITARIA CATOLICA DEL NORTE':
        ('Fundación Universitaria Católica del Norte', 'Católica del Norte', 'Privado'),
    'CORPORACION UNIVERSITARIA U DE COLOMBIA':
        ('Corporación Universitaria U de Colombia', 'U de Colombia', 'Privado'),
    'UNIVERSIDAD ECCI':
        ('Universidad ECCI', 'ECCI', 'Privado'),
    'CORPORACION UNIFICADA NACIONAL DE EDUCACION SUPERIOR - CUN':
        ('Corporación Unificada Nacional de Educación Superior', 'CUN', 'Privado'),
    'UNIVERSIDAD SANTO TOMAS':
        ('Universidad Santo Tomás', 'Santo Tomás', 'Privado'),
    'UNIVERSIDAD NACIONAL ABIERTA Y A DISTANCIA UNAD':
        ('Universidad Nacional Abierta y a Distancia', 'UNAD', 'Oficial'),
    'FUNDACION UNIVERSITARIA DEL AREA ANDINA':
        ('Fundación Universitaria del Área Andina', 'Área Andina', 'Privado'),
    'UNIVERSIDAD ANTONIO NARIÑO':
        ('Universidad Antonio Nariño', 'Antonio Nariño', 'Privado'),
    'INSTITUCION UNIVERSITARIA MARCO FIDEL SUAREZ - IUMAFIS':
        ('Institución Universitaria Marco Fidel Suárez', 'Marco Fidel Suárez', 'Oficial'),
    'CORPORACION UNIVERSITARIA DE SABANETA - UNISABANETA':
        ('Corporación Universitaria de Sabaneta', 'Unisabaneta', 'Privado'),
    'FUNDACION UNIVERSITARIA SEMINARIO BIBLICO DE COLOMBIA - FUSBC':
        ('Fundación Universitaria Seminario Bíblico de Colombia', 'FUSBC', 'Privado'),
    'UNIVERSIDAD EAN':
        ('Universidad EAN', 'EAN', 'Privado'),
    'ESCUELA SUPERIOR DE ADMINISTRACION PUBLICA - ESAP':
        ('Escuela Superior de Administración Pública', 'ESAP', 'Oficial'),
}

SIN_IES = 'Sin institución registrada'
SIN_PROGRAMA = 'Sin programa registrado'
SIN_DATO = 'Sin información'

# Palabras de los nombres de programa que la base escribe sin tilde. La lista
# se armó con la forma que usa el SNIES para los mismos programas; una palabra
# nueva sin tilde queda como llega.
TILDES = {
    'ADMINISTRACION': 'Administración', 'AERONAUTICA': 'Aeronáutica',
    'AERONAUTICAS': 'Aeronáuticas', 'AERONAUTICO': 'Aeronáutico',
    'AGRICOLA': 'Agrícola', 'AGRONOMICA': 'Agronómica', 'ANALISIS': 'Análisis',
    'ANALITICA': 'Analítica', 'ANIMACION': 'Animación',
    'ANTROPOLOGIA': 'Antropología', 'ARCHIVISTICA': 'Archivística',
    'ARQUITECTONICOS': 'Arquitectónicos', 'ARTISTICA': 'Artística',
    'ASTRONOMIA': 'Astronomía', 'ATENCION': 'Atención',
    'AUTOMATIZACION': 'Automatización', 'BACTERIOLOGIA': 'Bacteriología',
    'BASICA': 'Básica', 'BIBLIOTECOLOGIA': 'Bibliotecología',
    'BIOANALISIS': 'Bioanálisis', 'BIOINGENIERIA': 'Bioingeniería',
    'BIOLOGIA': 'Biología', 'BIOLOGICA': 'Biológica', 'BIOMEDICA': 'Biomédica',
    'BIOTECNOLOGIA': 'Biotecnología', 'BIOTECNOLOGICA': 'Biotecnológica',
    'CIBERNETICOS': 'Cibernéticos', 'CIENTIFICA': 'Científica',
    'CLINICO': 'Clínico', 'COMPUTACION': 'Computación',
    'COMUNICACION': 'Comunicación', 'CONSTRUCCION': 'Construcción',
    'CONTADURIA': 'Contaduría', 'CREACION': 'Creación',
    'CRIMINALISTICA': 'Criminalística', 'CRIMINOLOGIA': 'Criminología',
    'DIETETICA': 'Dietética', 'DIRECCION': 'Dirección', 'ECONOMIA': 'Economía',
    'EDUCACION': 'Educación', 'ELECTRICA': 'Eléctrica',
    'ELECTROMECANICA': 'Electromecánica', 'ELECTROMECANICOS': 'Electromecánicos',
    'ELECTRONICA': 'Electrónica', 'ENERGIA': 'Energía', 'ENFASIS': 'Énfasis',
    'ENFERMERIA': 'Enfermería', 'ESTADISTICA': 'Estadística',
    'ESTRATEGICO': 'Estratégico', 'FARMACEUTICA': 'Farmacéutica',
    'FILOLOGIA': 'Filología', 'FILOSOFIA': 'Filosofía', 'FISICA': 'Física',
    'FONOAUDIOLOGIA': 'Fonoaudiología', 'FOTOGRAFIA': 'Fotografía',
    'FRANCES': 'Francés', 'FUTBOL': 'Fútbol', 'GASTRONOMIA': 'Gastronomía',
    'GASTRONOMICOS': 'Gastronómicos', 'GEOLOGIA': 'Geología',
    'GEOLOGICA': 'Geológica', 'GESTION': 'Gestión', 'GRAFICA': 'Gráfica',
    'GRAFICO': 'Gráfico', 'HABITAT': 'Hábitat', 'HISPANICA': 'Hispánica',
    'IMPLEMENTACION': 'Implementación', 'INFORMACION': 'Información',
    'INFORMATICA': 'Informática', 'INFORMATICOS': 'Informáticos',
    'INGENIERIA': 'Ingeniería', 'INGLES': 'Inglés', 'INNOVACION': 'Innovación',
    'INSTRUMENTACION': 'Instrumentación', 'INVESTIGACION': 'Investigación',
    'LOGISTICA': 'Logística', 'LOGISTICOS': 'Logísticos',
    'MATEMATICA': 'Matemática', 'MATEMATICAS': 'Matemáticas',
    'MECANICA': 'Mecánica', 'MECATRONICA': 'Mecatrónica',
    'MECATRONICO': 'Mecatrónico', 'MICROBIOLOGIA': 'Microbiología',
    'MOVILES': 'Móviles', 'MUSICA': 'Música', 'NANOTECNOLOGIA': 'Nanotecnología',
    'NUTRICION': 'Nutrición', 'ODONTOLOGIA': 'Odontología',
    'OPTOMETRIA': 'Optometría', 'PANIFICACION': 'Panificación',
    'PEDAGOGIA': 'Pedagogía', 'PETROLEOS': 'Petróleos',
    'PLANEACION': 'Planeación', 'PLASTICAS': 'Plásticas', 'POLITICA': 'Política',
    'POLITICAS': 'Políticas', 'PRODUCCION': 'Producción',
    'PROGRAMACION': 'Programación', 'PROTESIS': 'Prótesis',
    'PSICOLOGIA': 'Psicología', 'PUBLICA': 'Pública', 'QUIMICA': 'Química',
    'QUIRURGICA': 'Quirúrgica', 'REALIZACION': 'Realización',
    'RECREACION': 'Recreación', 'REPOSTERIA': 'Repostería',
    'ROBOTICA': 'Robótica', 'SISTEMATIZACION': 'Sistematización',
    'SOCIOLOGIA': 'Sociología', 'TECNICA': 'Técnica', 'TECNICO': 'Técnico',
    'TECNOLOGIA': 'Tecnología', 'TECNOLOGICA': 'Tecnológica',
    'TEOLOGIA': 'Teología', 'TRADUCCION': 'Traducción', 'TRANSITO': 'Tránsito',
    'TURISTICA': 'Turística', 'TURISTICAS': 'Turísticas',
}

# Errores de digitación de la base que se corrigen al rotular.
CORRECCIONES = {'INDURSTIAL': 'INDUSTRIAL'}

MINUSCULAS = {'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a',
              'con', 'para', 'por', 'al', 'o', 'u', 'como', 'sin', 'sobre'}

SIGLAS = {'TIC', 'TICS', 'SST', 'BIM', 'ERP', 'UX', 'UI', 'NIIF', 'CAD',
          'I', 'II', 'III', 'IV'}

# La base reporta seis modalidades. Como en el tablero de matrícula, se reducen
# a las tres del registro calificado: la que incluye componente presencial se
# cuenta como presencial y la virtual dual como virtual.
MODALIDADES = {
    'PRESENCIAL': 'Presencial',
    'PRESENCIAL-VIRTUAL': 'Presencial',
    'HIBRIDA (PRESENCIAL-VIRTUAL)': 'Presencial',
    'VIRTUAL': 'Virtual',
    'VIRTUAL-DUAL': 'Virtual',
    'A DISTANCIA': 'A distancia',
}

NIVELES = {
    'UNIVERSITARIA': 'Universitaria',
    'TECNOLOGICA': 'Tecnológica',
    'FORMACION TECNICA PROFESIONAL': 'Técnica profesional',
}

# Comunas y corregimientos con el código de la base. El 00 («No aplica») agrupa
# a quienes residen fuera de Medellín.
COMUNAS = [
    ('01', 'Popular'), ('02', 'Santa Cruz'), ('03', 'Manrique'),
    ('04', 'Aranjuez'), ('05', 'Castilla'), ('06', 'Doce de Octubre'),
    ('07', 'Robledo'), ('08', 'Villa Hermosa'), ('09', 'Buenos Aires'),
    ('10', 'La Candelaria'), ('11', 'Laureles-Estadio'), ('12', 'La América'),
    ('13', 'San Javier'), ('14', 'El Poblado'), ('15', 'Guayabal'),
    ('16', 'Belén'), ('50', 'San Sebastián de Palmitas'),
    ('60', 'San Cristóbal'), ('70', 'Altavista'),
    ('80', 'San Antonio de Prado'), ('90', 'Santa Elena'),
    ('00', 'Otros municipios'),
]
ZONAS = ['Comunas', 'Corregimientos', 'Otros municipios']

MEDIOS = {
    'Recomendación de un conocido': 'Recomendación de un conocido',
    'Medios de comunicación digitales': 'Medios de comunicación digitales',
    'Instagram': 'Instagram',
    'Personal de Sapiencia': 'Personal de Sapiencia',
    'Otro ¿cual?': 'Otro medio',
    'Facebook': 'Facebook',
    'Tiktok': 'TikTok',
    'Stand informativo en algún lugar de la ciudad': 'Punto informativo en la ciudad',
    'Medios de comunicación tradicionales (radio, televisión, prensa)':
        'Radio, televisión o prensa',
    'Linkedin': 'LinkedIn',
    'X anteriormente Twitter': 'X, antes Twitter',
}

ESTADOS = {'completo': 'Completo', 'incompleto': 'Incompleto'}

COLEGIOS = {'OFICIAL': 'Oficial', 'NO OFICIAL': 'No oficial',
            'COBERTURA CONTRATADA': 'Cobertura contratada'}

FUENTES = ['Solo presupuesto participativo', 'Ambas fuentes',
           'Solo recursos ordinarios', SIN_DATO]

# Sexo biológico: la tercera categoría agrupa las demás respuestas (en 2027-1,
# «Intersexual» y «Prefiere no responder»).
SEXOS = ['Mujer', 'Hombre', 'Otro género']
EDADES = ['14 a 17 años', '18 a 21 años', '22 a 28 años', '29 años o más', SIN_DATO]
ESTRATOS = ['Estrato %d' % i for i in range(1, 7)] + [SIN_DATO]
SEMESTRES = ['Primer semestre', 'Segundo a cuarto semestre',
             'Quinto semestre o superior', SIN_DATO]
UBICACIONES = {'Medellín': 'Medellín', 'Otra': 'Otro municipio'}

# Títulos de educación superior que la persona ya tiene. Se guardan como bits
# en el orden de esta lista; el valor TITULOS_SIN_DATO marca a quien no
# respondió las tres preguntas.
TITULOS = [('titulo_tecnico', 'Técnico profesional'), ('titulo_tecnologo', 'Tecnólogo'),
           ('titulo_univ', 'Universitario o licenciatura')]
TITULOS_SIN_DATO = 8

# Características protegidas: van solo en el bloque perfil.
PERFIL = [
    ('sisben', 'Grupo de Sisbén',
     ['Grupo A, pobreza extrema', 'Grupo B, pobreza moderada', 'Grupo C, vulnerable',
      'Grupo D, no pobre ni vulnerable', 'Sin Sisbén']),
    ('victima', 'Víctima del conflicto armado', ['Sí', 'No']),
    ('etnico', 'Pertenece a un grupo étnico', ['Sí', 'No']),
    ('discapacidad', 'Discapacidad certificada', ['Sí', 'No']),
    ('icfes', 'Percentil en la prueba Saber 11',
     ['Percentil 90 a 100', 'Percentil 80 a 89', 'Percentil 50 a 79',
      'Percentil 25 a 49', 'Percentil 0 a 24', 'Otra escala de resultados', SIN_DATO]),
]

SISBEN = {'A1 - A5': 0, 'B1 - B7': 1, 'C1 - C18': 2, 'D1 - D21': 3,
          'No tiene / no presenta': 4}
PERCENTILES = {'100 - 90': 0, '89 - 80': 1, '79 - 50': 2, '49 - 25': 3, '24 - 0': 4}
PRUEBA_PERCENTIL = 'Pruebas de estado 2016 - 2 en adelante'


def sin_tilde(t):
    """Quita tildes y diéresis; conserva la eñe como n."""
    d = unicodedata.normalize('NFD', t)
    return ''.join(c for c in d if unicodedata.category(c) != 'Mn')


def limpiar(t):
    """Normaliza espacios y separadores del texto de la base."""
    if t is None:
        return ''
    t = str(t).replace('\xa0', ' ')
    t = t.replace('–', '-').replace('—', '-')
    return re.sub(r'\s+', ' ', t).strip()


def si(v):
    return limpiar(v).upper() in ('SI', 'SÍ')


def entero(v):
    """Número entero de una celda que puede llegar como texto o decimal."""
    try:
        return int(float(str(v).strip().replace(',', '.')))
    except (TypeError, ValueError):
        return None


def titulo(texto):
    """Nombre de programa legible: título, tildes y partículas en minúscula."""
    piezas = re.split(r'([^\w]+)', limpiar(texto), flags=re.UNICODE)
    salida = []
    for i, pieza in enumerate(piezas):
        if not pieza or re.match(r'^[^\w]+$', pieza, re.UNICODE):
            salida.append(pieza)
            continue
        alta = CORRECCIONES.get(pieza.upper(), pieza.upper())
        if alta.isdigit() or alta in SIGLAS:
            salida.append(alta)
            continue
        t = TILDES.get(sin_tilde(alta), alta.capitalize())
        if i > 0 and sin_tilde(t).lower() in MINUSCULAS:
            t = t.lower()
        salida.append(t)
    r = ''.join(salida).strip()
    return r[:1].upper() + r[1:] if r else r


def programa(texto):
    """Separa nombre, modalidad, código SNIES y municipio de oferta."""
    m = re.match(r'^(.*) - (.*?) - SNIES:\s*(\d+)\s*\(([^()]*)\)\s*$', limpiar(texto))
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3), m.group(4)


def fecha(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', limpiar(v))
    return '-'.join(m.groups()) if m else None


def leer(ruta):
    """Lee la primera hoja y devuelve las columnas del tablero por registro."""
    libro = load_workbook(ruta, read_only=True, data_only=True)
    hoja = libro[libro.sheetnames[0]]
    filas = hoja.iter_rows(values_only=True)
    cab = [limpiar(c) for c in next(filas)]
    faltan = [c for c in COLUMNAS.values() if c not in cab]
    if faltan:
        libro.close()
        sys.exit('Faltan columnas en %s: %s' % (ruta, ', '.join(faltan)))
    pos = {k: cab.index(c) for k, c in COLUMNAS.items()}
    salida = []
    for f in filas:
        if f is None or all(v is None for v in f):
            continue
        salida.append({k: f[i] if i < len(f) else None for k, i in pos.items()})
    libro.close()
    return salida


def periodo_de(ruta, registros):
    """Periodo de la convocatoria (2027-1) y su número (17)."""
    validos = Counter(limpiar(r['convocatoria']) for r in registros
                      if re.match(r'^\d{4}-[12]$', limpiar(r['convocatoria'])))
    if validos:
        nombre = validos.most_common(1)[0][0]
    else:
        m = re.search(r'(\d{4})-([12])', os.path.basename(ruta))
        if not m:
            sys.exit('No se pudo establecer el periodo de %s' % ruta)
        nombre = '%s-%s' % m.groups()
    numeros = Counter(entero(r['numero']) for r in registros if entero(r['numero']))
    return nombre, (numeros.most_common(1)[0][0] if numeros else None)


def indice(lista, valor):
    """Devuelve la posición de un valor en la lista y lo agrega si falta."""
    try:
        return lista.index(valor)
    except ValueError:
        lista.append(valor)
        return len(lista) - 1


def grupo_edad(v):
    e = entero(v)
    if e is None or e < 14:
        return 4
    return 0 if e <= 17 else 1 if e <= 21 else 2 if e <= 28 else 3


def grupo_semestre(v):
    s = entero(v)
    if s is None or s < 1:
        return 3
    return 0 if s == 1 else 1 if s <= 4 else 2


def grupos_grado(anio_max):
    """Años de graduación: los ocho más recientes uno a uno y dos rangos."""
    return (['%d o antes' % (anio_max - 12), '%d a %d' % (anio_max - 11, anio_max - 8)] +
            [str(a) for a in range(anio_max - 7, anio_max + 1)] + [SIN_DATO])


def grupo_grado(v, anio_max):
    a = entero(v)
    if a is None or a < 1900 or a > anio_max:
        return 10
    if a <= anio_max - 12:
        return 0
    if a <= anio_max - 8:
        return 1
    return a - (anio_max - 7) + 2


def construir(lotes):
    anios = [entero(r['grado']) for _, _, regs in lotes for r in regs]
    anio_max = max(a for a in anios if a and 1900 <= a <= 2100)
    dim = {
        'periodo': [], 'estado': ['Completo', 'Incompleto', SIN_DATO],
        'fuente': FUENTES, 'sexo': SEXOS, 'edad': EDADES, 'estrato': ESTRATOS,
        'zona': ZONAS, 'comuna': [{'nombre': n, 'codigo': c,
                                   'zona': 2 if c == '00' else 1 if int(c) >= 50 else 0}
                                  for c, n in COMUNAS],
        'ies': [], 'programa': [], 'nivel': [], 'modalidad': [],
        'semestre': SEMESTRES, 'medio': [], 'dia': [], 'colegio': [],
        'ubicacion': ['Medellín', 'Otro municipio', SIN_DATO],
        'grado': grupos_grado(anio_max),
        'titulo': [n for _, n in TITULOS]
    }
    codigos_comuna = [c for c, _ in COMUNAS]
    idx_ies, idx_prog, mcero = {}, {}, defaultdict(Counter)
    conteo = Counter()
    perfil = defaultdict(lambda: defaultdict(Counter))
    avisos = defaultdict(Counter)

    def ies_de(nombre):
        if nombre not in idx_ies:
            if nombre == SIN_IES:
                visible, corto, sector = SIN_IES, 'Sin institución', SIN_DATO
            else:
                visible, corto, sector = IES.get(nombre, (titulo(nombre), titulo(nombre)[:22], SIN_DATO))
                if nombre not in IES:
                    avisos['institución sin homologar'][nombre] += 1
            dim['ies'].append({'nombre': visible, 'corto': corto, 'sector': sector,
                               'matriculaCero': False})
            idx_ies[nombre] = len(dim['ies']) - 1
        return idx_ies[nombre]

    # Los diccionarios de días, medios y colegios se ordenan al final.
    dias, medios, colegios = set(), Counter(), Counter()
    for _, _, regs in lotes:
        for r in regs:
            dias.add(fecha(r['fecha']) or SIN_DATO)
            medios[MEDIOS.get(limpiar(r['medio']), SIN_DATO if not limpiar(r['medio'])
                              else limpiar(r['medio']))] += 1
            colegios[COLEGIOS.get(limpiar(r['colegio']).upper(), SIN_DATO)] += 1
    dim['dia'] = sorted(d for d in dias if d != SIN_DATO) + ([SIN_DATO] if SIN_DATO in dias else [])
    dim['medio'] = [m for m, _ in medios.most_common() if m != SIN_DATO] + \
        ([SIN_DATO] if SIN_DATO in medios else [])
    dim['colegio'] = [c for c in ['Oficial', 'No oficial', 'Cobertura contratada', SIN_DATO]
                      if c in colegios]
    dim['nivel'] = ['Universitaria', 'Tecnológica', 'Técnica profesional', SIN_DATO]
    dim['modalidad'] = ['Presencial', 'Virtual', 'A distancia', SIN_DATO]

    for nombre_periodo, numero, regs in lotes:
        i_pe = len(dim['periodo'])
        dim['periodo'].append({'nombre': nombre_periodo, 'numero': numero})
        for r in regs:
            i_es = {'completo': 0, 'incompleto': 1}.get(limpiar(r['estado']).lower(), 2)
            aplica_pp, aplica_ro = si(r['ff_pp']), si(r['ff_ro'])
            i_fu = 1 if aplica_pp and aplica_ro else 0 if aplica_pp else 2 if aplica_ro else 3

            sexo = limpiar(r['sexo'])
            i_sx = 0 if sexo == 'Mujer' else 1 if sexo == 'Hombre' else 2
            i_ed = grupo_edad(r['edad'])
            estrato = limpiar(r['estrato_pp']) or limpiar(r['estrato'])
            i_et = ESTRATOS.index(estrato) if estrato in ESTRATOS else len(ESTRATOS) - 1

            m = re.match(r'^(\d+)\s*-', limpiar(r['comuna']))
            codigo = m.group(1).zfill(2) if m else None
            if codigo not in codigos_comuna:
                avisos['comuna sin homologar'][limpiar(r['comuna'])] += 1
                codigo = '00'
            i_co = codigos_comuna.index(codigo)

            texto_prog = r['prog_mc'] if limpiar(r['prog_mc']) else r['prog_otra']
            nombre_ies = limpiar(r['ies_mc']) or limpiar(r['ies_otra']) or SIN_IES
            partes = programa(texto_prog) if limpiar(texto_prog) else None
            if limpiar(texto_prog) and not partes:
                avisos['programa con formato desconocido'][limpiar(texto_prog)] += 1
            if partes:
                nombre, modalidad, snies, _municipio = partes
                i_ie = ies_de(nombre_ies)
                if snies not in idx_prog:
                    nivel = NIVELES.get(limpiar(r['nivel']).upper(), SIN_DATO)
                    mod = MODALIDADES.get(modalidad.upper(), SIN_DATO)
                    if modalidad.upper() not in MODALIDADES:
                        avisos['modalidad sin homologar'][modalidad] += 1
                    dim['programa'].append({
                        'nombre': titulo(nombre), 'codigo': snies, 'ies': i_ie,
                        'nivel': dim['nivel'].index(nivel),
                        'modalidad': dim['modalidad'].index(mod)
                    })
                    idx_prog[snies] = len(dim['programa']) - 1
                i_pr = idx_prog[snies]
                mcero[i_ie][si(r['mcero'])] += 1
            else:
                if SIN_PROGRAMA not in idx_prog:
                    dim['programa'].append({
                        'nombre': SIN_PROGRAMA, 'codigo': '', 'ies': ies_de(SIN_IES),
                        'nivel': len(dim['nivel']) - 1, 'modalidad': len(dim['modalidad']) - 1
                    })
                    idx_prog[SIN_PROGRAMA] = len(dim['programa']) - 1
                i_pr = idx_prog[SIN_PROGRAMA]

            i_se = grupo_semestre(r['semestre'])
            medio = MEDIOS.get(limpiar(r['medio']), SIN_DATO if not limpiar(r['medio'])
                               else limpiar(r['medio']))
            if limpiar(r['medio']) and limpiar(r['medio']) not in MEDIOS:
                avisos['medio de difusión sin homologar'][limpiar(r['medio'])] += 1
            i_me = dim['medio'].index(medio)
            i_di = dim['dia'].index(fecha(r['fecha']) or SIN_DATO)
            i_cl = dim['colegio'].index(COLEGIOS.get(limpiar(r['colegio']).upper(), SIN_DATO))
            i_ub = dim['ubicacion'].index(UBICACIONES.get(limpiar(r['ubicacion']), SIN_DATO))
            i_gr = grupo_grado(r['grado'], anio_max)
            if all(not limpiar(r[c]) for c, _ in TITULOS):
                titulos = TITULOS_SIN_DATO
            else:
                titulos = sum(1 << b for b, (c, _) in enumerate(TITULOS) if si(r[c]))

            conteo[(i_pe, i_es, i_fu, i_sx, i_ed, i_et, i_co, i_pr,
                    i_se, i_me, i_di, i_cl, i_ub, i_gr, titulos)] += 1

            celda = perfil[(i_pe, i_fu, i_es, i_sx, i_ed)]
            celda['sisben'][SISBEN.get(limpiar(r['sisben']), 4)] += 1
            celda['victima'][0 if si(r['victima']) else 1] += 1
            celda['etnico'][0 if si(r['etnico']) else 1] += 1
            celda['discapacidad'][0 if si(r['discapacidad']) else 1] += 1
            if limpiar(r['prueba']) == PRUEBA_PERCENTIL and limpiar(r['percentil']) in PERCENTILES:
                celda['icfes'][PERCENTILES[limpiar(r['percentil'])]] += 1
            else:
                celda['icfes'][5 if limpiar(r['percentil']) else 6] += 1

    # Una institución participa en Matrícula Cero si sus inscritos lo reportan.
    for i_ie, c in mcero.items():
        dim['ies'][i_ie]['matriculaCero'] = c[True] > c[False]

    filas = [list(k) + [n] for k, n in sorted(conteo.items())]

    variables = [v for v, _, _ in PERFIL]
    filas_perfil, reservados = [], Counter()
    for k in sorted(perfil):
        celda = perfil[k]
        total = sum(celda['victima'].values())
        for i_v, v in enumerate(variables):
            if total < RESERVA:
                filas_perfil.append(list(k) + [i_v, -1, total])
            else:
                for cat, n in sorted(celda[v].items()):
                    filas_perfil.append(list(k) + [i_v, cat, n])
        if total < RESERVA:
            reservados[k[0]] += total
    bloque_perfil = {
        'campos': ['periodo', 'fuente', 'estado', 'sexo', 'edad'],
        'reserva': RESERVA,
        'variables': [{'clave': v, 'nombre': n, 'categorias': c} for v, n, c in PERFIL],
        'filas': filas_perfil
    }
    return dim, filas, bloque_perfil, reservados, avisos


def escribir(destino, datos):
    cuerpo = json.dumps(datos, ensure_ascii=False, separators=(',', ':'))
    texto = (
        '/* Inscritos a la convocatoria de pregrado de Sapiencia.\n'
        '   Fuente: Agencia de Educación Postsecundaria - Sapiencia.\n'
        '   Generado por etl_convocatoria.py el %s. No editar a mano. */\n'
        'window.ODES = window.ODES || {};\n'
        'window.ODES.convocatoria = %s;\n'
    ) % (datos['meta']['generado'], cuerpo)
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(texto)
    return len(texto.encode('utf-8'))


def miles(n):
    return format(n, ',d').replace(',', '.')


def pct(a, b):
    return ('%.1f%%' % (100.0 * a / b)).replace('.', ',') if b else '0,0%'


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit('Uso: python3 etl_convocatoria.py <archivo.xlsx> [<archivo.xlsx> ...] '
                 '[carpeta_datos]')
    carpeta = 'datos'
    if not args[-1].lower().endswith('.xlsx'):
        carpeta = args.pop()
    if not args:
        sys.exit('Indique al menos un archivo .xlsx')
    os.makedirs(carpeta, exist_ok=True)

    lotes = []
    for origen in args:
        print('Leyendo %s' % origen)
        registros = leer(origen)
        nombre, numero = periodo_de(origen, registros)
        print('  %s registros · convocatoria %s (periodo %s)'
              % (miles(len(registros)), nombre, numero))
        lotes.append((nombre, numero, registros))
    lotes.sort(key=lambda l: l[0])
    if len(set(l[0] for l in lotes)) < len(lotes):
        sys.exit('Hay dos archivos de la misma convocatoria.')

    dim, filas, perfil, reservados, avisos = construir(lotes)

    resumen = {}
    for i_pe, p in enumerate(dim['periodo']):
        sel = [f for f in filas if f[0] == i_pe]
        n = sum(f[-1] for f in sel)
        dias = [dim['dia'][f[10]] for f in sel if dim['dia'][f[10]] != SIN_DATO]
        resumen[p['nombre']] = {
            'numero': p['numero'],
            'inscritos': n,
            'completos': sum(f[-1] for f in sel if f[1] == 0),
            'postuladosPP': sum(f[-1] for f in sel if f[2] in (0, 1)),
            'postuladosRO': sum(f[-1] for f in sel if f[2] in (1, 2)),
            'ies': len(set(dim['programa'][f[7]]['ies'] for f in sel
                           if dim['programa'][f[7]]['codigo'])),
            'programas': len(set(f[7] for f in sel if dim['programa'][f[7]]['codigo'])),
            'inicio': min(dias) if dias else None,
            'cierre': max(dias) if dias else None,
            'reservados': reservados[i_pe]
        }

    periodos = [p['nombre'] for p in dim['periodo']]
    meta = {
        'periodos': periodos,
        'referencia': periodos[-1],
        'registros': len(filas),
        'fuente': 'Agencia de Educación Postsecundaria - Sapiencia',
        'generado': date.today().isoformat(),
        'columnas': ['periodo', 'estado', 'fuente', 'sexo', 'edad', 'estrato', 'comuna',
                     'programa', 'semestre', 'medio', 'dia', 'colegio', 'ubicacion', 'grado',
                     'titulos', 'inscritos'],
        'resumen': resumen
    }

    destino = os.path.join(carpeta, 'convocatoria.js')
    peso = escribir(destino, {'meta': meta, 'dim': dim, 'filas': filas, 'perfil': perfil})

    for p in periodos:
        r = resumen[p]
        print('  %s: %s inscritos · %s completos · %s postulados a presupuesto '
              'participativo · %s a recursos ordinarios · %d instituciones · %d programas'
              % (p, miles(r['inscritos']), miles(r['completos']), miles(r['postuladosPP']),
                 miles(r['postuladosRO']), r['ies'], r['programas']))
        print('    inscripción del %s al %s · %s inscritos en grupos de perfil reservados'
              % (r['inicio'], r['cierre'], miles(r['reservados'])))
    for tipo, c in avisos.items():
        print('  Aviso: %s -> %s' % (tipo, '; '.join('%s (%d)' % kv for kv in c.most_common(8))))
    print('  %s filas · %s filas de perfil' % (miles(len(filas)), miles(len(perfil['filas']))))
    unicas = sum(1 for f in filas if f[-1] == 1)
    print('    %s filas (%s) corresponden a una sola persona'
          % (miles(unicas), pct(unicas, len(filas))))
    print('Escrito %s (%.0f KB)' % (destino, peso / 1024.0))


if __name__ == '__main__':
    main()
