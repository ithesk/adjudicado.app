"""Soporte de pared para switch TP-Link TL-SG108 (script para Fusion 360).

Crea un diseño nuevo con:
  - "Soporte TL-SG108": el cuerpo a imprimir (placa, laterales ventilados,
    labios frontales, apoyo inferior, peine de cables y agujeros avellanados).
  - "REF switch (no imprimir)": un bloque del tamaño del switch, solo como guía.

Ejes del modelo (pensado para imprimir con la placa apoyada en la cama):
  Z = sale de la pared (Z=0 es la cara que toca la pared)
  Y = vertical en la pared (los puertos del switch miran hacia -Y)
  X = horizontal

Para cambiar medidas, edita la sección PARÁMETROS y vuelve a ejecutar.
Todas las medidas van en milímetros.
"""
import math
import traceback

# ---------------- PARÁMETROS (mm) ----------------
SW_W = 158.0          # ancho del switch
SW_H = 101.0          # fondo del switch (queda vertical)
SW_D = 25.0           # alto del switch (lo que sale de la pared)
GAP = 0.4             # holgura por lado
T = 3.0               # espesor de paredes

LIP = 9.0             # cuánto montan los labios frontales sobre el switch
WALL_EXTRA = 4.0      # laterales más altos que el switch
PLATE_TOP_EXTRA = 17.0  # placa por encima del switch (para los tornillos de arriba)

PORT_COUNT = 8
PORT_FIRST_X = -44.0  # centro del puerto 1 (0 = centro del switch)
PORT_PITCH = 14.6     # separación entre puertos
POWER_X = -66.0       # centro del conector de corriente

CABLE_D = 6.2         # hueco para cable de red (Cat6 ~6.0)
CABLE_ENTRY = 5.0     # entrada del clic, más estrecha que el cable
POWER_D = 4.2         # hueco para cable de corriente
POWER_ENTRY = 3.2

COMB_GAP = 42.0       # distancia del switch a la cara superior del peine
COMB_H = 8.0          # grosor del peine
RIB_H = 20.0          # altura de los refuerzos del peine

SCREW_D = 4.5         # agujero para tornillo de 4 mm
SCREW_HEAD_D = 8.5    # avellanado a 90°
SCREW_X = 62.0
# --------------------------------------------------


def build_ops():
    """Devuelve (operaciones del soporte, caja del switch de referencia)."""
    x_in = SW_W / 2 + GAP
    x_out = x_in + T
    z_sw1 = T + SW_D
    z_front = z_sw1 + GAP + T
    z_c = T + SW_D / 2               # eje de los cables
    wall_top = SW_H + WALL_EXTRA
    comb_top = -COMB_GAP
    comb_bot = comb_top - COMB_H
    plate_bot = comb_bot - 6.0
    plate_top = SW_H + PLATE_TOP_EXTRA
    ports = [PORT_FIRST_X + i * PORT_PITCH for i in range(PORT_COUNT)]

    ops = []

    def add_box(x0, x1, y0, y1, z0, z1):
        ops.append(('add', 'box', (x0, x1, y0, y1, z0, z1)))

    def cut_box(x0, x1, y0, y1, z0, z1):
        ops.append(('cut', 'box', (x0, x1, y0, y1, z0, z1)))

    # Placa trasera
    add_box(-x_out, x_out, plate_bot, plate_top, 0, T)
    # Laterales
    for s in (-1, 1):
        x0, x1 = sorted((s * x_in, s * x_out))
        add_box(x0, x1, -T, wall_top, T, z_front)
    # Labios frontales
    add_box(x_in - LIP, x_out, -T, wall_top, z_sw1 + GAP, z_front)
    add_box(-x_out, -x_in + LIP, -T, wall_top, z_sw1 + GAP, z_front)
    # Apoyo inferior: extremos sólidos + franja frontal (el centro queda libre para los conectores)
    add_box(-x_out, POWER_X - 7, -T, 0, T, z_front)
    add_box(ports[-1] + 8, x_out, -T, 0, T, z_front)
    add_box(-x_out, x_out, -T, 0, z_sw1 - 2, z_front)
    # Peine
    add_box(-x_out, x_out, comb_bot, comb_top, T, z_front)
    # Refuerzos del peine (luego se recortan en triángulo)
    ribs = [(-x_out, -x_out + T), (x_out - T, x_out)]
    for x0, x1 in ribs:
        add_box(x0, x1, comb_top, comb_top + RIB_H, T, z_front)

    # Ranuras de ventilación en los laterales
    for y in (14, 34, 54, 74):
        cut_box(-x_out - 1, -x_in + 1, y, y + 11, 9, 23)
        cut_box(x_in - 1, x_out + 1, y, y + 11, 9, 23)

    # Ranuras del peine (ojo de cerradura abierto hacia el frente)
    slots = [(x, CABLE_D / 2, CABLE_ENTRY / 2) for x in ports] + [(POWER_X, POWER_D / 2, POWER_ENTRY / 2)]
    for x, r, e in slots:
        ops.append(('cut', 'cyl', ((x, comb_bot - 1, z_c), (x, comb_top + 1, z_c), r, r)))
        cut_box(x - e, x + e, comb_bot - 1, comb_top + 1, z_c, z_front + 1)

    # Recorte triangular de los refuerzos
    dy, dz = RIB_H, -(z_front - T)
    L = math.hypot(dy, dz)
    d = (0.0, dy / L, dz / L)
    n = (0.0, -dz / L, dy / L)          # = X × d, apunta al lado que se corta
    S = 100.0
    for x0, x1 in ribs:
        mid = ((x0 + x1) / 2, comb_top + dy / 2, z_front + dz / 2)
        c = (mid[0], mid[1] + n[1] * S / 2, mid[2] + n[2] * S / 2)
        ops.append(('cut', 'obox', (c, (1.0, 0.0, 0.0), d, (x1 - x0) + 2, L, S)))

    # Agujeros avellanados (desde la cara del switch, Z = T)
    r_s, r_h = SCREW_D / 2, SCREW_HEAD_D / 2
    for x in (-SCREW_X, SCREW_X):
        for y in (plate_top - 8, comb_top + 22):
            ops.append(('cut', 'cyl', ((x, y, -1), (x, y, T + 1), r_s, r_s)))
            sink = r_h - r_s
            ops.append(('cut', 'cyl', ((x, y, T - sink), (x, y, T + 0.5), r_s, r_h + 0.5)))

    ref = (-SW_W / 2, SW_W / 2, 0, SW_H, T, z_sw1)
    return ops, ref


