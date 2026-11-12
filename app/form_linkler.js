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
    if(h) bantKur(h,bu);
  }
  /* FORM-BANT2 (12.11.2026, Melih): tum formlarda lacivert bant ince; banttaki aciklayici metinler (.sub/.hsub/.hinfo/.note)
     form adinin sagindaki "?" ikonuna tasinir (uzerine gelince / tiklayinca acilir). "Guncelle" dugmesi ve Son guncelleme
     tarihi bandin sagina tasinir. Tarih: sayfada #stamp varsa o tasinir, yoksa DAMGA eslemesiyle dugme damgasi okunur
     (FORM-SON-GUNC ile ayni kaynak). Sayfadaki [data-arb-bant] ogeleri de banda tasinir (or. Sel-Arb bos-alacak dugmesi). */
  var CLI=null;
  var DAMGA={"sel-arb/":["py","sel_arb_form"],"onur/":["py","oe_sevk"],"ob-rapor/":["py","ob_rapor"],"ahsap/":["py","ahsap"],
    "mk-prim/":["mk"],"so/":["say","SO"],"fy/":["say","FY"],"fy2/":["say","FY2"],"teklif/":["fy"]};
  function damgaKaynak(bu){ if(DAMGA[bu]) return DAMGA[bu]; var m=/^santiye-(.+)\/$/.exec(bu||""); return m?["py","santiye_"+m[1].replace(/-/g,"_")]:null; }
  function tx(el){ return (el.textContent||"").replace(/\s+/g," ").trim().toLocaleLowerCase("tr-TR"); }
  function fd(s){ if(!s) return "—"; var d=new Date(s); return isNaN(d)?"—":d.toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit",year:"2-digit"}); }
  function bantStil(){
    if(document.getElementById("arb-bant2-css")) return;
    var s=document.createElement("style"); s.id="arb-bant2-css";
    s.textContent="header.arb-mh{display:flex!important;align-items:center!important;flex-wrap:wrap;gap:4px 14px;padding:5px 14px 5px 104px!important;min-height:38px;box-sizing:border-box;z-index:1000}"
      +"header.arb-mh #arb-menu{top:50%;transform:translateY(-50%)}"
      +"header.arb-mh h1{font-size:16px!important;margin:0!important;line-height:1.25!important;display:inline-block}"
      +".arb-h1w{display:flex!important;align-items:center;gap:8px;flex-wrap:wrap;margin:0!important}"
      +".arb-hlp{position:relative;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;font:700 12px 'Segoe UI',system-ui,sans-serif;cursor:help;flex:none;user-select:none}"
      +".arb-hlp:hover,.arb-hlp.acik{background:#fff;color:#16324f}"
      +".arb-hlp .arb-hlp-pop{display:none;position:absolute;left:-8px;top:calc(100% + 7px);z-index:1001;background:#fff;color:#1d2b3a;border:1px solid #cdd8e4;border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.22);padding:10px 13px;width:max-content;max-width:min(600px,calc(100vw - 24px));font:400 12.5px/1.5 'Segoe UI',system-ui,sans-serif;text-align:left;cursor:default}"
      +".arb-hlp .arb-hlp-pop::before{content:'';position:absolute;left:0;right:0;top:-9px;height:9px}"
      +".arb-hlp:hover .arb-hlp-pop,.arb-hlp.acik .arb-hlp-pop{display:block}"
      +".arb-hlp-pop>*{display:block!important;margin:0 0 6px!important;max-width:none!important;font-size:12.5px!important;line-height:1.5!important;color:#1d2b3a!important;background:none!important;border:0!important;padding:0!important;flex:none!important;min-width:0!important}"
      +".arb-hlp-pop>*:last-child{margin-bottom:0!important}.arb-hlp-pop *{color:inherit!important}.arb-hlp-pop a{color:#1f5f99!important;text-decoration:underline}"
      +".arb-bsag{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}"
      +".arb-bsag button{background:#fff!important;color:#16324f!important;border:0!important;border-radius:7px!important;padding:5px 13px!important;font:700 13px 'Segoe UI',system-ui,sans-serif!important;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.15);margin:0!important}"
      +".arb-bsag button:hover{background:#e8f0f8!important}.arb-bsag button:disabled{opacity:.6;cursor:wait}"
      +".arb-bsag button.arb-gunc{background:#f2b84b!important}.arb-bsag button.arb-gunc:hover{background:#f7cd77!important}"
      +".arb-bsag .arb-damga{color:#cfe0f0!important;font-size:12px!important;white-space:nowrap;margin:0!important;padding:0!important;background:none!important;border:0!important}"
      +".arb-bsag [data-arb-bant]{display:inline-flex;align-items:center;margin:0!important;padding:0!important}"
      +"@media print{.arb-hlp{display:none}}";
    document.head.appendChild(s);
  }
  async function damgaOku(k){
    if(!CLI||!k) return undefined;
    try{
      if(k[0]==="py"){ var r=await CLI.from("pano_yayin").select("yayin_at").eq("anahtar",k[1]).limit(1); return (r&&!r.error&&r.data&&r.data[0])?r.data[0].yayin_at:null; }
      if(k[0]==="say"){ var r2=await CLI.from("satis_ay_islendi").select("updated_at").eq("kaynak",k[1]).limit(1); return (r2&&!r2.error&&r2.data&&r2.data[0])?r2.data[0].updated_at:null; }
      if(k[0]==="mk"){ var r3=await CLI.from("mk_ay_islendi").select("*").order("id",{ascending:false}).limit(1); var x=(r3&&!r3.error&&r3.data&&r3.data[0])||null; return x?(x.updated_at||x.created_at||null):null; }
      if(k[0]==="fy"){ var r4=await CLI.from("fiyat_yayin").select("yayin_at").eq("id",1).limit(1); return (r4&&!r4.error&&r4.data&&r4.data[0])?r4.data[0].yayin_at:null; }
    }catch(e){}
    return undefined;
  }
  function bantKur(h,bu){
    if(h.dataset.arbBant2) return; h.dataset.arbBant2="1";
    bantStil();
    /* "?" ikonu + aciklama metinleri */
    var h1=h.querySelector("h1");
    var acik=[].slice.call(h.querySelectorAll(".sub,.hsub,.hinfo,.note")).filter(function(e){ return !e.closest("#arb-menu"); });
    if(h1&&acik.length){
      var q=document.createElement("span"); q.className="arb-hlp"; q.tabIndex=0; q.setAttribute("aria-label","Açıklama"); q.textContent="?";
      var pop=document.createElement("div"); pop.className="arb-hlp-pop"; q.appendChild(pop);
      acik.forEach(function(e){ pop.appendChild(e); });
      h1.parentNode.insertBefore(q,h1.nextSibling);
      if(h1.parentNode!==h) h1.parentNode.classList.add("arb-h1w");
      function konum(){ pop.style.left="-8px"; var r=q.getBoundingClientRect(), w=pop.offsetWidth||0, vw=document.documentElement.clientWidth; if(r.left-8+w>vw-12) pop.style.left=Math.max(-r.left+12,vw-12-w-r.left)+"px"; }
      q.addEventListener("mouseenter",konum);
      q.addEventListener("click",function(e){ if(e.target.closest(".arb-hlp-pop")) return; konum(); e.stopPropagation(); q.classList.toggle("acik"); });
      document.addEventListener("click",function(e){ if(!q.contains(e.target)) q.classList.remove("acik"); });
      document.addEventListener("keydown",function(e){ if(e.key==="Escape") q.classList.remove("acik"); });
    }
    var sag=document.createElement("div"); sag.className="arb-bsag"; h.appendChild(sag);
    var dmg=null, kendi=false, k=damgaKaynak(bu), btn=null;
    function tazele(){ if(!kendi||!dmg) return; damgaOku(k).then(function(v){ if(v!==undefined) dmg.textContent="Son güncelleme: "+fd(v); }); }
    function yerlestir(){
      [].slice.call(document.querySelectorAll("[data-arb-bant]")).forEach(function(e){ if(!sag.contains(e)) sag.insertBefore(e,btn||dmg||null); });
      if(!btn){
        btn=[].slice.call(document.querySelectorAll("button")).filter(function(b){
          return !b.closest("table")&&!b.closest("#arb-menu")&&!b.closest(".arb-hlp")&&/^(aylık )?güncelle$/.test(tx(b)); })[0]||null;
        if(btn){ btn.classList.add("arb-gunc"); sag.insertBefore(btn,dmg||null);
          btn.addEventListener("click",function(){ [4000,10000,25000].forEach(function(t){ setTimeout(tazele,t); }); }); }
      }
      if(!dmg){
        var st=document.getElementById("stamp");
        if(st){ dmg=st; dmg.classList.add("arb-damga"); sag.appendChild(dmg); }
        else if(k&&CLI){ dmg=document.createElement("span"); dmg.className="arb-damga"; dmg.textContent="Son güncelleme: …"; sag.appendChild(dmg); kendi=true; tazele(); }
      }
    }
    yerlestir();
    [1500,4000,9000].forEach(function(t){ setTimeout(yerlestir,t); });
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
    CLI=cli; /* FORM-BANT2 */
    var kod=(em===MB)?"MB":kisiKod(em,rows);
    var bu=yol();
    var L=rows.filter(function(f){ if(f.yol!==bu&&GIZLI[f.yol]) return false; return f.yol===bu || kod==="MB" || f.herkes || (kod&&(f.kisiler||[]).indexOf(kod)>=0); });
    menuKur(L,bu);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){ setTimeout(calis,300); }); else setTimeout(calis,300);
})();
