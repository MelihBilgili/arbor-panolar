// Supabase Edge Function: arbor-mail  (2026-08-31)
// ARBOR'UN TEK MAIL ÇIKIŞI. Bütün pano/form mailleri buradan geçer.
//
// NEDEN: Resend hesabında doğrulanmış alan YOK (resend.com/domains → "No domains yet"),
// bu yüzden Resend yalnız hesap sahibine (int@arbor.com.tr) gönderebiliyordu; Melike gibi
// gerçek alıcılara 403 validation_error dönüyordu. Arbor'un maili zaten int@arbor.com.tr
// Outlook kutusundan gidiyor — artık mailler o kutudan gönderiliyor.
//
// HAT: bu fonksiyon → Zapier catch hook (ARBOR_MAIL_HOOK) → Zapier workflow
//      "arbor-mail-gonder" → Microsoft Outlook "Send Email" (bağlantı: int@arbor.com.tr).
//      Gönderen ve Gönderilmiş Öğeler = int@arbor.com.tr.
//
// Gövde: { to, cc?, subject, text?, html? }   (to/cc: string | string[] | "a@b, c@d")
// Secret: ARBOR_MAIL_HOOK (zorunlu). Yedek yol: RESEND_API_KEY + MAIL_FROM (hook yoksa).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const HOOK = Deno.env.get("ARBOR_MAIL_HOOK") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("MAIL_FROM") || "Arbor Panolar <onboarding@resend.dev>";

const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function ARB_OK(req: Request): boolean {
  const h = req.headers.get("authorization") || "";
  const t = h.replace(/^Bearer\s+/i, "");
  // Diğer edge fonksiyonları buraya service role anahtarıyla gelir. Yeni Supabase
  // anahtar biçimi (sb_secret_…) JWT DEĞİLDİR; bu yüzden önce doğrudan karşılaştırılır.
  if (SRK && t === SRK) return true;
  const p = t.split(".");
  if (p.length !== 3) return false;
  try {
    const j = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (j.role === "service_role") return true;
    return typeof j.email === "string" && j.email.toLowerCase().endsWith("@arbor.com.tr");
  } catch (_e) { return false; }
}

function liste(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(",");
  return arr.map((s) => String(s).trim()).filter((s) => s.length > 0);
}

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ARB_OK(req)) return new Response(JSON.stringify({ error: "yetkisiz" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const b = await req.json();
    const to = liste(b.to), cc = liste(b.cc);
    const subject = String(b.subject || "").trim();
    const text = typeof b.text === "string" ? b.text : "";
    const html = typeof b.html === "string" ? b.html : "";
    if (!to.length) return json({ error: "alıcı yok" }, 400);
    if (!subject) return json({ error: "konu yok" }, 400);

    // 1) Asıl yol: int@arbor.com.tr Outlook kutusu (Zapier)
    if (HOOK) {
      const r = await fetch(HOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, cc, subject, text, html }),
      });
      const body = await r.text();
      if (r.ok) return json({ ok: true, yol: "outlook", to, cc });
      return json({ error: `Zapier ${r.status}: ${body}` }, 502);
    }

    // 2) Yedek yol: Resend (yalnız ARBOR_MAIL_HOOK tanımsızsa)
    if (!RESEND_API_KEY) return json({ error: "ARBOR_MAIL_HOOK ve RESEND_API_KEY tanımsız" }, 500);
    const payload: Record<string, unknown> = { from: FROM, to, subject, text: text || undefined, html: html || undefined };
    if (cc.length) payload.cc = cc;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.text();
    if (!r.ok) return json({ error: `Resend ${r.status}: ${body}` }, 502);
    return json({ ok: true, yol: "resend", to, cc });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
