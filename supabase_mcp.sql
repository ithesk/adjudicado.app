-- ============================================================
--  CONECTOR MCP — Claude habla con adjudicado.app
--
--  Cada organización crea en Configuración → Integraciones una o
--  más URLs de conector (/api/mcp/<token>) y las pega en claude.ai
--  como «conector personalizado». El token ES la credencial: da
--  acceso a los datos de licitaciones de ESA organización.
--
--  Solo se guarda el SHA-256 del token: el token en claro se ve
--  UNA vez al crearlo. Revocar = poner revocado_at (no se borra,
--  queda el rastro de uso).
--
--  El endpoint resuelve el token con service_role (no hay sesión
--  de usuario) y filtra TODO por el org_id que devuelve; la RLS de
--  aquí solo gobierna la pantalla de administración.
--
--  Re-ejecutable. Correr en Supabase → SQL Editor, después de
--  supabase_licitaciones.sql (usa es_admin).
-- ============================================================

create table if not exists mcp_token (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizacion(id) on delete cascade,
  nombre       text not null,                 -- "Claude de Pablo"
  token_hash   text not null unique,          -- sha256 hex del token
  prefijo      text not null,                 -- primeros caracteres, para reconocerlo
  creado_por   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  ultimo_uso   timestamptz,
  revocado_at  timestamptz
);
create index if not exists idx_mcp_token_org on mcp_token(org_id);

alter table mcp_token enable row level security;
-- Ver y gestionar conectores es cosa de admins: el token abre los datos.
drop policy if exists mcp_token_admin on mcp_token;
create policy mcp_token_admin on mcp_token for all
  using (es_admin(org_id)) with check (es_admin(org_id));
