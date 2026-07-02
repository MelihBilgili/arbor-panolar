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
} = process.env;

const INT_MAIL = process.env.INT_MAIL || "int@arbor.com.tr";
const PANOLAR_URL =
  process.env.PANOLAR_URL ||
  "https://melihbilgili.github.io/arbor-panolar/index.html";
const MODEL = process.env.MODEL || "claude-sonnet-5";
const MAX_CONTEXT_CHARS = parseInt(process.env.MAX_CONTEXT_CHARS || "70000", 10);
const CONTEXT_TTL_MS = parseInt(process.env.CONTEXT_TTL_MS || "600000", 10); // 10 dk
const MEMORY_TTL_MS = parseInt(process.env.MEMORY_TTL_MS || "1800000", 10); // 30 dk
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || "8", 10); // son 8 tur
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
  "Araçların olabilir (web araması, mail gönderme, gündem notu ekleme). " +
  "MAIL GÖNDERMEDEN veya GÜNDEM NOTU EKLEMEDEN ÖNCE ne yapacağını (alıcı, konu, içerik/madde) " +
  "kısaca özetle ve kullanıcıdan açık ONAY iste; yalnızca kullanıcı 'evet/onayla' dedikten sonra aracı çağır. " +
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

// ---- Konuşma hafızası (numara bazlı) ----
const _hist = new Map(); // from -> { msgs:[{role,content}], ts }
function getHistory(from) {
  const h = _hist.get(from);
  if (!h) return [];
  if (Date.now() - h.ts > MEMORY_TTL_MS) {
    _hist.delete(from);
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
        "int@arbor'a gündem notu maili atar (madde bir sonraki triyajda Gündem'e işlenir). ÇAĞIRMADAN ÖNCE onay al.",
      input_schema: {
        type: "object",
        properties: { madde: { type: "string", description: "Gündeme eklenecek madde" } },
        required: ["madde"],
      },
    });
  }
  return tools;
}

async function webAra(q) {
  try {
    if (SEARCH_API_KEY) {
      const r = await fetch(
        "https://api.search.brave.com/res/v1/web/search?count=5&q=" + encodeURIComponent(q),
        { headers: { Accept: "application/json", "X-Subscription-Token": SEARCH_API_KEY } }
      );
      if (!r.ok) return "Arama hatası (Brave): HTTP " + r.status;
      const d = await r.json();
      const items = ((d.web && d.web.results) || [])
        .slice(0, 5)
        .map((x) => "- " + x.title + ": " + (x.description || "") + " (" + x.url + ")")
        .join("\n");
      return items || "Sonuç bulunamadı.";
    }
    // Anahtarsız fallback: DuckDuckGo Instant Answer (sınırlı ama ücretsiz/keysiz)
    const r = await fetch(
      "https://api.duckduckgo.com/?format=json&no_html=1&t=arborbot&q=" + encodeURIComponent(q)
    );
    if (!r.ok) return "Arama hatası (DDG): HTTP " + r.status;
    const d = await r.json();
    const out = [];
    if (d.AbstractText) out.push(d.AbstractText + (d.AbstractURL ? " (" + d.AbstractURL + ")" : ""));
    for (const rt of d.RelatedTopics || []) {
      if (rt.Text) out.push("- " + rt.Text + (rt.FirstURL ? " (" + rt.FirstURL + ")" : ""));
      if (out.length >= 6) break;
    }
    return out.length
      ? out.join("\n")
      : "Web'de net bir yanıt bulunamadı (daha zengin sonuç için Railway'e SEARCH_API_KEY/Brave ekleyebilirsin).";
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
  return "Bilinmeyen araç: " + name;
}

// ---- Claude'a sor (tool-use döngüsü) ----
async function askClaude(from, userText) {
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
  const messages = [...getHistory(from), { role: "user", content: userText }];
  let finalText = "";

  for (let i = 0; i < 6; i++) {
    const payload = { model: MODEL, max_tokens: 1500, system, messages };
    if (tools.length) payload.tools = tools;
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
    break;
  }

  finalText = finalText || "(boş yanıt)";
  pushHistory(from, "user", userText);
  pushHistory(from, "assistant", finalText);
  return finalText;
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
    if (!msg || msg.type !== "text") return;
    const from = msg.from;
    if (ALLOWED.length && !ALLOWED.includes(from.replace(/\D/g, ""))) {
      console.log("İzinsiz numara, atlandı:", from);
      return;
    }
    const userText = msg.text.body;
    const reply = await askClaude(from, userText);
    await sendWhatsApp(from, reply);
  } catch (e) {
    console.error("İşleme hatası:", e);
  }
});

app.get("/", (_req, res) => res.send("WhatsApp–Claude Business botu çalışıyor."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot dinliyor, port " + PORT));
