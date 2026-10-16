/* GIRIS-UST-ORTAK (16.10.2026, Melih): Giriş panosu ile MK Faaliyet formunun ÜST bloğu — tek kaynak.
   kod/giris_ust.js → app/giris_ust.js (`python kod\_deploy_page.py kod\giris_ust.js app/giris_ust.js`).
   İçerik: Sıkı Takip + Muhtemel > 500.000 tek tablo (+ Not) · Satış/Etüt DK1 grafik kartları · Sel-Arb cari ay kutuları ·
   cari ay fatura/ödeme/tahsilat kutuları. Kullanım: GRUST.render(kapElemanı,{sb, ekleyen:()=>"MB"}).
   Sel-Arb rakamları loadSelArb'ın (app) "Cari Ay €" alt satırlarıyla aynı formül (SELARB-CANLI-ALT, SELODEME-CARI/2).
   Yurt İçi notu RPC arb_so_not (satis_yorum.durum); YD notu satis_yd_akis.son_takip_notlari (YD formu tkCommitEntry ile aynı). */
(function(){
if(window.GRUST) return;
const AY=["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const esc=s=>(s==null?"":String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>{ if(n==null||n==="") return ""; const v=Math.round(Number(n)); return isNaN(v)?"":v.toLocaleString("tr-TR"); };
const fdate=s=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||"")); return m?m[3]+"."+m[2]+"."+m[1].slice(2):""; };
const now=()=>new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Istanbul'}));
const p2=x=>String(x).padStart(2,"0");
const num=s=>{ if(s==null||s==="") return null; if(typeof s==="number") return s; const v=parseFloat(String(s).replace(/\./g,"").replace(",",".")); return isFinite(v)?v:null; };
const kK=v=>{ if(v==null) return ""; const a=Math.abs(v); if(a>=1e6) return (v/1e6).toLocaleString("tr-TR",{maximumFractionDigits:1})+" Mn"; if(a>=1e3) return Math.round(v/1e3).toLocaleString("tr-TR")+" B"; return Math.round(v).toLocaleString("tr-TR"); };
function tkLog(r){ const raw=r.son_takip_notlari; if(raw==null||raw==="") return [];
  try{ const v=JSON.parse(raw); if(Array.isArray(v)) return v.map(x=>({t:(x&&x.t)||"",e:(x&&x.e)||"",n:(x&&x.n)||"",g:(x&&x.g)||""})); }catch(e){}
  return [{t:r.son_takip_tarihi||"",e:"",n:String(raw),g:""}]; }
function tkSon(r){ return tkLog(r)[0]||{t:r.son_takip_tarihi||"",e:"",n:"",g:""}; }
let KUR=null;
async function kur(sb){ if(KUR) return KUR; let r={EUR:1}, ok=false;
  try{ const {data}=await sb.functions.invoke("arb-kur",{body:{}}); if(data&&data.ok&&data.rates){ Object.assign(r,data.rates); ok=true; } }catch(e){}
  if(!ok){ try{ const {data}=await sb.from("kur_son").select("para_birimi,oran"); (data||[]).forEach(k=>{ const v=Number(k.oran); if(v>0) r[k.para_birimi]=v; }); }catch(e){} }
  KUR=r; return r; }
function netEur(r,k){ if(r.net_tutar_eur!=null){ const d=Number(r.net_tutar_eur); if(isFinite(d)) return d; }
  const v=Number(r.net_tutar); if(!isFinite(v)) return null; const pb=r.para_birimi||'EUR'; if(pb==='EUR') return v; const x=k&&k[pb]; return x>0?v/x:null; }
