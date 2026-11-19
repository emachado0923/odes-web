#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extractor determinista de las fichas PAI 2026 (formato F-ES-DE-003).

Lee los libros de `pai-zip` (Formulación + Seguimiento BIM 1..3), escoge la
fuente autorizada por proceso y por bimestre (según scratchpad/analisis/
excel-inventario.md §6) y escribe `pai-datos/pai-2026.json`.

Uso (desde scratchpad/scripts):
    python3 -s extraer_pai.py [RAIZ_PAI_ZIP] [SALIDA_JSON]

Nunca modifica los Excel: solo los abre en modo lectura con openpyxl
(data_only=True para valores en caché y data_only=False para fórmulas).
"""
import site, sys
sys.path.append(site.getusersitepackages())

import os, re, json, math, unicodedata, difflib, warnings
from collections import Counter, OrderedDict, defaultdict
import openpyxl
from openpyxl.utils import get_column_letter as COL

warnings.filterwarnings("ignore")

# --------------------------------------------------------------------------
# Rutas
# --------------------------------------------------------------------------
try:
    _AQUI = os.path.dirname(os.path.abspath(__file__))
except NameError:  # ejecutado con exec(open(...).read())
    _AQUI = os.getcwd()
_SCRATCH = os.path.dirname(_AQUI)
ARGS = [a for a in sys.argv[1:]]
RAIZ = os.path.abspath(ARGS[0]) if len(ARGS) > 0 else os.path.join(_SCRATCH, "pai-zip")
SALIDA = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else os.path.join(_SCRATCH, "pai-datos", "pai-2026.json")

# --------------------------------------------------------------------------
# Archivos (rutas relativas a RAIZ, en NFC)
# --------------------------------------------------------------------------
F_SAF = "Formulación PAI 2026/FormatoPlanAccion2026 Procesos-  SAF.xlsx"
F_DTF = "Formulación PAI 2026/FormatoPlanAccion2026 DTF.xlsx"
F_GEP = "Formulación PAI 2026/FORMULACIÓN PAI 2026 GEP.xlsx"
F_OCI = "Formulación PAI 2026/FORMULACIÓN PAI 2026 OCI.xlsx"
F_OPE = "Formulación PAI 2026/FormatoPlanAccion2026 OPE.xlsx"
F_ODES = "Formulación PAI 2026/ODES -PAI 2026.xlsx"

B1_DTF = "Seguimiento BIM 1/Seguimiento PAI BIM 1 2026 DTF.xlsx"
B1_GEP = "Seguimiento BIM 1/Seguimiento PAI BIM 1 2026 GEP.xlsx"
B1_OCI = "Seguimiento BIM 1/Seguimiento PAI BIM 1 2026 OCI.xlsx"
B1_OPE = "Seguimiento BIM 1/Seguimiento PAI BIM 1 2026 OPE.xlsx"
B1_FODES = "Seguimiento BIM 1/FORMULACIÓN PAI 2026 ODES.xlsx"
B1_FPPEP = "Seguimiento BIM 1/FORMULACIÓN PAI 2026 PPEP.xlsx"

B2_SAF = "Seguimiento BIM 2/Seguimiento PAI BIM 2 2026 SAF.xlsx"
B2_DTF = "Seguimiento BIM 2/Seguimiento PAI BIM 2 DTF.xlsx"
B2_GEP = "Seguimiento BIM 2/Seguimiento PAI BIM 2 GEP.xlsx"
B2_OCI = "Seguimiento BIM 2/Seguimiento PAI BIM 2 2026 OCI.xlsx"
B2_OPE = "Seguimiento BIM 2/Seguimiento PAI BIM 2 2026 OPE.xlsx"
B2_ODES = "Seguimiento BIM 2/Seguimiento PAI BIM 2 2026 ODES.xlsx"
B2_PPEP = "Seguimiento BIM 2/Seguimiento PAI BIM 2 2026 PPEP.xlsx"
B2_GPC = "Seguimiento BIM 2/PAI BIM2 GESCO+ i-PIPC.xlsx"

B3_SAF = "Seguimiento BIM 3/Seguimiento PAI BIM 3 2026 SAF.xlsx"
B3_DTF = "Seguimiento BIM 3/Seguimiento PAI BIM 3 2026 DTF.xlsx"
B3_GEP = "Seguimiento BIM 3/Seguimiento PAI BIM 3 2026 GEP.xlsx"
B3_OCI = "Seguimiento BIM 3/Seguimiento PAI BIM 3 2026 OCI.xlsx"
B3_PPEP = "Seguimiento BIM 3/Seguimiento PAI BIM 3 2026 PPEP.xlsx"
B3_SIG = "Seguimiento BIM 3/Seguimiento PAI BIM 3 2026 SIG-MIPG.xlsx"

DEPENDENCIAS = [
    {"sigla": "SAF", "nombre": "Subdirección Administrativa, Financiera y de Apoyo a la Gestión"},
    {"sigla": "DTF", "nombre": "Dirección Técnica de Fondos"},
    {"sigla": "GEP", "nombre": "Subdirección para la Gestión de la Educación Postsecundaria"},
    {"sigla": "OCI", "nombre": "Oficina de Control Interno"},
    {"sigla": "OPE", "nombre": "Planeación Estratégica"},
]

# --------------------------------------------------------------------------
# Configuración de procesos (hoja vigente, fuentes por bimestre)
#   valores: candidatos de avance (archivo, hoja, bim_del_archivo), del más
#            autorizado al menos. El primero es la fuente autorizada.
#   narrativa: por bimestre, lista de (archivo, hoja[, solo_exacto]); el primero
#            es la fuente autorizada, los demás se usan si aquella no trae el
#            indicador o no trae texto para él.
# --------------------------------------------------------------------------
def _p(clave, dep, hoja, codigo, area, formul, estructura, valores, narrativa, nombre_si_duplicado=None, tipo=None):
    return dict(clave=clave, dep=dep, hoja=hoja, codigo=codigo, area=area, formul=formul,
                estructura=estructura, valores=valores, narrativa=narrativa,
                nombre_si_duplicado=nombre_si_duplicado, tipo_forzado=tipo)

PROCESOS = []
for hoja, slug, cod in [("ATENCIÓN A LA CIUDADANÍA", "atencion-ciudadania", "AC"),
                        ("TALENTO HUMANO", "talento-humano", "TH"),
                        ("SST", "sst", "SST"),
                        ("GESTIÓN DOCUMENTAL", "gestion-documental", "GD"),
                        ("RECURSOS FISICOS", "recursos-fisicos", "RF"),
                        ("SISTEMAS DE INFORMACIÓN", "sistemas-informacion", "SI"),
                        ("PRESUPUESTO", "presupuesto", "PRE"),
                        ("CONTABILIDAD ", "contabilidad", "CON"),
                        ("TESORERÍA", "tesoreria", "TES"),
                        ("CARTERA", "cartera", "CAR")]:
    PROCESOS.append(_p("saf-" + slug, "SAF", hoja, "SAF-" + cod, "SAF", (F_SAF, hoja), (B3_SAF, hoja),
                       [(B3_SAF, hoja, 3), (B2_SAF, hoja, 2)],
                       {1: [], 2: [(B2_SAF, hoja)], 3: [(B3_SAF, hoja)]}))
for hoja, slug, cod, nom in [("Plan de acción Fondos", "fondos", "FON", "Plan de acción Fondos"),
                             ("Plan de acción Territorial", "territorial", "TER", "Plan de acción Territorial"),
                             ("Plan de acción Matrícula Cero", "matricula-cero", "MC", "Plan de acción Matrícula Cero")]:
    PROCESOS.append(_p("dtf-" + slug, "DTF", hoja, "DTF-" + cod, "DTF", (F_DTF, hoja), (B3_DTF, hoja),
                       [(B3_DTF, hoja, 3), (B2_DTF, hoja, 2), (B1_DTF, hoja, 1)],
                       {1: [(B1_DTF, hoja)], 2: [(B2_DTF, hoja)], 3: [(B3_DTF, hoja)]},
                       nombre_si_duplicado=nom))
for hoja, hojaf, slug, cod in [("Estud-IA", "EstudIA", "estud-ia", "EIA"),
                               ("Educación Digital", "Educación Digital", "educacion-digital", "EDI"),
                               ("Bilingüismo", "Bilinguismo", "bilinguismo", "BIL"),
                               ("Ciudadela", "Ciudadela", "ciudadela", "CIU"),
                               ("Investigación", "Investigación", "investigacion", "INV"),
                               ("Alianzas", "Alianzas", "alianzas", "ALI"),
                               ("Permanencia", "Permanencia", "permanencia", "PER")]:
    PROCESOS.append(_p("gep-" + slug, "GEP", hoja, "GEP-" + cod, "GEP", (F_GEP, hojaf), (B3_GEP, hoja),
                       [(B3_GEP, hoja, 3), (B2_GEP, hoja, 2), (B1_GEP, hoja, 1)],
                       {1: [(B1_GEP, hoja)], 2: [(B2_GEP, hoja)], 3: [(B3_GEP, hoja)]},
                       tipo="proyecto"))
PROCESOS.append(_p("oci-auditoria-interna", "OCI", "Auditoría Interna", "OCI-AI", "OCI",
                   (F_OCI, "Auditoría Interna"), (B3_OCI, "Auditoría Interna"),
                   [(B3_OCI, "Auditoría Interna", 3), (B2_OCI, "Auditoría Interna", 2), (B1_OCI, "Auditoría Interna", 1)],
                   {1: [(B1_OCI, "Auditoría Interna")], 2: [(B2_OCI, "Auditoría Interna")], 3: [(B3_OCI, "Auditoría Interna")]}))
PROCESOS.append(_p("ope-direccionamiento-estrategico", "OPE", "Direccionamiento Estratégico", "OPE-DE", "OPE",
                   (F_OPE, "Direccionamiento Estratégico"), (B3_SIG, "Direccionamiento Estratégico"),
                   [(B3_SIG, "Direccionamiento Estratégico", 3), (B2_OPE, "Direccionamiento Estratégico", 2),
                    (B1_OPE, "Direccionamiento Estratégico", 1)],
                   {1: [(B1_OPE, "Direccionamiento Estratégico")], 2: [(B2_OPE, "Direccionamiento Estratégico")], 3: []},
                   nombre_si_duplicado="Direccionamiento Estratégico"))
PROCESOS.append(_p("ope-gesco-i", "OPE", "GESCO+i", "OPE-GES", "GESCO+i",
                   (F_OPE, "GESCO+i"), (B3_SIG, "GESCO+i"),
                   [(B3_SIG, "GESCO+i", 3), (B2_OPE, "GESCO+i", 2), (B2_GPC, "GESCO+i", 2), (B1_OPE, "GESCO+i", 1)],
                   {1: [(B1_OPE, "GESCO+i")], 2: [(B2_OPE, "GESCO+i"), (B2_GPC, "GESCO+i")], 3: []},
                   nombre_si_duplicado="GESCO+i - Gestión del Conocimiento y la Innovación"))
PROCESOS.append(_p("ope-pipc", "OPE", "PIPC", "OPE-PC", "PIPC",
                   (F_OPE, "Participación Ciudadana"), (B3_SIG, "PIPC"),
                   [(B3_SIG, "PIPC", 3), (B2_OPE, "PIPC", 2), (B2_GPC, "PIPC", 2), (B1_OPE, "PIPC", 1)],
                   {1: [(B1_OPE, "PIPC")], 2: [(B2_OPE, "PIPC"), (B2_GPC, "PIPC")], 3: []},
                   nombre_si_duplicado="PIPC - Política Institucional de Participación Ciudadana"))
PROCESOS.append(_p("ope-sig-mipg", "OPE", "SIG-MIPG", "OPE-SIG", "SIG-MIPG",
                   (F_OPE, "Sist. Integrado de Gestión"), (B3_SIG, "SIG-MIPG"),
                   [(B3_SIG, "SIG-MIPG", 3), (B2_OPE, "SIG-MIPG", 2), (B1_OPE, "SIG-MIPG", 1)],
                   {1: [(B1_OPE, "SIG-MIPG")], 2: [(B2_OPE, "SIG-MIPG")], 3: [(B3_SIG, "SIG-MIPG")]}))
PROCESOS.append(_p("ope-ppep", "OPE", "PPEP", "OPE-PPEP", "PPEP",
                   (F_OPE, "PPEP2026"), (B3_PPEP, "PPEP"),
                   [(B3_PPEP, "PPEP", 3), (B2_PPEP, "PPEP", 2), (B2_OPE, "PPEP", 2), (B1_OPE, "PPEP", 1), (B1_FPPEP, "PPEP", 1)],
                   {1: [(B1_OPE, "PPEP"), (B1_FPPEP, "PPEP"), (B1_GEP, "Permanencia", True)],
                    2: [(B2_OPE, "PPEP"), (B2_PPEP, "PPEP")], 3: [(B3_PPEP, "PPEP")]},
                   nombre_si_duplicado="PPEP - Política Pública de Educación Postsecundaria", tipo="proyecto"))
PROCESOS.append(_p("ope-odes", "OPE", "OdeS", "OPE-ODES", "ODES",
                   (F_ODES, "OdeS"), (B3_SIG, "OdeS"),
                   [(B3_SIG, "OdeS", 3), (B2_OPE, "OdeS", 2), (B2_ODES, "OdeS", 2), (B1_OPE, "OdeS", 1), (B1_FODES, "ODES", 1)],
                   {1: [(B1_OPE, "OdeS"), (B1_FODES, "ODES")], 2: [(B2_OPE, "OdeS"), (B2_ODES, "OdeS")], 3: []}))

# Otras hojas de formulación conocidas (solo para el registro de alias / generado_desde)
ALIAS_HOJAS = {
    "gep-estud-ia": ["EstudIA"], "gep-bilinguismo": ["Bilinguismo"],
    "ope-gesco-i": [" PAI GESCO+i"], "ope-pipc": ["Participación Ciudadana", " PAI PC"],
    "ope-sig-mipg": ["Sist. Integrado de Gestión", "SIG"], "ope-ppep": ["PPEP2026"], "ope-odes": ["ODES"],
    "saf-contabilidad": ["CONTABILIDAD (con espacio final)"],
}

# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------
def nfc(s):
    return unicodedata.normalize("NFC", s)

_RUTAS = {}
for d, _, fs in os.walk(RAIZ):
    for f in fs:
        p = os.path.join(d, f)
        _RUTAS[nfc(os.path.relpath(p, RAIZ))] = p

def ruta(rel):
    p = _RUTAS.get(nfc(rel))
    if not p:
        raise SystemExit("No se encontró el archivo: %s" % rel)
    return p

def texto(v):
    """Texto limpio: recorta, normaliza saltos de línea y espacios; vacío -> None."""
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        v = numero_fmt(v)
        return str(v)
    s = str(v).replace("\r\n", "\n").replace("\r", "\n").replace("\u00a0", " ").replace("\u200b", "")
    lineas = [re.sub(r"[ \t\f\v]+", " ", l).strip() for l in s.split("\n")]
    s = "\n".join(lineas)
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s or None

def numero_fmt(x):
    if isinstance(x, bool):
        return x
    if isinstance(x, int):
        return x
    if isinstance(x, float):
        r = round(x, 10)
        if abs(r - round(r)) < 1e-9:
            return int(round(r))
        return r
    return x

ERRORES = ("#DIV/0!", "#REF!", "#VALUE!", "#N/A", "#NAME?", "#NUM!", "#NULL!")

def numero(v):
    """-> (valor_numérico|None, nota|None)."""
    if v is None:
        return None, None
    if isinstance(v, bool):
        return None, "booleano"
    if isinstance(v, (int, float)):
        return numero_fmt(v), None
    s = str(v).strip()
    if s == "":
        return None, None
    if s in ERRORES:
        return None, "error " + s
    t = s.replace("%", "").replace(" ", "")
    try:
        if re.fullmatch(r"-?\d+(\.\d+)?", t):
            n = float(t)
            if s.endswith("%"):
                n = n / 100.0
            return numero_fmt(n), "texto numérico"
    except ValueError:
        pass
    return None, "texto no numérico: %r" % s

def clave_txt(s):
    """Clave normalizada para emparejar indicadores entre archivos."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9%]+", " ", s)
    return " ".join(s.split())

