import { describe, expect, it } from "vitest";
import { elegirCoincidencia, extraerRnc, type DatosRnc } from "./rnc";

function candidato(nombre: string, rnc = "401-00755-1", nombreComercial = ""): DatosRnc {
  return { rnc, nombre, nombreComercial, estado: "ACTIVO" };
}

describe("extraerRnc", () => {
  it("reconoce un RNC de 9 dígitos, con o sin guiones", () => {
    expect(extraerRnc("401007551")).toBe("401007551");
    expect(extraerRnc("401-00755-1")).toBe("401007551");
    expect(extraerRnc(" 401.00755.1 ")).toBe("401007551");
  });

  it("reconoce una cédula de 11 dígitos", () => {
    expect(extraerRnc("001-1234567-8")).toBe("00112345678");
  });

  it("rechaza nombres, vacíos y largos que no son documento", () => {
    expect(extraerRnc("Banco Central")).toBeNull();
    expect(extraerRnc("")).toBeNull();
    expect(extraerRnc("12345")).toBeNull(); // ni RNC ni cédula
    // un nombre con números no se confunde con un RNC
    expect(extraerRnc("Distrito Escolar 15")).toBeNull();
  });
});

describe("elegirCoincidencia", () => {
  it("prefiere la coincidencia exacta aunque haya varios candidatos", () => {
    const lista = [
      candidato("MINISTERIO DE TURISMO DE ULTRAMAR", "400-11111-1"),
      candidato("MINISTERIO DE TURISMO", "401-03681-9"),
    ];
    expect(elegirCoincidencia("Ministerio de Turismo", lista)?.rnc).toBe("401-03681-9");
  });

  it("empareja sin acentos ni mayúsculas y por nombre comercial", () => {
    const lista = [candidato("LOTERIA NACIONAL")];
    expect(elegirCoincidencia("Lotería Nacional", lista)).not.toBeNull();
    const comercial = [candidato("RAZON SOCIAL X SRL", "1-31-99603-5", "MEGAPLUS")];
    expect(elegirCoincidencia("Megaplus", comercial)?.rnc).toBe("1-31-99603-5");
  });

  it("acepta un único candidato aunque no sea exacto", () => {
    const lista = [candidato("BANCO CENTRAL DE LA REPUBLICA DOMINICANA")];
    expect(elegirCoincidencia("Banco Central", lista)).not.toBeNull();
  });

  it("con varios candidatos ambiguos no elige ninguno", () => {
    const lista = [candidato("ALCALDIA DE SANTIAGO"), candidato("ALCALDIA DE SANTO DOMINGO")];
    expect(elegirCoincidencia("Alcaldía", lista)).toBeNull();
  });
});
