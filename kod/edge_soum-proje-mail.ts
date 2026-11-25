// soum-proje-mail (SOUM-PROJE-MAIL, 18.11.2026 — Melike Başaran talebi, Melih onayı)
// Teklif Hazırlama formundaki "Projeyi mail at" düğmesi: Müşteriye bildirilecek notlar + "PDF oluştur" PDF'i ekli mail.
// SOUM-261123-MAILGORSEL (23.11.2026, Melike Başaran): not görselleri ek değil, mail metninde kendi maddesinin (notunun) yanında
// (gorseller: [{yol, n}] → 1 yıllık imzalı URL ile <img>). Eski istemcinin dosyalar içindeki görselleri yine ek olarak gider.
// Alıcı blok'a göre sabit: YD1 → MN, YD2 → MKB; cc OBL. Adresler yalnız kisiler tablosundan (PERSONEL-TEK-KAYNAK).
// Dosyalar istemcinin soum-teklif deposuna yüklediği mail/… yollarıdır; burada 7 günlük imzalı URL üretilir ve
// Zapier "arbor-mail-gonder" hattıyla (int@arbor.com.tr Outlook) file: [url…] olarak eklenir.
// Yetki: JWT e-postası teklif.form@arbor.com.tr ya da int@arbor.com.tr.
// Gövde: { blok, proje, firma?, ref?, notlar: string[], gorseller?: [{yol, n}], gonderen?, dosyalar: [{yol, ad}] }
// Supabase sürüm 4 (23.11.2026). Tam kaynak Supabase'de (get_edge_function soum-proje-mail); sürüm 3'ten fark: gorseller dizisi → 365 günlük imzalı URL, <li>not<br><img width=480></li> olarak notlar listesine eklenir.
import { createClient } from "npm:@supabase/supabase-js@2";

const HOOK = Deno.env.get("ARBOR_MAIL_HOOK") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const KOVA = "soum-teklif";
const IZIN = ["teklif.form@arbor.com.tr", "int@arbor.com.tr"];
const ALICI: Record<string, string> = { YD1: "MN", YD2: "MKB" };
const CC = ["OBL"];
const YOL_RE = /^mail\/\d{4}\/\d{2}\/[\w.\-]+$/;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
function jwtEmail(req: Request): string { const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""); const p = t.split("."); if (p.length !== 3) return ""; try { const j = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/"))); return typeof j.email === "string" ? j.email.toLowerCase() : ""; } catch (_e) { return ""; } }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!IZIN.includes(jwtEmail(req))) return J({ ok: false, hata: "Yetkisiz oturum. Sayfayı yenileyip tekrar deneyiniz." }, 401);
  if (!HOOK) return J({ ok: false, hata: "Mail hattı tanımsız (ARBOR_MAIL_HOOK)." }, 500);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const b = await req.json();
    const blok = String(b.blok || "").toUpperCase(); const akod = ALICI[blok];
    if (!akod) return J({ ok: false, hata: "Blok YD1/YD2 değil; proje YD listesinden seçilmemiş." }, 400);
    const proje = String(b.proje || "").slice(0, 200), firma = String(b.firma || "").slice(0, 200), ref = String(b.ref || "").slice(0, 60);
    const notlar: string[] = (Array.isArray(b.notlar) ? b.notlar : []).map((x: unknown) => String(x).slice(0, 2000)).slice(0, 100);
    const D = (Array.isArray(b.dosyalar) ? b.dosyalar : []).slice(0, 20);
    const G = (Array.isArray(b.gorseller) ? b.gorseller : []).slice(0, 30);
    const { data: K, error: ke } = await sb.from("kisiler").select("kod,email,aktif").in("kod", [akod, ...CC]);
    if (ke) return J({ ok: false, hata: "Personel okunamadı: " + ke.message }, 500);
    const em = (kod: string) => { const k = (K || []).find((x) => x.kod === kod); return k && k.aktif !== false && k.email ? String(k.email).trim() : ""; };
    const to = em(akod); if (!to) return J({ ok: false, hata: `${akod} için Personel kaydında e-posta yok.` }, 400);
    const cc = CC.map(em).filter((x) => x && x !== to);
    const file: string[] = [], adlar: string[] = [];
    for (const d of D) { const yol = String(d && d.yol || ""); if (!YOL_RE.test(yol)) return J({ ok: false, hata: "Geçersiz dosya yolu." }, 400);
      const ad = String(d.ad || yol.split("/").pop()).replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 120);
      const sg = await sb.storage.from(KOVA).createSignedUrl(yol, 7 * 86400, { download: ad });
      if (sg.error || !sg.data?.signedUrl) return J({ ok: false, hata: "Ek bağlantısı üretilemedi: " + (sg.error?.message || ad) }, 500);
      file.push(sg.data.signedUrl); adlar.push(ad); }
    const gli: string[] = [];
    for (const g of G) { const yol = String(g && g.yol || ""); if (!YOL_RE.test(yol)) return J({ ok: false, hata: "Geçersiz görsel yolu." }, 400);
      const sg = await sb.storage.from(KOVA).createSignedUrl(yol, 365 * 86400);
      if (sg.error || !sg.data?.signedUrl) return J({ ok: false, hata: "Görsel bağlantısı üretilemedi: " + (sg.error?.message || yol) }, 500);
      const n = String(g.n || "").slice(0, 2000);
      gli.push(`<li>${esc(n)}<br><img src="${esc(sg.data.signedUrl)}" alt="${esc(n.slice(0, 80))}" width="480" style="max-width:480px;height:auto;border:1px solid #cccccc"></li>`); }
    const zm = new Date(Date.now() + 3 * 3600e3).toISOString(); const tr = `${zm.slice(8, 10)}.${zm.slice(5, 7)}.${zm.slice(0, 4)} ${zm.slice(11, 16)}`;
    const html = `<p>${esc(proje)}${firma ? " · " + esc(firma) : ""}${ref ? " · Ref " + esc(ref) : ""} teklifi.</p><p><b>Müşteriye bildirilecek notlar</b></p>`
      + (notlar.length || gli.length ? `<ul>${notlar.map((n) => `<li>${esc(n)}</li>`).join("")}${gli.join("")}</ul>` : `<p>—</p>`)
      + (adlar.length ? `<p>Ekler: ${adlar.map(esc).join(", ")}</p>` : "") + `<p>Gönderen: ${esc(b.gonderen || "Teklif Hazırlama formu")} · ${tr}</p><p>Melih Bilgili</p>`;
    const r = await fetch(HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: [to], cc, subject: `Teklif Hazırlama: ${proje} — proje notları ve teklif`, html, file }) });
    if (!r.ok) return J({ ok: false, hata: `Mail hattı ${r.status}` }, 502);
    return J({ ok: true, to: [to], cc, ek: adlar.length, gorsel: gli.length });
  } catch (e) { return J({ ok: false, hata: String(e) }, 500); }
});
