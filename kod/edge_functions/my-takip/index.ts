// Supabase Edge Function: my-takip  (28.10.2026, Melih) — marker MY-FAALIYET
// MY Faaliyet formunun bildirimleri.
//  islem "iptal" (form, MY/MB oturumu): OE'ye satırın iptal edilmesini isteyen mail.
//  islem "acil"  (form, MY/MB/MK/OE oturumu — MY-DURUM-MK-OE 10.11.2026): OE'ye acil takip + yükleme isteği maili (OE kendisi yaptıysa mail yok), MB'ye WhatsApp.
//  islem "pasif_pem" (ERP çekimi 7. adım, service key): pasif PEM listesi → EU (MY-PEM-PASIF, +BUSE), 1.4 PEM listesi → MK (MY-PEM-YD14).
//  islem "santiye_talep" (şantiye formu rolü): şantiyenin Acil/Normal talebi → MY'ye mail (MY-SANTIYE).
//  islem "talep_karar" (MY/MB): MY'nin onay/red kararı → şantiye sorumlusuna mail; onaylanan Acil → OE maili + MB WhatsApp.
//  MY-KESIN-VURGU (17.11.2026, Melih): OE'ye giden acil maillerinde sevke hazır (PEM 3 / PRJ 8) satırda Kesinleşen Yükleme Tarihi yoksa
//     bu satırlar vurgulanır ve tarihin girilmesi ya da girilemiyorsa nedeninin Açıklama sütununa yazılması istenir; tabloda Kesinleşen Yükleme sütunu.
//  islem "gunluk" (pg_cron my-takip-gunluk, x-my-key = sistem_anahtar 'my_takip'):
//     - OE'ye günlük mail 13.11.2026'dan beri YOK (MY-GUNLUK-OE-YOK); MB'ye günlük WhatsApp 18.11.2026'dan beri YOK (MY-GUNLUK-WA-YOK — 09:30 görevi aynı listeyi verir); önizlemede int@'e gider
//     - her gün: MK onayı bekleyen Uçak yüklemeleri → MK'ya hatırlatma maili
//     - her gün: MY onayı bekleyen şantiye talepleri → MY'ye hatırlatma maili (MY-SANTIYE)
//     Günde bir kez (my_takip_mail_log unique gun+tur). onizleme:true → yalnız int@'e, WA yok, log yok.
// Satırlar = public._my_satirlar() (PRJ/PEM panosunun yurt dışı içeriği; İptal hariç).
// WhatsApp: Whapi.Cloud (WA-WHAPI 18.11.2026; sistem_anahtar 'wa_whapi' {token,to}; CallMeBot kotası bitti). Mail: arbor-mail (int@ Outlook).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SB = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H: Record<string, string> = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const FORM = "https://melihbilgili.github.io/arbor-panolar/app/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-my-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fd = (iso: unknown) => { const s = String(iso || ""); return s.length >= 10 ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(2, 4) : ""; };
const bugun = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
// Resmî tatiller (tam gün). 2028 ve sonrası eklenmeli.
const TATIL = new Set([
  "2026-01-01", "2026-03-20", "2026-03-21", "2026-03-22", "2026-04-23", "2026-05-01", "2026-05-19",
  "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-07-15", "2026-08-30", "2026-10-29",
  "2027-01-01", "2027-03-09", "2027-03-10", "2027-03-11", "2027-04-23", "2027-05-01", "2027-05-16",
  "2027-05-17", "2027-05-18", "2027-05-19", "2027-07-15", "2027-08-30", "2027-10-29",
]);
const isGunu = (g: string) => { const d = new Date(g + "T12:00:00Z").getUTCDay(); return d !== 0 && d !== 6 && !TATIL.has(g); };

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...((init.headers as Record<string, string>) || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function anahtar(ad: string) {
  const r = await rest(`sistem_anahtar?select=deger&ad=eq.${ad}`);
  return r && r[0] ? String(r[0].deger) : "";
}
async function kisi(kod: string) {
  const r = await rest(`kisiler?select=kod,tam_ad,email&kod=eq.${encodeURIComponent(kod)}`);
  return r && r[0] ? r[0] : null;
}
async function mail(to: string, subject: string, html: string, text: string) {
  const r = await fetch(`${SB}/functions/v1/arbor-mail`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, html, text }) });
  return r.ok ? "ok" : `hata ${r.status} ${await r.text()}`;
}
// WA-WHAPI (18.11.2026): Whapi.Cloud POST /messages/text
async function wa(text: string) {
  try {
    const k = JSON.parse(await anahtar("wa_whapi") || "{}");
    if (!k.token || !k.to) return "wa anahtarı yok";
    const r = await fetch("https://gate.whapi.cloud/messages/text", { method: "POST", headers: { Authorization: `Bearer ${k.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: k.to, body: text }) });
    const t = await r.text();
    return r.ok && /"sent"\s*:\s*true/.test(t) ? "ok" : `wa ${r.status} ${t.slice(0, 160)}`;
  } catch (e) { return "wa " + String(e); }
}
type Row = { blok: string; tur: string; no: string; kod: string; proje: string; adet: string; tarih: string; hedef: string; sekil: string; ucak_onay: boolean; aciklama: string; durum: string; sevk_durumu: string; ekbilgi: string; durum_erp?: string; kesin?: string | null; santiye?: string; talep?: string; talep_hedef?: string; talep_sekil?: string; talep_aciklama?: string; talep_kisi?: string; talep_form?: string };
async function satirlar(): Promise<Row[]> {
  const r = await rest("rpc/_my_satirlar", { method: "POST", body: "{}" });
  return (r && r.rows) || [];
}
const etiket = (r: Row) => (r.tur === "PEM" ? "PEM " + r.no : r.no);
const sekilTxt = (r: Row) => r.sekil === "Uçak" ? (r.ucak_onay ? "Uçak" : "Uçak (MK onayı bekliyor)") : (r.sekil || "");
// MY-KESIN-VURGU: sevke hazır = PEM durum 3 / PRJ durum 8 (my_acil.js shz ile aynı)
const shz = (r: Row) => { const m = String(r.durum_erp || "").match(/^\s*(\d+)/); const n = m ? Number(m[1]) : -1; return r.tur === "PEM" ? n === 3 : n === 8; };
// MY-OE-ENGEL: OE notunun anlamı sunucuda okunur (edge my-oe-engel); görev askıdaysa (g_tip MO) neden yazılmış sayılır (my_acil.js kesOE ile aynı)
const kesinEksik = (rows: Row[]) => rows.filter((r) => shz(r) && !r.kesin && (r as unknown as { g_tip?: string }).g_tip !== "MO");
const kesinTxt = (r: Row) => r.kesin ? fd(r.kesin) : (shz(r) ? "GİRİLMEDİ (sevke hazır)" : "");
function kesinVurgu(rows: Row[]) {
  const e = kesinEksik(rows);
  const istek = "Sevke hazır olan satırlarda Kesinleşen Yükleme Tarihi'ni girmenizi; giremiyorsanız nedenini Açıklama sütununa yazmanızı rica ederim.";
  if (!e.length) return { html: `<p><b>${esc(istek)}</b></p>`, text: istek };
  const lst = e.map(etiket).join(", ");
  return {
    html: `<p style="background:#fde4e4;border-left:4px solid #b23a2e;padding:6px 10px"><b>Sevke hazır olup Kesinleşen Yükleme Tarihi girilmemiş ve Açıklama'da nedeni yazılmamış: ${esc(lst)}.</b><br><b>Bu satırlar için Kesinleşen Yükleme Tarihi'ni girmenizi; giremiyorsanız nedenini Açıklama sütununa yazmanızı rica ederim.</b></p>`,
    text: `SEVKE HAZIR OLUP KESİNLEŞEN YÜKLEME TARİHİ GİRİLMEMİŞ VE AÇIKLAMADA NEDENİ YAZILMAMIŞ: ${lst}.\nBu satırlar için Kesinleşen Yükleme Tarihi'ni girmenizi; giremiyorsanız nedenini Açıklama sütununa yazmanızı rica ederim.`,
  };
}
const th = (s: string) => `<th style="border:1px solid #cdd6df;padding:4px 8px;background:#16324f;color:#fff;text-align:left">${s}</th>`;
const td = (s: string) => `<td style="border:1px solid #cdd6df;padding:4px 8px;vertical-align:top;background:#fde4ec">${esc(s)}</td>`;
function tablo(rows: Row[]) {
  return `<table style="border-collapse:collapse;font-size:13px;margin:6px 0 14px"><tr>${["No", "Proje", "Adet", "AÜP / Termin", "Hedef Yükleme", "Kesinleşen Yükleme", "Yükleme Şekli", "Açıklama"].map(th).join("")}</tr>` +
    rows.map((r) => `<tr>${[etiket(r), r.proje, r.adet, fd(r.tarih), fd(r.hedef), kesinTxt(r), sekilTxt(r), r.aciklama || ""].map(td).join("")}</tr>`).join("") + "</table>";
}
const satirTxt = (r: Row) => `- ${etiket(r)} · ${r.proje} · ${r.adet || "-"} ad · hedef ${fd(r.hedef)}${kesinTxt(r) ? " · kesin " + kesinTxt(r) : ""} · ${sekilTxt(r)}${r.aciklama ? " · " + r.aciklama : ""}`;

// Acil bildirimi (OE mail + MB WhatsApp) — form "acil" ve onaylanan şantiye talebi ortak
async function acilBildir(tur: string, no: string) {
  const tk = await rest(`my_takip?select=*&tur=eq.${encodeURIComponent(tur)}&no=eq.${encodeURIComponent(no)}`);
  const t = tk && tk[0];
  if (!t) return { mail: "kayıt yok" };
  if (t.durum !== "Acil") return { mail: "satır acil değil" };
  const oe = await kisi("OE");
  if (!oe?.email) return { mail: "OE e-postası yok" };
  const ilk = String(oe.tam_ad || "Onur").split(/\s+/)[0];
  const lbl = tur === "PEM" ? "PEM " + no : "Proje " + no;
  const rows = await satirlar();
  const r = rows.find((x) => x.tur === tur && x.no === no) || ({ tur, no, proje: t.proje_adi || "", adet: "", tarih: "", hedef: t.hedef_yukleme, sekil: t.yukleme_sekli, ucak_onay: t.ucak_onay, aciklama: t.aciklama } as Row);
  const subject = `ACİL yükleme: ${lbl}${r.proje ? " · " + r.proje : ""}`;
  const text = `${ilk} Bey,\n\nAşağıdaki satırın acil takibini ve ${fd(r.hedef)} tarihinde ${sekilTxt(r).toLowerCase()} ile yüklenmesini rica ederim.\n\n${satirTxt(r)}\n\n${kesinVurgu([r]).text}\n\nMelih Bilgili`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p>Aşağıdaki satırın acil takibini ve hedef tarihte yüklenmesini rica ederim.</p>${tablo([r])}${kesinVurgu([r]).html}<p><a href="${FORM}onur/">OE Faaliyet formu</a></p><p>Melih Bilgili</p></div>`;
  const m = await mail(oe.email, subject, html, text);
  const w = await wa(`*ACİL yükleme (MY)*\n${satirTxt(r)}`);
  return { mail: m, wa: w };
}
const SANTIYE_YOL = (kod: string) => FORM + "santiye-" + kod.replace(/_/g, "-") + "/";
const talepTxt = (r: Row) => `- ${etiket(r)} · ${r.proje} · ${r.talep}${r.talep === "Acil" ? " · hedef " + fd(r.talep_hedef) + " · " + (r.talep_sekil || "") : ""}${r.talep_aciklama ? " · " + r.talep_aciklama : ""} (${r.talep_kisi || ""})`;
function talepTablo(rows: Row[]) {
  return `<table style="border-collapse:collapse;font-size:13px;margin:6px 0 14px"><tr>${["No", "Proje", "Talep", "Hedef Yükleme", "Yükleme Şekli", "Açıklama", "Talep Eden"].map(th).join("")}</tr>` +
    rows.map((r) => `<tr>${[etiket(r), r.proje, r.talep || "", fd(r.talep_hedef), r.talep_sekil || "", r.talep_aciklama || "", r.talep_kisi || ""].map(td).join("")}</tr>`).join("") + "</table>";
}

async function kullaniciDogrula(req: Request): Promise<string> {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return "";
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${t}` } });
  if (!r.ok) return "";
  const u = await r.json();
  return String(u.email || "").toLowerCase();
}

