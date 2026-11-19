#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tablero pertinencia programas de formación
Observatorio de Sapiencia (OdeS)
Julián Gallego Villa · octubre de 2026

Convierte los anexos 2, 3 y 4 de la Resolución 3411 de 2026 y la base de
programas en el módulo datos/pertinencia.js que consume el tablero.

Uso:
  python3 etl_pertinencia.py insumos datos
"""

import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

import openpyxl

# ---------------------------------------------------------------------------
# 1. Parámetros
# ---------------------------------------------------------------------------
entrada = Path(sys.argv[1] if len(sys.argv) > 1 else 'insumos')
salida = Path(sys.argv[2] if len(sys.argv) > 2 else 'datos')

anexo2 = 'ANEXO2_MARCACION_OCUPACIONES.xlsx'
anexo3 = 'ANEXO3_HABILITACION_CINE-CUOC.xlsx'
anexo4 = 'ANEXO4_INDICE_DE_PERTINENCIA_POR_CAMPO.xlsx'
programas_xlsx = '261026Programas_OPE.xlsx'

referentes_orden = [
    'Energía Sostenible', 'Moda y Fabricación Avanzada', 'Medellín Health City',
    'Hábitat Sostenible', 'Turismo de Negocios', 'Negocios Digitales',
    'Agroalimentario', 'Industrias Creativas', 'Habilidades Digitales',
    'Medellín Capital Creativa', 'Distrito Bilingüe']


# ---------------------------------------------------------------------------
# 2. Utilidades
# ---------------------------------------------------------------------------
def hoja(archivo, nombre):
    wb = openpyxl.load_workbook(entrada / archivo, read_only=True, data_only=True)
    return [list(r) for r in wb[nombre].iter_rows(values_only=True)]


def norm(t):
    t = unicodedata.normalize('NFD', str(t)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', t).strip().lower()


def entero(v):
    return int(round(float(v))) if v not in (None, '') else 0


def limpio(t):
    return re.sub(r'\s+', ' ', str(t)).strip()


# ---------------------------------------------------------------------------
# 3. Referentes (tabla 1)
# ---------------------------------------------------------------------------
referentes = []
for r in hoja(anexo2, 'Referentes')[6:]:
    if not r[0] or r[1] not in ('Clúster', 'Proyecto'):
        continue
    referentes.append({
        'nombre': limpio(r[0]), 'tipo': r[1], 'alcance': limpio(r[2]),
        'denominaciones': entero(r[3]), 'ocupaciones': entero(r[4])})
referentes.sort(key=lambda x: referentes_orden.index(x['nombre']))
idx_ref = {x['nombre']: i for i, x in enumerate(referentes)}

# ---------------------------------------------------------------------------
# 4. Ocupaciones (tabla 3)
# ---------------------------------------------------------------------------
ocupaciones = {}
for r in hoja(anexo2, 'Marcación ocupaciones')[6:]:
    if not r[0] or not re.match(r'^\d{5}$', str(r[0])):
        continue
    marcas = [k for k, v in enumerate(r[3:14]) if entero(v) == 1]
    ocupaciones[str(r[0])] = {
        'codigo': str(r[0]), 'nombre': limpio(r[1]), 'descripcion': limpio(r[2] or ''),
        'referentes': marcas, 'relacionada': entero(r[15]) == 1}
print(f'Ocupaciones: {len(ocupaciones)}')

n_denominaciones = sum(1 for r in hoja(anexo2, 'Marcación denominaciones')[6:]
                       if r[10] and re.match(r'^\d{5}\.\d{3}$', str(r[10])))
print(f'Denominaciones: {n_denominaciones}')

# ---------------------------------------------------------------------------
# 5. Campos e índice (tablas 5 y 6)
# ---------------------------------------------------------------------------
campos = []
for r in hoja(anexo4, 'Indice por campo')[6:]:
    if not r[0] or not str(r[0]).startswith('C'):
        continue
    campos.append({
        'codigo': r[0], 'nombre': limpio(r[1]),
        'dir': entero(r[2]), 'comp': entero(r[3]),
        'relDir': entero(r[4]), 'relComp': entero(r[5]),
        'num': float(r[6]), 'den': float(r[7]), 'pop': float(r[8]), 'ip': entero(r[9]),
        'puntaje': {'pregrado': entero(r[10]), 'efe': entero(r[11]), 'em': entero(r[12])},
        'porReferente': [entero(v) for v in r[13:24]]})
campos.sort(key=lambda c: c['codigo'])
idx_campo = {c['codigo']: i for i, c in enumerate(campos)}
print(f'Campos detallados: {len(campos)}')

tabla6 = hoja(anexo4, 'Tabla de puntajes')
puntajes = {'pregrado': [], 'em': [], 'efe': []}
for r in tabla6[6:]:
    if r[0] is not None and r[1] is not None:
        puntajes['pregrado'].append({'indice': limpio(r[0]), 'puntaje': entero(r[1])})
    if r[3] is not None and r[4] is not None:
        puntajes['em'].append({'indice': limpio(r[3]), 'puntaje': entero(r[4])})
    if r[6] is not None and r[7] is not None:
        puntajes['efe'].append({'indice': limpio(r[6]), 'puntaje': entero(r[7])})

# ---------------------------------------------------------------------------
# 6. Habilitaciones (tabla 4)
# ---------------------------------------------------------------------------
habilitaciones = defaultdict(list)
n_hab = 0
for r in hoja(anexo3, 'Relación CINE-CUOC')[6:]:
    if not r[0] or not str(r[0]).startswith('C'):
        continue
    cod_oc = str(r[2])
    if cod_oc not in ocupaciones:
        print(f'  Aviso: ocupación {cod_oc} sin ficha en la tabla 3')
        ocupaciones[cod_oc] = {'codigo': cod_oc, 'nombre': limpio(r[3]), 'descripcion': '',
                               'referentes': [], 'relacionada': entero(r[6]) == 1}
    habilitaciones[r[0]].append([cod_oc, 1 if r[4] == 'Directa' else 0])
    n_hab += 1
print(f'Habilitaciones: {n_hab}')

# Verificación: los conteos de la tabla 5 se reproducen desde la tabla 4.
dif_tablas = 0
for c in campos:
    pares = habilitaciones.get(c['codigo'], [])
    d = sum(1 for p in pares if p[1] == 1)
    k = sum(1 for p in pares if p[1] == 0)
    rd = sum(1 for p in pares if p[1] == 1 and ocupaciones[p[0]]['relacionada'])
    rk = sum(1 for p in pares if p[1] == 0 and ocupaciones[p[0]]['relacionada'])
    if (d, k, rd, rk) != (c['dir'], c['comp'], c['relDir'], c['relComp']):
        dif_tablas += 1
        print(f"  Diferencia en {c['codigo']}: tabla 5 {(c['dir'], c['comp'], c['relDir'], c['relComp'])} "
              f'vs tabla 4 {(d, k, rd, rk)}')

# ---------------------------------------------------------------------------
# 7. Programas
# ---------------------------------------------------------------------------
# Una fila por registro de la base (un código SNIES cada una). La unidad de
# análisis es el campo detallado CINE del programa: se cruza por nombre con
# los campos de la tabla 5 y de ahí salen las ocupaciones, el índice y el
# puntaje. Las instituciones se agrupan por nombre (las seccionales comparten
# el nombre de su institución).
filas = [list(r) for r in openpyxl.load_workbook(
    entrada / programas_xlsx, read_only=True, data_only=True)['Programas'].iter_rows(values_only=True)]
col = {n: i for i, n in enumerate(filas[0])}
campo_por_nombre = {norm(c['nombre']): i for i, c in enumerate(campos)}

niveles_orden = [
    'Formación técnica profesional', 'Tecnológico', 'Universitario',
    'Especialización técnico profesional', 'Especialización tecnológica',
    'Especialización universitaria', 'Especialización médico quirúrgica',
    'Maestría', 'Doctorado']


# Algunos nombres del SNIES traen "¿" en lugar de una letra con tilde
# (MAESTR¿A, DISE¿O) y signos de interrogación sueltos en los extremos. Cada
# palabra dañada se repara con la variante que aparece bien escrita en los
# nombres y títulos de la misma base; un "¿" solo entre espacios es un guion.
palabras = defaultdict(int)
for r in filas[1:]:
    for c in ('NOMBRE_DEL_PROGRAMA', 'TITULO_OTORGADO'):
        for w in re.findall(r'[^\W\d_]+', str(r[col[c]] or '').upper()):
            palabras[w] += 1
reparadas = 0
# Palabras cuya variante más frecuente en la base no es la correcta.
fijas = {'LINGU¿STICA': 'LINGÜÍSTICA'}
# Otros nombres traen tildes graves o diéresis por error (ENFERMERÌA,
# ADMINISTRACIÒN, INGENIERÏA): en español solo va la tilde aguda.
graves = str.maketrans('ÀÈÌÒÙàèìòùÏËÔïëô', 'ÁÉÍÓÚáéíóúÍÉÓíéó')
tildadas = 0


def tildes(t):
    global tildadas
    nuevo = t.translate(graves).replace('CONÉNFASIS', 'CON ÉNFASIS')
    tildadas += nuevo != t
    return nuevo


def reparar_palabra(m):
    w = m.group(0)
    if w.upper() in fijas:
        return fijas[w.upper()] if w.isupper() else fijas[w.upper()].capitalize()
    mayus = w.replace('¿', '').isupper()
    for letras in ('ÁÉÍÓÚÑÜ', 'AEIOU'):
        cand = max(((palabras[w.upper().replace('¿', x)], x) for x in letras), default=(0, ''))
        if cand[0] >= 2:
            return w.replace('¿', cand[1] if mayus else cand[1].lower())
    return w.strip('¿')


def reparar(t):
    global reparadas
    if '¿' not in t and '?' not in t:
        return t
    reparadas += 1
    t = t.strip('?¿ ')
    t = re.sub(r'(?<=\s)¿(?=\s)', '-', t)
    return re.sub(r'[\w¿]*¿[\w¿]*', reparar_palabra, t)


def valor(r, columna):
    v = r[col[columna]]
    return tildes(reparar(limpio(v))) if v is not None else ''


registros = []
sin_campo = 0
for r in filas[1:]:
    if r[col['CÓDIGO_SNIES_DEL_PROGRAMA']] in (None, ''):
        continue
    k = campo_por_nombre.get(norm(valor(r, 'CINE_F_2013_AC_CAMPO_DETALLADO')))
    if k is None:
        sin_campo += 1
        print(f"  Aviso: SNIES {r[col['CÓDIGO_SNIES_DEL_PROGRAMA']]} sin campo detallado en la tabla 5")
        continue
    modalidad = valor(r, 'MODALIDAD')
    # Tercer dato del subtítulo, para distinguir programas con el mismo nombre:
    # "Virtual" en los programas virtuales y el domicilio en los demás (unos
    # pocos registros de la base no traen municipio ni departamento).
    lugar = 'Virtual' if modalidad == 'Virtual' else (
        valor(r, 'MUNICIPIO_OFERTA_PROGRAMA') or valor(r, 'DEPARTAMENTO_OFERTA_PROGRAMA')
        or 'Sin domicilio registrado')
    registros.append({
        'codigo': entero(r[col['CÓDIGO_SNIES_DEL_PROGRAMA']]), 'nombre': valor(r, 'NOMBRE_DEL_PROGRAMA'),
        'ies': valor(r, 'NOMBRE_INSTITUCIÓN'), 'sector': valor(r, 'SECTOR'),
        'nivel': valor(r, 'NIVEL_DE_FORMACIÓN'), 'acad': valor(r, 'NIVEL_ACADÉMICO'),
        'modalidad': modalidad, 'lugar': lugar, 'campo': k,
        'ip': r[col['INDICE_PERTINENCIA']], 'puntaje': r[col['PUNTAJE_PERTINENCIA']]})

# Verificación: el índice y el puntaje de la base coinciden con los del campo
# (pregrado para los programas de pregrado, posgrado nacional para los demás).
dif_ip = dif_pt = vacios = 0
for p in registros:
    c = campos[p['campo']]
    linea = 'pregrado' if p['acad'] == 'Pregrado' else 'efe'
    if p['ip'] in (None, '') or p['puntaje'] in (None, ''):
        vacios += 1
    if p['ip'] not in (None, '') and entero(p['ip']) != c['ip']:
        dif_ip += 1
        print(f"  Aviso: SNIES {p['codigo']} con índice {p['ip']} en la base y {c['ip']} en su campo")
    if p['puntaje'] not in (None, '') and entero(p['puntaje']) != c['puntaje'][linea]:
        dif_pt += 1
        print(f"  Aviso: SNIES {p['codigo']} con puntaje {p['puntaje']} en la base y {c['puntaje'][linea]} en su línea")
print(f'  Índice distinto al del campo: {dif_ip}; puntaje distinto al de su línea: {dif_pt}; '
      f'sin índice o puntaje en la base (no se comparan): {vacios}')
print(f'  Textos con "¿" o "?" reparados: {reparadas}; con tildes graves corregidas: {tildadas}')
if dif_tablas or dif_ip or dif_pt or sin_campo:
    sys.exit('Los datos no siguen el procedimiento de los anexos (ver los avisos de arriba); '
             'no se escribe pertinencia.js.')

ies_nombres = sorted({p['ies'] for p in registros}, key=norm)
idx_ies = {n: i for i, n in enumerate(ies_nombres)}
sector_ies = {p['ies']: p['sector'] for p in registros}
ies = [{'nombre': n, 'corto': n, 'sector': sector_ies[n]} for n in ies_nombres]

acad_nivel = {p['nivel']: p['acad'] for p in registros}
niveles_nombres = [n for n in niveles_orden if n in acad_nivel] + sorted(set(acad_nivel) - set(niveles_orden))
idx_nivel = {n: i for i, n in enumerate(niveles_nombres)}
niveles = [{'nombre': n, 'acad': acad_nivel[n]} for n in niveles_nombres]

conteo_mod = defaultdict(int)
for p in registros:
    conteo_mod[p['modalidad']] += 1
modalidades = sorted(conteo_mod, key=lambda m: (-conteo_mod[m], m))
idx_mod = {m: i for i, m in enumerate(modalidades)}
lugares = sorted({p['lugar'] for p in registros}, key=norm)
idx_lugar = {l: i for i, l in enumerate(lugares)}

registros.sort(key=lambda p: (norm(p['nombre']), norm(p['ies']), norm(p['lugar']), p['codigo']))
# Cada programa va como fila [código SNIES, nombre, institución, nivel,
# modalidad, campo, lugar] (los cuatro índices apuntan a ies, niveles,
# modalidades y lugares) para que el archivo pese menos.
programas = [[p['codigo'], p['nombre'], idx_ies[p['ies']], idx_nivel[p['nivel']],
              idx_mod[p['modalidad']], p['campo'], idx_lugar[p['lugar']]] for p in registros]
print(f'Programas: {len(programas)} de {len(ies)} instituciones (sin campo detallado: {sin_campo})')

# ---------------------------------------------------------------------------
# 8. Escritura
# ---------------------------------------------------------------------------
datos = {
    'meta': {
        'resolucion': 'Resolución 3411 del 9 de octubre de 2026',
        'cuoc': 'CUOC 2024 (Ministerio del Trabajo y DANE)',
        'cine': 'CINE 2013 A.C., adaptación para Colombia',
        'corteSnies': '11 de septiembre de 2026',
        'elaboracion': 'Observatorio de Sapiencia, 29 de septiembre de 2026',
        'programasFuente': 'SNIES, base de programas 261026Programas_OPE (26 de octubre de 2026)',
        'generado': date.today().isoformat(),
        'resumen': {'campos': len(campos), 'ocupaciones': len(ocupaciones),
                    'relacionadas': sum(1 for o in ocupaciones.values() if o['relacionada']),
                    'denominaciones': n_denominaciones,
                    'habilitaciones': n_hab, 'programas': len(programas)}
    },
    'referentes': referentes,
    'campos': campos,
    'ocupaciones': sorted(ocupaciones.values(), key=lambda o: o['codigo']),
    'habilitaciones': {k: v for k, v in sorted(habilitaciones.items())},
    'puntajes': puntajes,
    'ies': ies,
    'niveles': niveles,
    'modalidades': modalidades,
    'lugares': lugares,
    'programas': programas
}

salida.mkdir(parents=True, exist_ok=True)
cuerpo = json.dumps(datos, ensure_ascii=False, separators=(',', ':'))
(salida / 'pertinencia.js').write_text(
    '/* Pertinencia de los programas de formación: anexos de la Resolución 3411 de 2026.\n'
    '   Fuente: Observatorio de Sapiencia (OdeS). Generado por etl_pertinencia.py el '
    f'{date.today().isoformat()}. No editar a mano. */\n'
    'window.ODES = window.ODES || {};\n'
    f'window.ODES.pertinencia = {cuerpo};\n', encoding='utf-8')
print(f"Escrito {salida / 'pertinencia.js'} ({(salida / 'pertinencia.js').stat().st_size // 1024} KB)")
