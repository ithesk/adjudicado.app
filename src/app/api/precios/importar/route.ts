import { NextResponse } from "next/server";
import { getMiembro } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { parseWorkbook } from "@/lib/precios/parser";

export const runtime = "nodejs";
export const maxDuration = 120;

// Filas por request al insertar productos (las listas traen decenas de miles).
const LOTE = 2000;

export async function POST(req: Request) {
  if (isDemo()) {
    return NextResponse.json(
      { error: "La importación está deshabilitada en modo demo." },
      { status: 403 },
    );
  }
  const miembro = await getMiembro();
  if (!miembro) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const form = await req.formData();
  const archivo = form.get("archivo");
  const suplidorId = String(form.get("suplidor_id") ?? "");
  if (!(archivo instanceof File) || !/\.(xlsx|xls|xlsm)$/i.test(archivo.name)) {
    return NextResponse.json(
      { error: "Sube la lista de precios en Excel (.xlsx)." },
      { status: 400 },
    );
  }
  if (archivo.size > 30 * 1024 * 1024) {
    return NextResponse.json({ error: "El Excel supera 30 MB." }, { status: 400 });
  }
  if (!suplidorId) {
    return NextResponse.json({ error: "Elige el suplidor de la lista." }, { status: 400 });
  }

  const supabase = await createClient();

  // El suplidor debe existir en el catálogo de la organización.
  const { data: suplidor } = await supabase
    .from("suplidor")
    .select("id, nombre")
    .eq("id", suplidorId)
    .eq("org_id", miembro.org_id)
    .single();
  if (!suplidor) {
    return NextResponse.json({ error: "Suplidor no encontrado." }, { status: 404 });
  }

  let parseo;
  try {
    parseo = parseWorkbook(Buffer.from(await archivo.arrayBuffer()));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: "No se pudo leer el Excel: " + msg },
      { status: 400 },
    );
  }
  if (parseo.rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No se encontraron productos. Verifica que el Excel tenga columnas de SKU, descripción y precio.",
      },
      { status: 400 },
    );
  }

  // La lista nace inactiva; se activa al final (precios_activar_lista) para
  // que una importación a medias nunca reemplace la lista vigente.
  const { data: lista, error: listaErr } = await supabase
    .from("lista_precio")
    .insert({
      org_id: miembro.org_id,
      suplidor_id: suplidorId,
      filename: archivo.name,
      vigencia: parseo.effectiveDate,
      row_count: parseo.rows.length,
      is_active: false,
    })
    .select("id")
    .single();
  if (listaErr || !lista) {
    return NextResponse.json(
      { error: "No se pudo crear la lista: " + (listaErr?.message ?? "") },
      { status: 500 },
    );
  }

  for (let i = 0; i < parseo.rows.length; i += LOTE) {
    const filas = parseo.rows.slice(i, i + LOTE).map((r) => ({
      org_id: miembro.org_id,
      lista_id: lista.id,
      suplidor_id: suplidorId,
      sku: r.sku,
      descripcion: r.descripcion,
      descripcion2: r.descripcion2,
      familia: r.familia,
      categoria: r.categoria,
      precio: r.precio,
      term_meses: r.term_meses,
    }));
    const { error: insErr } = await supabase.from("producto_precio").insert(filas);
    if (insErr) {
      // Limpia la lista incompleta (cascade borra sus productos).
      await supabase.from("lista_precio").delete().eq("id", lista.id);
      return NextResponse.json(
        { error: "Falló la carga de productos: " + insErr.message },
        { status: 500 },
      );
    }
  }

  const { error: actErr } = await supabase.rpc("precios_activar_lista", {
    p_org: miembro.org_id,
    p_lista: lista.id,
  });
  if (actErr) {
    await supabase.from("lista_precio").delete().eq("id", lista.id);
    return NextResponse.json(
      { error: "No se pudo activar la lista: " + actErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    lista_id: lista.id,
    suplidor: suplidor.nombre,
    filas: parseo.rows.length,
    vigencia: parseo.effectiveDate,
    hojas: parseo.sheetsUsed,
  });
}
