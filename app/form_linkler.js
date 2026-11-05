/* FORM-LINKLER (19.10.2026): her formun en ustunde, girisi yapan kisinin yetkili oldugu formlara link cubugu.
   Kaynak tablo form_erisim (kisiler'de kisi kodu olan veya herkes=true; MB oturumu tum formlari gorur), sira'ya gore.
   Kisi kodu: ARB_KISI_AL (form-giris localStorage kaydi); bulunamazsa ayni rol hesabina ait baska formun kaydi.
   Bulunulan form koyu (tiklanmaz). Linkler yeni sekmede acilir. Kaynak kod/form_linkler.js -> app/form_linkler.js */
(function(){
  if(window.__ARB_FLINK) return; window.__ARB_FLINK=1;
  var MB="int@arbor.com.tr", t0=Date.now();
  /* FLINK-GIZLI (27.10.2026, Melih): Cam Fiyatlandirma, Cam Konfigurasyon ve Cam Listesi cubukta yok; Urun Konfigurasyonu basligindaki dugmelerden acilir (URUN-KONFIG-CAMLINK). Bulunulan form ise yine koyu gosterilir. */
  var GIZLI={"cam/":1,"cam-konfig/":1,"cam-listesi/":1};
  function yol(){ if(window.ARB_FORM_YOL) return window.ARB_FORM_YOL; var m=/\/app\/([^\/]+)\//.exec(location.pathname); return m?m[1]+"/":""; }
  function esc(t){ return String(t==null?"":t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  /* FLINK-KISI-YEDEK (19.10.2026): bu formda kisi kaydi yoksa (eski oturum) kod sirayla: ayni rolun kaydi -> form_erisim rol_map/varsayilan_rol'de
     bu role tek kisi -> cihazdaki tum arb_kisi_* kayitlari tek kisiyse o; hicbiri yoksa yalniz herkes=true formlar gosterilir */
  function kisiKod(em,rows){
    try{ if(window.ARB_KISI_AL){ var k=window.ARB_KISI_AL(em); if(k&&k.kod) return k.kod; } }catch(e){}
    var tum={};
    try{ for(var i=0;i<localStorage.length;i++){ var key=localStorage.key(i); if(key.indexOf("arb_kisi_")!==0) continue;
      var v=JSON.parse(localStorage.getItem(key)||"null"); if(v&&v.kod){ if(v.rol===em) return v.kod; tum[v.kod]=1; } } }catch(e){}
    var ad={}; (rows||[]).forEach(function(f){ var m=f.rol_map||{}; for(var c in m) if(String(m[c]).toLowerCase()===em) ad[c]=1;
      if(String(f.varsayilan_rol||"").toLowerCase()===em&&(f.kisiler||[]).length===1) ad[f.kisiler[0]]=1; });
    var a=Object.keys(ad); if(a.length===1) return a[0];
    var t=Object.keys(tum); if(t.length===1) return t[0];
    return null;
  }
  /* FORM-MENU (05.11.2026, Melih): link cubugu yerine lacivert bandin (header) en solunda "Menu" dugmesi; yetkili formlar altinda acilir liste.
     Bulunulan form koyu (tiklanmaz), digerleri yeni sekmede acilir. MK'nin kendi cubugu (#mk-linkler) gizlenir, listesi bu menudedir. */
  function stil(){
    if(document.getElementById("arb-flink-css")) return;
    var s=document.createElement("style"); s.id="arb-flink-css";
    s.textContent="header.arb-mh{position:relative;padding-left:104px!important}"
      +"#arb-menu{position:absolute;left:14px;top:10px;z-index:1000;font-family:'Segoe UI',system-ui,sans-serif}"
      +"#arb-menu.serbest{position:relative;left:auto;top:auto;display:inline-block;margin:8px 12px}"
      +"#arb-menu>.mb{background:#fff;color:#16324f;border:0;border-radius:7px;padding:6px 12px;font:700 13px 'Segoe UI',system-ui,sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.15)}"
      +"#arb-menu>.mb:hover,#arb-menu.acik>.mb{background:#e8f0f8}"
      +"#arb-menu .ml{display:none;position:absolute;left:0;top:calc(100% + 5px);background:#fff;border:1px solid #cdd8e4;border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.22);padding:5px;min-width:230px;max-height:75vh;overflow:auto}"
      +"#arb-menu.acik .ml{display:block}"
      +"#arb-menu .ml a,#arb-menu .ml span{display:block;padding:6px 10px;border-radius:6px;color:#1f5f99;font-size:13px;font-weight:400;line-height:1.35;text-decoration:none;white-space:nowrap}"
      +"#arb-menu .ml a:hover{background:#e8f0f8}#arb-menu .ml span.akt{background:#16324f;color:#fff;cursor:default}"
      +"@media print{#arb-menu{display:none}header.arb-mh{padding-left:16px!important}}";
    document.head.appendChild(s);
  }
  function menuKur(L,bu){
    if(document.getElementById("arb-menu")) return;
    stil();
    var mk=document.getElementById("mk-linkler"); if(mk) mk.style.display="none";
    if(!L.length){ var h1=document.querySelector("header h1"); L=[{yol:bu,ad:(h1&&h1.textContent)||document.title}]; }
    var m=document.createElement("div"); m.id="arb-menu";
    m.innerHTML='<button type="button" class="mb" title="Formlar">☰ Menü</button><div class="ml">'+L.map(function(f){ return f.yol===bu ? '<span class="akt">'+esc(f.ad)+'</span>'
      : '<a href="../'+esc(f.yol)+'" target="_blank" rel="noopener">'+esc(f.ad)+'</a>'; }).join("")+'</div>';
    var h=document.querySelector("body > header")||document.querySelector("header");
    if(h){ h.classList.add("arb-mh"); h.insertBefore(m,h.firstChild); }
    else { m.classList.add("serbest"); document.body.insertBefore(m,document.body.firstChild); }
    m.querySelector(".mb").addEventListener("click",function(e){ e.preventDefault(); e.stopPropagation(); m.classList.toggle("acik"); });
    m.querySelector(".ml").addEventListener("click",function(e){ if(e.target&&e.target.tagName==="A") m.classList.remove("acik"); });
    document.addEventListener("click",function(e){ if(!m.contains(e.target)) m.classList.remove("acik"); });
    document.addEventListener("keydown",function(e){ if(e.key==="Escape") m.classList.remove("acik"); });
  }
  /* FORM-MENU-REST: supabase istemcisi olmayan sayfa (cam/, yalniz MB): MB pano oturumunun tokeniyle REST okuma; okunamazsa menude yalniz bu form */
  async function restOku(){
    var t=null; try{ t=JSON.parse(localStorage.getItem("sb-zehysygpqxqmrzangvuc-auth-token")||"null"); }catch(e){}
    var em=((t&&t.user&&t.user.email)||"").toLowerCase(), rows=[];
    if(t&&t.access_token){ try{
      var r=await fetch("https://zehysygpqxqmrzangvuc.supabase.co/rest/v1/form_erisim?select=yol,ad,sira,kisiler,herkes,rol_map,varsayilan_rol&order=sira",
        {cache:"no-store",headers:{apikey:"sb_publishable_ZCcDv4S7qH1hc9tuiv4__A_YVxmIpWc",Authorization:"Bearer "+t.access_token}});
      if(r.ok){ var j=await r.json(); if(Array.isArray(j)) rows=j; } }catch(e){} }
    return {em:em,rows:rows};
  }
  async function calis(){
    if(document.getElementById("arb-menu")) return;
    var cli=(typeof ARB_ACTIVE!=="undefined")?ARB_ACTIVE:null, em="", rows=null;
    if(document.getElementById("arb-gate")||document.documentElement.classList.contains("arbkilit")){ if(Date.now()-t0<600000) setTimeout(calis,700); return; }
    if(!cli){
      if(window.supabase&&Date.now()-t0<60000){ setTimeout(calis,700); return; }
      var o=await restOku(); em=o.em; rows=o.rows;
    } else {
      var s=null; try{ s=await cli.auth.getSession(); }catch(e){}
      em=((s&&s.data&&s.data.session&&s.data.session.user&&s.data.session.user.email)||"").toLowerCase();
      if(!em){ if(Date.now()-t0<60000) setTimeout(calis,700); return; }
      var r=null; try{ r=await cli.from("form_erisim").select("yol,ad,sira,kisiler,herkes,rol_map,varsayilan_rol").order("sira"); }catch(e){}
      rows=(r&&!r.error&&r.data)||[];
    }
    var kod=(em===MB)?"MB":kisiKod(em,rows);
    var bu=yol();
    var L=rows.filter(function(f){ if(f.yol!==bu&&GIZLI[f.yol]) return false; return f.yol===bu || kod==="MB" || f.herkes || (kod&&(f.kisiler||[]).indexOf(kod)>=0); });
    menuKur(L,bu);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){ setTimeout(calis,300); }); else setTimeout(calis,300);
})();
