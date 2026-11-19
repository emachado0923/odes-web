"""ETL de la ventanilla de consulta de los fondos (/tableros/fondos-2026, pedido del 17-nov-2026).

Lee del Power BI de seguimiento de los fondos (Tablero.pbix) las mismas bases por persona que usan sus
páginas de consulta (Línea Pregrado, Mejores Bachilleres, Mejores Deportistas, Formación Avanzada,
Extendiendo Fronteras, Enlaza Mundos e historial de eventos) y escribe un CSV con UNA FICHA POR
BENEFICIO (documento + programa + convocatoria), lista para `\\copy` a sivu_tablero_fondos_2026_fichas.

DATOS PERSONALES: la salida tiene nombres, documentos, teléfonos y correos. Nunca se escribe dentro del
repositorio ni se versiona: el destino tiene que estar fuera (por defecto, se exige una ruta).

    uv run --with pbixray --with pyarrow python etl_consulta.py <Tablero.pbix> <salida.csv>

La ficha es JSON genérico para que la web no dependa de cada base:
    {"p": clave del programa, "c": convocatoria, "n": nombre, "e": estado,
     "s": [[título, [[etiqueta, valor], ...]], ...],           # secciones de datos
     "t": [[título, [columnas...], [[fila], ...]], ...]}         # tablas (historial por periodo)
Los valores van ya formateados (pesos con separador de miles, fechas AAAA-MM-DD).

Cada ficha se guarda comprimida (zlib con un diccionario de las etiquetas, en base64): son ~170 MB de
JSON y la subida a Supabase es lenta; así pesan ~65 MB. El diccionario va en la primera fila, con el
documento DICCIONARIO (que la búsqueda nunca acepta: lleva guiones bajos), y el servidor lo lee junto con
cada consulta (consulta-fondos.controller.ts). El diccionario solo tiene etiquetas: ningún dato personal.
"""
import base64
import csv
import json
import os
import re
import sys
import unicodedata
import zlib

import pandas as pd
from pbixray import PBIXRay

if len(sys.argv) < 3:
    sys.exit('Uso: etl_consulta.py <Tablero.pbix> <salida.csv> (la salida tiene datos personales: fuera del repositorio)')
ENTRADA, SALIDA = sys.argv[1], sys.argv[2]
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..'))
if os.path.abspath(SALIDA).startswith(REPO + os.sep):
    sys.exit('La salida tiene datos personales: escríbala fuera del repositorio.')

modelo = PBIXRay(ENTRADA)


def tabla(nombre):
    return modelo.get_table(nombre)


def vacio(v):
    return v is None or v is pd.NA or v is pd.NaT or (isinstance(v, float) and pd.isna(v)) or str(v).strip() in ('', 'nan', 'NaN', 'None', 'NaT')


def doc(v):
    """Documento normalizado: mayúsculas, sin espacios, puntos ni guiones (la búsqueda hace lo mismo)."""
    if vacio(v):
        return ''
    t = str(v).strip()
    if re.fullmatch(r'\d+\.0', t):
        t = t[:-2]
    return re.sub(r'[\s.\-]', '', t).upper()


def texto(v):
    if vacio(v):
        return ''
    if isinstance(v, pd.Timestamp):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    t = re.sub(r'\s+', ' ', str(v)).strip()
    m = re.fullmatch(r'(\d{4}-\d{2}-\d{2})[ T]00:00:00(\.0+)?', t)
    return m.group(1) if m else t


def pesos(v):
    if vacio(v):
        return ''
    try:
        n = float(str(v).replace('$', '').replace(',', '').strip())
    except ValueError:
        return texto(v)
    return '$ ' + f'{round(n):,}'.replace(',', '.')


def valor(fila, col, tipo):
    if col not in fila.index:
        return ''
    v = fila[col]
    return pesos(v) if tipo == '$' else texto(v)


def seccion(titulo, fila, campos):
    pares = [[et, valor(fila, col, tipo)] for et, col, tipo in campos]
    pares = [p for p in pares if p[1] != '']
    return [titulo, pares] if pares else None


