// Supabase Edge Function: hedef-pst-fark (19.11.2026, Melih) — marker HEDEF-PST-FARK
// Her gün 10:30 (pg_cron hedef-pst-fark, x-my-key = sistem_anahtar 'my_takip'):
//   Hedef Yükleme Tarihi ERP PST'sinden 5 iş gününden fazla farklı olan projeler → EU'ya (enes.uzun@, kisiler) tek mail; ERP PST'yi hedefe göre düzeltmesi istenir (HEDEF-PST-EU, 23.11.2026).
//   Kaynak: santiye_form_proje son dönem (ERP PST = pst, şantiyenin hedefi = pst_santiye) + my_takip (acil hedef / plan_hedef).
//   Hedef = Acil ise hedef_yukleme, değilse plan_hedef, o da yoksa pst_santiye. İş günü = Pzt–Cuma (resmî tatil sayılmaz).
//   Fark yoksa mail gitmez. onizleme:true → yalnız sonuç döner, mail yok.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const SB = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H: Record<string, string> = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fd = (iso: unknown) => { const s = String(iso || ""); return s.length >= 10 ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(2, 4) : ""; };
const bugun = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
async function rest(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status} ${t}`);
  return t ? JSON.parse(t) : [];
}
async function anahtar(ad: string) { const r = await rest(`sistem_anahtar?select=deger&ad=eq.${ad}`); return r && r[0] ? String(r[0].deger) : ""; }
function isGunu(a: string, b: string) { // a'dan b'ye iş günü farkı (işaretli)
  const d1 = new Date(a.slice(0, 10) + "T00:00:00Z"), d2 = new Date(b.slice(0, 10) + "T00:00:00Z");
  const yon = d2 >= d1 ? 1 : -1; let n = 0; const d = new Date(d1);
  while ((yon > 0 && d < d2) || (yon < 0 && d > d2)) { d.setUTCDate(d.getUTCDate() + yon); const g = d.getUTCDay(); if (g !== 0 && g !== 6) n += yon; }
  return n;
}
// deno-lint-ignore no-explicit-any
type Row = any;
serve(async (req) => {
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch (_e) { b = {}; }
  try {
    const key = req.headers.get("x-my-key") || "";
    if (!key || key !== await anahtar("my_takip")) return json({ ok: false, hata: "yetki yok" }, 401);
    const onizleme = b.onizleme === true || b.onizleme === "true";
    const son = await rest("santiye_form_proje?select=donem&order=donem.desc&limit=1");
    if (!son.length) return json({ ok: true, adet: 0 });
    const donem = son[0].donem;
    const P: Row[] = await rest(`santiye_form_proje?donem=eq.${donem}&pst=not.is.null&select=form_kodu,proje_no,proje_adi,proje_durumu,pst,pst_santiye`);
    const d = await (await fetch(`${SB}/rest/v1/rpc/_my_satirlar`, { method: "POST", headers: H, body: "{}" })).json(); // service_role my_takip okuyamaz → rpc
    const T: Row[] = ((d && d.rows) || []).filter((r: Row) => r.tur === "PRJ").map((r: Row) => ({ no: r.no, durum: r.durum, hedef_yukleme: r.hedef, plan_hedef: r.plan, plan_kisi: "MK/MY" }));
    const F: Row[] = await rest("santiye_form?select=kod,ad,kisi_kod");
    const tm = new Map(T.map((t: Row) => [t.no, t])), fm = new Map(F.map((f: Row) => [f.kod, f]));
    const rows: Row[] = [];
    for (const p of P) {
      const dk = parseFloat(String(p.proje_durumu || "").trim().split(/\s+/)[0]);
      if (!isNaN(dk) && dk >= 9) continue; // HEDEF-SEVK-HARIC (20.11.2026): sevk edilmiş projeler listeye girmez
      const t = tm.get(p.proje_no) as Row | undefined, f = fm.get(p.form_kodu) as Row | undefined;
      let hedef = "", kim = "";
      if (t && t.durum === "Acil" && t.hedef_yukleme) { hedef = t.hedef_yukleme; kim = "Acil hedefi"; }
      else if (t && t.plan_hedef) { hedef = t.plan_hedef; kim = (p.pst_santiye && String(p.pst_santiye).slice(0, 10) === String(t.plan_hedef).slice(0, 10)) ? (f?.kisi_kod || p.form_kodu) : "MK/MY"; } // HEDEF-TEK: şantiye tarihi plan_hedef'e eşitlenir
      else if (p.pst_santiye) { hedef = p.pst_santiye; kim = f?.kisi_kod || p.form_kodu; }
      if (!hedef) continue;
      const fark = isGunu(String(p.pst), String(hedef));
      if (Math.abs(fark) <= 5) continue;
      rows.push({ no: p.proje_no, proje: p.proje_adi, durum: p.proje_durumu, form: f?.ad || p.form_kodu, pst: p.pst, hedef, fark, kim });
    }
    rows.sort((x, y) => Math.abs(y.fark) - Math.abs(x.fark));
    const gun = bugun();
    if (!rows.length || onizleme) return json({ ok: true, onizleme, gun, donem, adet: rows.length, rows });
    const th = (s: string) => `<th style="border:1px solid #cdd6df;padding:4px 8px;background:#16324f;color:#fff;text-align:left">${s}</th>`;
    const td = (s: unknown, r = false) => `<td style="border:1px solid #cdd6df;padding:4px 8px;vertical-align:top${r ? ";text-align:right" : ""}">${esc(s)}</td>`;
    const tablo = `<table style="border-collapse:collapse;font-size:13px;margin:6px 0 14px"><tr>${["No", "Proje", "Durum", "Şantiye formu", "ERP PST", "Hedef Yükleme", "Fark (iş günü)", "Hedefi giren"].map(th).join("")}</tr>` +
      rows.map((r) => `<tr>${td(r.no)}${td(r.proje)}${td(r.durum)}${td(r.form)}${td(fd(r.pst))}${td(fd(r.hedef))}${td((r.fark > 0 ? "+" : "") + r.fark, true)}${td(r.kim)}</tr>`).join("") + "</table>";
    const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>Enes Bey,</p><p>Hedef yükleme tarihi ERP PST'sinden 5 iş gününden fazla farklı olan, aşağıdaki ${rows.length} proje için ERP'deki PST tarihlerini hedef yükleme tarihlerine göre düzeltiniz:</p>${tablo}` +
      `<p>Melih Bilgili</p></div>`;
    const text = `Enes Bey,\n\nHedef yükleme tarihi ERP PST'sinden 5 iş gününden fazla farklı olan, aşağıdaki ${rows.length} proje için ERP'deki PST tarihlerini hedef yükleme tarihlerine göre düzeltiniz:\n\n` +
      rows.map((r) => `- ${r.no} · ${r.proje} · PST ${fd(r.pst)} · Hedef ${fd(r.hedef)} · ${(r.fark > 0 ? "+" : "") + r.fark} iş günü · ${r.kim}`).join("\n") +
      "\n\nMelih Bilgili";
    const subject = `Claude: Hedef yükleme – ERP PST farkı > 5 iş günü (${rows.length}) · ${fd(gun)}`;
    const m = await fetch(`${SB}/functions/v1/arbor-mail`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: "enes.uzun@arbor.com.tr", subject, html, text }) });
    return json({ ok: m.ok, gun, adet: rows.length, mail: m.ok ? "ok" : `hata ${m.status} ${await m.text()}` });
  } catch (e) { return json({ ok: false, hata: String(e) }, 500); }
});
