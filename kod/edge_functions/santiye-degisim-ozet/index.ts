// Supabase Edge Function: santiye-degisim-ozet
// Şantiye Durum formu her yeni durum kaydından sonra çağırır (ob-degisim-ozet deseni).
// Yaptığı: her açık şantiye için santiye_durum_log'daki SON iki kaydı alır, önceki→son değişimini
//   tek kısa Türkçe cümleyle özetler → santiye.degisim_ozet'e yazar, ozet_log_id = son kaydın id'si.
// Tek kayıt varsa özet boş. ozet_log_id zaten son kayda eşitse atlanır (idempotent).
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor (verify JWT KAPALI).
// SECRET: ANTHROPIC_API_KEY — sevk-degisim-ozet / ob-degisim-ozet ile paylaşılır.
// Çağrı:  sb.functions.invoke("santiye-degisim-ozet", { body:{ santiye_id: 3 } })   // id yoksa hepsi

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

async function rest(method: string, path: string, body?: unknown, prefer?: string) {
  const h: Record<string,string> = {
    apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json",
  };
  if (prefer) h["Prefer"] = prefer;
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error("REST " + r.status + ": " + t);
  return t ? JSON.parse(t) : null;
}

const kimAd = (k: string) => (k === "OB" ? "ÖB" : "MK");

async function summarize(pairs: {key:string; onceki:string; simdi:string}[]): Promise<Record<string,string>> {
  const prompt =
    "Aşağıda tıkanmış şantiyelerin ÖNCEKİ ve SON durum kayıtları var (kaydı giren kişi ÖB veya MK, tarihiyle). " +
    "Her şantiye için önceki kayda göre NE DEĞİŞTİĞİNİ tek kısa Türkçe cümleyle yaz (en çok ~15 kelime). " +
    "Durumu tekrar etme, yalnızca değişimi/ilerlemeyi söyle. Somut bir ilerleme yoksa 'Değişiklik yok.' yaz. " +
    "Sadece geçerli JSON dizisi döndür: [{\"key\":\"...\",\"ozet\":\"...\"}]. Başka metin yazma.\n\n" +
    JSON.stringify(pairs, null, 0);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error("Anthropic " + r.status + ": " + body);
  const data = JSON.parse(body);
  let txt = (data.content && data.content[0] && data.content[0].text) || "[]";
  const s = txt.indexOf("["), e = txt.lastIndexOf("]");
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
  const arr = JSON.parse(txt);
  const out: Record<string,string> = {};
  for (const it of arr) if (it && it.key != null) out[String(it.key)] = String(it.ozet || "");
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    let only: number | null = null;
    try { const b = await req.json(); if (b && b.santiye_id != null) only = Number(b.santiye_id); } catch (_) { /* body yok */ }

    const flt = only != null ? "&id=eq." + only : "";
    const santiyeler = await rest("GET", "santiye?select=id,santiye,degisim_ozet,ozet_log_id,durum" + flt) || [];
    const acik = santiyeler.filter((r: any) => only != null || r.durum !== "Çözüldü");
    if (!acik.length) return json({ ok: true, islenen: 0, not: "islenecek santiye yok" });

    const ids = acik.map((r: any) => r.id).join(",");
    const logs = await rest("GET", "santiye_durum_log?select=id,santiye_id,kim,durum,tarih&santiye_id=in.(" + ids + ")&order=tarih.desc,id.desc") || [];
    const byS: Record<string, any[]> = {};
    for (const x of logs) (byS[x.santiye_id] = byS[x.santiye_id] || []).push(x);

    const metin = (x: any) => kimAd(x.kim) + " · " + x.tarih + ": " + String(x.durum || "").trim();
    const pairs: {key:string; onceki:string; simdi:string}[] = [];
    const bosalt: number[] = [];
    const sonLog: Record<string, number> = {};

    for (const s of acik) {
      const ls = byS[s.id] || [];
      if (!ls.length) continue;
      sonLog[s.id] = ls[0].id;
      if (ls.length < 2) { if (s.degisim_ozet) bosalt.push(s.id); continue; }   // tek kayıt → özet yok
      if (s.ozet_log_id != null && Number(s.ozet_log_id) === Number(ls[0].id)) continue; // zaten güncel
      pairs.push({ key: String(s.id), onceki: metin(ls[1]), simdi: metin(ls[0]) });
    }

    if (pairs.length > 0 && !ANTHROPIC_KEY)
      return json({ ok: false, need_key: true, error: "ANTHROPIC_API_KEY tanimli degil." }, 400);

    const ozetler = pairs.length ? await summarize(pairs) : {};

    let n = 0;
    for (const p of pairs) {
      await rest("PATCH", "santiye?id=eq." + p.key,
        { degisim_ozet: ozetler[p.key] || "", ozet_log_id: sonLog[p.key] }, "return=minimal");
      n++;
    }
    for (const id of bosalt) {
      await rest("PATCH", "santiye?id=eq." + id, { degisim_ozet: "", ozet_log_id: sonLog[id] ?? null }, "return=minimal");
    }
    return json({ ok: true, islenen: n, bosaltilan: bosalt.length });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