def historial(titulo, filas, campos, col_periodo):
    filas = filas.sort_values(col_periodo, key=lambda s: s.astype(str), kind='stable')
    datos = [[valor(f, col, tipo) for _, col, tipo in campos] for _, f in filas.iterrows()]
    datos = [d for d in datos if any(d)]
    return [titulo, [et for et, _, _ in campos], datos] if datos else None


fichas = []


def agregar(programa, documento, convocatoria, nombre, estado, secciones, tablas):
    d = doc(documento)
    if not d:
        return
    fichas.append((d, programa, texto(convocatoria)[:60], json.dumps({
        'p': programa, 'c': texto(convocatoria), 'n': texto(nombre), 'e': texto(estado),
        's': [s for s in secciones if s], 't': [t for t in tablas if t],
    }, ensure_ascii=False, separators=(',', ':'))))


def por_beneficio(df, col_doc, col_conv, col_periodo, armar):
    df = df.copy()
    df['_doc'] = df[col_doc].map(doc)
    df['_conv'] = df[col_conv].map(texto)
    df = df[df['_doc'] != '']
    for (_, _), grupo in df.groupby(['_doc', '_conv'], sort=False):
        grupo = grupo.sort_values(col_periodo, key=lambda s: s.astype(str), kind='stable')
        armar(grupo.iloc[-1], grupo)


# ── Línea Pregrado (EPM, PP, PUAP): BASE 0 PREGRADO por periodo + PERSONAL + ACADEMICA + resumen ──────
FONDO = {'EPM': 'EPM', 'PP': 'PP', 'PUAP RO': 'PUAP RO', 'PUAP PP': 'PUAP PP'}


def clave_fondo(v):
    t = re.sub(r'\s+', ' ', unicodedata.normalize('NFD', texto(v)).encode('ascii', 'ignore').decode().upper())
    if 'PUAP' in t or 'UNICO' in t:
        return 'PUAP PP' if ('PP' in t.split() or 'PRESUPUESTO' in t) else 'PUAP RO'
    if 'EPM' in t:
        return 'EPM'
    if 'PRESUPUESTO' in t or t == 'PP':
        return 'PP'
    if 'CDJ' in t or 'JUVENTUD' in t:
        return 'CDJ'
    return t[:16] or 'PREGRADO'


base0 = tabla('BASE 0 PREGRADO')
personal = tabla('BASE 0 - PERSONAL').drop_duplicates('docconvfondo', keep='last').set_index('docconvfondo')
academica = tabla('BASE 0 - ACADEMICA').drop_duplicates('docconvfondo', keep='last').set_index('docconvfondo')
resumen = tabla('Tabla_Resumen_Pregrado').drop_duplicates('docconvfondo', keep='last').set_index('docconvfondo')
VACIA = pd.Series(dtype=object)

