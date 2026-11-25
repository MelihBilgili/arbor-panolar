// anket-musteri (MUSTERI-ANKET, 03.11.2026) — verify_jwt=false — canlı sürüm v2
// Müşteri Memnuniyet Anketi — müşteri tarafı (anonim). Link: https://melihbilgili.github.io/arbor-panolar/anket/?t=<token>&l=<dil>
// islem "oku": token → proje/firma/durum · islem "gonder": cevapları musteri_anket satırına yazar (yalnız durum='Bekliyor' iken, bir kez).
// MUSTERI-ANKET-DIL (05.11.2026): oku dil döner (tr/fr/de/en); hatalarda kod alanı (gecersiz/yanitlandi/eksik/hata) — metni sayfa kendi dilinde yazar.
// ANKET-IDARI-AYRI (23.11.2026): 5. kriter "idari" (İdari yönetim); "yonetim" artık Teknik yönetim. Puanı DB tetikleyicisi musteri_anket_puan_trg yeniden hesaplar.
// Token 36 hex (144 bit), tahmin edilemez; başka satıra erişim yok. Servis rolü yalnız bu tek satırı okur/yazar.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PUAN: Record<string, [string, number]> = {
  ts: ["Çok memnun", 4], s: ["Memnun", 3], i: ["Memnun değil", 2], ti: ["Hiç memnun değil", 1],
};
const SAV: Record<string, string> = { oui: "Tamamen", partie: "Kısmen", non: "Hiç", na: "Uygulanamaz" };
const RECO: Record<string, string> = { oui: "Evet", non: "Hayır", peut: "Belki" };
const KRIT = ["etut", "kalite", "sureler", "yonetim", "idari"];
const t = (v: unknown, n: number) => String(v ?? "").replace(/\s+$/g, "").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J({ ok: false, hata: "POST" }, 405);
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { /* boş */ }
  const token = String(b.t || "").toLowerCase();
  if (!/^[0-9a-f]{24,64}$/.test(token)) return J({ ok: false, kod: "gecersiz" }, 400);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: r } = await sb.from("musteri_anket").select("id,proje,firma,durum,yanit_at,dil").eq("token", token).maybeSingle();
  if (!r || r.durum === "İptal") return J({ ok: false, kod: "gecersiz", dil: r?.dil }, 404);

  if (b.islem === "oku") return J({ ok: true, proje: r.proje, firma: r.firma, dil: r.dil, yanitlandi: r.durum === "Yanıtlandı", yanit_at: r.yanit_at });

  if (b.islem !== "gonder") return J({ ok: false, kod: "hata" }, 400);
  if (r.durum !== "Bekliyor") return J({ ok: false, kod: "yanitlandi" }, 409);
  const c = b.cevap || {};
  const eksik: string[] = [];
  const upd: Record<string, unknown> = {};
  const aciklama: Record<string, string> = {};
  let top = 0;
  for (const k of KRIT) {
    const v = String(c[k] || "");
    if (!PUAN[v]) { eksik.push(k); continue; }
    upd[k] = PUAN[v][0]; top += PUAN[v][1];
    if (v === "i" || v === "ti") {
      const a = t((c.aciklama || {})[k], 2000);
      if (a.length < 3) eksik.push(k + "_aciklama"); else aciklama[k] = a;
    }
  }
  const sav = String(c.sav || ""), reco = String(c.tavsiye || "");
  if (!SAV[sav]) eksik.push("sav");
  if (!RECO[reco]) eksik.push("tavsiye");
  const savA = t(c.sav_aciklama, 2000), recoA = t(c.tavsiye_aciklama, 2000);
  if ((sav === "partie" || sav === "non") && savA.length < 3) eksik.push("sav_aciklama");
  if ((reco === "non" || reco === "peut") && recoA.length < 3) eksik.push("tavsiye_aciklama");
  const ad = t(c.yanitlayan_ad, 200), firma = t(c.yanitlayan_firma, 200);
  if (ad.length < 2) eksik.push("yanitlayan_ad");
  if (firma.length < 2) eksik.push("yanitlayan_firma");
  if (eksik.length) return J({ ok: false, kod: "eksik", eksik }, 422);

  Object.assign(upd, {
    aciklama, sav: SAV[sav], sav_aciklama: savA || null, tavsiye: RECO[reco], tavsiye_aciklama: recoA || null,
    teslim_tarihi: t(c.teslim_tarihi, 60) || null, yorum: t(c.yorum, 4000) || null,
    yanitlayan_ad: ad, yanitlayan_firma: firma, yanitlayan_gorev: t(c.yanitlayan_gorev, 200) || null,
    yanitlayan_mail: t(c.yanitlayan_mail, 200) || null,
    puan: Math.round((top / KRIT.length) * 100) / 100, durum: "Yanıtlandı", yanit_at: new Date().toISOString(),
  });
  const { data: u, error } = await sb.from("musteri_anket").update(upd).eq("id", r.id).eq("durum", "Bekliyor").select("id");
  if (error) return J({ ok: false, kod: "hata" }, 500);
  if (!u || !u.length) return J({ ok: false, kod: "yanitlandi" }, 409);
  return J({ ok: true });
});
