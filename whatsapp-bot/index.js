// index.js — WhatsApp ⇄ Claude botu (Arbor "Business" asistanı, canlı pano + araçlar)
// Genel Kural 36. SIR İÇERMEZ — tüm anahtar/şifreler process.env'den okunur (Railway Variables).
//
// Yetenekler:
//   1) WhatsApp Cloud API webhook (GET doğrulama + POST mesaj)
//   2) Her mesajda GÜNCEL pano verisi (arbor-panolar Pages, PANOLAR_PW ile çözülür) bağlam olur
//   3) Çok-turlu konuşma hafızası (numara bazlı, TTL'li)
//   4) ARAÇLAR (env varsa aktif, yoksa atıl):
//        - web_ara       → SEARCH_API_KEY (Brave Search)
//        - mail_gonder   → MAIL_WEBHOOK_URL (Zapier Catch Hook)
//        - gundem_ekle   → MAIL_WEBHOOK_URL (int@arbor'a not maili)
//   5) Mail/gündem aksiyonları ÖNCE onay ister (system prompt kuralı)
//
// Zorunlu env: ANTHROPIC_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, VERIFY_TOKEN, PANOLAR_PW
// İsteğe bağlı: SEARCH_API_KEY, MAIL_WEBHOOK_URL, INT_MAIL, MODEL, ALLOWED_NUMBERS,
//   PANOLAR_URL, MAX_CONTEXT_CHARS, CONTEXT_TTL_MS, MEMORY_TTL_MS, MAX_HISTORY, GRAPH_VERSION

const express = require("express");
const crypto = require("node:crypto");

const app = express();
app.use(express.json());

const {
  ANTHROPIC_API_KEY,
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  VERIFY_TOKEN,
  PANOLAR_PW,
  SEARCH_API_KEY,
  MAIL_WEBHOOK_URL,
  OPENAI_API_KEY,
} = process.env;

const INT_MAIL = process.env.INT_MAIL || "int@arbor.com.tr";
const PANOLAR_URL =
  process.env.PANOLAR_URL ||
  "https://melihbilgili.github.io/arbor-panolar/index.html";
const MODEL = process.env.MODEL || "claude-sonnet-5";
const MAX_CONTEXT_CHARS = parseInt(process.env.MAX_CONTEXT_CHARS || "70000", 10);
const CONTEXT_TTL_MS = parseInt(process.env.CONTEXT_TTL_MS || "600000", 10); // 10 dk
const MEMORY_TTL_MS = parseInt(process.env.MEMORY_TTL_MS || "604800000", 10); // 7 gün (KALICI bellek: Railway Volume /data; restart/redeploy'da korunur, 7 günden eski turlar budanır)
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || "24", 10); // son 24 tur (uzun tablo/liste kurgusu geçmişten düşmesin)
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v20.0";
const ALLOWED = (process.env.ALLOWED_NUMBERS || "905322059277")
  .split(",")
  .map((s) => s.replace(/\D/g, ""))
  .filter(Boolean);

