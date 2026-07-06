-- ============================================================
--  Precios de suplidores (herramienta "Precios")
--  Importa listas de precios en Excel y ofrece búsqueda
--  instantánea por SKU/descripción, precios por término de
--  contrato, historial entre listas y anotaciones del equipo.
--
--  Cuelga del catálogo `suplidor` existente. Multi-tenant con
--  RLS por organización (es_miembro), igual que el resto.
--
--  Correr en Supabase → SQL Editor, DESPUÉS de supabase_schema.sql.
-- ============================================================

-- ============================================================
--  1. LISTA DE PRECIOS  (cada Excel importado; la vigente tiene
--     is_active = true, las anteriores quedan como historial)
-- ============================================================
create table if not exists lista_precio (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizacion(id) on delete cascade,
  suplidor_id  uuid not null references suplidor(id) on delete cascade,
  filename     text,
  vigencia     date,                 -- "effective date" detectada en el Excel
  importada_at timestamptz not null default now(),
  row_count    int not null default 0,
  is_active    boolean not null default false
);
create index if not exists idx_lista_precio_org      on lista_precio(org_id);
create index if not exists idx_lista_precio_suplidor on lista_precio(suplidor_id, is_active);

-- ============================================================
--  2. PRODUCTO  (filas de la lista; bigint: son decenas de miles)
-- ============================================================

-- Normaliza texto para indexar/buscar: minúsculas y solo alfanumérico,
-- así "FG-100F" y "fg 100f" tokenizan igual en ambos lados.
create or replace function precios_normalizar(t text)
returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(t, ''), '[^a-zA-Z0-9]+', ' ', 'g'));
$$;

create table if not exists producto_precio (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references organizacion(id) on delete cascade,
  lista_id     uuid not null references lista_precio(id) on delete cascade,
  suplidor_id  uuid not null references suplidor(id) on delete cascade,
  sku          text not null,
  descripcion  text,
  descripcion2 text,
  familia      text,
  categoria    text,
  precio       numeric(14,2),
  term_meses   int,
  busqueda     tsvector generated always as (
    to_tsvector('simple', precios_normalizar(
      sku || ' ' || coalesce(descripcion, '') || ' ' ||
      coalesce(descripcion2, '') || ' ' || coalesce(familia, '')))
  ) stored
);
create index if not exists idx_producto_precio_lista    on producto_precio(lista_id);
create index if not exists idx_producto_precio_sku      on producto_precio(org_id, suplidor_id, sku);
create index if not exists idx_producto_precio_busqueda on producto_precio using gin(busqueda);

-- ============================================================
--  3. ANOTACIONES DEL EQUIPO — ligadas a (suplidor, sku) para
--     sobrevivir las re-importaciones de listas.
-- ============================================================
create table if not exists producto_marca (
  org_id      uuid not null references organizacion(id) on delete cascade,
  suplidor_id uuid not null references suplidor(id) on delete cascade,
  sku         text not null,
  color       text not null,
  updated_at  timestamptz not null default now(),
  primary key (org_id, suplidor_id, sku),
  constraint marca_color_valido check (color in ('yellow','green','blue','red','purple'))
);

