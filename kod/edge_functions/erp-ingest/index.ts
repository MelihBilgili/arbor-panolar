// Supabase Edge Function: erp-ingest  (05.11.2026, Melih) — marker ERP-INGEST-BULUT
// DESKTOP-2RC670U'daki erp_cekim_gorevi.py akışının bilgisayarsız (bulut) karşılığı.
// Çağrı: SQL select erp_ingest_cagir(<gövde>) (pg_net; x-erp-key = sistem_anahtar 'erp_ingest' fonksiyon içinde eklenir)
//        gövde {damga, files:[{name,size,mtime,url}], prev_duyuru:{damga,url}, mod}; url = OneDrive ön-yetkili indirme adresi.
// İş arka planda yürür; sonuç public.erp_ingest_log satırına yazılır (durum calisiyor → bitti/kismi/hata).
// Adımlar (Python betikleriyle birebir):
//   1) arbor_erp_worker.py   → proje/pem/arge/so/egitim_* snapshot + yillik_icmal rollup + icmal_satir (Üs, son çıkış)
//   2) _pem_prj_erp_match.py --match-only → ana_gundem.erp
//   3) _hazir_erp_fill.py    → hazir_erp
//   4) _santiye_form_fill.py → santiye_form_proje (her ingest; dönem ayın 21'inde açılır — SANTIYE-GUNLUK)
//   5) _musteri_ciro_bul.py  → musteri-ciro (ayrı çağrı: mod "ciro", uzun sürer)
//   6) _etut_dk_fill.py      → rpc etut_dk_erp_yaz
//   7) _my_pasif_pem.py      → my-takip pasif_pem
//   + Duyuru farkı (önceki çekime göre yeni satırlar) → raporda; Prosedür eklemesini görev yapar.
// mod: "run" (yaz) · "dry" (yazma, say) · "compare" (yazma; DB ile karşılaştır, body.eid) · "ciro"
import { readFirstSheet, PyF, PyDT, pystr, truthy, rawJson, pyRoundHalfEven } from "./xlsx.ts";
import type { V } from "./xlsx.ts";

const SB = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H: Record<string, string> = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

// ---------------------------------------------------------------- REST
async function rest(path: string, init: RequestInit = {}, pref?: string) {
  const hh: Record<string, string> = { ...H };
  if (pref) hh.Prefer = pref;
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...hh, ...((init.headers as Record<string, string>) || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`REST ${init.method || "GET"} ${path.split("?")[0]} -> ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
}
async function getAll(path: string) {
  const out: unknown[] = [];
  for (let off = 0; ; off += 1000) {
    const sep = path.includes("?") ? "&" : "?";
    const part = await rest(`${path}${sep}limit=1000&offset=${off}`);
    out.push(...(part || []));
    if (!part || part.length < 1000) break;
  }
  // deno-lint-ignore no-explicit-any
  return out as any[];
}
async function upsert(table: string, payload: unknown[], onConflict: string) {
  let total = 0;
  for (let k = 0; k < payload.length; k += 200) {
    const chunk = payload.slice(k, k + 200);
    await rest(`${table}?on_conflict=${onConflict}`, { method: "POST", body: JSON.stringify(chunk) }, "resolution=merge-duplicates,return=minimal");
    total += chunk.length;
  }
  return total;
}

// ---------------------------------------------------------------- Python yardımcıları (worker)
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function dd(v: V): string | null {
  if (v instanceof PyDT && v.y >= 2000) return `${pad(v.y, 4)}-${pad(v.mo)}-${pad(v.d)}`;
  return null;
}
function s(v: V): string | null {
  if (v === null || v === undefined) return null;
  const t = pystr(v).replaceAll("_x000d_", "").replaceAll("\r", "").replaceAll("\n", " ").trim();
  return t || null;
}
function i(v: V): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (v instanceof PyF) return Number.isFinite(v.v) ? Math.trunc(v.v) : null;
  if (typeof v === "string") { const t = v.trim(); return /^[+-]?\d+(_\d+)*$/.test(t) ? parseInt(t.replaceAll("_", ""), 10) : null; }
  return null;
}
function n(v: V): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (v instanceof PyF) return v.v;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^[+-]?(\d(_?\d)*(\.(\d(_?\d)*)?)?|\.\d(_?\d)*)([eE][+-]?\d(_?\d)*)?$/.test(t)) return Number(t.replaceAll("_", ""));
    if (/^[+-]?(inf|infinity)$/i.test(t)) return t.startsWith("-") ? -Infinity : Infinity;
    if (/^[+-]?nan$/i.test(t)) return NaN;
    return null;
  }
  return null;
}
function bl(v: V): boolean | null {
  if (typeof v === "boolean") return v;
  const t = pystr(v).trim().toLowerCase();
  return ["true", "1", "evet"].includes(t) ? true : (["false", "0", "hayir"].includes(t) ? false : null);
}
function norm(h: V): string {
  const x = truthy(h) ? pystr(h) : "";
  return x.replaceAll("\n", " ").replace(/\s+/g, " ").trim().toUpperCase().replace(/\.+$/, "");
}
function kodF(d: V): number | null {
  const m = /^[\d.]+/.exec(truthy(d) ? pystr(d) : "");
  if (!m) return null;
  const x = Number(m[0]);
  return Number.isFinite(x) && /^(\d+\.?\d*|\.\d+)$/.test(m[0]) ? x : null;
}
function namedLoad(grid: V[][]) {
  const hmap = new Map<string, number>();
  if (!grid.length) return { g: (_r: V[], _n: string) => null as V, rows: [] as V[][], hm: hmap };
  grid[0].forEach((h, idx) => { const k = norm(h); if (k && !hmap.has(k)) hmap.set(k, idx); });
  const g = (row: V[], name: string): V => { const idx = hmap.get(norm(name)); return idx !== undefined && idx < row.length ? row[idx] : null; };
  return { g, rows: grid.slice(1), hm: hmap };
}
const isNumV = (v: V) => typeof v === "number" || typeof v === "boolean" || v instanceof PyF;

// ---------------------------------------------------------------- dosyalar
type FileIn = { name: string; size?: number; mtime?: string; url: string };
const key = (nm: string) => nm.normalize("NFC").toLowerCase();
class Folder {
  files = new Map<string, FileIn>();
  cache = new Map<string, V[][]>();
  constructor(list: FileIn[]) { for (const f of list) this.files.set(key(f.name), f); }
  has(nm: string) { return this.files.has(key(nm)); }
  async grid(nm: string): Promise<V[][]> {
    const k = key(nm);
    if (this.cache.has(k)) return this.cache.get(k)!;
    const f = this.files.get(k);
    if (!f) throw new Error(nm + " yok");
    const r = await fetch(f.url);
    if (!r.ok) throw new Error(`${nm} indirilemedi: ${r.status}`);
    const g = await readFirstSheet(new Uint8Array(await r.arrayBuffer()));
    this.cache.set(k, g);
    return g;
  }
}
async function gridFromUrl(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`indirilemedi: ${r.status}`);
  return readFirstSheet(new Uint8Array(await r.arrayBuffer()));
}
async function md5hex(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- karşılaştırma yardımcıları
function eqv(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  return String(a) === String(b);
}
// deno-lint-ignore no-explicit-any
function sortKeys(o: any): any {
  if (Array.isArray(o)) return o.map(sortKeys);
  if (o && typeof o === "object") return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  if (typeof o === "number") return Number(o);
  return o;
}
// deno-lint-ignore no-explicit-any
function compareRows(name: string, mine: any[], db: any[], keys: string[], log: (s: string) => void) {
  const kf = (r: Record<string, unknown>) => keys.map((k) => String(r[k])).join("|");
  const dm = new Map(db.map((r) => [kf(r), r]));
  const fieldDiff: Record<string, number> = {};
  const samples: string[] = [];
  let missing = 0, same = 0;
  for (const r of mine) {
    const d = dm.get(kf(r));
    if (!d) { missing++; continue; }
    dm.delete(kf(r));
    let ok = true;
    for (const f of Object.keys(r)) {
      if (keys.includes(f) || f === "erp_yukleme_id" || f === "updated_at") continue;
      if (!eqv(r[f], d[f])) {
        ok = false; fieldDiff[f] = (fieldDiff[f] || 0) + 1;
        if (samples.length < 6) samples.push(`${kf(r)}.${f}: bulut=${JSON.stringify(r[f])?.slice(0, 80)} db=${JSON.stringify(d[f])?.slice(0, 80)}`);
      }
    }
    if (ok) same++;
  }
  log(`  [karşılaştır] ${name}: bulut ${mine.length}, db ${db.length}, aynı ${same}, farklı ${mine.length - same - missing}, db'de yok ${missing}, yalnız db ${dm.size}` +
    (Object.keys(fieldDiff).length ? ` · alan farkları ${JSON.stringify(fieldDiff)}` : ""));
  for (const x of samples) log("     " + x);
  return { name, same, diff: mine.length - same - missing, missing, onlyDb: dm.size, fieldDiff };
}

