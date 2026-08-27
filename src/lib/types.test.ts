import { describe, it, expect } from "vitest";
import { componentesListos, componentesTotales, type Item } from "./types";

// Un ítem mínimo; solo importan el árbol y si está entregado.
function item(nombre: string, hijos: Item[] = [], entregado = false): Item {
  return {
    id: nombre,
    orden_id: "o1",
    nombre,
    tipo: "fisico",
    cantidad: 1,
    entregado,
    fecha_entrega: null,
    notas: null,
    orden_indice: 0,
    suplidor: null,
    canal: null,
    estado_item: entregado ? "recibido" : "pendiente",
    fecha_estim: null,
    precio: null,
    condiciones: null,
    ...(hijos.length ? { componentes: hijos } : {}),
  };
}

describe("componentesTotales", () => {
  // El caso REAL que pareció pérdida de datos: seis componentes colgados de
  // un «Nuevo componente» vacío. La fila plegada decía «1 comp.» y su dueño
  // los dio por perdidos, cuando estaban los siete guardados.
  it("cuenta TODA la rama, no solo los hijos directos", () => {
    const camara = item("Cámara", [
      item("Nuevo componente", [
        item("lente Sony"),
        item("lente Sigma"),
        item("flash Godox"),
        item("Cargador"),
        item("Batería"),
        item("Cuerpo + batería"),
      ]),
    ]);
    expect(camara.componentes).toHaveLength(1); // hijos directos: uno
    expect(componentesTotales(camara)).toBe(7); // de verdad hay siete
  });

  it("un ítem sin componentes cuenta cero", () => {
    expect(componentesTotales(item("suelto"))).toBe(0);
  });

  it("cuenta bien un árbol plano", () => {
    const padre = item("padre", [item("a"), item("b"), item("c")]);
    expect(componentesTotales(padre)).toBe(3);
  });

  it("baja por varios niveles", () => {
    const hondo = item("1", [item("2", [item("3", [item("4")])])]);
    expect(componentesTotales(hondo)).toBe(3);
  });
});

describe("componentesListos", () => {
  it("cuenta solo los hijos DIRECTOS entregados (es un progreso, no un censo)", () => {
    const padre = item("padre", [
      item("entregado", [], true),
      item("pendiente"),
    ]);
    expect(componentesListos(padre)).toBe(1);
  });

  it("un componente con hijos está listo solo si todos sus hijos llegaron", () => {
    const conTodo = item("padre", [
      item("grupo", [item("x", [], true), item("y", [], true)]),
    ]);
    expect(componentesListos(conTodo)).toBe(1);
    const aMedias = item("padre", [
      item("grupo", [item("x", [], true), item("y")]),
    ]);
    expect(componentesListos(aMedias)).toBe(0);
  });
});