for clave_dcf, grupo in base0.groupby('docconvfondo', sort=False):
    grupo = grupo.sort_values('periodo_renovado', key=lambda s: s.astype(str), kind='stable')
    u = grupo.iloc[-1]
    pe = personal.loc[clave_dcf] if clave_dcf in personal.index else VACIA
    ac = academica.loc[clave_dcf] if clave_dcf in academica.index else VACIA
    re_ = resumen.loc[clave_dcf] if clave_dcf in resumen.index else VACIA
    agregar(
        clave_fondo(u.get('fondo_sapiencia')), u['DOCUMENTO'], u['convocatoria'],
        pe.get('nombre_completo', ''), re_.get('estado_general', u.get('estado_general')),
        [
            seccion('Beneficio', u, [('Fondo', 'fondo_sapiencia', 't'), ('Convocatoria', 'convocatoria', 't'),
                                     ('Estado general', 'estado_general', 't'), ('Resolución reglamentaria', 'resolucion_reglamentaria', 't'),
                                     ('Operador financiero', 'operador_financiero', 't'), ('ID solicitud', 'id_solicitud', 't'),
                                     ('Contrato', 'nro_contrato', 't'), ('Contrato fiduciario', 'numero_contrato_fiduciario', 't'),
                                     ('También en Mejores Bachilleres', 'En_MB', 't'), ('También en Mejores Deportistas', 'En_MD', 't')]),
            seccion('Cierre y PACC', re_, [('Total desembolsado', 'TOTAL DESEMBOLSADO', '$'), ('Motivo de finalización', 'Motivo_Finalizacion_compilado', 't'),
                                           ('Fecha máxima del periodo de gracia', 'Fecha_Maxima_Periodo_De_Gracia', 't'),
                                           ('PACC', 'pacc', 't'), ('Fecha PACC', 'pacc_fecha', 't')]),
            seccion('Datos personales', pe, [('Nombre', 'nombre_completo', 't'), ('Tipo de documento', 'tipo_documento', 't'),
                                             ('Documento', 'documento', 't'), ('Tarjeta de identidad', 'tarjeta_identidad', 't'),
                                             ('ID usuario TI', 'id_usuario', 't'), ('Celular', 'celular', 't'),
                                             ('Celular alternativo', 'celular_alternativo', 't'), ('Teléfono', 'telefono', 't'),
                                             ('Correo', 'correo', 't'), ('Correo alternativo', 'correo_alternativo', 't'),
                                             ('Municipio de residencia', 'municipio_residencia_actual', 't'),
                                             ('Comuna de residencia', 'comuna_residencia_actual', 't')]),
            seccion('Información académica', ac, [('IES de legalización', 'ies_legalizacion', 't'), ('Programa de legalización', 'programa_legalizacion', 't'),
                                                  ('IES actual', 'ies_actual', 't'), ('Programa actual', 'programa_actual', 't'),
                                                  ('Semestres del programa', 'numero_semestres_programa', 't'),
                                                  ('Créditos del programa', 'numero_total_creditos_programa', 't')]),
        ],
        [historial('Historial por periodo', grupo, [
            ('Periodo', 'periodo_renovado', 't'), ('Estado', 'ESTADO SEMESTRAL', 't'), ('Motivo', 'motivo_estado', 't'),
            ('Modalidad', 'modalidad', 't'), ('Giros realizados', 'giros_realizados', 't'), ('Giros pendientes', 'GIROS PENDIENTES', 't'),
            ('Semestres a financiar', 'semestres_financiar', 't'), ('Matrícula', 'monto_matricula', '$'),
            ('Sostenimiento', 'monto_sostenimiento', '$'), ('Monto total', 'MONTO TOTAL', '$')], 'periodo_renovado')],
    )

# ── Mejores Bachilleres ─────────────────────────────────────────────────────────────────────────
por_beneficio(tabla('BASE MB'), 'DOCUMENTO DE IDENTIDAD', 'CONVOCATORIA', 'periodo_renovado', lambda u, g: agregar(
    'MB', u['DOCUMENTO DE IDENTIDAD'], u['CONVOCATORIA'], u.get('Nombre'), u.get('ESTADO GENERAL'),
    [
        seccion('Beneficio', u, [('Convocatoria', 'CONVOCATORIA', 't'), ('Estado general', 'ESTADO GENERAL', 't'),
                                 ('Motivo del estado', 'MOTIVO ESTADO', 't'), ('Habilitado para renovar', 'Habilitado para renovar', 't'),
                                 ('Resolución de selección', 'Resolucion_seleccionado', 't')]),
        seccion('Datos personales', u, [('Nombre', 'Nombre', 't'), ('Tipo de documento', 'Tipo_de_documento', 't'),
                                        ('Documento', 'DOCUMENTO DE IDENTIDAD', 't'), ('ID usuario TI', 'ID USUARIO (TI)', 't'),
                                        ('Celular', 'Celular', 't'), ('Teléfono fijo', 'Telefono_fijo', 't'), ('Correo', 'Correo', 't'),
                                        ('Correo alterno', 'Correo_alterno', 't'), ('Municipio de residencia', 'Municipio_de_residencia', 't'),
                                        ('Comuna de residencia', 'Comuna_de_residencia', 't')]),
        seccion('Información académica', u, [('IES actual', 'IES_estudia_actualmente', 't'), ('Programa actual', 'Programa_estudia_actualmente', 't'),
                                             ('Cambió de programa o universidad', 'Cambio_Programa_Universidad', 't'),
                                             ('Programa anterior', 'Programa_estudiaba_anteiormente', 't'),
                                             ('Periodo de inicio en la nueva IES', 'Periodo_inicio_nueva_IES_Programa', 't'),
                                             ('Semestres del pregrado', 'Semestres_totales_pregrado', 't'),
                                             ('Créditos del pregrado', 'Creditos_totales_pregrado', 't')]),
    ],
    [historial('Historial por periodo', g, [
        ('Periodo', 'periodo_renovado', 't'), ('Estado', 'ESTADO PERIODO RENOVADO', 't'), ('Modalidad', 'modalidad_estudio', 't'),
        ('Promedio acumulado', 'Promedio_acumulado_carrera', 't'), ('Giros realizados', 'giros_realizados', 't'),
        ('Giros pendientes', 'giros_pendientes', 't'), ('Giros proyectados', 'giros_proyectados', 't'),
        ('Desembolsado en el periodo', 'MONTO DESEMBOLSADO', '$'), ('Total desembolsado', 'monto_total_desembolsado', '$')], 'periodo_renovado')],
))

