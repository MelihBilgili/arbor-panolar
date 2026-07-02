// index.js — WhatsApp ⇄ Claude botu (Arbor "Business" asistanı, canlı pano verisiyle)
// Genel Kural 36. SIR İÇERMEZ — tüm anahtar/şifreler process.env'den okunur (.env + Railway Variables).
//
// Yaptığı iş:
//   1) WhatsApp Cloud API webhook (GET doğrulama + POST mesaj alma)
//   2) Gelen mesajı, GÜNCEL pano verisiyle birlikte Claude'a iletir
//   3) Canlı veri = arbor-panolar GitHub Pages'teki şifreli index.html'i PANOLAR_PW ile
//      çözerek (AES-256-GCM / PBKDF2-SHA256, panolar_deploy.py ile birebir) elde edilir
//   4) Claude'un yanıtını WhatsApp'tan geri gönderir
//
// Gereken env (Railway Variables + yerel .env, ikisi AYNI):
//   ANTHROPIC_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, VERIFY_TOKEN, PANOLAR_PW
// İsteğe bağlı env:
//   PANOLAR_URL (varsayılan aşağıda), MODEL, MAX_CONTEXT_CHARS, CONTEXT_TTL_MS,
//   GRAPH_VERSION, ALLOWED_NUMBERS (virgülle ayrık; boşsa herkese açık — GÜVENLİK için doldur)

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
} = process.env;

const PANOLAR_URL =
  process.env.PANOLAR_URL ||
  "https://melihbilgili.github.io/arbor-panolar/index.html";
const MODEL = process.env.MODEL || "claude-sonnet-5";
const MAX_CONTEXT_CHARS = parseInt(process.env.MAX_CONTEXT_CHARS || "70000", 10);
const CONTEXT_TTL_MS = parseInt(process.env.CONTEXT_TTL_MS || "600000", 10); // 10 dk
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v20.0";
// Varsayılan: Melih'in numarası (+90 532 205 92 77). ALLOWED_NUMBERS env'i verilirse onu kullanır.
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
  "Soruları YALNIZCA bu veriye dayanarak yanıtla; tarih, sayı ve isimleri panodaki gibi ver. " +
  "Panoda olmayan bir şey sorulursa 'panoda bu bilgi yok' de — asla uydurma. " +
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

// ---- Claude'a sor ----
async function askClaude(userText, contextText) {
  const system = contextText
    ? SYSTEM_BASE + "\n\n=== GÜNCEL PANO VERİSİ ===\n" + contextText
    : SYSTEM_BASE + "\n\n(Not: pano verisi şu an alınamadı; genel yardımcı ol ve veri gerektiren sorularda bunu belirt.)";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Anthropic hata: " + JSON.stringify(data));
  return (data.content || []).map((b) => b.text || "").join("").trim() || "(boş yanıt)";
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
    // 401 code 190 = token geçersiz/expired → kalıcı System User token'ını .env + Railway'e koy
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
  res.sendStatus(200); // Meta'ya hemen 200 (yeniden denemeyi önle)
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
    let ctx = "";
    try {
      ctx = await getBusinessContext();
    } catch (e) {
      console.error("Pano verisi alınamadı:", e.message);
    }
    const reply = await askClaude(userText, ctx);
    await sendWhatsApp(from, reply);
  } catch (e) {
    console.error("İşleme hatası:", e);
  }
});

app.get("/", (_req, res) => res.send("WhatsApp–Claude Business botu çalışıyor."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot dinliyor, port " + PORT));