create table if not exists producto_comentario (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizacion(id) on delete cascade,
  suplidor_id uuid not null references suplidor(id) on delete cascade,
  sku         text not null,
  autor_id    uuid references auth.users(id),
  texto       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_producto_comentario
  on producto_comentario(org_id, suplidor_id, sku, created_at desc);

-- ============================================================
--  RLS
-- ============================================================
alter table lista_precio        enable row level security;
alter table producto_precio     enable row level security;
alter table producto_marca      enable row level security;
alter table producto_comentario enable row level security;

create policy lista_precio_all on lista_precio for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
create policy producto_precio_all on producto_precio for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
create policy producto_marca_all on producto_marca for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
create policy producto_comentario_all on producto_comentario for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

-- ============================================================
--  BÚSQUEDA — funciones RPC (security definer + guard es_miembro,
--  mismo patrón que buscar_global)
-- ============================================================

-- Texto libre → tsquery de prefijos: "FG-100F 3yr" → 'fg:* & 100f:* & 3yr:*'
create or replace function precios_tsquery(q text)
returns tsquery language sql immutable as $$
  select case when agg is null then null else to_tsquery('simple', agg) end
  from (
    select string_agg(tok || ':*', ' & ') as agg
    from unnest(regexp_split_to_array(trim(precios_normalizar(q)), '\s+')) as tok
    where tok <> ''
  ) t;
$$;

-- Búsqueda principal sobre las listas vigentes, con filtros y orden.
-- p_term: null = todos, 'none' = sin término, '12'/'24'/... = meses.
-- p_orden: 'relevance' | 'price_asc' | 'price_desc'.
create or replace function precios_buscar(
  p_org uuid, p_q text,
  p_suplidor uuid default null,
  p_familia text default null,
  p_term text default null,
  p_orden text default 'relevance',
  p_limite int default 100
) returns table (
  id bigint, sku text, descripcion text, descripcion2 text,
  familia text, categoria text, precio numeric, term_meses int,
  suplidor_id uuid, suplidor_nombre text, lista_id uuid, vigencia date,
  marca_color text, comentarios bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  tsq tsquery := precios_tsquery(p_q);
begin
  if not es_miembro(p_org) or tsq is null then return; end if;
  return query
  select p.id, p.sku, p.descripcion, p.descripcion2,
         p.familia, p.categoria, p.precio, p.term_meses,
         p.suplidor_id, s.nombre, p.lista_id, l.vigencia,
         m.color,
         (select count(*) from producto_comentario c
           where c.org_id = p_org and c.suplidor_id = p.suplidor_id and c.sku = p.sku)
  from producto_precio p
  join lista_precio l on l.id = p.lista_id and l.is_active
  join suplidor s on s.id = p.suplidor_id
  left join producto_marca m
    on m.org_id = p_org and m.suplidor_id = p.suplidor_id and m.sku = p.sku
  where p.org_id = p_org
    and p.busqueda @@ tsq
    and (p_suplidor is null or p.suplidor_id = p_suplidor)
    and (p_familia is null or p.familia = p_familia)
    and (p_term is null
         or (p_term = 'none' and p.term_meses is null)
         or (p_term <> 'none' and p.term_meses = p_term::int))
  order by
    (case when p_orden = 'price_asc'  then p.precio end) asc  nulls last,
    (case when p_orden = 'price_desc' then p.precio end) desc nulls last,
    (case when p_orden not in ('price_asc','price_desc')
          then (upper(p.sku) like upper(trim(p_q)) || '%')::int end) desc nulls last,
    (case when p_orden not in ('price_asc','price_desc')
          then ts_rank(p.busqueda, tsq) end) desc nulls last,
    p.sku
  limit least(greatest(p_limite, 1), 300);
end $$;

-- Facetas sobre TODO el conjunto que coincide (no solo la página devuelta).
-- Cada dimensión se calcula con los demás filtros aplicados pero no el suyo,
-- para que los conteos sigan siendo clickeables (faceted search clásico).
create or replace function precios_facetas(
  p_org uuid, p_q text,
  p_suplidor uuid default null,
  p_familia text default null,
  p_term text default null
) returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  tsq tsquery := precios_tsquery(p_q);
  resultado jsonb;
begin
  if not es_miembro(p_org) or tsq is null then return null; end if;
  with m as (
    select p.suplidor_id, s.nombre, p.familia, p.term_meses, p.precio
    from producto_precio p
    join lista_precio l on l.id = p.lista_id and l.is_active
    join suplidor s on s.id = p.suplidor_id
    where p.org_id = p_org and p.busqueda @@ tsq
  ),
  filtrado as (
    select * from m
    where (p_suplidor is null or suplidor_id = p_suplidor)
      and (p_familia is null or familia = p_familia)
      and (p_term is null
           or (p_term = 'none' and term_meses is null)
           or (p_term <> 'none' and term_meses = p_term::int))
  )
  select jsonb_build_object(
    'total',      (select count(*) from filtrado),
    'min_precio', (select min(precio) from filtrado),
    'max_precio', (select max(precio) from filtrado),
    'familias', coalesce((
      select jsonb_agg(jsonb_build_object('value', familia, 'count', n) order by n desc)
      from (
        select familia, count(*) as n from m
        where familia is not null and familia <> ''
          and (p_suplidor is null or suplidor_id = p_suplidor)
          and (p_term is null
               or (p_term = 'none' and term_meses is null)
               or (p_term <> 'none' and term_meses = p_term::int))
        group by familia order by n desc limit 12
      ) f), '[]'::jsonb),
    'suplidores', coalesce((
      select jsonb_agg(jsonb_build_object('id', suplidor_id, 'nombre', nombre, 'count', n) order by n desc)
      from (
        select suplidor_id, nombre, count(*) as n from m
        where (p_familia is null or familia = p_familia)
          and (p_term is null
               or (p_term = 'none' and term_meses is null)
               or (p_term <> 'none' and term_meses = p_term::int))
        group by suplidor_id, nombre
      ) s), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object('value', v, 'count', n)
                       order by (v = 'none') desc, nullif(v, 'none')::int)
      from (
        select coalesce(term_meses::text, 'none') as v, count(*) as n from m
        where (p_suplidor is null or suplidor_id = p_suplidor)
          and (p_familia is null or familia = p_familia)
        group by term_meses
      ) t), '[]'::jsonb)
  ) into resultado;
  return resultado;
