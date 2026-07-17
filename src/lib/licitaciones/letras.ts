// Monto en letras para la Oferta Económica (la DGCP lo exige):
// 329,376.00 → "TRESCIENTOS VEINTINUEVE MIL TRESCIENTOS SETENTA Y SEIS PESOS
// DOMINICANOS CON 00/100". Implementación propia y determinista: es la ruta
// crítica de un documento legal, no el lugar para una dependencia sin
// mantenimiento. Módulo puro.

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO",
  "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS",
  "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS",
  "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE",
  "VEINTIOCHO", "VEINTINUEVE",
];

const DECENAS = [
  "", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA",
  "OCHENTA", "NOVENTA",
];

const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

// `apocopar`: "UNO" → "UN" y "VEINTIUNO" → "VEINTIÚN" cuando precede a un
// sustantivo (MIL, MILLÓN): "VEINTIÚN MIL", "TREINTA Y UN MILLONES".
function hastaNoventaYNueve(n: number, apocopar: boolean): string {
  if (n < 30) {
    if (apocopar && n === 1) return "UN";
    if (apocopar && n === 21) return "VEINTIÚN";
    return UNIDADES[n];
  }
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return DECENAS[d];
  const unidad = apocopar && u === 1 ? "UN" : UNIDADES[u];
  return `${DECENAS[d]} Y ${unidad}`;
}

function hastaNovecientos(n: number, apocopar: boolean): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const centena = CENTENAS[c];
  if (resto === 0) return centena;
  return `${centena} ${hastaNoventaYNueve(resto, apocopar)}`.trim();
}

export function enteroALetras(n: number, apocopar = false): string {
  if (!Number.isFinite(n) || n < 0) return "";
  n = Math.floor(n);
  if (n === 0) return "CERO";
  if (n >= 1_000_000_000_000) return String(n); // fuera de rango razonable

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1_000);
  const resto = n % 1_000;

  const partes: string[] = [];
  if (millones > 0) {
    partes.push(
      millones === 1
        ? "UN MILLÓN"
        : `${enteroALetras(millones, true)} MILLONES`,
    );
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${hastaNovecientos2(miles)} MIL`);
  }
  if (resto > 0) partes.push(hastaNovecientos(resto, apocopar));
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

// Los miles siempre apocopan ("VEINTIÚN MIL", nunca "VEINTIUNO MIL").
function hastaNovecientos2(n: number): string {
  return hastaNovecientos(n, true);
}

// El monto de la oferta: parte entera en letras + centavos en fracción.
export function montoALetras(monto: number, moneda = "PESOS DOMINICANOS"): string {
  if (!Number.isFinite(monto) || monto < 0) return "";
  // Redondear el monto COMPLETO primero: 10.999 es 11.00, no "10 con 100/100".
  const total = Math.round(monto * 100);
  const entero = Math.floor(total / 100);
  const centavos = total % 100;
  // Ante la moneda se apocopa: "UN PESO", "VEINTIÚN PESOS", "TREINTA Y UN…".
  const letras = enteroALetras(entero, true);
  const singular = entero === 1 && moneda === "PESOS DOMINICANOS";
  const nombreMoneda = singular ? "PESO DOMINICANO" : moneda;
  return `${letras} ${nombreMoneda} CON ${String(centavos).padStart(2, "0")}/100`;
}
