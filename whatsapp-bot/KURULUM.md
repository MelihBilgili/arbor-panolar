# WhatsApp Botu → Business'a Yönlendirme (kurulum & deploy)

*İlgili: Genel Kural 36. Bu dosya SIR İÇERMEZ. Kod, canlı pano verisiyle yanıt veren Arbor "Business" asistanı olacak şekilde yeniden yazıldı.*

## Ne değişti
- **Kişilik/görev:** Bot artık genel sohbet değil; **Arbor Business iş asistanı** (SYSTEM_BASE, `index.js`).
- **Canlı veri:** Her mesajda `arbor-panolar` GitHub Pages'teki **şifreli** `index.html` çekilir, `PANOLAR_PW` ile çözülür (AES-256-GCM / PBKDF2-SHA256, `panolar_deploy.py` ile birebir), metne çevrilip Claude'a bağlam olarak verilir. 10 dk cache.
- **Kapsanan panolar:** Gündem, Açık Mailler, PEM/PRJ Sevke Hazır, Yıllık İcmal, AÜP, AÜP Mail, SO/FA/AK Satış Yorum, Prosedür, Teklif Kuralları, Özgül Mukayese.
- **Tek yeni sır:** `PANOLAR_PW` (değeri `Business\.panolar_deploy.json` → `password`).

## TEK KAYNAK: bu klasör
Bu klasör (`OneDrive\Business\whatsapp-bot\`) botun **tek kaynağıdır** — deploy buradan yapılır, `C:\Users\USER\whatsapp-claude-bot` artık kullanılmaz. Sırlar (`.env`) buraya KONMAZ; çalışma zamanı değişkenleri Railway → Variables'tan gelir. `.gitignore` `.env` ve `node_modules`'ü senkron/repo dışı tutar. Şablon: `.env.example`.

## Kurulum (senin PC'nde) — tek seferlik
1. Railway → proje **whatsapp-claude-bot** → **Variables** → yeni değişken ekle:
   `PANOLAR_PW = <Business\.panolar_deploy.json içindeki "password">`
   (Diğer sırlar — ANTHROPIC_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, VERIFY_TOKEN — zaten Variables'ta olmalı; yoksa ekle.)
2. **Güvenlik:** İzinli numara koda gömülü — varsayılan **905322059277** (senin numaran, +90 532 205 92 77). Sadece bu numara bota yazabilir; diğerleri sessizce atlanır. Değiştirmek/eklemek için Railway'e `ALLOWED_NUMBERS = 905322059277,90XXXXXXXXXX` ver — env varsa gömülü varsayılanı ezer.
3. Bu klasörü Railway projesine bağla + deploy et:
   ```
   cd C:\Users\USER\OneDrive\Business\whatsapp-bot
   railway link      # listeden whatsapp-claude-bot projesini seç
   railway up
   ```
4. **Eski klasör:** `C:\Users\USER\whatsapp-claude-bot` içindeki `.env`'i güvenli bir yere (bu klasör DIŞI) yedekle, sonra eski klasörü sil.
5. Test: WhatsApp'tan test numarasına (+1 555 653 0780) yaz — ör. *"Gündemde Tolga Bey'in açık işleri neler?"* veya *"Haziran icmal net TL kaç?"*

## Sonraki güncellemeler
`index.js` bu klasörde değişince tek yapılacak: `cd C:\Users\USER\OneDrive\Business\whatsapp-bot` → `railway up`. Kopyalama yok.

## Ortam değişkenleri (özet)
Zorunlu (yalnız Railway → Variables): `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `VERIFY_TOKEN`, `PANOLAR_PW`.
`PORT` ekleme — Railway atar. Yerel `.env` yalnız `node index.js` ile lokal test için gerekir (bu klasör dışında tut).

İsteğe bağlı: `ALLOWED_NUMBERS`, `MODEL` (varsayılan `claude-sonnet-4-20250514`; istersen `claude-sonnet-5`'e yükselt), `PANOLAR_URL`, `MAX_CONTEXT_CHARS` (70000), `CONTEXT_TTL_MS` (600000), `GRAPH_VERSION` (v20.0).

## Bilinen tuzak
WhatsApp gönderiminde **401 code 190** = token geçersiz/expired → kalıcı (Expires: Never) System User token'ını hem `.env` hem Railway'e koy; Meta Access Token Debugger'da "Type: System User, Expires: Never, Valid: True" ile teyit.

## Doğrulanan noktalar (bu oturum)
- AES-GCM çözme node:crypto ile birebir çalışıyor (tag-sona-ekli WebCrypto/Python bloğu round-trip OK).
- Panolar.html → metin: 13 panonun tamamı, ~78k karakter okunur çıktı.
- `index.js` syntax + `package.json` geçerli.

## Sınırlar
- Test numarası geliştirme kaynağıdır; gerçek üretim kendi numara + Meta işletme doğrulaması ister.
- Bot durumsuz (her mesaj bağımsız); konuşma geçmişi tutmaz.
- Pano ~10 dk cache'lenir; en taze veri için pano zaten güncelse yeterli.