def run(context):
    import adsk.core
    import adsk.fusion
    app = adsk.core.Application.get()
    ui = app.userInterface
    try:
        app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
        design = adsk.fusion.Design.cast(app.activeProduct)
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
        design.fusionUnitsManager.distanceDisplayUnits = adsk.fusion.DistanceUnits.MillimeterDistanceUnits
        root = design.rootComponent
        tbm = adsk.fusion.TemporaryBRepManager.get()

        def cm(v):
            return v / 10.0  # la API trabaja en cm

        def pt(p):
            return adsk.core.Point3D.create(cm(p[0]), cm(p[1]), cm(p[2]))

        def vec(v):
            return adsk.core.Vector3D.create(v[0], v[1], v[2])

        def box(x0, x1, y0, y1, z0, z1):
            obb = adsk.core.OrientedBoundingBox3D.create(
                pt(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)),
                vec((1, 0, 0)), vec((0, 1, 0)),
                cm(x1 - x0), cm(y1 - y0), cm(z1 - z0))
            return tbm.createBox(obb)

        def make(kind, a):
            if kind == 'box':
                return box(*a)
            if kind == 'cyl':
                p1, p2, r1, r2 = a
                return tbm.createCylinderOrCone(pt(p1), cm(r1), pt(p2), cm(r2))
            if kind == 'obox':
                c, ldir, wdir, l, w, h = a
                obb = adsk.core.OrientedBoundingBox3D.create(pt(c), vec(ldir), vec(wdir), cm(l), cm(w), cm(h))
                return tbm.createBox(obb)
            raise ValueError(kind)

        ops, ref = build_ops()
        body = None
        for mode, kind, a in ops:
            tool = make(kind, a)
            if body is None:
                body = tool
                continue
            op = (adsk.fusion.BooleanTypes.UnionBooleanType if mode == 'add'
                  else adsk.fusion.BooleanTypes.DifferenceBooleanType)
            tbm.booleanOperation(body, tool, op)

        base = root.features.baseFeatures.add()
        base.name = 'Soporte TL-SG108'
        base.startEdit()
        main = root.bRepBodies.add(body, base)
        main.name = 'Soporte TL-SG108'
        ref_body = root.bRepBodies.add(box(*ref), base)
        ref_body.name = 'REF switch (no imprimir)'
        base.finishEdit()

        try:
            for b in root.bRepBodies:
                if b.name.startswith('REF'):
                    b.opacity = 0.35
        except Exception:
            pass

        app.activeViewport.fit()
        ui.messageBox('Soporte creado.\n\nPara imprimir: oculta o borra "REF switch (no imprimir)",\n'
                      'clic derecho en "Soporte TL-SG108" > Save As Mesh (STL o 3MF).')
    except Exception:
        ui.messageBox('Error al crear el soporte:\n{}'.format(traceback.format_exc()))
