"""ETL del tablero «Beneficiarios de los fondos de Sapiencia (2026)» (/tableros/fondos-2026).

Lee el modelo de datos del Power BI de seguimiento de los fondos (Tablero.pbix) y escribe
fondos.json, con SOLO cifras agregadas: ningún documento, nombre, teléfono, correo, dirección ni
monto de una persona sale de aquí. Lo carga en la base `npm run tableros:cargar-fondos`.

Uso (pbixray y pyarrow solo hacen falta para este script):

    uv run --with pbixray --with pyarrow python etl_fondos.py <Tablero.pbix> [fondos.json]

Qué se publica y por qué así (pedido del 17-nov-2026: tablero público con agregados):
- Un «beneficio» es una persona en una convocatoria de un programa (el docconv del Power BI).
- estados: beneficios por programa, convocatoria, periodo renovado y estado del periodo. Sin
  características de las personas: un estado como «desertor» nunca se cruza con sexo, comuna o
  institución.
- sexo, comunas e ies: solo beneficios ACTIVOS en cada periodo, por programa (cada uno por separado,
  sin cruzarlos entre sí).
- giros: monto girado por programa y periodo (en Línea Pregrado, también matrícula y sostenimiento).
  No se publica el monto por convocatoria ni por institución: con pocas personas sería el de alguien.
- cohortes: beneficios de cada convocatoria por su estado en el último periodo registrado.
- destinos: beneficios de Enlaza Mundos por convocatoria y país de destino.
- Fuera del tablero: el fondo del Consejo Distrital de Juventud (CDJ), con muy pocos beneficios
  (8 en pregrado y 1 en Extendiendo Fronteras): publicar sus cifras sería publicar a esas personas.
"""
import json
import re
import sys
import unicodedata
from datetime import date

import pandas as pd
from pbixray import PBIXRay

ENTRADA = sys.argv[1]
SALIDA = sys.argv[2] if len(sys.argv) > 2 else 'fondos.json'


def sin_tildes(texto):
    texto = unicodedata.normalize('NFD', str(texto))
    return ''.join(c for c in texto if unicodedata.category(c) != 'Mn')


def clave(texto):
    if texto is None or (isinstance(texto, float) and pd.isna(texto)) or texto is pd.NA:
        return ''
    return re.sub(r'\s+', ' ', sin_tildes(texto).upper()).strip()


# ── Programas ──────────────────────────────────────────────────────────────
# Línea Pregrado se separa por fondo (columna fondo_sapiencia de BASE 0 PREGRADO).
PROGRAMAS = [
    {'clave': 'EPM', 'nombre': 'Fondo EPM', 'corto': 'Fondo EPM', 'linea': 'Pregrado'},
    {'clave': 'PP', 'nombre': 'Fondo Presupuesto Participativo', 'corto': 'Presupuesto Participativo', 'linea': 'Pregrado'},
    # PUAP: Programa Único de Acceso y Permanencia (confirmado por el usuario el 17-nov-2026); RO = recursos
    # ordinarios, PP = Presupuesto Participativo, como en las fuentes de Extendiendo Fronteras.
    {'clave': 'PUAP RO', 'nombre': 'Programa Único de Acceso y Permanencia, recursos ordinarios', 'corto': 'PUAP recursos ordinarios', 'linea': 'Pregrado'},
    {'clave': 'PUAP PP', 'nombre': 'Programa Único de Acceso y Permanencia, Presupuesto Participativo', 'corto': 'PUAP Presupuesto Participativo', 'linea': 'Pregrado'},
    {'clave': 'MB', 'nombre': 'Becas Mejores Bachilleres', 'corto': 'Mejores Bachilleres', 'linea': 'Pregrado'},
    {'clave': 'MD', 'nombre': 'Becas Mejores Deportistas', 'corto': 'Mejores Deportistas', 'linea': 'Pregrado'},
    {'clave': 'FA', 'nombre': 'Formación Avanzada', 'corto': 'Formación Avanzada', 'linea': 'Posgrado'},
    {'clave': 'EFE', 'nombre': 'Extendiendo Fronteras Educativas', 'corto': 'Extendiendo Fronteras', 'linea': 'Posgrado'},
    {'clave': 'EM', 'nombre': 'Enlaza Mundos', 'corto': 'Enlaza Mundos', 'linea': 'Movilidad internacional'},
]
LINEA_PREGRADO = ['EPM', 'PP', 'PUAP RO', 'PUAP PP']

