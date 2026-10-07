import { describe, expect, it } from "vitest";
import { htmlDocumentoLibre, limpiarCuerpo } from "./entregables";

describe("limpiarCuerpo", () => {
  it("quita scripts con su contenido, estilos y manejadores", () => {
    const sucio =
      '<p onclick="x()">Hola</p><script>alert(1)</script><style>p{}</style><a href="javascript:x()">y</a><link rel="x">';
    const limpio = limpiarCuerpo(sucio);
    expect(limpio).toBe('<p>Hola</p><a >y</a>');
    expect(limpio).not.toContain("alert");
  });
  it("deja intacto el contenido normal", () => {
    const ok = "<h2>Plan</h2><table><tr><th>Fase</th></tr><tr><td>1</td></tr></table><ul><li><strong>A</strong></li></ul>";
    expect(limpiarCuerpo(ok)).toBe(ok);
  });
});

describe("htmlDocumentoLibre", () => {
  const datos = {
    codigo: "X-DAF-CM-2026-0001",
    objeto: "Licencias <urgentes>",
    entidad: "Ministerio X",
    razonSocial: "Empresa SRL",
    rnc: "1",
    rpe: "2",
    direccion: "SD",
    telefono: "809",
    email: "a@b.do",
    firmante: { nombre: "Ana Pérez", cargo: "Gerente General" },
  };
  it("viste el cuerpo con título, membrete y firma", () => {
    const { html, pie } = htmlDocumentoLibre(datos, {
      titulo: "Cronograma de entrega",
      cuerpoHtml: "<h2>Fases</h2>",
      firmar: true,
      imagenes: {},
    });
    expect(html).toContain("<h1>Cronograma de entrega</h1>");
    expect(html).toContain("Licencias &lt;urgentes&gt;");
    expect(html).toContain("Ana Pérez");
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect(pie).toContain("pageNumber");
  });
  it("sin firmar no lleva bloque de firma", () => {
    const { html } = htmlDocumentoLibre(datos, { titulo: "Matriz", cuerpoHtml: "<p>x</p>", firmar: false, imagenes: {} });
    expect(html).not.toContain('class="firma"');
  });
});
