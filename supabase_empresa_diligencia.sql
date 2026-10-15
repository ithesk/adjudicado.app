-- ============================================================
--  DEBIDA DILIGENCIA DE LA EMPRESA — los datos que piden los
--  formularios de «conozca a su proveedor» (TSS ADM-FO-031, DGCP
--  SNCCP-PROV-F-040, beneficiarios finales…) y que hoy se
--  escriben a mano en cada proceso.
--
--  Viven en el perfil de la empresa (Configuración → Empresa):
--  se cargan UNA vez y salen en cada formulario. Cada organización
--  tiene los suyos (la app es multiempresa).
--
--  personas: una lista con roles, porque la misma persona suele ser
--  accionista, beneficiario final y directivo a la vez:
--    [{ nombre, documento, nacionalidad, cargo, formacion,
--       porcentaje, roles: ["accionista","beneficiario_final",
--       "directivo","tecnico"] }]
--  empresas_relacionadas: [{ empresa, pais, rnc, servicio }]
--  La experiencia (procesos ganados) NO se guarda aquí: sale de
--  lic_resultado.
--
--  Re-ejecutable. Correr en Supabase → SQL Editor, después de
--  supabase_licitaciones.sql.
-- ============================================================

alter table empresa_perfil add column if not exists registro_mercantil       text;
alter table empresa_perfil add column if not exists fecha_constitucion       date;
alter table empresa_perfil add column if not exists financiamiento_principal text;
alter table empresa_perfil add column if not exists financiamiento_secundario text;
-- Declaración sobre personas políticamente expuestas: "No" o el detalle.
alter table empresa_perfil add column if not exists relacion_pep             text;
alter table empresa_perfil add column if not exists personas                 jsonb not null default '[]'::jsonb;
alter table empresa_perfil add column if not exists empresas_relacionadas    jsonb not null default '[]'::jsonb;
