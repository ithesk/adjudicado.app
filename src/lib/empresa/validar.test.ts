import { describe, expect, it } from "vitest";
import { alertasPerfil, camposEnBlanco, cedulaValida, normalizarRpe, rncValido, rpeValido } from "./validar";

describe("RPE", () => {
  it("acepta el número y rechaza «sn» y otros textos", () => {
    expect(rpeValido("116764")).toBe(true);
    expect(rpeValido(" 116764 ")).toBe(true);
    expect(rpeValido("sn")).toBe(false);
    expect(rpeValido("S/N")).toBe(false);
    expect(rpeValido("")).toBe(false);
    expect(rpeValido(null)).toBe(false);
  });

  it("normaliza «RPE 116764» y ceros a la izquierda", () => {
    expect(normalizarRpe("RPE 116764")).toBe("116764");
    expect(normalizarRpe("rpe: 0116764")).toBe("116764");
    expect(normalizarRpe("sn")).toBe("sn");
  });
});

describe("RNC y cédula", () => {
  it("RNC de 9 dígitos o cédula de 11, con o sin guiones", () => {
    expect(rncValido("130939616")).toBe(true);
    expect(rncValido("1-30-93961-6")).toBe(true);
    expect(rncValido("001-1234567-8")).toBe(true);
    expect(rncValido("13093")).toBe(false);
    expect(cedulaValida("001-1234567-8")).toBe(true);
    expect(cedulaValida("")).toBe(false);
  });
});

describe("alertasPerfil", () => {
  const completo = {
    nombre_legal: "INNOVACION TECNOLOGICA SK SRL",
    rnc: "130939616",
    rpe: "116764",
    direccion: "Av. Las Palmas 33",
    telefono: "809-974-2666",
    email: "info@ejemplo.do",
  };
  const gg = [{ rol: "gerente_general", nombre: "Pablo Holguín", cedula: "00112345678" }];

  it("un perfil completo no da alertas", () => {
    expect(alertasPerfil(completo, gg)).toEqual([]);
  });

  it("avisa del RPE «sn» diciendo dónde se arregla", () => {
    const a = alertasPerfil({ ...completo, rpe: "sn" }, gg);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(/RPE es «sn».*F\.042.*Configuración → Empresa/);
  });

  it("avisa de la cédula del Gerente General que falta", () => {
    expect(alertasPerfil(completo, [{ rol: "gerente_general", nombre: "Pablo", cedula: null }])[0]).toMatch(/cédula/);
  });
});

describe("camposEnBlanco", () => {
  it("cuenta líneas de guiones bajos y celdas vacías", () => {
    const html =
      "<p>Domicilio: ________________</p><table><tr><td>Pablo</td><td>&nbsp;</td><td> </td><td></td></tr></table><p>Cédula ____</p>";
    expect(camposEnBlanco(html)).toBe(5);
  });

  it("un documento completo no tiene huecos", () => {
    expect(camposEnBlanco("<p>Todo completo</p><table><tr><td>A</td><td>B</td></tr></table>")).toBe(0);
  });
});