// ---------------------------------------------------------------- 1) worker
// deno-lint-ignore no-explicit-any
type Ctx = { mod: string; damga: string; F: Folder; log: (s: string) => void; rapor: Record<string, any>; eid?: number };

async function worker(c: Ctx) {
  const { damga, F, log, mod } = c;
  const write = mod === "run";
  let eid = c.eid ?? -1;
  if (write) {
    await rest("erp_yukleme?on_conflict=damga", { method: "POST", body: JSON.stringify([{ damga, kaynak: "worker" }]) }, "resolution=merge-duplicates,return=minimal");
    eid = (await rest(`erp_yukleme?damga=eq.${damga}&select=id`))[0].id;
  } else if (mod === "compare" && c.eid === undefined) {
    const e = await rest(`erp_yukleme?damga=eq.${damga}&select=id`);
    if (e && e[0]) eid = e[0].id;
  }
  c.eid = eid;
  log(`ERP çekimi ingest -> ${damga} (erp_yukleme_id ${eid})`);
  const cmp = mod === "compare" && eid > 0;
  const results: Record<string, unknown> = {};

  // ---- PRJ
  let L = namedLoad(await F.grid("Prj.xlsx"));
  const flatP = L.hm.has(norm("PROJE DURUMU"));
  const RE_PDUR = /^\s*PROJE\s+DURUMU\s*:\s*(.+)$/i;
  let curP: string | null = null;
  // deno-lint-ignore no-explicit-any
  const prj: any[] = [];
  for (const r0 of L.rows) {
    const a0 = r0.length ? r0[0] : null;
    if (a0 !== null && !isNumV(a0)) { const m = RE_PDUR.exec(pystr(a0)); if (m) { curP = m[1].trim(); continue; } }
    const g = L.g;
    if (!s(g(r0, "PROJE NUMARASI"))) continue;
    prj.push({ erp_yukleme_id: eid, proje_no: s(g(r0, "PROJE NUMARASI")), proje_adi: s(g(r0, "PROJE ADI")),
      proje_durumu: (flatP && s(g(r0, "PROJE DURUMU"))) ? s(g(r0, "PROJE DURUMU")) : s(curP),  // PRJ-DURUM-YEDEK: sütun boşsa blok başlığı
      ulke: s(g(r0, "ÜLKE")), santiye_sorumlusu: s(g(r0, "ŞANTİYE SORUMLUSU")),
      adet: i(g(r0, "ADET")), mvt: dd(g(r0, "MVT")), aup: dd(g(r0, "AÜP")), gyt: dd(g(r0, "PLANLANAN SEVK TARİHİ")),
      uretim_notlari: s(g(r0, "ÜRETİM NOTLARI")), satis_santiye_notlari: s(g(r0, "SATIŞ/ŞANTİYE NOTLARI")),
      satinalma_notlari: s(g(r0, "SATINALMA NOTLARI")), aksesuar_yuklenme_tarihi: dd(g(r0, "AKSESUAR YÜKLENME TARİHİ")),
      anlasma_fiyati: n(g(r0, "ANLAŞMA FİYATI")),
      proje_onay_tarihi: dd(g(r0, "PROJE ONAY TARİHİ")) });  // PRJ-ONAY-TARIHI (24.11.2026, Melih): arbor_erp_worker.py ile aynı
  }
  log(`  proje_snapshot: ${write ? await upsert("proje_snapshot", prj, "erp_yukleme_id,proje_no") : prj.length}`);
  if (cmp) results.prj = compareRows("proje_snapshot", prj, await getAll(`proje_snapshot?erp_yukleme_id=eq.${eid}&select=*`), ["proje_no"], log);

  // ---- PEM
  L = namedLoad(await F.grid("Pem.xlsx"));
  // deno-lint-ignore no-explicit-any
  const pem: any[] = [];
  for (const r0 of L.rows) {
    const g = L.g;
    if (i(g(r0, "SATIR NR")) === null) continue;
    pem.push({ erp_yukleme_id: eid, satir_nr: i(g(r0, "SATIR NR")), no: i(g(r0, "NO")),
      termin_tarihi: dd(g(r0, "TERMİN TARİHİ")), durum: s(g(r0, "DURUM")), aciliyet: s(g(r0, "ACİLİYET")),
      kategori: s(g(r0, "KATEGORİ")), proje_no: s(g(r0, "PROJE NO")), proje_adi: s(g(r0, "PROJE ADI")),
      talep: s(g(r0, "TALEP")), miktar: n(g(r0, "MİKTAR")), sebep: s(g(r0, "SEBEP")),
      talep_aciklamasi: s(g(r0, "TALEP AÇIKLAMASI")), maliyet: s(g(r0, "MALİYET")),
      talep_tarihi: dd(g(r0, "TALEP TARİHİ")), yonetim_onay_tarihi: dd(g(r0, "YÖNETİM ONAY TARİHİ")),
      malzeme_onay_tarihi: dd(g(r0, "MALZEME ONAY TARİHİ")), talep_acan: s(g(r0, "TALEP AÇAN")),
      talep_eden: s(g(r0, "TALEP EDEN")), sevk_tarihi: dd(g(r0, "SEVK TARİHİ")), sevk_sekli: s(g(r0, "SEVK ŞEKLİ")),
      not_alani: s(g(r0, "NOT")), tedarikci: s(g(r0, "TEDARİKÇİ")), depo_inceleme: s(g(r0, "DEPO İNCELEME")),
      satinalma_inceleme: s(g(r0, "SATINALMA İNCELEME")), malzeme_listesi_ekl_tar: dd(g(r0, "MALZEME LİSTESİ EKLENME TARİHİ")),
      poz_no: s(g(r0, "POZ NO")), musteri_poz_no: s(g(r0, "MÜŞTERİ POZ NO")), bina: s(g(r0, "BİNA")),
      kat: s(g(r0, "KAT")), daire: s(g(r0, "DAİRE")), ulke: s(g(r0, "ÜLKE")),
      kalite_onay_tarihi: dd(g(r0, "KALİTE ONAY TARİHİ")), tr_eksik_malzeme: s(g(r0, "TR EKSİK MALZEME ADI")),
      fr_eksik_malzeme: s(g(r0, "FR EKSİK MALZEME ADI")), durum_degistiren: s(g(r0, "DURUM DEĞİŞTİREN")),
      teslim_edilecek_birim: s(g(r0, "TESLİM EDİLECEK BİRİM")) });
  }
  log(`  pem_snapshot: ${write ? await upsert("pem_snapshot", pem, "erp_yukleme_id,satir_nr") : pem.length}`);
  if (cmp) results.pem = compareRows("pem_snapshot", pem, await getAll(`pem_snapshot?erp_yukleme_id=eq.${eid}&select=*`), ["satir_nr"], log);

  // ---- ARGE
  L = namedLoad(await F.grid("Arge.xlsx"));
  // deno-lint-ignore no-explicit-any
  const arge: any[] = [];
  for (const r0 of L.rows) {
    const g = L.g;
    if (i(g(r0, "SATIR NR")) === null) continue;
    arge.push({ erp_yukleme_id: eid, satir_nr: i(g(r0, "SATIR NR")), durum: s(g(r0, "DURUM")),
      oncelik: i(g(r0, "ÖNCELİK")), proje_no: s(g(r0, "PROJE NO")), proje_adi: s(g(r0, "PROJE ADI")),
      ulke: s(g(r0, "ÜLKE")), tarih: dd(g(r0, "TARİH")), talep_acan: s(g(r0, "TALEP AÇAN")),
      arge_konusu: s(g(r0, "AR-GE KONUSU")), yapilanlar: s(g(r0, "YAPILANLAR")), yapilacaklar: s(g(r0, "YAPILACAKLAR")),
      ilgili: s(g(r0, "İLGİLİ")), tamamlanma_tarihi: dd(g(r0, "TAMAMLANMA TARİHİ")), kaynak: s(g(r0, "KAYNAK")),
      mail_bildirim: bl(g(r0, "MAİL BİLDİRİM")) });
  }
  log(`  arge_snapshot: ${write ? await upsert("arge_snapshot", arge, "erp_yukleme_id,satir_nr") : arge.length}`);
  if (cmp) results.arge = compareRows("arge_snapshot", arge, await getAll(`arge_snapshot?erp_yukleme_id=eq.${eid}&select=*`), ["satir_nr"], log);

  // ---- SÖ
  L = namedLoad(await F.grid("SÖ.xlsx"));
  const flatD = L.hm.has(norm("DURUM")), flatN = L.hm.has(norm("NİTELİK"));
  const RE_DUR = /^\s*DURUM\s*:\s*(.+)$/i, RE_NIT = /^\s*N[İI]TEL[İI]K\s*:\s*(.+)$/i;
  let curD: string | null = null, curN: string | null = null;
  // deno-lint-ignore no-explicit-any
  const so: any[] = [];
  for (const r0 of L.rows) {
    const a0 = r0.length ? r0[0] : null;
    if (a0 !== null && !isNumV(a0)) {
      let m = RE_DUR.exec(pystr(a0)); if (m) { curD = m[1].trim(); continue; }
      m = RE_NIT.exec(pystr(a0)); if (m) { curN = m[1].trim(); continue; }
    }
    const g = L.g;
    if (i(g(r0, "NR")) === null) continue;
    so.push({ erp_yukleme_id: eid, nr: i(g(r0, "NR")), tarih: dd(g(r0, "TARİH")),
      proje_sorun_satir_nr: i(g(r0, "PROJE SORUN SATIR NR")), proje_numarasi: s(g(r0, "PROJE NUMARASI")),
      durum: flatD ? s(g(r0, "DURUM")) : s(curD), proje_adi: s(g(r0, "PROJE ADI")), nitelik: flatN ? s(g(r0, "NİTELİK")) : s(curN),
      ulke: s(g(r0, "ÜLKE")), problem: s(g(r0, "PROBLEMİN TANIMI")), bildiren: s(g(r0, "BİLDİREN")),
      egitim_notu: s(g(r0, "EĞİTİM NOTU")), egitim_notu_tarihi: dd(g(r0, "EĞİTİM NOTU HAZIRLANMA TARİHİ")),
      egitim_dok_kodu: s(g(r0, "EĞİTİM DOKÜMAN KODU")), pem: s(g(r0, "PEM")), not_alani: s(g(r0, "NOT")),
      cozum_onerisi: s(g(r0, "ÇÖZÜM ÖNERİSİ")), sonuc: s(g(r0, "SONUÇ")), kusurlu_birim: s(g(r0, "KUSURLU BİRİM")),
      tamamlanma_tarihi: dd(g(r0, "TAMAMLANMA TARİHİ")), ek_bilgi_kullanici: s(g(r0, "EK BİLGİ YAPILACAK KULLANICI")) });
  }
  log(`  so_snapshot: ${write ? await upsert("so_snapshot", so, "erp_yukleme_id,nr") : so.length}`);
  if (cmp) results.so = compareRows("so_snapshot", so, await getAll(`so_snapshot?erp_yukleme_id=eq.${eid}&select=*`), ["nr"], log);

  // ---- En
  if (F.has("En.xlsx")) {
    L = namedLoad(await F.grid("En.xlsx"));
    // deno-lint-ignore no-explicit-any
    const ed: any[] = [];
    for (const r0 of L.rows) {
      const g = L.g;
      if (i(g(r0, "SATIR NR")) === null) continue;
      ed.push({ erp_yukleme_id: eid, satir_nr: i(g(r0, "SATIR NR")), kod: s(g(r0, "EĞİTİM DOKÜMAN KODU")),
        konu: s(g(r0, "EĞİTİM KONUSU")), yayim_tarihi: dd(g(r0, "YAYIM TARİHİ")),
        grup: s(g(r0, "GRUP")), bolum: s(g(r0, "BÖLÜM")), revizyon_tarihi: dd(g(r0, "REVİZYON TARİHİ")) });
    }
    log(`  egitim_dokuman_snapshot: ${write ? await upsert("egitim_dokuman_snapshot", ed, "erp_yukleme_id,satir_nr") : ed.length}`);
    if (cmp) results.en = compareRows("egitim_dokuman_snapshot", ed, await getAll(`egitim_dokuman_snapshot?erp_yukleme_id=eq.${eid}&select=*`), ["satir_nr"], log);
  } else log("  egitim_dokuman_snapshot: En.xlsx yok, atlandı.");

  // ---- Ep (3 satır başlık; aylar pozisyonla)
  if (F.has("Ep.xlsx")) {
    const erows = await F.grid("Ep.xlsx");
    const hmap2 = new Map<string, number>();
    (erows[2] || []).slice(0, 8).forEach((h, idx) => { const k = norm(h); if (k && !hmap2.has(k)) hmap2.set(k, idx); });
    const g2 = (row: V[], name: string): V => { const idx = hmap2.get(norm(name)); return idx !== undefined && idx < row.length ? row[idx] : null; };
    const AYLAR = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];
    // deno-lint-ignore no-explicit-any
    const pl: any[] = [];
    erows.slice(3).forEach((r0, ridx) => {
      if (!r0 || r0.every((c) => c === null)) return;
      // deno-lint-ignore no-explicit-any
      const row: any = { erp_yukleme_id: eid, satir_nr: ridx + 1, bolum: s(g2(r0, "BÖLÜM")), kod: s(g2(r0, "EĞİTİM DOKÜMAN KODU")),
        konu: s(g2(r0, "EĞİTİM KONUSU")), grup: s(g2(r0, "GRUP")), yayim_tarihi: dd(g2(r0, "YAYIM TARİHİ")),
        dosya_adi: s(g2(r0, "DOSYA ADI")), periyot: s(g2(r0, "PERİYOT")) };
      AYLAR.forEach((ay, mi) => {
        const base = 8 + mi * 2;
        row[ay + "_planlanan"] = base < r0.length ? dd(r0[base]) : null;
        row[ay + "_gerceklesen"] = base + 1 < r0.length ? dd(r0[base + 1]) : null;
      });
      pl.push(row);
    });
    log(`  egitim_plan_snapshot: ${write ? await upsert("egitim_plan_snapshot", pl, "erp_yukleme_id,satir_nr") : pl.length}`);
    if (cmp) results.ep = compareRows("egitim_plan_snapshot", pl, await getAll(`egitim_plan_snapshot?erp_yukleme_id=eq.${eid}&select=*`), ["satir_nr"], log);
  } else log("  egitim_plan_snapshot: Ep.xlsx yok, atlandı.");

  await rollup(c, prj);
  await usIcmal(c, results);
  await soncikisCari(c, prj);
  c.rapor.karsilastirma = results;
  log(`BITTI — ERP ${damga} snapshot'lari ${write ? "yuklendi" : "hesaplandi (yazilmadi)"} (bulut, baslik-adi bazli).`);
}

