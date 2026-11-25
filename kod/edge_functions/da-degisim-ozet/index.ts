// Supabase Edge Function: da-degisim-ozet  (v1 — 2026-08-28)
// ob-degisim-ozet'in BİREBİR DA eşi. DA Faaliyet formundaki HAFTALIK GÜNCELLEME düğmesi
// çağırır (mod yok), AYLIK GÜNCELLE ise body:{mod:"aylik"} ile çağırır.
// Yaptığı:
//   1) Her aktif işin O HAFTAKİ hâlini da_isler_log'a yazar (is_id + hafta benzersiz; konu da
//      saklanır → iş silinse bile geçmişi okunabilir kalır).
//   2) ÖNCEKİ (onceki_durum + onceki_not) ile ŞİMDİKİ hâl arasındaki değişimin LLM özeti → degisim_ozet
//      ("Son Değişim Özeti"); değişim yoksa "Değişiklik yok." yazılır; sonra şimdiki → önceki kaydırılır.
//   3) ÖNCEKİ AYIN SON raporundan bugüne olan değişimin LLM özeti → aylik_ozet ("Aylık Değişim Özeti").
//   4) mod:"aylik" → KAPANAN AYIN tespitleri: tamamlanan / gelişme / yerinde sayan işler + serbest
//      paragraf → da_aylik_faaliyet (da_yorum'a DOKUNMAZ).
// SECRET: ANTHROPIC_API_KEY.

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

/* Yalnız arbor hesabı ya da service_role çağırabilir (publishable anahtar gecerli JWT sayiliyor). */
function ARB_OK(req: Request): boolean {
  try {
    const a = req.headers.get("authorization") || "";
    const t = a.replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p.role === "service_role") return true;
    return typeof p.email === "string" && p.email.endsWith("@arbor.com.tr");
  } catch { return false; }
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

function birlesik(durum: string, not: string) {
  return `Durum: ${(durum||"").trim()}\nDA Notları: ${(not||"").trim()}`;
}
/* Europe/Istanbul takvim günü (UTC+3, yaz saati uygulanmıyor) */
function bugunTR(): string {
  return new Date(Date.now() + 3*3600*1000).toISOString().slice(0,10);
}

