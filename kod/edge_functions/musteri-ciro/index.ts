// Supabase Edge Function: musteri-ciro (2026-10-06, Melih) — MUSTERI-CIRO-OTO
// Müşteriler formunda fiyat sınıf listelerine girmeyen şirketlerin son yıllık cirosunu
// Anthropic + web_search ile bulur, musteri_firma.ciro_mn/ciro_birim/ciro_yil/ciro_kaynak'a yazar,
// her aramada ciro_arandi damgalanır (bulunamazsa yalnız damga → form "(ciro bilgisi bulunamadı)" yazar).
// Aday: sınıfsız + (ciro_arandi boş ya da 365 günden eski). body: {limit?:1-5, id?:<musteri_firma.id>}
// Çağıran: ERP çekim görevi 5. adım (kod/_musteri_ciro_bul.py, kalan=0 olana dek döngü).
// Güvenlik: ARB_OK (service_role / @arbor.com.tr). SECRET: ANTHROPIC_API_KEY. verify_jwt=false (v1 06.10.2026).
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

async function rest(method: string, path: string, body?: unknown) {
  const h: Record<string, string> = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`REST ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

const k = (s: unknown) => String(s ?? "").trim().toLocaleLowerCase("tr");

const PROMPT = (firma: string, blok: string) => `Bir pencere-cephe üreticisinin yurt dışı müşteri listesindeki şirketin son yıllık cirosunu (gelir / chiffre d'affaires / turnover / Umsatz) web'de ara.
Şirket adı: "${firma}". Bağlam: ${blok === "YD1" ? "Fransa müşterisi (pappers.fr, societe.com; varsa konsolide grup CA tercih)" : "İngiltere veya Almanya müşterisi (Companies House, endole.co.uk, sektör haberleri; Almanya: northdata.de)"}. Müşteriler inşaat firması, yüklenici, geliştirici veya cephe firmasıdır.
Kurallar: Yalnız şirket açıkça eşleşiyorsa ve açıklanmış (tahmini olmayan) bir ciro varsa yaz. Ad birden çok şirkete uyuyorsa, kişi adıysa, belediye/kamu kurumuysa ya da ciro açıklanmıyorsa bulundu=false.
YALNIZ şu JSON'u döndür, başka hiçbir şey yazma:
{"bulundu":true,"ciro_mn":<milyon cinsinden sayı, ör. 12.2>,"birim":"<€ veya £>","yil":<mali yıl, ör. 2025>,"kaynak":"<kısa açıklama — site adı, en fazla 90 karakter>"}
ya da {"bulundu":false}`;

async function llm(prompt: string): Promise<any> {
  let last = "";
  for (const model of MODELS) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const b = await r.text();
    if (!r.ok) { last = `Anthropic ${r.status}: ${b.slice(0, 300)}`; continue; }
    const blocks = (JSON.parse(b).content || []).filter((c: any) => c.type === "text");
    const txt = blocks.map((c: any) => c.text).join("\n");
    const s = txt.lastIndexOf('{"bulundu"') >= 0 ? txt.lastIndexOf('{"bulundu"') : txt.lastIndexOf("{");
    const e = txt.indexOf("}", s);
    if (s < 0 || e <= s) { last = "JSON yok: " + txt.slice(0, 200); continue; }
    return JSON.parse(txt.slice(s, e + 1));
  }
  throw new Error(last);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ARB_OK(req)) return json({ ok: false, error: "yetkisiz" }, 401);
  try {
    if (!ANTHROPIC_KEY) return json({ ok: false, error: "ANTHROPIC_API_KEY tanımlı değil." }, 400);
    const inp: any = await req.json().catch(() => ({}));
    const limit = Math.min(5, Math.max(1, Number(inp?.limit) || 3));
    const [F, S] = await Promise.all([
      rest("GET", "musteri_firma?select=id,blok,firma,ciro_arandi&order=id"),
      rest("GET", "fiyat_musteri_sinif?select=sinif,ad"),
    ]);
    const sinifli = new Set((S || []).map((x: any) => (x.sinif <= 2 ? "YD1" : "YD2") + "|" + k(x.ad)));
    const esik = Date.now() - 365 * 864e5;
    let aday = (F || []).filter((f: any) => !sinifli.has(f.blok + "|" + k(f.firma)) &&
      (!f.ciro_arandi || Date.parse(f.ciro_arandi) < esik));
    if (inp?.id) aday = (F || []).filter((f: any) => f.id === Number(inp.id) && !sinifli.has(f.blok + "|" + k(f.firma)));
    aday.sort((a: any, b: any) => (a.ciro_arandi ? 1 : 0) - (b.ciro_arandi ? 1 : 0) || a.id - b.id);
    const isle = aday.slice(0, limit), sonuc: any[] = [];
    const yilMax = new Date().getFullYear();
    for (const f of isle) {
      try {
        const o = await llm(PROMPT(f.firma, f.blok));
        const c = Number(o?.ciro_mn), y = Number(o?.yil), bi = String(o?.birim || "").trim();
        const gecerli = o?.bulundu === true && c > 0 && c < 1e6 && ["€", "£"].includes(bi) && y >= 2018 && y <= yilMax;
        const now = new Date().toISOString();
        if (gecerli) {
          await rest("PATCH", `musteri_firma?id=eq.${f.id}`, { ciro_mn: Math.round(c * 100) / 100, ciro_birim: bi, ciro_yil: y,
            ciro_kaynak: String(o.kaynak || "").slice(0, 120) || null, ciro_arandi: now });
          sonuc.push({ id: f.id, firma: f.firma, ciro: `${c} M${bi} ${y}` });
        } else {
          await rest("PATCH", `musteri_firma?id=eq.${f.id}`, { ciro_arandi: now });
          sonuc.push({ id: f.id, firma: f.firma, ciro: null });
        }
      } catch (e) {
        sonuc.push({ id: f.id, firma: f.firma, hata: String(e).slice(0, 200) }); // damga yok → sonra tekrar denenir
      }
    }
    const hata = sonuc.filter((x) => x.hata).length;
    return json({ ok: true, islenen: isle.length, hata, kalan: inp?.id ? 0 : aday.length - isle.length - 0, sonuc });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