const band = (p: { proje_durumu: string | null }, lo: number, hi: number) => { const k = kodF(p.proje_durumu); return k !== null && k >= lo && k <= hi; };

// deno-lint-ignore no-explicit-any
async function rollup(c: Ctx, prj: any[]) {
  const { damga, log } = c;
  const write = c.mod === "run";
  const all = (await rest("erp_yukleme?select=damga")).map((r: { damga: string }) => r.damga);
  if (!write && !all.includes(damga)) all.push(damga);
  const same = all.filter((d: string) => d.slice(0, 4) === damga.slice(0, 4));
  if (!same.length || same.sort()[0] !== damga) { log("  rollup: bu ay ilk çekim değil, atlandı."); return; }
  const yy = parseInt(damga.slice(0, 2)), mm = parseInt(damga.slice(2, 4));
  const pmm = mm === 1 ? 12 : mm - 1, pyy = mm === 1 ? yy - 1 : yy;
  const donem = `${pad(pmm)}.${pad(pyy)}`;
  const onaysiz = prj.filter((p) => band(p, 0, 4)).reduce((a, p) => a + (p.adet || 0), 0);
  const urt = prj.filter((p) => band(p, 4.1, 7)).reduce((a, p) => a + (p.adet || 0), 0);
  const aups = prj.filter((p) => p.aup && band(p, 0, 7.1)).map((p) => p.aup as string).sort();
  const spc = aups.length ? aups[aups.length - 1] : null;
  const row = { donem, onaysiz_ad: Math.trunc(onaysiz), urt_ad: Math.trunc(urt), son_proje_cikis: spc, kaynak_cekim: damga };
  if (write) await rest("yillik_icmal?on_conflict=donem", { method: "POST", body: JSON.stringify([row]) }, "resolution=merge-duplicates,return=minimal");
  log(`  rollup: ${donem} -> Onaysız ${onaysiz} · Ürt ${urt} · Son Çıkış ${spc}${write ? "" : " (yazılmadı)"}`);
  const ex = await rest(`icmal_satir?select=kapasite_ad_ay&donem=eq.${donem}`);
  let kap: number | null = null;
  if (ex && ex.length) { const t = String(ex[0].kapasite_ad_ay).replaceAll(".", ""); kap = /^\s*[+-]?\d+\s*$/.test(t) ? parseInt(t) : null; }
  const ib: Record<string, string> = { onaysiz_ad: String(Math.trunc(onaysiz)), urt_ad: String(Math.trunc(urt)) };
  if (kap) ib.onay_ter_hf = String(pyRoundHalfEven(onaysiz / kap * 4.333));
  let found = !!(ex && ex.length);
  if (write) found = ((await rest(`icmal_satir?donem=eq.${donem}`, { method: "PATCH", body: JSON.stringify(ib) }, "return=representation")) || []).length > 0;
  log(`  rollup->icmal_satir: ${donem} Onaysız ${ib.onaysiz_ad} · Ürt ${ib.urt_ad} · OnayTer ${ib.onay_ter_hf ?? "-"} hf${found ? "" : " (icmal_satir'da yok, atlandı)"}`);
}

