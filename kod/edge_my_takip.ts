// Supabase Edge Function: my-takip — kaynak edge sürüm v8 (17.11.2026, MY-KESIN-VURGU + MY-KESIN-OE-GOREV).
// Tam kaynak Supabase'de: mcp get_edge_function my-takip (bu dosya 1,5 KB'lık eski özetti).
// v8 değişiklikleri (v7'ye göre):
//  - Row tipine durum_erp, kesin eklendi.
//  - shz(r): PEM durum 3 / PRJ durum 8 = sevke hazır.
//  - kesinEksik(rows): shz && !kesin && Açıklama'da /(^|\s)OE \d{2}\/\d{2}\/\d{2}:/ notu yok (my_acil.js kesOE ile aynı).
//  - kesinTxt(r): kesin varsa GG.AA.YY, yoksa sevke hazırda "GİRİLMEDİ (sevke hazır)".
//  - kesinVurgu(rows): eksik varsa kırmızı kutu "Sevke hazır olup Kesinleşen Yükleme Tarihi girilmemiş ve Açıklama'da nedeni yazılmamış: <liste>. Bu satırlar için Kesinleşen Yükleme Tarihi'ni girmenizi; giremiyorsanız nedenini Açıklama sütununa yazmanızı rica ederim."; yoksa aynı istek kalın tek cümle.
//  - tablo(): "Hedef Yükleme"den sonra "Kesinleşen Yükleme" sütunu; satirTxt'e " · kesin <kesinTxt>".
//  - acilBildir ve islem "acil" OE maillerinde tablo sonrası kesinVurgu([r]); günlük (önizleme) OE mailinde tablodan önce kesinVurgu(acil).
// Geri alma: Supabase edge my-takip v7.
