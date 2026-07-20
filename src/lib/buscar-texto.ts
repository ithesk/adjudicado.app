// Igualador de búsqueda TOLERANTE, compartido por todos los buscadores de la
// app. La lógica de un buscador es que el usuario NO sabe cómo se escribió el
// dato: "instituto" debe encontrar "Instituto", "INSTITUTO", "Instítuto" y
// hasta "Insituto" (falta ortográfica leve). Puro — sin dependencias.

// Minúsculas, sin acentos, espacios colapsados.
export function plegarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ¿Distancia de edición (Levenshtein) ≤ k? Con banda y corte temprano —
// las palabras son cortas y esto corre sobre listas en memoria.
function distanciaMax(a: string, b: string, k: number): boolean {
  if (Math.abs(a.length - b.length) > k) return false;
  let fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nueva = [i];
    let minimo = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(nueva[j - 1] + 1, fila[j] + 1, fila[j - 1] + costo);
      nueva.push(v);
      if (v < minimo) minimo = v;
    }
    if (minimo > k) return false; // toda la fila ya se pasó del tope
    fila = nueva;
  }
  return fila[b.length] <= k;
}

// Cuántas letras de error se perdonan según el largo de lo buscado.
function tolerancia(largo: number): number {
  if (largo >= 9) return 2;
  if (largo >= 5) return 1;
  return 0;
}

// ¿`texto` satisface la `consulta`? Cada palabra de la consulta debe
// aparecer: literal (subcadena, cubre prefijos mientras se teclea) o como
// palabra parecida (falta ortográfica dentro de la tolerancia).
export function coincideTexto(texto: string, consulta: string): boolean {
  const q = plegarTexto(consulta);
  if (!q) return true;
  const plano = plegarTexto(texto);
  const palabrasTexto = plano.split(" ");
  return q.split(" ").every((token) => {
    if (plano.includes(token)) return true;
    const k = tolerancia(token.length);
    if (k === 0) return false;
    return palabrasTexto.some(
      (palabra) =>
        distanciaMax(token, palabra, k) ||
        // token tecleado a medias con un error: compara contra el prefijo
        (palabra.length > token.length &&
          distanciaMax(token, palabra.slice(0, token.length), k)),
    );
  });
}