const US_AY: Record<string, number> = { "ocak": 1, "şubat": 2, "subat": 2, "mart": 3, "nisan": 4, "mayıs": 5, "mayis": 5, "haziran": 6,
  "temmuz": 7, "ağustos": 8, "agustos": 8, "eylül": 9, "eylul": 9, "ekim": 10, "kasım": 11, "kasim": 11, "aralık": 12, "aralik": 12 };

async function usIcmal(c: Ctx, results: Record<string, unknown>) {
  const { F, log } = c;
  const write = c.mod === "run";
  if (!F.has("Üs.xlsx")) { log("  us_icmal: Üs.xlsx yok, atlandı."); return; }
  const L = namedLoad(await F.grid("Üs.xlsx"));
  const g = L.g;
  const fi = (x: V) => { const v = n(x); return v === null ? null : String(pyRoundHalfEven(v)); };
  const fsep = (x: V) => {
    const v = n(x); if (v === null) return null;
    const k = pyRoundHalfEven(v); const sgn = k < 0 ? "-" : "";
    return sgn + String(Math.abs(k)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };
  let upd = 0, skip = 0;
  const diffs: string[] = [];
  for (const r0 of L.rows) {
    const ay = s(g(r0, "AY"));
    if (!ay) continue;
    const parts = ay.split(/\s+/).filter(Boolean);
    const mm = parts.length ? US_AY[parts[0].trim().toLowerCase()] : undefined;
    if (!mm || parts.length < 2) continue;
    const donem = `${pad(mm)}.${parts[1].slice(-2)}`;
    if (!n(g(r0, "MİKTAR (ADET)")) || !n(g(r0, "NET TUTAR (TL)"))) continue;
    const body: Record<string, string | null> = {
      adet: fi(g(r0, "MİKTAR (ADET)")), dk1_ad: fi(g(r0, "MİKTAR (DK ADET)")), m2: fi(g(r0, "MİKTAR (M2)")),
      net_eur: fsep(g(r0, "NET TUTAR (EURO)")), ort_kur: fi(g(r0, "ORTALAMA KUR")), net_tl: fsep(g(r0, "NET TUTAR (TL)")),
      netfi_eur_m2: fi(g(r0, "NET FİYAT (EURO/M2)")), netfi_eur_ad: fi(g(r0, "NET FİYAT (EURO/ADET)")),
      id_per: fi(g(r0, "İDARİ PERSONEL (KİŞİ)")), ur_per: fi(g(r0, "ÜRETİM PERSONEL (KİŞİ)")),
      top_per: fi(g(r0, "TOPLAM PERSONEL (KİŞİ)")), ciro_per_eur: fsep(g(r0, "CİRO/PERSONEL (EURO/KİŞİ)")),
    };
    const bru = n(g(r0, "BRÜT TUTAR (EURO)")), net = n(g(r0, "NET TUTAR (EURO)"));
    if (bru && net) body.isk = String(pyRoundHalfEven((bru - net) / bru * 100));
    if (write) {
      const r = await rest(`icmal_satir?donem=eq.${donem}`, { method: "PATCH", body: JSON.stringify(body) }, "return=representation");
      if (r && r.length) upd++; else { skip++; log(`  us_icmal: ${donem} icmal_satir'da yok, atlandı.`); }
    } else {
      const ex = await rest(`icmal_satir?donem=eq.${donem}&select=*`);
      if (ex && ex.length) {
        upd++;
        if (c.mod === "compare") for (const [k, v] of Object.entries(body)) if (!eqv(v, ex[0][k])) diffs.push(`${donem}.${k}: bulut=${v} db=${ex[0][k]}`);
      } else skip++;
    }
  }
  log(`  us_icmal: ${upd} ay ${write ? "güncellendi" : "eşleşti (yazılmadı)"}, ${skip} atlandı.`);
  if (c.mod === "compare") { log(`  [karşılaştır] icmal_satir (Üs): ${diffs.length} fark`); diffs.slice(0, 8).forEach((x) => log("     " + x)); results.us = diffs.length; }
}

// deno-lint-ignore no-explicit-any
async function soncikisCari(c: Ctx, prj: any[]) {
  const { damga, log } = c;
  const donem = `${damga.slice(2, 4)}.${damga.slice(0, 2)}`;
  const aups = prj.filter((p) => p.aup && band(p, 0, 7.1)).map((p) => p.aup as string).sort();
  if (!aups.length) { log("  soncikis_cari: AÜP yok, atlandı."); return; }
  const [y, m, d] = aups[aups.length - 1].split("-");
  const txt = `${d}.${m}.${y.slice(2)}`;
  if (c.mod === "run") {
    const r = await rest(`icmal_satir?donem=eq.${donem}`, { method: "PATCH", body: JSON.stringify({ son_proje_cikis: txt }) }, "return=representation");
    log(r && r.length ? `  soncikis_cari: ${donem} son_proje_cikis=${txt}` : `  soncikis_cari: ${donem} icmal_satir'da yok, atlandı.`);
  } else {
    const ex = await rest(`icmal_satir?donem=eq.${donem}&select=son_proje_cikis`);
    log(`  soncikis_cari: ${donem} son_proje_cikis=${txt} (yazılmadı; db=${ex && ex[0] ? ex[0].son_proje_cikis : "satır yok"})`);
  }
}

// ---------------------------------------------------------------- 2–3) Ana Gündem + Hazır erp eşleme
function digits(x: V) { return (x === null || x === undefined ? "" : pystr(x)).replace(/\D/g, ""); }
function lastN(x: V, k: number) { const d = digits(x); return d.slice(Math.max(0, d.length - k)); }
function isoD(v: V): string {
  if (v === null || v === undefined || v === "") return "";
  const t = pystr(v); const m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : t;
}
const or = (a: V, b: V) => (truthy(a) ? a : b);
// Python load_rows: {h:i for i,h in enumerate(hdr)} (aynı başlıkta sonuncusu kazanır) → r.get("<ham başlık>")
function loadRows(grid: V[][]): { get: (h: string) => V }[] {
  if (!grid.length) return [];
  const idx = new Map<string, number>();
  grid[0].forEach((h, k) => { if (typeof h === "string") idx.set(h, k); });
  return grid.slice(1).map((row) => ({ get: (h: string) => { const k = idx.get(h); return k !== undefined && k < row.length ? row[k] : null; } }));
}
async function erpMaps(F: Folder) {
  // deno-lint-ignore no-explicit-any
  const pemMap = new Map<string, any>(), prjMap = new Map<string, any>();
  // deno-lint-ignore no-explicit-any
  const J = (v: V): any => rawJson(v);
  if (F.has("Pem.xlsx")) {
    // deno-lint-ignore no-explicit-any
    for (const r of loadRows(await F.grid("Pem.xlsx")) as any[]) {
      const k = lastN(r.get("SATIR NR."), 5);
      if (k) {
        const mk = r.get("MİKTAR");
        pemMap.set(k, { proje: J(or(r.get("PROJE ADI"), "")), ekbilgi: J(or(r.get("TALEP"), "")),
          adet: pystr(mk !== null ? mk : or(r.get("MIKTAR"), "")), durum: J(or(r.get("DURUM"), "")),
          termin: isoD(or(r.get("TERMİN TARİHİ"), r.get("TERMIN TARIHI"))) });
      }
    }
  }
  if (F.has("Prj.xlsx")) {
    // deno-lint-ignore no-explicit-any
    for (const r of loadRows(await F.grid("Prj.xlsx")) as any[]) {
      const k = lastN(r.get("PROJE NUMARASI"), 8);
      if (k) {
        const ad = r.get("ADET");
        prjMap.set(k, { proje: J(or(r.get("PROJE ADI"), "")), notlar: J(or(r.get("SATIŞ/ŞANTİYE NOTLARI"), "")),
          adet: ad !== null ? pystr(ad) : "", durum: J(or(r.get("PROJE DURUMU"), "")), aup: isoD(or(r.get("AÜP"), r.get("AUP"))) });
      }
    }
  }
  return { pemMap, prjMap };
}
async function pool<T>(items: T[], k: number, fn: (x: T) => Promise<void>) {
  let p = 0;
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (p < items.length) await fn(items[p++]); }));
}
async function anaGundem(c: Ctx) {
  const { F, log } = c;
  const { pemMap, prjMap } = await erpMaps(F);
  log(`  pemMap ${pemMap.size} prjMap ${prjMap.size}`);
  const gp = (await getAll("ana_gundem?select=id,kod,kaynak_tip,konu,erp")).filter((r) => ["pem", "prj"].includes(r.kaynak_tip));
  let matched = 0, same = 0; const miss: string[] = []; const diffs: string[] = [];
  // deno-lint-ignore no-explicit-any
  const todo: { id: string; e: any }[] = [];
  for (const r of gp) {
    const mp = r.kaynak_tip === "pem" ? pemMap : prjMap;
    const e = mp.get(lastN(r.kod, r.kaynak_tip === "pem" ? 5 : 8));
    if (e) { matched++; todo.push({ id: r.id, e }); if (eqv(e, r.erp)) same++; else if (diffs.length < 5) diffs.push(`${r.kod}: bulut=${JSON.stringify(e).slice(0, 120)} db=${String(JSON.stringify(r.erp ?? null)).slice(0, 120)}`); }
    else miss.push(`('${r.kaynak_tip}', '${r.kod}')`);
  }
  if (c.mod === "run") await pool(todo, 8, async (t) => { await rest(`ana_gundem?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ erp: t.e }) }, "return=minimal"); });
  log(`pem/prj gundem rows ${gp.length} matched ${matched} miss [${miss.join(", ")}]`);
  if (c.mod === "compare") { log(`  [karşılaştır] ana_gundem.erp: ${same}/${matched} aynı`); diffs.forEach((x) => log("     " + x)); }
  c.rapor.ana_gundem = { rows: gp.length, matched, miss: miss.length, ayni: same };
}
async function hazir(c: Ctx) {
  const { F, log } = c;
  const { pemMap, prjMap } = await erpMaps(F);
  const rows = await getAll("hazir_pem_prj?select=tur,no");
  const db = new Map((await getAll("hazir_erp?select=tur,kalem_key,erp")).map((r) => [r.tur + "|" + r.kalem_key, r.erp]));
  // deno-lint-ignore no-explicit-any
  const payload: any[] = []; let matched = 0, same = 0; const miss: string[] = []; const seen = new Set<string>(); const diffs: string[] = [];
  const now = new Date().toISOString().replace("Z", "") + "000Z";
  for (const r of rows) {
    const tur = String(r.tur ?? "").toUpperCase(), no = String(r.no ?? "");
    if (!no) continue;
    const k = tur + "|" + no; if (seen.has(k)) continue; seen.add(k);
    const e = (tur === "PEM" ? pemMap : prjMap).get(lastN(no, tur === "PEM" ? 5 : 8));
    if (e) matched++; else miss.push(`('${tur}', '${no}')`);
    if (eqv(e || {}, db.get(k))) same++; else if (diffs.length < 5) diffs.push(`${k}: bulut=${JSON.stringify(e || {}).slice(0, 120)} db=${String(JSON.stringify(db.get(k) ?? null)).slice(0, 120)}`);
    payload.push({ tur, kalem_key: no, erp: e || {}, updated_at: now });
  }
  if (c.mod === "run" && payload.length) await rest("hazir_erp?on_conflict=tur,kalem_key", { method: "POST", body: JSON.stringify(payload) }, "resolution=merge-duplicates,return=minimal");
  log(`hazir_erp rows ${payload.length} matched ${matched} miss ${miss.length} [${miss.slice(0, 8).join(", ")}]`);
  if (c.mod === "compare") { log(`  [karşılaştır] hazir_erp.erp: ${same}/${payload.length} aynı`); diffs.forEach((x) => log("     " + x)); }
  c.rapor.hazir = { rows: payload.length, matched, miss: miss.length, ayni: same };
}

// ---------------------------------------------------------------- 4) şantiye formları
const TR: Record<string, string> = { "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g", "ü": "u", "Ü": "u", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c" };
function nrm(x: V): string {
  if (!truthy(x)) return "";
  let t = [...pystr(x)].map((ch) => TR[ch] ?? ch).join("");
  t = t.normalize("NFKD").replace(/\p{M}/gu, "");
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}
// YI-HARIC: nrm() sonrası (küçük harf, Türkçe harf/aksan sade) — büyük/küçük duyarsız; ARGE-YAZIM: Arge / Ar-Ge / Ar Ge
const YI_HARIC = /kavlak|\bar[-\s]?ge\b|zekeriyakoy\s+villa/, ARGE_HARIC = /\bar[-\s]?ge\b/;
function sonGun(y: number, m: number) { return new Date(Date.UTC(y + Math.floor(m / 12), (m % 12), 1) - 86400000).toISOString().slice(0, 10); }
function dOnly(v: V): string | null { return v instanceof PyDT ? `${pad(v.y, 4)}-${pad(v.mo)}-${pad(v.d)}` : null; }
function pyFloatStrict(t: string): number | null {
  return /^[+-]?(\d(_?\d)*(\.(\d(_?\d)*)?)?|\.\d(_?\d)*)([eE][+-]?\d(_?\d)*)?$/.test(t) ? Number(t.replaceAll("_", "")) : null;
}
async function santiye(c: Ctx, force = false) {
  const { damga, F, log } = c;
  const cek = { y: 2000 + parseInt(damga.slice(0, 2)), m: parseInt(damga.slice(2, 4)), d: parseInt(damga.slice(4, 6)) };
  // SANTIYE-GUNLUK (2026-11-10, Melih): her ingest'te çalışır. Dönem ayın 21'inde açılır:
  // çekim günü >= 21 → dönem bu ay; < 21 → dönem önceki ay (cevaplar aynı dönemde kalır, ERP alanları günlük tazelenir).
  const dy = cek.d >= 21 ? cek.y : (cek.m === 1 ? cek.y - 1 : cek.y), dm = cek.d >= 21 ? cek.m : (cek.m === 1 ? 12 : cek.m - 1);
  const donem = `${dy}-${pad(dm)}`;
  const lim = sonGun(cek.y, cek.m + 1);  // SANTIYE-SINIR-GERCEK (19.11.2026, Melih): sınır dönemden değil çekim tarihinden — çekim ayını izleyen ayın son günü (eski: dönem ayını izleyen ay)
  void force;
  log(`ŞANTİYE FORM DOLDURMA — çekim ${damga} (${pad(cek.d)}.${pad(cek.m)}.${cek.y}) · dönem ${donem} · MVT sınırı (çekim tarihinden) ${lim.split("-").reverse().join(".")}`);
  const formlar = await rest("santiye_form?select=kod,ad,erp_adlar,ulke_geri&order=sira");
  const ad2form = new Map<string, string>(), ulke2form = new Map<string, string>();
  for (const f of formlar) { for (const a of (f.erp_adlar || [])) ad2form.set(nrm(a), f.kod); for (const u of (f.ulke_geri || [])) ulke2form.set(nrm(u), f.kod); }
  // SANTIYE-PROJE-ESLE: proje no → form takma eşlemesi (ERP sorumlusu boş/yanlışsa)
  const esle = new Map<string, string>((await rest("santiye_proje_esle?select=proje_no,form_kodu")).map((x: any) => [String(x.proje_no).trim(), x.form_kodu]));
  log(`  ${formlar.length} form, ${ad2form.size} ad eşlemesi, ${ulke2form.size} ülke geri düşüşü, ${esle.size} proje eşlemesi`);
  const grid = await F.grid("Prj.xlsx");
  const hm = new Map<string, number>();
  (grid[0] || []).forEach((h, k) => { const kk = nrm(h); if (kk && !hm.has(kk)) hm.set(kk, k); });
  const g = (r: V[], ad: string): V => { const k = hm.get(nrm(ad)); return k !== undefined && k < r.length ? r[k] : null; };
  const flat = hm.has(nrm("PROJE DURUMU"));
  const RE = /^\s*PROJE\s+DURUMU\s*:\s*(.+)$/i;
  let cur: string | null = null;
  // deno-lint-ignore no-explicit-any
  const kayit: any[] = []; const kacak = new Map<string, number>();
  // deno-lint-ignore no-explicit-any
  const ileri: any[] = []; const hicbir: any[] = [];  // SANTIYE-ILERI · SANTIYE-HICBIR-MAIL
  for (const r of grid.slice(1)) {
    const a0 = r.length ? r[0] : null;
    if (a0 !== null && !isNumV(a0)) { const m = RE.exec(pystr(a0)); if (m) { cur = m[1].trim(); continue; } }
    const no = g(r, "PROJE NUMARASI");
    if (!truthy(no) || !pystr(no).trim()) continue;
    const ham = ((flat && truthy(g(r, "PROJE DURUMU"))) ? pystr(g(r, "PROJE DURUMU")) : cur) || "";  // PRJ-DURUM-YEDEK
    const tok = ham.trim().split(/\s+/)[0] ?? "";
    const kod = pyFloatStrict(tok);
    if (kod === null) continue;
    const mvt = dOnly(g(r, "MVT"));
    let ileriMi = false;
    if (kod === 8 || kod === 8.1) { /* hepsi */ } else if (kod >= 0 && kod <= 7.1 && mvt && mvt <= lim) { /* */ }
    else if (kod >= 0 && kod <= 7.1 && mvt && mvt > lim) ileriMi = true;  // SANTIYE-ILERI: sınırdan sonraki MVT → İleri Tarihli Projeler bloğu
    else continue;
    const sor = truthy(g(r, "ŞANTİYE SORUMLUSU")) ? pystr(g(r, "ŞANTİYE SORUMLUSU")).trim() : null;
    const ulke = truthy(g(r, "ÜLKE")) ? pystr(g(r, "ÜLKE")).trim() : null;
    const padi = truthy(g(r, "PROJE ADI")) ? pystr(g(r, "PROJE ADI")).trim() : null;
    const nok = pystr(no).trim(), kok = (nok.match(/^(PRJ-\d{4}-\d+)/) || [])[1] || "";
    const fk = esle.get(nok) || (sor ? ad2form.get(nrm(sor)) : ((kok && esle.get(kok)) || ulke2form.get(nrm(ulke))));  // SANTIYE-PROJE-ESLE · SANTIYE-ESLE-KOK (19.11.2026): sorumlu boşsa proje kökü eşlemesi
    if (!fk) {
      if (!ileriMi) { const k = sor || ("(boş) · " + (ulke || "?")); kacak.set(k, (kacak.get(k) || 0) + 1);
        hicbir.push({ proje_no: pystr(no).trim(), proje_adi: padi, sor, ulke, durum: ham.trim(), mvt }); }
      continue;
    }
    if (fk === "yi" && YI_HARIC.test(nrm(padi || ""))) continue;
    if (fk !== "yi" && ARGE_HARIC.test(nrm(padi || ""))) continue;
    const adetRaw = g(r, "ADET"); const at = truthy(adetRaw) ? pystr(adetRaw).trim() : "";
    (ileriMi ? ileri : kayit).push({ donem, form_kodu: fk, proje_no: pystr(no).trim(), proje_adi: padi, adet: /^\d+$/.test(at) ? parseInt(at, 10) : null,
      mvt, aup: dOnly(g(r, "AÜP")), pst: dOnly(g(r, "PLANLANAN SEVK TARİHİ")), proje_durumu: ham.trim(), ulke, santiye_sorumlusu: sor,
      erp_damga: damga, erp_tarih: `${cek.y}-${pad(cek.m)}-${pad(cek.d)}` });
  }
  const dag = new Map<string, number>(); for (const k of kayit) dag.set(k.form_kodu, (dag.get(k.form_kodu) || 0) + 1);
  log(`  kapsam: ${kayit.length} proje · ileri tarihli: ${ileri.length} · hiçbir forma girmeyen: ${hicbir.length}`);
  for (const f of formlar) log(`    ${String(f.kod).padEnd(6)} ${String(f.ad).padEnd(16)} ${dag.get(f.kod) || 0}`);
  if (kacak.size) { log("  EŞLEŞMEYEN (forma yazılmadı — ERP'de düzeltilmeli):"); [...kacak].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => log(`    ${k.padEnd(32)} ${v}`)); }
  if (c.mod === "compare") {
    const db = await getAll(`santiye_form_proje?donem=eq.${donem}&erp_damga=eq.${damga}&select=form_kodu,proje_no,proje_adi,adet,mvt,aup,pst,proje_durumu,ulke,santiye_sorumlusu,erp_tarih,donem,erp_damga`);
    c.rapor.santiye_karsilastirma = compareRows("santiye_form_proje", kayit, db, ["form_kodu", "proje_no"], log);
  }
  if (c.mod !== "run") { log("  (yazılmadı)"); c.rapor.santiye = `${kayit.length} proje (yazılmadı)`; return; }
  if (!kayit.length && !ileri.length) { log("  !! kapsam boş (Prj durumları okunamadı?) — hiçbir şey yazılmadı/silinmedi."); c.rapor.santiye = "kapsam boş"; return; }
  // SANTIYE-ILERI: dönemin ileri tarihli listesi her doldurmada baştan yazılır
  await rest(`santiye_form_ileri?donem=eq.${donem}`, { method: "DELETE" });
  for (let k = 0; k < ileri.length; k += 200)
    await rest("santiye_form_ileri?on_conflict=donem,form_kodu,proje_no", { method: "POST", body: JSON.stringify(ileri.slice(k, k + 200)) }, "resolution=merge-duplicates,return=minimal");
  log(`  ileri tarihli yazıldı: ${ileri.length} satır`);
  c.rapor.santiye_ileri = ileri.length;
  // SANTIYE-HICBIR-MAIL: hiçbir forma girmeyen projeler Melih'e mail ile sorulur
  // yalnız bu dönemde daha önce sorulmamış projeler (santiye_hicbir_soruldu)
  const sorulan = new Set((await getAll(`santiye_hicbir_soruldu?donem=eq.${donem}&select=proje_no`)).map((x) => x.proje_no));
  const yeniH = hicbir.filter((h) => !sorulan.has(h.proje_no));
  if (hicbir.length && !yeniH.length) log(`  hiçbir forma girmeyen ${hicbir.length} proje — hepsi bu dönemde zaten soruldu, mail yok`);
  if (yeniH.length) {
    hicbir.length = 0; hicbir.push(...yeniH);
    const tr = (x: string | null) => x ? x.split("-").reverse().join(".") : "—";
    const satir = hicbir.map((h) => `- ${h.proje_no} · ${h.proje_adi || "?"} · Durum ${h.durum || "?"} · MVT ${tr(h.mvt)} · Şantiye sorumlusu: ${h.sor || "(boş)"} · Ülke: ${h.ulke || "?"}`);
    const text = `Bu bir soru mailidir, iş isteği değildir. Cevabınızı yanıt olarak yazınız.\n\n` +
      `${donem} dönemi şantiye formu doldurmasında (ERP ${damga}) aşağıdaki ${hicbir.length} proje hiçbir şantiye formuna girmedi (şantiye sorumlusu formlarla eşleşmedi):\n\n` +
      satir.join("\n") + `\n\nHangi forma alınacaklarını ya da ERP'de hangi sorumlunun yazılacağını bildirmenizi rica ederim.\n\nMelih Bilgili`;
    try {
      const r = await fetch(`${SB}/functions/v1/arbor-mail`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, apikey: SRK, "Content-Type": "application/json" },
        body: JSON.stringify({ to: "int@arbor.com.tr", subject: `Claude: Hiçbir şantiye formuna girmeyen projeler (${donem})`, text }) });
      log(`  hiçbir forma girmeyen ${hicbir.length} proje — mail ${r.ok ? "gönderildi" : "HATA " + r.status}`);
      c.rapor.santiye_hicbir = { adet: hicbir.length, mail: r.ok };
      if (r.ok) await rest("santiye_hicbir_soruldu?on_conflict=donem,proje_no", { method: "POST", body: JSON.stringify(hicbir.map((h) => ({ donem, proje_no: h.proje_no, proje_adi: h.proje_adi, santiye_sorumlusu: h.sor, erp_damga: damga }))) }, "resolution=ignore-duplicates,return=minimal");
    } catch (e) { log("!! hiçbir forma girmeyen mail hata: " + e); c.rapor.santiye_hicbir = { adet: hicbir.length, mail: false }; }
  }
  if (!kayit.length) { log("  Yazılacak kayıt yok."); return; }
  for (let k = 0; k < kayit.length; k += 200)
    await rest("santiye_form_proje?on_conflict=donem,form_kodu,proje_no", { method: "POST", body: JSON.stringify(kayit.slice(k, k + 200)) }, "resolution=merge-duplicates,return=minimal");
  log(`  yazıldı: ${kayit.length} satır (dönem ${donem})`);
  c.rapor.santiye = `${kayit.length} proje yazıldı (dönem ${donem})`;
  const onc = await getAll(`santiye_form_proje?donem=lt.${donem}&pst_santiye=not.is.null&select=proje_no,form_kodu,pst_santiye,donem&order=donem.desc`);
  const son = new Map<string, string>(); for (const o of onc) if (!son.has(o.proje_no)) son.set(o.proje_no, o.pst_santiye);
  const bu = await getAll(`santiye_form_proje?donem=eq.${donem}&pst_santiye=is.null&select=id,proje_no`);
  let tas = 0;
  for (const m of bu) { const v = son.get(m.proje_no); if (v) { await rest(`santiye_form_proje?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ pst_santiye: v }) }, "return=minimal"); tas++; } }
  if (tas) log(`  önceki dönemden taşınan PST (pst_santiye): ${tas} satır`);
  const mevcut = await getAll(`santiye_form_proje?donem=eq.${donem}&select=id,proje_no,form_kodu,mvt_onay,pst_onay,pst_santiye`);
  const yeni = new Set(kayit.map((k) => k.form_kodu + "|" + k.proje_no));
  const sil = mevcut.filter((m) => !yeni.has(m.form_kodu + "|" + m.proje_no) && !m.mvt_onay && !m.pst_onay && !m.pst_santiye).map((m) => m.id);
  if (sil.length) { await rest(`santiye_form_proje?id=in.(${sil.join(",")})`, { method: "DELETE" }); log(`  kapsamdan çıkan cevapsız satır silindi: ${sil.length}`); }
}

// ---------------------------------------------------------------- 6) Etüt DK1
async function etutDk(c: Ctx) {
  const { damga, F, log } = c;
  if (!F.has("DK1.xlsx")) { log("etut dk: ATLANDI — DK1.xlsx bulunamadı"); c.rapor.etut = "ATLANDI"; return; }
  const grid = await F.grid("DK1.xlsx");
  if (!grid.length) { log("etut dk: boş"); return; }
  const hdr = grid[0].map((h) => (truthy(h) ? pystr(h) : "").trim().toUpperCase());
  const ix = new Map<string, number>(); hdr.forEach((h, k) => ix.set(h, k));
  const col = (r: V[], ...adlar: string[]): V => { for (const a of adlar) { const k = ix.get(a); if (k !== undefined && k < r.length) return r[k]; } return null; };
  const num = (v: V) => { if (v === null || v === "") return 0; const x = pyFloatStrict(pystr(v).replaceAll(",", ".").trim()); return x === null ? 0 : x; };
  const satir: Record<string, unknown>[] = []; const uyari: string[] = [];
  for (const r of grid.slice(1)) {
    const ad = (truthy(col(r, "PROJE ADI")) ? pystr(col(r, "PROJE ADI")) : "").replace(/\s+/g, " ").trim();
    if (!ad) continue;
    const p = ad.lastIndexOf(" - ");
    const [proje, part] = p >= 0 ? [ad.slice(0, p).trim(), ad.slice(p + 3).trim()] : [ad, ""];
    const d = { proje, part, adet: num(col(r, "ÜRÜN ADEDİ", "URUN ADEDI")), dk1: num(col(r, "DK1")), dk2: num(col(r, "DK2")), dk3: num(col(r, "DK3")), dk4: num(col(r, "DK4")) };
    const top = col(r, "TOPLAM DK");
    if (top !== null && top !== "" && Math.abs(d.dk1 + 2 * d.dk2 + 3 * d.dk3 + 5 * d.dk4 - num(top)) > 0.01) uyari.push(ad);
    satir.push(d);
  }
  if (c.mod !== "run") { log(`etut dk: ${damga} — ${satir.length} satır (yazılmadı)`); c.rapor.etut = `${satir.length} satır (yazılmadı)`; return; }
  const res = await rest("rpc/etut_dk_erp_yaz", { method: "POST", body: JSON.stringify({ p_damga: damga, p_satirlar: satir }) });
  log(`etut dk: ${damga} — ${satir.length} satır, ${res?.eklendi ?? 0} eklendi, ${res?.guncellendi ?? 0} güncellendi`);
  if (uyari.length) log("  TOPLAM DK formülle (dk1+2·dk2+3·dk3+5·dk4) uyuşmayan satırlar: " + uyari.slice(0, 8).join("; "));
  c.rapor.etut = `${satir.length} satır, ${res?.eklendi ?? 0} eklendi, ${res?.guncellendi ?? 0} güncellendi`;
}

// ---------------------------------------------------------------- 7) MY pasif PEM
async function myPasif(c: Ctx) {
  if (c.mod !== "run") { c.log("my pasif pem: (yazma kipinde değil, atlandı)"); return; }
  try {
    const r = await fetch(`${SB}/functions/v1/my-takip`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, apikey: SRK, "Content-Type": "application/json" }, body: JSON.stringify({ islem: "pasif_pem", force: false, onizleme: false }) });
    const o = await r.json();
    if (!r.ok || o.ok === false) { c.log(`!! my-takip pasif_pem ${r.status}: ${JSON.stringify(o).slice(0, 300)}`); c.rapor.my_pasif = `HATA ${r.status}`; return; }
    c.log(`my pasif pem: ${o.adet} PEM, mail ${o.mail}`);
    c.rapor.my_pasif = `${o.adet} PEM, mail ${o.mail}`;
  } catch (e) { c.log("!! my-takip pasif_pem hata: " + e); c.rapor.my_pasif = "HATA"; }
}

// ---------------------------------------------------------------- 5) Müşteri cirosu (ayrı çağrı)
async function ciro(log: (s: string) => void, rapor: Record<string, unknown>) {
  let bul = 0, yok = 0, hata = 0; const t0 = Date.now();
  for (let k = 0; k < 25; k++) {
    if (Date.now() - t0 > 300000) { log("  süre sınırı — kalanlar bir sonraki çekimde"); break; }
    // deno-lint-ignore no-explicit-any
    let o: any;
    try {
      const r = await fetch(`${SB}/functions/v1/musteri-ciro`, { method: "POST", headers: { Authorization: `Bearer ${SRK}`, apikey: SRK, "Content-Type": "application/json" }, body: JSON.stringify({ limit: 3 }) });
      o = await r.json();
    } catch (e) { log("!! musteri-ciro çağrısı hata: " + e); break; }
    if (!o.ok) { log("!! musteri-ciro: " + o.error); break; }
    for (const x of (o.sonuc || [])) {
      if (x.hata) { hata++; log(`  hata   ${x.firma} — ${String(x.hata).slice(0, 120)}`); }
      else if (x.ciro) { bul++; log(`  ciro   ${x.firma} → ${x.ciro}`); }
      else { yok++; log(`  yok    ${x.firma}`); }
    }
    if ((o.islenen ?? 0) === 0 || (o.kalan ?? 0) <= 0 || (o.hata ?? 0) === (o.islenen ?? 0)) break;
  }
  log(`musteri ciro: bulunan ${bul}, bulunamayan ${yok}, hata ${hata}`);
  rapor.ciro = `bulunan ${bul}, bulunamayan ${yok}, hata ${hata}`;
}

// ---------------------------------------------------------------- Duyuru farkı
async function duyuru(c: Ctx, prev: { damga: string; url: string } | null) {
  const { F, damga, log } = c;
  log("\n===== Duyuru → Prosedür kontrolü =====");
  if (!F.has("Duyuru.xlsx")) { log("[Duyuru] Duyuru.xlsx bulunamadı — kontrol atlandı."); c.rapor.duyuru = { durum: "dosya yok" }; return; }
  if (!prev) { log(`[Duyuru] ${damga}: önceki çekim yok (ilk Duyuru) — Prosedürler'i gözden geçir.`); c.rapor.duyuru = { durum: "önceki yok" }; return; }
  const rowsOf = (g: V[][]) => new Set(g.map((r) => JSON.stringify(r.map((x) => (x === null ? "" : pystr(x).trim())))));
  const cur = rowsOf(await F.grid("Duyuru.xlsx"));
  const old = rowsOf(await gridFromUrl(prev.url));
  const yeni = [...cur].filter((r) => !old.has(r)).map((r) => JSON.parse(r) as string[])
    .filter((r) => r.some((x) => x) && !r.join(" ").toLowerCase().includes("deneme"));
  if (!yeni.length) { log(`[Duyuru] ${damga}: önceki çekime (${prev.damga}) göre yeni duyuru yok — Prosedür güncel.`); c.rapor.duyuru = { durum: "yeni yok", onceki: prev.damga }; return; }
  const lines = yeni.map((r) => r.filter((x) => x).join(" · ").replaceAll("_x000d_", " ").replaceAll("\n", " "));
  log(`!! DUYURU DEĞİŞTİ (${damga} vs ${prev.damga}): ${yeni.length} yeni/değişen satır — Prosedürler'e eklenmeli (sormadan).`);
  lines.slice(0, 12).forEach((t) => log("   - " + t.slice(0, 160)));
  c.rapor.duyuru = { durum: "yeni var", onceki: prev.damga, satirlar: lines };
}

// ---------------------------------------------------------------- akış
// deno-lint-ignore no-explicit-any
async function calistir(logId: number, body: any) {
  const out: string[] = [];
  const log = (x: string) => { out.push(x); };
  // deno-lint-ignore no-explicit-any
  const rapor: Record<string, any> = {};
  const t0 = Date.now();
  const tm: Record<string, number> = {};
  const adim = async (ad: string, fn: () => Promise<void>, kritik = false) => {
    const t = Date.now();
    log(`\n===== ${ad} =====`);
    try { await fn(); } catch (e) { log(`!! ${ad} HATA: ${e instanceof Error ? e.message : e}`); rapor.hatalar = [...(rapor.hatalar || []), `${ad}: ${e instanceof Error ? e.message : e}`]; if (kritik) throw e; }
    tm[ad] = Date.now() - t;
  };
  let durum = "bitti";
  try {
    if (body.mod === "ciro") {
      await adim("5) Müşteri cirosu (musteri_firma.ciro_*)", () => ciro(log, rapor));
    } else {
      const F = new Folder(body.files || []);
      const c: Ctx = { mod: body.mod, damga: body.damga, F, log, rapor, eid: body.eid };
      const sadece: string[] | null = Array.isArray(body.adimlar) ? body.adimlar : null;
      const yap = (k: string) => !sadece || sadece.includes(k);
      log(`ERP ÇEKİM GÖREVİ (bulut, mod ${body.mod})\n  Klasör : ${body.damga}\n  Dosyalar: ${[...F.files.values()].map((f) => f.name).join(", ")}`);
      if (yap("1")) await adim("1) Worker ingest (snapshot + icmal + yillik_icmal)", () => worker(c), true);
      if (yap("2")) await adim("2) Ana Gündem PEM/PRJ erp-eşle (ana_gundem.erp)", () => anaGundem(c));
      if (yap("3")) await adim("3) Hazır PEM/PRJ erp-eşle (hazir_erp)", () => hazir(c));
      if (yap("4")) await adim("4) Şantiye formları doldur (santiye_form_proje)", () => santiye(c, !!body.santiye_force));
      if (yap("6")) await adim("6) Etüt DK1 (etut_dk)", () => etutDk(c));
      if (yap("7")) await adim("7) MY pasif PEM → EU maili", () => myPasif(c));
      if (yap("d")) await adim("Duyuru", () => duyuru(c, body.prev_duyuru || null));
      if (body.mod === "run" && yap("5")) {
        // 5) uzun sürer → ayrı çağrı (pg_net)
        try { await rest("rpc/erp_ingest_cagir", { method: "POST", body: JSON.stringify({ p_body: { mod: "ciro", damga: body.damga } }) }); log("\n5) Müşteri cirosu ayrı çağrıyla başlatıldı (erp_ingest_log'da ayrı satır)."); rapor.ciro = "ayrı çağrıda"; }
        catch (e) { log("!! 5) ciro başlatılamadı: " + e); }
      }
    }
    if (rapor.hatalar?.length) durum = "kismi";
  } catch (_e) { durum = "hata"; }
  rapor.sure_ms = { toplam: Date.now() - t0, ...tm };
  await rest(`erp_ingest_log?id=eq.${logId}`, { method: "PATCH", body: JSON.stringify({ durum, rapor, cikti: out.join("\n"), bitti_at: new Date().toISOString() }) }, "return=minimal");
}

const IMZA_DOSYA = ["Prj.xlsx", "Pem.xlsx", "Arge.xlsx", "SÖ.xlsx", "Cam.xlsx", "En.xlsx", "Ep.xlsx"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, hata: "POST" }, 405);
  const anahtar = await rest("sistem_anahtar?select=deger&ad=eq.erp_ingest");
  const k = req.headers.get("x-erp-key") || "";
  if (!k || !anahtar?.[0] || k !== String(anahtar[0].deger)) return json({ ok: false, hata: "yetki yok" }, 401);
  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return json({ ok: false, hata: "json" }, 400); }
  const mod = String(b.mod || "dry");
  if (!["run", "dry", "compare", "ciro"].includes(mod)) return json({ ok: false, hata: "mod?" }, 400);
  b.mod = mod;
  let imza: string | null = null;
  if (mod !== "ciro") {
    if (!/^\d{6}$/.test(String(b.damga || ""))) return json({ ok: false, hata: "damga?" }, 400);
    const F = new Folder(b.files || []);
    const eksik = ["Prj.xlsx", "Pem.xlsx", "Arge.xlsx", "SÖ.xlsx"].filter((f) => !F.has(f));
    if (eksik.length) {
      const r = await rest("erp_ingest_log", { method: "POST", body: JSON.stringify({ damga: b.damga, mod, durum: "eksik", rapor: { eksik }, bitti_at: new Date().toISOString() }) }, "return=representation");
      return json({ ok: false, durum: "eksik", eksik, log_id: r[0].id });
    }
    const parts = IMZA_DOSYA.map((f) => { const x = F.files.get(key(f)); return x ? `${f}:${x.size}:${x.mtime}` : `${f}:none`; });
    imza = b.damga + "|" + await md5hex(parts.join("|"));
    if (mod === "run" && !b.force) {
      const ok = await rest(`erp_ingest_log?imza=eq.${encodeURIComponent(imza)}&mod=eq.run&durum=in.(bitti,kismi,calisiyor)&select=id,durum,created_at&order=id.desc&limit=1`);
      if (ok && ok.length) {
        const r = await rest("erp_ingest_log", { method: "POST", body: JSON.stringify({ damga: b.damga, imza, mod, durum: "degisiklik_yok", rapor: { onceki_log: ok[0].id }, cikti: `Değişiklik yok (ERP ${b.damga}) — ingest atlandı.`, bitti_at: new Date().toISOString() }) }, "return=representation");
        return json({ ok: true, durum: "degisiklik_yok", damga: b.damga, log_id: r[0].id, onceki_log: ok[0].id });
      }
    }
  }
  const ins = await rest("erp_ingest_log", { method: "POST", body: JSON.stringify({ damga: b.damga ?? null, imza, mod, durum: "calisiyor" }) }, "return=representation");
  const logId = ins[0].id;
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(calistir(logId, b).catch(async (e) => {
    await rest(`erp_ingest_log?id=eq.${logId}`, { method: "PATCH", body: JSON.stringify({ durum: "hata", cikti: String(e), bitti_at: new Date().toISOString() }) }, "return=minimal");
  }));
  return json({ ok: true, durum: "basladi", log_id: logId, damga: b.damga ?? null, mod });
});
