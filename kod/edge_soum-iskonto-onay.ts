// soum-iskonto-onay (SOUM-ISK-ONAY, 24.11.2026, Melih)
// Teklif Hazırlama'da standart dışı (elle) iskonto çarpanı yönetim onayına bağlı.
//  islem "talep" (teklif.form@ / int@): soum_iskonto_onay'a satır + Melih'e WhatsApp (Whapi, sistem_anahtar 'wa_whapi').
//                 onceki_id aynı kişinin bekleyen talebiyse iptal edilir.
//  islem "iptal" (teklif.form@ / int@): bekleyen talep iptal (kullanıcı "Hesaplanan İskontoya Dön" dedi).
//  islem "goruldu" (teklif.form@ / int@): kullanıcının formu kararı gördü.
//  islem "karar" (yalnız int@; app Giriş › İskonto Onayı Ver): karar "onaylandi" | "yeni" (+ carpan) → kayıt + talep edene bilgi maili
//                 (ARBOR_MAIL_HOOK, int@ Outlook; adres kisiler tablosundan).
// SOUM-FIYAT-ONAY (24.11.2026, Melih, v2): talep "degisiklikler" (fiyatı düşüren elle değişiklik satırları) da taşır; WA ve mailde listelenir.
const SB = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const HOOK = Deno.env.get("ARBOR_MAIL_HOOK") || "";
const H: Record<string, string> = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const IZIN = ["teklif.form@arbor.com.tr", "int@arbor.com.tr"];
// Arbor mail hitabı (<Ad> Bey / <Ad> Hanım); listede olmayan kişide hitap yazılmaz
const HITAP: Record<string, string> = { AN: "Ayşe Hanım", AYO: "Ayşenur Hanım", MKB: "Melike Hanım", OBL: "Orhan Bey", OKA: "Okan Bey", FY: "Fatma Hanım", MN: "Mustafa Bey", MK: "Mehmet Bey" };

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
    const a = await rest(`sistem_anahtar?select=deger&ad=eq.wa_whapi`);
    const k = JSON.parse((a && a[0] && a[0].deger) || "{}");
    if (!k.token || !k.to) return "wa anahtarı yok";
    const r = await fetch("https://gate.whapi.cloud/messages/text", { method: "POST", headers: { Authorization: `Bearer ${k.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: k.to, body: text }) });
    const t = await r.text();
    return r.ok && /"sent"\s*:\s*true/.test(t) ? "ok" : `wa ${r.status} ${t.slice(0, 160)}`;
  } catch (e) { return "wa " + String(e); }
}
const sayi = (v: unknown) => { if (typeof v === "number") return isFinite(v) ? v : null; const s = String(v ?? "").trim(); const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return isFinite(n) ? n : null; };
const tr = (n: number | null, d = 2) => n == null ? "–" : n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const ck = (n: number | null) => n == null ? "–" : String(+n.toFixed(6)).replace(".", ","); // çarpan
const yz = (n: number | null) => n == null ? "" : ` (iskonto %${tr(Math.round((1 - n) * 1000) / 10, 1).replace(/,0$/, "")})`;
const tarih = () => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit" }).format(new Date()).replace("/", ".");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
const s200 = (v: unknown, n = 200) => v == null ? null : String(v).slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch (_e) { b = {}; }
  const islem = String(b.islem || "");
  try {
    const em = await kullanici(req);
    if (!IZIN.includes(em)) return json({ ok: false, hata: "yetki yok" }, 401);
    if (islem === "talep") {
      const talep = sayi(b.talep), hes = sayi(b.hesaplanan);
      if (!talep || talep <= 0 || talep > 2) return json({ ok: false, hata: "Geçersiz iskonto çarpanı." }, 400);
      const kod = String(b.kisi_kod || (em === "int@arbor.com.tr" ? "MB" : "")).slice(0, 10);
      const aciklama = String(b.aciklama || "").trim().slice(0, 2000);
      if (!aciklama) return json({ ok: false, hata: "Açıklama zorunludur." }, 400);
      const onc = +String(b.onceki_id || 0);
      if (onc) await rest(`soum_iskonto_onay?id=eq.${onc}&durum=eq.bekliyor&kisi_kod=eq.${encodeURIComponent(kod)}`, { method: "PATCH", body: JSON.stringify({ durum: "iptal", karar_at: new Date().toISOString() }) });
      const pb = String(b.para_birimi || "EUR") === "GBP" ? "GBP" : "EUR";
      const ins = await rest("soum_iskonto_onay", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        kisi_kod: kod, kisi_ad: s200(b.kisi_ad), olusturan_email: em, proje: s200(b.proje), firma: s200(b.firma), ilgili: s200(b.ilgili), ref: s200(b.ref, 60),
        yd_satir_id: +String(b.yd_satir_id || 0) || null, para_birimi: pb, kur: sayi(b.kur), brut: sayi(b.brut), hesaplanan: hes, talep, toplam: sayi(b.toplam), aciklama,
        degisiklikler: (Array.isArray(b.degisiklikler) ? b.degisiklikler : []).map((x) => String(x).slice(0, 200)).slice(0, 60) }) });
      const r = ins && ins[0];
      const sym = pb === "GBP" ? "£" : "€";
      const L = [
        `*İskonto onay talebi* · ${tarih()} · ${r.kisi_ad || kod || "?"}`,
        `Proje: ${r.proje || "–"}${r.ref ? " · Ref " + r.ref : ""}`,
        `Müşteri: ${r.firma || "–"}`,
        `Brüt (Pencad): ${tr(sayi(r.brut))} €`,
        `Hesaplanan çarpan: ${ck(hes)}${yz(hes)}`,
        `Talep edilen: ${ck(talep)}${yz(talep)}`,
        `Teklif toplamı (talep ile): ${tr(sayi(r.toplam))} ${sym}`,
        `Açıklama: ${aciklama}`,
      ];
      const DG = (Array.isArray(r.degisiklikler) ? r.degisiklikler : []) as string[];
      if (DG.length) { L.splice(L.length - 1, 0, "Fiyat değişiklikleri:"); DG.forEach((x, j) => L.splice(L.length - 1, 0, "– " + x)); }
      if (hes != null && Math.abs(talep - hes) < 1e-9) L[0] = L[0].replace("İskonto onay talebi", "Fiyat onay talebi");
      const w = await wa(L.join("\n"));
      await rest(`soum_iskonto_onay?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ wa_durum: w }) });
      return json({ ok: true, id: r.id, wa: w });
    }
    if (islem === "iptal") {
      const id = +String(b.id || 0); if (!id) return json({ ok: false, hata: "id?" }, 400);
      await rest(`soum_iskonto_onay?id=eq.${id}&durum=eq.bekliyor`, { method: "PATCH", body: JSON.stringify({ durum: "iptal", karar_at: new Date().toISOString() }) });
      return json({ ok: true });
    }
    if (islem === "goruldu") {
      const id = +String(b.id || 0); if (!id) return json({ ok: false, hata: "id?" }, 400);
      await rest(`soum_iskonto_onay?id=eq.${id}&durum=in.(onaylandi,yeni)`, { method: "PATCH", body: JSON.stringify({ goruldu: true, goruldu_at: new Date().toISOString() }) });
      return json({ ok: true });
    }
    if (islem === "karar") {
      if (em !== "int@arbor.com.tr") return json({ ok: false, hata: "yetki yok" }, 401);
      const id = +String(b.id || 0), karar = String(b.karar || "");
      if (!id || !["onaylandi", "yeni"].includes(karar)) return json({ ok: false, hata: "eksik veri" }, 400);
      const c = karar === "yeni" ? sayi(b.carpan) : null;
      if (karar === "yeni" && (!c || c <= 0 || c > 2)) return json({ ok: false, hata: "Geçersiz iskonto çarpanı." }, 400);
      const up = await rest(`soum_iskonto_onay?id=eq.${id}&durum=eq.bekliyor`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ durum: karar, onay_carpan: karar === "yeni" ? c : null, karar_at: new Date().toISOString() }) });
      const r = up && up[0];
      if (!r) return json({ ok: false, hata: "Talep bekleyen durumda değil (iptal edilmiş ya da karar verilmiş olabilir)." }, 409);
      // bilgi maili
      let md = "";
      try {
        if (!HOOK) md = "mail hattı tanımsız";
        else {
          const k = await rest(`kisiler?select=email,aktif&kod=eq.${encodeURIComponent(String(r.kisi_kod || ""))}&limit=1`);
          const to = k && k[0] && k[0].aktif !== false && k[0].email ? String(k[0].email).trim() : "";
          if (!to) md = "alıcı e-postası yok";
          else {
            const hit = HITAP[String(r.kisi_kod || "")] || "";
            const tk = `${esc(r.proje || "")}${r.firma ? " (" + esc(r.firma) + ")" : ""}${r.ref ? ", Ref " + esc(r.ref) : ""}`;
            const govde = karar === "onaylandi"
              ? `<p>${tk} teklifi için talep ettiğiniz ${ck(sayi(r.talep))}${yz(sayi(r.talep))} iskonto çarpanı onaylandı. Teklif Hazırlama formunda PDF ve Excel çıktısı açıldı.</p>`
              : `<p>${tk} teklifi için yönetim tarafından yeni iskonto çarpanı belirlendi: <b>${ck(c)}</b>${yz(c)} (talebiniz: ${ck(sayi(r.talep))}). Teklif Hazırlama formunda iskonto çarpanı bu değere çevrildi; PDF ve Excel çıktısı açıldı.</p>`;
            const DG = (Array.isArray(r.degisiklikler) ? r.degisiklikler : []) as string[];
            const dgH = DG.length ? `<p>Onaylanan fiyat değişiklikleri:</p><ul>${DG.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
            const html = (hit ? `<p>${hit},</p>` : "") + govde + dgH + `<p>Melih Bilgili</p>`;
            const subject = karar === "onaylandi" ? `Claude: İskonto talebiniz onaylandı – ${r.proje || ""}` : `Claude: Yönetim yeni iskonto belirledi – ${r.proje || ""}`;
            const m = await fetch(HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: [to], cc: [], subject, html, file: [] }) });
            md = m.ok ? "ok " + to : `mail hattı ${m.status}`;
          }
        }
      } catch (e) { md = "mail " + String(e); }
      await rest(`soum_iskonto_onay?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ mail_durum: md }) });
      return json({ ok: true, id, durum: karar, mail: md });
    }
    return json({ ok: false, hata: "islem?" }, 400);
  } catch (e) {
    return json({ ok: false, hata: String(e) }, 500);
  }
});
