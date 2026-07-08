-- ============================================================
--  Migración SaaS — capa comercial sobre `organizacion`
--  Correr en Supabase → SQL Editor sobre un proyecto que YA tiene
--  `supabase_schema.sql`. Idempotente (se puede correr más de una vez).
--
--  Agrega a cada organización su plan, el estado de la cuenta y el
--  fin del período de prueba, para el registro self-service (landing
--  → /registro). El cobro real es una capa aparte (aún no incluida).
-- ============================================================

alter table organizacion
  add column if not exists plan          text not null default 'empresa',
  add column if not exists estado_cuenta text not null default 'prueba',
  add column if not exists trial_ends_at timestamptz;

-- Restricciones de valores válidos (se agregan solo si no existen).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plan_valido'
      and conrelid = 'organizacion'::regclass
  ) then
    alter table organizacion
      add constraint plan_valido check (plan in ('equipo','empresa','corporativo'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'estado_cuenta_valido'
      and conrelid = 'organizacion'::regclass
  ) then
    alter table organizacion
      add constraint estado_cuenta_valido check (
        estado_cuenta in ('prueba','activa','suspendida','cancelada'));
  end if;
end $$;

-- Las organizaciones ya existentes (uso interno previo) quedan como
-- cuentas activas del plan más alto, sin período de prueba.
update organizacion
   set plan = 'corporativo', estado_cuenta = 'activa'
 where estado_cuenta = 'prueba' and trial_ends_at is null;
