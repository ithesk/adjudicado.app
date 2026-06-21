-- ============================================================
--  Storage: buckets + policies por organización
--  Correr DESPUÉS de supabase_schema.sql (necesita es_miembro()).
--  Ruta de archivos: {org_id}/{...}/archivo  → el primer folder es el org_id.
-- ============================================================

-- Buckets privados
insert into storage.buckets (id, name, public)
  values ('ordenes-oc', 'ordenes-oc', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('documentos', 'documentos', false)
  on conflict (id) do nothing;

-- Acceso solo a miembros de la org dueña del archivo (folder raíz = org_id).
create policy "ordenes_oc_miembros" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'ordenes-oc'
    and es_miembro(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'ordenes-oc'
    and es_miembro(((storage.foldername(name))[1])::uuid)
  );

create policy "documentos_miembros" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'documentos'
    and es_miembro(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'documentos'
    and es_miembro(((storage.foldername(name))[1])::uuid)
  );
