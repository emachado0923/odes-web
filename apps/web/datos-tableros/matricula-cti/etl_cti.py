#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convierte las bases de matrícula del Ministerio de Educación Nacional y la
clasificación de los campos CINE en ciencia, tecnología e innovación (CTi) en
el módulo de datos del tablero.

    python3 etl_cti.py CARPETA_DE_BASES datos

La carpeta debe tener los archivos RET_MAT_MEN_AAAA.xlsx de cada año y
CLASIFICACION_CTI_CINE.xlsx. El script toma los años desde ANIO_INICIAL, el
primero en que las bases traen el código CINE detallado de cada programa, y
todos los que encuentre después; para sumar un año basta con dejar su archivo
en la carpeta y volver a ejecutarlo.

Criterios, los mismos de la infografía de CTi:

    matrícula    la oficial del Ministerio (MAT_OFICIAL = Si): el primer
                 semestre en las instituciones de educación superior y el
                 segundo en el SENA
    Medellín     los programas ofrecidos en el municipio (COD_MPIO_PROG 5001)
    CTi          los programas cuyo código CINE detallado pertenece a una de
                 las seis áreas de la clasificación: ciencias naturales y
                 exactas, tecnologías de la información y la comunicación,
                 ingeniería e industria, arquitectura y construcción, ciencias
                 agropecuarias y veterinarias, y ciencias de la salud
    institución  la institución principal (COD_IES_PADRE), con sus
                 seccionales

La salida es `datos/cti.js`, un módulo que declara `window.ODES.cti` con:

    meta       años, totales por año, fuente y fecha de generación
    dim        diccionarios de años, áreas, niveles, modalidades, sexos,
               sectores, instituciones y programas
    filas      matrícula de Medellín en CTi por año, programa, área, nivel,
               modalidad y sexo
    resto      matrícula de Medellín fuera de CTi por año, institución, nivel,
               modalidad y sexo, que completa el total de la ciudad
    restoProg  programas con estudiantes fuera de CTi por año, institución,
               nivel y modalidad
    pais       matrícula de Colombia por año, área (-1 fuera de CTi), nivel,
               modalidad, sector y sexo