const SYSTEM_BASE =
  "Sen Arbor (Arbor Ahşap / Arbor Fenetres) için çalışan Melih Bilgili'nin iş asistanısın. " +
  "WhatsApp üzerinden gelen soruları Türkçe, kısa ve net yanıtlarsın. " +
  "Aşağıdaki '=== GÜNCEL PANO VERİSİ ===' bloğunda şirketin canlı panoları yer alır: " +
  "Gündem, Açık Mailler, PEM/PRJ Sevke Hazır, Yıllık İcmal, AÜP, AÜP Mail, satış yorumları " +
  "(SO/FA/AK), Prosedür, Teklif Kuralları, Özgül Mukayese. " +
  "Pano sorularını YALNIZCA bu veriye dayanarak yanıtla; tarih, sayı ve isimleri panodaki gibi ver. " +
  "Panoda olmayan şirket-içi bir şey sorulursa 'panoda bu bilgi yok' de — asla uydurma. " +
  "Konuşma geçmişini hatırlarsın; önceki mesajlara atıfla tutarlı ol. " +
  "Araçların olabilir (web araması, mail gönderme, gündem notu ekleme, Claude görevi kaydetme). " +
  "⚠️ HAFIZAN KALICIDIR ama SINIRLIDIR: konuşma geçmişin kalıcı diskte (Railway Volume) tutulur; yeniden başlatma/redeploy'da KAYBOLMAZ, " +
  "yaklaşık son 7 gün ve numara başına son 24 tur içinde hatırlanır (daha eskisi otomatik budanır). Uzun vadeli arşiv değildir. " +
  "Geçmiş konuşmaları hatırlıyorsan ona göre tutarlı davran; bu pencerenin dışındaki eski sohbetleri hatırlayamazsın, o durumda uydurma. " +
  "Melih sana bir GÖREV/İŞ verir ya da 'şunu yap / açılınca yap / Claude gündemine ekle / not al / kaydet' derse, " +
  "bunu KALICI kılmak için `claude_gorev_ekle` aracını ONAY BEKLEMEDEN çağır ve `tam_icerik` alanına konuşmada " +
  "üretilen TÜM içeriği (tablolar, listeler dâhil) BİREBİR, özetlemeden koy — kalıcı olan TEK şey bu araca yazdığındır; " +
  "yazmazsan görev kaybolur. Görev kaydı Melih'in kendi kutusuna kalıcı nottur, onay istemezsin. " +
  "Kaydettikten sonra kullanıcıya SADECE şu tarz kısa bir onay ver: 'Claude Gündemi'ne iletildi ✅ — kısa süre içinde panoda görünecek.' " +
  "'int@arbor'a iletildi', 'Claude görevine yazıldı', 'bir sonraki Claude oturumunda/turunda işlenecek' gibi mekanik veya erteleyici ifadeler KULLANMA; " +
  "kullanıcı için hedef HER ZAMAN Claude Gündemi panosudur. " +
  "Buna karşılık ÜÇÜNCÜ KİŞİYE MAIL GÖNDERMEDEN (`mail_gonder`) veya genel iş `gundem_ekle` yapmadan ÖNCE " +
  "ne yapacağını (alıcı, konu, içerik/madde) kısaca özetle ve kullanıcıdan açık ONAY iste; yalnızca 'evet/onayla' sonrası çağır. " +
  "Web aramasını yalnız panoda olmayan güncel/şirket-dışı bilgiler için kullan. " +
  "Token/şifre/anahtar gibi gizli bilgileri asla paylaşma.";

// ---- Şifreli pano verisini çöz (panolar_deploy.py GATE ile birebir uyumlu) ----
function decryptBlob(blobB64, pw) {
  const P = JSON.parse(Buffer.from(blobB64, "base64").toString("utf8")); // {salt,iv,ct,iter}
  const b = (s) => Buffer.from(s, "base64");
  const key = crypto.pbkdf2Sync(pw, b(P.salt), P.iter, 32, "sha256");
  const ct = b(P.ct);
  const data = ct.subarray(0, ct.length - 16); // WebCrypto/Python: tag sona eklenir
  const tag = ct.subarray(ct.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, b(P.iv));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

function htmlToText(html) {
  let t = html;
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = t
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  t = t.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

let _ctxCache = { text: "", ts: 0 };
async function getBusinessContext() {
  const now = Date.now();
  if (_ctxCache.text && now - _ctxCache.ts < CONTEXT_TTL_MS) return _ctxCache.text;
  if (!PANOLAR_PW) throw new Error("PANOLAR_PW yok");
  const res = await fetch(PANOLAR_URL, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error("Pano indirilemedi: HTTP " + res.status);
  const page = await res.text();
  const m = page.match(/const BLOB="([^"]+)"/);
  if (!m) throw new Error("BLOB bulunamadı (pano formatı değişmiş olabilir)");
  let text = htmlToText(decryptBlob(m[1], PANOLAR_PW));
  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS) + "\n…[pano kısaltıldı]";
  }
  _ctxCache = { text, ts: now };
  return text;
}

// ---- Konuşma hafızası (numara bazlı, KALICI: Railway Volume /data) ----
// RAM Map'i korunur (hız) ama her değişiklikte diske (MEM_FILE) yazılır; başlangıçta
// diskten yüklenir → restart/redeploy'da bellek KAYBOLMAZ. Volume yoksa RAM'e düşer (çökmez).
const fs = require("node:fs");
const path = require("node:path");
const MEM_DIR = process.env.MEM_DIR || "/data";
const MEM_FILE = path.join(MEM_DIR, "wa-memory.json");
const _hist = new Map(); // from -> { msgs:[{role,content}], ts }
let _memPersistent = false;

