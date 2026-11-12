/* TABLO-SIRALA (12.11.2026, Melih): tum form ve panolarda tablo sutun basligina tiklayinca siralama.
   Kaynak kod/tablo_sirala.js -> app/tablo_sirala.js. Formlara form_linkler.js, panoya app/index.html yukler.
   Tiklama: artan -> azalan -> ilk sira. Kendi siralamasi/tiklamasi olan basliklar (data-sk, onclick, zaten el imleci)
   ve icinde dugme/girdi olan basliklar atlanir. Grup/ara/toplam satirlari yerinde kalir; yalniz aradaki veri satirlari siralanir.
   Tablo veya baslikta data-nosort varsa calismaz. Tablo yeniden cizilince siralama sifirlanir. */
(function(){
  if(window.__ARB_SIRALA) return; window.__ARB_SIRALA=1;
  var st=document.createElement("style");
  st.textContent="th.arb-srt{cursor:pointer}th.arb-srt:hover{filter:brightness(1.12)}th .arb-ok{font-size:.8em;margin-left:3px;opacity:.85}";
  (document.head||document.documentElement).appendChild(st);
  var ATLA="input,select,textarea,button,a,label,[contenteditable]";
  function uygun(th){
    if(th.dataset.arbSrt) return th.dataset.arbSrt==="1";
    var ok=true, t=th.closest("table");
    if(!t||t.closest("[data-nosort]")||th.hasAttribute("data-nosort")) ok=false;
    else if(th.hasAttribute("data-sk")||th.onclick||th.querySelector(ATLA)) ok=false;
    else if(getComputedStyle(th).cursor==="pointer") ok=false;
    else if((th.colSpan||1)>1) ok=false;
    else { var tr=th.parentElement; if(!tr||[].some.call(tr.cells,function(c){ return c.tagName!=="TH"; })) ok=false; }
    th.dataset.arbSrt=ok?"1":"0"; if(ok){ th.classList.add("arb-srt"); if(!th.title) th.title="Sıralamak için tıklayın"; }
    return ok;
  }
  /* hucrelerin gorsel sutun indeksleri (colspan/rowspan) */
  function izgara(rows){
    var g=[], m=new Map();
    rows.forEach(function(tr,ri){ g[ri]=g[ri]||[]; var c=0;
      [].forEach.call(tr.cells,function(td){ while(g[ri][c]) c++; var cs=td.colSpan||1, rs=td.rowSpan||1;
        m.set(td,c); for(var r=0;r<rs;r++){ g[ri+r]=g[ri+r]||[]; for(var k=0;k<cs;k++) g[ri+r][c+k]=td; } c+=cs; }); });
    return {g:g,m:m};
  }
  function deger(td){
    if(!td) return {b:true};
    var el=td.querySelector("input:not([type=checkbox]):not([type=hidden]),select,textarea"), s;
    if(el) s=el.tagName==="SELECT"?(el.options[el.selectedIndex]?el.options[el.selectedIndex].text:""):el.value;
    else s=td.textContent;
    s=String(s||"").replace(/\s+/g," ").trim();
    if(!s||s==="—"||s==="-") return {b:true};
    var d=/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2}|\d{4})\b/.exec(s);
    if(d){ var y=+d[3]; if(y<100) y+=2000; return {n:y*10000+(+d[2])*100+(+d[1])}; }
    var iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(s); if(iso) return {n:+iso[1]*10000+(+iso[2])*100+(+iso[3])};
    var t=s.replace(/[€£$%]|TL|EUR|GBP|USD/gi,"").replace(/[−–]/g,"-").replace(/\s/g,"");
    if(/^[+-]?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t)||/^[+-]?\d+(,\d+)?$/.test(t)) return {n:parseFloat(t.replace(/\./g,"").replace(",","."))};
    if(/^[+-]?\d+(\.\d+)?$/.test(t)) return {n:parseFloat(t)};
    return {s:s.toLocaleLowerCase("tr")};
  }
  function karsilastir(a,b){
    if(a.b||b.b) return a.b&&b.b?0:(a.b?1:-1);   /* bos hep sonda */
    if(a.n!=null&&b.n!=null) return a.n-b.n;
    if(a.n!=null) return -1; if(b.n!=null) return 1;
    return a.s.localeCompare(b.s,"tr",{numeric:true});
  }
  document.addEventListener("click",function(e){
    var th=e.target.closest&&e.target.closest("th"); if(!th||e.target.closest(ATLA)) return;
    if(!uygun(th)) return;
    var t=th.closest("table"), hr=th.parentElement;
    var hRows=hr.parentElement.tagName==="THEAD"?[].slice.call(hr.parentElement.rows):[hr];
    var hz=izgara(hRows), col=hz.m.get(th); if(col==null) return;
    var all=[].slice.call(t.rows), bas=hr.parentElement.tagName==="THEAD"?0:all.indexOf(hr)+1;
    var veri=all.filter(function(r,i){ return i>=bas && r.parentElement.tagName!=="THEAD" && r.parentElement.tagName!=="TFOOT" && r.parentElement.closest("table")===t; });
    if(veri.length<2) return;
    /* veri satiri = en sik hucre sayisina sahip, th icermeyen, gizli olmayan satir */
    var say={}; veri.forEach(function(r){ var n=0; [].forEach.call(r.cells,function(c){ n+=c.colSpan||1; }); r.__n=n; say[n]=(say[n]||0)+1; });
    var tip=+Object.keys(say).sort(function(a,b){ return say[b]-say[a]; })[0];
    var veriMi=function(r){ return r.__n===tip && ![].some.call(r.cells,function(c){ return c.tagName==="TH"; }) && !/(foot|toplam|total|sum|grp|grup|group|sa-new)/i.test(r.className) && !r.hasAttribute("data-new"); };
    var yon=th.dataset.arbYon==="a"?"d":(th.dataset.arbYon==="d"?"":"a");
    hRows.forEach(function(r){ [].forEach.call(r.cells,function(c){ if(c!==th){ delete c.dataset.arbYon; var o=c.querySelector(".arb-ok"); if(o) o.remove(); } }); });
    th.dataset.arbYon=yon; var ok=th.querySelector(".arb-ok"); if(!ok){ ok=document.createElement("span"); ok.className="arb-ok"; th.appendChild(ok); } ok.textContent=yon==="a"?"▲":(yon==="d"?"▼":"");
    veri.forEach(function(r,i){ if(r.dataset.arbIlk==null) r.dataset.arbIlk=i; });
    /* ardisik veri satiri bloklari ayni ust eleman icinde ayri ayri siralanir */
    var bloklar=[], cur=null;
    veri.forEach(function(r){ if(veriMi(r)){ if(!cur||cur.p!==r.parentElement||cur.son!==r.previousElementSibling){ cur={p:r.parentElement,rows:[]}; bloklar.push(cur); } cur.rows.push(r); cur.son=r; } else cur=null; });
    bloklar.forEach(function(b){
      if(b.rows.length<2) return;
      var once=b.rows[0].previousElementSibling, sonra=b.rows[b.rows.length-1].nextElementSibling;
      var x=b.rows.map(function(r){ var iz=izgara([r]); var td=null; [].forEach.call(r.cells,function(c){ var k=iz.m.get(c); if(k<=col&&col<k+(c.colSpan||1)) td=c; }); return {r:r,v:deger(td),i:+r.dataset.arbIlk}; });
      x.sort(function(p,q){ if(!yon) return p.i-q.i; var c=karsilastir(p.v,q.v); if(yon==="d"&&!(p.v.b||q.v.b)) c=-c; return c||(p.i-q.i); });
      var fr=document.createDocumentFragment(); x.forEach(function(o){ fr.appendChild(o.r); });
      if(sonra) b.p.insertBefore(fr,sonra); else if(once) once.after(fr); else b.p.appendChild(fr);
    });
  },false);
  document.addEventListener("mouseover",function(e){ var th=e.target.closest&&e.target.closest("th"); if(th&&!th.dataset.arbSrt) uygun(th); },true);
})();
