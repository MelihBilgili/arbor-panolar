// Supabase Edge Function: sozluk-ekle  (v8 — 2026-11-22 SOZLUK-HATA-TESHIS: hata console.error ile loglanır;
//   model 404/kaldırıldı ise yedek modellere geçilir; x-denetle (sistem_anahtar 'dokuman_denetle') ile servis içi çağrı;
//   v7 — 2026-10-16 SOZLUK-IKI-DIL: kelime aynı yazımla iki dilde de geçerliyse EN ve FR iki ayrı satır;
//   v4 — 2026-10-03 SOZLUK-BASLIK-NORM: kelime büyük harfle başlar, İngilizce fiilde baştaki 'to' atılır;
//   v3 — 2026-10-03 SOZLUK-EN-FR: yalnız İngilizce/Fransızca değerlendirilir;
//   v2 — 2026-09-08: tanım DAİMA kelimenin kendi dilinde; aynı id yeniden eklenirse 'anlam' güncellenir)
// Arbor Sözlük panosundaki "kelime ekle" kutusu çağırır. body:{kelime}.
// Dönüş: {ok, id, kelime, anlam, dil, existed[, satirlar]}.
// Güvenlik: yalnız @arbor.com.tr oturumu, service_role ya da geçerli x-denetle başlığı (ARB_OK); verify_jwt=true.
// SECRET: ANTHROPIC_API_KEY.
// Kaynak: Supabase sürüm 11 (25.11.2026'da Supabase'ten eşitlendi).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODELS = ["claude-haiku-4-5-20251001", "claude-haiku-4-5", "claude-sonnet-4-5", "claude-sonnet-4-6"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

/* Yalnız arbor hesabı, service_role ya da x-denetle (sistem_anahtar) çağırabilir. */
async function ARB_OK(req: Request): Promise<boolean> {
  const a = req.headers.get("authorization") || "";
  const t = a.replace(/^Bearer\s+/i, "");
  if (t && t === SERVICE_KEY) return true;
  try {
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p.role === "service_role") return true;
    if (typeof p.email === "string" && p.email.toLowerCase().endsWith("@arbor.com.tr")) return true;
  } catch { /* devam */ }
  const d = req.headers.get("x-denetle");
  if (d) {
    try {
      const r = await rest("GET", "sistem_anahtar?ad=eq.dokuman_denetle&select=deger");
      if (Array.isArray(r) && r.length && r[0].deger && r[0].deger === d) return true;
    } catch (e) { console.error("x-denetle kontrol hatası:", String(e)); }
  }
  return false;
}

function slug(s: string): string | null {
  const asc = s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\x00-\x7F]/g, "").toLowerCase();
  const core = asc.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return core ? ("v-" + core) : null;
}

function normKelime(k: string, dil: string): string {
  let s = k.replace(/\s+/g, " ").trim();
  if (dil === "İngilizce") {
    const t = s.replace(/^to\s+/i, "").trim();
    if (t) s = t;
  }
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* Model kaldırılmış/bulunamamışsa (404 ya da not_found/model hatası) sıradaki modele geçer. */
async function llmText(prompt: string, maxTok: number): Promise<string> {
  let son = "";
  for (const model of MODELS) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTok, messages: [{ role: "user", content: prompt }] }),
    });
    const body = await r.text();
    if (r.ok) {
      const data = JSON.parse(body);
      const parts = Array.isArray(data.content) ? data.content : [];
      return parts.filter((x: any) => x && x.type === "text").map((x: any) => x.text).join("") || "";
    }
    son = `Anthropic ${r.status} (${model}): ${body}`;
    console.error(son);
    const modelHatasi = r.status === 404 || /not_found|model/i.test(body);
    if (!modelHatasi) break;
  }
  throw new Error(son);
}
async function llmObj(prompt: string, maxTok: number): Promise<any> {
  let txt = await llmText(prompt, maxTok);
  const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
  return JSON.parse(txt || "{}");
}