# ── Estados (uno común para las seis bases) ────────────────────────────────
# En el orden del recorrido de un beneficio. «Cobro o condonación (PACC)» es el estado NOTIFICADO de
# las bases: ya se le notificó el paso al cobro y/o la condonación (en los datos, todas esas filas
# tienen pacc = SI y motivo «Paso al cobro…»).
ESTADOS = ['Activo', 'Suspensión', 'Finalizó los giros', 'Graduado', 'Periodo de gracia', 'Proceso de consolidación',
           'Cobro o condonación (PACC)', 'Desertor', 'Terminación o cancelación']
MAPA_ESTADO = {
    'ACTIVO': 'Activo',
    'SUSPENSION TEMPORAL': 'Suspensión', 'SUSPENSION ESPECIAL': 'Suspensión',
    'SUSPENSION VOLUNTARIA': 'Suspensión', 'SUSPENSION': 'Suspensión',
    'PERIODO DE GRACIA': 'Periodo de gracia',
    'FINALIZACION': 'Finalizó los giros', 'FINALIZA': 'Finalizó los giros',
    # Enlaza Mundos: cada fila es un giro; «NO ACTIVO» es un periodo ya girado y cerrado.
    'NO ACTIVO': 'Finalizó los giros',
    'GRADUADO': 'Graduado',
    'CONDONADO': 'Cobro o condonación (PACC)',
    'DESERTOR': 'Desertor',
    'CANCELACION': 'Terminación o cancelación', 'TERMINACION ESPECIAL': 'Terminación o cancelación',
    'TERMINACION BECA': 'Terminación o cancelación', 'RENUNCIA A BECA': 'Terminación o cancelación',
    'TERMINACION DEL CREDITO': 'Terminación o cancelación',
    'PROCESO DE CONSOLIDACION': 'Proceso de consolidación',
    'NOTIFICADO': 'Cobro o condonación (PACC)',
}

SEXOS = ['Mujer', 'Hombre', 'Otro o sin dato']

# ── Comunas y corregimientos de Medellín (código del dato: «7 - ROBLEDO») ──
COMUNAS = {
    1: 'Popular', 2: 'Santa Cruz', 3: 'Manrique', 4: 'Aranjuez', 5: 'Castilla', 6: 'Doce de Octubre',
    7: 'Robledo', 8: 'Villa Hermosa', 9: 'Buenos Aires', 10: 'La Candelaria', 11: 'Laureles-Estadio',
    12: 'La América', 13: 'San Javier', 14: 'El Poblado', 15: 'Guayabal', 16: 'Belén',
    50: 'San Sebastián de Palmitas', 60: 'San Cristóbal', 70: 'Altavista', 80: 'San Antonio de Prado',
    90: 'Santa Elena',
}
SIN_COMUNA = 'Fuera de Medellín o sin dato'


def comuna_de(valor):
    k = clave(valor)
    m = re.match(r'^(\d+)\s*-\s*(.*)$', k)
    if not m or 'NO APLICA' in m.group(2):
        return SIN_COMUNA
    return COMUNAS.get(int(m.group(1)), SIN_COMUNA)


