// ERP-INGEST-BULUT — openpyxl (data_only=True) davranışını taklit eden küçük xlsx okuyucu.
// Amaç: Python betikleriyle BİREBİR aynı hücre değerleri (int/float ayrımı, tarih biçimi algısı,
// "_x000d_" kaçışlarının çözülmeden kalması, ilk sayfa, 1. satır/1. sütundan başlayan dolu ızgara).

export class PyF { v: number; constructor(v: number) { this.v = v; } }          // Python float
export class PyDT {                                                               // Python datetime
  y: number; mo: number; d: number; h: number; mi: number; s: number; us: number;
  constructor(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, us = 0) {
    this.y = y; this.mo = mo; this.d = d; this.h = h; this.mi = mi; this.s = s; this.us = us;
  }
}
export class PyTime { txt: string; constructor(t: string) { this.txt = t; } }    // time / timedelta
export type V = null | string | number | boolean | PyF | PyDT | PyTime;

// ---------------------------------------------------------------- zip
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buf: Uint8Array, want: (name: string) => boolean): Promise<Record<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: EOCD yok");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: Record<string, Uint8Array> = {};
  const td = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip: merkez dizin bozuk");
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = td.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    const lnlen = dv.getUint16(loff + 26, true), lxlen = dv.getUint16(loff + 28, true);
    const start = loff + 30 + lnlen + lxlen;
    const raw = buf.subarray(start, start + csize);
    out[name] = method === 0 ? raw : await inflateRaw(raw);
  }
  return out;
}

// ---------------------------------------------------------------- xml yardımcıları
function xmlText(s: string): string {
  s = s.replace(/\r\n?/g, "\n");
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) =>
    e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'"
      : e[1] === "x" ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(parseInt(e.slice(1), 10)));
}
function attrs(s: string): Record<string, string> {
  const o: Record<string, string> = {};
  const re = /([\w:]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) { const k = m[1].includes(":") ? m[1].split(":").pop()! : m[1]; o[k] = xmlText(m[3] ?? m[4] ?? ""); o[m[1]] = o[k]; }
  return o;
}
// openpyxl Text.content: düz <t> + <r><t> parçaları; <rPh> (fonetik) hariç
function richText(inner: string): string {
  inner = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let t = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) t += xmlText(m[1]);
  return t;
}

// ---------------------------------------------------------------- sayı biçimleri (openpyxl.styles.numbers)
const BUILTIN: Record<number, string> = {
  0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00",
  12: "# ?/?", 13: "# ??/??", 14: "mm-dd-yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm", 37: "#,##0_);(#,##0)",
  38: "#,##0_);[Red](#,##0)", 39: "#,##0.00_);(#,##0.00)", 40: "#,##0.00_);[Red](#,##0.00)",
  45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
};
const STRIP_RE = /".*?"|\[(?!hh?\]|mm?\]|ss?\])[^\]]*\]/g;
function isDateFormat(fmt: string | undefined): boolean {
  if (!fmt) return false;
  let f = fmt.split(";")[0];
  f = f.replace(STRIP_RE, "");
  return /(?<![_\\])[dmhysDMHYS]/.test(f);
}
const TIMEDELTA_RE = /^\[hh?\](:mm(:ss(\.0*)?)?)?|^\[mm?\](:ss(\.0*)?)?|^\[ss?\](\.0*)?/i;
function isTimedelta(fmt: string | undefined): boolean {
  return !!fmt && TIMEDELTA_RE.test(fmt.split(";")[0]);
}