(function initMem() {
  try {
    fs.mkdirSync(MEM_DIR, { recursive: true });
    fs.accessSync(MEM_DIR, fs.constants.W_OK);
    _memPersistent = true;
    if (fs.existsSync(MEM_FILE)) {
      const obj = JSON.parse(fs.readFileSync(MEM_FILE, "utf8")) || {};
      for (const k of Object.keys(obj)) _hist.set(k, obj[k]);
    }
    console.log("[bellek] KALICI bellek aktif ->", MEM_FILE, "(" + _hist.size + " kayit yuklendi)");
  } catch (e) {
    _memPersistent = false;
    console.warn("[bellek] Volume yazilamiyor (" + (e.code || e.message) + "); RAM'e dusuluyor. " +
                 "Kalicilik icin Railway'de Volume ekleyip MEM_DIR'i mount yoluna ayarla.");
  }
})();

let _memTimer = null;
function _saveMem() {
  if (!_memPersistent) return;
  clearTimeout(_memTimer);
  _memTimer = setTimeout(() => {
    try {
      const obj = {};
      for (const [k, v] of _hist.entries()) obj[k] = v;
      const tmp = MEM_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(obj), "utf8"); // atomik: tmp -> rename
      fs.renameSync(tmp, MEM_FILE);
    } catch (e) {
      console.warn("[bellek] kayit hatasi: " + e.message);
    }
  }, 200); // debounce
}

function getHistory(from) {
  const h = _hist.get(from);
  if (!h) return [];
  if (Date.now() - h.ts > MEMORY_TTL_MS) {
    _hist.delete(from);
    _saveMem();
    return [];
  }
  return h.msgs;
}
function pushHistory(from, role, content) {
  const h = _hist.get(from) || { msgs: [], ts: Date.now() };
  h.msgs.push({ role, content });
  const cap = MAX_HISTORY * 2;
  if (h.msgs.length > cap) h.msgs = h.msgs.slice(h.msgs.length - cap);
  h.ts = Date.now();
  _hist.set(from, h);
  _saveMem();
}

// ---- Araçlar (env varsa) ----
function buildTools() {
  const tools = [];
  tools.push({
    name: "web_ara",
    description:
      "Panoda olmayan güncel/genel/şirket-dışı bilgiler için web'de arama yapar.",
    input_schema: {
      type: "object",
      properties: { sorgu: { type: "string", description: "Arama sorgusu" } },
      required: ["sorgu"],
    },
  });
  if (MAIL_WEBHOOK_URL) {
    tools.push({
      name: "mail_gonder",
      description:
        "E-posta gönderir. ÇAĞIRMADAN ÖNCE kullanıcıdan açık onay al (alıcı/konu/içeriği özetle).",
      input_schema: {
        type: "object",
        properties: {
          alici: { type: "string", description: "Alıcı e-posta adresi" },
          konu: { type: "string" },
          govde: { type: "string" },
        },
        required: ["alici", "konu", "govde"],
      },
    });
    tools.push({
      name: "gundem_ekle",
      description:
        "GENEL İŞ gündemine (Açık İşler) madde ekler; int@arbor'a not maili atar. ÇAĞIRMADAN ÖNCE onay al. " +
        "Claude'a verilen görev/iş için bunu DEĞİL `claude_gorev_ekle`'yi kullan.",
      input_schema: {
        type: "object",
        properties: { madde: { type: "string", description: "Gündeme eklenecek madde" } },
        required: ["madde"],
      },
    });
    tools.push({
      name: "claude_gorev_ekle",
      description:
        "Melih'in Claude'a bıraktığı görevi/notu KALICI kaydeder: int@arbor'a 'Claude Görev (WhatsApp bot)' konulu " +
        "mail yazılır ve saatlik triyajla KISA SÜREDE Claude Gündemi panosuna işlenir (Kural 71/71(e)). " +
        "Bot sohbet hafızası kalıcı ama SINIRLI pencereyle (son ~7 gün) tutulur; arşiv/uzun vadeli kalıcılık için TEK doğru yer buraya yazdığındır. Görev niyeti sezilince ONAY BEKLEMEDEN çağır; " +
        "`tam_icerik`e konuşmada üretilen TÜM içeriği (tablo/liste dâhil) BİREBİR koy, özetleme.",
      input_schema: {
        type: "object",
        properties: {
          baslik: { type: "string", description: "Görevin kısa başlığı" },
          tam_icerik: {
            type: "string",
            description: "Görevin/notun tam metni — konuşmada üretilen tablo/liste dâhil BİREBİR, özetsiz",
          },
        },
        required: ["baslik", "tam_icerik"],
      },
    });
  }
  return tools;
}

