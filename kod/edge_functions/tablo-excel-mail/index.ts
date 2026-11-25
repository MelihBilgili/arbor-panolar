// tablo-excel-mail (EXCEL-MAIL, 06.10.2026)
// Pano/form tablolarindaki "Excel" dugmesi: istemci tabloyu xlsx'e cevirir (base64) ve buraya yollar.
// Fonksiyon dosyayi ozel 'excel-mail' kovasina koyar, 7 gunluk imzali URL uretir ve
// Zapier "arbor-mail-gonder" hattiyla (int@arbor.com.tr Outlook) KULLANICININ KENDISINE ek olarak yollar.
// Alici: JWT int@arbor.com.tr ise int@arbor.com.tr; rol hesabi (*.form@) ise istemcinin bildirdigi kisi kodu
// form_erisim'de o forma ve o rol hesabina bagliysa kisiler.email (MB → int@). Baska adrese gonderilemez.
// Govde: { b64, dosya, baslik, sayfa, form?, kisi? }
import { createClient } from "npm:@supabase/supabase-js@2";

const HOOK = Deno.env.get("ARBOR_MAIL_HOOK") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MB_MAIL = "int@arbor.com.tr";
const KOVA = "excel-mail";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function jwtEmail(req: Request): string | null {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const p = t.split(".");
  if (p.length !== 3) return null;
  try {
    const j = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/")));
    const e = typeof j.email === "string" ? j.email.toLowerCase() : "";
    return e.endsWith("@arbor.com.tr") ? e : null;
  } catch (_e) { return null; }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // ARB_OK: verify_jwt=true imzayi dogrular; burada @arbor.com.tr e-postasi sart
  const em = jwtEmail(req);
  if (!em) return J({ ok: false, hata: "Yetkisiz oturum. Sayfayı yenileyip tekrar deneyiniz." }, 401);
  if (!HOOK) return J({ ok: false, hata: "Mail hattı tanımsız (ARBOR_MAIL_HOOK)." }, 500);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const b = await req.json();
    const b64 = String(b.b64 || "");
    if (!b64 || b64.length > 13_000_000) return J({ ok: false, hata: "Dosya boş ya da çok büyük." }, 400);
    const baslik = String(b.baslik || "Tablo").slice(0, 120);
    const sayfa = String(b.sayfa || "Arbor").slice(0, 120);
    let dosya = String(b.dosya || "tablo.xlsx").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 120);
    if (!/\.xlsx$/i.test(dosya)) dosya += ".xlsx";

    // --- alici
    let to = "";
    if (em === MB_MAIL) to = MB_MAIL;
    else {
      let form = String(b.form || "").trim().toLowerCase();
      if (form && !form.endsWith("/")) form += "/";
      const kisi = String(b.kisi || "").trim();
      if (!form || !kisi) return J({ ok: false, hata: "Kullanıcı bilgisi bulunamadı. Forma yeniden kodla giriş yapınız." }, 400);
      const { data: fe } = await sb.from("form_erisim").select("kisiler,herkes,rol_map,varsayilan_rol").eq("yol", form).maybeSingle();
      if (!fe) return J({ ok: false, hata: "Form tanımlı değil." }, 400);
      const izinli = kisi === "MB" || fe.herkes === true || (fe.kisiler || []).includes(kisi);
      const rol = String((fe.rol_map || {})[kisi] || fe.varsayilan_rol || "").toLowerCase();
      if (!izinli || rol !== em) return J({ ok: false, hata: "Kullanıcı bu oturumla eşleşmedi. Forma yeniden kodla giriş yapınız." }, 403);
      if (kisi === "MB") to = MB_MAIL;
      else {
        const { data: k } = await sb.from("kisiler").select("email,aktif").eq("kod", kisi).maybeSingle();
        if (!k || k.aktif === false || !k.email) return J({ ok: false, hata: "Kayıtlı e-posta adresiniz yok." }, 400);
        to = String(k.email).trim();
      }
    }

    // --- dosya → ozel kova → imzali URL
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const anahtar = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.xlsx`;
    const up = await sb.storage.from(KOVA).upload(anahtar, bin, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false,
    });
    if (up.error) return J({ ok: false, hata: "Dosya yüklenemedi: " + up.error.message }, 500);
    const sg = await sb.storage.from(KOVA).createSignedUrl(anahtar, 7 * 86400, { download: dosya });
    if (sg.error || !sg.data?.signedUrl) return J({ ok: false, hata: "Bağlantı üretilemedi." }, 500);

    // --- mail (int@ Outlook, Zapier)
    const zm = new Date(Date.now() + 3 * 3600e3).toISOString();
    const tr = `${zm.slice(8, 10)}.${zm.slice(5, 7)}.${zm.slice(0, 4)} ${zm.slice(11, 16)}`;
    const html = `<p>${esc(sayfa)} › ${esc(baslik)} tablosunun Excel hali ektedir (${tr}).</p><p>Melih Bilgili</p>`;
    const r = await fetch(HOOK, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: [to], subject: `Excel: ${sayfa} › ${baslik}`, html, file: [sg.data.signedUrl] }),
    });
    if (!r.ok) return J({ ok: false, hata: `Mail hattı ${r.status}` }, 502);

    // --- 3 gunden eski dosyalari temizle (en eski 100)
    try {
      const { data: ls } = await sb.storage.from(KOVA).list("", { limit: 100, sortBy: { column: "created_at", order: "asc" } });
      const eski = (ls || []).filter((o) => o.created_at && Date.parse(o.created_at) < Date.now() - 3 * 86400e3).map((o) => o.name);
      if (eski.length) await sb.storage.from(KOVA).remove(eski);
    } catch (_e) { /* temizlik hatasi gonderimi etkilemez */ }

    return J({ ok: true, to });
  } catch (e) {
    return J({ ok: false, hata: String(e) }, 500);
  }
});