function pyRoundHalfEven(x: number): number {
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
  return Math.round(x);
}
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function fromExcel(value: number, epoch1904: boolean, asDelta: boolean): V {
  const day = Math.floor(value);
  const frac = value - day;
  const ms = pyRoundHalfEven(frac * 86400 * 1000);
  if (asDelta) return new PyTime(String(value));
  if (value >= 0 && value < 1 && ms < 86400000) {
    const t = ms; const h = Math.floor(t / 3600000), mi = Math.floor((t % 3600000) / 60000), s = Math.floor((t % 60000) / 1000);
    return new PyTime(`${pad(h)}:${pad(mi)}:${pad(s)}`);
  }
  let d = day;
  let base: number;
  if (epoch1904) base = Date.UTC(1904, 0, 1);
  else { base = Date.UTC(1899, 11, 30); if (value > 0 && value < 60) d += 1; }
  const t = base + d * 86400000 + ms;
  const dt = new Date(t);
  return new PyDT(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), dt.getUTCHours(), dt.getUTCMinutes(),
    dt.getUTCSeconds(), dt.getUTCMilliseconds() * 1000);
}

function castNumber(v: string): number | PyF {
  if (v.includes(".") || v.includes("E") || v.includes("e")) return new PyF(Number(v));
  return parseInt(v, 10);
}

// ---------------------------------------------------------------- okuyucu: ilk sayfa → dolu ızgara
export async function readFirstSheet(buf: Uint8Array): Promise<V[][]> {
  const td = new TextDecoder();
  const meta = await unzip(buf, (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" ||
    n === "xl/sharedStrings.xml" || n === "xl/styles.xml");
  const wbx = meta["xl/workbook.xml"] ? td.decode(meta["xl/workbook.xml"]) : "";
  const relx = meta["xl/_rels/workbook.xml.rels"] ? td.decode(meta["xl/_rels/workbook.xml.rels"]) : "";
  const pr = /<(?:\w+:)?workbookPr\b([^>]*)>/.exec(wbx);
  const epoch1904 = pr ? ["1", "true"].includes((attrs(pr[1]).date1904 || "").toLowerCase()) : false;
  const sm = /<(?:\w+:)?sheet\b([^>]*)\/?>/.exec(wbx);
  if (!sm) throw new Error("xlsx: sayfa yok");
  const rid = attrs(sm[1]).id;
  let target = "worksheets/sheet1.xml";
  const relRe = /<Relationship\b([^>]*)\/?>/g; let rm: RegExpExecArray | null;
  while ((rm = relRe.exec(relx))) { const a = attrs(rm[1]); if (a.Id === rid) { target = a.Target; break; } }
  const sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");

  // paylaşılan metinler
  const ss: string[] = [];
  if (meta["xl/sharedStrings.xml"]) {
    const x = td.decode(meta["xl/sharedStrings.xml"]);
    const re = /<si\s*\/>|<si>([\s\S]*?)<\/si>/g; let m: RegExpExecArray | null;
    while ((m = re.exec(x))) ss.push(m[1] === undefined ? "" : richText(m[1]));
  }
  // stiller → tarih/süre biçimli stil indeksleri
  const dateStyles = new Set<number>(), deltaStyles = new Set<number>();
  if (meta["xl/styles.xml"]) {
    const x = td.decode(meta["xl/styles.xml"]);
    const custom: Record<number, string> = {};
    const nfRe = /<numFmt\b([^>]*)\/?>/g; let m: RegExpExecArray | null;
    while ((m = nfRe.exec(x))) { const a = attrs(m[1]); custom[parseInt(a.numFmtId)] = a.formatCode; }
    const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(x);
    if (cx) {
      const xfRe = /<xf\b([^>]*?)\/?>/g; let k = 0;
      while ((m = xfRe.exec(cx[1]))) {
        const id = parseInt(attrs(m[1]).numFmtId || "0");
        const fmt = custom[id] ?? BUILTIN[id] ?? "General";
        if (isDateFormat(fmt)) { dateStyles.add(k); if (isTimedelta(fmt)) deltaStyles.add(k); }
        k++;
      }
    }
  }
  const sh = await unzip(buf, (n) => n === sheetPath);
  if (!sh[sheetPath]) throw new Error("xlsx: sayfa dosyası yok " + sheetPath);
  const x = td.decode(sh[sheetPath]);
  const cells = new Map<number, Map<number, V>>();
  let maxRow = 0, maxCol = 0, rowCounter = 0;
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const colNum = (ref: string) => { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c >= 65 && c <= 90) n = n * 26 + c - 64; else break; } return n; };
  let rm2: RegExpExecArray | null;
  while ((rm2 = rowRe.exec(x))) {
    const ra = attrs(rm2[1]);
    const r = ra.r ? parseInt(ra.r) : rowCounter + 1;
    rowCounter = r;
    if (!rm2[2]) continue;
    let colCounter = 0; let cm: RegExpExecArray | null;
    cRe.lastIndex = 0;
    while ((cm = cRe.exec(rm2[2]))) {
      const a = attrs(cm[1]);
      const col = a.r ? colNum(a.r) : colCounter + 1;
      colCounter = col;
      const t = a.t || "n";
      const style = a.s ? parseInt(a.s) : 0;
      const inner = cm[2] || "";
      const vm = /<v>([\s\S]*?)<\/v>/.exec(inner) || (/<v\s*\/>/.test(inner) ? ["", ""] as unknown as RegExpExecArray : null);
      let val: V = null;
      if (vm) {
        const raw = xmlText(vm[1]);
        if (t === "n") {
          if (raw !== "") {
            const num = castNumber(raw);
            if (dateStyles.has(style)) val = fromExcel(num instanceof PyF ? num.v : num, epoch1904, deltaStyles.has(style));
            else val = num;
          }
        } else if (t === "s") val = ss[parseInt(raw)] ?? null;
        else if (t === "b") val = parseInt(raw) !== 0;
        else if (t === "str" || t === "e") val = raw;
        else if (t === "d") {
          const mm = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(raw);
          val = mm ? new PyDT(+mm[1], +mm[2], +mm[3], +(mm[4] || 0), +(mm[5] || 0), +(mm[6] || 0)) : raw;
        } else val = raw;
      } else if (t === "inlineStr") {
        const im = /<is>([\s\S]*?)<\/is>/.exec(inner);
        if (im) val = richText(im[1]);
      }
      let rowMap = cells.get(r); if (!rowMap) { rowMap = new Map(); cells.set(r, rowMap); }
      rowMap.set(col, val);
      if (r > maxRow) maxRow = r;
      if (col > maxCol) maxCol = col;
    }
  }
  const grid: V[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const rowMap = cells.get(r);
    const row: V[] = new Array(maxCol).fill(null);
    if (rowMap) for (const [c, v] of rowMap) row[c - 1] = v;
    grid.push(row);
  }
  return grid;
}

