// Supabase Edge Function: bahce-ekle (2026-09-25, Melih) — BAHCE-OTO-DOLDUR
// v3 (2026-09-26): toprak = dikim çukuru karışım reçetesi (simge+sayı), pH/yazı yok. Lejant bahce-bitki skill ile aynı.
// v4 (2026-09-27): sıfır bileşen (🫴🏻0 vb.) asla yazılmaz; ortanca örneği '🟫4 🍂6 · 🌲malç'; sifirTemizle() güvencesi; cok_yillik alanı kaldırıldı (sütun silindi).
// Bahçe panosundaki ekleme satırı çağırır. body:{ad} (herhangi bir dilde bitki adı).
// Anthropic ile: güncel Latince ad + Türkçe ad + ışık/soğuk/toprak/sulama + İstanbul'a göre aylık bakım.
// bahce_bitki'ye ekler (latince zaten varsa dokunmaz), bahce_bakim satırlarını ekler.
// Güvenlik: ARB_OK (yalnız @arbor.com.tr oturumu / service_role). SECRET: ANTHROPIC_API_KEY.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODELS = ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

function ARB_OK(req: Request): boolean {
  try {
    const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (t && t === SERVICE_KEY) return true;
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p.role === "service_role") return true;
    return typeof p.email === "string" && p.email.endsWith("@arbor.com.tr");
  } catch { return false; }
}

