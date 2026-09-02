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

  // El Excel NO viaja en la petición: el navegador lo sube directo al
  // almacenamiento y aquí solo llega su ruta.
  //
  // Por qué: Vercel rechaza cualquier cuerpo mayor de 4,5 MB ANTES de
  // ejecutar esta función, así que un Excel de 6 MB fallaba sin que este
  // código llegara a correr — y como el rechazo no lo genera la app, su
  // respuesta no era JSON y el usuario veía «inténtalo de nuevo» sin más.
  // Yendo directo al almacenamiento, el tope pasa a ser el del bucket
  // (50 MB) y los 30 MB que promete la app son alcanzables de verdad.
  const cuerpo = (await req.json().catch(() => null)) as {
    ruta?: string;
    nombre?: string;
    suplidor_id?: string;
  } | null;
  const ruta = cuerpo?.ruta ?? "";
  const nombre = cuerpo?.nombre ?? "";
  const suplidorId = cuerpo?.suplidor_id ?? "";

  if (!ruta || !/\.(xlsx|xls|xlsm)$/i.test(nombre)) {
    return NextResponse.json(
      { error: "Sube la lista de precios en Excel (.xlsx)." },
      { status: 400 },
    );
  }
  if (!suplidorId) {
    return NextResponse.json({ error: "Elige el suplidor de la lista." }, { status: 400 });
  }
  // La ruta debe estar bajo la carpeta de ESTA organización. La RLS del
  // bucket ya lo impone, pero comprobarlo aquí evita siquiera intentarlo.
  if (!ruta.startsWith(`${miembro.org_id}/`)) {
    return NextResponse.json({ error: "Archivo no válido." }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: descarga, error: errDescarga } = await supabase.storage
    .from("documentos")
    .download(ruta);
  if (errDescarga || !descarga) {
    return NextResponse.json(
      { error: "No se pudo leer el archivo subido. Inténtalo de nuevo." },
      { status: 400 },
    );
  }
  if (descarga.size > 30 * 1024 * 1024) {
    return NextResponse.json({ error: "El Excel supera 30 MB." }, { status: 400 });
  }
  const archivo = { name: nombre, arrayBuffer: () => descarga.arrayBuffer() };

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

  // El Excel ya se volcó a la base: el archivo temporal no aporta nada y
  // sí engordaría el almacenamiento para siempre. Se borra aquí, y si falla
  // no se rompe la importación (ya está hecha) — solo queda anotado.
  const { error: errBorrado } = await supabase.storage.from("documentos").remove([ruta]);
  if (errBorrado) {
    console.error("importar: no se pudo borrar el temporal", ruta, errBorrado.message);
  }

  return NextResponse.json({
    lista_id: lista.id,
    suplidor: suplidor.nombre,
    filas: parseo.rows.length,
    vigencia: parseo.effectiveDate,
    hojas: parseo.sheetsUsed,
  });
}
