// Supabase Edge Function: yonetim-onay-hatirlat (20.11.2026, Melih) — marker YONETIM-ONAY-HATIRLAT
// ERP ingest (mod run) bitince erp_ingest_log tetikleyicisi (trg_yonetim_onay_hatirlat) çağırır; x-erp-key = sistem_anahtar 'erp_ingest'.
// Son ERP yüklemesinin Prj raporunda durum "6.1 Yönetim Onayı Bekleyenler" olan proje varsa Melih'e (int@) mail:
//   ERP'ye girip yönetim onayı vermesi hatırlatılır. Yoksa mail gitmez. onizleme:true → yalnız sonuç döner.
// Deploy: verify_jwt=false (kendi anahtar kapısı var).
const SB = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H: Record<string, string> = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fd = (iso: unknown) => { const s = String(iso || ""); return s.length >= 10 ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(2, 4) : ""; };
async function rest(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status} ${t}`);
  return t ? JSON.parse(t) : [];
}
// deno-lint-ignore no-explicit-any
type Row = any;
Deno.serve(async (req) => {
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch (_e) { b = {}; }
  try {
    const k = await rest("sistem_anahtar?select=deger&ad=eq.erp_ingest");
    const key = req.headers.get("x-erp-key") || "";
    if (!key || !k[0] || key !== String(k[0].deger)) return json({ ok: false, hata: "yetki yok" }, 401);
    const onizleme = b.onizleme === true || b.onizleme === "true";
    const y = b.damga ? await rest(`erp_yukleme?damga=eq.${b.damga}&select=id,damga`) : await rest("erp_yukleme?select=id,damga&order=id.desc&limit=1");
    if (!y.length) return json({ ok: true, adet: 0, not: "erp_yukleme yok" });
    const { id, damga } = y[0];
    const P: Row[] = await rest(`proje_snapshot?erp_yukleme_id=eq.${id}&proje_durumu=like.6.1*&select=proje_no,proje_adi,ulke,adet,mvt,aup,gyt,santiye_sorumlusu,proje_durumu&order=proje_no`);
    const rows = P.filter((p) => /^\s*6\.1(\s|$)/.test(String(p.proje_durumu || "")));
    if (!rows.length || onizleme) return json({ ok: true, onizleme, damga, adet: rows.length, rows });
    const th = (s: string) => `<th style="border:1px solid #cdd6df;padding:4px 8px;background:#16324f;color:#fff;text-align:left">${s}</th>`;
    const td = (s: unknown, r = false) => `<td style="border:1px solid #cdd6df;padding:4px 8px;vertical-align:top${r ? ";text-align:right" : ""}">${esc(s)}</td>`;
    const tablo = `<table style="border-collapse:collapse;font-size:13px;margin:6px 0 14px"><tr>${["No", "Proje", "Ülke", "Adet", "MVT", "PST", "Şantiye sorumlusu"].map(th).join("")}</tr>` +
      rows.map((r) => `<tr>${td(r.proje_no)}${td(r.proje_adi)}${td(r.ulke)}${td(r.adet ?? "", true)}${td(fd(r.mvt))}${td(fd(r.gyt))}${td(r.santiye_sorumlusu)}</tr>`).join("") + "</table>";
    const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>ERP ${esc(damga)} Prj raporunda <b>6.1 Yönetim Onayı Bekleyenler</b> durumunda ${rows.length} proje var. ERP'ye girip yönetim onayını vermeniz gerekiyor:</p>${tablo}<p>[Claude-otomatik]</p></div>`;
    const text = `ERP ${damga} Prj raporunda 6.1 Yönetim Onayı Bekleyenler durumunda ${rows.length} proje var. ERP'ye girip yönetim onayını vermeniz gerekiyor:\n\n` +
      rows.map((r) => `- ${r.proje_no} · ${r.proje_adi || "?"} · ${r.ulke || "?"} · ${r.adet ?? "?"} adet · MVT ${fd(r.mvt) || "—"} · PST ${fd(r.gyt) || "—"}`).join("\n") + "\n\n[Claude-otomatik]";
    const subject = `Claude: ERP'de yönetim onayı bekleyen projeler (${rows.length}) · ${damga.slice(4, 6)}.${damga.slice(2, 4)}.${damga.slice(0, 2)}`;
    const m = await fetch(`${SB}/functions/v1/arbor-mail`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, apikey: SRK, "Content-Type": "application/json" }, body: JSON.stringify({ to: "int@arbor.com.tr", subject, html, text }) });
    return json({ ok: m.ok, damga, adet: rows.length, mail: m.ok ? "ok" : `hata ${m.status} ${await m.text()}` });
  } catch (e) { return json({ ok: false, hata: String(e) }, 500); }
});