# ── Mejores Deportistas ─────────────────────────────────────────────────────────────────────────
por_beneficio(tabla('BASE MD'), 'DOCUMENTO BENEFICIARIO', 'CONVOCATORIA', 'PERÍODO RENOVADO', lambda u, g: agregar(
    'MD', u['DOCUMENTO BENEFICIARIO'], u['CONVOCATORIA'], u.get('NOMBRE COMPLETO BENEFICIARIO'), u.get('ESTADO'),
    [
        seccion('Beneficio', u, [('Convocatoria', 'CONVOCATORIA', 't'), ('Estado', 'ESTADO', 't'), ('Motivo del estado', 'MOTIVO ESTADO', 't'),
                                 ('Habilitado para renovar', 'Habilitado para renovar', 't'),
                                 ('Resolución (acto administrativo)', 'N° RESOLUCIÓN (ACTO ADMINISTRATIVO)', 't'),
                                 ('Operador financiero', 'FIDUCIA (OPERADOR)', 't'), ('Contrato', 'CONTRATO', 't')]),
        seccion('Datos personales', u, [('Nombre', 'NOMBRE COMPLETO BENEFICIARIO', 't'), ('Tipo de documento', 'TIPO DOCUMENTO', 't'),
                                        ('Documento', 'DOCUMENTO BENEFICIARIO', 't'), ('ID usuario TI', 'ID USUARIO TI', 't'),
                                        ('Celular', 'CELULAR', 't'), ('Teléfono', 'TELEFONO', 't'), ('Correo', 'CORREO ELECTRONICO', 't'),
                                        ('Correo alterno', 'CORREO ELECTRONICO ALTERNO', 't'), ('Municipio de residencia', 'MUNICIPIO DE RESIDENCIA', 't'),
                                        ('Comuna de residencia', 'COMUNA O CORREGIMIENTO DONDE RESIDE', 't'), ('Tutor', 'NOMBRE TUTOR', 't'),
                                        ('Celular del tutor', 'CELULAR TUTOR', 't'), ('Teléfono del tutor', 'TELEFONO TUTOR', 't'),
                                        ('Correo del tutor', 'CORREO ELECTRONICO TUTOR', 't')]),
        seccion('Información académica y deportiva', u, [('Universidad', 'UNIVERSIDAD', 't'), ('Programa', 'PROGRAMA', 't'),
                                                          ('Universidad anterior', 'UNIVERSIDAD ANTERIOR', 't'),
                                                          ('Créditos totales (SNIES)', 'CREDITOS TOTALES SNIES', 't'),
                                                          ('Créditos mínimos para renovar', 'CREDITOS MINIMOS PARA RENOVAR', 't'),
                                                          ('Deporte', 'DEPORTE', 't'), ('Juegos', 'JUEGOS EN LOS QUE PARICIPO', 't'),
                                                          ('Medalla', 'MEDALLA', 't')]),
    ],
    [historial('Historial por periodo', g, [
        ('Periodo', 'PERÍODO RENOVADO', 't'), ('Estado', 'ESTADO PERÍODO RENOVADO', 't'), ('Modalidad', 'MODALIDAD CRÉDITO', 't'),
        ('Giros realizados', 'N° GIROS REALIZADOS', 't'), ('Giros pendientes', 'GIROS PENDIENTES', 't'),
        ('Semestres pactados', 'TOTAL DE SEMESTRES PACTADOS', 't'), ('Semestres del pregrado', 'No. SEMESTRES PREGRADO', 't'),
        ('Desembolsado en el periodo', 'MONTO DESEMBOLSADO', '$'), ('Total girado', 'TOTAL GIRADO ACTUAL', '$')], 'PERÍODO RENOVADO')],
))

