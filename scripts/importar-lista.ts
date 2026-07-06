// Importa una lista de precios en Excel directo a Supabase con la service
// role (sin pasar por la app). Útil para cargas iniciales o por lotes; el
// flujo normal del equipo es /precios → "Importar lista".
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ORG_ID=... \
//     pnpm dlx tsx scripts/importar-lista.ts "Fortinet" ruta/lista.xlsx
//
// Crea el suplidor si no existe. La lista nueva queda vigente y las
// anteriores del mismo suplidor pasan al historial.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseWorkbook } from "../src/lib/precios/parser";

const LOTE = 2000;

async function main() {
  const [nombreSuplidor, ruta] = process.argv.slice(2);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const orgId = process.env.ORG_ID;
  if (!nombreSuplidor || !ruta || !url || !key || !orgId) {
    console.error(
      'Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ORG_ID=... pnpm dlx tsx scripts/importar-lista.ts "<suplidor>" <archivo.xlsx>',
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Suplidor del catálogo (se crea si no existe).
  const { data: existente } = await supabase
    .from("suplidor")
    .select("id, nombre")
    .eq("org_id", orgId)
    .ilike("nombre", nombreSuplidor)
    .maybeSingle();
  let suplidor = existente;
  if (!suplidor) {
    const { data: creado, error } = await supabase
      .from("suplidor")
      .insert({ org_id: orgId, nombre: nombreSuplidor, canal: "fabricante" })
      .select("id, nombre")
      .single();
    if (error || !creado) throw new Error("No se pudo crear el suplidor: " + error?.message);
    suplidor = creado;
    console.log(`Suplidor creado: ${suplidor.nombre}`);
  } else {
    console.log(`Suplidor existente: ${suplidor.nombre}`);
  }

  console.log(`Parseando ${ruta}…`);
  const parseo = parseWorkbook(readFileSync(ruta));
  if (parseo.rows.length === 0) throw new Error("El Excel no produjo productos.");
  console.log(
    `${parseo.rows.length} productos · vigencia ${parseo.effectiveDate ?? "—"} · hojas: ${parseo.sheetsUsed.join(", ")}`,
  );

  const { data: lista, error: listaErr } = await supabase
    .from("lista_precio")
    .insert({
      org_id: orgId,
      suplidor_id: suplidor.id,
      filename: basename(ruta),
      vigencia: parseo.effectiveDate,
      row_count: parseo.rows.length,
      is_active: false,
    })
    .select("id")
    .single();
  if (listaErr || !lista) throw new Error("No se pudo crear la lista: " + listaErr?.message);

  for (let i = 0; i < parseo.rows.length; i += LOTE) {
    const filas = parseo.rows.slice(i, i + LOTE).map((r) => ({
      org_id: orgId,
      lista_id: lista.id,
      suplidor_id: suplidor.id,
      sku: r.sku,
      descripcion: r.descripcion,
      descripcion2: r.descripcion2,
      familia: r.familia,
      categoria: r.categoria,
      precio: r.precio,
      term_meses: r.term_meses,
    }));
    const { error } = await supabase.from("producto_precio").insert(filas);
    if (error) {
      await supabase.from("lista_precio").delete().eq("id", lista.id);
      throw new Error(`Falló el lote ${i}-${i + filas.length}: ${error.message}`);
    }
    console.log(`  ${Math.min(i + LOTE, parseo.rows.length)}/${parseo.rows.length}`);
  }

  // Activación directa (la RPC precios_activar_lista exige sesión de
  // miembro; la service role hace los mismos dos updates saltando RLS).
  await supabase
    .from("lista_precio")
    .update({ is_active: false })
    .eq("org_id", orgId)
    .eq("suplidor_id", suplidor.id)
    .neq("id", lista.id);
  const { error: actErr } = await supabase
    .from("lista_precio")
    .update({ is_active: true })
    .eq("id", lista.id);
  if (actErr) throw new Error("No se pudo activar la lista: " + actErr.message);

  console.log(`Lista activada. Ya se puede buscar en /precios.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