function spark(pts,opt){
  opt=opt||{}; const W=244,H=78,L=40,R=6,T=8,B=16, birim=opt.birim||" €";
  const vs=pts.filter(p=>p.y!=null).map(p=>p.y);
  if(!vs.length) return '<div class="gru-muted">Veri yok</div>';
  let mn=Math.min(0,Math.min.apply(null,vs)), mx=Math.max.apply(null,vs); if(mx===mn) mx=mn+1;
  const n=pts.length, iw=W-L-R, X=i=>L+(n<=1?iw/2:i*iw/(n-1)), Y=v=>T+(H-T-B)*(1-(v-mn)/(mx-mn));
  const tt=p=>esc(p.x+": "+(p.y==null?"—":Math.round(p.y).toLocaleString("tr-TR")+birim));
  let g=`<line x1="${L}" y1="${T}" x2="${L}" y2="${H-B}" class="gru-ax"/><line x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}" class="gru-ax"/>`
    +`<text x="${L-3}" y="${T+7}" class="gru-yl">${esc(kK(mx))}</text><text x="${L-3}" y="${H-B}" class="gru-yl">${esc(kK(mn))}</text>`;
  let d=""; pts.forEach((p,i)=>{ if(p.y==null) return; d+=(d?"L":"M")+X(i).toFixed(1)+" "+Y(p.y).toFixed(1); });
  g+=`<path d="${d}" class="gru-ln"/>`;
  pts.forEach((p,i)=>{ if(p.y==null) return; g+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.cur?3.6:2.2}" class="${p.cur?'gru-dc':'gru-d'}"><title>${tt(p)}</title></circle>`; });
  g+=`<text x="${X(0)}" y="${H-3}" class="gru-xl" text-anchor="start">${esc(pts[0].x)}</text><text x="${X(n-1)}" y="${H-3}" class="gru-xl" text-anchor="end">${esc(pts[n-1].x)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="gru-svg">${g}</svg>`;
}
const CSS=`
.gru{font-size:12.5px;color:#16324f}
.gru h3.gru-h{margin:16px 0 6px;font-size:13.5px;font-weight:700;color:#16324f}
.gru-muted{color:#7b8794;font-weight:400}
.gru .gru-sc{overflow-x:auto;max-height:none}
.gru table.grt{border-collapse:collapse;font-size:11.5px;width:auto;min-width:0;display:table;background:#fff}
.gru table.grt th,.gru table.grt td{padding:2px 7px;border-bottom:1px solid #eef1f5;white-space:nowrap;line-height:16px;text-align:left;vertical-align:middle}
.gru table.grt thead th{background:#16324f;color:#fff;font-weight:600;font-size:11px;position:static;border-bottom:0}
.gru table.grt td.n,.gru table.grt th.n{text-align:right;font-variant-numeric:tabular-nums}
.gru table.grt td.w{max-width:46ch;overflow:hidden;text-overflow:ellipsis}
.gru table.grt tr.gru-ayr td{border-top:2px solid #6f8cab}
.gru-nb{font-size:11px;padding:0 7px;border:1px solid #2e6da4;border-radius:4px;background:#fff;color:#2e6da4;cursor:pointer;line-height:16px}.gru-nb:hover{background:#eef5ff}
.gru-cards{display:flex;flex-wrap:wrap;gap:10px}
.gru-card{border:1px solid #dfe5ec;border-radius:8px;background:#fff;padding:6px 8px 2px}
.gru-ct{font-size:11.5px;color:#4a5a6a}.gru-cv{font-size:15px;font-weight:700;margin:1px 0 2px;color:#16324f}
.gru-svg{display:block}.gru-ax{stroke:#cfd8e2;stroke-width:1}.gru-ln{fill:none;stroke:#2e6da4;stroke-width:1.6}
.gru-d{fill:#2e6da4}.gru-dc{fill:#e07b00}
.gru-yl{font-size:8.5px;fill:#7b8794;text-anchor:end}.gru-xl{font-size:8.5px;fill:#7b8794}
.gru-boxes{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 4px}
.gru-box{border:1px solid #c9d6e3;border-left:4px solid #2e6da4;border-radius:6px;background:#f6f9fc;padding:5px 12px;min-width:150px}
.gru-box3{flex:1 1 0;min-width:200px}
.gru-box.gru-gr{border-left-color:#0a6b57;background:#f3faf7}`;
function css(){ if(document.getElementById("gru-css")) return; const st=document.createElement("style"); st.id="gru-css"; st.textContent=CSS; document.head.appendChild(st); }

/* ---- Satış tablosu + grafikler ---- */
async function satis(o,elT,elG){
  const sb=o.sb;
  const [sy,yd,sk,ic,dk]=await Promise.all([
    o.grafik==="mk"?Promise.resolve({data:[]}):sb.from("satis_yorum").select("*").eq("kaynak","SO").eq("aktif",true), /* GIRIS-MK-YI: MK formunda Yurt İçi yok */
    sb.from("satis_yd_akis").select("*"),
    sb.from("yd_siki_takip").select("blok,proje,musteri"),
    sb.from("icmal_satir").select("donem,is_total,so_alinan_eur,so_muht_eur,fa_alinan_eur,fy2_alinan_eur,fa_muht_eur,fy2_muht_eur"),
    sb.from("etut_dk").select("erp_damga,tarih,created_at,dk1,dk2,dk3,dk4,yurt_ici")
  ]);
  const k=await kur(sb);
  const soR=(sy&&!sy.error&&sy.data)||[], ydR=(yd&&!yd.error&&yd.data)||[], skR=(sk&&!sk.error&&sk.data)||[];
  const kn=s=>String(s==null?"":s).replace(/\s+/g," ").trim().toLocaleLowerCase("tr").replace(/ı/g,"i").normalize("NFD").replace(/[̀-ͯ]/g,"");
  const skSet=new Set(skR.map(x=>x.blok+"|"+kn(x.proje)+"|"+kn(x.musteri)));
  const bolge=b=>b==='YD1'?'Yurt Dışı 1':(b==='YD2'?'Yurt Dışı 2':b);
  const tutar=r=>r.net_tutar==null||r.net_tutar===""?"":money(r.net_tutar)+" "+(r.para_birimi||"EUR");
  const siki=ydR.filter(r=>(r.durum==="Teklif Teslim Edildi"||r.durum==="Takip Bekleniyor")&&skSet.has(r.blok+"|"+kn(r.proje)+"|"+kn(r.musteri)))
    .sort((a,b)=>String(a.teklif_teslim_tarihi||'9999').localeCompare(String(b.teklif_teslim_tarihi||'9999')));
  const TH=`<thead><tr><th>Bölge</th><th>Proje</th><th>Müşteri</th><th>Teklif Teslim</th><th class="n">Net Tutar</th><th>Takip Tarihi</th><th>Görevli</th><th>Takip Notu</th><th></th></tr></thead>`;
  const ydS=(r,c)=>{ const l=tkSon(r); return `<tr${c?' class="'+c+'"':''}><td>${esc(bolge(r.blok))}</td><td class="w" title="${esc(r.proje)}">${esc(r.proje)}</td><td class="w" title="${esc(r.musteri)}">${esc(r.musteri)}</td><td>${fdate(r.teklif_teslim_tarihi)}</td><td class="n">${esc(tutar(r))}</td><td>${l.t?fdate(l.t):""}</td><td>${esc(l.g||"")}</td><td class="w" title="${esc(l.n||"")}">${esc(l.n||"")}</td><td><button class="gru-nb" data-k="yd" data-id="${r.id}" title="Takip notu ekle (${esc(r.blok)} formuna yazılır)">+ Not</button></td></tr>`; };
  const soS=(r,c)=>`<tr${c?' class="'+c+'"':''}><td>Yurt İçi</td><td class="w" title="${esc(r.proje)}">${esc(r.proje)}</td><td class="w" title="${esc(r.musteri)}">${esc(r.musteri)}</td><td></td><td class="n">${esc(money(r.net_eur)+" EUR")}</td><td></td><td></td><td class="w" title="${esc(r.durum||"")}">${esc(r.durum||"")}</td><td><button class="gru-nb" data-k="so" data-id="${r.id}" title="Durum notu (Yurt İçi Satış formuna yazılır)">+ Not</button></td></tr>`;
  const SINIR=500000;
  const muh=ydR.filter(r=>r.durum==='Muhtemel'&&Number(r.net_tutar)>SINIR).map(r=>({e:netEur(r,k),r,t:"yd"}))
    .concat(soR.filter(r=>/^muht/i.test(r.statu||"")&&Number(r.net_eur)>SINIR).map(r=>({e:Number(r.net_eur),r,t:"so"})))
    .sort((a,b)=>(Number(b.e)||0)-(Number(a.e)||0));
  if(o.bolum==="ctp") siki.length=0; /* CTP-FAALIYET: yalnız Muhtemel > 500.000 */
  const body=siki.map(r=>ydS(r)).join("")+muh.map((x,i)=>{ const c=(i===0&&siki.length)?"gru-ayr":""; return x.t==="yd"?ydS(x.r,c):soS(x.r,c); }).join("");
  const by={yd:{},so:{}}; ydR.forEach(r=>by.yd[r.id]=r); soR.forEach(r=>by.so[r.id]=r);
  elT.innerHTML=(o.bolum==="ctp"?`<h3 class="gru-h">Muhtemel &gt; 500.000 <span class="gru-muted">(${muh.length})</span></h3>`:`<h3 class="gru-h">Sıkı Takip Edilecekler <span class="gru-muted">(${siki.length})</span> ve Muhtemel &gt; 500.000 <span class="gru-muted">(${muh.length})</span></h3>`)
    +(body?`<div class="gru-sc"><table class="grt">${TH}<tbody>${body}</tbody></table></div>`:'<div class="gru-muted">Kayıt yok</div>');
  elT.querySelectorAll(".gru-nb").forEach(b=>b.onclick=()=>notAc(o,b.dataset.k,by[b.dataset.k][Number(b.dataset.id)],()=>satis(o,elT,elG)));
  /* grafikler: İcmal son 12 ay + Satış cari durum; Etüt DK1 */
  const today=now(); today.setHours(0,0,0,0);
  const sum=(a,f)=>a.reduce((s,r)=>s+(Number(f(r))||0),0);
  const cur={so_m:sum(soR.filter(r=>/^muht/i.test(r.statu||"")),r=>r.net_eur), so_a:sum(soR.filter(r=>/^al/i.test(r.statu||"")),r=>r.net_eur),
    yd_m:sum(ydR.filter(r=>(r.blok==='YD1'||r.blok==='YD2')&&r.durum==='Muhtemel'),r=>netEur(r,k)), yd_a:sum(ydR.filter(r=>(r.blok==='YD1'||r.blok==='YD2')&&r.durum==='Kazandık'),r=>netEur(r,k))};
  const icBy={}; ((ic&&!ic.error&&ic.data)||[]).forEach(r=>{ if(!r.is_total&&/^\d{2}\.\d{2}$/.test(String(r.donem||""))) icBy[r.donem]=r; });
  const lbl=d=>p2(d.getMonth()+1)+"."+String(d.getFullYear()).slice(2);
  const ser=[];
  for(let i=12;i>=1;i--){ const d=new Date(today.getFullYear(),today.getMonth()-i,1), r=icBy[lbl(d)];
    if(!r){ ser.push({x:lbl(d)}); continue; }
    const fa_a=num(r.fa_alinan_eur), f2a=num(r.fy2_alinan_eur), fa_m=num(r.fa_muht_eur), f2m=num(r.fy2_muht_eur);
    ser.push({x:lbl(d),so_m:num(r.so_muht_eur),so_a:num(r.so_alinan_eur),yd_a:(fa_a==null&&f2a==null)?null:(fa_a||0)+(f2a||0),yd_m:(fa_m==null&&f2m==null)?null:(fa_m||0)+(f2m||0)}); }
  ser.push({x:lbl(today)+" (cari)",cur:true,so_m:cur.so_m,so_a:cur.so_a,yd_a:cur.yd_a,yd_m:cur.yd_m});
  ser.forEach(s=>{ s.top_a=(s.so_a==null&&s.yd_a==null)?null:(s.so_a||0)+(s.yd_a||0); s.top_m=(s.so_m==null&&s.yd_m==null)?null:(s.so_m||0)+(s.yd_m||0); });
  /* DK1: dk = dk1+2dk2+3dk3+5dk4; ayın son ERP çekimi + elle girilen; yurt içi hariç */
  let dkS=null;
  if(dk&&!dk.error){ const n=v=>Number(v)||0, R=(dk.data||[]).filter(r=>!r.yurt_ici), ayOf=d=>"20"+d.slice(0,2)+"-"+d.slice(2,4);
    const son={}; R.forEach(r=>{ if(!r.erp_damga) return; const a=ayOf(r.erp_damga); if(!son[a]||r.erp_damga>son[a]) son[a]=r.erp_damga; });
    const ayT={}; R.forEach(r=>{ let a; if(r.erp_damga){ a=ayOf(r.erp_damga); if(r.erp_damga!==son[a]) return; } else { const d=String(r.tarih||r.created_at||""); if(!/^\d{4}-\d{2}/.test(d)) return; a=d.slice(0,7); }
      ayT[a]=(ayT[a]||0)+n(r.dk1)+2*n(r.dk2)+3*n(r.dk3)+5*n(r.dk4); });
    const key=d=>d.getFullYear()+"-"+p2(d.getMonth()+1), ks=Object.keys(ayT).sort(), ilk=ks.length?ks[0]:key(today);
    dkS=[]; for(let i=12;i>=0;i--){ const d=new Date(today.getFullYear(),today.getMonth()-i,1), kk=key(d); dkS.push({x:lbl(d)+(i===0?" (cari)":""),y:kk<ilk?null:(ayT[kk]||0),cur:i===0}); } }
  const kart=(ad,pts,v,b)=>`<div class="gru-card"><div class="gru-ct">${esc(ad)}</div><div class="gru-cv">${money(v)}${b}</div>${spark(pts,{birim:b})}</div>`;
  const kS=f=>ser.map(s=>({x:s.x,y:s[f]==null?null:s[f],cur:s.cur}));
  const c=f=>ser[ser.length-1][f];
  const dkK=dkS?kart("Etüt DK1 (dk)",dkS,dkS[dkS.length-1].y," dk"):"";
  if(o.grafik==="mk"){ /* GIRIS-MK-GRAFIK: MK formunda yalnız YD alınan · YD muht. · Etüt DK1, tek satır */
    elG.innerHTML=`<h3 class="gru-h">Satış ve Etüt DK1 — son 12 ay ve cari durum</h3><div class="gru-cards">${kart("Yurt Dışı alınan Prj (€)",kS("yd_a"),c("yd_a")," €")}${kart("Yurt Dışı muht. Prj (€)",kS("yd_m"),c("yd_m")," €")}${dkK}</div>`;
    return; }
  elG.innerHTML=`<h3 class="gru-h">Satış ve Etüt DK1 — son 12 ay ve cari durum</h3>`
    +`<div class="gru-cards">${kart("Yurt İçi muht. Prj (€)",kS("so_m"),c("so_m")," €")}${kart("Yurt Dışı alınan Prj (€)",kS("yd_a"),c("yd_a")," €")}${kart("Yurt Dışı muht. Prj (€)",kS("yd_m"),c("yd_m")," €")}</div>`
    +`<div class="gru-cards" style="margin-top:10px">${kart("Top.alınan Prj (€)",kS("top_a"),c("top_a")," €")}${kart("Top.muht. Prj (€)",kS("top_m"),c("top_m")," €")}${dkS?kart("Etüt DK1 (dk)",dkS,dkS[dkS.length-1].y," dk"):""}</div>`;
}
/* ---- Takip notu penceresi ---- */
async function notAc(o,k,r,yenile){
  if(!r) return; const sb=o.sb, ek=(o.ekleyen&&o.ekleyen())||"MB";
  let gor=[];
  if(k==="yd"){ let ky=null; try{ const fe=await sb.from("form_erisim").select("kisiler").eq("yol",r.blok==="YD1"?"satis-yd1/":"satis-yd2/").maybeSingle(); if(fe&&fe.data&&Array.isArray(fe.data.kisiler)&&fe.data.kisiler.length) ky=fe.data.kisiler; }catch(e){}
    gor=(ky||(r.blok==="YD1"?["MN","OBL","MK","KS"]:["MKB","OBL","MK","AK"])).slice(); if(gor.indexOf("MB")<0) gor.unshift("MB"); gor=gor.concat(["Hiç Kimse","Herkes"]); }
  const ov=document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;background:rgba(10,25,45,.4);display:flex;align-items:center;justify-content:center;z-index:99990";
  const bs="padding:6px 14px;border-radius:6px;border:1px solid #2e6da4;cursor:pointer;font:inherit;";
  ov.innerHTML=`<div style="background:#fff;border-radius:10px;padding:16px 18px;width:min(460px,92vw);box-shadow:0 8px 30px rgba(0,0,0,.25);font-size:13px;color:#16324f">
    <div style="font-weight:700;margin-bottom:2px">${esc(r.proje||"")}</div>
    <div style="color:#6b7a8a;margin-bottom:10px">${esc(r.musteri||"")} · ${k==="yd"?esc(r.blok==="YD1"?"Yurt Dışı 1":"Yurt Dışı 2")+" formu, takip notu":"Yurt İçi Satış formu, Durum"}</div>
    <textarea class="gru-nt" rows="3" style="width:100%;box-sizing:border-box;font:inherit;padding:6px;border:1px solid #c9d3de;border-radius:6px" placeholder="Not"></textarea>
    ${k==="yd"?`<div style="margin-top:8px">Görevli: <select class="gru-ng" style="font:inherit;padding:2px 4px"><option value=""></option>${gor.map(g=>`<option>${esc(g)}</option>`).join("")}</select></div>`:""}
    <div class="gru-nm" style="color:#b23a2e;min-height:16px;margin-top:6px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="gru-nx" style="${bs}background:#fff;color:#2e6da4">Vazgeç</button><button class="gru-ns" style="${bs}background:#2e6da4;color:#fff">Kaydet</button></div></div>`;
  document.body.appendChild(ov);
  const kapat=()=>ov.remove(), msg=t=>{ ov.querySelector(".gru-nm").textContent=t; };
  ov.querySelector(".gru-nx").onclick=kapat; ov.onclick=e=>{ if(e.target===ov) kapat(); };
  ov.querySelector(".gru-nt").focus();
  ov.querySelector(".gru-ns").onclick=async()=>{
    const txt=ov.querySelector(".gru-nt").value.trim(); if(!txt){ msg("Not yazınız."); return; }
    const t=now(), iso=t.getFullYear()+"-"+p2(t.getMonth()+1)+"-"+p2(t.getDate()), yaz=txt.indexOf(ek+":")===0?txt:ek+": "+txt;
    const btn=ov.querySelector(".gru-ns"); btn.disabled=true;
    if(k==="yd"){
      const g=ov.querySelector(".gru-ng").value; if(!g){ msg("Görevli seçiniz."); btn.disabled=false; return; }
      const q=await sb.from("satis_yd_akis").select("son_takip_notlari,son_takip_tarihi,durum").eq("id",r.id).single();
      if(q.error){ msg(q.error.message); btn.disabled=false; return; }
      const log=tkLog(q.data); log.unshift({t:iso,e:ek,g:g,n:yaz});
      const u=await sb.from("satis_yd_akis").update({son_takip_notlari:JSON.stringify(log),son_takip_tarihi:iso}).eq("id",r.id);
      if(u.error){ msg(u.error.message); btn.disabled=false; return; }
      if(q.data.durum==="Takip Bekleniyor"){
        const kutu=ov.firstElementChild, b2="display:block;width:100%;text-align:left;padding:9px 10px;margin-bottom:8px;border:1px solid #cdd6df;border-radius:8px;cursor:pointer;font:inherit;";
        kutu.innerHTML='<div style="font-weight:700;margin-bottom:12px">Not kaydedildi. Satır "Takip Bekleniyor" durumunda. Ne yapılsın?</div>'
          +'<button data-s="1" style="'+b2+'background:#eaf5ee">1. Takipten çıkar (15 gün sonra kendiliğinden tekrar takibe girer)</button>'
          +'<button data-s="2" style="'+b2+'background:#f5f7f9">2. Takip Bekleniyor durumunda kalsın</button>';
        await new Promise(res=>kutu.querySelectorAll("button").forEach(b=>b.onclick=async()=>{ if(b.dataset.s==="1") await sb.from("satis_yd_akis").update({durum:"Teklif Teslim Edildi"}).eq("id",r.id); res(); }));
      }
    } else {
      const u=await sb.rpc("arb_so_not",{p_id:r.id,p_not:p2(t.getDate())+"."+p2(t.getMonth()+1)+"."+String(t.getFullYear()).slice(2)+" "+yaz});
      if(u.error){ msg(u.error.message); btn.disabled=false; return; }
    }
    kapat(); const y=window.scrollY; await yenile(); window.scrollTo(0,y);
  };
}
/* ---- Sel-Arb cari ay (loadSelArb alt satırlarıyla aynı formül) ---- */
async function selArb(o,el){
  const sb=o.sb;
  const [s,oz,g,od,ih,ak]=await Promise.all([
    sb.from("sel_arb_snapshot").select("sira,firma,proje"),
    sb.from("sel_arb_ozet").select("*").order("tarih"),
    sb.from("sel_arb_guncel").select("sira,firma,proje,alacak").order("sira"),
    sb.from("sel_odeme").select("tutar_eur").is("islendi_tarih",null),
    sb.from("ihracat_fatura").select("tutar_eur").is("islendi_tarih",null),
    sb.from("arbor_kesilen_fatura").select("tutar_eur").is("islendi_tarih",null)
  ]);
  if(s.error||oz.error||g.error){ el.innerHTML=""; return; }
  const fk=new Map(); (s.data||[]).forEach(x=>{ const key=x.sira+"|"+(x.firma||"")+"|"+(x.proje||""); if(!fk.has(key)) fk.set(key,x.sira); });
  const siralar=[...fk.values()]; (g.data||[]).forEach(x=>{ if(siralar.indexOf(x.sira)<0) siralar.push(x.sira); });
  const canliBy={}; (g.data||[]).forEach(x=>{ canliBy[x.sira]=x.alacak; });
  let alacak=null; siralar.forEach(sr=>{ const v=canliBy[sr]; if(v!=null){ alacak=(alacak||0)+Number(v); } });
  const T=q=>(q&&!q.error)?(q.data||[]).reduce((a,r)=>a+(Number(r.tutar_eur)||0),0):0;
  const nz=v=>(v==null||v==="")?null:Number(v), son=(oz.data||[]).length?oz.data[oz.data.length-1]:null;
  const odT=T(od), ihT=T(ih), akT=T(ak);
  const gon=son?(nz(son.gonderilen)==null?(odT||null):nz(son.gonderilen)+odT):(odT||null);
  const b0=son?nz(son.borc):null, f0=son?nz(son.fatura_edilen):null;
  const borc=b0==null?(ihT||null):b0+ihT, fat=f0==null?(akT||null):f0+akT;
  const kayip=borc==null?null:borc-((gon||0)+(alacak||0)+(fat||0));
  const fatD=(fat==null||Math.round(fat)===0)?null:fat;
  const K=[["Güncel Alacak Toplam",alacak],["Selectron'a Gönderilen Toplam",gon],["Selectron'a Borç",borc],["Selectron'a Ft Edilen Toplam",fatD],["Arbor SAS Faaliyet Kaybı Toplam",kayip]];
  el.innerHTML=`<div class="gru-boxes">${K.map(([a,v])=>`<div class="gru-box"><div class="gru-ct">${esc(a)}</div><div class="gru-cv">${v==null?"—":money(v)+" €"}</div></div>`).join("")}</div>`;
}
/* ---- Cari ay: OE faturaları · ÖB ödemeleri · ÖB tahsilat (üç kutu yan yana) ---- */
async function cari(o,el){
  const sb=o.sb, t=now(), bas=t.getFullYear()+"-"+p2(t.getMonth()+1)+"-01", nx=new Date(t.getFullYear(),t.getMonth()+1,1), sn=nx.getFullYear()+"-"+p2(nx.getMonth()+1)+"-01";
  const [ft,od,th]=await Promise.all([
    sb.from("ihracat_fatura").select("tutar,para_birimi,tutar_eur").gte("tarih",bas).lt("tarih",sn),
    sb.from("sel_odeme").select("tutar,para_birimi,tutar_eur").gte("odeme_tarihi",bas).lt("odeme_tarihi",sn),
    sb.from("ob_tahsilat").select("tutar").gte("tarih",bas).lt("tarih",sn)
  ]);
  const eur=q=>(q&&!q.error)?(q.data||[]).reduce((a,r)=>a+(r.tutar_eur!=null?Number(r.tutar_eur):((r.para_birimi||"EUR")==="EUR"?Number(r.tutar)||0:0)),0):null;
  const f=v=>v==null?"—":Number(v).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
  const thT=(th&&!th.error)?(th.data||[]).reduce((a,r)=>a+(Number(r.tutar)||0),0):null;
  const ay=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"][t.getMonth()]+" "+t.getFullYear();
  const K=[["Selectron'un Yurt Dışı Birimlerine Kestiği Faturalar",eur(ft),"OE Faaliyet"],["Yurt Dışı Birimlerden Selectron'a Yapılan Ödemeler",eur(od),"ÖB Faaliyet"],["Yurt Dışı Birimlerin müşterilerden yaptığı Tahsilat",thT,"ÖB Faaliyet"]];
  el.innerHTML=`<div class="gru-boxes">${K.map(([a,v,kay])=>`<div class="gru-box gru-box3 gru-gr" title="${esc(ay)} · ${kay}"><div class="gru-ct">${esc(a)}</div><div class="gru-cv">${f(v)}</div></div>`).join("")}</div>`;
}
/* ---- Eğitim: bu ay / bu yıl (Eğitim panosu EGITIM-OZET ile aynı sayım) ---- */
async function egitim(o,el){
  const [{data:dok},{data:plan}]=await Promise.all([o.sb.from("egitim_dokuman_current").select("*"),o.sb.from("egitim_plan_current").select("*")]);
  const AYL=["ocak","subat","mart","nisan","mayis","haziran","temmuz","agustos","eylul","ekim","kasim","aralik"];
  const t=now(), YIL=String(t.getFullYear()), AYK=YIL+"-"+p2(t.getMonth()+1);
  const gE=[]; (plan||[]).forEach(r=>AYL.forEach(a=>{ const v=r[a+"_gerceklesen"]; if(v&&String(v).slice(0,4)===YIL) gE.push(String(v)); }));
  const yE=[]; (dok||[]).forEach(r=>{ if(r.yayim_tarihi&&String(r.yayim_tarihi).slice(0,4)===YIL) yE.push(String(r.yayim_tarihi)); if(r.revizyon_tarihi&&String(r.revizyon_tarihi).slice(0,4)===YIL) yE.push(String(r.revizyon_tarihi)); });
  const ay=a=>a.filter(x=>x.slice(0,7)===AYK).length;
  el.innerHTML=`<div style="padding:12px 2px 4px">Gerçekleşen eğitim: bu ay <b>${ay(gE)}</b> · bu yıl <b>${gE.length}</b> \u05C0 Yayınlanan doküman: bu ay <b>${ay(yE)}</b> · bu yıl <b>${yE.length}</b></div>`;
}
async function render(kap,o){
  if(!kap||!o||!o.sb) return; css(); KUR=null;
  kap.classList.add("gru");
  kap.innerHTML='<div class="gru-t"></div><div class="gru-g"></div><div class="gru-s"></div><div class="gru-c"></div><div class="gru-e"></div>';
  const q=c=>kap.querySelector(c), kor=p=>Promise.resolve().then(p).catch(e=>{ try{ console.warn("GRUST:",e); }catch(_){} });
  if(o.bolum==="ctp"){ await Promise.all([kor(()=>satis(o,q(".gru-t"),q(".gru-g"))),kor(()=>egitim(o,q(".gru-e")))]); return; } /* CTP-FAALIYET */
  await Promise.all([kor(()=>satis(o,q(".gru-t"),q(".gru-g"))),kor(()=>selArb(o,q(".gru-s"))),kor(()=>cari(o,q(".gru-c")))]);
}
window.GRUST={render:render};
})();
