/* SITU-YUKLEME (10.11.2026, Melih): "Situ Yapılmamış Yüklemeler" bloğu — Giriş panosu (Prim şartını sağlayan sağında)
   ve MK Faaliyet formu (grafiklerin sağında). Kaynak: view situ_yukleme_v (OE formunda faturanın projelere dağıtılan
   satırları, "Arge ve diğer sebepler" hariç), seçilebilir situation'lar view situ_kapasite_v (ÖB ob_situation).
   Situ Ekle → RPC yukleme_situ_kaydet (oran toplamı ≤ %100; bir situation'a bağlanan yükleme tutarı situ tutarının 2 katını aşamaz).
   Yapılacak Situ = (1 − Yapılmış Situ Oranı) × yükleme tutarı; Sel-Arb "Yapılacak Situ" sütunu DB'de otomatik güncellenir.
   Oran %100 ve seçilen situ tutarları yüklemeyi karşılıyorsa satır "Situation Yapılmış Yüklemeler" (açılır) altına geçer.
   Kullanım: SITUYK.render(kapElemanı,{sb, kim:()=>"MK"}) */
(function(){
"use strict";
const CSS=`
.syk{min-width:0}
.syk h3{margin:0 0 6px;font-size:13px;color:#16324f}
.syk table{border-collapse:collapse;font-size:12px;width:auto}
.syk th{background:#16324f;color:#fff;font-weight:600;padding:3px 7px;white-space:nowrap;text-align:left}
.syk td{padding:2px 7px;border-bottom:1px solid #f1d3dd;white-space:nowrap}
.syk tr.syk-acik td{background:#fde4ec}
.syk td.n,.syk th.n{text-align:right}
.syk .syk-btn{border:1px solid #16324f;background:#fff;color:#16324f;border-radius:5px;padding:1px 8px;font-size:11.5px;cursor:pointer}
.syk .syk-btn:hover{background:#16324f;color:#fff}
.syk .syk-not{color:#b23a2e;font-size:11px}
.syk details{margin-top:8px}
.syk summary{cursor:pointer;font-weight:600;color:#16324f;font-size:12.5px}
.syk .syk-bos{color:#8a97a4;padding:4px 7px}
.syk-bg{position:fixed;inset:0;background:rgba(10,25,45,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:9vh 12px}
.syk-m{background:#fff;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.3);padding:14px 16px;width:min(640px,96vw);max-height:80vh;overflow:auto;font:13px system-ui,Segoe UI,sans-serif;color:#16324f}
.syk-m h4{margin:0 0 4px;font-size:14px}
.syk-m .syk-alt{color:#5a6b7d;margin-bottom:8px}
.syk-m .syk-uyari{background:#fff6dd;border:1px solid #f0d58a;border-radius:6px;padding:6px 9px;margin:6px 0 10px;color:#6b4e00;font-size:12px}
.syk-m table{border-collapse:collapse;width:100%;font-size:12px}
.syk-m th{text-align:left;color:#5a6b7d;font-weight:600;padding:3px 4px;border-bottom:1px solid #e3e9f0}
.syk-m td{padding:3px 4px;border-bottom:1px solid #f0f3f7}
.syk-m input.syk-oran{width:6ch;text-align:right;padding:2px 4px;border:1px solid #c9d6e3;border-radius:4px}
.syk-m select{max-width:100%;padding:3px;border:1px solid #c9d6e3;border-radius:5px;font-size:12px}
.syk-m .syk-sil{border:0;background:none;color:#b23a2e;cursor:pointer;font-size:14px}
.syk-m .syk-ft{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.syk-m .syk-ft button{border:1px solid #cdd8e4;background:#fff;color:#16324f;border-radius:7px;padding:5px 12px;cursor:pointer}
.syk-m .syk-ft button.ok{border:0;background:#16324f;color:#fff}
.syk-m .syk-msg{color:#b23a2e;min-height:16px;margin-top:6px}
.syk-m .syk-top{margin-top:6px;font-weight:600}`;
function css(){ if(document.getElementById("syk-css")) return; const s=document.createElement("style"); s.id="syk-css"; s.textContent=CSS; document.head.appendChild(s); }
const E=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const F=v=>(v==null||v==="")?"":Math.round(Number(v)).toLocaleString("tr-TR");
const P=v=>(Math.round(Number(v||0)*1000)/10).toLocaleString("tr-TR")+" %";
const D=d=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(d||"")); return m?m[3]+"."+m[2]+"."+m[1].slice(2):""; };
const K=s=>String(s||"").trim().toLocaleLowerCase("tr").replace(/\s+/g," ");
const sNo=s=>[s.no||s.ilerleme_no?("Situ "+(s.no||s.ilerleme_no)):"",s.donem||"",D(s.tarih)].filter(Boolean).join(" · ");

