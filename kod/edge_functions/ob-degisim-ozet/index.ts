// Supabase Edge Function: ob-degisim-ozet  (v9 — 2026-09-23, OB-AY-TABAN)
// v9: haftalık log 18.09'da kaldırıldığı için aylık taban ob_isler_ay_taban'a yazılır (kapanan ayın son günü
//     tarihiyle); tabanı olmayan işe "Yeni iş — ay içinde eklendi."; tespitlerde son = işin güncel hâli.
// ÖB Faaliyet formundaki HAFTALIK GÜNCELLEME düğmesi çağırır (mod yok), AYLIK GÜNCELLE ise
// ayrıca body:{mod:"aylik"} ile çağırır.
// Yaptığı:
//   1) Her aktif işin O HAFTAKİ hâlini ob_isler_log'a yazar (is_id + hafta benzersiz; konu da
//      saklanır → iş silinse bile geçmişi okunabilir kalır).
//   2) ÖNCEKİ (onceki_durum + onceki_not) ile ŞİMDİKİ hâl arasındaki değişimin LLM özeti → degisim_ozet
//      ("Son Değişim Özeti"); değişim yoksa "Değişiklik yok." yazılır; sonra şimdiki → önceki kaydırılır.
//   3) ÖNCEKİ AYIN SON raporundan bugüne olan değişimin LLM özeti → aylik_ozet ("Aylık Değişim Özeti").
//   4) mod:"aylik" → KAPANAN AYIN (cari aydan bir önceki ay) tespitleri: tamamlanan / gelişme
//      kaydedilen / yerinde sayan işler + serbest paragraf → ob_aylik_faaliyet (ob_yorum'a DOKUNMAZ).
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
    if (SERVICE_KEY && t === SERVICE_KEY) return true;
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
  return `Durum: ${(durum||"").trim()}\nÖB Notları: ${(not||"").trim()}`;
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
    "Aşağıda ÖB'nin takip ettiği işlerin " + baslik + " var. " +
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
    "Aşağıda ÖB'nin (Özgül Bedestenci) takip ettiği işlerin " + donem + " ayına ait haftalık kayıtları var. " +
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

/* AYLIK DEĞİŞİM ÖZETİ — önceki ayın SON raporundaki hâl ile FORMUN BUGÜNKÜ hâli arasındaki fark.
   Hem haftalık hem aylık güncellemede yeniden hesaplanır: ay içinde pano üstünde gelişir,
   aylık güncellemede formdan tazelenir (27.08.2026, Melih). */
/* OB-AY-TABAN: haftalık log (ob_isler_log) + aylık taban (ob_isler_ay_taban) tek kronolojik dizi. */
async function kayitlar(filtreIds?: string): Promise<any[]> {
  const f = filtreIds ? `is_id=in.(${filtreIds})&` : "";
  const [a, b] = await Promise.all([
    rest("GET", `ob_isler_log?${f}select=is_id,konu,hafta,durum,ob_notlari&order=hafta.asc&limit=5000`),
    rest("GET", `ob_isler_ay_taban?${f}select=is_id,konu,tarih,durum,ob_notlari&order=tarih.asc&limit=5000`),
  ]);
  const all = [...((a as any[]) || []), ...(((b as any[]) || []).map((x: any) => ({ ...x, hafta: x.tarih })))];
  all.sort((x: any, y: any) => (x.hafta < y.hafta ? -1 : x.hafta > y.hafta ? 1 : 0));
  return all;
}