end $$;

-- Detalle de un producto: variantes por término del mismo SKU base en la
-- lista vigente, historial de precios entre listas, marca y comentarios.
create or replace function precios_detalle(
  p_org uuid, p_suplidor uuid, p_sku text
) returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  base_sku text := regexp_replace(p_sku, '-(12|24|36|48|60)$', '');
begin
  if not es_miembro(p_org) then return null; end if;
  return jsonb_build_object(
    'base_sku', base_sku,
    'variantes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'sku', p.sku, 'descripcion', p.descripcion,
        'descripcion2', p.descripcion2, 'familia', p.familia,
        'categoria', p.categoria, 'precio', p.precio,
        'term_meses', p.term_meses, 'suplidor_id', p.suplidor_id,
        'suplidor_nombre', s.nombre, 'lista_id', p.lista_id, 'vigencia', l.vigencia
      ) order by p.term_meses nulls first, p.sku)
      from producto_precio p
      join lista_precio l on l.id = p.lista_id and l.is_active
      join suplidor s on s.id = p.suplidor_id
      where p.org_id = p_org and p.suplidor_id = p_suplidor
        and (p.sku = p_sku or p.sku like base_sku || '-%')
    ), '[]'::jsonb),
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku', p.sku, 'precio', p.precio, 'vigencia', l.vigencia,
        'importada_at', l.importada_at, 'filename', l.filename,
        'is_active', l.is_active
      ) order by l.importada_at desc)
      from producto_precio p
      join lista_precio l on l.id = p.lista_id
      where p.org_id = p_org and p.suplidor_id = p_suplidor and p.sku = p_sku
    ), '[]'::jsonb),
    'marca', (
      select m.color from producto_marca m
      where m.org_id = p_org and m.suplidor_id = p_suplidor and m.sku = p_sku
    ),
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'autor_id', c.autor_id,
        'autor', (select mb.nombre from miembro mb
                  where mb.org_id = p_org and mb.user_id = c.autor_id),
        'texto', c.texto, 'created_at', c.created_at
      ) order by c.created_at desc)
      from producto_comentario c
      where c.org_id = p_org and c.suplidor_id = p_suplidor and c.sku = p_sku
    ), '[]'::jsonb)
  );
end $$;

-- Resumen para la página: totales + lista vigente por suplidor.
create or replace function precios_resumen(p_org uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not es_miembro(p_org) then return null; end if;
  return jsonb_build_object(
    'productos', (
      select count(*) from producto_precio p
      join lista_precio l on l.id = p.lista_id and l.is_active
      where p.org_id = p_org),
    'suplidores', (
      select count(distinct suplidor_id) from lista_precio
      where org_id = p_org and is_active),
    'listas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'suplidor_id', l.suplidor_id, 'suplidor', s.nombre,
        'filename', l.filename, 'vigencia', l.vigencia,
        'importada_at', l.importada_at, 'row_count', l.row_count
      ) order by s.nombre)
      from lista_precio l join suplidor s on s.id = l.suplidor_id
      where l.org_id = p_org and l.is_active
    ), '[]'::jsonb)
  );
end $$;

-- Activa una lista recién importada y desactiva las anteriores del mismo
-- suplidor, en una sola transacción (la importación inserta con is_active
-- = false y llama esto al final, así nunca queda un estado a medias).
create or replace function precios_activar_lista(p_org uuid, p_lista uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_miembro(p_org) then raise exception 'no autorizado'; end if;
  update lista_precio set is_active = false
   where org_id = p_org and id <> p_lista
     and suplidor_id = (select suplidor_id from lista_precio
                        where id = p_lista and org_id = p_org);
  update lista_precio
     set is_active = true,
         row_count = (select count(*) from producto_precio where lista_id = p_lista)
   where id = p_lista and org_id = p_org;
end $$;

-- Solo usuarios autenticados pueden ejecutar las funciones.
revoke execute on function precios_buscar(uuid,text,uuid,text,text,text,int) from public, anon;
revoke execute on function precios_facetas(uuid,text,uuid,text,text) from public, anon;
revoke execute on function precios_detalle(uuid,uuid,text) from public, anon;
revoke execute on function precios_resumen(uuid) from public, anon;
revoke execute on function precios_activar_lista(uuid,uuid) from public, anon;
grant execute on function precios_buscar(uuid,text,uuid,text,text,text,int) to authenticated;
grant execute on function precios_facetas(uuid,text,uuid,text,text) to authenticated;
grant execute on function precios_detalle(uuid,uuid,text) to authenticated;
grant execute on function precios_resumen(uuid) to authenticated;
grant execute on function precios_activar_lista(uuid,uuid) to authenticated;
