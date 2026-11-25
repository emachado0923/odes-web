"""
ETL del tablero "Matrícula en educación superior en Medellín (2000-2025)".

Lee la matrícula del SNIES (Ministerio de Educación Nacional) en los archivos
RET_MAT_MEN_<año>.xlsx (y RET_MAT_MEN_2000_2013.xlsx), una carpeta o un .zip
que los traiga, y escribe el JSON que lee el tablero:

    python3 etl_matricula_historica.py <carpeta o .zip> [--salida <json>] [--nombres <matricula.js>]

Por defecto la salida es apps/web/public/tableros/matricula-historica/datos/matricula.json
y los nombres cortos de instituciones y programas salen del tablero de 2025
(apps/server/datos/tableros/matricula-2025/matricula.js), cuando el código existe allí.

Reglas
------
- Dato anual: la suma de MAT en las filas con MAT_OFICIAL = "Si". En los datos
  del MEN esa marca va en el primer semestre de todas las IES, salvo el SENA
  (COD_IES 9110), que reporta su matrícula anual en el segundo semestre.
- Medellín: los programas ofrecidos en el municipio (COD_MPIO_PROG = 5001),
  con el detalle por programa, institución, nivel, modalidad, área, núcleo
  básico (NBC), sector y sexo. Antioquia (COD_DPTO_PROG = 5) y Colombia van
  como referencia: totales por año, por nivel, por sector y por sexo.
- Las categorías cambian de nombre entre años (y traen errores de digitación):
  se estandarizan con las tablas de abajo (NIVEL, MODALIDAD, NBC, AREA,
  SECTOR, SEXO). Un valor que no esté en ellas detiene el ETL: hay que
  agregarlo a la tabla, no adivinarlo.

Necesita pandas y openpyxl.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import io
import json
import os
import re
import unicodedata
import sys
import zipfile
from collections import defaultdict

import openpyxl
import pandas as pd

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SALIDA = os.path.join(RAIZ, 'apps', 'web', 'public', 'tableros', 'matricula-historica', 'datos', 'matricula.json')
NOMBRES_2025 = os.path.join(RAIZ, 'apps', 'server', 'datos', 'tableros', 'matricula-2025', 'matricula.js')

MEDELLIN, ANTIOQUIA, SENA = 5001, 5, 9110
FUENTE = 'Sistema Nacional de Información de la Educación Superior (SNIES), Ministerio de Educación Nacional'

# ---------------------------------------------------------------- categorías

NIVELES = ['Formación técnica profesional', 'Tecnológico', 'Universitario', 'Especialización', 'Maestría', 'Doctorado']
ACAD_DE_NIVEL = [0, 0, 0, 1, 1, 1]  # posición en NIVELES_ACAD
NIVELES_ACAD = ['Pregrado', 'Posgrado']
NIVEL = {
    'Tecnica profesional': 'Formación técnica profesional',
    'Formación técnica profesional': 'Formación técnica profesional',
    'Tecnológica': 'Tecnológico',
    'Tecnológico': 'Tecnológico',
    'Universitaria': 'Universitario',
    'Universitario': 'Universitario',
    'Especialización': 'Especialización',
    'Especialización universitaria': 'Especialización',
    'Especialización tecnológica': 'Especialización',
    'Especialización técnico profesional': 'Especialización',
    'Especialización técnico profesion': 'Especialización',
    'Especialización médico quirúrgica': 'Especialización',
    'Maestría': 'Maestría',
    'Doctorado': 'Doctorado',
}

MODALIDADES = ['Presencial', 'A distancia', 'Virtual', 'Dual', 'Híbrida', 'Sin definir']
MODALIDAD = {
    'Presencial': 'Presencial',
    'A distancia (tradicional)': 'A distancia',
    'Distancia (tradicional)': 'A distancia',
    'A distancia': 'A distancia',
    'A distancia (virtual)': 'Virtual',
    'Distancia (virtual)': 'Virtual',
    'Virtual': 'Virtual',
    'Dual': 'Dual',
    'Presencial-Virtual': 'Híbrida',
    'Híbrida (Presencial-Virtual)': 'Híbrida',
    'Híbrida (A distancia-Virtual)': 'Híbrida',
    'Presencial-A distancia': 'Híbrida',
    'Presencial-Dual': 'Híbrida',
    'Presencial-Virtual-A distancia': 'Híbrida',
    'Virtual-A distancia': 'Híbrida',
    'Virtual-Dual': 'Híbrida',
    'Sin metodología definida': 'Sin definir',
}

AREA = {'Sin información': 'Sin clasificar'}

# Núcleos básicos del conocimiento: el nombre vigente de cada uno. Los demás
# quedan como vienen.
NBC = {
    'Antropologia, artes liberales': 'Antropología, artes liberales',
    'Antropología y  artes liberales': 'Antropología, artes liberales',
    'Arquitectura': 'Arquitectura y afines',
    'Ates plasticas visuales y afines': 'Artes plásticas, visuales y afines',
    'Bibliotecologia y otros de ciencias sociales y humanas': 'Bibliotecología, otros de ciencias sociales y humanas',
    'Ciencia politica y relaciones internacionales': 'Ciencia política, relaciones internacionales',
    'Disenio': 'Diseño',
    'Iingeniería industrial, alimentos y afines': 'Ingeniería agroindustrial, alimentos y afines',
    'Ingenieria admnistrativa y afines': 'Ingeniería administrativa y afines',
    'Optometria y otros programas de ciencias de la salud': 'Optometría, otros programas de ciencias de la salud',
    'Sin información': 'Sin clasificar',
}

SECTORES = ['Oficial', 'Privado']
SECTOR = {'Oficial': 'Oficial', 'Privada': 'Privado', 'Privado': 'Privado'}

SEXOS = ['Femenino', 'Masculino', 'No binario', 'Trans']
SEXO = {'Hombre': 'Masculino', 'Mujer': 'Femenino', 'Masculino': 'Masculino', 'Femenino': 'Femenino', 'No binario': 'No binario', 'Trans': 'Trans'}

COLUMNAS = ['ANIO', 'SEMESTRE', 'MAT', 'MAT_OFICIAL', 'COD_IES', 'NOM_IES', 'SECTOR_IES', 'CARACTER_IES', 'COD_SNIES',
            'PROGRAMA', 'NIVEL_FORMACION', 'MODALIDAD', 'AREA_CONOCIMIENTO', 'NBC', 'COD_DPTO_PROG', 'COD_MPIO_PROG', 'SEXO']


# ---------------------------------------------------------------- lectura

def libros(origen: str):
    """(nombre, bytes o ruta) de cada RET_MAT_MEN_*.xlsx de una carpeta o un .zip."""
    if origen.lower().endswith('.zip'):
        with zipfile.ZipFile(origen) as z:
            for nombre in sorted(z.namelist()):
                base = os.path.basename(nombre)
                if base.startswith('RET_MAT_MEN') and base.endswith('.xlsx') and '__MACOSX' not in nombre:
                    yield base, io.BytesIO(z.read(nombre))
    else:
        for ruta in sorted(glob.glob(os.path.join(origen, '**', 'RET_MAT_MEN*.xlsx'), recursive=True)):
            yield os.path.basename(ruta), ruta


def leer(origen: str) -> pd.DataFrame:
    partes = []
    for nombre, archivo in libros(origen):
        wb = openpyxl.load_workbook(archivo, read_only=True)
        for ws in wb.worksheets:
            filas = ws.iter_rows(values_only=True)
            cab = [('MAT' if re.fullmatch(r'MAT_\d{4}(_\d{4})?', str(c or '')) else ('MODALIDAD' if c == 'METODOLOGIA' else c)) for c in next(filas)]
            faltan = [c for c in COLUMNAS if c not in cab]
            if faltan:
                sys.exit(f'{nombre}: faltan las columnas {faltan}')
            pos = [cab.index(c) for c in COLUMNAS]
            datos = [[f[i] for i in pos] for f in filas if f and any(v is not None for v in f)]
            partes.append(pd.DataFrame(datos, columns=COLUMNAS))
            print(f'  {nombre}: {len(datos)} filas', file=sys.stderr)
        wb.close()
    if not partes:
        sys.exit(f'No hay archivos RET_MAT_MEN_*.xlsx en {origen}')
    return pd.concat(partes, ignore_index=True)


# ---------------------------------------------------------------- limpieza

def estandarizar(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d['ANIO'] = pd.to_numeric(d['ANIO'], errors='raise').astype(int)
    d['MAT'] = pd.to_numeric(d['MAT'], errors='raise').astype(int)
    d['COD_IES'] = pd.to_numeric(d['COD_IES'], errors='raise').astype(int)
    # Casi todos son números, pero el SENA trae códigos como "SENA-1": se guardan como texto ("123", no "123.0").
    d['COD_SNIES'] = d['COD_SNIES'].map(lambda v: str(v).strip().removesuffix('.0'))
    d['MPIO'] = pd.to_numeric(d['COD_MPIO_PROG'], errors='coerce')
    d['DPTO'] = pd.to_numeric(d['COD_DPTO_PROG'], errors='coerce')
    d['MAT_OFICIAL'] = d['MAT_OFICIAL'].astype(str).str.strip()
    for col, tabla in [('NIVEL_FORMACION', NIVEL), ('MODALIDAD', MODALIDAD), ('SECTOR_IES', SECTOR), ('SEXO', SEXO)]:
        sin = sorted(set(d[col].dropna()) - set(tabla))
        if sin or d[col].isna().any():
            sys.exit(f'{col}: valores sin estandarizar {sin} (o vacíos). Agréguelos a la tabla del ETL.')
        d[col] = d[col].map(tabla)
    d['AREA_CONOCIMIENTO'] = d['AREA_CONOCIMIENTO'].fillna('Sin clasificar').replace(AREA)
    d['NBC'] = d['NBC'].fillna('Sin clasificar').replace(NBC)
    return d


MINUSCULAS = {'a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'u', 'y'}
SIGLAS = {'sena', 'eafit', 'ces', 'itm', 'unad', 'upb', 'esap', 'cesde', 'tic', 'tics', 'sst', 'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix'}
# Los nombres viejos del SNIES vienen sin tildes: se corrigen las palabras más comunes.
TILDES = {
    'academica': 'académica', 'administracion': 'administración', 'andres': 'andrés', 'area': 'área',
    'autonoma': 'autónoma', 'biologia': 'biología', 'catolica': 'católica', 'comunicacion': 'comunicación',
    'construccion': 'construcción', 'direccion': 'dirección', 'economia': 'economía', 'educacion': 'educación',
    'electrica': 'eléctrica', 'electronica': 'electrónica', 'enfermeria': 'enfermería', 'estadistica': 'estadística',
    'filosofia': 'filosofía', 'fisica': 'física', 'fundacion': 'fundación', 'geografia': 'geografía', 'gestion': 'gestión',
    'informacion': 'información', 'informatica': 'informática', 'ingenieria': 'ingeniería', 'institucion': 'institución',
    'logistica': 'logística', 'matematicas': 'matemáticas', 'mecanica': 'mecánica', 'medico': 'médico',
    'musica': 'música', 'nutricion': 'nutrición', 'odontologia': 'odontología', 'pedagogica': 'pedagógica',
    'politecnico': 'politécnico', 'produccion': 'producción', 'psicologia': 'psicología', 'publica': 'pública',
    'quimica': 'química', 'tecnica': 'técnica', 'tecnico': 'técnico', 'tecnologia': 'tecnología',
    'tecnologica': 'tecnológica', 'tecnologico': 'tecnológico', 'teologia': 'teología', 'tomas': 'tomás',
    'corporacion': 'corporación', 'maestria': 'maestría', 'especializacion': 'especialización', 'gerencia': 'gerencia',
}


def titulo(texto: str) -> str:
    """'FUNDACION UNIVERSITARIA DE ANTIOQUIA' -> 'Fundación Universitaria de Antioquia' (siglas conocidas en mayúsculas)."""
    palabras = re.split(r'(\s+|-|/|\(|\))', str(texto).strip().lower())
    salida, primera = [], True
    for p in palabras:
        if not p or re.fullmatch(r'\s+|-|/|\(|\)', p):
            salida.append(p)
            continue
        p = TILDES.get(p, p)
        if p.strip('.,') in SIGLAS:
            salida.append(p.upper())
        elif not primera and p in MINUSCULAS:
            salida.append(p)
        else:
            salida.append(p[:1].upper() + p[1:])
        primera = False
    return re.sub(r'\s+', ' ', ''.join(salida)).strip()


def llave_nombre(texto: str) -> str:
    """Para juntar la misma institución con códigos distintos: sin tildes, sin la sigla del final ni signos."""
    t = unicodedata.normalize('NFD', str(texto).lower()).encode('ascii', 'ignore').decode()
    t = re.sub(r'\s*(-\s*[a-z]+\s*-?|\([^)]*\))\s*$', '', t)
    return re.sub(r'[^a-z0-9]', '', t)


def nombres_2025(ruta: str) -> tuple[dict, dict]:
    """Del tablero de 2025: código de IES -> (nombre, corto) y código SNIES -> nombre del programa."""
    if not ruta or not os.path.exists(ruta):
        return {}, {}
    texto = open(ruta, encoding='utf-8').read()
    datos = json.loads(texto[texto.index('{', texto.index('window.ODES.matricula')):].rstrip().rstrip(';'))
    ies = {}
    for i in datos['dim']['ies']:
        for codigo in i['codigos']:
            ies[int(codigo)] = (i['nombre'], i['corto'])
    programas = {p['codigo']: p['nombre'] for p in datos['dim']['programa']}
    return ies, programas


# ---------------------------------------------------------------- armado

def armar(d: pd.DataFrame, ruta_nombres: str) -> dict:
    oficial = d[d['MAT_OFICIAL'] == 'Si']
    anios = list(range(int(oficial['ANIO'].min()), int(oficial['ANIO'].max()) + 1))
    pos_anio = {a: i for i, a in enumerate(anios)}
    ies_2025, programas_2025 = nombres_2025(ruta_nombres)

    med = oficial[oficial['MPIO'] == MEDELLIN]
    ultimo = med.sort_values(['ANIO', 'SEMESTRE']).groupby('COD_IES').last()
    # Instituciones: van juntas las que el tablero de 2025 agrupa (varios códigos) y las que tienen el mismo
    # nombre con otro código (seccionales); el nombre es el del tablero de 2025 si alguno de sus códigos está allá.
    grupos: dict[str, dict] = {}
    for cod, fila in ultimo.sort_index().iterrows():
        nombre, corto = ies_2025.get(cod, (titulo(fila['NOM_IES']), None))
        g = grupos.setdefault(llave_nombre(nombre), {'nombre': nombre, 'corto': corto, 'caracter': fila['CARACTER_IES'],
                                                     'ultimo': fila['ANIO'], 'codigos': []})
        if corto and not g['corto']:
            g.update(nombre=nombre, corto=corto)
        if fila['ANIO'] > g['ultimo']:
            g.update(caracter=fila['CARACTER_IES'], ultimo=fila['ANIO'])
        g['codigos'].append(str(cod))
    ies = [{'nombre': g['nombre'], 'corto': g['corto'] or g['nombre'], 'caracter': g['caracter'], 'codigos': g['codigos']}
           for g in sorted(grupos.values(), key=lambda g: g['nombre'])]
    ies_de_codigo = {int(c): n for n, i in enumerate(ies) for c in i['codigos']}

    ultimo_prog = med.sort_values(['ANIO', 'SEMESTRE']).groupby('COD_SNIES').last()
    programas, pos_prog = [], {}
    for cod, fila in ultimo_prog.iterrows():
        pos_prog[cod] = len(programas)
        programas.append({'codigo': cod, 'nombre': programas_2025.get(cod) or titulo(fila['PROGRAMA']),
                          'ies': ies_de_codigo[int(fila['COD_IES'])]})

    areas = sorted(set(med['AREA_CONOCIMIENTO']) - {'Sin clasificar'}) + ['Sin clasificar']
    nbcs = sorted(set(med['NBC']) - {'Sin clasificar'}) + ['Sin clasificar']
    idx = {'nivel': NIVELES, 'modalidad': MODALIDADES, 'area': areas, 'nbc': nbcs, 'sector': SECTORES, 'sexo': SEXOS}
    pos = {k: {v: i for i, v in enumerate(lista)} for k, lista in idx.items()}

    # Filas de Medellín: una por año, programa y atributos, con la matrícula por sexo.
    llave = ['ANIO', 'COD_SNIES', 'NIVEL_FORMACION', 'MODALIDAD', 'AREA_CONOCIMIENTO', 'NBC', 'SECTOR_IES']
    tabla = med.pivot_table(index=llave, columns='SEXO', values='MAT', aggfunc='sum', fill_value=0)
    tabla = tabla.reindex(columns=SEXOS, fill_value=0)
    filas = []
    for (anio, cod, nivel, modalidad, area, nbc, sector), valores in tabla.iterrows():
        if not valores.sum():
            continue
        filas.append([pos_anio[anio], pos_prog[cod], pos['nivel'][nivel], pos['modalidad'][modalidad], pos['area'][area],
                      pos['nbc'][nbc], pos['sector'][sector], *[int(v) for v in valores]])
    filas.sort()

    def referencia(x: pd.DataFrame) -> dict:
        """Total por año y el cubo nivel × sector × sexo × año: el tablero suma lo que dejen los filtros de nivel y sector."""
        total = x.groupby('ANIO')['MAT'].sum().reindex(anios, fill_value=0)
        g = x.groupby(['NIVEL_FORMACION', 'SECTOR_IES', 'SEXO', 'ANIO'])['MAT'].sum()
        cubo = [[[[int(g.get((n, s, x_, a), 0)) for a in anios] for x_ in SEXOS] for s in SECTORES] for n in NIVELES]
        return {'total': [int(v) for v in total], 'cubo': cubo}

    # Matrícula de programas que no tienen semestre oficial ese año: queda fuera del dato anual.
    grupo = ['ANIO', 'COD_IES', 'COD_SNIES', 'COD_MPIO_PROG', 'SEXO']
    con_oficial = d.groupby(grupo)['MAT_OFICIAL'].transform(lambda s: (s == 'Si').any())
    fuera = d[~con_oficial & (d['MPIO'] == MEDELLIN)]
    fuera_anio = fuera.groupby('ANIO')['MAT'].sum().reindex(anios, fill_value=0)

    return {
        'meta': {
            'municipio': 'Medellín',
            'desde': anios[0],
            'hasta': anios[-1],
            'fuente': FUENTE,
            'generado': dt.date.today().isoformat(),
            'regla': 'Matrícula anual: filas con MAT_OFICIAL = Si (primer semestre; segundo semestre para el SENA).',
            # Matrícula de programas de Medellín que ese año solo reportaron el semestre no oficial.
            'fueraDelDatoAnual': [int(v) for v in fuera_anio],
        },
        'anios': anios,
        'dim': {
            'ies': ies,
            'programa': programas,
            'nivel': NIVELES,
            'nivelAcad': NIVELES_ACAD,
            'acadDeNivel': ACAD_DE_NIVEL,
            'modalidad': MODALIDADES,
            'area': areas,
            'nbc': nbcs,
            'sector': SECTORES,
            'sexo': SEXOS,
        },
        # [año, programa, nivel, modalidad, área, nbc, sector, femenino, masculino, no binario, trans]
        'filas': filas,
        'referencia': {'Antioquia': referencia(oficial[oficial['DPTO'] == ANTIOQUIA]), 'Colombia': referencia(oficial)},
    }


def revisar(datos: dict) -> None:
    """Cuadres mínimos: la suma de las filas de Medellín es la del total, año por año."""
    por_anio = defaultdict(int)
    for f in datos['filas']:
        por_anio[f[0]] += sum(f[7:])
    for i, anio in enumerate(datos['anios']):
        print(f'  {anio}: Medellín {por_anio[i]:>9,} · Antioquia {datos["referencia"]["Antioquia"]["total"][i]:>9,} · '
              f'Colombia {datos["referencia"]["Colombia"]["total"][i]:>10,}'.replace(',', '.'), file=sys.stderr)
        assert por_anio[i] <= datos['referencia']['Antioquia']['total'][i] <= datos['referencia']['Colombia']['total'][i]


def principal() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('origen', help='carpeta o .zip con los RET_MAT_MEN_*.xlsx')
    p.add_argument('--salida', default=SALIDA)
    p.add_argument('--nombres', default=NOMBRES_2025, help='matricula.js del tablero de 2025 (nombres de IES y programas)')
    a = p.parse_args()
    print('Leyendo los archivos del MEN…', file=sys.stderr)
    datos = armar(estandarizar(leer(a.origen)), a.nombres)
    revisar(datos)
    os.makedirs(os.path.dirname(a.salida), exist_ok=True)
    with open(a.salida, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Escrito {a.salida} ({os.path.getsize(a.salida) / 1e6:.1f} MB, {len(datos["filas"])} filas, '
          f'{len(datos["dim"]["programa"])} programas, {len(datos["dim"]["ies"])} instituciones)', file=sys.stderr)


if __name__ == '__main__':
    principal()
