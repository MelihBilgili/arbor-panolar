/* MY-SANTIYE-FOTO (06.11.2026, Melih "Uygundur" 05.11.2026): şantiye ziyareti fotoğraf raporu — ortak betik (kaynak kod/santiye_foto.js)
   Veri: santiye_ziyaret (santiye, tarih, kisi, santiye_kod, proje_no) + santiye_ziyaret_foto (yol, aciklama, sorun, sorumlu, oncelik, durum Açık/Kapandı)
   Depo: özel "santiye-foto", yol YYYY/MM/<ziyaret_id>/<ms>_<i>.<uzantı>; önizleme createSignedUrls (1 saat).
   Erişim: yazma my.form@ + int@; okuma + mk.form@; şantiye formu rolü yalnız kendi formunun kayıtlarını (rpc santiye_foto_liste) okur.
   SFOTO.form(el,{sb,kisi,secenek})  : MY Faaliyet — yeni ziyaret + açık kayıtlar (sağ tık / uzun bas → Kapandı)
   SFOTO.santiyeBlok(el,{sb,kod})    : şantiye formu üstü (#santiye-foto, otomatik) — salt-okur
   SFOTO.mkRozet(sb,el)              : MK Faaliyet › Tıkanmış Şantiyeler — şantiye adına göre 📷 rozet + galeri */