# ── Formación Avanzada ──────────────────────────────────────────────────────────────────────────
por_beneficio(tabla('BASE FA'), 'DOCUMENTO BENEFICIARIO', 'CONVOCATORIA', 'PERIODO RENOVADO', lambda u, g: agregar(
    'FA', u['DOCUMENTO BENEFICIARIO'], u['CONVOCATORIA'], u.get('NOMBRE COMPLETO BENEFICIARIO'), u.get(' ESTADO GENERAL'),
    [
        seccion('Beneficio', u, [('Convocatoria', 'CONVOCATORIA', 't'), ('Estado general', ' ESTADO GENERAL', 't'),
                                 ('Estado del periodo', 'ESTADO PERIODO RENOVADO', 't'), ('Observación del periodo', 'OBSERVACIÓN PERÍODO', 't'),
                                 ('Habilitado para renovar', 'Habilitado para renovar', 't'), ('Operador financiero', 'OPERADOR FINANCIERO', 't'),
                                 ('Contrato', 'NUMERO DE CONTRATO', 't'), ('PACC', 'PACC', 't')]),
        seccion('Datos personales', u, [('Nombre', 'NOMBRE COMPLETO BENEFICIARIO', 't'), ('Tipo de documento', 'TIPO DOCUMENTO', 't'),
                                        ('Documento', 'DOCUMENTO BENEFICIARIO', 't'), ('ID usuario TI', 'ID USUARIO TI', 't'),
                                        ('Celular', 'CELULAR', 't'), ('Celular 2', 'CELULAR 2', 't'), ('Teléfono', 'TELEFONO', 't'),
                                        ('Correo', 'CORREO ELECTRONICO', 't'), ('Correo 2', 'CORREO ELECTRONICO 2', 't'),
                                        ('Municipio de residencia', 'MUNICIPIO RESIDENCIA', 't'),
                                        ('Comuna de residencia', 'COMUNA O CORREGIMIENTO DONDE RESIDE', 't')]),
        seccion('Información académica', u, [('Universidad', 'UNIVERSIDAD', 't'), ('Programa', 'PROGRAMA', 't'),
                                             ('Modalidad de estudio', 'MODALIDAD ESTUDIO', 't')]),
    ],
    [historial('Historial por periodo', g, [
        ('Periodo', 'PERIODO RENOVADO', 't'), ('Estado', 'ESTADO PERIODO RENOVADO', 't'), ('Modalidad', 'MODALIDAD CRÉDITO', 't'),
        ('Semestres del posgrado', 'No. SEMESTRES POSGRADO', 't'), ('Giros pactados', 'No. SEMESTRES A GIRAR (GIROS PACTADOS', 't'),
        ('Giros realizados', 'N° GIROS REALIZADOS', 't'), ('Giros pendientes', 'N° GIROS PENDIENTES', 't'),
        ('Girado en el periodo', 'MONTO GIRADO PERÍODO RENOVADO', '$'), ('Total desembolsado', 'MONTO TOTAL DESEMBOLSADO A LA FECHA', '$')],
        'PERIODO RENOVADO')],
))