function satir(r,acik){
  const not=(acik&&Number(r.oran)>=0.99999)?' <span class="syk-not">situ tutarı yüklemeyi karşılamıyor</span>':"";
  const st=(r.sitular||[]).map(s=>E(s.proje)+" "+E(sNo(s))+" ("+P(s.oran)+")").join("<br>");
  return `<tr class="${acik?"syk-acik":""}" data-yk="${r.id}" title="Fatura ${E(r.ft_no||"")} · ${E(r.yd_birim||"")}${r.para_birimi&&r.para_birimi!=="EUR"?" · "+E(F(r.tutar))+" "+E(r.para_birimi):""}">`
    +`<td>${E(D(r.tarih))}</td><td class="n">${E(F(r.tutar_eur))}</td><td>${E(r.proje)}</td>`
    +`<td class="n">${E(P(r.oran))}</td><td class="n">${E(F(r.yapilacak))}</td>`
    +(acik?"":`<td style="white-space:normal;font-size:11px;color:#5a6b7d">${st}</td>`)
    +`<td><button class="syk-btn" data-yk="${r.id}">Situ Ekle</button>${not}</td></tr>`;
}
async function render(kap,o){
  if(!kap||!o||!o.sb) return; css();
  const sb=o.sb;
  kap.classList.add("syk");
  const {data,error}=await sb.from("situ_yukleme_v").select("*").order("tarih",{ascending:false}).order("id",{ascending:false});
  if(error){ kap.innerHTML=`<h3>Situ Yapılmamış Yüklemeler</h3><div class="syk-bos">Okunamadı: ${E(error.message)}</div>`; return; }
  const L=data||[], ac=L.filter(r=>!r.kapali), kp=L.filter(r=>r.kapali);
  const bas=(ek)=>`<thead><tr><th>Yükleme Tarihi</th><th class="n">Tutarı (€)</th><th>Proje Adı</th><th class="n">Yapılmış Situ Oranı</th><th class="n">Yapılacak Situ (€)</th>${ek?"<th>Situation</th>":""}<th></th></tr></thead>`;
  const top=ac.reduce((a,r)=>a+Number(r.yapilacak||0),0);
  kap.innerHTML=`<h3>Situ Yapılmamış Yüklemeler${ac.length?` <span style="font-weight:400;color:#5a6b7d">(${ac.length} · ${E(F(top))} €)</span>`:""}</h3>`
    +`<div class="scroll"><table>${bas(false)}<tbody>${ac.length?ac.map(r=>satir(r,true)).join(""):`<tr><td colspan="6" class="syk-bos">Situ bekleyen yükleme yok.</td></tr>`}</tbody></table></div>`
    +(kp.length?`<details><summary>Situation Yapılmış Yüklemeler (${kp.length})</summary><div class="scroll"><table>${bas(true)}<tbody>${kp.map(r=>satir(r,false)).join("")}</tbody></table></div></details>`:"");
  kap.querySelectorAll("button.syk-btn").forEach(b=>b.onclick=()=>{ const r=L.find(x=>String(x.id)===b.dataset.yk); if(r) modal(sb,r,o,()=>render(kap,o)); });
}
async function modal(sb,r,o,sonra){
  const ov=document.createElement("div"); ov.className="syk-bg";
  ov.innerHTML=`<div class="syk-m"><h4>Situ Ekle</h4>
    <div class="syk-alt">${E(r.proje)} · Yükleme ${E(D(r.tarih))} · ${E(F(r.tutar_eur))} € · Fatura ${E(r.ft_no||"")}</div>
    <div class="syk-uyari">Oran, bu yüklemenin yüzde kaçının hangi situation ile müşteriye yansıtıldığını belirtir. Oranların toplamı %100'ü aşamaz.</div>
    <table><thead><tr><th>Situation (ÖB)</th><th style="width:9ch">Oran (%)</th><th style="width:3ch"></th></tr></thead><tbody class="syk-ls"></tbody></table>
    <div style="margin-top:8px"><select class="syk-yeni"><option value="">+ Situation seç…</option></select></div>
    <div class="syk-top"></div><div class="syk-msg"></div>
    <div class="syk-ft"><button class="iptal">Vazgeç</button><button class="ok">Kaydet</button></div></div>`;
  document.body.appendChild(ov);
  const kapat=()=>ov.remove(), m=ov.querySelector(".syk-msg");
  ov.addEventListener("mousedown",e=>{ if(e.target===ov) kapat(); });
  ov.querySelector(".iptal").onclick=kapat;
  const {data:S,error}=await sb.from("situ_kapasite_v").select("*").order("tarih",{ascending:false});
  if(error){ m.textContent="Situation listesi okunamadı: "+error.message; return; }
  const yk=Number(r.tutar_eur||0);
  const sec=(r.sitular||[]).map(s=>({situ_id:s.situ_id,oran:Number(s.oran)}));
  const mevcut={}; sec.forEach(s=>{ mevcut[s.situ_id]=s.oran*yk; });   /* bu yüklemenin kendi kullanımı kapasiteye geri eklenir */
  const byId={}; (S||[]).forEach(s=>byId[s.id]=s);
  (r.sitular||[]).forEach(s=>{ if(!byId[s.situ_id]) byId[s.situ_id]={id:s.situ_id,proje:s.proje,ilerleme_no:s.no,donem:s.donem,tarih:s.tarih,tutar:s.tutar,kalan:0}; });
  const kalan=id=>Number((byId[id]||{}).kalan||0)+(mevcut[id]||0);
  const ad=s=>`${s.proje||""} · ${sNo(s)} · ${F(s.tutar)} €`;
  const ls=ov.querySelector(".syk-ls"), yeni=ov.querySelector(".syk-yeni"), topEl=ov.querySelector(".syk-top");
  const ciz=()=>{
    ls.innerHTML=sec.length?sec.map((s,i)=>{ const x=byId[s.situ_id]||{};
      return `<tr><td>${E(ad(x))}<div style="color:#8a97a4;font-size:11px">Kalan kapasite: ${E(F(kalan(s.situ_id)))} € (situ tutarının 2 katına kadar)</div></td>`
        +`<td><input class="syk-oran" data-i="${i}" inputmode="decimal" value="${E((Math.round(s.oran*1000)/10).toLocaleString("tr-TR"))}"></td>`
        +`<td><button class="syk-sil" data-i="${i}" title="Kaldır">✕</button></td></tr>`; }).join("")
      :`<tr><td colspan="3" style="color:#8a97a4">Henüz situation seçilmedi.</td></tr>`;
    const t=sec.reduce((a,s)=>a+s.oran,0);
    topEl.textContent="Yapılmış situ oranı: "+P(t)+" · Yapılacak situ: "+F(Math.max(0,1-t)*yk)+" €";
    topEl.style.color=t>1.00001?"#b23a2e":"#16324f";
    ls.querySelectorAll(".syk-oran").forEach(inp=>inp.onchange=()=>{ const v=parseFloat(String(inp.value).replace(/\./g,"").replace(",","."));
      sec[+inp.dataset.i].oran=(isFinite(v)?v:0)/100; ciz(); });
    ls.querySelectorAll(".syk-sil").forEach(b=>b.onclick=()=>{ sec.splice(+b.dataset.i,1); ciz(); });
    const pk=K(r.proje);
    const ops=(S||[]).filter(s=>!sec.some(x=>x.situ_id===s.id)&&kalan(s.id)>0.01)
      .sort((a,b)=>((K(b.proje)===pk)-(K(a.proje)===pk))||String(b.tarih||"").localeCompare(String(a.tarih||"")));
    yeni.innerHTML=`<option value="">+ Situation seç…</option>`+ops.map(s=>`<option value="${s.id}">${E((K(s.proje)===pk?"★ ":"")+ad(s)+" · kalan "+F(kalan(s.id))+" €")}</option>`).join("");
  };
  yeni.onchange=()=>{ const id=Number(yeni.value); if(!id) return;
    const t=sec.reduce((a,s)=>a+s.oran,0);
    let o2=sec.length?Math.max(0,1-t):1;   /* ilk seçilen situation için varsayılan %100 */
    if(yk>0) o2=Math.min(o2, kalan(id)/yk);
    sec.push({situ_id:id,oran:Math.max(0,Math.round(o2*1000)/1000)}); ciz(); };
  ciz();
  ov.querySelector(".ok").onclick=async()=>{
    m.textContent="";
    const t=sec.reduce((a,s)=>a+s.oran,0);
    if(sec.some(s=>!(s.oran>0)||s.oran>1)){ m.textContent="Her oran %0'dan büyük ve en fazla %100 olmalı."; return; }
    if(t>1.00001){ m.textContent="Yapılmış situ oranı toplamı %100'ü aşamaz ("+P(t)+")."; return; }
    const dolu=sec.find(s=>s.oran*yk>kalan(s.situ_id)+0.01);
    if(dolu){ m.textContent="Seçilen situation dolu: ilişkilendirilen yükleme tutarı situ tutarının iki katını aşar ("+ad(byId[dolu.situ_id]||{})+")."; return; }
    const kim=(o.kim&&o.kim())||null;
    const {error:e2}=await sb.rpc("yukleme_situ_kaydet",{p_yukleme:Number(r.id),p_satirlar:sec,p_kim:kim});
    if(e2){ m.textContent="Kaydedilemedi: "+e2.message; return; }
    kapat(); try{ document.dispatchEvent(new CustomEvent("situ-yk-degisti")); }catch(_){}
    if(sonra) sonra();
  };
}
window.SITUYK={render:render};
})();
