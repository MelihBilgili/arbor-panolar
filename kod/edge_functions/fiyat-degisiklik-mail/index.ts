// Supabase Edge Function: fiyat-degisiklik-mail
// Fiyatlandırma panosundaki "GÜNCELLE" düğmesi çağırır → fiyat_mail_alici tablosundaki
// aktif alıcılara (cc YOK) bilgi maili gönderir. Metin SABİT DEĞİL: govde {metin} →
// fiyat_yayin.bildirim_metni (degisen maddelerin ESKI → YENI listesi) → varsayilan.
//
// Deploy: Dashboard → Edge Functions → Via Editor (verify JWT KAPALI — anon invoke).
// Secret: RESEND_API_KEY (paylaşımlı). MAIL_FROM doğrulanmış alan olmalı (dış alıcılar için).
//
// App: sb.functions.invoke("fiyat-degisiklik-mail", { body:{} })

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ARBOR-MAIL-HAT (2026-08-31): mail Resend yerine arbor-mail edge fn uzerinden gider;
   arbor-mail → Zapier catch hook → Outlook "Send Email" (int@arbor.com.tr kutusu).
   Gonderen artik gercekten int@arbor.com.tr; dogrulanmamis alan sorunu yok. */
const MAIL_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/arbor-mail`;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("MAIL_FROM") || "Arbor Panolar <onboarding@resend.dev>";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* FIYAT-DEGISIM-METNI (2026-09-10): metin artik SABIT degil.
   Oncelik: (1) govdedeki {metin}, (2) fiyat_yayin.bildirim_metni (panodaki GUNCELLE
   dugmesi yayin aninda onceki anlik goruntuyle kiyaslayip ESKI → YENI listesini yazar),
   (3) asagidaki varsayilan. */
const METIN_VARSAYILAN = "Fiyatlandırma kurallarında değişiklik yapılmıştır.\n\nBu değişiklikler sizde görünmüyorsa, lütfen tarama verilerini silerek formu yenileyiniz.";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function metinHtml(t: string): string {
  return t.split(/\n{2,}/).map((blok) => {
    const satir = blok.split("\n");
    if (satir.length > 1 && satir.every((s) => /^\s*[•\-]\s+/.test(s))) {
      return "<ul>" + satir.map((s) => `<li>${esc(s.replace(/^\s*[•\-]\s+/, ""))}</li>`).join("") + "</ul>";
    }
    return `<p>${satir.map(esc).join("<br>")}</p>`;
  }).join("");
}

function ARB_OK(req: Request): boolean { const h = req.headers.get("authorization") || ""; const t = h.replace(/^Bearer\s+/i, ""); const p = t.split("."); if (p.length !== 3) return false; try { const j = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/"))); if (j.role === "service_role") return true; return typeof j.email === "string" && j.email.toLowerCase().endsWith("@arbor.com.tr"); } catch (e) { return false; } }

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ARB_OK(req)) return new Response(JSON.stringify({ error: "yetkisiz" }), { status: 401, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    if (!SB_KEY) return json({ error: "RESEND_API_KEY tanimli degil" }, 500);
    const sb = createClient(SB_URL, SB_SERVICE);
    const { data: alicilar, error } = await sb
      .from("fiyat_mail_alici").select("ad,email,aktif").eq("aktif", true);
    if (error) return json({ error: "alici okunamadi: " + error.message }, 500);
    const to = (alicilar || []).map((r: any) => (r.email || "").trim()).filter((e: string) => e);
    if (!to.length) return json({ error: "aktif alici yok" }, 400);

    // Metin: govde > fiyat_yayin.bildirim_metni > varsayilan
    let gv: any = {};
    try { gv = await req.json(); } catch (_e) { gv = {}; }
    let METIN = typeof gv?.metin === "string" && gv.metin.trim() ? gv.metin.trim() : "";
    if (!METIN) {
      const { data: yay } = await sb.from("fiyat_yayin").select("bildirim_metni").eq("id", 1).limit(1);
      const bm = (yay && yay[0] && (yay[0] as any).bildirim_metni) || "";
      if (typeof bm === "string" && bm.trim()) METIN = bm.trim();
    }
    if (!METIN) METIN = METIN_VARSAYILAN;

    const subject = "Fiyatlandırma kuralları güncellendi";
    const html = metinHtml(METIN);
    const r = await fetch(MAIL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, text: METIN, html }),
    });
    const body = await r.text();
    if (!r.ok) return json({ error: `Mail ${r.status}: ${body}` }, 502);
    return json({ ok: true, gonderilen: to.length, alicilar: to, metin: METIN });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