# ── Instituciones: el mismo nombre escrito de varias formas en las bases ──
# Clave sin tildes y en mayúsculas → nombre que se publica. Un nombre que no esté aquí se publica con
# nombre_visible() y el script lo avisa al final, para agregarlo.
_CANON = {
    'Institución Universitaria Colegio Mayor de Antioquia': ['COLEGIO MAYOR DE ANTIOQUIA', 'INSTITUCION UNIVERSITARIA COLEGIO MAYOR DE ANTIOQUIA'],
    'Corporación Academia Superior de Artes': ['CORPORACION ACADEMIA SUPERIOR DE ARTES'],
    'Corporación Academia Tecnológica de Colombia (ATEC)': ['CORPORACION ACADEMIA TECNOLOGICA DE COLOMBIA - ATEC', 'CORPORACION ACADEMIA TECNOLOGICA DE COLOMBIA -ATEC-', 'CORPORACION ACADEMIA TECNOLOGICA DE COLOMBIA ATEC'],
    'Corporación Colegiatura Colombiana': ['CORPORACION COLEGIATURA COLOMBIANA'],
    'Corporación Educativa Instituto Técnico Superior de Artes (Ideartes)': ['CORPORACION EDUCATIVA INSTITUTO TECNICO SUPERIOR DE ARTES - IDEARTES'],
    'Corporación Unificada Nacional de Educación Superior (CUN)': ['CORPORACION UNIFICADA NACIONAL DE EDUCACION SUPERIOR-CUN-'],
    'Corporación Universitaria Adventista (UNAC)': ['CORPORACION UNIVERSITARIA ADVENTISTA', 'CORPORACION UNIVERSITARIA ADVENTISTA - UNAC'],
    'Corporación Universitaria Americana': ['CORPORACION UNIVERSITARIA AMERICANA'],
    'Corporación Universitaria de Ciencia y Desarrollo (Uniciencia)': ['CORPORACION UNIVERSITARIA DE CIENCIA Y DESARROLLO - UNICIENCIA MEDELLIN', 'CORPORACION UNIVERSITARIA DE CIENCIA Y DESARROLLO - UNICIENCIA Y/O CORPORACION ALTA GERENCIA'],
    'Corporación Universitaria de Colombia Ideas': ['CORPORACION UNIVERSITARIA DE COLOMBIA IDEAS'],
    'Corporación Universitaria de Sabaneta (Unisabaneta)': ['CORPORACION UNIVERSITARIA DE SABANETA - UNISABANETA', 'CORPORACION UNIVERSITARIA DE SABANETA UNISABANETA'],
    'Corporación Universitaria Lasallista': ['CORPORACION UNIVERSITARIA LASALLISTA'],
    'Corporación Universitaria Minuto de Dios (UNIMINUTO)': ['CORPORACION UNIVERSITARIA MINUTO DE DIOS', 'CORPORACION UNIVERSITARIA MINUTO DE DIOS - UNIMINUTO', 'CORPORACION UNIVERSITARIA MINUTO DE DIOS -UNIMINUTO-'],
    'Corporación Universitaria Remington': ['CORPORACION UNIVERSITARIA REMINGTON'],
    'Corporación Universitaria U de Colombia': ['CORPORACION UNIVERSITARIA U DE COLOMBIA'],
    'Escuela Normal Superior Antioqueña': ['ENS ANTIOQUENA MEDELLIN - ESCUELA NORMAL SUPERIOR'],
    'Universidad ECCI': ['UNIVERSIDAD ECCI', 'ESCUELA COLOMBIANA DE CARRERAS INDUSTRIALES'],
    'Escuela de Tecnologías de Antioquia (ETA)': ['ESCUELA DE TECNOLOGIAS DE ANTIOQUIA -ETA-'],
    'Escuela Superior de Administración Pública (ESAP)': ['ESCUELA SUPERIOR DE ADMINISTRACION PUBLICA - ESAP', 'ESCUELA SUPERIOR DE ADMINISTRACION PUBLICA-ESAP-'],
    'Escuela Superior Tecnológica de Artes Débora Arango': ['ESCUELA SUPERIOR TECNOLOGICA DE ARTES DEBORA ARANGO', 'TECNOLOGICO DE ARTES DEBORA ARANGO INSTITUCION REDEFINIDA'],
    'Institución Universitaria Escolme': ['INSTITUCION UNIVERSITARIA ESCOLME', 'FUNDACION ESCUELA COLOMBIANA DE MERCADOTECNIA -ESCOLME-'],
    'Universidad del Norte': ['UNIVERSIDAD DEL NORTE', 'FUNDACION UNIVERSIDAD DEL NORTE'],
    'Fundación Universitaria CEIPA': ['FUNDACION UNIVERSITARIA CEIPA', 'FUNDACION UNIVERSITARIA - CEIPA', 'FUNDACION UNIVERSITARIA-CEIPA-'],
    'Fundación Universitaria Autónoma de las Américas': ['FUNDACION UNIVERSITARIA AUTONOMA DE LAS AMERICAS'],
    'Fundación Universitaria Bellas Artes': ['FUNDACION UNIVERSITARIA BELLAS ARTES'],
    'Fundación Universitaria Católica del Norte': ['FUNDACION UNIVERSITARIA CATOLICA DEL NORTE'],
    'Fundación Universitaria Claretiana (Uniclaretiana)': ['FUNDACION UNIVERSITARIA CLARETIANA', 'FUNDACION UNIVERSITARIA CLARETIANA - UNICLARETIANA'],
    'Fundación Universitaria del Área Andina': ['FUNDACION UNIVERSITARIA DEL AREA ANDINA'],
    'Fundación Universitaria Esumer': ['FUNDACION UNIVERSITARIA ESUMER'],
    'Fundación Universitaria Los Libertadores': ['FUNDACION UNIVERSITARIA LOS LIBERTADORES'],
    'Fundación Universitaria María Cano': ['FUNDACION UNIVERSITARIA MARIA CANO'],
    'Fundación Universitaria San Martín': ['FUNDACION UNIVERSITARIA SAN MARTIN'],
    'Fundación Universitaria Seminario Bíblico de Colombia': ['FUNDACION UNIVERSITARIA SEMINARIO BIBLICO DE COLOMBIA', 'FUNDACION UNIVERSITARIA SEMINARIO BIBLICO DE COLOMBIA - FUSBC'],
    'Fundación Universitaria Seminario Teológico Bautista Internacional': ['FUNDACION UNIVERSITARIA SEMINARIO TEOLOGICO BAUTISTA INTERNACIONAL'],
    'Instituto Tecnológico Metropolitano (ITM)': ['INSTITUTO TECNOLOGICO METROPOLITANO', 'INSTITUTO TECNOLOGICO METROPOLITANO - ITM', 'INSTITUCION UNIVERSITARIA - ITM', 'INSTITUCION UNIVERSITARIA ITM', 'ITM'],
    'Institución Universitaria de Envigado': ['INSTITUCION UNIVERSITARIA DE ENVIGADO'],
    'Institución Universitaria Digital de Antioquia': ['INSTITUCION UNIVERSITARIA DIGITAL DE ANTIOQUIA', 'INSTITUCION UNIVERSITARIA DIGITAL DE ANTIOQUIA -IU. DIGITAL'],
    'Institución Universitaria Marco Fidel Suárez': ['INSTITUCION UNIVERSITARIA MARCO FIDEL SUAREZ', 'INSTITUCION UNIVERSITARIA MARCO FIDEL SUAREZ - IUMAFIS'],
    'Institución Universitaria Pascual Bravo': ['INSTITUCION UNIVERSITARIA PASCUAL BRAVO'],
    'Institución Universitaria Salazar y Herrera': ['INSTITUCION UNIVERSITARIA SALAZAR Y HERRERA'],
    'Institución Universitaria Visión de las Américas': ['INSTITUCION UNIVERSITARIA VISION DE LAS AMERICAS'],
    'Politécnico Colombiano Jaime Isaza Cadavid': ['POLITECNICO COLOMBIANO JAIME ISAZA CADAVID'],
    'Politécnico Grancolombiano': ['POLITECNICO GRANCOLOMBIANO', 'POLITECNICO GRAN COLOMBIANO'],
    'Politécnico Internacional': ['POLITECNICO INTERNACIONAL INSTITUCION DE EDUCACION SUPERIOR'],
    'Servicio Nacional de Aprendizaje (SENA)': ['SERVICIO NACIONAL DE APRENDIZAJE-SENA-'],
    'Tecnológico de Antioquia': ['TECNOLOGICO DE ANTIOQUIA', 'INSTITUCION UNIVERSITARIA TECNOLOGICO DE ANTIOQUIA', 'TECNOLOGICO DE ANTIOQUIA INSTITUCION UNIVERSITARIA'],
    'Universidad Antonio Nariño': ['UNIVERSIDAD ANTONIO NARINO'],
    'Universidad Autónoma de Bucaramanga (UNAB)': ['UNIVERSIDAD AUTONOMA DE BUCARAMANGA - UNAB'],
    'Universidad Autónoma de Manizales': ['UNIVERSIDAD AUTONOMA DE MANIZALES'],
    'Universidad Autónoma Latinoamericana (UNAULA)': ['UNIVERSIDAD AUTONOMA LATINOAMERICANA - UNAULA', 'UNIVERSIDAD AUTONOMA LATINOAMERICANA-UNAULA-'],
    'Universidad Católica de Manizales': ['UNIVERSIDAD CATOLICA DE MANIZALES'],
    'Universidad Católica de Oriente': ['UNIVERSIDAD CATOLICA DE ORIENTE', 'UNIVERSIDAD CATOLICA DE ORIENTE - UCO'],
    'Universidad Católica Luis Amigó': ['UNIVERSIDAD CATOLICA LUIS AMIGO', 'UNIVERSIDAD CATOLICA LUIS AMIGO-FUNLAM'],
    'Universidad CES': ['UNIVERSIDAD CES'],
    'Universidad Cooperativa de Colombia': ['UNIVERSIDAD COOPERATIVA DE COLOMBIA'],
    'Universidad de Antioquia': ['UNIVERSIDAD DE ANTIOQUIA'],
    'Universidad de Caldas': ['UNIVERSIDAD DE CALDAS'],
    'Universidad de Cartagena': ['UNIVERSIDAD DE CARTAGENA'],
    'Universidad de Córdoba': ['UNIVERSIDAD DE CORDOBA'],
    'Universidad de La Sabana': ['UNIVERSIDAD DE LA SABANA'],
    'Universidad de La Salle': ['UNIVERSIDAD DE LA SALLE'],
    'Universidad de Manizales': ['UNIVERSIDAD DE MANIZALES'],
    'Universidad de Medellín': ['UNIVERSIDAD DE MEDELLIN'],
    'Universidad de Nariño': ['UNIVERSIDAD DE NARINO'],
    'Universidad de San Buenaventura': ['UNIVERSIDAD DE SAN BUENAVENTURA'],
    'Universidad de Santander (UDES)': ['UNIVERSIDAD DE SANTANDER - UDES'],
    'Universidad del Tolima': ['UNIVERSIDAD DEL TOLIMA'],
    'Universidad del Valle': ['UNIVERSIDAD DEL VALLE'],
    'Universidad EAFIT': ['UNIVERSIDAD EAFIT'],
    'Universidad EAN': ['UNIVERSIDAD EAN'],
    'Universidad EIA': ['UNIVERSIDAD EIA'],
    'Universidad El Bosque': ['UNIVERSIDAD EL BOSQUE'],
    'Universidad Icesi': ['UNIVERSIDAD ICESI'],
    'Universidad Nacional Abierta y a Distancia (UNAD)': ['UNIVERSIDAD NACIONAL ABIERTA Y A DISTANCIA', 'UNIVERSIDAD NACIONAL ABIERTA Y A DISTANCIA UNAD'],
    'Universidad Nacional de Colombia': ['UNIVERSIDAD NACIONAL DE COLOMBIA'],
    'Universidad Pontificia Bolivariana': ['UNIVERSIDAD PONTIFICIA BOLIVARIANA', 'UNIVERSIDAD PONTIFICIA BOLIVARIANA - UPB'],
    'Universidad Santo Tomás': ['UNIVERSIDAD SANTO TOMAS'],
    'Universidad Simón Bolívar': ['UNIVERSIDAD SIMON BOLIVAR'],
    'Universidad Tecnológica de Pereira (UTP)': ['UNIVERSIDAD TECNOLOGICA DE PEREIRA - UTP'],
}
CANON_IES = {k: nombre for nombre, claves in _CANON.items() for k in claves}
IES_SIN_CANON = set()
SIN_IES = 'Sin dato'
SIGLAS = {'ITM', 'UPB', 'CES', 'EIA', 'SENA', 'UCO', 'ESAP', 'UNAD', 'CEIPA', 'EAFIT', 'UNIMINUTO', 'CUN', 'ATEC'}
MINUSCULAS = {'de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'el', 'para', 'a'}
TILDES = {'Institucion': 'Institución', 'Politecnico': 'Politécnico', 'Tecnologico': 'Tecnológico',
          'Catolica': 'Católica', 'Medellin': 'Medellín', 'Corporacion': 'Corporación', 'Educacion': 'Educación',
          'Fundacion': 'Fundación', 'Maria': 'María', 'Jose': 'José', 'Tecnica': 'Técnica', 'Tecnologia': 'Tecnología',
          'Bogota': 'Bogotá', 'Autonoma': 'Autónoma', 'Narino': 'Nariño', 'Suarez': 'Suárez', 'Publica': 'Pública',
          'Mexico': 'México', 'Espana': 'España', 'Peru': 'Perú', 'Japon': 'Japón', 'Canada': 'Canadá',
          'Belgica': 'Bélgica', 'Republica': 'República', 'Panama': 'Panamá', 'Paises': 'Países', 'Singapur': 'Singapur'}
# Enlaza Mundos: el mismo destino escrito de varias formas.
ALIAS_PAIS = {'HOLANDA': 'PAISES BAJOS', 'THE NETHERLANDS': 'PAISES BAJOS', 'INGLATERRA': 'REINO UNIDO',
              'ESCOCIA': 'REINO UNIDO', 'LONDRES': 'REINO UNIDO', 'USA': 'ESTADOS UNIDOS', 'UNITED STATES': 'ESTADOS UNIDOS',
              'EEUU': 'ESTADOS UNIDOS', 'KOREA': 'COREA DEL SUR', 'COREA': 'COREA DEL SUR',
              'REINO UNIDO, FRANCIA Y GRECIA': 'VARIOS PAISES'}


def nombre_visible(k):
    """De «UNIVERSIDAD CATOLICA LUIS AMIGO» a «Universidad Católica Luis Amigó»."""
    palabras = []
    for i, w in enumerate(k.split(' ')):
        if w in SIGLAS:
            palabras.append(w)
        elif i > 0 and w.lower() in MINUSCULAS:
            palabras.append(w.lower())
        else:
            t = w[:1] + w[1:].lower()
            palabras.append(TILDES.get(t, t))
    # Siglas entre guiones: «Superior-cun-» → «Superior (CUN)».
    return re.sub(r'\s*-([a-z]+)-', lambda m: f' ({m.group(1).upper()})', ' '.join(palabras))


def ies_de(valor):
    k = clave(valor)
    if not k or k in {'NO APLICA', 'N/A', 'NA', 'SIN DATO', '0'}:
        return SIN_IES
    if k in CANON_IES:
        return CANON_IES[k]
    IES_SIN_CANON.add(k)
    return nombre_visible(k)


def monto_de(valor):
    """Montos escritos como «8949300», «12813489.00» o vacíos."""
    if valor is None or valor is pd.NA or (isinstance(valor, float) and pd.isna(valor)):
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    t = str(valor).strip().replace('$', '').replace(' ', '')
    if not t:
        return 0.0
    if re.fullmatch(r'\d+(\.\d+)?', t):
        return float(t)
    if re.fullmatch(r'\d{1,3}(\.\d{3})+(,\d+)?', t):  # 1.234.567,89
        return float(t.replace('.', '').replace(',', '.'))
    if re.fullmatch(r'\d{1,3}(,\d{3})+(\.\d+)?', t):  # 1,234,567.89
        return float(t.replace(',', ''))
    try:
        return float(t.replace(',', '.'))
    except ValueError:
        raise ValueError(f'monto ilegible: {valor!r}')


def sexo_de(valor):
    k = clave(valor)
    return 'Mujer' if k == 'MUJER' else 'Hombre' if k == 'HOMBRE' else 'Otro o sin dato'


def periodo_de(valor):
    k = clave(valor)
    return k if re.fullmatch(r'\d{4}-[123]', k) else None


# ── Lectura del modelo ─────────────────────────────────────────────────────
print('Leyendo', ENTRADA)
modelo = PBIXRay(ENTRADA)
corte = pd.Timestamp(modelo.get_table('UltimaActualizacion_InformacionTransaccional')['UltimaActualizacion'].iloc[0])
base0 = modelo.get_table('BASE 0 PREGRADO')
resumen = modelo.get_table('Tabla_Resumen_Pregrado')[['docconvfondo', 'GENERO', 'COMUNA DE RESIDENCIA']]

filas = []  # una por beneficio y periodo: programa, beneficio, convocatoria, periodo, estado, sexo, comuna, ies, montos

# Línea Pregrado
b = base0.merge(resumen, on='docconvfondo', how='left', validate='many_to_one')
b = b[b['fondo_sapiencia'].isin(LINEA_PREGRADO)]
filas.append(pd.DataFrame({
    'programa': b['fondo_sapiencia'], 'beneficio': b['docconvfondo'], 'convocatoria': b['convocatoria'],
    'periodo': b['periodo_renovado'], 'estado': b['ESTADO SEMESTRAL'], 'sexo': b['GENERO'],
    'comuna': b['COMUNA DE RESIDENCIA'], 'ies': b['ies'],
    'matricula': b['monto_matricula'].map(monto_de), 'sostenimiento': b['monto_sostenimiento'].map(monto_de),
}))

# Los otros cinco programas: (tabla, llave del beneficio, periodo, convocatoria, estado, sexo, comuna, ies, monto)
OTROS = {
    'MB': ('BASE MB', ['DOCUMENTO DE IDENTIDAD', 'CONVOCATORIA'], 'periodo_renovado', 'CONVOCATORIA',
           'ESTADO PERIODO RENOVADO', 'Sexo', 'Comuna_de_residencia', 'IES_estudia_actualmente', 'MONTO DESEMBOLSADO'),
    'MD': ('BASE MD', ['ID CONCATENADO (ID Usuario-ID conv)'], 'PERÍODO RENOVADO', 'CONVOCATORIA',
           'ESTADO PERÍODO RENOVADO', 'SEXO', 'COMUNA O CORREGIMIENTO DONDE RESIDE', 'UNIVERSIDAD', 'MONTO DESEMBOLSADO'),
    'FA': ('BASE FA', ['docconv'], 'PERIODO RENOVADO', 'CONVOCATORIA', 'ESTADO PERIODO RENOVADO', 'SEXO',
           'COMUNA O CORREGIMIENTO DONDE RESIDE', 'UNIVERSIDAD', 'MONTO GIRADO PERÍODO RENOVADO'),
    'EFE': ('BASE EFE', ['docconv'], 'PERÍODO RENOVADO', 'CONVOCATORIA', 'ESTADO PERÍODO (SEMESTRAL)', 'GÉNERO',
            'NOMBRE COMUNA', 'UNIVERSIDAD', 'VALOR PAGADO SAPIENCIA PERÍODO'),
    'EM': ('BASE EM', ['docconv'], 'PERIODO RENOVADO', 'CONVOCATORIA', 'Estado Período girado', 'GENERO',
           'COMUNA O CORREGIMIENTO DONDE RESIDE', None, 'Monto desembolsado Período'),
}
destinos_fuente = None
for prog, (tabla, llave, per, conv, est, sexo, com, ies, mon) in OTROS.items():
    d = modelo.get_table(tabla)
    if prog == 'EFE':
        d = d[~d['FUENTE DE FINANCIACION'].astype(str).str.contains('JUVENTUD', na=False)]
    if prog == 'EM':
        destinos_fuente = d
    beneficio = d[llave].astype(str).agg('|'.join, axis=1)
    filas.append(pd.DataFrame({
        'programa': prog, 'beneficio': prog + ':' + beneficio, 'convocatoria': d[conv],
        'periodo': d[per], 'estado': d[est], 'sexo': d[sexo], 'comuna': d[com],
        'ies': d[ies] if ies else 'Universidad en el exterior',
        'matricula': float('nan'), 'sostenimiento': float('nan'), 'monto': d[mon].map(monto_de),
    }))

f = pd.concat(filas, ignore_index=True)
f['monto'] = f['monto'].where(f['programa'].isin(OTROS), f['matricula'] + f['sostenimiento'])
f['periodo'] = f['periodo'].map(periodo_de)
f['convocatoria'] = f['convocatoria'].map(periodo_de)
sin_periodo = int(f['periodo'].isna().sum())
f = f[f['periodo'].notna()]
estado_crudo = f['estado'].map(clave)
desconocidos = sorted(set(estado_crudo) - set(MAPA_ESTADO))
if desconocidos:
    raise SystemExit(f'Estados sin traducir: {desconocidos}')
f['estado'] = estado_crudo.map(MAPA_ESTADO)
f['sexo'] = f['sexo'].map(sexo_de)
f['comuna'] = f['comuna'].map(comuna_de)
f['ies'] = f['ies'].map(lambda v: v if v == 'Universidad en el exterior' else ies_de(v))
sin_convocatoria = int(f['convocatoria'].isna().sum())
f['convocatoria'] = f['convocatoria'].fillna('Sin dato')

# ── Dimensiones (las filas se refieren a ellas por posición) ───────────────
orden_periodo = lambda p: (int(p[:4]), int(p[5:]))  # noqa: E731
periodos = sorted(f['periodo'].unique(), key=orden_periodo)
convocatorias = sorted([c for c in f['convocatoria'].unique() if c != 'Sin dato'], key=orden_periodo)
if sin_convocatoria:
    convocatorias.append('Sin dato')
programas = [p['clave'] for p in PROGRAMAS]
activos = f[f['estado'] == 'Activo']
lista_ies = (activos[activos['programa'] != 'EM'].groupby('ies')['beneficio'].nunique()
             .sort_values(ascending=False).index.tolist())
lista_ies = [i for i in lista_ies if i != SIN_IES] + ([SIN_IES] if SIN_IES in lista_ies else [])
comunas = list(COMUNAS.values()) + [SIN_COMUNA]

ix = {
    'programa': {k: i for i, k in enumerate(programas)},
    'convocatoria': {k: i for i, k in enumerate(convocatorias)},
    'periodo': {k: i for i, k in enumerate(periodos)},
    'estado': {k: i for i, k in enumerate(ESTADOS)},
    'sexo': {k: i for i, k in enumerate(SEXOS)},
    'comuna': {k: i for i, k in enumerate(comunas)},
    'ies': {k: i for i, k in enumerate(lista_ies)},
}


def tuplas(df, columnas, valores):
    out = []
    for r in df.itertuples(index=False):
        fila = [ix[c][getattr(r, c)] for c in columnas]
        for v in valores:
            x = getattr(r, v)
            fila.append(None if pd.isna(x) else int(round(x)))
        out.append(fila)
    return sorted(out)


g = lambda df, cols: df.groupby(cols, sort=False)  # noqa: E731
estados = g(f, ['programa', 'convocatoria', 'periodo', 'estado'])['beneficio'].nunique().rename('n').reset_index()
giros = g(f, ['programa', 'periodo']).agg(
    monto=('monto', 'sum'), matricula=('matricula', lambda s: s.sum(min_count=1)),
    sostenimiento=('sostenimiento', lambda s: s.sum(min_count=1)),
    con_giro=('monto', lambda s: int((s > 0).sum()))).reset_index()
giros = giros[(giros['monto'] > 0) | (giros['con_giro'] > 0)]
ultimo = (f.assign(_o=f['periodo'].map(lambda p: int(p[:4]) * 10 + int(p[5:])).astype('int64'))
          .sort_values('_o', kind='stable').groupby('beneficio').tail(1))
cohortes = g(ultimo, ['programa', 'convocatoria', 'estado'])['beneficio'].nunique().rename('n').reset_index()
sexo = g(activos, ['programa', 'periodo', 'sexo'])['beneficio'].nunique().rename('n').reset_index()
comunas_df = g(activos, ['programa', 'periodo', 'comuna'])['beneficio'].nunique().rename('n').reset_index()
ies_df = g(activos[activos['programa'] != 'EM'], ['programa', 'periodo', 'ies'])['beneficio'].nunique().rename('n').reset_index()

# Enlaza Mundos: país de destino de cada beneficio (en su primera fila).
em = destinos_fuente.assign(beneficio=destinos_fuente['docconv'].astype(str),
                            convocatoria=destinos_fuente['CONVOCATORIA'].map(periodo_de),
                            pais=destinos_fuente['PAIS DESTINO'].map(
                                lambda v: nombre_visible(ALIAS_PAIS.get(clave(v), clave(v))) if clave(v) else 'Sin dato'))
em = em.drop_duplicates('beneficio')
paises = em.groupby('pais')['beneficio'].nunique().sort_values(ascending=False).index.tolist()
ix['pais'] = {k: i for i, k in enumerate(paises)}
em['convocatoria'] = em['convocatoria'].fillna('Sin dato')
destinos = g(em, ['convocatoria', 'pais'])['beneficio'].nunique().rename('n').reset_index()

periodos_regulares = [p for p in periodos if not p.endswith('-3')]
salida = {
    'meta': {
        'titulo': 'Beneficiarios de los fondos de Sapiencia (2026)',
        'corte': corte.strftime('%Y-%m-%d'),
        'periodoActual': periodos_regulares[-1],
        'fuente': 'Bases de seguimiento de los fondos de Sapiencia (información transaccional de analitica_fondos y '
                  'bases operativas de cada programa), según el tablero Power BI de seguimiento de fondos.',
        'generado': date.today().isoformat(),
        'beneficios': int(f['beneficio'].nunique()),
        'filasOrigen': int(len(f)),
        'excluidos': 'Fondo del Consejo Distrital de Juventud (CDJ): muy pocos beneficios para publicarlos.',
    },
    'dim': {
        'programa': PROGRAMAS,
        'convocatoria': convocatorias,
        'periodo': periodos,
        'estado': ESTADOS,
        'sexo': SEXOS,
        'comuna': comunas,
        'ies': lista_ies,
        'pais': paises,
    },
    'estados': tuplas(estados, ['programa', 'convocatoria', 'periodo', 'estado'], ['n']),
    'giros': tuplas(giros, ['programa', 'periodo'], ['monto', 'matricula', 'sostenimiento', 'con_giro']),
    'cohortes': tuplas(cohortes, ['programa', 'convocatoria', 'estado'], ['n']),
    'sexo': tuplas(sexo, ['programa', 'periodo', 'sexo'], ['n']),
    'comunas': tuplas(comunas_df, ['programa', 'periodo', 'comuna'], ['n']),
    'ies': tuplas(ies_df, ['programa', 'periodo', 'ies'], ['n']),
    'destinos': tuplas(destinos, ['convocatoria', 'pais'], ['n']),
}
json.dump(salida, open(SALIDA, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f"Escrito {SALIDA}: {salida['meta']['beneficios']} beneficios, {len(periodos)} periodos, "
      f"{len(convocatorias)} convocatorias, {len(lista_ies)} instituciones; filas sin periodo descartadas: {sin_periodo}; "
      f"sin convocatoria: {sin_convocatoria}")
for k in ('estados', 'giros', 'cohortes', 'sexo', 'comunas', 'ies', 'destinos'):
    print(f'  {k}: {len(salida[k])} filas')
if IES_SIN_CANON:
    print('Instituciones sin nombre oficial en _CANON (se publicaron con nombre_visible):')
    for k in sorted(IES_SIN_CANON):
        print('  ', k)
