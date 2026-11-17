// Supabase Edge Function: cam-fiyat-onay  (06.11.2026, Melih) — marker CAM-FIYAT-ONAY
// Ürün Konfigürasyonu'nda "Fiyat kullanım talimatı al" sonucu "Onaysız Kullanmayınız" çıkınca form çağırır.
//  islem "talep"   (cam.form@ / int@): cam_fiyat_onay'a satır + Melih'e WhatsApp (CallMeBot, sistem_anahtar 'wa_callmebot').
//                  Aynı kişi + seri + cam + Pencad fiyatı için bekleyen/kararlı satır varsa yeni satır ve WA yok.
//  islem "goruldu" (cam.form@ / int@): kullanıcının onay penceresini gördüğünü işaretler.
// Karar (Pencad / Hesaplanan) app Giriş panosundaki "Cam Fiyat Onayı Ver" düğmesinden doğrudan tabloya yazılır (int@, RLS arb_rw).
// CAM-FIYAT-ONAY-KISA (13.11.2026, Melih): WA mesajı etiketli satırlara indirildi — seri, yorum cümleleri,
//   "Fark neden büyük" başlığı ve "Onay: App › Giriş › Cam Fiyat Onayı Ver" satırı kaldırıldı.
// CAM-FIYAT-ONAY-AD-ESLES (13.11.2026, Melih, v5): Pencad/cam listesi ve teklif eşleşmesinde Akustik=Acoustic; aynı cam "en yakın" diye gösterilmez.
// CAM-YAKIN-TEKLIF (17.11.2026, Melih, v8): teklif satırları yerine "Yakın teklifler" listesi (b.yakin).
// CAM-ONAY-SATIS (17.11.2026, Melih, v7): kıyas yeniden girilen Pencad satış fiyatı (v6'daki alış ×2,5 kıyası kaldırıldı; hesap satırı kalır).
// CAM-ONAY-ALIS25 + CAM-ONAY-HESAP (17.11.2026, Melih, v6): fark Pencad alış ×2,5'e göre (girilen Pencad satışı, listedeki satış/alış
//   çarpanıyla ×2,5'e çevrilir; form "kiyas" gönderir, yoksa pencad_satir'dan hesaplanır); mesaja modelin birim fiyat hesabı ("hesap") eklenir.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SB = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H: Record<string, string> = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const IZIN = ["cam.form@arbor.com.tr", "int@arbor.com.tr"];

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...((init.headers as Record<string, string>) || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function kullanici(req: Request): Promise<string> {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return "";
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${t}` } });
  if (!r.ok) return "";
  const u = await r.json();
  return String(u.email || "").toLowerCase();
}
async function wa(text: string) {
  try {
    const a = await rest(`sistem_anahtar?select=deger&ad=eq.wa_callmebot`);
    const k = JSON.parse((a && a[0] && a[0].deger) || "{}");
    if (!k.phone || !k.apikey) return "wa anahtarı yok";
    // CAM-FIYAT-ONAY-WA2: encodeURIComponent ' ! ( ) * kodlamaz; CallMeBot kesme işaretini siliyordu
    const enc = encodeURIComponent(text).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    const u = `https://api.callmebot.com/whatsapp.php?phone=${k.phone}&apikey=${k.apikey}&text=${enc}`;
    const r = await fetch(u); const t = await r.text();
    return /queued|sent/i.test(t) ? "ok" : `wa ${r.status} ${t.replace(/<[^>]+>/g, " ").slice(0, 120)}`;
  } catch (e) { return "wa " + String(e); }
}
const sayi = (v: unknown) => { if (typeof v === "number") return isFinite(v) ? v : null; const s = String(v ?? "").trim(); const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return isFinite(n) ? n : null; };
const tr = (n: number | null, d = 2) => n == null ? "–" : n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const yuzde = (a: number, b: number) => Math.round((a / b - 1) * 1000) / 10; // tek ondalık
const yz = (p: number) => "%" + tr(Math.abs(p), Math.abs(p) < 10 && p % 1 !== 0 ? 1 : 0);
// Ad karşılaştırma: küçük harf, boşluksuz, Ug kodu (0.x/1.x) ve "ug=..." atılır
// CAM-FIYAT-ONAY-AD-ESLES (13.11.2026, Melih): Akustik=Acoustic, "Ar We"="Ar-We", virgül/boşluk farkı yok sayılır
const nrm = (s: unknown) => String(s ?? "").toLowerCase().replace(/akustik/g, "acoustic").replace(/ar\s*-?\s*we/g, "ar-we").replace(/ug\s*=\s*[\d.,]+/g, "").replace(/(^|[^\d.])[01]\.\d(?![\d.])/g, "$1").replace(/ar90/g, "ar").replace(/[\s,]+/g, "");
const ugAd = (s: unknown): number | null => { const t = String(s ?? ""); const m = /ug\s*=\s*([\d]+[.,]\d+)/i.exec(t) || /(?:^|[^\d.])([01]\.\d)(?![\d.])/.exec(t); return m ? sayi(m[1]) : null; };
function adSec<T extends { kombinasyon: string }>(rows: T[] | null, komb: string, ug: number | null): T | null {
  const k = nrm(komb); const c = (rows || []).filter((r) => nrm(r.kombinasyon) === k);
  if (!c.length) return null;
  if (ug != null) { const u = c.find((r) => { const x = ugAd(r.kombinasyon); return x != null && Math.abs(x - ug) < 0.01; }); if (u) return u; }
  return c[0];
}
const tarih = () => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit" }).format(new Date()).replace("/", ".");
// CAM-FIYAT-ONAY-PENCAD: Pencad cam listesindeki satır (pencad_cam, kaynak Pencad-ERP_Cam_Listesi xlsx) — stok kodu cam_listesi'nden, yoksa ad
type Pc = { stok_kodu: string; kombinasyon: string; maliyet: number | null; satis: number | null; satis_0126: number | null; kaynak: string | null; liste_tarih: string };
async function pencadBul(komb: string, ug: number | null = null): Promise<Pc | null> {
  const e = encodeURIComponent(komb);
  const cl = await rest(`cam_listesi?select=stok_kodu&kombinasyon=eq.${e}&stok_kodu=not.is.null&limit=1`);
  let st = cl && cl[0] && String(cl[0].stok_kodu || "").trim();
  // CAM-FIYAT-ONAY-AD-ESLES: birebir ad yoksa normalize adla (Akustik=Acoustic, Ug eki yok sayılır; birden çoksa camın Ug'si)
  if (!st) { const t = await rest(`cam_listesi?select=stok_kodu,kombinasyon&stok_kodu=not.is.null&limit=5000`); const r = adSec(t, komb, ug); st = r ? String((r as { stok_kodu?: string }).stok_kodu || "").trim() : ""; }
  if (st) { const p = await rest(`pencad_cam?select=*&stok_kodu=eq.${encodeURIComponent(st)}&limit=1`); if (p && p[0]) return p[0]; }
  const p2 = await rest(`pencad_cam?select=*&kombinasyon=ilike.${e}&limit=1`);
  if (p2 && p2[0]) return p2[0];
  const t2 = await rest(`pencad_cam?select=*&limit=5000`);
  return adSec(t2 as Pc[], komb, ug);
}
function kaynakYas(k: string): string {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(k) || /(20\d{2})/.exec(k);
  if (!m) return "";
  const d = m.length >= 4 ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date(+m[1], 5, 30);
  const ay = Math.round((Date.now() - d.getTime()) / (30.44 * 864e5));
  return ay >= 12 ? ` (yaklaşık ${Math.floor(ay / 12)} yıl${ay % 12 ? " " + (ay % 12) + " ay" : ""} önce)` : "";
}
// CAM-ONAY-ALIS25: kıyas fiyatı = girilen Pencad satışı × 2,5 / (listedeki satış ÷ alış)
function kiyasBul(b: Record<string, unknown>, pencad: number): number | null {
  const k = sayi(b.kiyas); if (k && k > 0) return k;
  const pc = b.pencad_satir as Pc | null | undefined; if (!pc) return null;
  const ps = sayi(pc.satis), pm = sayi(pc.maliyet);
  return ps && pm && ps > 0 && pm > 0 ? Math.round(pencad * 2.5 / (ps / pm) * 100) / 100 : null;
}

