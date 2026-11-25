// TT-KALDIR (2026-09-30): Teklif Talepleri formu ve teklif_talep tablosu kaldirildi; fonksiyon emekli (no-op).
// Eski kaynak: kod/_backup/_emekli_teklif_talep/edge/teklif-talep-mail/index.ts
Deno.serve(() => new Response(JSON.stringify({ok:false, emekli:true, mesaj:"Teklif Talepleri kaldirildi (30.09.2026)"}), {status:410, headers:{"Content-Type":"application/json"}}));
