// form-giris (KOD-GIRIS, 23.09.2026)
// Form kapısı: 6 haneli kişisel kod → kisi_sifre → form_erisim yetkisi → rol hesabı için tek kullanımlık
// magic-link token_hash döner; istemci verifyOtp ile rol hesabının oturumunu açar.
// Rol hesaplarının parolası rastgeledir (kimse bilmez) → forma başka yoldan girilemez.
// Hız sınırı: aynı IP 15 dk'da 5 hatalı · tüm sistem 1 saatte 40 hatalı deneme.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const MB = "MB";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J({ ok: false, hata: "POST" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "?").split(",")[0].trim();
  let body: { form?: string; kod?: string } = {};
  try { body = await req.json(); } catch (_) { /* boş */ }
  let form = String(body.form || "").trim().toLowerCase();
  if (form && !form.endsWith("/")) form += "/";
  const kod = String(body.kod || "").replace(/\D/g, "");
  const log = (basarili: boolean, neden: string, kisi: string | null = null) =>
    sb.from("form_giris_log").insert({ ip, form, kisi, basarili, neden });

  // hız sınırı
  const t15 = new Date(Date.now() - 15 * 60e3).toISOString();
  const t60 = new Date(Date.now() - 60 * 60e3).toISOString();
  const [a, b] = await Promise.all([
    sb.from("form_giris_log").select("id", { count: "exact", head: true }).eq("ip", ip).eq("basarili", false).gte("at", t15),
    sb.from("form_giris_log").select("id", { count: "exact", head: true }).eq("basarili", false).gte("at", t60),
  ]);
  if ((a.count ?? 0) >= 5) return J({ ok: false, hata: "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyiniz." }, 429);
  if ((b.count ?? 0) >= 40) return J({ ok: false, hata: "Giriş geçici olarak kilitli. Lütfen daha sonra deneyiniz." }, 429);

  if (!/^\d{6}$/.test(kod)) { await log(false, "bicim"); return J({ ok: false, hata: "Kod 6 haneli olmalıdır." }, 400); }

  const { data: fe } = await sb.from("form_erisim").select("*").eq("yol", form).maybeSingle();
  if (!fe) { await log(false, "form_yok"); return J({ ok: false, hata: "Form tanımlı değil." }, 404); }

  const { data: ks } = await sb.from("kisi_sifre").select("kod").eq("sifre", kod).maybeSingle();
  if (!ks) { await log(false, "kod_hatali"); return J({ ok: false, hata: "Kod hatalı." }, 401); }
  const { data: kisi } = await sb.from("kisiler").select("kod,tam_ad,aktif").eq("kod", ks.kod).maybeSingle();
  if (!kisi || kisi.aktif === false) { await log(false, "pasif", ks.kod); return J({ ok: false, hata: "Kod hatalı." }, 401); }

  const izinli = kisi.kod === MB || fe.herkes === true || (fe.kisiler || []).includes(kisi.kod);
  if (!izinli) { await log(false, "yetki_yok", kisi.kod); return J({ ok: false, hata: "Bu forma giriş yetkiniz yok." }, 403); }

  const email = String((fe.rol_map || {})[kisi.kod] || fe.varsayilan_rol);
  const { data: gl, error } = await sb.auth.admin.generateLink({ type: "magiclink", email });
  const th = gl?.properties?.hashed_token;
  if (error || !th) { await log(false, "link:" + (error?.message || "yok"), kisi.kod); return J({ ok: false, hata: "Giriş açılamadı." }, 500); }
  await log(true, "ok", kisi.kod);
  return J({ ok: true, token_hash: th, kisi: kisi.kod, ad: kisi.tam_ad, rol: email });
});
