// Supabase Edge Function: arb-kur  (2026-08-24)
// EUR bazlı güncel kur — TL (TRY), USD, GBP. Kaynak: ECB / frankfurter.app (anahtarsız).
// Tarayıcıdan doğrudan çağrılamayan dış API'yi sunucu tarafında çağırır.
// Dönen: { ok:true, tarih:"YYYY-MM-DD", rates:{ EUR:1, TL:.., USD:.., GBP:.. } }
// 1 EUR = rates[X] birim X  (tutar_eur = tutar / rates[X])
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
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
    const r = await fetch("https://api.frankfurter.app/latest?from=EUR&to=TRY,USD,GBP");
    if (!r.ok) return json({ ok: false, error: "kur kaynagi " + r.status }, 502);
    const j = await r.json();
    const rt = j.rates || {};
    const rates: Record<string, number> = { EUR: 1 };
    if (rt.TRY > 0) rates.TL = rt.TRY;
    if (rt.USD > 0) rates.USD = rt.USD;
    if (rt.GBP > 0) rates.GBP = rt.GBP;
    return json({ ok: true, tarih: j.date || null, rates });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
