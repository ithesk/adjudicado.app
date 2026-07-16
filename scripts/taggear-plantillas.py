#!/usr/bin/env python3
"""Taggea las plantillas oficiales de la DGCP para docxtemplater.

Toma cada .docx original de plantillas/dgcp/ y produce su versión -tpl.docx
con los marcadores {campo} en el lugar de las instrucciones del formulario
("[indicar el nombre jurídico del Oferente]", líneas de puntos, subrayados).
Los ORIGINALES no se tocan (regla de fidelidad: el comité exige el formato
oficial idéntico; solo cambia el texto de las instrucciones por los tags).

Reproducible: cuando la DGCP actualice una plantilla, se re-descarga el
original y se corre esto de nuevo.

Detalles espinosos que este script resuelve:
- Word parte el texto en "runs" arbitrarios; el reemplazo se hace sobre el
  texto reconstruido de cada párrafo, editando los runs quirúrgicamente
  (el formato de cada tramo se conserva).
- Los controles de contenido ("Click here to enter text.", "Seleccione la
  fecha") se sustituyen por texto plano con su tag, vía regex sobre el XML.
- La tabla del F.033 recibe el loop {#lineas}…{/lineas} en su primera fila
  vacía y las demás filas vacías se eliminan (docxtemplater repite la fila).
"""

import copy
import re
import shutil
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
DIR = Path(__file__).resolve().parent.parent / "plantillas" / "dgcp"


# ---------- reemplazo sobre runs (conserva el formato por tramo) ----------

def _texto_parrafo(p):
    return "".join(t.text or "" for t in p.iter(f"{{{W}}}t"))


def _reemplazar_en_parrafo(p, objetivo, reemplazo, es_regex=False):
    """Sustituye la PRIMERA aparición de `objetivo` en el texto del párrafo,
    repartiendo la edición entre los runs que el tramo atraviesa."""
    ts = list(p.iter(f"{{{W}}}t"))
    texto = "".join(t.text or "" for t in ts)
    if es_regex:
        m = re.search(objetivo, texto)
        if not m:
            return False
        ini, fin = m.span()
    else:
        ini = texto.find(objetivo)
        if ini < 0:
            return False
        fin = ini + len(objetivo)

    pos = 0
    puesto = False
    for t in ts:
        cont = t.text or ""
        t_ini, t_fin = pos, pos + len(cont)
        pos = t_fin
        if t_fin <= ini or t_ini >= fin:
            continue  # fuera del tramo
        antes = cont[: max(0, ini - t_ini)]
        despues = cont[max(0, min(len(cont), fin - t_ini)) :]
        t.text = antes + (reemplazo if not puesto else "") + despues
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        puesto = True
    return True


def reemplazar(root, objetivo, reemplazo, es_regex=False, todas=False):
    n = 0
    for p in root.iter(f"{{{W}}}p"):
        while _reemplazar_en_parrafo(p, objetivo, reemplazo, es_regex):
            n += 1
            if not todas:
                return n
    return n


# ---------- controles de contenido (sdt) → texto plano con tag ----------

def sustituir_sdt(xml, marcador_texto, tag):
    """Reemplaza cada bloque <w:sdt>…marcador…</w:sdt> por un run plano."""
    patron = re.compile(
        r"<w:sdt>(?:(?!</?w:sdt>).)*?" + re.escape(marcador_texto) + r"(?:(?!</?w:sdt>).)*?</w:sdt>",
        re.S,
    )
    run = f'<w:r><w:t xml:space="preserve">{tag}</w:t></w:r>'
    return patron.subn(run, xml)


# ---------- namespaces: conservar los prefijos originales ----------

def registrar_prefijos(xml):
    # mc:Ignorable referencia prefijos POR NOMBRE: si ElementTree los renombra
    # (ns0, ns1…), Word rechaza el documento. Se registran todos tal cual.
    for pref, uri in re.findall(r'xmlns:([\w-]+)="([^"]+)"', xml):
        ET.register_namespace(pref, uri)


# ---------- especificación por plantilla ----------

def taggear_f034(root):
    reemplazar(root, "Indicar Nombre de la Entidad Contratante", "{entidad_nombre}", todas=True)
    reemplazar(root, r"_{30,}\s*_{0,}", "{enmiendas}", es_regex=True)          # 1er bloque
    reemplazar(root, r"_{30,}\s*_{0,}", "{bienes_descripcion}", es_regex=True)  # 2º bloque
    reemplazar(root, r"\(Nombre y apellido\) _+", "(Nombre y apellido) {rep_nombre} ", es_regex=True)
    reemplazar(root, r"en calidad de _+", "en calidad de {rep_cargo} ", es_regex=True)
    reemplazar(root, "(poner aquí nombre del Oferente)", "{empresa_nombre}")


def taggear_f042(root):
    reemplazar(root, r"Fecha: _+", "Fecha: {fecha}", es_regex=True)
    reemplazar(root, "[indicar el nombre jurídico del Oferente]", "{empresa_nombre}")
    reemplazar(root, "[indicar el nombre jurídico de cada miembro del Consorcio]", "{consorcio}")
    reemplazar(root, r"RNC/ Cédula/ Pasaporte del Oferente:\s*", "RNC/ Cédula/ Pasaporte del Oferente: {rnc}", es_regex=True)
    reemplazar(root, "[indicar el número del Registro de Proveedores del Estado]", "{rpe}")
    reemplazar(root, r"Domicilio legal del Oferente:\s*", "Domicilio legal del Oferente: {empresa_direccion}", es_regex=True)
    reemplazar(root, "[indicar el nombre del representante autorizado]", "{rep_nombre}")
    reemplazar(root, "[indicar la dirección del representante autorizado]", "{rep_direccion}")
    reemplazar(root, "[indicar los números de teléfono y fax del representante autorizado]", "{empresa_telefono}")
    reemplazar(root, "[indicar la dirección de correo electrónico del representante autorizado]", "{empresa_email}")


