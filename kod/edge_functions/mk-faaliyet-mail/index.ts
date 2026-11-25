// Supabase Edge Function: mk-faaliyet-mail
// MK — Faaliyet & Prim Formu'ndaki "Aylık güncelleme" düğmesi çağırır →
// Melih'e mail atar (Resend). satis-ay-mail ile aynı RESEND_API_KEY secret'ını kullanır.
//
// Deploy (anon çağırabilsin diye jwt doğrulaması kapalı):
//   supabase functions deploy mk-faaliyet-mail --no-verify-jwt
// Gerekli secret: RESEND_API_KEY (mevcut, satis-ay-mail ile paylaşılır).
//
// Form çağrısı:  sb.functions.invoke("mk-faaliyet-mail", { body:{ ay:"Ağustos 2026" } })

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/* ARBOR-MAIL-HAT (2026-08-31): mail Resend yerine arbor-mail edge fn uzerinden gider;
   arbor-mail → Zapier catch hook → Outlook "Send Email" (int@arbor.com.tr kutusu).
   Gonderen artik gercekten int@arbor.com.tr; dogrulanmamis alan sorunu yok. */
const MAIL_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/arbor-mail`;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TO   = Deno.env.get("MAIL_TO")   || "int@arbor.com.tr";
const FROM = Deno.env.get("MAIL_FROM") || "Arbor Panolar <onboarding@resend.dev>";

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
    const { ay } = await req.json();
    if (!SB_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY tanımlı değil" }, 500);
    const subject = `MK Faaliyet: ${ay} ayı güncellendi`;
    const html =
      `<p><b>MK (Mehmet Konak) Faaliyet Formu</b> <b>${ay}</b> ayına ilişkin ` +
      `güncellendi. Prim özeti Mali → MK Prim panosunda hazır.</p>` +
      `<p style="color:#667">Kaynak: MK · ${new Date().toLocaleString("tr-TR")}</p>`;
    const r = await fetch(MAIL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: [TO], subject, html }),
    });
    const body = await r.text();
    if (!r.ok) return json({ error: `Mail ${r.status}: ${body}` }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