async function llmText(prompt: string, maxTok: number): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTok, messages: [{ role: "user", content: prompt }] }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${body}`);
  const data = JSON.parse(body);
  return (data.content && data.content[0] && data.content[0].text) || "";
}
async function llmArr(prompt: string, maxTok: number): Promise<any[]> {
  let txt = await llmText(prompt, maxTok);
  const s = txt.indexOf("["), e = txt.lastIndexOf("]");
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
  return JSON.parse(txt || "[]");
}
async function llmObj(prompt: string, maxTok: number): Promise<any> {
  let txt = await llmText(prompt, maxTok);
  const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
  return JSON.parse(txt || "{}");
}

async function summarize(pairs: {key:string; onceki:string; simdi:string}[], baslik: string): Promise<Record<string,string>> {
  const prompt =
    "Aşağıda DA'nın takip ettiği işlerin " + baslik + " var. " +
    "Her iş için önceki hâle göre NE DEĞİŞTİĞİNİ tek kısa Türkçe cümleyle özetle (en çok ~15 kelime). " +
    "Sadece geçerli JSON dizisi döndür: [{\"key\":\"...\",\"ozet\":\"...\"}]. Başka metin yazma.\n\n" +
    JSON.stringify(pairs, null, 0);
  const arr = await llmArr(prompt, 1500);
  const out: Record<string,string> = {};
  for (const it of arr) if (it && it.key != null) out[String(it.key)] = String(it.ozet || "");
  return out;
}

/* Kapanan ayın tespitleri — Tamamlanan / Gelişme / Yerinde Sayan + serbest paragraf */
async function aylikTespit(donem: string, items: any[]): Promise<any> {
  const prompt =
    "Aşağıda DA'nın takip ettiği işlerin " + donem + " ayına ait haftalık kayıtları var. " +
    "Her iş için: konu, ay başındaki hâli (baslangic), ay içindeki haftalık kayıtlar (gecmis, eskiden yeniye) ve ay sonundaki hâli (son).\n\n" +
    "Şu JSON nesnesini döndür (başka metin yazma):\n" +
    "{\"tamamlanan\":[konu...],\"gelisme\":[konu...],\"yerinde_sayan\":[konu...],\"faaliyet\":\"...\"}\n\n" +
    "Kurallar:\n" +
    "- tamamlanan: ay içinde durumu Tamamlandı olan işler.\n" +
    "- gelisme: tamamlanmamış ama durumu ya da notu ay içinde anlamlı biçimde değişen işler.\n" +
    "- yerinde_sayan: ay boyunca durumu ve notu değişmeyen işler.\n" +
    "- Bu üç listede işleri SADECE 'konu' alanındaki metinle, aynen yaz; kısaltma, açıklama ekleme.\n" +
    "- Her iş yalnızca bir listede yer alsın.\n" +
    "- faaliyet: yukarıdaki işlerde ay içinde kaydedilen gelişmeleri serbest bir paragraf hâlinde özetle " +
    "(en çok 6 cümle, Türkçe, veride olmayan şeyi yazma, abartma).\n\n" +
    JSON.stringify(items, null, 0);
  return await llmObj(prompt, 3000);
}

/* AYLIK DEĞİŞİM ÖZETİ — önceki ayın SON raporundaki hâl ile FORMUN BUGÜNKÜ hâli arasındaki fark. */
async function aylikOzetler(active: any[], bugun: string): Promise<Record<string,string>> {
  const out: Record<string,string> = {};
  if (!active.length) return out;
  const d2 = new Date(bugun + "T00:00:00Z");
  const buAyBas = new Date(Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), 1)).toISOString().slice(0,10);
  const ids = active.map((r: any) => r.id).join(",");
  const log2 = await rest("GET", `da_isler_log?is_id=in.(${ids})&hafta=lt.${buAyBas}&select=is_id,hafta,durum,da_notlari&order=hafta.asc`) || [];
  const son: Record<string, any> = {};
  for (const l of log2 as any[]) son[String(l.is_id)] = l;     /* asc → en sonuncusu kalır */
  const ap: any[] = [];
  for (const r of active as any[]) {
    const p = son[String(r.id)];
    if (!p) continue;
    const prev = birlesik(p.durum||"", p.da_notlari||"").trim();
    const now  = birlesik(r.durum||"", r.da_notlari||"").trim();
    if (prev === now) { out[String(r.id)] = "Değişiklik yok."; continue; }
    ap.push({ key: String(r.id), onceki: prev, simdi: now });
  }
  if (ap.length && ANTHROPIC_KEY) {
    try {
      const s2 = await summarize(ap, "ÖNCEKİ AYIN SON raporundaki hâli ve BUGÜNKÜ hâli (Durum + DA Notları)");
      Object.assign(out, s2);
    } catch (_e) { /* üretilemezse akış bozulmasın */ }
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ARB_OK(req)) return json({ ok: false, error: "yetkisiz" }, 401);
  try {
    const bodyIn: any = await req.json().catch(() => ({}));
    const modAylik = !!(bodyIn && bodyIn.mod === "aylik");
    const bugun = bugunTR();

    /* ---------- MOD: AYLIK FAALİYET (kapanan ay) ---------- */
    if (modAylik) {
      const d = new Date(bugun + "T00:00:00Z");
      const ayBas = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));   /* kapanan ayın 1'i */
      const ayBit = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));       /* kapanan ayın son günü */
      const donem = ayBas.toISOString().slice(0,7);
      const b0 = ayBas.toISOString().slice(0,10), b1 = ayBit.toISOString().slice(0,10);

      const log = await rest("GET", `da_isler_log?select=is_id,konu,hafta,durum,da_notlari&order=hafta.asc&limit=5000`) || [];
      const byId: Record<string, any[]> = {};
      for (const l of log as any[]) (byId[String(l.is_id)] = byId[String(l.is_id)] || []).push(l);

      /* Önceliği "Rutin" olan işler AYLIK FAALİYET kapsamı DIŞINDA: süregelen rutin takipler
         aylık tespitlerde sayılmaz. Silinmiş işler (is_id null) kapsamda kalır. */
      const isler = await rest("GET", "da_isler?select=id,oncelik") || [];
      const rutin = new Set((isler as any[])
        .filter(x => String(x.oncelik || "").trim().toLowerCase() === "rutin")
        .map(x => String(x.id)));

      const items: any[] = [];
      for (const k of Object.keys(byId)) {
        if (rutin.has(k)) continue;
        const g = byId[k];
        const ic = g.filter((x:any)=> x.hafta >= b0 && x.hafta <= b1);
        if (!ic.length) continue;
        const once = g.filter((x:any)=> x.hafta < b0).slice(-1)[0] || null;
        const son = ic[ic.length-1];
        items.push({
          konu: String(son.konu || (once && once.konu) || ""),
          baslangic: once ? { durum: once.durum, not: once.da_notlari } : null,
          gecmis: ic.map((x:any)=>({ hafta: x.hafta, durum: x.durum, not: x.da_notlari })),
          son: { durum: son.durum, not: son.da_notlari },
        });
      }
      if (!items.length) {
        const bos = { donem, tamamlanan: "", gelisme: "", yerinde_sayan: "",
          faaliyet: donem + " ayına ait haftalık kayıt bulunmuyor.", uretim_at: new Date().toISOString() };
        await rest("POST", "da_aylik_faaliyet?on_conflict=donem", [bos], "resolution=merge-duplicates,return=minimal");
        return json({ ok: true, donem, adet: 0, note: donem + " için haftalık kayıt yok." });
      }
      if (!ANTHROPIC_KEY) return json({ ok: false, need_key: true, error: "ANTHROPIC_API_KEY tanimli degil." }, 400);
      const t = await aylikTespit(donem, items);
      const liste = (v: any) => Array.isArray(v) ? v.filter(Boolean).map(String).join("\n") : String(v || "");
      const row = {
        donem,
        tamamlanan: liste(t.tamamlanan),
        gelisme: liste(t.gelisme),
        yerinde_sayan: liste(t.yerinde_sayan),
        faaliyet: String(t.faaliyet || ""),
        uretim_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await rest("POST", "da_aylik_faaliyet?on_conflict=donem", [row], "resolution=merge-duplicates,return=minimal");
      /* Aylık Değişim Özeti sütunu da FORMUN güncel hâlinden tazelenir (degisim_ozet ve
         onceki_* alanlarına DOKUNULMAZ — onlar yalnız haftalıkta kayar). */
      let ayn = 0;
      try {
        const act = await rest("GET", "da_isler?arsiv=eq.false&select=id,durum,da_notlari") || [];
        const ao = await aylikOzetler(act as any[], bugun);
        for (const r of act as any[]) {
          if (!ao[String(r.id)]) continue;
          await rest("PATCH", `da_isler?id=eq.${r.id}`, { aylik_ozet: ao[String(r.id)] }, "return=minimal"); ayn++;
        }
      } catch (_e) { /* aylık özet tazelenemezse tespit üretimi yine de geçerli */ }
      return json({ ok: true, donem, adet: items.length, aylik: ayn,
        note: donem + " aylık faaliyet tespitleri üretildi (" + items.length + " iş) · " + ayn + " aylık değişim özeti tazelendi." });
    }

    /* ---------- MOD: HAFTALIK ---------- */
    const rows = await rest("GET", "da_isler?arsiv=eq.false&select=id,konu,durum,da_notlari,onceki_durum,onceki_not,baslangic");
    const active = rows || [];

    /* 1) Bu haftanın kaydı log'a (aynı gün ikinci basışta üzerine yazar) */
    if (active.length) {
      const logRows = active.map((r: any) => ({ is_id: r.id, hafta: bugun, durum: r.durum, da_notlari: r.da_notlari, konu: r.konu }));
      await rest("POST", "da_isler_log?on_conflict=is_id,hafta", logRows, "resolution=merge-duplicates,return=minimal");
    }

    /* 2) Son değişim özeti (önceki → şimdi) */
    const pairs = active
      .filter((r: any) => {
        const prev = birlesik(r.onceki_durum || "", r.onceki_not || "").trim();
        const now  = birlesik(r.durum || "", r.da_notlari || "").trim();
        const hasPrev = (String(r.onceki_durum||"").trim() || String(r.onceki_not||"").trim());
        return hasPrev && prev !== now;
      })
      .map((r: any) => ({ key: String(r.id), onceki: birlesik(r.onceki_durum||"", r.onceki_not||""), simdi: birlesik(r.durum||"", r.da_notlari||"") }));

    if (pairs.length > 0 && !ANTHROPIC_KEY)
      return json({ ok: false, need_key: true, error: "ANTHROPIC_API_KEY tanimli degil." }, 400);

    const summaries = pairs.length ? await summarize(pairs, "ÖNCEKİ ve ŞİMDİKİ hâli (Durum + DA Notları)") : {};

    /* 3) Aylık değişim özeti — ÖNCEKİ AYIN SON raporundan bugüne (ay içinde her hafta gelişir) */
    const aylik = await aylikOzetler(active, bugun);

    let updated = 0, ozetli = 0;
    for (const r of active as any[]) {
      const hasPrev = (String(r.onceki_durum||"").trim() || String(r.onceki_not||"").trim());
      const now  = birlesik(r.durum||"", r.da_notlari||"").trim();
      const prev = birlesik(r.onceki_durum||"", r.onceki_not||"").trim();
      const changed = hasPrev && prev !== now;
      /* Değişim yoksa sütun BOŞ bırakılmaz — "Değişiklik yok." yazılır; gerçekten önceki hâli
         olmayan iş (ilk basış / baseline) yine boş kalır. */
      const ozet = changed ? (summaries[String(r.id)] || "") : "";
      if (ozet) ozetli++;
      const patch: Record<string, unknown> = {
        degisim_ozet: ozet || (hasPrev ? "Değişiklik yok." : null),
        aylik_ozet: aylik[String(r.id)] || null,
        onceki_durum: r.durum, onceki_not: r.da_notlari,
        updated_at: new Date().toISOString(),
      };
      if (!r.baslangic) patch.baslangic = bugun;
      await rest("PATCH", `da_isler?id=eq.${r.id}`, patch, "return=minimal"); updated++;
    }
    return json({ ok: true, updated, ozetli, aylik: Object.keys(aylik).length,
      note: `${updated} iş güncellendi, ${ozetli} değişim özeti, ${Object.keys(aylik).length} aylık özet üretildi.` });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
