// Supabase Edge Function: form-hatirlat-mail
// Ana Gündem "Formlar" bloğundaki "Mail Gönder" düğmesi çağırır →
// ilgili kişiye hatırlatma maili atar (Resend), CC = int@arbor.com.tr;
// sonra form_takip.mail_sayac'ı +1 artırır (service role ile).
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor
//   (verify JWT KAPALI — anon app'in invoke edebilmesi için).
// Secret: RESEND_API_KEY (proje geneli, diğer *-mail fonksiyonlarıyla paylaşılır).
//
// App şöyle çağırır:
//   sb.functions.invoke("form-hatirlat-mail", { body:{ form_key:"ea_so" } })
//
// NOT: Resend "from" alanı DOĞRULANMIŞ bir alan adına ait olmalı; aksi halde
//   dışarıdaki (arbor.com.tr / arborfenetres.fr) alıcılara gönderim başarısız olur.
//   MAIL_FROM secret'ını doğrulanmış alanla ayarla (yoksa onboarding@resend.dev yalnız
//   hesap sahibine test göndersin).

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
    const { form_key } = await req.json().catch(() => ({}));
    if (!form_key) return json({ error: "form_key gerekli" }, 400);
    if (!SB_KEY) return json({ error: "RESEND_API_KEY tanimli degil" }, 500);

    const sb = createClient(SB_URL, SB_SERVICE);
    const { data: row, error: selErr } = await sb
      .from("form_takip").select("*").eq("form_key", form_key).single();
    if (selErr || !row) return json({ error: "form bulunamadi: " + form_key }, 404);
    const to = (row.ilgili_email || "").trim();
    if (!to) return json({ error: "ilgili_email bos" }, 400);

    const ad = row.form_adi || form_key;
    const subject = `Pano güncelleme hatırlatması — ${ad}`;
    const metin =
      `${ad} adlı panoyu gereken tarihte güncellemediğinizi görüyorum. ` +
      `Lütfen en kısa sürede güncellemenizi rica ederim.`;
    const html =
      `<p>Sayın ${row.ilgili_ad || ""},</p>` +
      `<p><b>${ad}</b> adlı panoyu gereken tarihte güncellemediğinizi görüyorum. ` +
      `Lütfen en kısa sürede güncellemenizi rica ederim.</p>` +
      `<p style="color:#667;font-size:12px">${new Date().toLocaleString("tr-TR")}</p>`;

    const r = await fetch(MAIL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: [to], cc: [CC], subject, text: metin, html }),
    });
    const body = await r.text();
    if (!r.ok) return json({ error: `Mail ${r.status}: ${body}` }, 502);

    const yeni = (row.mail_sayac || 0) + 1;
    await sb.from("form_takip").update({ mail_sayac: yeni, updated_at: new Date().toISOString() })
      .eq("form_key", form_key);

    return json({ ok: true, to, cc: CC, sayac: yeni });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