async function tanimUret(kelime: string): Promise<{dil: string; anlam: string}[]> {
  const prompt =
    "You are a lexicographer. The input word below is ALWAYS English, French, or both — never Turkish, " +
    "German, Italian, Spanish or any other language. Consider ONLY these two languages.\n" +
    "1) Decide in which of the two languages the word is a genuine, standard dictionary word with EXACTLY this " +
    "spelling (ignore capitalization; accents must match). If it exists in BOTH English and French with the same " +
    "spelling (e.g. 'nature', 'culture', 'question'), return BOTH entries. " +
    "If only one language, return only that one. " +
    "If it looks like a misspelling, pick the English or French word it most likely is (one entry).\n" +
    "2) For each entry write ONE short monolingual dictionary definition IN THAT LANGUAGE " +
    "(English entry → English definition; French entry → definition written in French). " +
    "Never write a definition in Turkish.\n" +
    "Keep each concise: one sentence, ~8-20 words; no example sentence, no pronunciation, no extra notes.\n" +
    "'dil' must be exactly \"İngilizce\" or \"Fransızca\". English entry first.\n" +
    "Return ONLY valid JSON, nothing else: " +
    "{\"diller\":[{\"dil\":\"İngilizce|Fransızca\",\"anlam\":\"<definition in that language>\"}]}\n\n" +
    "Word: " + kelime;
  const o = await llmObj(prompt, 600);
  const arr: any[] = Array.isArray(o.diller) ? o.diller : (o.dil ? [o] : []);
  const out: {dil: string; anlam: string}[] = [];
  for (const x of arr) {
    let dil = String((x && x.dil) || "").trim();
    if (!/^(İngilizce|Fransızca)$/.test(dil)) dil = /fr/i.test(dil) ? "Fransızca" : "İngilizce";
    const anlam = String((x && x.anlam) || "").trim();
    if (anlam && !out.some(y => y.dil === dil)) out.push({ dil, anlam });
  }
  out.sort((p, q) => (p.dil === "İngilizce" ? 0 : 1) - (q.dil === "İngilizce" ? 0 : 1));
  return out;
}

async function satirYaz(id: string, kelime: string, anlam: string): Promise<boolean> {
  const mevcut = await rest("GET", `sozluk?id=eq.${encodeURIComponent(id)}&select=id`);
  if (Array.isArray(mevcut) && mevcut.length) {
    await rest("PATCH", `sozluk?id=eq.${encodeURIComponent(id)}`, { anlam, kelime }, "return=minimal");
    return true;
  }
  const row = { id, kelime, anlam, etiketler: [] as string[], created: Date.now() };
  await rest("POST", "sozluk?on_conflict=id", [row], "resolution=merge-duplicates,return=minimal");
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await ARB_OK(req))) return json({ ok: false, error: "yetkisiz" }, 401);
  try {
    const bodyIn: any = await req.json().catch(() => ({}));
    const ham = String((bodyIn && bodyIn.kelime) || "").trim();
    if (!ham) return json({ ok: false, error: "Kelime boş." }, 400);
    if (ham.length > 80) return json({ ok: false, error: "Kelime çok uzun." }, 400);
    if (!slug(ham)) return json({ ok: false, error: "Geçersiz kelime." }, 400);
    if (!ANTHROPIC_KEY) return json({ ok: false, need_key: true, error: "ANTHROPIC_API_KEY tanımlı değil." }, 400);

    const tanimlar = await tanimUret(ham);
    if (!tanimlar.length) return json({ ok: false, error: "Tanım üretilemedi." }, 502);
    const iki = tanimlar.length > 1;

    const satirlar: {id: string; kelime: string; anlam: string; dil: string; existed: boolean}[] = [];
    for (const t of tanimlar) {
      const kelime = normKelime(ham, t.dil);
      const s = slug(kelime);
      if (!s) continue;
      const id = (iki && t.dil === "Fransızca") ? s + "-fr" : s;
      const existed = await satirYaz(id, kelime, t.anlam);
      satirlar.push({ id, kelime, anlam: t.anlam, dil: t.dil, existed });
    }
    if (!satirlar.length) return json({ ok: false, error: "Geçersiz kelime." }, 400);

    const ilk = satirlar[0];
    if (!iki) return json({ ok: true, existed: ilk.existed, updated: ilk.existed, id: ilk.id, kelime: ilk.kelime, anlam: ilk.anlam, dil: ilk.dil });
    return json({
      ok: true,
      existed: satirlar.every(x => x.existed),
      id: ilk.id, kelime: ilk.kelime,
      dil: "İngilizce + Fransızca",
      anlam: satirlar.map(x => (x.dil === "İngilizce" ? "EN: " : "FR: ") + x.anlam).join(" · "),
      satirlar,
    });
  } catch (e) {
    console.error("sozluk-ekle hata:", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});
