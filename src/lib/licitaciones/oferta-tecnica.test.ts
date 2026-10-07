import { describe, expect, it } from "vitest";
import type { ProcesoCanonico } from "./contrato";
import { faltantesOfertaTecnica, htmlOfertaTecnica, partirDescripcion } from "./oferta-tecnica";

const DATOS = {
  validez_dias: "45",
  plazo_entrega: "30 días calendario",
  lugar_entrega: "Almacén central",
  garantia: "1 año del fabricante",
};

function canonico(producto?: { marca: string; modelo: string; descripcion: string }): ProcesoCanonico {
  return {
    meta: { id: "00000000-0000-0000-0000-000000000001", org_id: "00000000-0000-0000-0000-000000000002", version: 1, generado_en: "2026-10-06T10:00" },
    proceso: {
      codigo: "OGTIC-CCC-CP-2026-0011",
      modalidad: "CP",
      objeto: "Adquisición de laptops <urgentes>",
      entidad: { nombre: "OGTIC", siglas: "OGTIC" },
      cronograma: { cierre: "2026-10-20T10:00" },
      moneda: "DOP",
      adjudicacion: "item",
      criterio: "menor_precio",
    },
    oferente: { razon_social: "Empresa SRL", rnc: "1", rpe: "2", direccion: "SD", telefono: "809", email: "a@b.do" },
    firmantes: [{ rol: "gerente_general", nombre: "Ana Pérez", cargo: "Gerente General" }],
    lotes: [{ numero: 1, items: [{ numero: 1, spec_cruda: "Laptop i7, 16 GB", cantidad: 3, unidad: "UD", ofertamos: true, producto }] }],
    requisitos: [],
  };
}

describe("partirDescripcion", () => {
  it("primera línea = resumen, el resto = puntos sin viñeta", () => {
    expect(partirDescripcion("Dell Latitude 5450\n- RAM: 16 GB\n✓ Disco: 512 GB\n\n")).toEqual({
      resumen: "Dell Latitude 5450",
      puntos: ["RAM: 16 GB", "Disco: 512 GB"],
    });
  });
});

describe("faltantesOfertaTecnica", () => {
  it("pide las cuatro preguntas y la marca/modelo de cada ítem ofertado", () => {
    const f = faltantesOfertaTecnica(canonico(), {});
    expect(f).toHaveLength(5);
    expect(f.at(-1)).toContain("ítem 1");
  });
  it("completo no falta nada", () => {
    expect(
      faltantesOfertaTecnica(canonico({ marca: "Dell", modelo: "Latitude", descripcion: "x" }), DATOS),
    ).toEqual([]);
  });
});

describe("htmlOfertaTecnica", () => {
  const { html, pie } = htmlOfertaTecnica(
    canonico({ marca: "Dell", modelo: "Latitude 5450", descripcion: "Laptop empresarial\nRAM: 16 GB (req. mín. 16 GB)" }),
    { datos: DATOS, imagenes: {}, fecha: new Date(2026, 9, 6) },
  );
  it("escapa el texto del pliego y del proceso", () => {
    expect(html).toContain("Adquisición de laptops &lt;urgentes&gt;");
    expect(html).not.toContain("<urgentes>");
  });
  it("no lleva precios ni recursos externos (Chromium corre sin red)", () => {
    expect(html).not.toMatch(/RD\$\s*\d/);
    expect(html).not.toMatch(/(src|href)="https?:/);
  });
  it("pinta el cumplimiento con ✓ y clave en negrita", () => {
    expect(html).toContain("<strong>RAM:</strong> 16 GB (req. mín. 16 GB)");
    expect(html).toContain("30 días calendario");
    expect(html).toContain("45 días");
  });
  it("el pie numera las páginas", () => {
    expect(pie).toContain('class="pageNumber"');
  });
});

describe("foto del producto", () => {
  // PNG 1×1 válido
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  it("se incrusta en la tarjeta del ítem solo si existe", () => {
    const c = canonico({ marca: "Dell", modelo: "Latitude", descripcion: "x" });
    const con = htmlOfertaTecnica(c, { datos: DATOS, imagenes: {}, imagenesItems: new Map([[1, png]]) }).html;
    const sin = htmlOfertaTecnica(c, { datos: DATOS, imagenes: {} }).html;
    expect(con).toContain('<div class="foto"><img src="data:image/png;base64,');
    expect(sin).not.toContain('<div class="foto">');
  });
});
