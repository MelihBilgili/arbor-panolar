// Supabase Edge Function: sel-arb-ay-kapat  (2026-08-24 sürümü)
// SEL-ARB aylık güncelleme — AY BAŞINA TEK SÜTUN, kümülatif devir.
//  body.kaynak = "alacak"  -> Yurt Dışı Alacak formu:
//      * sel_arb_snapshot  <- arbor_alacak_kalem (firma×tarih alacak matrisi, ayın sütunu yeniden yazılır)
//      * gonderilen        =  önceki ay + Σ sel_odeme(islendi_tarih is null).tutar_eur
//      * fatura_edilen     =  önceki ay + Σ arbor_kesilen_fatura(islendi_tarih is null).tutar_eur
//  body.kaynak = "oe"      -> OE Faaliyet formu:
//      * borc              =  önceki ay + Σ ihracat_fatura(islendi_tarih is null).tutar_eur
//  İşlenen satırlara islendi_tarih damgası basılır (bir daha sayılmaz).
//  Aynı ay içinde iki form da çalışırsa AYNI sütun güncellenir (yeni sütun açılmaz).
// Deploy: Dashboard -> Edge Functions -> sel-arb-ay-kapat -> Code -> Deploy updates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TO   = Deno.env.get("MAIL_TO")   || "int@arbor.com.tr";
const FROM = Deno.env.get("MAIL_FROM") || "Arbor Panolar <onboarding@resend.dev>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

// yalnız arbor hesapları / service_role
function ARB_OK(req: Request): boolean {
  try {
    const h = req.headers.get("authorization") || "";
    const t = h.replace(/^bearer\s+/i, "");
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p.role === "service_role") return true;
    return typeof p.email === "string" && p.email.toLowerCase().endsWith("@arbor.com.tr");
  } catch (_e) { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (!ARB_OK(req)) return json({ error: "yetkisiz" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const kaynak = (body && body.kaynak) === "oe" ? "oe" : "alacak";
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const bugun = new Date().toISOString().slice(0, 10);
    const ay = bugun.slice(0, 7);

    const ozQ = await sb.from("sel_arb_ozet").select("*").order("tarih", { ascending: false });
    if (ozQ.error) return json({ error: ozQ.error.message }, 500);
    const oz = ozQ.data || [];
    const cur  = oz.find((r: any) => String(r.tarih).slice(0, 7) === ay);
    const prev = oz.find((r: any) => String(r.tarih).slice(0, 7) !== ay);
    const d = cur ? String(cur.tarih) : bugun;
    const base = {
      borc:          Number((cur ? cur.borc          : prev?.borc)          || 0),
      gonderilen:    Number((cur ? cur.gonderilen    : prev?.gonderilen)    || 0),
      fatura_edilen: Number((cur ? cur.fatura_edilen : prev?.fatura_edilen) || 0),
    };
    let borc = base.borc, gonderilen = base.gonderilen, fatura_edilen = base.fatura_edilen;
    let firma = 0, eklenen: string[] = [];

    if (kaynak === "oe") {
      const q = await sb.from("ihracat_fatura").select("id,tutar_eur").is("islendi_tarih", null);
      if (q.error) return json({ error: q.error.message }, 500);
      const art = Math.round(sum(q.data || [], "tutar_eur"));
      borc = base.borc + art;
      if ((q.data || []).length) {
        const up = await sb.from("ihracat_fatura").update({ islendi_tarih: d }).is("islendi_tarih", null);
        if (up.error) return json({ error: up.error.message }, 500);
      }
      eklenen.push(`Selectron'a Borç +${art.toLocaleString("tr-TR")} € (${(q.data || []).length} fatura)`);
    } else {
      const [ode, akf, kalem] = await Promise.all([
        sb.from("sel_odeme").select("id,tutar_eur").is("islendi_tarih", null),
        sb.from("arbor_kesilen_fatura").select("id,tutar_eur").is("islendi_tarih", null),
        sb.from("arbor_alacak_kalem").select("*"),
      ]);
      const err = ode.error || akf.error || kalem.error;
      if (err) return json({ error: err.message }, 500);
      const artO = Math.round(sum(ode.data || [], "tutar_eur"));
      const artF = Math.round(sum(akf.data || [], "tutar_eur"));
      gonderilen = base.gonderilen + artO;
      fatura_edilen = base.fatura_edilen + artF;
      if ((ode.data || []).length) await sb.from("sel_odeme").update({ islendi_tarih: d }).is("islendi_tarih", null);
      if ((akf.data || []).length) await sb.from("arbor_kesilen_fatura").update({ islendi_tarih: d }).is("islendi_tarih", null);

      await sb.from("sel_arb_snapshot").delete().eq("tarih", d);
      const snapRows = (kalem.data || []).map((k: any) => ({
        tarih: d, sira: k.sira, firma: k.firma, proje: k.proje,
        alacak: Math.round(Number(k.tutar_eur) || 0),
      }));
      if (snapRows.length) {
        const ins = await sb.from("sel_arb_snapshot").insert(snapRows);
        if (ins.error) return json({ error: ins.error.message }, 500);
      }
      firma = snapRows.length;
      eklenen.push(`Gönderilen +${artO.toLocaleString("tr-TR")} € · Ft edilen +${artF.toLocaleString("tr-TR")} € · ${firma} alacak satırı`);
    }

    await sb.from("sel_arb_ozet").delete().eq("tarih", d);
    const ozI = await sb.from("sel_arb_ozet").insert({ tarih: d, borc, gonderilen, fatura_edilen });
    if (ozI.error) return json({ error: ozI.error.message }, 500);

    let mailNote = "";
    if (RESEND_API_KEY) {
      const subject = `SEL-ARB aylık güncelleme (${kaynak}): ${d}`;
      const html =
        `<p>SEL-ARB panosunda <b>${d}</b> sütunu güncellendi (kaynak: <b>${kaynak}</b>).</p>` +
        `<ul><li>${eklenen.join("</li><li>")}</li></ul>` +
        `<table cellpadding="4"><tr><td>Selectron'a Borç (€)</td><td align="right"><b>${borc.toLocaleString("tr-TR")}</b></td></tr>` +
        `<tr><td>Selectron'a Gönderilen Toplam (€)</td><td align="right"><b>${gonderilen.toLocaleString("tr-TR")}</b></td></tr>` +
        `<tr><td>Selectron'a Ft Edilen Toplam (€)</td><td align="right"><b>${fatura_edilen.toLocaleString("tr-TR")}</b></td></tr></table>` +
        `<p style="color:#667">${new Date().toLocaleString("tr-TR")}</p>`;
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
        });
        mailNote = r.ok ? " · mail gönderildi" : ` · mail hata ${r.status}`;
      } catch (_e) { mailNote = " · mail gönderilemedi"; }
    }
    return json({ ok: true, tarih: d, kaynak, firma, borc, gonderilen, fatura_edilen,
                  note: `${d} sütunu güncellendi · ${eklenen.join(" · ")}${mailNote}` });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