async function webAra(q) {
  const strip = (x) =>
    (x || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  try {
    if (SEARCH_API_KEY) {
      const r = await fetch(
        "https://api.search.brave.com/res/v1/web/search?count=5&q=" + encodeURIComponent(q),
        { headers: { Accept: "application/json", "X-Subscription-Token": SEARCH_API_KEY } }
      );
      if (r.ok) {
        const d = await r.json();
        const items = ((d.web && d.web.results) || [])
          .slice(0, 5)
          .map((x) => "- " + x.title + ": " + (x.description || "") + " (" + x.url + ")")
          .join("\n");
        if (items) return items;
      }
    }
    // Anahtarsız #1: DuckDuckGo HTML (gerçek web sonuçları)
    try {
      const hr = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
          "Accept-Language": "tr,en;q=0.8",
        },
      });
      if (hr.ok) {
        const html = await hr.text();
        const decode = (u) => {
          const m = u.match(/[?&]uddg=([^&]+)/);
          return m ? decodeURIComponent(m[1]) : u;
        };
        const titles = [];
        const reA = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let m;
        while ((m = reA.exec(html)) && titles.length < 6) {
          titles.push({ url: decode(m[1]), title: strip(m[2]) });
        }
        const snips = [];
        const reS = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let sm;
        while ((sm = reS.exec(html)) && snips.length < 6) snips.push(strip(sm[1]));
        const out = [];
        for (let i = 0; i < titles.length && out.length < 5; i++) {
          if (!titles[i].title) continue;
          out.push("- " + titles[i].title + (snips[i] ? ": " + snips[i] : "") + " (" + titles[i].url + ")");
        }
        if (out.length) return out.join("\n");
      }
    } catch (_) {}
    // Anahtarsız #2: DuckDuckGo Instant Answer (yedek)
    const r = await fetch(
      "https://api.duckduckgo.com/?format=json&no_html=1&t=arborbot&q=" + encodeURIComponent(q)
    );
    if (r.ok) {
      const d = await r.json();
      const out = [];
      if (d.AbstractText) out.push(d.AbstractText + (d.AbstractURL ? " (" + d.AbstractURL + ")" : ""));
      for (const rt of d.RelatedTopics || []) {
        if (rt.Text) out.push("- " + rt.Text + (rt.FirstURL ? " (" + rt.FirstURL + ")" : ""));
        if (out.length >= 6) break;
      }
      if (out.length) return out.join("\n");
    }
    return "Web'de sonuç bulunamadı.";
  } catch (e) {
    return "Arama hatası: " + e.message;
  }
}

async function sendMail(to, subject, body) {
  try {
    const r = await fetch(MAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, subject, body, source: "whatsapp-bot" }),
    });
    return r.ok
      ? "Mail gönderildi (alıcı: " + to + ", konu: " + subject + ")."
      : "Mail gönderilemedi: HTTP " + r.status;
  } catch (e) {
    return "Mail hatası: " + e.message;
  }
}

async function runTool(name, input) {
  if (name === "web_ara") return await webAra(input.sorgu || "");
  if (name === "mail_gonder")
    return await sendMail(input.alici, input.konu, input.govde);
  if (name === "gundem_ekle")
    return await sendMail(INT_MAIL, "Gündem (WhatsApp bot)", input.madde || "");
  if (name === "claude_gorev_ekle")
    return await sendMail(
      INT_MAIL,
      "Claude Görev (WhatsApp bot): " + (input.baslik || "görev"),
      input.tam_icerik || ""
    );
  return "Bilinmeyen araç: " + name;
}