# ── Extendiendo Fronteras ───────────────────────────────────────────────────────────────────────
por_beneficio(tabla('BASE EFE'), 'DOCUMENTO BENEFICIARI@', 'CONVOCATORIA', 'PERÍODO RENOVADO', lambda u, g: agregar(
    'EFE', u['DOCUMENTO BENEFICIARI@'], u['CONVOCATORIA'], u.get('NOMBRE COMPLETO BENEFICARI@'), u.get('ESTADO GENERAL ACTUAL'),
    [
        seccion('Beneficio', u, [('Convocatoria', 'CONVOCATORIA', 't'), ('Fuente de financiación', 'FUENTE DE FINANCIACION', 't'),
                                 ('Estado general', 'ESTADO GENERAL ACTUAL', 't'), ('Motivo del estado', 'MOTIVO ESTADO (SEMESTRAL)', 't'),
                                 ('Habilitado para renovar', 'Habilitado para renovar', 't'), ('Operador financiero', 'OPERADOR FINANCIERO', 't'),
                                 ('Contrato', 'NUMERO DE CONTRATO', 't'), ('PACC', 'PACC', 't')]),
        seccion('Datos personales', u, [('Nombre', 'NOMBRE COMPLETO BENEFICARI@', 't'), ('Tipo de documento', 'TIPO DOCUMENTO', 't'),
                                        ('Documento', 'DOCUMENTO BENEFICIARI@', 't'), ('ID usuario TI', 'ID TI', 't'),
                                        ('Celular', 'CELULAR', 't'), ('Teléfono', 'TELEFONO', 't'), ('Correo', 'CORREO ELECTRONICO', 't'),
                                        ('Correo alterno', 'CORREO ALTERNO', 't'), ('Municipio de residencia', 'MUNICIPIO RESIDENCIA', 't'),
                                        ('Comuna de residencia', 'NOMBRE COMUNA', 't')]),
        seccion('Información académica', u, [('Universidad', 'UNIVERSIDAD', 't'), ('Programa', 'PROGRAMA', 't'),
                                             ('Modalidad de estudio', 'MODALIDAD ESTUDIO', 't')]),
    ],
    [historial('Historial por periodo', g, [
        ('Periodo', 'PERÍODO RENOVADO', 't'), ('Estado', 'ESTADO PERÍODO (SEMESTRAL)', 't'), ('Modalidad', 'MODALIDAD', 't'),
        ('Semestres del posgrado', 'No. SEMESTRES POSGRADO', 't'), ('Semestres a financiar', 'No. SEMESTRES A GIRAR (A FINANCIAR)', 't'),
        ('Giros realizados', 'GIROS REALIZADOS', 't'), ('Giros pendientes', 'GIROS PENDIENTES', 't'),
        ('Pagado en el periodo', 'VALOR PAGADO SAPIENCIA PERÍODO', '$'), ('Valor de los giros realizados', 'VALOR GIROS REALIZADOS', '$')],
        'PERÍODO RENOVADO')],
))