(function(){
  if(window.SFOTO) return;
  var BK="santiye-foto";
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function fd(d){ if(!d) return ""; var s=String(d); return s.slice(8,10)+"."+s.slice(5,7)+"."+s.slice(2,4); }
  function bugun(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function norm(s){ return String(s||"").toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]+/g," ").trim(); }
  function stil(){
    if(document.getElementById("sfoto-css")) return;
    var s=document.createElement("style"); s.id="sfoto-css";
    s.textContent=".sfo{background:#fff;border:1px solid #dde3ea;border-radius:10px;margin-bottom:16px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}"
     +".sfo>h2,.sfo>h3{font-size:14px;margin:0;padding:10px 14px;color:#fff;background:#0a6b57;cursor:pointer;user-select:none}"
     +".sfo>h2 .cnt,.sfo>h3 .cnt{font-weight:400;font-size:12px;color:#d7efe6;margin-left:6px}"
     +".sfo .ic{padding:10px 14px}.sfo.kapali .ic{display:none}"
     +".sfo .ust{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:8px}"
     +".sfo label{font-size:12px;color:#5a6b7d}.sfo label input,.sfo label select,.sfo label textarea{display:block;font:inherit;font-size:13px;color:#1c2430;border:1px solid #cdd6df;border-radius:6px;padding:6px 8px;margin-top:3px;box-sizing:border-box;width:100%}"
     +".sfo .bt{border:0;border-radius:8px;padding:8px 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#2e7d54;color:#fff}.sfo .bt.sec{background:#e3edf7;color:#16324f;font-weight:600}.sfo .bt:disabled{opacity:.5}"
     +".sfo .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;margin:8px 0}"
     +".sfo .kart{border:1px solid #e3e9f0;border-radius:8px;padding:8px;background:#fbfcfe;position:relative;font-size:12.5px}"
     +".sfo .kart img{width:100%;height:170px;object-fit:cover;border-radius:6px;background:#eef1f5;cursor:zoom-in;display:block}"
     +".sfo .kart .x{position:absolute;top:4px;right:6px;border:0;background:rgba(255,255,255,.9);color:#b40000;font-weight:800;font-size:16px;border-radius:50%;width:26px;height:26px;cursor:pointer}"
     +".sfo .kart .m{color:#5a6b7d;font-size:11.5px;margin:5px 0 3px}.sfo .kart .sr{color:#b0003a;font-weight:600}.sfo .kart .on{display:inline-block;font-size:11px;font-weight:700;padding:0 6px;border-radius:4px;background:#eef4fb;color:#16324f}.sfo .kart .on.Acil{background:#fde4ec;color:#b0003a}.sfo .kart .on.Yüksek{background:#fff1dc;color:#9a5300}"
     +".sfo .kart label{margin-top:5px;display:block}.sfo .kart textarea{min-height:44px;resize:vertical}"
     +".sfo .msg{font-size:12.5px;font-weight:600;min-height:17px;margin:4px 0}.sfo .msg.ok{color:#2e7d54}.sfo .msg.err{color:#b40000}"
     +".sfo h4{font-size:13px;color:#16324f;margin:12px 0 2px}.sfo .bos{color:#8a97a4;font-size:12.5px}"
     +".sfo-ctx{position:fixed;z-index:100001;background:#fff;border:1px solid #c9d6e3;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:170px;padding:4px 0;font-size:13px;font-family:'Segoe UI',system-ui,sans-serif}.sfo-ctx .h{padding:5px 12px 6px;font-size:11px;color:#5a6b7d;border-bottom:1px solid #eef1f5}.sfo-ctx .i{padding:7px 12px;cursor:pointer}.sfo-ctx .i:hover{background:#eef4fb}"
     +".sfo-big{position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out}.sfo-big img{max-width:96vw;max-height:94vh}"
     +".sfo-gal{position:fixed;inset:0;z-index:100000;background:rgba(20,30,45,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 10px}.sfo-gal>.sfo{width:min(1000px,96vw);margin:0}"
     +"span.sfo-roz{display:inline-block;margin-left:6px;font-size:11px;font-weight:700;color:#0a6b57;background:#e3f4ee;border-radius:9px;padding:0 7px;cursor:pointer}";
    document.head.appendChild(s);
  }
  async function imzala(sb,yollar){
    var m={}; if(!yollar.length) return m;
    try{ var r=await sb.storage.from(BK).createSignedUrls(yollar,3600); (r.data||[]).forEach(function(x){ if(x&&x.signedUrl) m[x.path]=x.signedUrl; }); }catch(e){}
    return m;
  }
  async function kucult(f){ /* 2,5 MB üstü jpeg/png/webp → en uzun kenar 2000 px jpeg; HEIC olduğu gibi */
    if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size<2.5e6||!window.createImageBitmap) return f;
    try{ var b=await createImageBitmap(f), k=Math.min(1,2000/Math.max(b.width,b.height)), c=document.createElement("canvas");
      c.width=Math.round(b.width*k); c.height=Math.round(b.height*k); c.getContext("2d").drawImage(b,0,0,c.width,c.height);
      var bl=await new Promise(function(r){ c.toBlob(r,"image/jpeg",0.85); });
      return bl?new File([bl],"foto.jpg",{type:"image/jpeg"}):f; }catch(e){ return f; }
  }
  function uzanti(f){ var t=f.type||""; return t==="image/png"?"png":t==="image/webp"?"webp":/hei[cf]/.test(t)||/\.hei[cf]$/i.test(f.name||"")?"heic":"jpg"; }
  function buyuk(url){ if(!url) return; var d=document.createElement("div"); d.className="sfo-big"; d.innerHTML='<img src="'+esc(url)+'">'; d.onclick=function(){ d.remove(); }; document.body.appendChild(d); }
  function ctxKapat(){ var m=document.getElementById("sfo-ctx"); if(m) m.remove(); }
  document.addEventListener("click",function(e){ if(!e.target.closest||!e.target.closest("#sfo-ctx")) ctxKapat(); });
  document.addEventListener("keydown",function(e){ if(e.key==="Escape"){ ctxKapat(); var b=document.querySelector(".sfo-big"); if(b) b.remove(); } });
  function kartHtml(r,url,santiyeGoster){
    return '<div class="kart" data-id="'+r.id+'">'+(url?'<img loading="lazy" src="'+esc(url)+'" data-u="'+esc(url)+'">':'<div class="bos" style="height:60px">Fotoğraf açılamadı</div>')
      +'<div class="m">'+(santiyeGoster?'<b style="color:#16324f">'+esc(r.santiye)+'</b> · ':'')+fd(r.tarih)+(r.kisi?' · '+esc(r.kisi):'')
      +(r.oncelik?' <span class="on '+esc(r.oncelik)+'">'+esc(r.oncelik)+'</span>':'')+'</div>'
      +(r.aciklama?'<div>'+esc(r.aciklama)+'</div>':'')
      +(r.sorun?'<div class="sr">Sorun: '+esc(r.sorun)+'</div>':'')
      +(r.sorumlu?'<div class="m">Sorumlu: '+esc(r.sorumlu)+'</div>':'')+'</div>';
  }
  function duz(r){ var z=r.santiye_ziyaret||{}; return {id:r.id,ziyaret_id:r.ziyaret_id,yol:r.yol,aciklama:r.aciklama,sorun:r.sorun,sorumlu:r.sorumlu,oncelik:r.oncelik,durum:r.durum,santiye:z.santiye,tarih:z.tarih,kisi:z.kisi,santiye_kod:z.santiye_kod,proje_no:z.proje_no}; }
  async function acikKayitlar(sb){
    var r=await sb.from("santiye_ziyaret_foto").select("id,ziyaret_id,yol,aciklama,sorun,sorumlu,oncelik,durum,santiye_ziyaret(santiye,tarih,kisi,santiye_kod,proje_no)").eq("durum","Açık").order("id",{ascending:false});
    if(r.error) throw r.error; return (r.data||[]).map(duz);
  }
  async function gridCiz(kutu,sb,rows,o){ /* şantiyeye göre gruplu kartlar */
    o=o||{};
    if(!rows.length){ kutu.innerHTML='<div class="bos">'+(o.bos||"Açık kayıt yok.")+'</div>'; return; }
    var U=await imzala(sb,rows.map(function(r){ return r.yol; }));
    var G={}, sira=[]; rows.forEach(function(r){ var k=r.santiye||"—"; if(!G[k]){ G[k]=[]; sira.push(k); } G[k].push(r); });
    kutu.innerHTML=sira.map(function(k){ return (o.tekSantiye?'':'<h4>'+esc(k)+' <span class="bos">('+G[k].length+')</span></h4>')+'<div class="grid">'+G[k].map(function(r){ return kartHtml(r,U[r.yol],false); }).join("")+'</div>'; }).join("");
    kutu.querySelectorAll("img[data-u]").forEach(function(i){ i.onclick=function(){ buyuk(i.getAttribute("data-u")); }; });
    if(o.kapat) kutu.querySelectorAll(".kart[data-id]").forEach(function(k){
      k.addEventListener("contextmenu",function(ev){ ev.preventDefault(); ctxKapat();
        var id=+k.getAttribute("data-id"), r=rows.filter(function(x){ return x.id===id; })[0]; if(!r) return;
        var m=document.createElement("div"); m.id="sfo-ctx"; m.className="sfo-ctx";
        m.innerHTML='<div class="h">'+esc(r.santiye)+' · '+fd(r.tarih)+'</div><div class="i" data-o="k">Kapandı</div><div class="i" data-o="b">Fotoğrafı büyüt</div>';
        document.body.appendChild(m);
        m.style.left=Math.max(4,Math.min(ev.clientX,window.innerWidth-m.offsetWidth-6))+"px";
        m.style.top=Math.max(4,Math.min(ev.clientY,window.innerHeight-m.offsetHeight-6))+"px";
        m.querySelector('[data-o="b"]').onclick=function(){ ctxKapat(); buyuk(U[r.yol]); };
        m.querySelector('[data-o="k"]').onclick=function(){ ctxKapat(); o.kapat(r); };
      });
    });
  }
  /* ---------- MY Faaliyet: yeni ziyaret + açık kayıtlar ---------- */
  var F=null;
  function form(el,o){
    if(!el) return; stil(); o=o||{};
    var sec=(typeof o.secenek==="function"?o.secenek():o.secenek)||[];
    if(F&&F.el===el){ F.o=o; F.sec=sec; secDoldur(); return; }
    F={el:el,o:o,sec:sec,bekleyen:[]};
    var acik=window.innerWidth<800;
    el.innerHTML='<div class="sfo'+(acik?'':' kapali')+'"><h2>📷 Şantiye Ziyareti <span class="cnt" id="sfo_cnt"></span></h2><div class="ic">'
      +'<div class="ust"><label style="flex:1 1 240px">Şantiye<input id="sfo_san" list="sfo_dl" autocomplete="off" placeholder="Şantiye seçin veya yazın"></label><datalist id="sfo_dl"></datalist>'
      +'<label style="flex:0 0 150px">Ziyaret Tarihi<input id="sfo_tar" type="date" value="'+bugun()+'"></label>'
      +'<button type="button" class="bt sec" id="sfo_cek">📷 Fotoğraf çek</button><button type="button" class="bt sec" id="sfo_gal">🖼 Galeriden ekle</button>'
      +'<input type="file" id="sfo_f1" accept="image/*" capture="environment" multiple hidden><input type="file" id="sfo_f2" accept="image/*" multiple hidden></div>'
      +'<div class="grid" id="sfo_bek"></div>'
      +'<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="bt" id="sfo_kay" disabled>Kaydet</button><span class="msg" id="sfo_msg"></span></div>'
      +'<h4 style="margin-top:14px">Açık kayıtlar <span class="bos">(sağ tık veya uzun basarak “Kapandı”)</span></h4><div id="sfo_acik"><div class="bos">Yükleniyor…</div></div>'
      +'</div></div>';
    var q=function(id){ return el.querySelector("#"+id); };
    el.querySelector("h2").onclick=function(){ el.firstChild.classList.toggle("kapali"); };
    q("sfo_cek").onclick=function(){ q("sfo_f1").click(); };
    q("sfo_gal").onclick=function(){ q("sfo_f2").click(); };
    [q("sfo_f1"),q("sfo_f2")].forEach(function(inp){ inp.onchange=function(){ Array.prototype.forEach.call(inp.files||[],function(f){ F.bekleyen.push({file:f,url:URL.createObjectURL(f),aciklama:"",sorun:"",sorumlu:"",oncelik:"Normal"}); }); inp.value=""; bekCiz(); }; });
    q("sfo_kay").onclick=kaydet;
    secDoldur(); acikYukle();
  }
  function secDoldur(){
    var dl=F.el.querySelector("#sfo_dl"); if(!dl) return;
    dl.innerHTML=F.sec.map(function(s){ return '<option value="'+esc(s.ad)+'">'; }).join("");
  }
  function msg(t,ok){ var m=F.el.querySelector("#sfo_msg"); m.className="msg "+(ok?"ok":"err"); m.textContent=t; }
  function bekCiz(){
    var k=F.el.querySelector("#sfo_bek");
    k.innerHTML=F.bekleyen.map(function(p,i){ return '<div class="kart" data-i="'+i+'"><button type="button" class="x" title="Çıkar">×</button><img src="'+esc(p.url)+'">'
      +'<label>Açıklama<textarea data-a="aciklama">'+esc(p.aciklama)+'</textarea></label>'
      +'<label>Sorun<textarea data-a="sorun">'+esc(p.sorun)+'</textarea></label>'
      +'<div style="display:flex;gap:6px"><label style="flex:1">Sorumlu<input data-a="sorumlu" value="'+esc(p.sorumlu)+'"></label>'
      +'<label style="flex:0 0 100px">Öncelik<select data-a="oncelik">'+["Normal","Yüksek","Acil"].map(function(x){ return '<option'+(p.oncelik===x?' selected':'')+'>'+x+'</option>'; }).join("")+'</select></label></div></div>'; }).join("");
    k.querySelectorAll(".kart").forEach(function(c){ var i=+c.getAttribute("data-i");
      c.querySelector(".x").onclick=function(){ URL.revokeObjectURL(F.bekleyen[i].url); F.bekleyen.splice(i,1); bekCiz(); };
      c.querySelector("img").onclick=function(){ buyuk(F.bekleyen[i].url); };
      c.querySelectorAll("[data-a]").forEach(function(x){ x.oninput=x.onchange=function(){ F.bekleyen[i][x.getAttribute("data-a")]=x.value; }; }); });
    F.el.querySelector("#sfo_kay").disabled=!F.bekleyen.length;
    F.el.querySelector("#sfo_kay").textContent=F.bekleyen.length?("Kaydet ("+F.bekleyen.length+" fotoğraf)"):"Kaydet";
  }
  async function kaydet(){
    var sb=F.o.sb, san=F.el.querySelector("#sfo_san").value.trim(), tar=F.el.querySelector("#sfo_tar").value||bugun();
    if(!san){ msg("Şantiyeyi seçiniz.",false); return; }
    if(!F.bekleyen.length){ msg("En az bir fotoğraf ekleyiniz.",false); return; }
    var eks=F.bekleyen.filter(function(p){ return !String(p.aciklama).trim()&&!String(p.sorun).trim(); }).length;
    if(eks){ msg(eks+" fotoğrafta Açıklama ya da Sorun yazılmamış.",false); return; }
    var bt=F.el.querySelector("#sfo_kay"); bt.disabled=true;
    var kisi=(typeof F.o.kisi==="function"?F.o.kisi():F.o.kisi)||null;
    var s=F.sec.filter(function(x){ return norm(x.ad)===norm(san); })[0]||{};
    var z=await sb.from("santiye_ziyaret").insert({santiye:s.ad||san,tarih:tar,kisi:kisi,santiye_kod:s.kod||null,proje_no:s.no||null}).select("id").single();
    if(z.error){ msg("Kaydedilemedi: "+z.error.message,false); bt.disabled=false; return; }
    var zid=z.data.id, hata=0, kalan=[];
    for(var i=0;i<F.bekleyen.length;i++){
      var p=F.bekleyen[i]; bt.textContent="Yükleniyor… "+(i+1)+"/"+F.bekleyen.length;
      try{
        var f=await kucult(p.file), yol=tar.slice(0,4)+"/"+tar.slice(5,7)+"/"+zid+"/"+Date.now()+"_"+i+"."+uzanti(f);
        var u=await sb.storage.from(BK).upload(yol,f,{contentType:f.type||"image/jpeg",upsert:false});
        if(u.error) throw u.error;
        var r=await sb.from("santiye_ziyaret_foto").insert({ziyaret_id:zid,yol:yol,aciklama:p.aciklama.trim()||null,sorun:p.sorun.trim()||null,sorumlu:p.sorumlu.trim()||null,oncelik:p.oncelik||null});
        if(r.error) throw r.error;
        URL.revokeObjectURL(p.url);
      }catch(e){ hata++; kalan.push(p); console.warn("santiye-foto",e); }
    }
    F.bekleyen=kalan; bekCiz();
    if(hata) msg(hata+" fotoğraf yüklenemedi; tekrar Kaydet'e basınız.",false);
    else { msg("Ziyaret kaydedildi · "+(s.ad||san),true); F.el.querySelector("#sfo_san").value=""; }
    acikYukle();
  }
  async function acikYukle(){
    var kutu=F.el.querySelector("#sfo_acik"), sb=F.o.sb, rows;
    try{ rows=await acikKayitlar(sb); }catch(e){ kutu.innerHTML='<div class="bos">Okunamadı: '+esc(e.message||e)+'</div>'; return; }
    var c=F.el.querySelector("#sfo_cnt"); if(c) c.textContent=rows.length?("("+rows.length+" açık)"):"";
    await gridCiz(kutu,sb,rows,{kapat:async function(r){
      var kisi=(typeof F.o.kisi==="function"?F.o.kisi():F.o.kisi)||null;
      var u=await sb.from("santiye_ziyaret_foto").update({durum:"Kapandı",kapatan:kisi,kapanis_at:new Date().toISOString()}).eq("id",r.id);
      if(u.error){ msg("Kapatılamadı: "+u.error.message,false); return; }
      msg(r.santiye+" · kayıt kapatıldı",true); acikYukle();
    }});
  }
  /* ---------- şantiye formu (salt-okur) ---------- */
  async function santiyeBlok(el,o){
    if(!el) return; stil();
    var r=await o.sb.rpc("santiye_foto_liste",{p_kod:o.kod});
    if(r.error||!(r.data||[]).length){ el.innerHTML=""; return; }
    var rows=r.data;
    el.innerHTML='<div class="sfo"><h3>📷 MY Şantiye Ziyareti · Açık sorunlar <span class="cnt">('+rows.length+')</span></h3><div class="ic"><div id="sfo_sk"></div></div></div>';
    el.querySelector("h3").onclick=function(){ el.firstChild.classList.toggle("kapali"); };
    await gridCiz(el.querySelector("#sfo_sk"),o.sb,rows,{});
  }
  /* ---------- MK Faaliyet › Tıkanmış Şantiyeler ---------- */
  async function mkRozet(sb,el){
    if(!el) return; stil(); var rows;
    try{ rows=await acikKayitlar(sb); }catch(e){ return; }
    if(!rows.length) return;
    el.querySelectorAll("td.ssan").forEach(function(td){
      var n=norm(td.textContent); if(n.length<3) return;
      var es=rows.filter(function(r){ var s=norm(r.santiye); return s&&(s.indexOf(n)>-1||n.indexOf(s)>-1); });
      if(!es.length||td.querySelector(".sfo-roz")) return;
      var b=document.createElement("span"); b.className="sfo-roz"; b.title="MY şantiye ziyareti — açık fotoğraflı kayıtlar"; b.textContent="📷 "+es.length;
      b.onclick=function(ev){ ev.stopPropagation(); galeri(sb,es,td.textContent.replace(/📷\s*\d+$/,"").trim()); };
      td.appendChild(b);
    });
  }
  function galeri(sb,rows,baslik){
    stil(); var d=document.createElement("div"); d.className="sfo-gal";
    d.innerHTML='<div class="sfo"><h3>📷 '+esc(baslik)+' · açık kayıtlar <span class="cnt">('+rows.length+') · pencereyi kapatmak için başlığa tıklayın</span></h3><div class="ic"><div id="sfo_gk"></div></div></div>';
    d.onclick=function(e){ if(e.target===d) d.remove(); };
    d.querySelector("h3").onclick=function(){ d.remove(); };
    document.body.appendChild(d);
    gridCiz(d.querySelector("#sfo_gk"),sb,rows,{});
  }
  window.SFOTO={form:form,santiyeBlok:santiyeBlok,mkRozet:mkRozet,galeri:galeri,stil:stil};
  /* Şantiye formlarında otomatik çizim (#santiye-foto) */
  var t0=Date.now();
  async function oto(){
    var es=document.getElementById("santiye-foto"); if(!es) return;
    var cli=(typeof ARB_ACTIVE!=="undefined")?ARB_ACTIVE:null;
    if(!cli||document.getElementById("arb-gate")){ if(Date.now()-t0<60000) setTimeout(oto,700); return; }
    var s=null; try{ s=await cli.auth.getSession(); }catch(e){}
    if(!(s&&s.data&&s.data.session)){ if(Date.now()-t0<60000) setTimeout(oto,700); return; }
    var kod=es.getAttribute("data-kod")||((typeof ARB_STORE!=="undefined")?String(ARB_STORE).replace(/^arbform_santiye_/,""):"");
    if(kod) santiyeBlok(es,{sb:cli,kod:kod});
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){ setTimeout(oto,500); }); else setTimeout(oto,500);
})();
