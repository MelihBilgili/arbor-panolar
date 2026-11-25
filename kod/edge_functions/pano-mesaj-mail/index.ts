// Supabase Edge Function: pano-mesaj-mail
// Panolardaki "Mail Gönder" kutusu çağırır → o panonun sorumlusuna serbest metinli mail atar.
// Alıcı ASLA istemciden gelmez: form_takip.form_key ile sunucu tarafında çözülür (beyaz liste).
// CC = int@arbor.com.tr (MAIL_CC). Resend ile gönderilir (RESEND_API_KEY / MAIL_FROM secret'ları
// diğer *-mail fonksiyonlarıyla ortak).
//
// Çağrı:
//   sb.functions.invoke("pano-mesaj-mail", { body:{ form_key:"ob_rapor", metin:"...", konu:"(ops.)" } })
//   body.test===true ise gönderim YAPILMAZ, yalnız alıcı çözümlenip döner (deploy doğrulaması için).
//
// Deploy: Management API → POST /v1/projects/<ref>/functions/deploy?slug=pano-mesaj-mail (verify_jwt AÇIK)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ARBOR-MAIL-HAT (2026-08-31): mail Resend yerine arbor-mail edge fn uzerinden gider;
   arbor-mail → Zapier catch hook → Outlook "Send Email" (int@arbor.com.tr kutusu).
   Gonderen artik gercekten int@arbor.com.tr; dogrulanmamis alan sorunu yok. */
const MAIL_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/arbor-mail`;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const CC   = Deno.env.get("MAIL_CC")   || "int@arbor.com.tr";
const FROM = Deno.env.get("MAIL_FROM") || "Arbor Panolar <onboarding@resend.dev>";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ARB_OK(req: Request): boolean { const h = req.headers.get("authorization") || ""; const t = h.replace(/^Bearer\s+/i, ""); const p = t.split("."); if (p.length !== 3) return false; try { const j = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/"))); if (j.role === "service_role") return true; return typeof j.email === "string" && j.email.toLowerCase().endsWith("@arbor.com.tr"); } catch (e) { return false; } }

const esc = (s: string) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const form_key = String((b as any).form_key || "").trim();
    const metin = String((b as any).metin || "").trim();
    const konu = String((b as any).konu || "").trim();
    const test = (b as any).test === true;
    if (!form_key) return json({ error: "form_key gerekli" }, 400);
    if (!test && !metin) return json({ error: "metin bos" }, 400);
    if (metin.length > 8000) return json({ error: "metin cok uzun" }, 400);

    const sb = createClient(SB_URL, SB_SERVICE);
    const { data: row, error: selErr } = await sb
      .from("form_takip").select("*").eq("form_key", form_key).single();
    if (selErr || !row) return json({ error: "form bulunamadi: " + form_key }, 404);
    const to = String(row.ilgili_email || "").trim();
    if (!to) return json({ error: "ilgili_email bos" }, 400);

    const ad = row.form_adi || form_key;
    if (test) return json({ ok: true, test: true, to, cc: CC, ad });

    if (!SB_KEY) return json({ error: "RESEND_API_KEY tanimli degil" }, 500);
    const subject = konu || `${ad} — Melih Bilgili`;
    const html =
      `<p>Sayın ${esc(row.ilgili_ad || "")},</p>` +
      `<div style="white-space:pre-wrap">${esc(metin)}</div>` +
      `<p style="color:#667;font-size:12px">${ad} panosundan gönderildi · ${new Date().toLocaleString("tr-TR")}</p>`;

    const r = await fetch(MAIL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: [to], cc: [CC], subject, text: metin, html }),
    });
    const body = await r.text();
    if (!r.ok) return json({ error: `Mail ${r.status}: ${body}` }, 502);

    return json({ ok: true, to, cc: CC, konu: subject });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
