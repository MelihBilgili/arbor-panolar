// Supabase Edge Function: satis-ay-mail
// Satış formundaki "Bilgiler <ay> ayına ilişkin gelişmeleri yansıtacak şekilde
// güncellendi" düğmesi çağırır → Melih'e mail atar (Resend ile).
//
// KURULUM (bir kez):
//   1) Resend hesabı aç (resend.com) — hesap e-postası int@arbor.com.tr olsun
//      (test göndericisi onboarding@resend.dev yalnız HESAP SAHİBİNE mail atabilir;
//       bu yüzden alıcı = hesap e-postası. Başka adrese göndermek için domain doğrula.)
//   2) API key al → Supabase'e secret olarak ekle:
//        supabase secrets set RESEND_API_KEY=xxxx
//      (istersen: MAIL_TO, MAIL_FROM secret'ları ile özelleştir)
//   3) Deploy (anon'un çağırabilmesi için jwt doğrulaması kapalı):
//        supabase functions deploy satis-ay-mail --no-verify-jwt
//
// Formlar bunu şöyle çağırır:
//   sb.functions.invoke("satis-ay-mail", { body:{ kaynak:"FY", ay:"Temmuz 2026" } })

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/* ARBOR-MAIL-HAT (2026-08-31): mail Resend yerine arbor-mail edge fn uzerinden gider;
   arbor-mail → Zapier catch hook → Outlook "Send Email" (int@arbor.com.tr kutusu).
   Gonderen artik gercekten int@arbor.com.tr; dogrulanmamis alan sorunu yok. */
const MAIL_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/arbor-mail`;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TO   = Deno.env.get("MAIL_TO")   || "int@arbor.com.tr";
const FROM = Deno.env.get("MAIL_FROM") || "Arbor Panolar <onboarding@resend.dev>";
const NAMES: Record<string, string> = { SO: "Yurt İçi", FY: "Yurt Dışı 1", FY2: "Yurt Dışı 2" };

function ARB_OK(req: Request): boolean { const h = req.headers.get("authorization") || ""; const t = h.replace(/^Bearer\s+/i, ""); const p = t.split("."); if (p.length !== 3) return false; try { const j = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/"))); if (j.role === "service_role") return true; return typeof j.email === "string" && j.email.toLowerCase().endsWith("@arbor.com.tr"); } catch (e) { return false; } }

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
    const { kaynak, ay } = await req.json();
    const bolge = NAMES[kaynak] || kaynak || "?";
    if (!SB_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY tanımlı değil" }, 500);
    const subject = `Satış — ${bolge}: ${ay} ayı işlendi`;
    const html =
      `<p><b>${bolge}</b> satış bilgileri <b>${ay}</b> ayına ilişkin gelişmeleri ` +
      `yansıtacak şekilde güncellendi.</p>` +
      `<p style="color:#667">Kaynak: ${kaynak} · ${new Date().toLocaleString("tr-TR")}</p>`;
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
