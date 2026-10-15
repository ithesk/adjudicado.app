// Contra el portal y la API reales. Solo a mano:
//   INTEGRACION=1 npx vitest run src/lib/dgcp/portal-busqueda.integracion.test.ts
//
// También es la prueba de vigilancia: si el portal cambia su HTML, aquí se ve
// antes que en una licitación perdida.
import { describe, expect, it } from "vitest";
import { listarAbiertos, localizarProceso } from "./fuentes";
import { abrirSesion, buscarAvisos, leerFicha } from "./portal-busqueda";

describe.skipIf(!process.env.INTEGRACION)("portal real", () => {
  it(
    "abre sesión, busca por fecha y lee una ficha",
    async () => {
      const s = await abrirSesion();
      expect(s.mkey).toMatch(/^[a-z0-9_]{30,}$/);
      const ayer = new Date(Date.now() - 86_400_000);
      const r = await buscarAvisos(s, { desde: ayer, hasta: new Date() }, 2);
      expect(r.avisos.length).toBeGreaterThan(0);
      const a = r.avisos[0];
      expect(a.codigo).toMatch(/-\d{4}-\d+$/);
      expect(a.uid).toMatch(/^DO1\.NTC\.\d+$/);
      expect(a.publicado).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      console.log(`portal: ${r.avisos.length} avisos en ${r.paginas} páginas; el más nuevo ${a.codigo} (${a.publicado})`);

      const f = await leerFicha(a.uid!);
      expect(f.codigo).toBe(a.codigo);
      expect(f.cronograma.length).toBeGreaterThan(0);
      console.log(`ficha: ${f.codigo} · ${f.articulos.length} artículos · ${f.documentos.length} documentos · cierre ${f.cierre}`);
    },
    120_000,
  );

  it(
    "lista lo abierto con las dos fuentes y dice su frescura",
    async () => {
      const r = await listarAbiertos();
      expect(r.procesos.length).toBeGreaterThan(100);
      expect(r.frescura.api.ok || r.frescura.portal.ok).toBe(true);
      console.log(JSON.stringify(r.frescura, null, 1));
    },
    180_000,
  );

  it(
    "localiza un proceso por código y por enlace del portal",
    async () => {
      const s = await abrirSesion();
      const { avisos } = await buscarAvisos(s, { desde: new Date(Date.now() - 86_400_000), hasta: new Date() }, 1);
      const a = avisos.find((x) => x.estado === "Published")!;
      const porUrl = await localizarProceso(`https://comunidad.comprasdominicana.gob.do//Public/Tendering/OpportunityDetail/Index?noticeUID=${a.uid}`);
      expect(porUrl.proceso.codigo_proceso).toBe(a.codigo);
      const porCodigo = await localizarProceso(a.codigo);
      expect(porCodigo.proceso.codigo_proceso).toBe(a.codigo);
      console.log(`${a.codigo}: origen ${porCodigo.origen}; ${porCodigo.documentos.length} documentos; aviso: ${porCodigo.aviso}`);
      await expect(localizarProceso("NOEXISTE-DAF-CM-2026-9999")).rejects.toThrow(/Ni datos abiertos ni el portal/);
    },
    180_000,
  );
});