def taggear_f047(root):
    reemplazar(root, "Santo Domingo, República Dominicana, fecha", "Santo Domingo, República Dominicana, {fecha}")
    reemplazar(root, "Indicar Nombre de la Entidad", "{entidad_nombre}")
    reemplazar(root, "Indicar identificación del Procedimiento de Contratación", "{expediente}")
    reemplazar(root, "[nombre completo y domicilio del fabricante]", "{fabricante_nombre_domicilio}")
    reemplazar(root, "[breve descripción del bien]", "{fabricante_bienes}")
    reemplazar(root, "[nombre completo del oferente]", "{empresa_nombre}")
    reemplazar(root, r"fabricación: _+", "fabricación: {fabricante_bienes_detalle}", es_regex=True)
    reemplazar(root, r"^_+$", "", es_regex=True, todas=True)  # líneas sobrantes
    reemplazar(root, r"^_+,\s*$", ",", es_regex=True)
    reemplazar(root, "Artículo [XXX]", "Artículo {articulo_garantia}")
    reemplazar(root, r"Nombre _+", "Nombre {fabricante_rep_nombre} ", es_regex=True)
    reemplazar(root, r"en calidad de _+", "en calidad de {fabricante_rep_cargo} ", es_regex=True)
    reemplazar(root, "[indicar nombre completo del fabricante]", "{fabricante_nombre}")
    reemplazar(root, "[indicar en letras y números], del mes [indicar en letra],  del [indicar el año en letras y números]", "{dia_letras}, del mes {mes_letras}, del {ano_letras}")


def taggear_f033(root):
    reemplazar(root, r"nombre del oferente:\s*", "nombre del oferente: {empresa_nombre}", es_regex=True)
    # La línea de puntos mezcla '…' con '.' — el patrón cubre ambos.
    reemplazar(root, r"VALOR\s+TOTAL DE LA OFERTA:\s*[….\s]+RD\$", "VALOR TOTAL DE LA OFERTA: RD$ {total_oferta}", es_regex=True)
    reemplazar(root, r"Valor total de la oferta en letras:\s*…+", "Valor total de la oferta en letras: {total_letras}", es_regex=True)
    reemplazar(root, r"…+nombre y apellido…+", "{rep_nombre}", es_regex=True)
    reemplazar(root, r"en calidad de …+\.*,", "en calidad de {rep_cargo},", es_regex=True)
    reemplazar(root, "(poner aquí nombre del Oferente y sello de la compañía, si procede)", "{empresa_nombre}")
    reemplazar(root, r"……../……../……….…\s*fecha|…+/…+/…+\s*fecha", "{fecha}", es_regex=True)

    # La tabla: loop de docxtemplater en la primera fila vacía; las demás
    # filas vacías se eliminan (la fila del loop se repite por línea).
    for tbl in root.iter(f"{{{W}}}tbl"):
        filas = tbl.findall(f"{{{W}}}tr")
        if not filas or "Item No." not in "".join(
            t.text or "" for t in filas[0].iter(f"{{{W}}}t")
        ):
            continue
        vacias = [tr for tr in filas[1:] if not "".join(t.text or "" for t in tr.iter(f"{{{W}}}t")).strip()]
        if not vacias:
            continue
        fila_loop = vacias[0]
        celdas = fila_loop.findall(f"{{{W}}}tc")
        tags = ["{#lineas}{numero}", "{descripcion}", "{unidad}", "{cantidad}", "{precio_unitario}", "{itbis_monto}", "{total}{/lineas}"]
        for celda, tag in zip(celdas, tags):
            # escribir el tag en el primer párrafo de la celda
            parr = celda.find(f"{{{W}}}p")
            if parr is None:
                continue
            r = ET.SubElement(parr, f"{{{W}}}r")
            t = ET.SubElement(r, f"{{{W}}}t")
            t.text = tag
            t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        for tr in vacias[1:]:
            tbl.remove(tr)


PLANTILLAS = {
    "SNCC_F034_Presentacion_de_Oferta": taggear_f034,
    "SNCC_F042_Informacion_Oferente": taggear_f042,
    "SNCC_F033_Of_Economica": taggear_f033,
    "SNCC_F047_Autorizacion_Fabricante": taggear_f047,
}

# En los encabezados (y sus copias de compatibilidad dentro del documento):
SDT_GLOBAL = [
    ("Click here to enter text.", "{expediente}"),
    ("Seleccione la fecha", "{fecha}"),
]


def procesar(nombre, fn):
    origen = DIR / f"{nombre}.docx"
    destino = DIR / f"{nombre}-tpl.docx"
    shutil.copy(origen, destino)

    with zipfile.ZipFile(origen) as z:
        partes = {n: z.read(n) for n in z.namelist()}

    for parte in list(partes):
        if not re.match(r"word/(document|header\d*)\.xml$", parte):
            continue
        xml = partes[parte].decode("utf8")

        for marcador, tag in SDT_GLOBAL:
            xml, _ = sustituir_sdt(xml, marcador, tag)

        registrar_prefijos(xml)
        root = ET.fromstring(xml)
        if parte == "word/document.xml":
            fn(root)
        partes[parte] = ET.tostring(root, encoding="unicode").encode("utf8")

    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        for n, data in partes.items():
            z.writestr(n, data)
    print(f"✓ {destino.name}")


if __name__ == "__main__":
    for nombre, fn in PLANTILLAS.items():
        procesar(nombre, fn)
    print("Listo. Verifica con: python3 scripts/taggear-plantillas.py --check")