/* cutoff (hariç): bu tarihten ÖNCEKİ son kayıt taban alınır. Tabanı olmayan iş = ay içinde eklendi. */
async function aylikOzetler(active: any[], cutoff: string): Promise<Record<string,string>> {
  const out: Record<string,string> = {};
  if (!active.length) return out;
  const ids = active.map((r: any) => r.id).join(",");
  const log2 = (await kayitlar(ids)).filter((l: any) => l.hafta < cutoff);
  const son: Record<string, any> = {};
  for (const l of log2 as any[]) son[String(l.is_id)] = l;     /* asc → en sonuncusu kalır */
  const ap: any[] = [];
  for (const r of active as any[]) {
    const p = son[String(r.id)];
    if (!p) { out[String(r.id)] = "Yeni iş — ay içinde eklendi."; continue; }
    const prev = birlesik(p.durum||"", p.ob_notlari||"").trim();
    const now  = birlesik(r.durum||"", r.ob_notlari||"").trim();
    if (prev === now) { out[String(r.id)] = "Değişiklik yok."; continue; }
    ap.push({ key: String(r.id), onceki: prev, simdi: now });
  }
  if (ap.length && ANTHROPIC_KEY) {
    try {
      const s2 = await summarize(ap, "ÖNCEKİ AYIN SON raporundaki hâli ve BUGÜNKÜ hâli (Durum + ÖB Notları)");
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

      const log = await kayitlar();
      const byId: Record<string, any[]> = {};
      for (const l of log as any[]) (byId[String(l.is_id)] = byId[String(l.is_id)] || []).push(l);

      /* Önceliği "Rutin" olan işler AYLIK FAALİYET kapsamı DIŞINDA (27.08.2026, Melih):
         süregelen rutin takipler aylık tespitlerde sayılmaz. Silinmiş işler (is_id null)
         önceliği okunamadığı için kapsamda kalır. */
      const isler = await rest("GET", "ob_isler?select=id,oncelik,arsiv,konu,durum,ob_notlari") || [];
      const guncel: Record<string, any> = {};
      for (const x of isler as any[]) if (!x.arsiv) guncel[String(x.id)] = x;
      for (const k of Object.keys(guncel)) if (!byId[k]) byId[k] = [];
      const rutin = new Set((isler as any[])
        .filter(x => String(x.oncelik || "").trim().toLowerCase() === "rutin")
        .map(x => String(x.id)));

      const items: any[] = [];
      for (const k of Object.keys(byId)) {
        if (rutin.has(k)) continue;
        const g = byId[k];
        const ic = g.filter((x:any)=> x.hafta >= b0 && x.hafta <= b1);
        const gu = guncel[k];                     /* aktif işin son hâli = güncel form (OB-AY-TABAN) */
        if (!ic.length && !gu) continue;
        const once = g.filter((x:any)=> x.hafta < b0).slice(-1)[0] || null;
        const son = gu ? { konu: gu.konu, durum: gu.durum, ob_notlari: gu.ob_notlari } : ic[ic.length-1];
        items.push({
          konu: String(son.konu || (once && once.konu) || ""),
          baslangic: once ? { durum: once.durum, not: once.ob_notlari } : null,
          gecmis: ic.map((x:any)=>({ hafta: x.hafta, durum: x.durum, not: x.ob_notlari })),
          son: { durum: son.durum, not: son.ob_notlari },
        });
      }
      if (!items.length) {
        const bos = { donem, tamamlanan: "", gelisme: "", yerinde_sayan: "",
          faaliyet: donem + " ayına ait haftalık kayıt bulunmuyor.", uretim_at: new Date().toISOString() };
        await rest("POST", "ob_aylik_faaliyet?on_conflict=donem", [bos], "resolution=merge-duplicates,return=minimal");
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
      await rest("POST", "ob_aylik_faaliyet?on_conflict=donem", [row], "resolution=merge-duplicates,return=minimal");
      /* Aylık Değişim Özeti sütunu da FORMUN güncel hâlinden tazelenir (degisim_ozet ve
         onceki_* alanlarına DOKUNULMAZ — onlar yalnız haftalıkta kayar). */
      let ayn = 0;
      try {
        const act = await rest("GET", "ob_isler?arsiv=eq.false&select=id,durum,ob_notlari") || [];
        const ao = await aylikOzetler(act as any[], b1);   /* b1 hariç: taban kendi yazdığı b1 kaydını görmez */
        for (const r of act as any[]) {
          if (!ao[String(r.id)]) continue;
          await rest("PATCH", `ob_isler?id=eq.${r.id}`, { aylik_ozet: ao[String(r.id)] }, "return=minimal"); ayn++;
        }
      } catch (_e) { /* aylık özet tazelenemezse tespit üretimi yine de geçerli */ }
      /* OB-AY-TABAN: aktif işlerin bugünkü hâli kapanan ayın son günü tarihiyle dondurulur →
         bir sonraki ayın Aylık Değişim Özeti ve tespitlerinin tabanı. */
      let taban = 0;
      try {
        const act2 = await rest("GET", "ob_isler?arsiv=eq.false&select=id,konu,durum,ob_notlari") || [];
        const tr = (act2 as any[]).map((r: any) => ({ is_id: r.id, tarih: b1, konu: r.konu, durum: r.durum, ob_notlari: r.ob_notlari }));
        if (tr.length) await rest("POST", "ob_isler_ay_taban?on_conflict=is_id,tarih", tr, "resolution=merge-duplicates,return=minimal");
        taban = tr.length;
      } catch (_e) { }
      return json({ ok: true, donem, adet: items.length, aylik: ayn, taban,
        note: donem + " aylık faaliyet tespitleri üretildi (" + items.length + " iş) · " + ayn + " aylık değişim özeti tazelendi." });
    }

    /* ---------- MOD: HAFTALIK ---------- */
    const rows = await rest("GET", "ob_isler?arsiv=eq.false&select=id,konu,durum,ob_notlari,onceki_durum,onceki_not,baslangic");
    const active = rows || [];

    /* 1) Bu haftanın kaydı log'a (aynı gün ikinci basışta üzerine yazar) */
    if (active.length) {
      const logRows = active.map((r: any) => ({ is_id: r.id, hafta: bugun, durum: r.durum, ob_notlari: r.ob_notlari, konu: r.konu }));
      await rest("POST", "ob_isler_log?on_conflict=is_id,hafta", logRows, "resolution=merge-duplicates,return=minimal");
    }

    /* 2) Son değişim özeti (önceki → şimdi) */
    const pairs = active
      .filter((r: any) => {
        const prev = birlesik(r.onceki_durum || "", r.onceki_not || "").trim();
        const now  = birlesik(r.durum || "", r.ob_notlari || "").trim();
        const hasPrev = (String(r.onceki_durum||"").trim() || String(r.onceki_not||"").trim());
        return hasPrev && prev !== now;
      })
      .map((r: any) => ({ key: String(r.id), onceki: birlesik(r.onceki_durum||"", r.onceki_not||""), simdi: birlesik(r.durum||"", r.ob_notlari||"") }));

    if (pairs.length > 0 && !ANTHROPIC_KEY)
      return json({ ok: false, need_key: true, error: "ANTHROPIC_API_KEY tanimli degil." }, 400);

    const summaries = pairs.length ? await summarize(pairs, "ÖNCEKİ ve ŞİMDİKİ hâli (Durum + ÖB Notları)") : {};

    /* 3) Aylık değişim özeti — ÖNCEKİ AYIN SON raporundan bugüne (ay içinde her hafta gelişir) */
    const _d3 = new Date(bugun + "T00:00:00Z");
    const aylik = await aylikOzetler(active, new Date(Date.UTC(_d3.getUTCFullYear(), _d3.getUTCMonth(), 1)).toISOString().slice(0,10));

    let updated = 0, ozetli = 0;
    for (const r of active as any[]) {
      const hasPrev = (String(r.onceki_durum||"").trim() || String(r.onceki_not||"").trim());
      const now  = birlesik(r.durum||"", r.ob_notlari||"").trim();
      const prev = birlesik(r.onceki_durum||"", r.onceki_not||"").trim();
      const changed = hasPrev && prev !== now;
      /* Değişim yoksa sütun BOŞ bırakılmaz — "Değişiklik yok." yazılır (26.08.2026, Melih):
         boş hücre "özet üretilemedi" gibi okunuyordu. Gerçekten önceki hâli olmayan iş
         (ilk basış / baseline) yine boş kalır. */
      const ozet = changed ? (summaries[String(r.id)] || "") : "";
      if (ozet) ozetli++;
      const patch: Record<string, unknown> = {
        degisim_ozet: ozet || (hasPrev ? "Değişiklik yok." : null),
        aylik_ozet: aylik[String(r.id)] || null,
        onceki_durum: r.durum, onceki_not: r.ob_notlari,
        updated_at: new Date().toISOString(),
      };
      if (!r.baslangic) patch.baslangic = bugun;
      await rest("PATCH", `ob_isler?id=eq.${r.id}`, patch, "return=minimal"); updated++;
    }
    return json({ ok: true, updated, ozetli, aylik: Object.keys(aylik).length,
      note: `${updated} iş güncellendi, ${ozetli} değişim özeti, ${Object.keys(aylik).length} aylık özet üretildi.` });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