// ---------------------------------------------------------------- Python eşdeğerleri
export function pyFloatStr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1);
  const ax = Math.abs(x);
  if (ax >= 1e16 || ax < 1e-4) {
    const e = x.toExponential(); // 1.5e+16
    const [mant, ex] = e.split("e");
    const exn = parseInt(ex);
    return mant + "e" + (exn < 0 ? "-" : "+") + pad(Math.abs(exn));
  }
  return String(x);
}
export function pystr(v: V): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  if (v instanceof PyF) return pyFloatStr(v.v);
  if (v instanceof PyDT) return `${pad(v.y, 4)}-${pad(v.mo)}-${pad(v.d)} ${pad(v.h)}:${pad(v.mi)}:${pad(v.s)}` + (v.us ? "." + pad(v.us, 6) : "");
  if (v instanceof PyTime) return v.txt;
  return String(v);
}
export function truthy(v: V): boolean {
  if (v === null || v === undefined || v === "" || v === false || v === 0) return false;
  if (v instanceof PyF) return v.v !== 0;
  return true;
}
export function isNum(v: V): boolean { return typeof v === "number" || v instanceof PyF || typeof v === "boolean"; }
// JSON'a yazılacak ham değer (json.dumps eşdeğeri)
export function rawJson(v: V): unknown {
  if (v instanceof PyF) return v.v;
  if (v instanceof PyDT || v instanceof PyTime) return pystr(v);
  return v;
}
export { pyRoundHalfEven };