El área de un programa se toma de cada año, porque el Ministerio puede
cambiarle el código CINE de un año a otro. El script solo necesita openpyxl.
"""

import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from datetime import date

try:
    from openpyxl import load_workbook
except ImportError:                                          # pragma: no cover
    sys.exit('Falta openpyxl. Instálelo con: pip install openpyxl')


ANIO_INICIAL = 2019
MEDELLIN = 5001
CLASIFICACION = 'CLASIFICACION_CTI_CINE.xlsx'

# --------------------------------------------------------------------------- #
#  Categorías                                                                 #
# --------------------------------------------------------------------------- #

AREAS = ['Ciencias naturales y exactas',
         'Tecnologías de la información y la comunicación',
         'Ingeniería e industria',
         'Arquitectura y construcción',
         'Ciencias agropecuarias y veterinarias',
         'Ciencias de la salud']
FUERA = 'Fuera de CTi'

# El nombre del nivel cambia entre años (Universitaria y Universitario,
# Tecnológica y Tecnológico). Las especializaciones van en un solo grupo.
NIVELES = {
    'formacion tecnica profesional': 'Técnica profesional',
    'tecnica profesional': 'Técnica profesional',
    'tecnologica': 'Tecnológica', 'tecnologico': 'Tecnológica',
    'universitaria': 'Universitaria', 'universitario': 'Universitaria',
    'maestria': 'Maestría', 'doctorado': 'Doctorado',
}
ORDEN_NIVEL = ['Técnica profesional', 'Tecnológica', 'Universitaria',
               'Especialización', 'Maestría', 'Doctorado']

# Las bases hasta 2021 traen la metodología y las siguientes, la modalidad.
# Las combinaciones se reducen a tres categorías: la que incluye componente
# presencial se cuenta como presencial, el resto de las que tienen componente
# virtual como virtual, y la distancia tradicional como a distancia.
MODALIDADES = {
    'Presencial': 'Presencial',
    'Presencial-Virtual': 'Presencial',
    'Híbrida (Presencial-Virtual)': 'Presencial',
    'Presencial-Dual': 'Presencial',
    'Dual': 'Presencial',
    'Presencial-A distancia': 'Presencial',
    'Presencial-Virtual-A distancia': 'Presencial',
    'Virtual': 'Virtual',
    'Virtual-Dual': 'Virtual',
    'Virtual-A distancia': 'Virtual',
    'Híbrida (A distancia-Virtual)': 'Virtual',
    'Distancia (virtual)': 'Virtual',
    'A distancia': 'A distancia',
    'Distancia (tradicional)': 'A distancia',
}
ORDEN_MODALIDAD = ['Presencial', 'Virtual', 'A distancia']

ORDEN_SEXO = ['Mujer', 'Hombre', 'No binario o trans']
ORDEN_SECTOR = ['Oficial', 'Privada']

# --------------------------------------------------------------------------- #
#  Nombres de las instituciones                                               #
# --------------------------------------------------------------------------- #
# Los mismos del tablero de matrícula: nombre visible y sigla, con la
# llave tal como llega el nombre de la institución principal en la base. Una
# institución que no esté aquí se rotula con su nombre en formato de título.

IES = {
    'UNIVERSIDAD DE ANTIOQUIA':
        ('Universidad de Antioquia', 'U. de Antioquia'),
    'INSTITUCION UNIVERSITARIA - ITM':
        ('Instituto Tecnológico Metropolitano', 'ITM'),
    'SERVICIO NACIONAL DE APRENDIZAJE-SENA-':
        ('Servicio Nacional de Aprendizaje', 'SENA'),
    'TECNOLOGICO DE ANTIOQUIA':
        ('Tecnológico de Antioquia', 'T. de Antioquia'),
    'UNIVERSIDAD EAFIT-':
        ('Universidad EAFIT', 'EAFIT'),
    'UNIVERSIDAD NACIONAL DE COLOMBIA':
        ('Universidad Nacional de Colombia', 'UNAL'),
    'UNIVERSIDAD PONTIFICIA BOLIVARIANA':
        ('Universidad Pontificia Bolivariana', 'UPB'),
    'INSTITUCION UNIVERSITARIA DIGITAL DE ANTIOQUIA -IU. DIGITAL':
        ('Institución Universitaria Digital de Antioquia', 'IU Digital'),
    'UNIVERSIDAD CATÓLICA LUIS AMIGÓ':
        ('Universidad Católica Luis Amigó', 'Luis Amigó'),
    'CORPORACION UNIVERSITARIA REMINGTON':
        ('Corporación Universitaria Remington', 'Remington'),
    'INSTITUCIÓN UNIVERSITARIA PASCUAL BRAVO':
        ('Institución Universitaria Pascual Bravo', 'Pascual Bravo'),
    'POLITECNICO COLOMBIANO JAIME ISAZA CADAVID':
        ('Politécnico Colombiano Jaime Isaza Cadavid', 'Politécnico JIC'),
    'UNIVERSIDAD NACIONAL ABIERTA Y A DISTANCIA UNAD':
        ('Universidad Nacional Abierta y a Distancia', 'UNAD'),
    'UNIVERSIDAD DE MEDELLIN':
        ('Universidad de Medellín', 'U. de Medellín'),
    'UNIVERSIDAD CES':
        ('Universidad CES', 'CES'),
    'COLEGIO MAYOR DE ANTIOQUIA':
        ('Institución Universitaria Colegio Mayor de Antioquia', 'Colegio Mayor'),
    'UNIVERSIDAD AUTONOMA LATINOAMERICANA-UNAULA-':
        ('Universidad Autónoma Latinoamericana', 'UNAULA'),
    'CORPORACION UNIVERSITARIA AMERICANA':
        ('Corporación Universitaria Americana', 'Americana'),
    'UNIVERSIDAD COOPERATIVA DE COLOMBIA':
        ('Universidad Cooperativa de Colombia', 'UCC'),
    'POLITECNICO GRANCOLOMBIANO':
        ('Politécnico Grancolombiano', 'Grancolombiano'),
    'UNIVERSIDAD DE SAN BUENAVENTURA':
        ('Universidad de San Buenaventura', 'San Buenaventura'),
    'FUNDACION UNIVERSITARIA MARIA CANO':
        ('Fundación Universitaria María Cano', 'María Cano'),
    'FUNDACION UNIVERSITARIA ESUMER':
        ('Fundación Universitaria Esumer', 'Esumer'),
    'INSTITUCION UNIVERSITARIA  SALAZAR Y HERRERA':
        ('Institución Universitaria Salazar y Herrera', 'Salazar y Herrera'),
    'INSTITUCION UNIVERSITARIA ESCOLME':
        ('Institución Universitaria Escolme', 'Escolme'),
    'UNIVERSIDAD EIA':
        ('Universidad EIA', 'EIA'),
    'CORPORACION UNIVERSITARIA ADVENTISTA - UNAC':
        ('Corporación Universitaria Adventista', 'UNAC'),
    'INSTITUCIÓN UNIVERSITARIA VISIÓN DE LAS AMÉRICAS':
        ('Institución Universitaria Visión de las Américas', 'Visión Américas'),
    'CORPORACION UNIVERSITARIA U DE COLOMBIA':
        ('Corporación Universitaria U de Colombia', 'U de Colombia'),
    'CORPORACION COLEGIATURA COLOMBIANA':
        ('Corporación Colegiatura Colombiana', 'Colegiatura'),
    'UNIVERSIDAD DEL TOLIMA':
        ('Universidad del Tolima', 'U. del Tolima'),
    'UNIVERSIDAD SANTO TOMAS':
        ('Universidad Santo Tomás', 'Santo Tomás'),
    'FUNDACION UNIVERSITARIA BELLAS ARTES':
        ('Fundación Universitaria Bellas Artes', 'Bellas Artes'),
    'UNIVERSIDAD ECCI':
        ('Universidad ECCI', 'ECCI'),
    'ESCUELA SUPERIOR DE ADMINISTRACION PUBLICA-ESAP-':
        ('Escuela Superior de Administración Pública', 'ESAP'),
    'UNIVERSIDAD EXTERNADO DE COLOMBIA':
        ('Universidad Externado de Colombia', 'Externado'),
    'FUNDACION UNIVERSITARIA SEMINARIO BIBLICO DE COLOMBIA - FUSBC':
        ('Fundación Universitaria Seminario Bíblico de Colombia', 'FUSBC'),
    'CORPORACION ACADEMIA SUPERIOR DE ARTES':
        ('Corporación Academia Superior de Artes', 'Academia de Artes'),
    'CORPORACION ACADEMIA TECNOLOGICA DE COLOMBIA -ATEC-':
        ('Corporación Academia Tecnológica de Colombia', 'ATEC'),
    'FUNDACION UNIVERSITARIA CLARETIANA - UNICLARETIANA':
        ('Fundación Universitaria Claretiana', 'Uniclaretiana'),
    'CORPORACION UNIVERSIDAD DE LA COSTA CUC':
        ('Universidad de la Costa', 'CUC'),
    'CORPORACIÓN TECNOLÓGICO SUPERIOR':
        ('Corporación Tecnológico Superior', 'Tecnológico Superior'),
    'ESCUELA DE TECNOLOGIAS DE ANTIOQUIA -ETA-':
        ('Escuela de Tecnologías de Antioquia', 'ETA'),
    'UNIVERSIDAD DE LA SABANA':
        ('Universidad de La Sabana', 'La Sabana'),
    'CORPORACION UNIFICADA NACIONAL DE EDUCACION SUPERIOR-CUN-':
        ('Corporación Unificada Nacional de Educación Superior', 'CUN'),
    'UNIVERSIDAD CATOLICA DE MANIZALES':
        ('Universidad Católica de Manizales', 'U. C. de Manizales'),
    'CORPORACION UNIVERSITARIA MINUTO DE DIOS -UNIMINUTO-':
        ('Corporación Universitaria Minuto de Dios', 'Uniminuto'),
    'UNIVERSIDAD ANTONIO NARIÑO':
        ('Universidad Antonio Nariño', 'Antonio Nariño'),
}

# Instituciones que ofrecieron programas en Medellín entre 2019 y 2024 y que no
# figuran en la base de 2025 del tablero de matrícula. El nombre de Sapienza
# cambia de un año a otro en la base, por eso tiene varias llaves.
SAPIENZA = ('Corporación Tecnológica de Educación Superior Sapienza', 'Sapienza')
IES.update({
    'COLEGIO MAYOR DE NUESTRA SEÑORA DEL ROSARIO':
        ('Colegio Mayor de Nuestra Señora del Rosario', 'U. del Rosario'),
    'CORPORACION TECNOLOGICA DE EDUCACION SUPERIOR SAPIENZA CTE': SAPIENZA,
    'CORPORACIÓN TECNOLÓGICA DE EDUCACIÓN SUPERIOR SAPIENZA -CTE-': SAPIENZA,
    'CORPORACIÓN TECNOLÓGICA DE EDUCACIÓN SUPERIOR SAPIENZA - CTES': SAPIENZA,
    'CORPORACI¿N TECNOL¿GICA DE EDUCACI¿N SUPERIOR SAPIENZA -CTE-': SAPIENZA,
    'FUNDACIÓN POLITÉCNICO MINUTO DE DIOS - TEC MD':
        ('Fundación Politécnico Minuto de Dios', 'TEC MD'),
    'FUNDACION UNIVERSITARIA DEL AREA ANDINA':
        ('Fundación Universitaria del Área Andina', 'Areandina'),
    'FUNDACION UNIVERSITARIA JUAN DE CASTELLANOS':
        ('Fundación Universitaria Juan de Castellanos', 'Juan de Castellanos'),
    'FUNDACION UNIVERSITARIA SAN MARTIN':
        ('Fundación Universitaria San Martín', 'San Martín'),
    'INSTITUCION UNIVERSITARIA COLOMBO AMERICANA - UNICA':
        ('Institución Universitaria Colombo Americana', 'ÚNICA'),
    'PONTIFICIA UNIVERSIDAD JAVERIANA':
        ('Pontificia Universidad Javeriana', 'Javeriana'),
    'UNIVERSIDAD CATOLICA DE ORIENTE -UCO':
        ('Universidad Católica de Oriente', 'UCO'),
    'UNIVERSIDAD TECNOLOGICA DE PEREIRA - UTP':
        ('Universidad Tecnológica de Pereira', 'UTP'),
})

# Palabras que el SNIES entrega sin tilde y que tampoco aparecen acentuadas en
# ningún registro de la base, de modo que no pueden corregirse con el propio
# vocabulario del archivo.
TILDES = {
    'ELECTRICA': 'Eléctrica', 'ELECTRICO': 'Eléctrico',
    'CIRUGIA': 'Cirugía', 'AUDITORIA': 'Auditoría',
    'ESTADISTICA': 'Estadística', 'TEOLOGIA': 'Teología',
    'GEOINFORMATICA': 'Geoinformática', 'HIDRAULICOS': 'Hidráulicos',
    'PLASTICAS': 'Plásticas', 'ARTISTICA': 'Artística',
    'SOCIOLOGIA': 'Sociología', 'FILOLOGIA': 'Filología',
    'HISPANICA': 'Hispánica', 'MICROBIOLOGIA': 'Microbiología',
    'PATOLOGIA': 'Patología', 'RADIOLOGIA': 'Radiología',
    'CARDIOLOGIA': 'Cardiología', 'EPIDEMIOLOGIA': 'Epidemiología',
    'NEONATOLOGIA': 'Neonatología', 'AGRICOLA': 'Agrícola',
    'ECONOMICA': 'Económica', 'ECONOMICO': 'Económico',
    'BIOMEDICA': 'Biomédica', 'BIOMEDICAS': 'Biomédicas',
    'QUIMICAS': 'Químicas', 'BASICA': 'Básica', 'BASICAS': 'Básicas',
    'INSTRUMENTACION': 'Instrumentación', 'MATEMATICA': 'Matemática',
    'INGLES': 'Inglés', 'ESPAÑOL': 'Español', 'MUSICA': 'Música',
    'TECNICA': 'Técnica', 'TECNICO': 'Técnico', 'PUBLICA': 'Pública',
    'PUBLICO': 'Público', 'PUBLICAS': 'Públicas', 'PUBLICOS': 'Públicos',
    'POLITICA': 'Política', 'POLITICO': 'Político', 'POLITICAS': 'Políticas',
    'CLINICA': 'Clínica', 'CLINICO': 'Clínico', 'CRITICA': 'Crítica',
    'ENFASIS': 'Énfasis', 'PEDAGOGIA': 'Pedagogía', 'ZOOTECNIA': 'Zootecnia',
    'BIOLOGIA': 'Biología', 'FILOSOFIA': 'Filosofía',
    'TECNOLOGICA': 'Tecnológica', 'TECNOLOGICO': 'Tecnológico',
    'PSICOLOGICA': 'Psicológica', 'MEDICION': 'Medición',
    'PLANEACION': 'Planeación', 'INFORMATICA': 'Informática',
    'ESTRATEGICO': 'Estratégico', 'ESTRATEGICA': 'Estratégica',
    'GEOGRAFICA': 'Geográfica', 'AGRONOMICA': 'Agronómica',
    'MECANICO': 'Mecánico', 'ENERGETICOS': 'Energéticos',
    'AEREO': 'Aéreo', 'LOGISTICO': 'Logístico',
    'AERONAUTICA': 'Aeronáutica', 'AERONAUTICO': 'Aeronáutico',
    'ALIMENTACION': 'Alimentación', 'AUDIOLOGIA': 'Audiología',
    'BACTERIOLOGIA': 'Bacteriología', 'CIBERNETICOS': 'Cibernéticos',
    'DIAGNOSTICAS': 'Diagnósticas', 'ECOCARDIOGRAFIA': 'Ecocardiografía',
    'ENTOMOLOGIA': 'Entomología', 'ETNOEDUCACION': 'Etnoeducación',
    'GRABACION': 'Grabación', 'QUIRURGICA': 'Quirúrgica',
    'TRANSMISION': 'Transmisión', 'VALIDACION': 'Validación',
}

MINUSCULAS = {'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a',
              'con', 'para', 'por', 'al', 'o', 'u', 'como', 'sin', 'sobre'}

# Siglas y numerales que deben quedar en mayúscula dentro de los nombres.
SIGLAS = {'MBA', 'TIC', 'TICS', 'SST', 'SIG', 'BIM', 'ERP', 'PYME', 'PYMES',
          'UX', 'UI', 'GIS', 'HSEQ', 'NIIF', 'CAD',
          'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'}

VOCALES = 'AEIOUÁÉÍÓÚÑÜ'


# --------------------------------------------------------------------------- #
#  Funciones                                                                  #
# --------------------------------------------------------------------------- #

def sin_tilde(t):
    """Quita tildes y diéresis; conserva la eñe como n."""
    d = unicodedata.normalize('NFD', t)
    return ''.join(c for c in d if unicodedata.category(c) != 'Mn')


def limpiar(t):
    """Normaliza espacios y separadores del texto que entrega el SNIES."""
    t = str(t or '').replace('\xa0', ' ')
    t = t.replace('–', '-').replace('—', '-')
    return re.sub(r'\s+', ' ', t).strip()


class Vocabulario(object):
    """Repara las palabras de los nombres de programa.

    La base pierde las vocales acentuadas y la eñe en una parte de los
    registros: escribe `MAESTR¿A`, `DISE¿O` o `ESPECIALIZACI¿N`. La misma base
    contiene esas palabras bien escritas en otros registros, de modo que el
    vocabulario se construye con todo el archivo nacional y se usa después para
    reconstruir la forma correcta. Las palabras que nunca aparecen acentuadas se
    resuelven con el diccionario TILDES.
    """

    def __init__(self):
        self.formas = defaultdict(Counter)

    def aprender(self, texto):
        for p in re.findall(r'[^\W\d_]+', limpiar(texto), re.UNICODE):
            if '¿' in p:
                continue
            self.formas[sin_tilde(p).upper()][p.upper()] += 1

    def _candidatas(self, palabra):
        """Formas del vocabulario compatibles con una palabra dañada."""
        patron = re.compile(
            '^' + ''.join('[' + VOCALES + ']' if c == '¿' else re.escape(c)
                          for c in palabra.upper()) + '$')
        salida = Counter()
        for clave, formas in self.formas.items():
            for forma, n in formas.items():
                if patron.match(forma) or patron.match(clave):
                    salida[forma] += n
        return salida

    def palabra(self, p):
        """Devuelve la palabra corregida, ya en formato de título."""
        alta = p.upper()
        if '¿' in alta:
            cand = self._candidatas(alta)
            if cand:
                alta = cand.most_common(1)[0][0]
            else:
                alta = alta.replace('¿', 'Ñ')
        clave = sin_tilde(alta)
        if alta == clave:                       # la palabra llegó sin tildes
            if clave in TILDES:
                return TILDES[clave]
            formas = self.formas.get(clave)
            if formas:
                mejores = [f for f in formas if f != clave]
                # La forma con tilde reemplaza a la forma sin tilde cuando tiene
                # un uso apreciable en el archivo. El umbral deja fuera las
                # grafías aisladas, como la tilde suelta de un extranjerismo,
                # sin descartar las palabras que el sistema escribe de las dos
                # maneras con frecuencia parecida.
                if mejores:
                    mejor = max(mejores, key=lambda f: formas[f])
                    if formas[mejor] >= 0.2 * formas.get(clave, 0):
                        alta = mejor
        return alta.capitalize()

    def titulo(self, texto):
        """Nombre de programa legible: título, con las partículas en minúscula."""
        texto = limpiar(texto)
        piezas = re.split(r'([^\w¿]+)', texto, flags=re.UNICODE)
        salida = []
        for i, pieza in enumerate(piezas):
            if not pieza or re.match(r'^[^\w¿]+$', pieza, re.UNICODE):
                salida.append(pieza.replace('¿', '-') if '¿' in pieza else pieza)
                continue
            if pieza.isdigit() or pieza.upper() in SIGLAS:
                salida.append(pieza.upper())     # siglas y romanos se conservan
                continue
            t = self.palabra(pieza)
            if i > 0 and sin_tilde(t).lower() in MINUSCULAS:
                t = t.lower()
            salida.append(t)
        r = ''.join(salida).strip()
        return r[:1].upper() + r[1:] if r else r


def indice(lista, valor):
    """Devuelve la posición de un valor en la lista y lo agrega si falta."""
    try:
        return lista.index(valor)
    except ValueError:
        lista.append(valor)
        return len(lista) - 1


def entero(v):
    """Número entero de una celda que puede llegar como texto o decimal."""
    try:
        return int(float(str(v).strip().replace(',', '.')))
    except (TypeError, ValueError):
        return None


def llave_nombre(t):
    return sin_tilde(limpiar(t)).upper()


NOMBRES_IES = {llave_nombre(k): v for k, v in IES.items()}


def hoja_de(libro):
    return libro['1'] if '1' in libro.sheetnames else libro[libro.sheetnames[0]]


def leer_clasificacion(ruta):
    """Área CTi de cada código CINE detallado."""
    libro = load_workbook(ruta, read_only=True, data_only=True)
    filas = hoja_de(libro).iter_rows(values_only=True)
    cab = [limpiar(c) for c in next(filas)]
    for c in ('ID_CINE_DETALLADO', 'CTI_COMPONENTE'):
        if c not in cab:
            sys.exit('Falta la columna %s en %s' % (c, ruta))
    i, j = cab.index('ID_CINE_DETALLADO'), cab.index('CTI_COMPONENTE')
    salida = {}
    for f in filas:
        if f is None or entero(f[i]) is None:
            continue
        salida[entero(f[i])] = limpiar(f[j])
    libro.close()
    extranos = set(salida.values()) - set(AREAS) - {FUERA}
    if extranos:
        sys.exit('Áreas no reconocidas en %s: %s' % (ruta, ', '.join(sorted(extranos))))
    return salida


COLUMNAS = ['COD_IES', 'COD_IES_PADRE', 'NOM_IES', 'SECTOR_IES', 'COD_SNIES', 'PROGRAMA',
            'NIVEL_FORMACION', 'MODALIDAD', 'ID_CINE_DETALLADO', 'COD_MPIO_PROG', 'SEXO']


def leer_anio(argumentos):
    """Suma la matrícula oficial de un año por las columnas del tablero."""
    ruta, anio = argumentos
    libro = load_workbook(ruta, read_only=True, data_only=True)
    filas = hoja_de(libro).iter_rows(values_only=True)
    cab = [limpiar(c) for c in next(filas)]
    if 'MODALIDAD' not in cab and 'METODOLOGIA' in cab:
        cab[cab.index('METODOLOGIA')] = 'MODALIDAD'
    mat = 'MAT_%d' % anio
    faltan = [c for c in COLUMNAS + [mat, 'MAT_OFICIAL'] if c not in cab]
    if faltan:
        libro.close()
        return anio, None, 'faltan columnas: ' + ', '.join(faltan)
    pos = [cab.index(c) for c in COLUMNAS]
    i_mat, i_of = cab.index(mat), cab.index('MAT_OFICIAL')
    suma = defaultdict(int)
    for f in filas:
        if f is None or limpiar(f[i_of]).upper() not in ('SI', 'SÍ'):
            continue
        n = entero(f[i_mat]) or 0
        if n > 0:
            suma[tuple(f[p] for p in pos)] += n
    libro.close()
    return anio, dict(suma), None


def nivel_de(t):
    x = sin_tilde(limpiar(t)).lower()
    return 'Especialización' if x.startswith('especializacion') else NIVELES.get(x)


def sexo_de(t):
    x = sin_tilde(limpiar(t)).lower()
    if x in ('mujer', 'femenino'):
        return 'Mujer'
    if x in ('hombre', 'masculino'):
        return 'Hombre'
    return 'No binario o trans' if x in ('no binario', 'trans') else None


def sector_de(t):
    x = sin_tilde(limpiar(t)).lower()
    return 'Oficial' if x == 'oficial' else 'Privada' if x in ('privada', 'privado') else None


def construir(anios, datos, area_cine):
    vocab = Vocabulario()
    avisos = defaultdict(Counter)
    principal, otro = {}, {}
    ultimo_prog, padres_med = {}, set()
    for anio in anios:
        for k in datos[anio]:
            cod, padre, nom, sector, snies, prog = k[:6]
            vocab.aprender(prog)
            padre = entero(padre)
            if entero(cod) == padre:
                principal[padre] = (nom, sector)
            otro.setdefault(padre, (nom, sector))
            if entero(k[9]) == MEDELLIN:
                padres_med.add(padre)
                # El diccionario de programas solo lleva los que tuvieron
                # estudiantes en CTi algún año, con el nombre del más reciente.
                if area_cine.get(entero(k[8]), FUERA) != FUERA:
                    ultimo_prog[entero(snies)] = (prog, padre)

    # Instituciones con programas ofrecidos en Medellín, por nombre visible:
    # una institución que cambió de código queda en una sola entrada.
    def institucion(padre):
        nom, sector = principal.get(padre, otro[padre])
        visible, corto = NOMBRES_IES.get(llave_nombre(nom), (None, None))
        if not visible:
            visible = vocab.titulo(nom)
            corto = visible
            avisos['institución sin nombre en el diccionario'][limpiar(nom)] += 1
        return visible, corto, sector_de(sector)

    dim = {'anio': anios, 'area': AREAS[:], 'nivel': ORDEN_NIVEL[:],
           'modalidad': ORDEN_MODALIDAD[:], 'sexo': ORDEN_SEXO[:], 'sector': ORDEN_SECTOR[:],
           'ies': [], 'programa': []}
    datos_ies = {p: institucion(p) for p in sorted(padres_med)}
    for visible in sorted({v[0] for v in datos_ies.values()}, key=lambda t: sin_tilde(t).lower()):
        corto, sector = [(v[1], v[2]) for v in datos_ies.values() if v[0] == visible][0]
        dim['ies'].append({'nombre': visible, 'corto': corto, 'sector': ORDEN_SECTOR.index(sector)})
    i_ies = {p: [e['nombre'] for e in dim['ies']].index(v[0]) for p, v in datos_ies.items()}

    progs = sorted(ultimo_prog.items(), key=lambda kv: (sin_tilde(vocab.titulo(kv[1][0])).lower(), kv[0]))
    i_prog = {}
    for snies, (nombre, padre) in progs:
        i_prog[snies] = len(dim['programa'])
        dim['programa'].append({'codigo': snies, 'nombre': vocab.titulo(nombre), 'ies': i_ies[padre]})

    filas, resto, pais = defaultdict(int), defaultdict(int), defaultdict(int)
    resto_prog = defaultdict(set)

    def categoria(lista, valor, crudo, tipo):
        if valor is None:
            avisos[tipo][limpiar(crudo)] += 1
            valor = limpiar(crudo) or 'Sin información'
        return indice(lista, valor)

    for ia, anio in enumerate(anios):
        for k, n in datos[anio].items():
            cod, padre, nom, sector, snies, prog, niv, mod, cine, mpio, sexo = k
            cine = entero(cine)
            if cine not in area_cine:
                avisos['código CINE sin clasificación (cuenta fuera de CTi)'][str(cine)] += n
            area = area_cine.get(cine, FUERA)
            i_area = AREAS.index(area) if area in AREAS else -1
            i_niv = categoria(dim['nivel'], nivel_de(niv), niv, 'nivel no reconocido')
            i_mod = categoria(dim['modalidad'], MODALIDADES.get(limpiar(mod)), mod, 'modalidad no reconocida')
            i_sex = categoria(dim['sexo'], sexo_de(sexo), sexo, 'sexo no reconocido')
            i_sec = categoria(dim['sector'], sector_de(sector), sector, 'sector no reconocido')
            pais[(ia, i_area, i_niv, i_mod, i_sec, i_sex)] += n
            if entero(mpio) != MEDELLIN:
                continue
            if i_area >= 0:
                filas[(ia, i_prog[entero(snies)], i_area, i_niv, i_mod, i_sex)] += n
            else:
                ies = i_ies[entero(padre)]
                resto[(ia, ies, i_niv, i_mod, i_sex)] += n
                resto_prog[(ia, ies, i_niv, i_mod)].add(entero(snies))

    plano = lambda d: [list(k) + [v] for k, v in sorted(d.items())]
    return (dim, plano(filas), plano(resto),
            [list(k) + [len(v)] for k, v in sorted(resto_prog.items())], plano(pais), avisos)


def escribir(destino, datos):
    cuerpo = json.dumps(datos, ensure_ascii=False, separators=(',', ':'))
    texto = (
        '/* Matrícula de educación superior en ciencia, tecnología e innovación.\n'
        '   Fuente: Sistema Nacional de Información de la Educación Superior - SNIES.\n'
        '   Generado por etl_cti.py el %s. No editar a mano. */\n'
        'window.ODES = window.ODES || {};\n'
        'window.ODES.cti = %s;\n'
    ) % (datos['meta']['generado'], cuerpo)
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(texto)
    return len(texto.encode('utf-8'))


def miles(n):
    return format(n, ',d').replace(',', '.')


def pct(a, b):
    return ('%.1f%%' % (100.0 * a / b)).replace('.', ',') if b else '0,0%'


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    origen, carpeta = sys.argv[1], sys.argv[2]
    ruta_clas = os.path.join(origen, CLASIFICACION)
    if not os.path.exists(ruta_clas):
        sys.exit('No está %s en %s' % (CLASIFICACION, origen))
    area_cine = leer_clasificacion(ruta_clas)

    archivos = {}
    for nombre in os.listdir(origen):
        m = re.match(r'^RET_MAT_MEN_(\d{4})\.xlsx$', nombre)
        if m and int(m.group(1)) >= ANIO_INICIAL:
            archivos[int(m.group(1))] = os.path.join(origen, nombre)
    anios = sorted(archivos)
    if not anios:
        sys.exit('No hay archivos RET_MAT_MEN_AAAA.xlsx desde %d en %s' % (ANIO_INICIAL, origen))
    if anios != list(range(anios[0], anios[-1] + 1)):
        sys.exit('Faltan años en la serie: hay %s' % ', '.join(map(str, anios)))
    print('Leyendo %d bases (%d a %d)...' % (len(anios), anios[0], anios[-1]))

    datos = {}
    with ProcessPoolExecutor(max_workers=max(1, min(4, os.cpu_count() or 1))) as grupo:
        for anio, suma, error in grupo.map(leer_anio, [(archivos[a], a) for a in anios]):
            if error:
                sys.exit('RET_MAT_MEN_%d.xlsx: %s' % (anio, error))
            datos[anio] = suma
            print('  %d leído' % anio)

    dim, filas, resto, resto_prog, pais, avisos = construir(anios, datos, area_cine)

    resumen = {}
    for ia, anio in enumerate(anios):
        cti = sum(f[-1] for f in filas if f[0] == ia)
        total = cti + sum(f[-1] for f in resto if f[0] == ia)
        progs_cti = len({f[1] for f in filas if f[0] == ia})
        progs = progs_cti + sum(f[-1] for f in resto_prog if f[0] == ia)
        cti_pais = sum(f[-1] for f in pais if f[0] == ia and f[1] >= 0)
        total_pais = sum(f[-1] for f in pais if f[0] == ia)
        resumen[str(anio)] = {'cti': cti, 'total': total, 'programasCti': progs_cti,
                              'programas': progs, 'ctiPais': cti_pais, 'totalPais': total_pais}

    meta = {
        'anios': anios,
        'referencia': anios[-1],
        'municipio': 'Medellín',
        'fuente': 'Sistema Nacional de Información de la Educación Superior - SNIES',
        'generado': date.today().isoformat(),
        'columnas': {
            'filas': ['anio', 'programa', 'area', 'nivel', 'modalidad', 'sexo', 'matricula'],
            'resto': ['anio', 'ies', 'nivel', 'modalidad', 'sexo', 'matricula'],
            'restoProg': ['anio', 'ies', 'nivel', 'modalidad', 'programas'],
            'pais': ['anio', 'area', 'nivel', 'modalidad', 'sector', 'sexo', 'matricula']
        },
        'resumen': resumen
    }
    os.makedirs(carpeta, exist_ok=True)
    destino = os.path.join(carpeta, 'cti.js')
    peso = escribir(destino, {'meta': meta, 'dim': dim, 'filas': filas, 'resto': resto,
                              'restoProg': resto_prog, 'pais': pais})

    for anio in anios:
        r = resumen[str(anio)]
        print('  %d: %s estudiantes en CTi en Medellín, %s de %s · Colombia %s · %s de %s programas'
              % (anio, miles(r['cti']), pct(r['cti'], r['total']), miles(r['total']),
                 pct(r['ctiPais'], r['totalPais']), miles(r['programasCti']), miles(r['programas'])))
    for tipo, c in avisos.items():
        print('  Aviso: %s -> %s' % (tipo, '; '.join('%s (%d)' % kv for kv in c.most_common(8))))
    print('  %s instituciones · %s programas · %s filas de Medellín · %s de Colombia'
          % (len(dim['ies']), len(dim['programa']), miles(len(filas) + len(resto)), miles(len(pais))))
    print('Escrito %s (%.0f KB)' % (destino, peso / 1024.0))


if __name__ == '__main__':
    main()