def slug(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", clave_txt(s))).strip("-")

# --------------------------------------------------------------------------
# Lectura de libros (caché)
# --------------------------------------------------------------------------
_LIBROS = {}

def libro(rel):
    if rel not in _LIBROS:
        p = ruta(rel)
        _LIBROS[rel] = (openpyxl.load_workbook(p, data_only=True), openpyxl.load_workbook(p, data_only=False))
    return _LIBROS[rel]

ETIQUETAS = [
    ("accion", lambda u: u.startswith("ACCION")),
    ("indicador", lambda u: u.startswith("INDICADOR")),
    ("riesgo", lambda u: u.startswith("RIESGO ASOCIADO")),
    ("meta", lambda u: u.startswith("META PLANEADA")),
    ("productos", lambda u: u.startswith("PRODUCTOS")),
    ("rol", lambda u: u.startswith("ROL RESPONSABLE")),
    ("avance", lambda u: u.startswith("AVANCE META")),
    ("pct", lambda u: u.startswith("% DE AVANCE")),
    ("logros", lambda u: u.startswith("PRINCIPALES AVANCES")),
    ("obs", lambda u: u.startswith("OBSERVACIONES")),
    ("riesgo_mat", lambda u: u.startswith("RIESGO MATERIALIZADO")),
    ("numeral", lambda u: u.startswith("NUMERAL")),
    ("desc", lambda u: u.startswith("DESCRIPCI")),
    ("fuentes", lambda u: u.startswith("FUENTES")),
    ("notas", lambda u: u.startswith("NOTAS")),
]

_HOJAS = {}

def leer_hoja(rel, hoja, solo_formulacion=False):
    """Parsea una hoja F-ES-DE-003 y devuelve encabezado, mapa de columnas y filas de indicadores."""
    k = (rel, hoja, solo_formulacion)
    if k in _HOJAS:
        return _HOJAS[k]
    wbv, wbf = libro(rel)
    wsv, wsf = wbv[hoja], wbf[hoja]
    avisos = []
    # 1. fila de encabezado
    fh = ch = None
    for r in range(1, 26):
        for c in range(1, 6):
            v = wsv.cell(r, c).value
            if isinstance(v, str) and v.strip().upper().startswith("INDICADOR"):
                fh, ch = r, c
                break
        if fh:
            break
    if not fh:
        raise SystemExit("Sin encabezado INDICADOR: %s :: %s" % (rel, hoja))
    cm = {}
    for c in range(1, 46):
        v = wsv.cell(fh, c).value
        if not isinstance(v, str):
            continue
        u = " ".join(v.split()).upper()
        for nombre, f in ETIQUETAS:
            if nombre not in cm and f(u):
                cm[nombre] = c
                break
    if cm.get("indicador") != ch or "accion" not in cm or "meta" not in cm:
        raise SystemExit("Mapa de columnas inesperado en %s :: %s -> %s" % (rel, hoja, cm))
    # última columna del formato (antes de recortar la formulación): lo que está a su derecha son notas sueltas
    ultima_col = max(v for k, v in cm.items() if k != "notas")
    if solo_formulacion:
        for x in ("avance", "pct", "logros", "obs", "riesgo_mat", "numeral", "desc", "fuentes"):
            cm.pop(x, None)
    col_num = cm["accion"] - 1 if cm["accion"] > 1 else None  # OCI seguimiento: A = "No."
    # 2. celdas combinadas
    comb = {}
    for mr in wsv.merged_cells.ranges:
        for rr in range(mr.min_row, mr.max_row + 1):
            for cc in range(mr.min_col, mr.max_col + 1):
                comb[(rr, cc)] = (mr.min_row, mr.min_col, mr.max_row, mr.max_col)
    # 3. inicio de datos = fin del merge de ACCIONES del encabezado + 1
    m = comb.get((fh, cm["accion"]))
    ini = (m[2] + 1) if m else fh + 4
    # etiquetas Bim
    etiquetas_ok = None
    for r in range(fh, ini):
        labs = [texto(wsv.cell(r, cm["meta"] + i).value) for i in range(7)]
        if labs[0] and labs[0].lower().startswith("bim"):
            etiquetas_ok = [l.lower().replace(" ", "") if l else l for l in labs] == ["bim1", "bim2", "bim3", "bim4", "bim5", "bim6", "total"]
    if etiquetas_ok is False:
        avisos.append("etiquetas Bim de meta inesperadas")
    if "avance" in cm:
        for r in range(fh, ini):
            labs = [texto(wsv.cell(r, cm["avance"] + i).value) for i in range(7)]
            if labs[0] and labs[0].lower().startswith("bim"):
                if [l.lower().replace(" ", "") if l else l for l in labs] != ["bim1", "bim2", "bim3", "bim4", "bim5", "bim6", "total"]:
                    avisos.append("etiquetas Bim de avance inesperadas")
    # 4. fin = fila de firmas
    fin = None
    for r in range(ini, wsv.max_row + 1):
        for c in range(1, 4):
            v = wsv.cell(r, c).value
            if isinstance(v, str) and re.match(r"^\s*Elabor[óo]\s*:", v):
                fin = r
                break
        if fin:
            break
    if not fin:
        avisos.append("sin fila de firmas")
        fin = wsv.max_row + 1
    # 5. encabezado del plan
    enc = {}
    for r in range(1, fh):
        for c in range(1, 40):
            v = wsv.cell(r, c).value
            if not isinstance(v, str):
                continue
            u = " ".join(v.split()).upper()

            def derecha():
                for c2 in range(c + 1, 40):
                    w = wsv.cell(r, c2).value
                    if w not in (None, ""):
                        return texto(w)
                return None
            if u.startswith("ARTICULACIÓN CON") and "PLAN DE DESARROLLO" in u and ("LÍNEA" in u or "PILAR" in u):
                enc.setdefault("linea_pdd", derecha())
            elif "DIMENSIÓN DEL PLAN ESTRAT" in u:
                enc.setdefault("dimension_pe", derecha())
            elif "COMPONENTE DEL PLAN DE DESARROLLO" in u:
                enc.setdefault("componente_pdd", derecha())
            elif u.startswith("PROGRAMA") and "PLAN DE DESARROLLO" in u:
                enc.setdefault("programa_pdd", derecha())
            elif u.startswith("PROYECTO - PROCESO") or u.startswith("PROYECTO-PROCESO"):
                enc.setdefault("proyecto_proceso", derecha())
            elif u == "OBJETIVO":
                enc.setdefault("objetivo", derecha())
            elif "F-ES-DE-003" in u:
                enc.setdefault("formato_codigo", texto(v))
            elif re.match(r"^VERSI[ÓO]N\s*\d+", u):
                enc.setdefault("formato_version", texto(v))
            elif u.startswith("SEGUIMIENTO BIMENSUAL"):
                enc.setdefault("etiqueta_seguimiento", texto(v))

    def val(r, c, propagar=True):
        """Valor de la celda; si está dentro de un merge vertical toma la celda superior."""
        v = wsv.cell(r, c).value
        if v in (None, "") and propagar and (r, c) in comb:
            r0, c0, _, _ = comb[(r, c)]
            if c0 == c:
                return wsv.cell(r0, c0).value
            return None
        return v

    def formula(r, c):
        f = wsf.cell(r, c).value
        if isinstance(f, str) and f.startswith("="):
            return f
        return None

    filas = []
    for r in range(ini, fin):
        ind = texto(wsv.cell(r, cm["indicador"]).value)
        if not ind:
            # fila sin indicador: promedio, vacía o restos
            otros = [wsv.cell(r, cm["meta"] + i).value for i in range(6)]
            if any(isinstance(x, (int, float)) and x for x in otros):
                avisos.append("fila %d con metas pero sin indicador (ignorada)" % r)
            continue
        ca = cm["accion"]
        acc_top = comb[(r, ca)][0] if (r, ca) in comb else r
        acc_txt = texto(val(r, ca))
        cr = cm.get("riesgo")
        rie_top = None
        rie_txt = None
        rie_celda = None
        if cr:
            rie_txt = texto(val(r, cr))
            if rie_txt:
                rie_top = comb[(r, cr)][0] if (r, cr) in comb else r
                if (r, cr) in comb:
                    q = comb[(r, cr)]
                    rie_celda = "%s%d:%s%d" % (COL(q[1]), q[0], COL(q[3]), q[2])
                else:
                    rie_celda = "%s%d" % (COL(cr), r)
        f = {"fila": r, "accion": acc_txt, "accion_top": acc_top, "accion_combinada": (r, ca) in comb,
             "indicador": ind, "riesgo": rie_txt, "riesgo_top": rie_top, "riesgo_celda": rie_celda}
        if col_num:
            f["numero"] = numero(wsv.cell(r, col_num).value)[0]
        c0 = cm["meta"]
        f["metas"] = [wsv.cell(r, c0 + i).value for i in range(6)]
        f["metas_f"] = [formula(r, c0 + i) for i in range(6)]
        f["meta_total"] = wsv.cell(r, c0 + 6).value
        f["meta_total_f"] = formula(r, c0 + 6)
        f["productos"] = texto(val(r, cm["productos"])) if "productos" in cm else None
        f["rol"] = texto(val(r, cm["rol"])) if "rol" in cm else None
        if "avance" in cm:
            a0 = cm["avance"]
            f["avances"] = [wsv.cell(r, a0 + i).value for i in range(6)]
            f["avance_total"] = wsv.cell(r, a0 + 6).value
            f["avance_total_f"] = formula(r, a0 + 6)
        if "pct" in cm:
            p0 = cm["pct"]
            f["pcts"] = [wsv.cell(r, p0 + i).value for i in range(6)]
            f["pcts_f"] = [formula(r, p0 + i) for i in range(6)]
            f["pct_total"] = wsv.cell(r, p0 + 6).value
            f["pct_total_f"] = formula(r, p0 + 6)
        for k2 in ("logros", "obs", "riesgo_mat", "numeral", "desc", "fuentes", "notas"):
            if k2 in cm:
                f[k2] = texto(val(r, cm[k2]))
        if "logros" in cm and "obs" in cm and (r, cm["logros"]) in comb:
            r0, c0, r1, c1 = comb[(r, cm["logros"])]
            if c0 == cm["logros"] and c1 >= cm["obs"]:
                # merge horizontal logros+observaciones (p. ej. AA31:AB33 'ACCIÓN E INDICADORES REPETIDOS')
                f["logros_combinado"] = "%s%d:%s%d" % (COL(c0), r0, COL(c1), r1)
        extra = {}
        for c in range(ultima_col + 1, 46):
            if c == cm.get("notas"):
                continue
            v = wsv.cell(r, c).value
            if v not in (None, ""):
                extra[COL(c)] = texto(v) if isinstance(v, str) else numero_fmt(v)
        if extra:
            f["columnas_extra"] = extra
        filas.append(f)
    out = {"archivo": rel, "hoja": hoja, "fila_encabezado": fh, "inicio": ini, "fin": fin,
           "columnas": {k3: COL(v3) for k3, v3 in cm.items()}, "col_numero": COL(col_num) if col_num else None,
           "encabezado": enc, "filas": filas, "avisos": avisos}
    _HOJAS[k] = out
    return out

# --------------------------------------------------------------------------
# Emparejamiento de indicadores entre archivos
# --------------------------------------------------------------------------
def emparejar(filas_cand, filas_ref, solo_exacto=False, misma_fila=False):
    """-> dict idx_ref -> idx_cand, lista de (idx_cand, ratio, idx_ref) difusos, idx_cand sin pareja."""
    ref_keys = []
    cnt = Counter()
    for r in filas_ref:
        k = clave_txt(r["indicador"])
        cnt[k] += 1
        ref_keys.append((k, cnt[k]))
    pos = {rk: j for j, rk in enumerate(ref_keys)}
    cnt = Counter()
    m = {}
    sin = []
    for i, r in enumerate(filas_cand):
        k = clave_txt(r["indicador"])
        cnt[k] += 1
        j = pos.get((k, cnt[k]))
        if j is not None and j not in m:
            m[j] = i
        else:
            sin.append(i)
    difusos = []
    if not solo_exacto:
        libres = [j for j in range(len(filas_ref)) if j not in m]
        for i in list(sin):
            ki = clave_txt(filas_cand[i]["indicador"])
            best, bs = None, 0.0
            for j in libres:
                s = difflib.SequenceMatcher(None, ki, ref_keys[j][0]).ratio()
                # desempate por cercanía de posición
                s2 = s - 0.002 * abs(j - i)
                if s2 > bs:
                    best, bs = j, s2
            if best is not None and bs >= 0.72:
                m[best] = i
                libres.remove(best)
                sin.remove(i)
                difusos.append((i, round(bs, 3), best))
        if misma_fila:
            # segunda pasada (solo formulación): misma fila y misma acción, con similitud >= 0.55
            for i in list(sin):
                ki = clave_txt(filas_cand[i]["indicador"])
                for j in libres:
                    if (filas_ref[j]["fila"] == filas_cand[i]["fila"]
                            and clave_txt(filas_ref[j]["accion"]) == clave_txt(filas_cand[i]["accion"])
                            and difflib.SequenceMatcher(None, ki, ref_keys[j][0]).ratio() >= 0.55):
                        m[j] = i
                        libres.remove(j)
                        sin.remove(i)
                        difusos.append((i, 0.55, j))
                        break
    return m, difusos, sin


# Emparejamiento formulación -> plan vigente.
# El nombre del indicador no basta: OCI repite 'Seguimientos realizados.' / 'Informes realizados.' en muchas filas y
# varias hojas de SAF renombraron indicadores. Se combinan nombre, acción (A; B en OCI), productos (K) y metas.
_STOP = set("de la el en a al los las del y o u para por con que se su sus un una e lo como entre segun sobre sin".split())


def _toks(s):
    # raíz burda de 5 letras para tolerar 'actualizar'/'actualización', 'revisión'/'revisada'
    return [t[:5] for t in clave_txt(s or "").split() if t not in _STOP and len(t) > 1]


def _cos(a, b, idf):
    ca, cb = Counter(a), Counter(b)
    if not ca or not cb:
        return None
    num = sum(ca[t] * cb[t] * idf.get(t, 1.0) ** 2 for t in ca if t in cb)
    na = sum((v * idf.get(t, 1.0)) ** 2 for t, v in ca.items()) ** 0.5
    nb = sum((v * idf.get(t, 1.0)) ** 2 for t, v in cb.items()) ** 0.5
    return num / (na * nb) if na and nb else None


def emparejar_formulacion(filas_cand, filas_ref):
    """-> (dict idx_ref -> idx_cand, dict idx_ref -> detalle, idx_cand sin pareja).

    Similitudes: nombre (difflib), acción y productos (coseno TF-IDF sobre raíces; las palabras que se repiten en
    muchas filas, como 'Auditoría Basada en Riesgos al proceso de', pesan poco), metas Bim 1-6 iguales.
    Se acepta una pareja si cumple una de estas reglas (en orden de prioridad, asignación voraz por puntaje):
      nombre+accion            nombre y acción idénticos
      nombre~+accion~          nombre >= 0,72 y acción >= 0,5 (>= 0,75 si el nombre se repite en la hoja)
      nombre+metas/productos   nombre idéntico y no repetido, con metas iguales o productos >= 0,8
      accion+metas/productos   acción >= 0,75, nombre >= 0,5 y (metas iguales o productos >= 0,8)
      productos+metas          productos >= 0,9, metas iguales, nombre >= 0,5 y a <= 3 filas (indicador renombrado)
      residual                 entre las filas que quedan libres: metas iguales, nombre >= 0,7 o productos >= 0,8,
                               acción >= 0,3, a <= 6 filas, y pareja única en ambos sentidos
    """
    docs = []
    for f in list(filas_cand) + list(filas_ref):
        for k in ("accion", "indicador", "productos"):
            docs.append(set(_toks(f.get(k))))
    N = len(docs)
    df = Counter(t for d in docs for t in d)
    idf = {t: math.log((N + 1) / (n + 0.5)) for t, n in df.items()}
    nom_c = Counter(clave_txt(f["indicador"]) for f in filas_cand)
    nom_r = Counter(clave_txt(f["indicador"]) for f in filas_ref)
    ps = []
    for i, a in enumerate(filas_cand):
        ma = [numero(x)[0] for x in a["metas"]]
        for j, b in enumerate(filas_ref):
            ka, kb = clave_txt(a["indicador"]), clave_txt(b["indicador"])
            s_ind = 1.0 if ka == kb else difflib.SequenceMatcher(None, ka, kb).ratio()
            acc_eq = bool(a.get("accion")) and clave_txt(a.get("accion")) == clave_txt(b.get("accion"))
            t_acc = 1.0 if acc_eq else (_cos(_toks(a.get("accion")), _toks(b.get("accion")), idf) or 0.0)
            t_prod = _cos(_toks(a.get("productos")), _toks(b.get("productos")), idf)
            ps.append(dict(i=i, j=j, s_ind=s_ind, ind_eq=ka == kb, acc_eq=acc_eq, t_acc=t_acc, t_prod=t_prod,
                           metas_eq=ma == [numero(x)[0] for x in b["metas"]],
                           generico=nom_c[ka] > 1 or nom_r[kb] > 1, d=abs(a["fila"] - b["fila"])))

    def regla(p):
        tp = p["t_prod"] or 0.0
        if p["ind_eq"] and p["acc_eq"]:
            return "nombre+accion"
        if (p["ind_eq"] or p["s_ind"] >= 0.72) and p["t_acc"] >= (0.75 if p["generico"] else 0.5):
            return "nombre~+accion~"
        if p["ind_eq"] and not p["generico"] and (p["metas_eq"] or tp >= 0.8):
            return "nombre+metas/productos"
        if p["t_acc"] >= 0.75 and p["s_ind"] >= 0.5 and (p["metas_eq"] or tp >= 0.8):
            return "accion+metas/productos"
        if tp >= 0.9 and p["metas_eq"] and p["s_ind"] >= 0.5 and p["d"] <= 3:
            return "productos+metas"
        return None
    for p in ps:
        p["regla"] = regla(p)
        p["puntaje"] = 0.45 * p["s_ind"] + 0.35 * p["t_acc"] + 0.1 * (p["t_prod"] or 0) + 0.1 * p["metas_eq"] - 0.003 * p["d"]
    m, det, usados = {}, {}, set()
    for p in sorted([p for p in ps if p["regla"]], key=lambda p: (-(p["regla"] == "nombre+accion"), -p["puntaje"])):
        if p["j"] in m or p["i"] in usados:
            continue
        m[p["j"]] = p["i"]
        usados.add(p["i"])
        det[p["j"]] = p

    def residual(p):
        tp = p["t_prod"] or 0.0
        return p["metas_eq"] and (p["s_ind"] >= 0.7 or tp >= 0.8) and p["t_acc"] >= 0.3 and p["d"] <= 6
    libres = [p for p in ps if p["j"] not in m and p["i"] not in usados and residual(p)]
    ci = Counter(p["i"] for p in libres)
    cj = Counter(p["j"] for p in libres)
    for p in libres:
        if ci[p["i"]] == 1 and cj[p["j"]] == 1:
            p["regla"] = "residual"
            m[p["j"]] = p["i"]
            usados.add(p["i"])
            det[p["j"]] = p
    sin = [i for i in range(len(filas_cand)) if i not in usados]
    return m, det, sin

# --------------------------------------------------------------------------
# Riesgos, responsables, indicador
# --------------------------------------------------------------------------
_RX_NUM = re.compile(r"(?:(?<=\s)|^)(\d{1,2})\s*[.)\-]\s*(?=[A-Za-zÁÉÍÓÚÑáéíóúñ¿\"“(])")

def dividir_riesgos(t):
    """Divide '1. ... (RC) 2. ...' en ítems; exige numerales consecutivos desde 1."""
    if not t:
        return []
    cands = list(_RX_NUM.finditer(t))
    elegidos = []
    esperado = 1
    for mt in cands:
        if int(mt.group(1)) == esperado:
            elegidos.append(mt)
            esperado += 1
    if len(elegidos) < 2 and not (len(elegidos) == 1 and elegidos[0].start() == 0):
        return [{"numeral": None, "texto": t, "descripcion": t, "rc": "(RC)" in t.upper()}]
    items = []
    for i, mt in enumerate(elegidos):
        fin = elegidos[i + 1].start() if i + 1 < len(elegidos) else len(t)
        cuerpo = t[mt.end():fin].strip()
        cuerpo = re.sub(r"\s*\n\s*", " ", cuerpo).strip()
        n = int(mt.group(1))
        items.append({"numeral": n, "texto": "%d. %s" % (n, cuerpo), "descripcion": re.sub(r"\s*\(RC\)\s*\.?$", "", cuerpo).strip(),
                      "rc": bool(re.search(r"\(RC\)", cuerpo, re.I))})
    pre = t[:elegidos[0].start()].strip()
    if pre:
        items.insert(0, {"numeral": None, "texto": pre, "descripcion": pre, "rc": "(RC)" in pre.upper()})
    return items

def separar_rol(t):
    if not t:
        return None, None
    partes = re.split(r"(?i)\b(?:co-?\s?rresponsables?|corresponsable\(s\)|corresponsable\s*\(s\))\s*:?", t, maxsplit=1)
    resp = re.sub(r"(?i)^\s*(rol\s+)?responsables?\s*(directo)?\s*:?\s*", "", partes[0]).strip(" \n:;-")
    cor = partes[1].strip(" \n:;-") if len(partes) > 1 else None
    return (texto(resp) if resp else None), (texto(cor) if cor else None)

_RX_PERIODO = re.compile(r"\(([^()]*(?:demanda|vencid[oa]|trimestral|semestral|mensual|bimestral)[^()]*)\)", re.I)

def atributos_indicador(nombre):
    ex = {}
    m = _RX_PERIODO.findall(nombre)
    if m:
        ex["periodicidad"] = [texto(x) for x in m]
    # el texto del indicador PA/PDD sigue hasta la línea en blanco o hasta el otro rótulo
    # (p. ej. DTF-MC-02: 'Indicador PA: VE AS02FB\nBeneficios otorgados')
    for k, rot in (("indicador_pa", "PA"), ("indicador_pdd", "PDD")):
        m = re.search(r"Indicador\s+%s\b\s*:?\s*(.+?)(?=\n\s*\n|\n\s*Indicador\s+P|$)" % rot, nombre, re.I | re.S)
        if m and texto(m.group(1)):
            ex[k] = re.sub(r"\s*\n\s*", " ", texto(m.group(1)))
    cods = sorted(set(re.findall(r"\bAS\d{2}[A-Z]{2}\b", nombre)))
    if cods:
        ex["codigos_as"] = cods
    return ex

# --------------------------------------------------------------------------
# Fórmulas -> patrón lógico
# --------------------------------------------------------------------------
def patron_formula(f, fila, cols):
    """Convierte '=SUM(D14:I14)/6' en 'SUM(meta1:meta6)/6' usando el mapa de columnas de la hoja."""
    if not f:
        return None
    nombres = {}
    for base, pref in (("meta", "meta"), ("avance", "avance"), ("pct", "pct")):
        if base in cols:
            c0 = openpyxl.utils.column_index_from_string(cols[base])
            for i in range(6):
                nombres[COL(c0 + i)] = "%s%d" % (pref, i + 1)
            nombres[COL(c0 + 6)] = "%s_total" % pref

    def rep(mt):
        c, r = mt.group(1), int(mt.group(2))
        nm = nombres.get(c, c)
        return nm if r == fila else "%s[%d]" % (nm, r)
    s = f.lstrip("=").lstrip("+").replace(" ", "").replace("$", "")
    s = re.sub(r"\b([A-Z]{1,3})(\d+)\b", rep, s)
    return s

def regla_total(pat, prefijo, valor=None):
    """Clasifica el patrón de total de meta/avance."""
    if pat is None:
        return {"regla": "constante" if valor not in (None, "") else "vacio", "divisor": None}
    full = "SUM(%s1:%s6)" % (prefijo, prefijo)
    if pat == full:
        return {"regla": "suma", "divisor": None}
    m = re.fullmatch(re.escape(full) + r"/(\d+)", pat)
    if m:
        return {"regla": "suma_dividida", "divisor": int(m.group(1))}
    if pat == "IF(%s>99,100,0)" % full:
        return {"regla": "si_suma_mayor_99_entonces_100", "divisor": None}
    if re.fullmatch(r"SUM\(%s\d(:%s\d)?\)(/\d+)?" % (prefijo, prefijo), pat):
        return {"regla": "suma_rango_incompleto", "divisor": None}
    return {"regla": "otra", "divisor": None}

def regla_pct(pats):
    vals = [p for p in pats if p]
    if not vals:
        return None
    con = sum(1 for p in vals if p.startswith("IF(") and ">100%,100%" in p)
    sin = sum(1 for p in vals if re.fullmatch(r"(avance\d|avance_total)/(meta\d|meta_total)", p))
    if con and not sin:
        return "con_tope_100"
    if sin and not con:
        return "sin_tope"
    if con and sin:
        return "mixto"
    return "otra"

# --------------------------------------------------------------------------
# Construcción
# --------------------------------------------------------------------------
NOTAS = []
CONFLICTOS = []
NO_MAPEADOS = []
AVISOS = []
USADOS = OrderedDict()
FORMULAS = defaultdict(Counter)   # tipo -> patrón -> n


def usar(rel, hoja, rol):
    USADOS.setdefault(rel, OrderedDict()).setdefault(hoja, set()).add(rol)


def inferir_tipo(nombre, metas, meta_total, regla_meta):
    nz = [m for m in metas if isinstance(m, (int, float)) and m]
    kt = clave_txt(nombre)
    if regla_meta["regla"] in ("suma_dividida", "si_suma_mayor_99_entonces_100"):
        return "a_demanda", "total de meta en Excel = %s (meta constante de 100 por bimestre programado)" % (
            "SUM/%d" % regla_meta["divisor"] if regla_meta["divisor"] else "IF(SUM>99,100,0)")
    if "demanda" in kt and nz and all(abs(m - 100) < 1e-9 for m in nz):
        return "a_demanda", "texto '(a demanda)' y todas las metas programadas = 100"
    if nz and all(0 < m < 1 for m in nz) and isinstance(meta_total, (int, float)) and abs(round(meta_total, 6) - 1) < 1e-6:
        return "porcentaje", "metas fraccionarias que suman 1 (escala 0-1)"
    kt2 = re.sub(r"^indicador (pdd|pa)( ve)?( as\d\d[a-z]{2})? ", "", kt)
    if re.match(r"^(porcentaje|porcenjate|porcentage|tasa|indice|%)", kt2):
        return "porcentaje", "el nombre empieza por 'Porcentaje'/'Tasa'/'Índice' (sin contar el prefijo 'Indicador PDD:')"
    if (len(nz) >= 2 and regla_meta["regla"] == "suma" and abs(sum(nz) - 100) < 1e-6
            and not all(abs(m - 100) < 1e-9 for m in nz)):
        return "porcentaje", "metas parciales por bimestre que suman 100 (porcentaje acumulado)"
    return "numero", "por defecto (conteo)"


def notas_de_fila(f, rel, hoja):
    """Notas de Planeación de una fila: columna 'Notas' y columnas sueltas a la derecha del formato (AG...)."""
    out = OrderedDict()
    pref = "%s::%s" % (rel.split("/")[-1], hoja.strip())
    if f.get("notas"):
        out[pref + " Notas"] = f["notas"]
    for c, v in (f.get("columnas_extra") or {}).items():
        out["%s %s" % (pref, c)] = v
    return out


def tiene_narrativa(f):
    return any(f.get(k) for k in ("logros", "obs", "fuentes"))


def norm_si_no(v):
    if not v:
        return None
    u = clave_txt(v)
    if u in ("si", "s"):
        return "SI"
    if u == "no":
        return "NO"
    return None


def norm_na(v):
    if not v:
        return None
    if clave_txt(v) in ("n a", "na", "n7a", "no aplica", "n a n a"):
        return None
    return v


def linea_normalizada(t):
    if not t or clave_txt(t) in ("n a", "na", "no aplica"):
        return None
    # grafías vistas: '1. Creemos', '1-Creemos', '1- Creemos', 'Pilar 1. Creemos', 'Pilar 1: Creermos'
    if re.match(r"(?i)^\s*(pilar\s*)?1\s*[.:\-]\s*cre+r?mos\b", t):
        return "1. Creemos en la educación y en las oportunidades para el bienestar económico"
    return t


def construir():
    procesos_out = []
    nombres_b9 = Counter()
    pre = []
    for P in PROCESOS:
        est = leer_hoja(*P["estructura"])
        b9 = est["encabezado"].get("proyecto_proceso")
        m = re.match(r"^\s*(\d{6})\s*-?\s*(.*)$", b9 or "", re.S)
        base = texto(m.group(2)) if m else b9
        nombres_b9[clave_txt(base)] += 1
        pre.append((P, est, base, m.group(1) if m else None))

    for P, est, nombre_base, cod_proy in pre:
        usar(P["estructura"][0], P["estructura"][1], "estructura+metas")
        filas = est["filas"]
        enc = est["encabezado"]
        cols = est["columnas"]
        for a in est["avisos"]:
            AVISOS.append("%s :: %s: %s" % (P["estructura"][0], P["estructura"][1], a))

        # ------- formulación (solo A-L)
        form = leer_hoja(P["formul"][0], P["formul"][1], solo_formulacion=True)
        usar(P["formul"][0], P["formul"][1], "formulacion (A-L y notas a la derecha del formato, referencia)")
        mf, det_f, sin_f = emparejar_formulacion(form["filas"], filas)
        for j, p in det_f.items():
            if p["regla"] != "nombre+accion":
                AVISOS.append("formulación %s fila %d -> %s fila %d (regla %s; nombre %.2f, acción %.2f, productos %s, metas %s)" % (
                    P["formul"][0].split("/")[-1], form["filas"][p["i"]]["fila"], P["clave"], filas[j]["fila"], p["regla"],
                    p["s_ind"], p["t_acc"], "%.2f" % p["t_prod"] if p["t_prod"] is not None else "-",
                    "iguales" if p["metas_eq"] else "distintas"))
        solo_form = []
        for i in sin_f:
            ff = form["filas"][i]
            o = OrderedDict([("fila", ff["fila"]), ("accion", ff["accion"]), ("indicador", ff["indicador"])])
            o["metas"] = OrderedDict((str(b + 1), numero(ff["metas"][b])[0]) for b in range(6))
            o["metas"]["total"] = numero(ff["meta_total"])[0]
            nts = notas_de_fila(ff, P["formul"][0], P["formul"][1])
            if nts:
                o["notas_planeacion"] = nts
            solo_form.append(o)

        # ------- candidatos de valores
        cands = []
        for (rel, hoja, bim) in P["valores"]:
            h = leer_hoja(rel, hoja)
            m, dif, sin = emparejar(h["filas"], filas)
            cands.append({"rel": rel, "hoja": hoja, "bim": bim, "h": h, "m": m})
            if len(cands) > 1:
                usar(rel, hoja, "comparación de valores (alterna)")
            for (i, ratio, j) in dif:
                AVISOS.append("emparejamiento difuso %.2f %s::%s fila %d -> %s fila %d" % (
                    ratio, rel.split("/")[-1], hoja, h["filas"][i]["fila"], P["clave"], filas[j]["fila"]))
            for i in sin:
                NO_MAPEADOS.append({"proceso": P["clave"], "archivo": rel, "hoja": hoja, "fila": h["filas"][i]["fila"],
                                    "indicador": h["filas"][i]["indicador"], "uso": "valores",
                                    "motivo": "no existe en la hoja vigente"})
        auth = cands[0]

        # ------- narrativa por bimestre
        narr = {}
        for b in (1, 2, 3):
            fuentes = []
            for t in P["narrativa"][b]:
                rel, hoja = t[0], t[1]
                exacto = len(t) > 2 and t[2]
                h = leer_hoja(rel, hoja)
                m, dif, sin = emparejar(h["filas"], filas, solo_exacto=exacto)
                fuentes.append({"rel": rel, "hoja": hoja, "h": h, "m": m, "exacto": exacto})
                for (i, ratio, j) in dif:
                    AVISOS.append("emparejamiento difuso %.2f %s::%s fila %d -> %s fila %d" % (
                        ratio, rel.split("/")[-1], hoja, h["filas"][i]["fila"], P["clave"], filas[j]["fila"]))
                if not exacto:
                    for i in sin:
                        if (rel, hoja) in [(c["rel"], c["hoja"]) for c in cands]:
                            continue  # ya reportado en valores
                        NO_MAPEADOS.append({"proceso": P["clave"], "archivo": rel, "hoja": hoja,
                                            "fila": h["filas"][i]["fila"], "indicador": h["filas"][i]["indicador"],
                                            "uso": "narrativa bim %d" % b, "motivo": "no existe en la hoja vigente"})
            narr[b] = fuentes

        # ------- bimestres reportados
        reportados = []
        for b in (1, 2, 3):
            hay_valor = any(numero(f["avances"][b - 1])[0] not in (None, 0) for f in filas)
            hay_texto = False
            if narr[b]:
                f0 = narr[b][0]
                hay_texto = any(tiene_narrativa(f0["h"]["filas"][i]) for i in f0["m"].values())
            if hay_valor or hay_texto:
                reportados.append(b)
        for b in (4, 5, 6):
            for f in filas:
                v = numero(f["avances"][b - 1])[0]
                if v not in (None, 0):
                    AVISOS.append("%s: valor %r en Bim %d (fila %d) — no se importa (bimestre sin reporte)" % (
                        P["clave"], v, b, f["fila"]))

        # ------- acciones e indicadores
        acciones = OrderedDict()
        riesgos_cat = OrderedDict()
        bloques = OrderedDict()
        for idx, f in enumerate(filas):
            key = f["accion_top"]
            if not f["accion"]:
                AVISOS.append("%s fila %d: indicador sin ACCIÓN (celda vacía, sin merge)" % (P["clave"], f["fila"]))
            if key not in acciones:
                acciones[key] = {"orden": len(acciones) + 1, "descripcion": f["accion"], "riesgos": [], "indicadores": []}
            rie_txt, rie_top = f["riesgo"], f["riesgo_top"]
            f["_riesgo_fuente"] = None
            if not rie_txt:
                # la celda de riesgo de la versión vigente está vacía: p. ej. GEP Permanencia, donde C14:C15 estaba
                # combinada y al borrar la fila 14 (ancla) en BIM 2 la fila del indicador quedó sin riesgo.
                alternas = [(c["rel"], c["hoja"], c["h"]["filas"][c["m"][idx]]) for c in cands[1:] if c["m"].get(idx) is not None]
                if mf.get(idx) is not None:
                    alternas.append((P["formul"][0], P["formul"][1], form["filas"][mf[idx]]))
                for rel_a, hoja_a, fa in alternas:
                    if fa["riesgo"]:
                        rie_txt, rie_top = fa["riesgo"], (rel_a, fa["riesgo_top"])
                        f["_riesgo_fuente"] = "%s :: %s!%s" % (rel_a, hoja_a, fa["riesgo_celda"])
                        usar(rel_a, hoja_a, "riesgo (celda vacía en la hoja vigente)")
                        break
            rs = dividir_riesgos(rie_txt)
            if rs and rie_top not in bloques:
                bloques[rie_top] = len(bloques) + 1
            for it in rs:
                if it["texto"] not in riesgos_cat:
                    it = OrderedDict(it)
                    it["bloque"] = bloques[rie_top]
                    riesgos_cat[it["texto"]] = it
            f["_riesgos"] = [it["texto"] for it in rs]
            for t in f["_riesgos"]:
                if t not in acciones[key]["riesgos"]:
                    acciones[key]["riesgos"].append(t)
            acciones[key]["indicadores"].append(idx)

        tope_proc = Counter()
        acciones_out = []
        n_ind = 0
        for key, A in acciones.items():
            inds_out = []
            for orden_acc, idx in enumerate(A["indicadores"], 1):
                f = filas[idx]
                n_ind += 1
                consecutivo = idx + 1
                codigo = "%s-%02d" % (P["codigo"], consecutivo)
                ex = OrderedDict()
                ex["consecutivo"] = consecutivo
                ex["fila"] = f["fila"]
                if f.get("numero") is not None:
                    ex["numero_excel"] = f["numero"]
                    if f["numero"] != consecutivo:
                        AVISOS.append("%s: No. de Excel %s distinto del consecutivo %d" % (codigo, f["numero"], consecutivo))
                ex.update(atributos_indicador(f["indicador"]))
                revisar = []
                # metas
                metas = OrderedDict()
                for b in range(6):
                    v, nota = numero(f["metas"][b])
                    if nota and nota != "texto numérico":
                        revisar.append("meta Bim %d: %s" % (b + 1, nota))
                    metas[str(b + 1)] = v
                mt, nota = numero(f["meta_total"])
                if nota and nota != "texto numérico":
                    revisar.append("meta total: %s" % nota)
                metas["total"] = mt
                # cálculo
                pm = patron_formula(f["meta_total_f"], f["fila"], cols)
                pa = patron_formula(f.get("avance_total_f"), f["fila"], cols)
                rm = regla_total(pm, "meta", f["meta_total"])
                ra = regla_total(pa, "avance", f.get("avance_total"))
                pp = [patron_formula(x, f["fila"], cols) for x in f.get("pcts_f", [])] + \
                     [patron_formula(f.get("pct_total_f"), f["fila"], cols)]
                rp = regla_pct(pp)
                tope_proc[rp] += 1
                FORMULAS["meta_total"][pm or ("constante" if f["meta_total"] not in (None, "") else "vacío")] += 1
                FORMULAS["avance_total"][pa or ("constante" if f.get("avance_total") not in (None, "") else "vacío")] += 1
                for x in pp[:6]:
                    if x:
                        FORMULAS["pct_bim"][re.sub(r"(avance|meta|pct)\d", r"\1n", x)] += 1
                if pp[6]:
                    FORMULAS["pct_total"][pp[6]] += 1
                pct_tecleados = [b + 1 for b in range(6) if f["pcts"][b] not in (None, "") and not f["pcts_f"][b]]
                calculo = OrderedDict()
                calculo["meta_total"] = OrderedDict([("formula", pm or ("constante %s" % texto(f["meta_total"]) if f["meta_total"] is not None else None)),
                                                     ("regla", rm["regla"]), ("divisor", rm["divisor"])])
                calculo["avance_total"] = OrderedDict([("formula", pa or ("constante %s" % texto(f["avance_total"]) if f.get("avance_total") is not None else None)),
                                                       ("regla", ra["regla"]), ("divisor", ra["divisor"])])
                calculo["porcentaje"] = OrderedDict([("regla", rp), ("tope_100", True if rp == "con_tope_100" else (False if rp == "sin_tope" else None)),
                                                     ("bimestres_tecleados", pct_tecleados)])
                if rp in ("mixto", "otra"):
                    tpb = OrderedDict()
                    for k5, x in zip([str(n) for n in range(1, 7)] + ["total"], pp):
                        if x and x.startswith("IF(") and ">100%,100%" in x:
                            tpb[k5] = True
                        elif x and re.fullmatch(r"(avance\d|avance_total)/(meta\d|meta_total)", x):
                            tpb[k5] = False
                        else:
                            tpb[k5] = None
                    # sin fórmula (tecleado o vacío): se usa el valor de los demás bimestres de la fila si coinciden;
                    # si no, el de la dependencia (tope en DTF, GEP, OCI y Planeación; sin tope en SAF)
                    vals_b = set(v for k5, v in tpb.items() if k5 != "total" and v is not None)
                    defecto = vals_b.pop() if len(vals_b) == 1 else (P["dep"] != "SAF")
                    inferidos = [k5 for k5, v in tpb.items() if v is None]
                    for k5 in inferidos:
                        tpb[k5] = defecto
                    calculo["porcentaje"]["tope_por_bimestre"] = tpb
                    if inferidos:
                        calculo["porcentaje"]["tope_inferido_en"] = inferidos
                if rm["regla"] in ("constante", "vacio", "suma_rango_incompleto", "otra"):
                    revisar.append("total de meta: %s (%s)" % (rm["regla"], calculo["meta_total"]["formula"]))
                if ra["regla"] in ("constante", "vacio", "suma_rango_incompleto", "otra"):
                    revisar.append("total de avance: %s (%s)" % (ra["regla"], calculo["avance_total"]["formula"]))
                if rm["divisor"] != ra["divisor"] or (rm["regla"] == "suma") != (ra["regla"] == "suma"):
                    if not (rm["regla"] == "si_suma_mayor_99_entonces_100" and ra["regla"] == "suma_dividida"):
                        revisar.append("reglas de total distintas: meta=%s avance=%s" % (
                            calculo["meta_total"]["formula"], calculo["avance_total"]["formula"]))
                tipo, regla_tipo = inferir_tipo(f["indicador"], [metas[str(b)] for b in range(1, 7)], mt, rm)
                if tipo == "porcentaje" and "fraccionarias" in regla_tipo:
                    ex["escala"] = "0-1"
                # Excel: totales en caché de la fuente autorizada (y meta total original si se normaliza)
                excel_c = OrderedDict([("avance_total", numero(f.get("avance_total"))[0]),
                                       ("porcentaje_total", numero(f.get("pct_total"))[0])])
                vig_m = [metas[str(b)] for b in range(1, 7)] + [metas["total"]]   # vector tal como está en Excel
                # normalización de reglas de total (calculo.*.regla = regla que aplica la app; regla_excel = la del Excel)
                n_prog = sum(1 for b in range(1, 7) if isinstance(metas[str(b)], (int, float)) and metas[str(b)] > 0)
                if tipo == "a_demanda":
                    if rm["regla"] not in ("suma_dividida", "si_suma_mayor_99_entonces_100") and n_prog:
                        calculo["meta_total"]["regla_excel"] = rm["regla"]
                        calculo["meta_total"]["regla"] = "suma_dividida"
                        calculo["meta_total"]["divisor"] = n_prog
                        calculo["meta_total"]["normalizado"] = ("indicador a demanda: meta total = Σ metas / %d = 100 (el Excel trae %s)"
                                                                % (n_prog, calculo["meta_total"]["formula"]))
                        if metas["total"] != 100:
                            excel_c["meta_total"] = metas["total"]
                            metas["total"] = 100
                            revisar.append("meta total normalizada a 100 (a demanda); en Excel = %s" % texto(f["meta_total"]))
                    if ra["regla"] not in ("suma_dividida",):
                        div = calculo["meta_total"]["divisor"] if calculo["meta_total"]["regla"] == "suma_dividida" else n_prog
                        if div:
                            calculo["avance_total"]["regla_excel"] = ra["regla"]
                            calculo["avance_total"]["regla"] = "suma_dividida"
                            calculo["avance_total"]["divisor"] = div
                            calculo["avance_total"]["normalizado"] = ("indicador a demanda: avance total = Σ avances / %d, como el resto "
                                                                      "de indicadores a demanda (el Excel trae %s)" % (div, calculo["avance_total"]["formula"]))
                elif ra["regla"] == "vacio" and rm["regla"] in ("suma", "suma_dividida"):
                    calculo["avance_total"]["regla_excel"] = "vacio"
                    calculo["avance_total"]["regla"] = rm["regla"]
                    calculo["avance_total"]["divisor"] = rm["divisor"]
                    calculo["avance_total"]["normalizado"] = ("la celda de total de avance está vacía (sin fórmula); se aplica la misma "
                                                              "regla del total de meta (%s)" % calculo["meta_total"]["formula"])
                # responsable
                resp, cor = separar_rol(f["rol"])
                # formulación
                jf = mf.get(idx)
                if jf is None:
                    ex["en_formulacion"] = False
                else:
                    ex["en_formulacion"] = True
                    ff = form["filas"][jf]
                    ex["fila_formulacion"] = ff["fila"]
                    if det_f[idx]["regla"] != "nombre+accion":
                        ex["emparejamiento_formulacion"] = det_f[idx]["regla"]
                    mform = [numero(x)[0] for x in ff["metas"]] + [numero(ff["meta_total"])[0]]
                    if mform != vig_m:   # incluye el total (p. ej. DTF-FON-05: SUM 300 -> SUM/3 100)
                        ex["metas_formulacion"] = OrderedDict((str(b + 1), mform[b]) for b in range(6))
                        ex["metas_formulacion"]["total"] = mform[6]
                # metas distintas en otros archivos de seguimiento del linaje (las copias idénticas se agrupan)
                otras = []
                por_vector = OrderedDict()
                for c in cands[1:]:
                    i = c["m"].get(idx)
                    if i is None:
                        continue
                    fc = c["h"]["filas"][i]
                    vm = [numero(x)[0] for x in fc["metas"]] + [numero(fc["meta_total"])[0]]
                    if vm == vig_m:
                        continue
                    if tuple(vm) in por_vector:
                        por_vector[tuple(vm)].setdefault("otras_copias", []).append(
                            OrderedDict([("archivo", c["rel"]), ("hoja", c["hoja"]), ("fila", fc["fila"])]))
                        continue
                    o = OrderedDict([("archivo", c["rel"]), ("hoja", c["hoja"]), ("fila", fc["fila"])])
                    o["metas"] = OrderedDict((str(b + 1), vm[b]) for b in range(6))
                    o["metas"]["total"] = vm[6]
                    por_vector[tuple(vm)] = o
                    otras.append(o)
                if otras:
                    ex["metas_otras_versiones"] = otras
                    CONFLICTOS.append(OrderedDict([
                        ("tipo", "meta_distinta"), ("proceso", P["clave"]), ("codigo", codigo),
                        ("indicador", f["indicador"][:140]), ("bimestre", None),
                        ("valor_elegido", OrderedDict((str(k4 + 1) if k4 < 6 else "total", v4) for k4, v4 in enumerate(vig_m))),
                        ("fuente_elegida", "%s :: %s (fila %d)" % (auth["rel"], auth["hoja"], f["fila"])),
                        ("alternativas", otras)]))
                # notas de Planeación: hoja vigente, archivos anteriores del linaje y formulación (sin repetir textos)
                extras_cols = OrderedDict()
                fuentes_notas = [(f, P["estructura"][0], P["estructura"][1])]
                fuentes_notas += [(c["h"]["filas"][c["m"][idx]], c["rel"], c["hoja"]) for c in cands[1:] if c["m"].get(idx) is not None]
                if jf is not None:
                    fuentes_notas.append((form["filas"][jf], P["formul"][0], P["formul"][1]))
                for fn, rel_n, hoja_n in fuentes_notas:
                    for k_n2, v_n2 in notas_de_fila(fn, rel_n, hoja_n).items():
                        if clave_txt(str(v_n2)) not in [clave_txt(str(x)) for x in extras_cols.values()]:
                            extras_cols[k_n2] = v_n2
                if extras_cols:
                    ex["notas_planeacion"] = extras_cols
                if f["_riesgo_fuente"]:
                    ex["riesgo_fuente"] = f["_riesgo_fuente"]
                    revisar.append("riesgo vacío en la hoja vigente (fila %d); se toma de %s" % (f["fila"], f["_riesgo_fuente"]))
                ex["excel"] = excel_c
                # seguimiento
                seg = OrderedDict()
                for b in reportados:
                    e = OrderedDict()
                    fuente_e = OrderedDict()
                    # valor: siempre el de la fuente autorizada (último archivo del linaje)
                    elegido, nota = numero(f["avances"][b - 1])
                    pct, notap = numero(f["pcts"][b - 1])
                    if nota and nota != "texto numérico":
                        revisar.append("avance Bim %d en %s: %s (se toma null)" % (b, auth["rel"].split("/")[-1], nota))
                    # comparación con los demás archivos del linaje que pueden traer este bimestre
                    alts, vacios = [], []
                    for c in cands[1:]:
                        if c["bim"] < b:
                            continue
                        i = c["m"].get(idx)
                        if i is None:
                            continue
                        fc = c["h"]["filas"][i]
                        v, nv = numero(fc["avances"][b - 1])
                        raw = fc["avances"][b - 1]
                        ref = OrderedDict([("archivo", c["rel"]), ("hoja", c["hoja"]), ("fila", fc["fila"])])
                        if v is None and raw in (None, ""):
                            if elegido not in (None, 0):
                                ref["valor"] = None
                                vacios.append(ref)
                            continue
                        if elegido is None and v == 0:
                            continue  # vacío frente a 0 precargado: no es conflicto
                        if v is None or elegido is None or abs(v - elegido) > 1e-9 * max(1, abs(elegido)):
                            ref["valor"] = v if v is not None else texto(raw)
                            alts.append(ref)
                    fuente_auth = "%s :: %s (fila %d)" % (auth["rel"], auth["hoja"], f["fila"])
                    solo_otro = [x for x in alts if elegido is None and isinstance(x["valor"], (int, float)) and x["valor"] != 0]
                    if solo_otro:
                        CONFLICTOS.append(OrderedDict([
                            ("tipo", "valor_solo_en_otro_archivo"), ("proceso", P["clave"]), ("codigo", codigo),
                            ("indicador", f["indicador"][:140]), ("bimestre", b), ("valor_elegido", None),
                            ("fuente_elegida", fuente_auth), ("alternativas", solo_otro),
                            ("detalle", "la fuente autorizada está vacía; el valor de la otra versión no se importa (el archivo más "
                                        "reciente del linaje gana)")]))
                        revisar.append("avance Bim %d vacío en la fuente autorizada; %s trae %s (no se importa)" % (
                            b, ", ".join("%s fila %d" % (x["archivo"].split("/")[-1], x["fila"]) for x in solo_otro),
                            ", ".join(texto(x["valor"]) for x in solo_otro)))
                    otros_alts = [x for x in alts if x not in solo_otro]
                    if otros_alts:
                        CONFLICTOS.append(OrderedDict([
                            ("tipo", "valor_distinto"), ("proceso", P["clave"]), ("codigo", codigo),
                            ("indicador", f["indicador"][:140]), ("bimestre", b), ("valor_elegido", elegido),
                            ("fuente_elegida", fuente_auth), ("alternativas", otros_alts)]))
                    if vacios:
                        CONFLICTOS.append(OrderedDict([
                            ("tipo", "completado_en_version_posterior"), ("proceso", P["clave"]), ("codigo", codigo),
                            ("indicador", f["indicador"][:140]), ("bimestre", b), ("valor_elegido", elegido),
                            ("fuente_elegida", fuente_auth), ("alternativas", vacios),
                            ("detalle", "la celda está vacía en una versión anterior (p. ej. la entrega del propio bimestre) y "
                                        "la fuente autorizada trae el valor (diligenciado o corregido después)")]))
                    e["avance"] = elegido
                    e["porcentaje"] = pct
                    # narrativa
                    nf = None
                    for k_n, fu in enumerate(narr[b]):
                        i = fu["m"].get(idx)
                        if i is None:
                            continue
                        cand_f = fu["h"]["filas"][i]
                        if tiene_narrativa(cand_f):
                            nf = (fu, cand_f, k_n)
                            break
                        if nf is None:
                            nf = (fu, cand_f, k_n)
                    if nf:
                        fu, nfila, k_n = nf
                        e["logros"] = nfila.get("logros")
                        e["observaciones"] = nfila.get("obs")
                        e["riesgo_materializado"] = norm_si_no(nfila.get("riesgo_mat"))
                        e["numeral_riesgo"] = norm_na(nfila.get("numeral"))
                        e["descripcion_riesgo"] = norm_na(nfila.get("desc"))
                        e["fuentes_verificacion"] = nfila.get("fuentes")
                        if nfila.get("logros_combinado") and e["logros"]:
                            # una sola celda combinada sobre logros y observaciones: es una nota sobre la fila, no un logro
                            if not e["observaciones"]:
                                e["observaciones"] = e["logros"]
                            revisar.append("Bim %d: el texto %r está en la celda combinada %s (logros + observaciones) de %s; "
                                           "se guarda como observación y logros queda null" % (
                                               b, e["logros"][:60], nfila["logros_combinado"], fu["rel"].split("/")[-1]))
                            e["logros"] = None
                        usar(fu["rel"], fu["hoja"], "narrativa bim %d" % b)
                        if k_n > 0:
                            fuente_e["narrativa"] = "%s :: %s (fila %d)" % (fu["rel"], fu["hoja"], nfila["fila"])
                            CONFLICTOS.append(OrderedDict([
                                ("tipo", "narrativa_desde_otro_archivo"), ("proceso", P["clave"]), ("codigo", codigo),
                                ("indicador", f["indicador"][:140]), ("bimestre", b),
                                ("fuente_elegida", fuente_e["narrativa"]),
                                ("detalle", "la fuente autorizada %s :: %s no trae texto para este indicador" % (
                                    narr[b][0]["rel"].split("/")[-1], narr[b][0]["hoja"]))]))
                        # textos distintos en las otras fuentes de narrativa del mismo bimestre
                        alt_n = []
                        for k_o, fo in enumerate(narr[b]):
                            if k_o == k_n or fo["m"].get(idx) is None:
                                continue
                            fr = fo["h"]["filas"][fo["m"][idx]]
                            if not any(fr.get(k6) for k6 in ("logros", "obs", "riesgo_mat", "numeral", "desc", "fuentes")):
                                continue
                            difs = OrderedDict()
                            for k6, nom6, fn6 in (("logros", "logros", None), ("obs", "observaciones", None),
                                                  ("riesgo_mat", "riesgo_materializado", norm_si_no),
                                                  ("numeral", "numeral_riesgo", norm_na), ("desc", "descripcion_riesgo", norm_na),
                                                  ("fuentes", "fuentes_verificacion", None)):
                                va6 = fn6(nfila.get(k6)) if fn6 else nfila.get(k6)
                                vb6 = fn6(fr.get(k6)) if fn6 else fr.get(k6)
                                if clave_txt(va6 or "") != clave_txt(vb6 or ""):
                                    corta = lambda t: (t if not t or len(t) <= 400 else t[:400] + "…")
                                    difs[nom6] = OrderedDict([("elegido", corta(va6)), ("alterno", corta(vb6))])
                            if difs:
                                alt_n.append(OrderedDict([("archivo", fo["rel"]), ("hoja", fo["hoja"]), ("fila", fr["fila"]),
                                                          ("campos", difs)]))
                        if alt_n:
                            CONFLICTOS.append(OrderedDict([
                                ("tipo", "narrativa_distinta"), ("proceso", P["clave"]), ("codigo", codigo),
                                ("indicador", f["indicador"][:140]), ("bimestre", b),
                                ("fuente_elegida", "%s :: %s (fila %d)" % (fu["rel"], fu["hoja"], nfila["fila"])),
                                ("alternativas", alt_n)]))
                    else:
                        for k3 in ("logros", "observaciones", "riesgo_materializado", "numeral_riesgo",
                                   "descripcion_riesgo", "fuentes_verificacion"):
                            e[k3] = None
                    if fuente_e:
                        e["fuente"] = fuente_e
                    seg[str(b)] = e
                ind = OrderedDict()
                ind["orden"] = orden_acc
                ind["codigo"] = codigo
                ind["nombre"] = f["indicador"]
                ind["tipo_meta"] = tipo
                ind["regla_tipo_meta"] = regla_tipo
                ind["metas"] = metas
                ind["calculo"] = calculo
                ind["productos"] = f["productos"]
                ind["rol_responsable"] = f["rol"]
                ind["responsable"] = resp
                ind["corresponsables"] = cor
                if f["_riesgos"] != A["riesgos"]:
                    ex["riesgos"] = f["_riesgos"]
                if revisar:
                    ex["revisar"] = revisar
                ind["extras"] = ex
                ind["seguimiento"] = seg
                inds_out.append(ind)
            acciones_out.append(OrderedDict([("orden", A["orden"]), ("descripcion", A["descripcion"]),
                                             ("riesgos", A["riesgos"]), ("indicadores", inds_out)]))

        # ------- proceso
        dup = nombres_b9[clave_txt(nombre_base)] > 1
        nombre = P["nombre_si_duplicado"] if (dup and P["nombre_si_duplicado"]) else nombre_base
        if dup and not P["nombre_si_duplicado"]:
            AVISOS.append("%s: nombre duplicado sin alternativa" % P["clave"])
        tipo = P["tipo_forzado"] or ("proyecto" if cod_proy else "proceso")
        ex = OrderedDict()
        ex["proyecto_proceso"] = enc.get("proyecto_proceso")
        ex["codigo_proyecto"] = cod_proy
        ex["area_reporta"] = P["area"]
        ex["linea_pdd_normalizada"] = linea_normalizada(enc.get("linea_pdd"))
        if enc.get("componente_pdd"):
            ex["componente_pdd"] = enc.get("componente_pdd")
        ex["formato_version"] = enc.get("formato_version")
        ex["riesgos"] = list(riesgos_cat.values())
        mpad = re.match(r"^((?:Gestión|Direccionamiento)[^-]*?)\s*-\s*(.+)$", nombre_base or "", re.S)
        if mpad and tipo == "proceso":
            ex["proceso_padre"] = mpad.group(1).strip()
            ex["subproceso"] = mpad.group(2).strip()
        if P["clave"] in ("ope-gesco-i", "ope-pipc"):
            ex["proceso_padre"] = "Direccionamiento Estratégico"
        ex["alias_hojas"] = ALIAS_HOJAS.get(P["clave"], [])
        ex["bimestres_reportados"] = reportados
        ex["bimestres_pendientes"] = [b for b in (1, 2, 3) if b not in reportados]
        ex["tope_100_porcentaje"] = (True if set(tope_proc) <= {"con_tope_100", None} and tope_proc.get("con_tope_100")
                                     else (False if set(tope_proc) <= {"sin_tope", None} and tope_proc.get("sin_tope") else "mixto"))
        ex["indicadores_solo_en_formulacion"] = solo_form
        fuente = OrderedDict()
        fuente["formulacion"] = {"archivo": P["formul"][0], "hoja": P["formul"][1]}
        fuente["estructura"] = {"archivo": P["estructura"][0], "hoja": P["estructura"][1]}
        fs = OrderedDict()
        for b in (1, 2, 3):
            x = OrderedDict()
            x["reportado"] = b in reportados
            x["valores"] = {"archivo": auth["rel"], "hoja": auth["hoja"]} if b in reportados else None
            if b in reportados:
                usar(auth["rel"], auth["hoja"], "valores bim %d" % b)
            x["narrativa"] = ({"archivo": narr[b][0]["rel"], "hoja": narr[b][0]["hoja"]} if (narr[b] and b in reportados) else None)
            x["alternas"] = [{"archivo": c["rel"], "hoja": c["hoja"], "uso": "valores"} for c in cands[1:] if c["bim"] >= b] + \
                            [{"archivo": fu["rel"], "hoja": fu["hoja"], "uso": "narrativa"} for fu in narr[b][1:]]
            fs[str(b)] = x
        fuente["seguimiento"] = fs
        po = OrderedDict()
        po["clave"] = P["clave"]
        po["codigo"] = P["codigo"]
        po["dependencia"] = P["dep"]
        po["nombre"] = nombre
        po["hoja"] = P["hoja"].strip()
        po["tipo"] = tipo
        lp = enc.get("linea_pdd")
        po["linea_plan_desarrollo"] = None if clave_txt(lp or "") in ("", "n a") else lp
        dp = enc.get("dimension_pe")
        po["dimension_plan_estrategico"] = None if clave_txt(dp or "") in ("", "n a") else dp
        po["objetivo"] = enc.get("objetivo")
        po["programa"] = enc.get("programa_pdd")
        po["extras"] = ex
        po["fuente"] = fuente
        po["acciones"] = acciones_out
        procesos_out.append(po)
    return procesos_out


BORRADORES_FORMULACION = {
    # libro de borrador -> hoja de la formulación consolidada de OPE que lo reemplaza
    ("Formulación PAI 2026/FormatoPlanAccion2026GESCO+i - PC.xlsx", " PAI GESCO+i"): (F_OPE, "GESCO+i"),
    ("Formulación PAI 2026/FormatoPlanAccion2026GESCO+i - PC.xlsx", " PAI PC"): (F_OPE, "Participación Ciudadana"),
    ("Formulación PAI 2026/PAI 2026 MIPG.xlsx", "SIG"): (F_OPE, "Sist. Integrado de Gestión"),
    ("Formulación PAI 2026/PAI PPEP PROYECTADO 2026.xlsx", "PPEP2026"): (F_OPE, "PPEP2026"),
}


def hojas_no_usadas():
    """Inventario de todas las hojas del zip que no alimentan el JSON, con el motivo."""
    out = []
    usadas = {(rel, h.strip()) for rel, hs in USADOS.items() for h in hs}
    for rel in sorted(_RUTAS):
        if not rel.lower().endswith(".xlsx"):
            continue
        wbv, _ = libro(rel)
        props = wbv.properties
        for ws in wbv.worksheets:
            hoja = ws.title
            if (rel, hoja.strip()) in usadas:
                continue
            estado = "oculta" if ws.sheet_state != "visible" else "visible"
            if (rel, hoja) in BORRADORES_FORMULACION:
                rel2, hoja2 = BORRADORES_FORMULACION[(rel, hoja)]
                w2 = libro(rel2)[0][hoja2]
                p2 = libro(rel2)[0].properties
                def _nf(t):  # texto sin viñetas 'BIM n', mayúsculas ni puntuación
                    t = clave_txt(t or "")
                    return " ".join(re.sub(r"\bbim\s*\d+( (y|al) \d+)*\b", " ", t).split())
                d_fmt, d_cont = [], []
                for r in range(1, max(ws.max_row, w2.max_row) + 1):
                    for c in range(1, 13):
                        va, vb = texto(ws.cell(r, c).value), texto(w2.cell(r, c).value)
                        if va != vb:
                            (d_fmt if _nf(va) == _nf(vb) else d_cont).append("%s%d" % (COL(c), r))
                motivo = ("borrador de la oficina (modificado %s) que la formulación consolidada '%s' :: '%s' (modificada %s) reemplaza; "
                          "difiere en %d celdas de A-L: %d solo de formato (viñetas '* BIM n:', mayúsculas) y %d de contenido%s"
                          % (props.modified.strftime("%Y-%m-%d %H:%M") if props.modified else "?", rel2.split("/")[-1], hoja2,
                             p2.modified.strftime("%Y-%m-%d %H:%M") if p2.modified else "?", len(d_fmt) + len(d_cont),
                             len(d_fmt), len(d_cont), (" (%s)" % ", ".join(d_cont)) if d_cont else ""))
            elif estado == "oculta":
                motivo = {"Observatorio BIM 1": "oculta: seguimiento 2025 del Observatorio",
                          "Observatorio BIM 2": "oculta: seguimiento 2025 del Observatorio",
                          "GENERAL ": "oculta: resumen con errores #REF!",
                          "Hoja1": "oculta: hoja auxiliar"}.get(hoja, "oculta")
            elif hoja.strip() == "Consolidado":
                motivo = "promedios de % por proceso y bimestre de Planeación; cambia con cada copia, no es fuente"
            elif rel == F_ODES and hoja == "OdeS":
                motivo = "usada solo A-L como formulación (las columnas M-AF traen valores de 2025)"
            elif rel.startswith("Seguimiento BIM") or rel.startswith("Formulación"):
                motivo = ("copia del libro compartido de Planeación: la hoja no corresponde a la oficina que envió el archivo "
                          "o es una rama sin los datos más recientes (ver la nota de linaje)")
            else:
                motivo = "sin clasificar"
                AVISOS.append("hoja sin clasificar: %s :: %s" % (rel, hoja))
            if (rel, hoja) in BORRADORES_FORMULACION:
                out.append(OrderedDict([("archivo", rel), ("hoja", hoja), ("estado", estado), ("motivo", motivo),
                                        ("reemplazada_por", OrderedDict([("archivo", rel2), ("hoja", hoja2)])),
                                        ("celdas_distintas_formato", d_fmt), ("celdas_distintas_contenido", d_cont)]))
                continue
            out.append(OrderedDict([("archivo", rel), ("hoja", hoja), ("estado", estado), ("motivo", motivo)]))
    return out


def main():
    procesos = construir()
    # ---------------- notas
    notas = []
    notas.append("Fuente de estructura y metas (plan vigente): la hoja del archivo de Seguimiento BIM 3 de cada dependencia "
                 "(SAF, DTF, GEP, OCI); 'Seguimiento PAI BIM 3 2026 SIG-MIPG.xlsx' para Direccionamiento Estratégico, GESCO+i, PIPC, "
                 "SIG-MIPG y OdeS; 'Seguimiento PAI BIM 3 2026 PPEP.xlsx' para PPEP. La carpeta Formulación solo se usa como referencia "
                 "(A-L y notas sueltas a la derecha del formato): marca extras.en_formulacion (+ extras.fila_formulacion), "
                 "extras.metas_formulacion (si cambió alguna meta Bim 1-6 o el total) y proceso.extras.indicadores_solo_en_formulacion.")
    notas.append("Linaje de Planeación: Planeación reparte una copia del libro compartido, cada oficina llena su hoja y OPE consolida "
                 "(BIM 1 OPE, BIM 2 OPE). En BIM 3 no hay consolidado de OPE: 'Seguimiento PAI BIM 3 2026 SIG-MIPG.xlsx' (2026-07-08) "
                 "continúa el consolidado BIM 2 OPE (2026-06-17): mismas hojas y metas, más el Bim 3 de SIG-MIPG y dos correcciones tardías del "
                 "Bim 2 de Direccionamiento Estratégico (OPE-DE-11 0→1 y OPE-DE-17 0→100, registradas en 'conflictos'). Por eso es la fuente "
                 "vigente de DE, GESCO+i, PIPC, SIG-MIPG y OdeS aunque lo haya enviado SIG-MIPG: es la última versión del consolidado, no una "
                 "copia de otra oficina. 'Seguimiento PAI BIM 3 2026 PPEP.xlsx' parte de la copia vieja de BIM 2 PPEP (sin el Bim 2 de DE, "
                 "GESCO+i, PIPC, SIG-MIPG y OdeS, y con metas anteriores de GESCO+i y PIPC), así que solo se usa su hoja PPEP.")
    notas.append("Valores (avance M-R, o N-S en OCI) de cada bimestre: siempre de la fuente autorizada (el archivo más reciente del linaje). "
                 "Se compara con los demás archivos del linaje que pueden traer ese bimestre y se registra en 'conflictos': valor_distinto "
                 "(otro número), completado_en_version_posterior (la celda está vacía en una versión anterior, p. ej. la entrega del propio "
                 "bimestre, y la fuente autorizada sí trae el valor) y valor_solo_en_otro_archivo (la fuente autorizada está vacía y otra "
                 "versión trae un valor: NO se importa, queda null y se anota en extras.revisar; caso OCI-AI-11).")
    notas.append("Narrativa (logros AA, observaciones AB, riesgo materializado AC, numeral AD, descripción AE, fuentes AF): se sobrescribe "
                 "en cada entrega, así que la del bimestre n sale del archivo del BIM n (SAF: no hay archivo de BIM 1 → narrativa Bim 1 null; "
                 "Planeación: BIM 1 OPE y BIM 2 OPE consolidados; Bim 3 solo existe para SIG-MIPG y PPEP). Si la fuente autorizada no trae el "
                 "indicador o no trae texto para él, se usa la alterna listada en fuente.seguimiento[b].alternas y se registra "
                 "(narrativa_desde_otro_archivo). Si una alterna del mismo bimestre trae textos distintos se conserva el de la fuente elegida "
                 "y las diferencias, campo por campo, quedan en 'conflictos' (narrativa_distinta; p. ej. la copia de la OdeS frente al "
                 "consolidado BIM 1 OPE, que es su versión revisada). Una celda combinada que cubre logros y observaciones (TALENTO HUMANO "
                 "BIM 2 AA31:AB33 'ACCIÓN E INDICADORES REPETIDOS') es una nota sobre las filas, no un logro: se guarda en observaciones.")
    notas.append("Bimestre reportado (proceso.extras.bimestres_reportados): hay al menos un avance distinto de 0 en la fuente autorizada "
                 "o al menos un texto de logros/observaciones/fuentes en la fuente de narrativa de ese bimestre. Solo los bimestres "
                 "reportados tienen entrada en indicador.seguimiento; los demás (y los Bim 4-6, que en los Excel solo tienen 0 precargados "
                 "o vacíos) no se importan. Dentro de un bimestre reportado: celda vacía → null; 0 escrito → 0.")
    notas.append("Cambios al esquema pedido: (1) proceso.codigo (prefijo de los códigos de indicador); (2) proceso.fuente.estructura y, por "
                 "bimestre, fuente.seguimiento[b] = {reportado, valores, narrativa, alternas}; (3) indicador.regla_tipo_meta (regla usada para "
                 "tipo_meta) e indicador.calculo (reglas de total de meta/avance y del %) para que la app recalcule; (4) seguimiento[b].fuente "
                 "solo cuando el dato vino de un archivo distinto del de proceso.fuente.seguimiento[b]; (5) listas de nivel superior "
                 "'conflictos', 'no_mapeados', 'hojas_no_usadas' y 'avisos_extractor'; indicador.extras.metas_otras_versiones = metas "
                 "distintas en archivos anteriores del linaje (reprogramaciones; las copias idénticas van en otras_copias) y "
                 "extras.metas_formulacion = metas de la formulación si cambiaron; (6) proceso.extras.riesgos = catálogo {numeral, texto, "
                 "descripcion, rc, bloque} (bloque = n.º de la celda combinada de riesgo dentro de la hoja; PPEP tiene 2 bloques con numeración "
                 "propia); acción.riesgos = unión, en orden, de los riesgos de la columna C que cubren sus indicadores (si un indicador tiene un "
                 "riesgo distinto al de su acción se repite en indicador.extras.riesgos); si la celda de riesgo de la hoja vigente está vacía se "
                 "toma de la versión anterior más reciente del linaje (o de la formulación) y se anota en extras.riesgo_fuente (caso GEP-PER-01: "
                 "C14:C15 combinada en formulación y BIM 1; desde BIM 2 la fila ancla 14 se borró); (7) proceso.extras.indicadores_solo_en_formulacion "
                 "= lista de objetos {fila, accion, indicador, metas, notas_planeacion?} y proceso.extras.indicadores_trasladados = los que "
                 "pasaron a otra hoja {fila, indicador, destino_proceso, destino_codigo}.")
    notas.append("Emparejamiento formulación → plan vigente: el nombre no basta (OCI repite 'Seguimientos realizados.' e 'Informes "
                 "realizados.' en muchas filas; SAF renombró indicadores). Se combinan nombre, acción, productos (K) y metas Bim 1-6; las reglas "
                 "están en la docstring de emparejar_formulacion() y cada pareja que no es 'nombre+accion' queda en extras.emparejamiento_formulacion "
                 "y en avisos_extractor. Las auditorías basadas en riesgos que cambiaron de proceso auditado (OCI filas 41-42) y los seguimientos "
                 "PAAC/PTEP de la formulación (OCI filas 19-20) no tienen par: la fila 19 vigente (PTEP semestral) es nueva.")
    notas.append("Códigos: indicador.codigo = <proceso.codigo>-<consecutivo de 2 dígitos dentro de la hoja vigente> (p. ej. SAF-TH-01). "
                 "indicador.orden = posición dentro de la acción; extras.consecutivo = posición en la hoja; extras.fila = fila en la fuente "
                 "autorizada; en OCI extras.numero_excel = columna A 'No.' (oculta).")
    notas.append("Acciones: se agrupan exactamente por la celda combinada de la columna ACCIONES (A; B en OCI seguimiento). La acción "
                 "es la celda superior del merge; un indicador sin merge forma su propia acción. Riesgo, productos (K), rol (L) y AC-AE "
                 "también se propagan desde la celda superior de su merge vertical.")
    notas.append("tipo_meta: 'a_demanda' si el total de meta en Excel es SUM(D:I)/n o IF(SUM(D:I)>99,100,0), o si el nombre dice "
                 "'a demanda' y todas las metas programadas son 100; 'porcentaje' si las metas son fracciones que suman 1 (escala 0-1, "
                 "extras.escala), si el nombre empieza por 'Porcentaje'/'Tasa'/'Índice' (sin contar el prefijo 'Indicador PDD:') o si sus "
                 "metas parciales suman exactamente 100 con total SUM (porcentaje acumulado); 'numero' en los demás casos. Las metas y avances "
                 "porcentuales se guardan como en Excel (100 = 100 %); seguimiento[b].porcentaje es la celda % de Excel (fracción, 1 = 100 %).")
    notas.append("Normalización de totales (indicador.calculo.*): 'formula' es el texto del Excel y 'regla'/'divisor' la regla que aplica la "
                 "app; cuando difieren se agregan 'regla_excel' y 'normalizado' (motivo). En los 'a_demanda' la meta total es 100 = Σ metas / n.º "
                 "de bimestres programados y el avance total = Σ avances / ese mismo divisor: OPE-GES-04 y OPE-PC-05 traen el total de meta "
                 "tecleado en 0 y el avance como SUM (la rama PPEP los corrige a SUM/6), OPE-PC-07 trae la meta SUM/6 y el avance SUM, y "
                 "SAF-GD-03/05/08 la meta SUM(D). En esos casos metas.total = 100 y el valor original queda en extras.excel.meta_total. "
                 "Si la celda de total de avance está vacía (OPE-PC-04, 08, 09, 10) se aplica la regla del total de meta.")
    notas.append("Texto: se recortan espacios, se normalizan saltos de línea (\\r\\n → \\n, máximo una línea en blanco) y espacios repetidos; "
                 "celdas vacías → null. riesgo_materializado se normaliza a 'SI'/'NO' ('No'/'NO' → 'NO'; 'N/A' → null); numeral_riesgo y "
                 "descripcion_riesgo 'N/A'/'N7A'/'No aplica' → null. linea_plan_desarrollo, extras.linea_pdd_normalizada y "
                 "dimension_plan_estrategico 'N/A' → null; extras.linea_pdd_normalizada unifica las grafías de la línea 1 ('1. Creemos', "
                 "'1-Creemos', '1- Creemos', 'Pilar 1. Creemos', 'Pilar 1: Creermos'). extras.indicador_pa / indicador_pdd = texto tras el rótulo "
                 "hasta la línea en blanco o el otro rótulo (los saltos de línea simples se unen con espacio). Logros/observaciones/fuentes "
                 "conservan 'N/A' tal cual.")
    notas.append("Números: se usan los valores en caché (data_only=True), también donde la celda es una fórmula aritmética (=640+47+19, =1/6); "
                 "los decimales se redondean a 10 cifras (0.9999999999999999 → 1). Texto en una celda numérica ('-') o errores (#DIV/0!) → null "
                 "y se anota en extras.revisar.")
    notas.append("Notas de Planeación (indicador.extras.notas_planeacion): columna 'Notas' y columnas sueltas a la derecha del formato (AG…) de "
                 "la hoja vigente, de los archivos anteriores del linaje y de la formulación (p. ej. GEP Bilinguismo!AG14:AG15 y Ciudadela!AG14, "
                 "que solo están en la formulación). Clave = 'archivo::hoja columna'; un mismo texto se guarda una sola vez (la fuente más reciente).")
    # reglas de fórmula
    def top(c, n=12):
        return ", ".join("%s ×%d" % (k, v) for k, v in c.most_common(n))
    notas.append("Fórmulas de Total de META (J; K en OCI) en las fuentes autorizadas: " + top(FORMULAS["meta_total"]) +
                 ". Regla para recalcular: suma → Σ metas Bim 1-6; suma_dividida → Σ metas / divisor (el divisor es el n.º de bimestres "
                 "programados con 100); si_suma_mayor_99_entonces_100 → 100 si Σ metas > 99, si no 0; constante → valor tecleado (revisar).")
    notas.append("Fórmulas de Total de AVANCE (S; T en OCI): " + top(FORMULAS["avance_total"]) +
                 ". Regla: suma → Σ avances; suma_dividida → Σ avances / divisor (Excel usa /6 en los 'a demanda' con IF>99 y /n con la misma n "
                 "de la meta). Es avance frente a la meta anual, no cumplimiento a la fecha.")
    notas.append("Fórmulas de % por bimestre (T-Y; U-Z en OCI), con n = bimestre: " + top(FORMULAS["pct_bim"], 8) +
                 ". % total (Z; AA en OCI): " + top(FORMULAS["pct_total"], 8) +
                 ". Regla: % bim = avance_b / meta_b solo si meta_b > 0 (si no, null); % total = avance_total / meta_total. Tope min(1, x) "
                 "según indicador.calculo.porcentaje: tope_100 = true (DTF, GEP, OCI, Planeación) o false (SAF); regla 'mixto' (tope_100 = null) "
                 "→ usar calculo.porcentaje.tope_por_bimestre {1..6, total} (SAF-CAR-01: tope en Bim 1-2, sin tope en Bim 3-6 y total; "
                 "GEP-EIA-02/03/04: tope en los bimestres, sin tope en el total). Donde el Excel no tiene fórmula de % (tecleado o vacío) se "
                 "usa el valor de los demás bimestres de la fila o, si no coinciden, el de la dependencia, y esas claves quedan en "
                 "calculo.porcentaje.tope_inferido_en. Hay % tecleados a mano (calculo.porcentaje.bimestres_tecleados): "
                 "la app debe recalcular, no confiar en la celda.")
    notas.append("Logro del proceso por bimestre (fila de promedios bajo los indicadores) = AVERAGE de los % del bimestre de los indicadores "
                 "con meta > 0 en ese bimestre; logro total = AVERAGE de los % totales. La hoja 'Consolidado' de Planeación = promedio simple "
                 "de esos promedios para Direccionamiento Estratégico, GESCO+i, PIPC y SIG-MIPG (excluye PPEP y OdeS). No se importa.")
    notas.append("Nombre del proceso: el texto de 'PROYECTO - PROCESO' sin el código BPIN; cuando ese texto se repite entre hojas "
                 "(DTF Fondos/Territorial/Matrícula Cero y PPEP comparten '240302- Fortalecimiento…'; GESCO+i y PIPC dicen "
                 "'Direccionamiento Estratégico') se usa un nombre basado en la hoja. El texto original queda en extras.proyecto_proceso y "
                 "el código en extras.codigo_proyecto. tipo = 'proyecto' si hay código BPIN (y en GEP Permanencia, que no lo trae); "
                 "programa = 'Programa del Plan de Desarrollo Distrital' (solo existe en PPEP).")
    notas.append("Dependencia OPE: la sigla no aparece desarrollada en las fichas; se infiere 'Planeación Estratégica' (proceso de "
                 "Planeación Estratégica / Oficina de Planeación). extras.area_reporta indica la oficina que diligencia la hoja "
                 "(GESCO+i, PIPC, SIG-MIPG, PPEP, ODES, OPE). El nombre de SAF se infiere del cargo 'Subdirector(a) Administrativo(a), "
                 "Financiero(a) y de Apoyo a la Gestión'.")
    notas.append("Indicador trasladado: 'Mesa Distrital de Permanencia SAPIENCIA - IES - IETDH acompañadas (a demanda)' estaba en GEP "
                 "Permanencia (formulación y BIM 1, fila 14, con avance Bim 1 = 100 y narrativa) y desde BIM 2 está en PPEP; se importa solo "
                 "en PPEP (OPE-PPEP-16, extras.proceso_origen) y su narrativa de Bim 1 se toma de 'Seguimiento PAI BIM 1 2026 GEP.xlsx' :: "
                 "Permanencia. En gep-permanencia figura en extras.indicadores_trasladados, no en indicadores_solo_en_formulacion.")
    notas.append("No se usan (lista completa en 'hojas_no_usadas'): hojas ocultas ('Observatorio BIM 1/2' = seguimiento 2025, 'GENERAL ' con "
                 "#REF!, 'Hoja1'), hojas 'Consolidado', columnas M-AF de la formulación (la hoja OdeS de 'ODES -PAI 2026.xlsx' trae valores de "
                 "2025), los borradores de formulación de las oficinas que la formulación consolidada 'FormatoPlanAccion2026 OPE.xlsx' "
                 "reemplaza ('FormatoPlanAccion2026GESCO+i - PC.xlsx', 'PAI 2026 MIPG.xlsx' :: SIG, 'PAI PPEP PROYECTADO 2026.xlsx' :: PPEP2026; "
                 "son anteriores, del 28 al 30 de enero, y sus nombres de hoja figuran en proceso.extras.alias_hojas) y las copias del libro de "
                 "Planeación que no corresponden a la oficina que las envió (p. ej. DE/GESCO+i/PIPC/OdeS dentro de BIM 3 PPEP; la excepción "
                 "BIM 3 SIG-MIPG se explica en la nota de linaje).")
    notas.append("Conflictos conocidos que requieren validación con Planeación (ver 'conflictos'): metas de GESCO+i y PIPC (se usa la "
                 "versión del linaje consolidado BIM 2 OPE → BIM 3 SIG-MIPG); OdeS Bim 1 'Notas temáticas' (2 en la copia de ODES, 0 en el "
                 "consolidado: se usa 0); OCI-AI-11 'Informe realizado' (licenciamiento): Bim 1 = 1 solo en el archivo BIM 1 re-editado el "
                 "2026-06-24 (meta en Bim 2; vacío en BIM 2 y en BIM 3, la fuente autorizada): queda null y marcado en extras.revisar.")
    # marcar proceso_origen del indicador trasladado
    for p in procesos:
        for a in p["acciones"]:
            for i in a["indicadores"]:
                if p["clave"] == "ope-ppep" and "mesa distrital de permanencia" in clave_txt(i["nombre"]):
                    i["extras"]["proceso_origen"] = "gep-permanencia"
    # anotar indicadores trasladados entre hojas
    vig = {}
    for p in procesos:
        for a in p["acciones"]:
            for i in a["indicadores"]:
                vig.setdefault(clave_txt(i["nombre"]), (p["clave"], i["codigo"]))
    for nm in NO_MAPEADOS:
        k = clave_txt(nm["indicador"])
        if k in vig and vig[k][0] != nm["proceso"]:
            nm["motivo"] = "trasladado a %s (%s)" % vig[k]
    for p in procesos:
        solo, tras = [], []
        for o in p["extras"]["indicadores_solo_en_formulacion"]:
            k = clave_txt(o["indicador"])
            if k in vig and vig[k][0] != p["clave"]:
                t = OrderedDict([("fila", o["fila"]), ("indicador", o["indicador"]),
                                 ("destino_proceso", vig[k][0]), ("destino_codigo", vig[k][1])])
                tras.append(t)
            else:
                solo.append(o)
        p["extras"]["indicadores_solo_en_formulacion"] = solo
        if tras:
            p["extras"]["indicadores_trasladados"] = tras
    # ---------------- resumen
    por_dep = OrderedDict()
    tot_a = tot_i = 0
    for d in DEPENDENCIAS:
        ps = [p for p in procesos if p["dependencia"] == d["sigla"]]
        na = sum(len(p["acciones"]) for p in ps)
        ni = sum(len(a["indicadores"]) for p in ps for a in p["acciones"])
        por_dep[d["sigla"]] = OrderedDict([("procesos", len(ps)), ("acciones", na), ("indicadores", ni)])
        tot_a += na
        tot_i += ni
    generado = []
    for rel, hojas in USADOS.items():
        usos = sorted(set(u for r in hojas.values() for u in r))
        generado.append(OrderedDict([("archivo", rel), ("hojas", [h.strip() for h in hojas]), ("usos", usos)]))
    out = OrderedDict()
    out["vigencia"] = 2026
    out["formato"] = "F-ES-DE-003"
    out["generado_desde"] = generado
    out["notas"] = notas
    out["dependencias"] = DEPENDENCIAS
    out["procesos"] = procesos
    out["resumen"] = OrderedDict([("procesos", len(procesos)), ("acciones", tot_a), ("indicadores", tot_i),
                                  ("por_dependencia", por_dep)])
    out["conflictos"] = CONFLICTOS
    out["no_mapeados"] = NO_MAPEADOS
    out["hojas_no_usadas"] = hojas_no_usadas()
    out["avisos_extractor"] = list(OrderedDict.fromkeys(AVISOS))
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    # ---------------- impresión
    print("Salida:", SALIDA)
    print("%-34s %-4s %4s %4s  %-9s  %-14s %s" % ("proceso", "dep", "acc", "ind", "bim.rep", "avances B1/B2/B3", "narrativa B1/B2/B3"))
    for p in procesos:
        inds = [i for a in p["acciones"] for i in a["indicadores"]]
        rep = p["extras"]["bimestres_reportados"]
        av = []
        nr = []
        for b in ("1", "2", "3"):
            av.append(str(sum(1 for i in inds if b in i["seguimiento"] and i["seguimiento"][b]["avance"] is not None)) if int(b) in rep else "-")
            nr.append(str(sum(1 for i in inds if b in i["seguimiento"] and (i["seguimiento"][b]["logros"] or i["seguimiento"][b]["observaciones"]))) if int(b) in rep else "-")
        print("%-34s %-4s %4d %4d  %-9s  %-16s %s" % (p["clave"], p["dependencia"], len(p["acciones"]), len(inds),
                                                       ",".join(map(str, rep)) or "-", "/".join(av), "/".join(nr)))
    print("TOTAL: procesos=%d acciones=%d indicadores=%d" % (len(procesos), tot_a, tot_i))
    print("por dependencia:", json.dumps(por_dep, ensure_ascii=False))
    print("conflictos:", dict(Counter(c["tipo"] for c in CONFLICTOS)), " no_mapeados:", len(NO_MAPEADOS), " avisos:", len(out["avisos_extractor"]))


if __name__ == "__main__":
    main()
