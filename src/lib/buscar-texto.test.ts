import { describe, it, expect } from "vitest";
import { coincideTexto } from "./buscar-texto";

describe("coincideTexto — el usuario no sabe cómo se escribió el dato", () => {
  const nombre = "Instituto Tecnológico de Las Américas (ITLA)";

  it("ignora mayúsculas y acentos en ambos lados", () => {
    expect(coincideTexto(nombre, "instituto")).toBe(true);
    expect(coincideTexto(nombre, "INSTITUTO")).toBe(true);
    expect(coincideTexto(nombre, "tecnologico")).toBe(true);
    expect(coincideTexto("MINISTERIO DE SALUD PUBLICA", "salud pública")).toBe(true);
  });

  it("prefijos mientras se teclea", () => {
    expect(coincideTexto(nombre, "insti")).toBe(true);
    expect(coincideTexto(nombre, "amer")).toBe(true);
  });

  it("perdona faltas ortográficas leves", () => {
    expect(coincideTexto(nombre, "insituto")).toBe(true); // letra de menos
    expect(coincideTexto(nombre, "teknologico")).toBe(true); // letra cambiada
    expect(coincideTexto("Loteria Nacional", "lotería")).toBe(true);
    // y al revés: el DATO mal escrito también se encuentra
    expect(coincideTexto("Insituto Duartiano", "instituto")).toBe(true);
  });

  it("varias palabras: todas deben aparecer, en cualquier orden", () => {
    expect(coincideTexto(nombre, "americas instituto")).toBe(true);
    expect(coincideTexto(nombre, "instituto salud")).toBe(false);
  });

  it("no alucina con palabras cortas o muy distintas", () => {
    expect(coincideTexto(nombre, "xyz")).toBe(false);
    expect(coincideTexto("MICM", "mopc")).toBe(false);
    expect(coincideTexto(nombre, "")).toBe(true); // vacío = todo pasa
  });
});
