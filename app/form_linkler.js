/* FORM-LINKLER (19.10.2026): her formun en ustunde, girisi yapan kisinin yetkili oldugu formlara link cubugu.
   Kaynak tablo form_erisim (kisiler'de kisi kodu olan veya herkes=true; MB oturumu tum formlari gorur), sira'ya gore.
   Kisi kodu: ARB_KISI_AL (form-giris localStorage kaydi); bulunamazsa ayni rol hesabina ait baska formun kaydi.
   Bulunulan form koyu (tiklanmaz). Linkler yeni sekmede acilir. Kaynak kod/form_linkler.js -> app/form_linkler.js */
(function(){
  if(window.__ARB_FLINK) return; window.__ARB_FLINK=1;
  var MB="int@arbor.com.tr", t0=Date.now();
  function yol(){ if(window.ARB_FORM_YOL) return window.ARB_FORM_YOL; var m=/\/app\/([^\/]+)\//.exec(location.pathname); return m?m[1]+"/":""; }
  function esc(t){ return String(t==null?"":t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function kisiKod(em){
    try{ if(window.ARB_KISI_AL){ var k=window.ARB_KISI_AL(em); if(k&&k.kod) return k.kod; } }catch(e){}
    try{ for(var i=0;i<localStorage.length;i++){ var key=localStorage.key(i); if(key.indexOf("arb_kisi_")!==0) continue;
      var v=JSON.parse(localStorage.getItem(key)||"null"); if(v&&v.kod&&v.rol===em) return v.kod; } }catch(e){}
    return null;
  }
  function stil(){
    if(document.getElementById("arb-flink-css")) return;
    var s=document.createElement("style"); s.id="arb-flink-css";
    s.textContent="#arb-flink{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;margin:0 0 10px;background:#f4f7fa;border-bottom:1px solid #dde4ec;font-family:'Segoe UI',system-ui,sans-serif}"
      +"#arb-flink a,#arb-flink span{display:inline-block;padding:5px 11px;border:1px solid #1f5f99;border-radius:8px;background:#fff;color:#1f5f99;font-size:13px;line-height:1.3;text-decoration:none;white-space:nowrap}"
      +"#arb-flink a:hover{background:#1f5f99;color:#fff}#arb-flink span.akt{background:#1f5f99;color:#fff;cursor:default}"
      +"@media print{#arb-flink{display:none}}";
    document.head.appendChild(s);
  }
  async function calis(){
    if(document.getElementById("mk-linkler")||document.getElementById("arb-flink")) return; /* MK formunun kendi cubugu var (MK-FORM-LINKLER) */
    var cli=(typeof ARB_ACTIVE!=="undefined")?ARB_ACTIVE:null;
    if(!cli||document.getElementById("arb-gate")){ if(Date.now()-t0<60000) setTimeout(calis,700); return; }
    var s=null; try{ s=await cli.auth.getSession(); }catch(e){}
    var em=((s&&s.data&&s.data.session&&s.data.session.user&&s.data.session.user.email)||"").toLowerCase();
    if(!em){ if(Date.now()-t0<60000) setTimeout(calis,700); return; }
    var kod=(em===MB)?"MB":kisiKod(em); if(!kod) return;
    var r=null; try{ r=await cli.from("form_erisim").select("yol,ad,sira,kisiler,herkes").order("sira"); }catch(e){ return; }
    if(!r||r.error||!r.data) return;
    var bu=yol();
    var L=r.data.filter(function(f){ return f.yol===bu || kod==="MB" || f.herkes || (f.kisiler||[]).indexOf(kod)>=0; });
    if(L.length<2) return;
    stil();
    var d=document.createElement("div"); d.id="arb-flink";
    d.innerHTML=L.map(function(f){ return f.yol===bu ? '<span class="akt">'+esc(f.ad)+'</span>'
      : '<a href="../'+esc(f.yol)+'" target="_blank" rel="noopener">'+esc(f.ad)+'</a>'; }).join("");
    document.body.insertBefore(d, document.body.firstChild);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){ setTimeout(calis,300); }); else setTimeout(calis,300);
})();
