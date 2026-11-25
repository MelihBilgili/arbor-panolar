// Supabase Edge Function: my-tarih-hatirlat (19.11.2026, Melih) — marker MY-PLAN-HEDEF
// Her gün (pg_cron my-tarih-hatirlat, x-my-key = sistem_anahtar 'my_takip'):
//   - MY'ye: Hedef Yükleme Tarihi girilmemiş Sevke Hazır PEM'ler (blok pem, ERP durumu 3) → MY Faaliyet formu
//   - MK'ya: Hedef Yükleme Tarihi girilmemiş Sevke Hazır Projeler (blok sevk, durum 8 / 8.1) → MK Faaliyet formu
//   - EB'ye: Hedef Yükleme Tarihi girilmemiş yurt içi Sevke Hazır PEM'ler (rpc _yi_sevk_pem) → Yurt İçi şantiye formu (YI-SEVK-PEM)
//   Tarih girilmiş = acil satırda hedef ya da my_takip.plan_hedef (rpc my_plan_yaz). Günde bir kez (my_takip_mail_log gun+tur: my_tarih / mk_tarih / eb_tarih).
//   onizleme:true → yalnız int@'e, log yok.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const SB = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H: Record<string, string> = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const FORM = "https://melihbilgili.github.io/arbor-panolar/app/";
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fd = (iso: unknown) => { const s = String(iso || ""); return s.length >= 10 ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(2, 4) : ""; };
const bugun = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...((init.headers as Record<string, string>) || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function anahtar(ad: string) { const r = await rest(`sistem_anahtar?select=deger&ad=eq.${ad}`); return r && r[0] ? String(r[0].deger) : ""; }
async function kisi(kod: string) { const r = await rest(`kisiler?select=kod,tam_ad,email&kod=eq.${encodeURIComponent(kod)}`); return r && r[0] ? r[0] : null; }
async function mail(to: string, subject: string, html: string, text: string) {
  const r = await fetch(`${SB}/functions/v1/arbor-mail`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, html, text }) });
  return r.ok ? "ok" : `hata ${r.status} ${await r.text()}`;
}
// deno-lint-ignore no-explicit-any
type Row = any;
const dno = (r: Row) => { const m = String(r.durum_erp || "").match(/^\s*(\d+(?:[.,]\d+)?)/); return m ? Number(m[1].replace(",", ".")) : 0; };
const tarihli = (r: Row) => (r.durum === "Acil" && r.hedef) || r.plan;
const th = (s: string) => `<th style="border:1px solid #cdd6df;padding:4px 8px;background:#16324f;color:#fff;text-align:left">${s}</th>`;
const td = (s: string) => `<td style="border:1px solid #cdd6df;padding:4px 8px;vertical-align:top">${esc(s)}</td>`;
function tablo(rows: Row[]) {
  return `<table style="border-collapse:collapse;font-size:13px;margin:6px 0 14px"><tr>${["No", "Proje", "Adet", "ERP Durumu", "AÜP / Termin", "Kesinleşen Yükleme"].map(th).join("")}</tr>` +
    rows.map((r: Row) => `<tr>${[r.tur === "PEM" ? "PEM " + r.no : r.no, r.proje, r.adet, r.durum_erp, fd(r.tarih), fd(r.kesin)].map(td).join("")}</tr>`).join("") + "</table>";
}
const satirTxt = (r: Row) => `- ${r.tur === "PEM" ? "PEM " + r.no : r.no} · ${r.proje || ""} · ${r.adet || "-"} ad · ${r.durum_erp || ""}`;
serve(async (req) => {
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch (_e) { b = {}; }
  try {
    const key = req.headers.get("x-my-key") || "";
    if (!key || key !== await anahtar("my_takip")) return json({ ok: false, hata: "yetki yok" }, 401);
    const onizleme = b.onizleme === true || b.onizleme === "true";
    const gun = bugun();
    const d = await rest("rpc/_my_satirlar", { method: "POST", body: "{}" });
    const rows: Row[] = (d && d.rows) || [];
    const yi: Row[] = (await rest("rpc/_yi_sevk_pem", { method: "POST", body: "{}" })) || [];
    const isler = [
      { tur: "my_tarih", kod: "MY", ad: "Muhammer", form: "my-faaliyet/", formAd: "MY Faaliyet formu", tablo: "Sevke Hazır PEM'ler",
        rows: rows.filter((r: Row) => r.blok === "pem" && dno(r) >= 3 && !tarihli(r)), konu: "Sevke hazır PEM'lerin hedef yükleme tarihi" },
      { tur: "mk_tarih", kod: "MK", ad: "Mehmet", form: "mk-prim/", formAd: "MK Faaliyet formu", tablo: "Sevke Hazır Projeler",
        rows: rows.filter((r: Row) => r.blok === "sevk" && !tarihli(r)), konu: "Sevke hazır projelerin hedef yükleme tarihi" },
      // YI-SEVK-PEM (19.11.2026, Melih): yurt içi sevke hazır PEM'ler → EB (Yurt İçi şantiye formu)
      { tur: "eb_tarih", kod: "EB", ad: "Erdoğan", form: "santiye-yi/", formAd: "Yurt İçi şantiye formu", tablo: "Sevke Hazır PEM'ler",
        rows: (yi || []).filter((r: Row) => !tarihli(r)), konu: "Yurt içi sevke hazır PEM'lerin hedef yükleme tarihi" },
    ];
    const sonuc: Record<string, unknown> = { gun };
    for (const i of isler) {
      if (!i.rows.length) { sonuc[i.kod] = "eksik yok"; continue; }
      if (!onizleme) {
        const r = await fetch(`${SB}/rest/v1/my_takip_mail_log`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ gun, tur: i.tur, ozet: { adet: i.rows.length } }) });
        if (!r.ok) { sonuc[i.kod] = "bugün gönderildi"; continue; }
      }
      const k = await kisi(i.kod); const ilk = String(k?.tam_ad || i.ad).split(/\s+/)[0];
      const istek = `Aşağıdaki ${i.rows.length} satırın Hedef Yükleme Tarihi'ni ${i.formAd}nda "${i.tablo}" tablosundaki kırmızı "Tarih gir" hücresine girmenizi rica ederim.`;
      const subject = (onizleme ? `[Önizleme → ${i.kod}] ` : "") + `${i.konu} girilmedi (${i.rows.length}) · ${fd(gun)}`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p>${esc(istek)}</p>${tablo(i.rows)}<p><a href="${FORM}${i.form}">${i.formAd}</a></p><p>Melih Bilgili</p></div>`;
      const text = `${ilk} Bey,\n\n${istek}\n\n${i.rows.map(satirTxt).join("\n")}\n\n${FORM}${i.form}\n\nMelih Bilgili`;
      sonuc[i.kod] = { adet: i.rows.length, mail: await mail(onizleme ? "int@arbor.com.tr" : (k?.email || "int@arbor.com.tr"), subject, html, text) };
    }
    return json({ ok: true, onizleme, ...sonuc });
  } catch (e) { return json({ ok: false, hata: String(e) }, 500); }
});
