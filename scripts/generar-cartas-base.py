#!/usr/bin/env python3
"""Construye las plantillas de las CARTAS PROPIAS de la empresa.

A diferencia de los formularios SNCC (oficiales, intocables), estas cartas
son documentos nuestros: declaración jurada del art. 38, aceptación de
condiciones y declaración de no colusión. Se generan como .docx mínimos con
los marcadores {campo} de docxtemplater, formato de carta formal.

Produce plantillas/cartas/*-tpl.docx. Reproducible.
"""

import zipfile
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "plantillas" / "cartas"
DIR.mkdir(parents=True, exist_ok=True)

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def parrafo(texto, negrita=False, centrado=False, derecha=False, espacio_despues=200):
    jc = ""
    if centrado:
        jc = '<w:jc w:val="center"/>'
    elif derecha:
        jc = '<w:jc w:val="right"/>'
    rpr = '<w:rPr><w:b/><w:sz w:val="24"/></w:rPr>' if negrita else '<w:rPr><w:sz w:val="24"/></w:rPr>'
    runs = ""
    for linea in texto.split("\n"):
        if runs:
            runs += "<w:br/>"
        runs += f'<w:t xml:space="preserve">{linea}</w:t>'
    return (
        f'<w:p><w:pPr>{jc}<w:spacing w:after="{espacio_despues}"/>'
        f'<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>'
        f"<w:r>{rpr}{runs}</w:r></w:p>"
    )


def carta(nombre, parrafos):
    cuerpo = "".join(parrafos)
    doc = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{cuerpo}"
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
        "</w:body></w:document>"
    )
    destino = DIR / f"{nombre}-tpl.docx"
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", doc)
    print(f"✓ {destino.name}")


FIRMA = [
    parrafo("", espacio_despues=400),
    parrafo("_________________________________"),
    parrafo("{rep_nombre}\n{rep_cargo}\n{empresa_nombre}"),
]

ENCABEZADO = [
    parrafo("Santo Domingo, República Dominicana, {fecha}", derecha=True, espacio_despues=400),
    parrafo("Señores\n{entidad_nombre}", espacio_despues=200),
    parrafo("Referencia: Procedimiento núm. {expediente}", negrita=True, espacio_despues=400),
]

carta("DJ-ART38", [
    *ENCABEZADO,
    parrafo("DECLARACIÓN JURADA", negrita=True, centrado=True, espacio_despues=400),
    parrafo(
        "Quien suscribe, {rep_nombre}, dominicano(a), mayor de edad, portador(a) de la "
        "cédula de identidad y electoral núm. {rep_cedula}, actuando en calidad de "
        "{rep_cargo} de la sociedad {empresa_nombre}, RNC núm. {rnc}, con domicilio en "
        "{empresa_direccion}, DECLARA BAJO LA MÁS SOLEMNE FE DEL JURAMENTO:",
        espacio_despues=300,
    ),
    parrafo(
        "Que ni quien suscribe ni la sociedad que representa se encuentran dentro de las "
        "prohibiciones establecidas en el artículo 38 de la Ley núm. 47-25 sobre Compras "
        "y Contrataciones Públicas de la República Dominicana.",
        espacio_despues=300,
    ),
    parrafo("La presente declaración se expide para los fines del procedimiento de referencia."),
    *FIRMA,
])

carta("CARTA-COND", [
    *ENCABEZADO,
    parrafo("Distinguidos señores:", espacio_despues=300),
    parrafo(
        "Por medio de la presente, {empresa_nombre}, RNC núm. {rnc}, representada por "
        "{rep_nombre} en calidad de {rep_cargo}, declara que ACEPTA las condiciones de "
        "pago y el tiempo de entrega establecidos en el pliego de condiciones del "
        "procedimiento de referencia.",
        espacio_despues=300,
    ),
    parrafo("Sin otro particular, se despide,"),
    *FIRMA,
])

carta("DJ-COLUSION", [
    *ENCABEZADO,
    parrafo("DECLARACIÓN JURADA DE OFERTA LIBRE DE COLUSIÓN", negrita=True, centrado=True, espacio_despues=400),
    parrafo(
        "Quien suscribe, {rep_nombre}, en calidad de {rep_cargo} de {empresa_nombre}, "
        "RNC núm. {rnc}, declara que la oferta presentada en el procedimiento de "
        "referencia es auténtica, ha sido realizada de buena fe y con la intención de "
        "aceptar la adjudicación del contrato de resultar favorecida, y que se encuentra "
        "exenta de cualquier tipo de conducta o práctica colusoria.",
        espacio_despues=300,
    ),
    *FIRMA,
])
