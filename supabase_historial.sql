-- ============================================================
--  HISTORIAL DE ESTADOS, META ANUAL Y PRESUPUESTO DE LA ENTIDAD
--  Correr DESPUÉS de supabase_schema.sql y supabase_licitaciones.sql.
--
--  orden_hist / lic_proceso_hist: cuándo entró cada orden (o proceso) en
--  cada estado. Hasta ahora «cobrado este mes» se leía de updated_at, que
--  cambia con cualquier edición: con el historial, la fecha de cobro, de
--  factura o de adjudicación es la de verdad, y de ahí salen «cuánto tarda
--  en pagar cada institución» y «cuánto lleva parada esta orden».
--
--  Lo escribe un TRIGGER, no la app: así queda registrado venga de donde
--  venga el cambio (la ficha, el tablero, el MCP, un cron).
-- ============================================================

create table if not exists orden_hist (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizacion(id) on delete cascade,
  orden_id  uuid not null references orden(id) on delete cascade,
  estado    text not null,
  desde     timestamptz not null default now(),
  por       uuid references auth.users(id)
);
create index if not exists idx_orden_hist_orden on orden_hist(orden_id, desde);
create index if not exists idx_orden_hist_org   on orden_hist(org_id, desde);
alter table orden_hist enable row level security;
drop policy if exists orden_hist_all on orden_hist;
create policy orden_hist_all on orden_hist for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

create or replace function registrar_estado_orden()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into orden_hist (org_id, orden_id, estado, desde, por)
      values (new.org_id, new.id, new.estado, coalesce(new.created_at, now()), auth.uid());
  elsif new.estado is distinct from old.estado then
    insert into orden_hist (org_id, orden_id, estado, desde, por)
      values (new.org_id, new.id, new.estado, now(), auth.uid());
  end if;
  return new;
end; $$;
drop trigger if exists trg_orden_hist on orden;
create trigger trg_orden_hist after insert or update of estado on orden
  for each row execute function registrar_estado_orden();

create table if not exists lic_proceso_hist (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizacion(id) on delete cascade,
  proceso_id  uuid not null references lic_proceso(id) on delete cascade,
  estado      text not null,
  desde       timestamptz not null default now(),
  por         uuid references auth.users(id)
);
create index if not exists idx_lic_proceso_hist_proceso on lic_proceso_hist(proceso_id, desde);
alter table lic_proceso_hist enable row level security;
drop policy if exists lic_proceso_hist_all on lic_proceso_hist;
create policy lic_proceso_hist_all on lic_proceso_hist for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

create or replace function registrar_estado_proceso()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into lic_proceso_hist (org_id, proceso_id, estado, desde, por)
      values (new.org_id, new.id, new.estado, coalesce(new.created_at, now()), auth.uid());
  elsif new.estado is distinct from old.estado then
    insert into lic_proceso_hist (org_id, proceso_id, estado, desde, por)
      values (new.org_id, new.id, new.estado, now(), auth.uid());
  end if;
  return new;
end; $$;
drop trigger if exists trg_lic_proceso_hist on lic_proceso;
create trigger trg_lic_proceso_hist after insert or update of estado on lic_proceso
  for each row execute function registrar_estado_proceso();

-- Relleno inicial: lo que ya existe entra con la mejor fecha conocida (el
-- último cambio). Es la misma aproximación que usaba la app hasta hoy; a
-- partir de aquí, cada cambio queda con su fecha real.
insert into orden_hist (org_id, orden_id, estado, desde)
  select o.org_id, o.id, o.estado, o.updated_at
  from orden o
  where not exists (select 1 from orden_hist h where h.orden_id = o.id);

insert into lic_proceso_hist (org_id, proceso_id, estado, desde)
  select p.org_id, p.id, p.estado, p.updated_at
  from lic_proceso p
  where not exists (select 1 from lic_proceso_hist h where h.proceso_id = p.id);

-- Meta anual de ventas (RD$ de órdenes recibidas en el año): el panel
-- «Dónde está el dinero» muestra el % alcanzado.
alter table empresa_perfil add column if not exists meta_anual numeric(16,2);

-- Presupuesto de la entidad (monto estimado de la DGCP): la referencia de
-- cuánto vale el proceso mientras no se cotiza. Lo llena el importador del
-- MCP y se puede teclear en la Bid Room.
alter table lic_proceso add column if not exists monto_estimado numeric(16,2);
