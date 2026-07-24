import { describe, expect, it } from "vitest";
import { TurnoPorClave } from "./cola-acciones";

describe("TurnoPorClave", () => {
  it("la primera corre y deja la clave ocupada", () => {
    const t = new TurnoPorClave<string>();
    expect(t.pedir("perfil", "a", false)).toBe("correr");
    expect(t.ocupadas().has("perfil")).toBe(true);
  });

  it("descarta la segunda de un BOTÓN (anti doble-clic)", () => {
    const t = new TurnoPorClave<string>();
    t.pedir("crear", "clic-1", false);
    expect(t.pedir("crear", "clic-2", false)).toBe("descartada");
    expect(t.siguiente("crear")).toBeNull(); // el 2.º no corre nunca
  });

  // El bug que perdió los datos del perfil de la empresa: cada campo es una
  // llamada distinta y las que caían mientras corría la anterior se tiraban.
  it("encola los campos de un AUTOSAVE en orden y no pierde ninguno", () => {
    const t = new TurnoPorClave<string>();
    expect(t.pedir("perfil", "rnc", true)).toBe("correr");
    expect(t.pedir("perfil", "rpe", true)).toBe("encolada");
    expect(t.pedir("perfil", "direccion", true)).toBe("encolada");
    expect(t.pedir("perfil", "telefono", true)).toBe("encolada");

    expect(t.siguiente("perfil")).toBe("rpe");
    expect(t.siguiente("perfil")).toBe("direccion");
    expect(t.siguiente("perfil")).toBe("telefono");
    expect(t.siguiente("perfil")).toBeNull();
  });

  it("mientras drena la cola la clave sigue ocupada, y se libera al final", () => {
    const t = new TurnoPorClave<string>();
    t.pedir("perfil", "a", true);
    t.pedir("perfil", "b", true);

    t.siguiente("perfil");
    expect(t.ocupadas().has("perfil")).toBe(true); // corre "b"

    t.siguiente("perfil");
    expect(t.ocupadas().has("perfil")).toBe(false);
  });

  it("cada clave es independiente: una línea ocupada no frena a las demás", () => {
    const t = new TurnoPorClave<string>();
    expect(t.pedir("it-1", "cantidad", true)).toBe("correr");
    expect(t.pedir("it-2", "precio", true)).toBe("correr");
    expect(t.ocupadas()).toEqual(new Set(["it-1", "it-2"]));

    expect(t.siguiente("it-1")).toBeNull();
    expect(t.ocupadas()).toEqual(new Set(["it-2"]));
  });

  it("tras vaciarse, la clave vuelve a aceptar turno", () => {
    const t = new TurnoPorClave<string>();
    t.pedir("perfil", "a", true);
    t.siguiente("perfil");
    expect(t.pedir("perfil", "b", true)).toBe("correr");
  });

  it("`ocupadas` devuelve una copia: mutarla no toca el turnero", () => {
    const t = new TurnoPorClave<string>();
    t.pedir("perfil", "a", false);
    t.ocupadas().clear();
    expect(t.ocupadas().has("perfil")).toBe(true);
  });
});
