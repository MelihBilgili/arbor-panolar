// Supabase Edge Function: sevk-degisim-ozet   (v2 — 07.09.2026)
// İKİ MOD:
//  (1) body {} veya {mod:"aylik"} — OE formundaki AYLIK GÜNCELLEME düğmesi çağırır:
//      her kalemin ÖNCEKİ↔GÜNCEL sevk durumundan LLM özeti üretip degisim_ozet'e yazar,
//      sonra guncel→onceki kayması yapar (bir sonraki döngü için) ve canlı özeti temizler.
//      Değişim yoksa (onceki dolu ama guncel ile aynı) degisim_ozet = "Değişiklik yok."
//      (ÖB v4 deseni — boş hücre "özet üretilemedi" gibi okunuyordu). Önceki hiç yoksa boş kalır.
//  (2) body {mod:"canli"} — PANO çağırır (düğmeye basılmasını beklemeden):
//      onceki<>guncel olan satırlar için canli_ozet üretir. degisim_ozet'e, onceki'ye DOKUNMAZ.
//      canli_kaynak = özetin üretildiği andaki (onceki + guncel) metni; değişmemiş satır atlanır
//      (idempotent — pano her açılışta çağırsa da LLM yalnız gerçekten değişen satırlar için çalışır).
//
// Deploy: python kod\_deploy_edge.py sevk-degisim-ozet
// SECRET GEREKLİ: ANTHROPIC_API_KEY (proje edge function secret). Yoksa özet üretemez, DURUR.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ARB_OK: service_role anahtarı ya da @arbor.com.tr e-postası olmayan çağrıyı reddeder.
   (Publishable anahtar geçerli JWT sayıldığı için Verify JWT tek başına yetmiyor.) */
function ARB_OK(req: Request): boolean {
  const a = req.headers.get("authorization") || "";
  const t = a.replace(/^Bearer\s+/i, "").trim();
  if (!t) return false;
  if (t === SERVICE_KEY) return true;
  try {
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p.role === "service_role") return true;
    return typeof p.email === "string" && p.email.toLowerCase().endsWith("@arbor.com.tr");
  } catch (_e) { return false; }
}

async function rest(method: string, path: string, body?: unknown, prefer?: string) {
  const h: Record<string,string> = {
    apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json",
  };
  if (prefer) h["Prefer"] = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: h, body: body!=null?JSON.stringify(body):undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`REST ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

async function summarize(pairs: {key:string; onceki:string; guncel:string}[]): Promise<Record<string,string>> {
  const prompt =
    "Aşağıda sevke hazır kalemlerin ÖNCEKİ ve GÜNCEL sevk durumu notları var. " +
    "Her kalem için önceki duruma göre NE DEĞİŞTİĞİNİ tek kısa Türkçe cümleyle özetle (en çok ~15 kelime). " +
    "Sadece geçerli JSON dizisi döndür: [{\"key\":\"...\",\"ozet\":\"...\"}]. Başka metin yazma.\n\n" +
    JSON.stringify(pairs, null, 0);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${body}`);
  const data = JSON.parse(body);
  let txt = (data.content && data.content[0] && data.content[0].text) || "[]";
  const s = txt.indexOf("["), e = txt.lastIndexOf("]");
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
  const arr = JSON.parse(txt);
  const out: Record<string,string> = {};
  for (const it of arr) if (it && it.key != null) out[String(it.key)] = String(it.ozet || "");
  return out;
}

const tr = (v: unknown) => String(v == null ? "" : v).trim();
const sig = (r: any) => tr(r.onceki) + " >>> " + tr(r.guncel);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ARB_OK(req)) return json({ ok: false, error: "yetkisiz" }, 401);
  try {
    let mod = "aylik";
    try { const b = await req.json(); if (b && b.mod) mod = String(b.mod); } catch (_e) { /* gövde yok */ }

    const rows = await rest("GET", "sevk_durumu_onur?select=tur,kalem_key,guncel,onceki,canli_kaynak");
    const active = (rows || []).filter((r: any) => tr(r.guncel));
    const changed = (r: any) => tr(r.onceki) && tr(r.onceki) !== tr(r.guncel);

    /* ---------- CANLI MOD: yalnız bayat satırlar ---------- */
    if (mod === "canli") {
      const stale = active.filter((r: any) => changed(r) && tr(r.canli_kaynak) !== sig(r));
      const same  = active.filter((r: any) => !changed(r) && tr(r.onceki) && tr(r.canli_kaynak) !== sig(r));
      if (!stale.length && !same.length) return json({ ok: true, uretilen: 0, note: "Canlı özetler güncel." });
      if (stale.length && !ANTHROPIC_KEY)
        return json({ ok: false, need_key: true, error: "ANTHROPIC_API_KEY tanimli degil." }, 400);
      const pairs = stale.map((r: any) => ({ key: `${r.tur}|${r.kalem_key}`, onceki: tr(r.onceki), guncel: tr(r.guncel) }));
      const summaries = pairs.length ? await summarize(pairs) : {};
      let n = 0;
      for (const r of stale.concat(same)) {
        const k = `${r.tur}|${r.kalem_key}`;
        const ozet = changed(r) ? (summaries[k] || "") : "Değişiklik yok.";
        await rest("PATCH", `sevk_durumu_onur?tur=eq.${encodeURIComponent(r.tur)}&kalem_key=eq.${encodeURIComponent(r.kalem_key)}`,
          { canli_ozet: ozet || null, canli_kaynak: sig(r) }, "return=minimal");
        n++;
      }
      return json({ ok: true, uretilen: n, ozetli: stale.length, note: `${n} kalemin canlı özeti tazelendi.` });
    }

    /* ---------- AYLIK MOD (düğme): özet + guncel→onceki kayması ---------- */
    const pairs = active.filter(changed)
      .map((r: any) => ({ key: `${r.tur}|${r.kalem_key}`, onceki: tr(r.onceki), guncel: tr(r.guncel) }));
    if (pairs.length > 0 && !ANTHROPIC_KEY)
      return json({ ok: false, need_key: true, error: "ANTHROPIC_API_KEY tanimli degil. Supabase edge function secret olarak ekleyin, sonra tekrar deneyin." }, 400);

    const summaries = pairs.length ? await summarize(pairs) : {};
    let updated = 0, ozetli = 0;
    for (const r of active) {
      const k = `${r.tur}|${r.kalem_key}`;
      let ozet = "";
      if (changed(r)) { ozet = summaries[k] || ""; if (ozet) ozetli++; }
      else if (tr(r.onceki)) ozet = "Değişiklik yok.";   /* baseline (onceki hiç yok) boş kalır */
      const patch = { degisim_ozet: ozet || null, onceki: r.guncel, canli_ozet: null, canli_kaynak: null,
                      updated_at: new Date().toISOString() };
      await rest("PATCH", `sevk_durumu_onur?tur=eq.${encodeURIComponent(r.tur)}&kalem_key=eq.${encodeURIComponent(r.kalem_key)}`, patch, "return=minimal");
      updated++;
    }
    return json({ ok: true, updated, ozetli, note: `${updated} kalem güncellendi, ${ozetli} özet üretildi.` });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
