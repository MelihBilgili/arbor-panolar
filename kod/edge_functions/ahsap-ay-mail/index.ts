// Supabase Edge Function: ahsap-ay-mail
// Ahşap maliyet formundaki "Aylık güncelleme (ayı kapat)" düğmesi çağırır →
// int@arbor.com.tr'ye bildirim maili atar (Resend ile). satis-ay-mail ile aynı mekanizma.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor
//   (verify JWT KAPALI — anon formun invoke edebilmesi için).
// Secret: RESEND_API_KEY (proje geneli, satis-ay-mail ile paylaşılır).
//
// Form şöyle çağırır:
//   sb.functions.invoke("ahsap-ay-mail", { body:{ ay:"Ağustos 2026" } })

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
    const { ay } = await req.json().catch(() => ({}));
    const ayL = ay || "";
    if (!SB_KEY) return json({ error: "RESEND_API_KEY tanimli degil" }, 500);
    const subject = `Ahsap maliyet — ${ayL} kapatildi / guncellendi`;
    const html =
      `<p><b>Ahsap maliyet (Timber 72x86)</b> — <b>${ayL}</b> donemi kapatildi; ` +
      `guncel CBM-agirlikli € ortalama "onceki"ye kaydirildi, yeni alimlar yeni donemi olusturacak. Ahsap panosu guncellendi.</p>` +
      `<p style="color:#667">${new Date().toLocaleString("tr-TR")}</p>`;
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