type Sat = { lbl?: string; fiyat?: string; deger?: string; komb?: string };
function mesajYaz(b: Record<string, unknown>) {
  const komb = String(b.komb || "");
  const birim = sayi(b.birim) as number, pencad = sayi(b.pencad) as number;
  const kiyas: number | null = null, ref = pencad; // CAM-ONAY-SATIS (17.11.2026, Melih): kıyas yeniden Pencad satış fiyatı; kiyasBul kullanılmaz
  const fark = Math.round((ref / birim - 1) * 100);
  const S = (Array.isArray(b.satirlar) ? b.satirlar : []) as Sat[];
  const bul = (re: RegExp) => S.find((x) => re.test(String(x.lbl || "")));
  const ls = bul(/listesindeki en yakın kombinasyon/i) || bul(/listesindeki/i);
  const out: string[] = [];
  out.push(`*Cam fiyat onay talebi* · ${tarih()} · ${b.kisi_ad || b.kisi_kod || "?"}`);
  out.push(`${komb}.`);
  out.push(`Form: ${tr(birim)} €/m².`);
  out.push(`Pencad: ${tr(pencad)} €/m².`);
  if (kiyas != null && Math.abs(kiyas - pencad) > 0.005) out.push(`Kıyas (Pencad alış ×2,5): ${tr(kiyas)} €/m².`);
  out.push(`Fark ${fark > 0 ? "+" : "−"}%${Math.abs(fark)}${kiyas != null && Math.abs(kiyas - pencad) > 0.005 ? " (kıyasa göre)" : ""}.`);
  const hz = String(b.hesap || "").trim(); if (hz) out.push(hz); // CAM-ONAY-HESAP
  const pc = b.pencad_satir as Pc | null | undefined;
  if (pc) {
    const ps = sayi(pc.satis), pm = sayi(pc.maliyet);
    let t = `Pencad cam listesi: stok ${pc.stok_kodu}, liste ${String(pc.liste_tarih).split("-").reverse().join(".")}, `;
    t += ps ? `satış ${tr(ps)} €/m²` : "satış fiyatı yok";
    if (pm) t += `, alış ${tr(pm)} €/m²` + (ps ? ` (×${tr(ps / pm)})` : "");
    t += pc.kaynak ? `. Fiyatın kaynağı: ${pc.kaynak}${kaynakYas(pc.kaynak)}.` : ". Fiyatın nereden geldiği listede yazmıyor.";
    if (ps && Math.abs(ps / pencad - 1) > 0.01) t += ` Girilen Pencad fiyatı (${tr(pencad)}) listedekinden farklı.`;
    out.push(t);
  } else if (b.pencad_satir === null) out.push("Pencad cam listesi: Kombinasyon bulunamadı.");
  // CAM-YAKIN-TEKLIF (17.11.2026, Melih, v8): "en yakın teklif" yerine fiyatlanan kombinasyonla aynı ya da tek yönden farklı geçmiş teklifler;
  // her biri için fiyatlanan kombinasyonun bileşen kurallarıyla fiyatı (satırlar formdan, b.yakin)
  const YK = (Array.isArray(b.yakin) ? b.yakin : []).map((x) => String(x)).filter((x) => x.trim());
  if (YK.length) { out.push("Yakın teklifler:"); for (const x of YK) out.push("– " + x); }
  else out.push("Yakın teklifler: aynı ya da tek yönden farklı kombinasyonda geçmiş teklif yok.");
  // Cam listesi satırı
  if (ls) {
    const m = /([\d.]+,\d+)\s*€/.exec(String(ls.fiyat || "")); const lf = m ? sayi(m[1]) : null;
    const lsAyni = nrm(ls.komb) === nrm(komb); // CAM-FIYAT-ONAY-AD-ESLES
    if (lf) out.push(lsAyni ? `• Cam listesindeki fiyatı ${tr(lf)} €/m²; Pencad fiyatından ${yz(yuzde(pencad, lf))} farklı.` : `• Cam listesindeki en yakın kombinasyon (${ls.komb}) ${tr(lf)} €/m²; Pencad fiyatından ${yz(yuzde(pencad, lf))} farklı.`);
    else out.push("• Cam listesinde bu camın fiyatı yok, bu yüzden fiyat modelden geliyor.");
  }
  // Model
  const rz = String(b.rozet || "").trim();
  if (rz) out.push(`• Formun fiyat dayanağı: ${rz}.`);
  return { text: out.join("\n"), fark };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch (_e) { b = {}; }
  const islem = String(b.islem || "");
  try {
    const em = await kullanici(req);
    if (!IZIN.includes(em)) return json({ ok: false, hata: "yetki yok" }, 401);
    if (islem === "talep") {
      const birim = sayi(b.birim), pencad = sayi(b.pencad);
      if (!b.komb || !b.seri || !birim || !pencad) return json({ ok: false, hata: "eksik veri" }, 400);
      const kod = String(b.kisi_kod || (em === "int@arbor.com.tr" ? "MB" : ""));
      const q = `cam_fiyat_onay?select=id,durum&kisi_kod=eq.${encodeURIComponent(kod)}&seri=eq.${encodeURIComponent(String(b.seri))}&komb=eq.${encodeURIComponent(String(b.komb))}&pencad=eq.${pencad}&goruldu=eq.false&order=id.desc&limit=1`;
      const var_ = await rest(q);
      if (var_ && var_.length) return json({ ok: true, id: var_[0].id, durum: var_[0].durum, tekrar: true });
      let pc: Pc | null = null; try { pc = await pencadBul(String(b.komb), sayi((b.cam as Record<string, unknown> | null)?.ug)); } catch (_e) { pc = null; }
      const { text, fark } = mesajYaz({ ...b, kisi_kod: kod, pencad_satir: pc });
      const ins = await rest("cam_fiyat_onay", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        kisi_kod: kod, kisi_ad: b.kisi_ad || null, seri: b.seri, komb: b.komb, cam: b.cam || null,
        birim, pencad, fark, satirlar: b.satirlar || null, mesaj: text }) });
      const id = ins && ins[0] && ins[0].id;
      if (b.onizleme === true) return json({ ok: true, id, wa: "önizleme", mesaj: text });
      // CAM-FIYAT-ONAY-WA2: CallMeBot kısa aralıkla gelen mesajları birleştirip kesiyor → mesajlar arası en az 75 sn; gönderim arka planda
      const son = await rest(`cam_fiyat_onay?select=wa_at&wa_at=not.is.null&order=wa_at.desc&limit=1`);
      const sonT = son && son[0] ? new Date(son[0].wa_at).getTime() : 0;
      const at = Math.max(Date.now(), sonT + 75000), gecik = at - Date.now();
      await rest(`cam_fiyat_onay?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ wa_at: new Date(at).toISOString(), wa_durum: gecik > 0 ? "sırada" : "gönderiliyor" }) });
      const is = (async () => { if (gecik > 0) await new Promise((r) => setTimeout(r, gecik)); const w = await wa(text);
        await rest(`cam_fiyat_onay?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ wa_durum: w }) }); })();
      // deno-lint-ignore no-explicit-any
      const ER = (globalThis as any).EdgeRuntime; if (ER && ER.waitUntil) ER.waitUntil(is); else await is;
      return json({ ok: true, id, wa: gecik > 0 ? "sırada" : "gönderiliyor" });
    }
    if (islem === "goruldu") {
      const id = +String(b.id || 0); if (!id) return json({ ok: false, hata: "id?" }, 400);
      await rest(`cam_fiyat_onay?id=eq.${id}&durum=neq.bekliyor`, { method: "PATCH", body: JSON.stringify({ goruldu: true, goruldu_at: new Date().toISOString() }) });
      return json({ ok: true });
    }
    return json({ ok: false, hata: "islem?" }, 400);
  } catch (e) {
    return json({ ok: false, hata: String(e) }, 500);
  }
});