// ---- Claude'a sor (tool-use döngüsü) ----
async function askClaude(from, userContent, histText) {
  let ctx = "";
  try {
    ctx = await getBusinessContext();
  } catch (e) {
    console.error("Pano verisi alınamadı:", e.message);
  }
  const system = ctx
    ? SYSTEM_BASE + "\n\n=== GÜNCEL PANO VERİSİ ===\n" + ctx
    : SYSTEM_BASE + "\n\n(Not: pano verisi şu an alınamadı; veri gerektiren sorularda bunu belirt.)";

  const tools = buildTools();
  const messages = [...getHistory(from), { role: "user", content: userContent }];
  let finalText = "";

  const MAX_ITERS = 8;
  for (let i = 0; i < MAX_ITERS; i++) {
    // Son 2 turda araçları kapat: modeli MUTLAKA metin yanıt vermeye zorla
    // (araç döngüsü tükenip boş yanıt dönmesini engeller).
    const allowTools = tools.length && i < MAX_ITERS - 2;
    const payload = { model: MODEL, max_tokens: 4096, system, messages };
    if (allowTools) payload.tools = tools;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error("Anthropic hata: " + JSON.stringify(data));
    console.log("askClaude iter", i, "stop_reason:", data.stop_reason, "allowTools:", allowTools);

    messages.push({ role: "assistant", content: data.content });

    if (data.stop_reason === "tool_use") {
      const results = [];
      for (const block of data.content) {
        if (block.type === "tool_use") {
          console.log("Araç çağrısı:", block.name, JSON.stringify(block.input));
          const out = await runTool(block.name, block.input || {});
          results.push({ type: "tool_result", tool_use_id: block.id, content: out });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    finalText = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // max_tokens ile kesildi ve hiç metin yoksa: daha yüksek limitle bir kez daha dene
    if (!finalText && data.stop_reason === "max_tokens") {
      console.warn("max_tokens'ta boş içerik, tekrar deneniyor");
      continue;
    }
    break;
  }

  // Son güvenlik ağı: hâlâ boşsa araçsız, açık bir talimatla metin yanıt zorla
  if (!finalText) {
    console.warn("Yanıt boş kaldı; araçsız son deneme yapılıyor");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system,
          messages: [
            ...messages,
            { role: "user", content: "Lütfen yukarıdaki isteğe Türkçe, net bir metin yanıtı ver (araç çağırma)." },
          ],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        finalText = (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
      }
    } catch (e) {
      console.error("Araçsız son deneme başarısız:", e.message);
    }
  }

  finalText =
    finalText ||
    "Bu isteğe şu an yanıt üretemedim (model boş döndü). Kısa bir süre sonra tekrar dener misin?";
  pushHistory(from, "user", histText || (typeof userContent === "string" ? userContent : "[içerik]"));
  pushHistory(from, "assistant", finalText);
  return finalText;
}

// ---- WhatsApp medyası indir (görsel okuma) ----
async function downloadWhatsAppMedia(mediaId) {
  const metaRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`,
    { headers: { Authorization: "Bearer " + WHATSAPP_TOKEN } }
  );
  if (!metaRes.ok) throw new Error("Medya meta HTTP " + metaRes.status);
  const meta = await metaRes.json();
  const binRes = await fetch(meta.url, {
    headers: { Authorization: "Bearer " + WHATSAPP_TOKEN },
  });
  if (!binRes.ok) throw new Error("Medya indirme HTTP " + binRes.status);
  const buf = Buffer.from(await binRes.arrayBuffer());
  let mediaType = (meta.mime_type || "image/jpeg").split(";")[0].trim();
  const ok = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!ok.includes(mediaType)) mediaType = "image/jpeg";
  return { data: buf.toString("base64"), mediaType, buffer: buf };
}

// ---- Ses/video → metin (OpenAI Whisper) ----
async function transcribeMedia(buffer, mediaType, kind) {
  const ext =
    kind === "video" ? "mp4" :
    (mediaType || "").includes("mpeg") ? "mp3" :
    (mediaType || "").includes("mp4") || (mediaType || "").includes("m4a") ? "m4a" :
    (mediaType || "").includes("wav") ? "wav" :
    (mediaType || "").includes("webm") ? "webm" : "ogg";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mediaType || "application/octet-stream" }), "media." + ext);
  form.append("model", "whisper-1");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + OPENAI_API_KEY },
    body: form,
  });
  if (!r.ok) throw new Error("Whisper HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  const d = await r.json();
  return (d.text || "").trim();
}

// ---- WhatsApp'a yanıt gönder ----
async function sendWhatsApp(to, body) {
  const text = body.length > 4000 ? body.slice(0, 3990) + "…" : body;
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + WHATSAPP_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    // 401 code 190 = token geçersiz/expired → kalıcı System User token'ını Railway'e koy
    console.error("WhatsApp gönderim hatası:", res.status, err);
  }
}

// ---- Webhook doğrulama (GET) ----
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// ---- Mesaj alma (POST) ----
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Meta'ya hemen 200
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if (!msg) return;
    const from = msg.from;
    if (ALLOWED.length && !ALLOWED.includes(from.replace(/\D/g, ""))) {
      console.log("İzinsiz numara, atlandı:", from);
      return;
    }
    let content, histText;
    const t = msg.type;
    const docMime = (msg.document?.mime_type || "");
    if (t === "text") {
      content = msg.text.body;
      histText = msg.text.body;
    } else if (t === "image" || (t === "document" && docMime.startsWith("image/"))) {
      const media = t === "image" ? msg.image : msg.document;
      const caption = media.caption || "";
      try {
        const img = await downloadWhatsAppMedia(media.id);
        content = [
          { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
          { type: "text", text: caption || "Bu görseli oku: içindeki metni/veriyi aktar; gerekiyorsa pano verisine göre yorumla." },
        ];
        histText = "[görsel] " + caption;
      } catch (e) {
        console.error("Görsel indirilemedi:", e.message);
        await sendWhatsApp(from, "Görseli okuyamadım (indirme hatası). Tekrar gönderir misin?");
        return;
      }
    } else if (t === "document" && docMime.startsWith("application/pdf")) {
      const caption = msg.document.caption || "";
      const fname = msg.document.filename || "";
      try {
        const pdf = await downloadWhatsAppMedia(msg.document.id);
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.data } },
          { type: "text", text: caption || "Bu PDF'i oku; içeriğini özetle ve önemli veri/noktaları aktar." },
        ];
        histText = "[pdf] " + (caption || fname);
      } catch (e) {
        console.error("PDF indirilemedi:", e.message);
        await sendWhatsApp(from, "PDF'i okuyamadım (indirme hatası). Tekrar gönderir misin?");
        return;
      }
    } else if (t === "audio" || t === "voice" || t === "video") {
      const media = msg[t] || msg.audio || msg.video;
      if (!OPENAI_API_KEY) {
        await sendWhatsApp(from, "Sesli mesaj ve videoyu çözebilmem için OpenAI (Whisper) anahtarı gerekiyor. Railway'e OPENAI_API_KEY ekleyince aktifleşir.");
        return;
      }
      try {
        const mf = await downloadWhatsAppMedia(media.id);
        const transcript = await transcribeMedia(mf.buffer, mf.mediaType, t);
        if (!transcript) { await sendWhatsApp(from, "Kayıtta anlaşılır bir konuşma bulamadım."); return; }
        const label = t === "video" ? "video" : "ses";
        const cap = media.caption ? media.caption + "\n\n" : "";
        content = cap + "(" + label + " kaydının çözümü) " + transcript;
        histText = "[" + label + "] " + transcript.slice(0, 60);
      } catch (e) {
        console.error("Ses/video çözülemedi:", e.message);
        await sendWhatsApp(from, "Ses/videoyu çözemedim: " + e.message);
        return;
      }
    } else {
      await sendWhatsApp(from, "Bu mesaj tipini işleyemiyorum. Metin, görsel, PDF, sesli mesaj ve video gönderebilirsin.");
      return;
    }
    const reply = await askClaude(from, content, histText);
    await sendWhatsApp(from, reply);
  } catch (e) {
    console.error("İşleme hatası:", e);
    try {
      const from = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      if (from) await sendWhatsApp(from, "Bir hata oluştu, isteği işleyemedim: " + (e.message || e));
    } catch (_) {}
  }
});

app.get("/", (_req, res) => res.send("WhatsApp–Claude Business botu çalışıyor."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot dinliyor, port " + PORT));