// Çağıran service_role mü? (yeni sb_secret anahtarları JWT değildir → anahtarla RLS'li sistem_anahtar okunabiliyorsa servis)
async function servisMi(req: Request): Promise<boolean> {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || req.headers.get("apikey") || "";
  if (!t) return false;
  if (SRK && t === SRK) return true;
  try {
    const r = await fetch(`${SB}/rest/v1/sistem_anahtar?select=ad&limit=1`, { headers: { apikey: t, Authorization: `Bearer ${t}` } });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j) && j.length > 0;
  } catch (_e) { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch (_e) { b = {}; }
  const islem = String(b.islem || "");
  try {
    // WA-WHAPI test: service key ile tek WhatsApp mesajı
    if (islem === "wa_test") {
      if (!(await servisMi(req))) return json({ ok: false, hata: "yetki yok" }, 401);
      return json({ ok: true, wa: await wa(String(b.text || "Test")) });
    }
    if (islem === "iptal" || islem === "acil") {
      const em = await kullaniciDogrula(req);
      // MY-DURUM-MK-OE (10.11.2026): acil bildirimini MK ve OE de tetikleyebilir; iptal yalnız MY/MB
      const izin = islem === "acil" ? ["my.form@arbor.com.tr", "int@arbor.com.tr", "mk.form@arbor.com.tr", "onur.form@arbor.com.tr"] : ["my.form@arbor.com.tr", "int@arbor.com.tr"];
      if (!izin.includes(em)) return json({ ok: false, hata: "yetki yok" }, 401);
      const kaynak = em === "mk.form@arbor.com.tr" ? "MK" : em === "onur.form@arbor.com.tr" ? "OE" : em === "int@arbor.com.tr" ? "MB" : "MY";
      const tur = String(b.tur || ""), no = String(b.no || "");
      const tk = await rest(`my_takip?select=*&tur=eq.${encodeURIComponent(tur)}&no=eq.${encodeURIComponent(no)}`);
      const t = tk && tk[0];
      if (!t) return json({ ok: false, hata: "kayıt yok" }, 404);
      const oe = await kisi("OE");
      if (!oe?.email) return json({ ok: false, hata: "OE e-postası yok" }, 500);
      const ilk = String(oe.tam_ad || "Onur").split(/\s+/)[0];
      const lbl = tur === "PEM" ? "PEM " + no : "Proje " + no;
      if (islem === "iptal") {
        if (t.durum !== "İptal") return json({ ok: false, hata: "satır iptal değil" }, 409);
        const ad = String(b.proje || t.proje_adi || "");
        const subject = `İptal: ${lbl}${ad ? " · " + ad : ""}`;
        const text = `${ilk} Bey,\n\n${lbl}${ad ? " (" + ad + ")" : ""} kaydının ERP'de iptal edilmesini rica ederim.\n\nMelih Bilgili`;
        const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p><b>${esc(lbl)}</b>${ad ? " (" + esc(ad) + ")" : ""} kaydının ERP'de iptal edilmesini rica ederim.</p><p>Melih Bilgili</p></div>`;
        return json({ ok: true, mail: await mail(oe.email, subject, html, text) });
      }
      if (t.durum !== "Acil") return json({ ok: false, hata: "satır acil değil" }, 409);
      const rows = await satirlar();
      const r = rows.find((x) => x.tur === tur && x.no === no) || ({ tur, no, proje: t.proje_adi || "", adet: "", tarih: "", hedef: t.hedef_yukleme, sekil: t.yukleme_sekli, ucak_onay: t.ucak_onay, aciklama: t.aciklama } as Row);
      const subject = `ACİL yükleme: ${lbl}${r.proje ? " · " + r.proje : ""}`;
      const text = `${ilk} Bey,\n\nAşağıdaki satırın acil takibini ve ${fd(r.hedef)} tarihinde ${sekilTxt(r).toLowerCase()} ile yüklenmesini rica ederim.\n\n${satirTxt(r)}\n\n${kesinVurgu([r]).text}\n\nMelih Bilgili`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p>Aşağıdaki satırın acil takibini ve hedef tarihte yüklenmesini rica ederim.</p>${tablo([r])}${kesinVurgu([r]).html}<p><a href="${FORM}onur/">OE Faaliyet formu</a></p><p>Melih Bilgili</p></div>`;
      const m = kaynak === "OE" ? "OE kendisi" : await mail(oe.email, subject, html, text);
      const w = await wa(`*ACİL yükleme (${kaynak})*\n${satirTxt(r)}`);
      return json({ ok: true, mail: m, wa: w });
    }

    // MY-SANTIYE: şantiye formundan Acil/Normal talebi → MY'ye mail
    if (islem === "santiye_talep") {
      const em = await kullaniciDogrula(req);
      const sf = await rest(`santiye_form?select=kod,rol_email,kisi_kod`);
      // deno-lint-ignore no-explicit-any
      if (!(em === "int@arbor.com.tr" || (sf || []).some((f: any) => String(f.rol_email).toLowerCase() === em))) return json({ ok: false, hata: "yetki yok" }, 401);
      const tur = String(b.tur || ""), no = String(b.no || "");
      const rows = await satirlar();
      const r = rows.find((x) => x.tur === tur && x.no === no);
      if (!r || !r.talep) return json({ ok: false, hata: "bekleyen talep yok" }, 409);
      const my = await kisi("MY"); const ilk = String(my?.tam_ad || "Muhammer").split(/\s+/)[0];
      const subject = `Şantiye talebi (${r.talep}): ${etiket(r)} · ${r.proje}`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p>Aşağıdaki şantiye talebinin MY Faaliyet formunda onaylanmasını ya da reddedilmesini rica ederim.</p>${talepTablo([r])}<p><a href="${FORM}my-faaliyet/">MY Faaliyet formu</a></p><p>Melih Bilgili</p></div>`;
      const text = `${ilk} Bey,\n\nAşağıdaki şantiye talebinin MY Faaliyet formunda onaylanmasını ya da reddedilmesini rica ederim.\n\n${talepTxt(r)}\n\nMelih Bilgili`;
      return json({ ok: true, mail: await mail(my?.email || "int@arbor.com.tr", subject, html, text) });
    }
    // MY-SANTIYE: MY'nin kararı → şantiye sorumlusuna mail; onaylanan Acil → OE + WA
    if (islem === "talep_karar") {
      const em = await kullaniciDogrula(req);
      if (!["my.form@arbor.com.tr", "int@arbor.com.tr"].includes(em)) return json({ ok: false, hata: "yetki yok" }, 401);
      const tur = String(b.tur || ""), no = String(b.no || "");
      const lg = await rest(`my_takip_log?select=detay,at&tur=eq.${encodeURIComponent(tur)}&no=eq.${encodeURIComponent(no)}&olay=eq.${encodeURIComponent("Şantiye talebi")}&detay->>onay=not.is.null&order=at.desc&limit=1`);
      const d = lg && lg[0] && lg[0].detay;
      if (!d) return json({ ok: false, hata: "karar kaydı yok" }, 404);
      const tk = await rest(`my_takip?select=proje_adi&tur=eq.${encodeURIComponent(tur)}&no=eq.${encodeURIComponent(no)}`);
      const proje = (tk && tk[0] && tk[0].proje_adi) || "";
      const sf = await rest(`santiye_form?select=kod,kisi_kod&kod=eq.${encodeURIComponent(d.form || "")}`);
      const kk = (sf && sf[0] && sf[0].kisi_kod) || d.kisi;
      const sk = kk ? await kisi(kk) : null;
      const lbl = tur === "PEM" ? "PEM " + no : no;
      const sonucTxt = d.onay ? "onaylandı" : "onaylanmadı";
      let m = "şantiye e-postası yok";
      if (sk?.email) {
        const ilk = String(sk.tam_ad || kk).split(/\s+/)[0];
        const hanim = ["MKB", "FA", "ÖB", "DK"].includes(kk) ? "Hanım" : "Bey";
        const subject = `Talebiniz ${sonucTxt}: ${lbl}${proje ? " · " + proje : ""} (${d.durum})`;
        const det = d.durum === "Acil" ? ` (hedef ${fd(d.hedef)}, ${d.sekil || ""})` : "";
        const text = `${ilk} ${hanim},\n\n${lbl}${proje ? " · " + proje : ""} için ${d.durum}${det} talebiniz MY tarafından ${sonucTxt}.\n\nMelih Bilgili`;
        const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} ${hanim},</p><p><b>${esc(lbl)}</b>${proje ? " · " + esc(proje) : ""} için ${esc(d.durum)}${esc(det)} talebiniz MY tarafından <b>${sonucTxt}</b>.</p>${d.form ? `<p><a href="${SANTIYE_YOL(String(d.form))}">Şantiye formu</a></p>` : ""}<p>Melih Bilgili</p></div>`;
        m = await mail(sk.email, subject, html, text);
      }
      const ac = (d.onay && d.durum === "Acil") ? await acilBildir(tur, no) : null;
      return json({ ok: true, mail: m, acil: ac });
    }

    // MY-PEM-PASIF: ERP çekiminin 7. adımı (erp_cekim_gorevi.py) — service key ile çağrılır.
    // Sebep "Ofis Sandığına Eklenen PMS Girdisi", Talep Açan Buse Sevinç (MY-PEM-PASIF-BUSE) ya da Talep Açıklaması "Bilgi talebidir" olan, durumu ≤3 yurt dışı PEM'ler
    // MY Faaliyet'e alınmaz; ERP'de hâlâ aktif oldukları EU'ya bildirilir. ERP damgası başına bir kez (force:true ile yeniden).
    if (islem === "pasif_pem") {
      if (!(await servisMi(req))) return json({ ok: false, hata: "yetki yok" }, 401);
      const onizleme = b.onizleme === true || b.onizleme === "true";
      const force = b.force === true || b.force === "true";
      const kisalt = (s: unknown, n: number) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
      const tdd = (s: string) => `<td style="border:1px solid #cdd6df;padding:3px 7px;vertical-align:top">${esc(s)}</td>`;
      const bas = ["PEM", "Proje", "Durum", "Sebep", "Talep Açan", "Talep Açıklaması", "Termin"];
      // Tek liste için: ERP damgası başına bir kez mail (log my_takip_mail_log.tur = <onek>:<damga>)
      const gonder = async (rpc: string, onek: string, kod: string, varsayilanAd: string, giris: (n: number, damga: string) => string, konu: (n: number, damga: string) => string) => {
        const d = await rest(`rpc/${rpc}`, { method: "POST", body: "{}" });
        const rows = (d && d.rows) || [];
        const damga = String(d?.damga || "");
        const tur = onek + ":" + damga;
        if (!rows.length) return { adet: 0, mail: "liste boş" };
        if (!onizleme && !force) {
          const var_ = await rest(`my_takip_mail_log?select=id&tur=eq.${encodeURIComponent(tur)}`);
          if (var_ && var_.length) return { adet: rows.length, mail: "bu çekim için gönderildi" };
        }
        const k = await kisi(kod); const ilk = String(k?.tam_ad || varsayilanAd).split(/\s+/)[0];
        // deno-lint-ignore no-explicit-any
        const sat = rows.map((r: any) => [String(r.no), r.proje || "", r.durum || "", r.sebep || "", r.talep_acan || "", kisalt(r.talep_aciklamasi, 90), fd(r.termin)]);
        const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p>${esc(giris(rows.length, damga))}</p>` +
          `<table style="border-collapse:collapse;font-size:12px"><tr>${bas.map(th).join("")}</tr>${sat.map((x: string[]) => `<tr>${x.map(tdd).join("")}</tr>`).join("")}</table><p>Melih Bilgili</p></div>`;
        const text = `${ilk} Bey,\n\n${giris(rows.length, damga)}\n\n` + sat.map((x: string[]) => "- " + x.join(" · ")).join("\n") + "\n\nMelih Bilgili";
        const subject = (onizleme ? `[Önizleme → ${kod}] ` : "") + konu(rows.length, damga);
        const m = await mail(onizleme ? "int@arbor.com.tr" : (k?.email || "int@arbor.com.tr"), subject, html, text);
        if (!onizleme && m === "ok") {
          await fetch(`${SB}/rest/v1/my_takip_mail_log`, { method: "POST", headers: { ...H, Prefer: "return=minimal,resolution=ignore-duplicates" }, body: JSON.stringify({ gun: bugun(), tur, ozet: { adet: rows.length } }) });
        }
        return { adet: rows.length, mail: m };
      };
      // MY-PEM-PASIF → EU
      const eu = await gonder("_my_pasif_pem", "pasif", "EU", "Enes",
        (n, dm) => `Sebebi "Ofis Sandığına Eklenen PMS Girdisi", talep açanı Buse Sevinç ya da talep açıklaması "Bilgi talebidir" olan aşağıdaki ${n} yurt dışı PEM, ERP'de hâlâ aktif görünmektedir (ERP çekimi ${dm}). ERP'de kapatılmalarını rica ederim.`,
        (n, dm) => `ERP'de hâlâ aktif PEM'ler (${n}) · ERP ${dm}`);
      // MY-PEM-YD14 → MK
      const mk = await gonder("_my_yd14_pem", "yd14", "MK", "Mehmet",
        (n, dm) => `Durumu "1.4 Yurtdışı Sipariş Verildi" olan aşağıdaki ${n} yurt dışı PEM, MY Faaliyet takibine alınmamaktadır (ERP çekimi ${dm}). Takibini rica ederim.`,
        (n, dm) => `1.4 Yurtdışı sipariş verilen PEM'ler (${n}) · ERP ${dm}`);
      return json({ ok: eu.mail !== "" && !String(eu.mail).startsWith("hata") && !String(mk.mail).startsWith("hata"), onizleme, eu, mk, adet: eu.adet, mail: `EU ${eu.mail} (${eu.adet}) · MK ${mk.mail} (${mk.adet})` });
    }

    if (islem === "gunluk") {
      const key = req.headers.get("x-my-key") || "";
      if (!key || key !== await anahtar("my_takip")) return json({ ok: false, hata: "yetki yok" }, 401);
      const onizleme = b.onizleme === true || b.onizleme === "true";
      const gun = String(b.gun || bugun());
      const rows = await satirlar();
      const acil = rows.filter((r) => r.durum === "Acil");
      const bekleyen = acil.filter((r) => r.sekil === "Uçak" && !r.ucak_onay);
      const sonuc: Record<string, unknown> = { gun, acil: acil.length, ucak_bekleyen: bekleyen.length };
      const logla = async (tur: string) => {
        if (onizleme) return true;
        const r = await fetch(`${SB}/rest/v1/my_takip_mail_log`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ gun, tur }) });
        return r.ok; // 409 = bugün gönderildi
      };
      // 1) Acil: MY-GUNLUK-OE-YOK (13.11.2026) OE'ye günlük mail yok; MY-GUNLUK-WA-YOK (18.11.2026, Melih) MB'ye 08:00 WhatsApp yok — yalnız önizlemede int@'e mail.
      if (acil.length && (isGunu(gun) || onizleme)) {
        if (await logla("acil")) {
          const oe = await kisi("OE"); const ilk = String(oe?.tam_ad || "Onur").split(/\s+/)[0];
          const subject = (onizleme ? "[Önizleme → OE] " : "") + `ACİL yüklemeler (${acil.length}) · ${fd(gun)}`;
          const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p>Aşağıdaki satırların acil takibini ve hedef tarihlerde yüklenmesini rica ederim.</p>${kesinVurgu(acil).html}${tablo(acil)}<p><a href="${FORM}onur/">OE Faaliyet formu</a></p><p>Melih Bilgili</p></div>`;
          const text = `${ilk} Bey,\n\nAşağıdaki satırların acil takibini ve hedef tarihlerde yüklenmesini rica ederim.\n\n${kesinVurgu(acil).text}\n\n${acil.map(satirTxt).join("\n")}\n\nMelih Bilgili`;
          sonuc.oe = onizleme ? await mail("int@arbor.com.tr", subject, html, text) : "kapalı (MY-GUNLUK-OE-YOK)";
          sonuc.wa = onizleme ? "önizleme" : "kapalı (MY-GUNLUK-WA-YOK)";
        } else sonuc.oe = "bugün gönderildi";
      } else sonuc.oe = acil.length ? "iş günü değil" : "acil yok";
      // 2) MK: onay bekleyen uçak yüklemeleri — her gün
      if (bekleyen.length) {
        if (await logla("mk")) {
          const mk = await kisi("MK"); const ilk = String(mk?.tam_ad || "Mehmet").split(/\s+/)[0];
          const subject = (onizleme ? "[Önizleme → MK] " : "") + `Uçak yüklemesi onayı bekleniyor (${bekleyen.length}) · ${fd(gun)}`;
          const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p>Aşağıdaki uçak yüklemelerinin MK Faaliyet formunda onaylanmasını rica ederim.</p>${tablo(bekleyen)}<p><a href="${FORM}mk-prim/">MK Faaliyet formu</a></p><p>Melih Bilgili</p></div>`;
          const text = `${ilk} Bey,\n\nAşağıdaki uçak yüklemelerinin MK Faaliyet formunda onaylanmasını rica ederim.\n\n${bekleyen.map(satirTxt).join("\n")}\n\nMelih Bilgili`;
          sonuc.mk = await mail(onizleme ? "int@arbor.com.tr" : (mk?.email || "int@arbor.com.tr"), subject, html, text);
        } else sonuc.mk = "bugün gönderildi";
      } else sonuc.mk = "bekleyen yok";
      // 3) MY: onay bekleyen şantiye talepleri — her gün (MY-SANTIYE)
      const tlp = rows.filter((r) => !!r.talep);
      sonuc.talep_bekleyen = tlp.length;
      if (tlp.length) {
        if (await logla("mytalep")) {
          const my = await kisi("MY"); const ilk = String(my?.tam_ad || "Muhammer").split(/\s+/)[0];
          const subject = (onizleme ? "[Önizleme → MY] " : "") + `Şantiye talepleri onay bekliyor (${tlp.length}) · ${fd(gun)}`;
          const html = `<div style="font-family:Arial,sans-serif;font-size:13px"><p>${esc(ilk)} Bey,</p><p>Aşağıdaki şantiye taleplerinin MY Faaliyet formunda onaylanmasını ya da reddedilmesini rica ederim.</p>${talepTablo(tlp)}<p><a href="${FORM}my-faaliyet/">MY Faaliyet formu</a></p><p>Melih Bilgili</p></div>`;
          const text = `${ilk} Bey,\n\nAşağıdaki şantiye taleplerinin MY Faaliyet formunda onaylanmasını ya da reddedilmesini rica ederim.\n\n${tlp.map(talepTxt).join("\n")}\n\nMelih Bilgili`;
          sonuc.my = await mail(onizleme ? "int@arbor.com.tr" : (my?.email || "int@arbor.com.tr"), subject, html, text);
        } else sonuc.my = "bugün gönderildi";
      } else sonuc.my = "bekleyen yok";
      if (!onizleme) { try { await rest(`my_takip_mail_log?gun=eq.${gun}&tur=in.(acil,mk,mytalep)`, { method: "PATCH", body: JSON.stringify({ ozet: sonuc }) }); } catch (_e) { /* yut */ } }
      return json({ ok: true, onizleme, ...sonuc });
    }
    return json({ ok: false, hata: "islem?" }, 400);
  } catch (e) {
    return json({ ok: false, hata: String(e) }, 500);
  }
});