# ── Enlaza Mundos ───────────────────────────────────────────────────────────────────────────────
por_beneficio(tabla('BASE EM'), 'DOCUMENTO BENEFICIARI@', 'CONVOCATORIA', 'PERIODO RENOVADO', lambda u, g: agregar(
    'EM', u['DOCUMENTO BENEFICIARI@'], u['CONVOCATORIA'], u.get('NOMBRE COMPLETO BENEFICIARI@'), u.get('ESTADO'),
    [
        seccion('Beneficio', u, [('Convocatoria', 'CONVOCATORIA', 't'), ('Modalidad', 'MODALIDAD', 't'), ('Estado', 'ESTADO', 't'),
                                 ('PACC', 'PACC', 't'), ('Operador financiero', 'OPERADOR FINANCIERO', 't')]),
        seccion('Datos personales', u, [('Nombre', 'NOMBRE COMPLETO BENEFICIARI@', 't'), ('Tipo de documento', 'TIPO DE DOCUMENTO', 't'),
                                        ('Documento', 'DOCUMENTO BENEFICIARI@', 't'), ('ID usuario TI', 'ID TI', 't'),
                                        ('Celular', 'CELULAR', 't'), ('Teléfono', 'TELEFONO', 't'), ('Correo', 'CORREO ELECTRONICO', 't'),
                                        ('Municipio de residencia', 'Municipio_de_residencia', 't'),
                                        ('Comuna de residencia', 'COMUNA O CORREGIMIENTO DONDE RESIDE', 't')]),
        seccion('Destino', u, [('Universidad de destino', 'UNIVERSIDAD DESTINO (EXTERIOR)', 't'), ('País', 'PAIS DESTINO', 't'),
                               ('Programa en el exterior', 'PROGRAMA (EXTERIOR)', 't'), ('Fecha de inicio', 'FECHA DE INICIO', 't'),
                               ('Fecha de terminación', 'FECHA DE TERMINACION', 't'),
                               ('Fecha límite de entrega de documentos', 'FECHA LIMITE DE ENTREGA DE DOCUMENTOS', 't'),
                               ('Total condonado', 'GRAN TOTAL VALOR CONDONADO', '$')]),
    ],
    [historial('Historial por periodo', g, [
        ('Periodo', 'PERIODO RENOVADO', 't'), ('Estado', 'ESTADO', 't'), ('Giro Sapiencia', 'GIRO SAPIENCIA', '$'),
        ('Giro 1 ICETEX', 'GIRO 1 ICETEX', '$'), ('Giro 2 ICETEX', 'GIRO 2 ICETEX', '$'), ('Giros realizados', 'GIROS REALIZADOS', 't'),
        ('Desembolsado en el periodo', 'Monto desembolsado Período', '$')], 'PERIODO RENOVADO')],
))

# ── Historial de eventos (reportes n8n) ─────────────────────────────────────────────────────────
eventos = tabla('analitica_fondos vista_eventos_beneficiarios')
eventos['_doc'] = eventos['documento'].map(doc)
for d, g in eventos[eventos['_doc'] != ''].groupby('_doc', sort=False):
    agregar('EVENTOS', d, '', '', '', [], [historial('Historial de eventos', g, [
        ('Fecha', 'fecha_evento', 't'), ('Periodo', 'periodo_evento', 't'), ('Evento', 'tipo_evento', 't'),
        ('Detalle', 'detalle_evento', 't'), ('Convocatoria', 'convocatoria', 't'), ('Fondo', 'fondo_sapiencia', 't'),
        ('Radicado PQRS', 'radicado_pqrs', 't')], 'fecha_evento')])

DOCUMENTO_DICCIONARIO = '__DICCIONARIO__'


def diccionario_de(lista):
    etiquetas = set()
    for _, _, _, ficha in lista:
        j = json.loads(ficha)
        for titulo, campos in j['s']:
            etiquetas.add(titulo)
            etiquetas.update(e for e, _ in campos)
        for titulo, columnas, _ in j['t']:
            etiquetas.add(titulo)
            etiquetas.update(columnas)
    # Las cadenas más frecuentes van al final del diccionario (zlib las alcanza con distancias cortas).
    return ('|'.join(sorted(etiquetas)) + '{"p":"EPM","c":"","n":"","e":"","s":[["","t":[["Historial por periodo",["$ ').encode('utf-8')


def comprimir(texto_json, dicc):
    c = zlib.compressobj(9, zlib.DEFLATED, 15, 9, zlib.Z_DEFAULT_STRATEGY, dicc)
    return base64.b64encode(c.compress(texto_json.encode('utf-8')) + c.flush()).decode('ascii')


DICC = diccionario_de(fichas)
with open(SALIDA, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow((DOCUMENTO_DICCIONARIO, 'DICC', '', base64.b64encode(DICC).decode('ascii')))
    for d, p, c, ficha in fichas:
        w.writerow((d, p, c, comprimir(ficha, DICC)))
os.chmod(SALIDA, 0o600)
cuenta = pd.Series([p for _, p, _, _ in fichas]).value_counts()
print(f'{len(fichas)} fichas, {len({d for d, _, _, _ in fichas})} documentos, {os.path.getsize(SALIDA) / 1e6:.1f} MB')
print(cuenta.to_string())