async function rest(method: string, path: string, body?: unknown, prefer?: string) {
  const h: Record<string, string> = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
  if (prefer) h["Prefer"] = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`REST ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

async function llm(prompt: string): Promise<any> {
  let last = "";
  for (const model of MODELS) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
    });
    const b = await r.text();
    if (!r.ok) { last = `Anthropic ${r.status}: ${b}`; continue; }
    let txt = (JSON.parse(b).content?.[0]?.text) || "";
    const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
    if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
    return JSON.parse(txt);
  }
  throw new Error(last);
}

const TOPRAK_KURAL = `toprak = dikim çukuru karışım reçetesi, YALNIZ simge + sayı, yazı ve pH YOK. Sayılar hacim (kova) oranı; 🟫+🍂+🌱+⚪ toplamı tam 10.
🟫 besinsiz bahçe toprağı · 🍂 olgun kompost · 🌱 kapak toprağı (%35 koyun gübresi, %35 kompost, %15 dere mili, %15 yerli toprak; bitkinin besin ihtiyacı bununla karşılanır) · ⚪ pomza 3–8 mm (drenaj) · 🫴🏻N dikimde N avuç dolomit (yalnız kireç/nötr-alkali toprak isteyenlere) · ↻🫴🏻1/3y 3 yılda bir 1 avuç (kireç isteyenlere) · 🌲malç üste kuru çam iğnesi (yalnız asit sever / ortanca).
Torf, ayrı koyun gübresi, silis kumu KULLANILMAZ. Yerli toprak hafif asidik (pH 5,5–6,8), sulama yumuşak kuyu suyu: asidik-nötr sevene kireç verme; pH ≥7 isteyene 🫴🏻1–2.
Simgeler boşlukla ayrılır; değeri sıfır olan simge ASLA yazılmaz (🫴🏻0, ⚪0 gibi yazım yasak; kireç yoksa 🫴🏻 hiç yazılmaz); ek kısımlar ' · ' ile.
Tipik reçeteler:
Akdeniz/kireç sever: '🟫6 🍂1 ⚪3 🫴🏻2 ↻🫴🏻1/3y' · kurakçıl fakir drene (sukulent, damkoruğu): '🟫6 🍂1 ⚪3' · orta besin drene: '🟫5 🍂2 🌱2 ⚪1' · humuslu drene: '🟫4 🍂2 🌱3 ⚪1' · besin sever (gül): '🟫3 🍂3 🌱3 ⚪1' · nemli humuslu: '🟫3 🍂4 🌱3' · ortanca: '🟫4 🍂6 · 🌲malç' · asit sever (funda): '🟫4 🍂3 ⚪3 · 🌲malç'`;

const PROMPT = (ad: string) => `Sen bir bahçe uzmanısın. Bahçe İstanbul Beykoz Çavuşbaşı'nda (kış minimumu genelde −5/−8 °C, yazlar sıcak-nemli). Kullanıcı bir bitki adı yazdı (herhangi bir dilde, Türkçe yerel ad, İngilizce, Almanca, Latince olabilir; yazım hatası olabilir).
Bitkiyi tanı ve YALNIZ şu JSON'u döndür, başka hiçbir şey yazma:
{"bulundu":true,"latince":"<güncel kabul görmüş bilimsel ad; tür düzeyinde, sinonim değil>","ad":"<Türkçe yaygın ad; yoksa cins adı>","isik":"<yalnız simgeler: ☀️ ⛅ ☁️ ya da ikili ☀️⛅ / ⛅☁️>","soguk":"<dayanabildiği en düşük sıcaklık, yalnız derece, eksi işareti U+2212: örn −15°>","toprak":"<aşağıdaki TOPRAK kuralına göre karışım reçetesi>","sulama":"<Az|Orta|Çok>","bakim":[{"ay":<1-12>,"is":"<İstanbul iklimine göre o ayın bakım işi, kısa emir cümlesi, en fazla 70 karakter, ';' ile en fazla 2 iş>"}]}
TOPRAK kuralı: ${TOPRAK_KURAL}
bakim: yalnız iş olan aylar, 5-9 kayıt, her ay en fazla bir kayıt. Tanıyamazsan {"bulundu":false} döndür.
Bitki adı: ${ad}`;

const PROMPT_TOPRAK = (latince: string, onceki: string) => `Bitki: ${latince}. Bahçe İstanbul Çavuşbaşı. Önceki toprak cevabı kurala uymadı: "${onceki}".
Kural: ${TOPRAK_KURAL}
YALNIZ şu JSON'u döndür: {"toprak":"<reçete>"}`;

/* Sıfır değerli simgeleri (🫴🏻0, ↻🫴🏻0/3y, ⚪0 …) ve boş kalan ' · ' kısımlarını at */
function sifirTemizle(t: string): string {
  return (t || "")
    .split("·")
    .map((p) => p.trim().split(/\s+/).filter((k) => k && !/^(↻?🫴🏻|🟫|🍂|🌱|⚪)0(\/\d+y)?$/u.test(k)).join(" "))
    .filter((p) => p)
    .join(" · ");
}

/* Reçete geçerli mi: 🟫 ile başlar, harf/pH yok, 🟫🍂🌱⚪ toplamı 10 */
function receteGecerli(t: string): boolean {
  if (!t || !t.startsWith("🟫")) return false;
  if (/pH|[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/.test(t.replace("malç", ""))) return false;
  let top = 0;
  for (const s of ["🟫", "🍂", "🌱", "⚪"]) {
    const m = t.match(new RegExp(s + "(\\d+)"));
    if (m) top += Number(m[1]);
  }
  return top === 10;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ARB_OK(req)) return json({ ok: false, error: "yetkisiz" }, 401);
  try {
    const inp: any = await req.json().catch(() => ({}));
    const ad = String(inp?.ad || "").trim();
    if (!ad || ad.length > 80) return json({ ok: false, error: "Bitki adı boş ya da çok uzun." }, 400);
    if (!ANTHROPIC_KEY) return json({ ok: false, error: "ANTHROPIC_API_KEY tanımlı değil." }, 400);
    const o = await llm(PROMPT(ad));
    if (!o || !o.bulundu || !o.latince) return json({ ok: false, error: `"${ad}" tanınamadı.` }, 404);
    const latince = String(o.latince).trim();
    const var_ = await rest("GET", `bahce_bitki?latince=ilike.${encodeURIComponent(latince)}&select=id,latince`);
    if (Array.isArray(var_) && var_.length) return json({ ok: true, existed: true, latince, id: var_[0].id });
    const S = (x: unknown) => (x == null ? null : String(x).trim() || null);
    const oneOf = (x: unknown, a: string[]) => { const v = S(x); return v && a.includes(v) ? v : null; };
    let toprak = sifirTemizle(S(o.toprak) || "");
    if (!receteGecerli(toprak)) {
      try { const t2 = await llm(PROMPT_TOPRAK(latince, toprak)); toprak = sifirTemizle(S(t2?.toprak) || ""); } catch { /* yoksay */ }
      if (!receteGecerli(toprak)) toprak = "";
    }
    const row = {
      ad: S(o.ad) || latince, latince,
      isik: (S(o.isik) || "").replace(/[^☀️⛅☁️]/g, "") || null,
      soguk: (S(o.soguk) || "").replace(/-/g, "−") || null,
      toprak: toprak || null,
      sulama: oneOf(o.sulama, ["Az", "Orta", "Çok"]),
    };
    const ins = await rest("POST", "bahce_bitki?select=id", [row], "return=representation");
    const id = ins[0].id;
    const seen = new Set<number>();
    const bk = (Array.isArray(o.bakim) ? o.bakim : []).map((b: any) => ({ bitki_id: id, ay: Number(b.ay), is_: S(b.is) }))
      .filter((b: any) => b.ay >= 1 && b.ay <= 12 && b.is_ && !seen.has(b.ay) && seen.add(b.ay));
    if (bk.length) await rest("POST", "bahce_bakim", bk, "return=minimal");
    return json({ ok: true, existed: false, id, ...row, bakim: bk.length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
