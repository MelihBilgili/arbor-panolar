// Supabase Edge Function: form-gecikme-hatirlat (23.11.2026, Melih) — marker FORM-GECIKME-MAIL v2
// Her iş günü 10:00 TR (pg_cron form-gecikme-hatirlat 07:00 UTC, MY-MAIL-10; x-my-key = sistem_anahtar 'my_takip'):
//   Formlar panosunda adı "Faaliyet" olan ve aylık güncellemesi geciken (rpc form_gecikme, geciken > 0) formun sorumlusuna
//   (form_takip.ilgili_ad → kisiler e-posta, PERSONEL-TEK-KAYNAK) hatırlatma maili; güncelleme yapılınca (geciken 0) mail kesilir.
//   Arbor mail kuralları: konu "Claude: ", hitap <Ad> Bey/Hanım, "… rica ederim.", imza yalnız Melih Bilgili.
//   Günde bir kez (my_takip_mail_log gun + tur gecikme_<form>). form_takip.mail_sayac +1. onizleme:true → yalnız int@'e, log/sayaç yok.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const SB = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H: Record<string, string> = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const FORM = "https://melihbilgili.github.io/arbor-panolar/app/";
// Hitap (kisiler'de cinsiyet alanı yok): kod → hitap; listede yoksa hitap yazılmaz.
const HITAP: Record<string, string> = { MK: "Mehmet Bey", "ÖB": "Özgül Hanım", OE: "Onur Bey", MY: "Muhammer Bey", CTP: "Cenk Bey" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const bugun = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...((init.headers as Record<string, string>) || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function anahtar(ad: string) { const r = await rest(`sistem_anahtar?select=deger&ad=eq.${ad}`); return r && r[0] ? String(r[0].deger) : ""; }
async function mail(to: string, subject: string, html: string, text: string) {
  const r = await fetch(`${SB}/functions/v1/arbor-mail`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, html, text }) });
  return r.ok ? "ok" : `hata ${r.status} ${await r.text()}`;
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
    const gun = bugun();
    const wd = new Date(gun + "T12:00:00Z").getUTCDay();
    if (!onizleme && (wd === 0 || wd === 6)) return json({ ok: true, gun, not: "hafta sonu" });
    const rows: Row[] = ((await rest("rpc/form_gecikme", { method: "POST", body: "{}" })) || [])
      .filter((r: Row) => Number(r.geciken) > 0 && /faaliyet/i.test(String(r.form_adi || "")));
    const kis: Row[] = (await rest("kisiler?select=kod,tam_ad,email,aktif")) || [];
    const nrm = (s: unknown) => String(s || "").trim().toLocaleLowerCase("tr");
    const sonuc: Record<string, unknown> = { gun };
    for (const r of rows) {
      const k = kis.find((x: Row) => nrm(x.tam_ad) === nrm(r.ilgili_ad));
      const to = onizleme ? "int@arbor.com.tr" : (k && k.email) || "";
      if (!to) { sonuc[r.form_key] = "kisiler'de e-posta yok: " + r.ilgili_ad; continue; }
      if (!onizleme) {
        const l = await fetch(`${SB}/rest/v1/my_takip_mail_log`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ gun, tur: "gecikme_" + r.form_key, ozet: { geciken: r.geciken } }) });
        if (!l.ok) { sonuc[r.form_key] = "bugün gönderildi"; continue; }
      }
      const hitap = (k && HITAP[k.kod]) || "";
      const istek = `${r.form_adi} formunun aylık güncellemesi ${r.geciken} iş günü gecikti. Formdaki Güncelle düğmesine basarak güncellemeyi bugün tamamlamanızı rica ederim.`;
      const subject = "Claude: " + (onizleme ? `[Önizleme → ${(k && k.kod) || r.ilgili_ad}] ` : "") + `Geciken güncelleme: ${r.form_adi} · ${r.geciken} iş günü`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px">${hitap ? `<p>${esc(hitap)},</p>` : ""}<p>${esc(istek)}</p><p><a href="${FORM}${r.yol}">${esc(r.form_adi)}</a></p><p>Melih Bilgili</p></div>`;
      const text = `${hitap ? hitap + ",\n\n" : ""}${istek}\n\n${FORM}${r.yol}\n\nMelih Bilgili`;
      const m = await mail(to, subject, html, text);
      if (!onizleme && m === "ok") {
        const ft = await rest(`form_takip?select=mail_sayac&form_key=eq.${r.form_key}`);
        await rest(`form_takip?form_key=eq.${r.form_key}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ mail_sayac: ((ft && ft[0] && ft[0].mail_sayac) || 0) + 1, updated_at: new Date().toISOString() }) });
      }
      sonuc[r.form_key] = { geciken: r.geciken, to, mail: m };
    }
    return json({ ok: true, onizleme, adet: rows.length, ...sonuc });
  } catch (e) { return json({ ok: false, hata: String(e) }, 500); }
});
