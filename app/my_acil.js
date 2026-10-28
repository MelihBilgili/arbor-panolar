/* MY-FAALIYET (28.10.2026, Melih): MY Faaliyet ortak betiği — kaynak kod/my_acil.js → app/my_acil.js
   - MYACIL.liste(sb)            : rpc my_faaliyet_liste() → {damga, oe_at, rows[]} (PRJ/PEM panosunun yurt dışı içeriği, İptal hariç;
                                   sıra: Acil (hedef yükleme tarihine göre) → Normal (AÜP / termin tarihine göre))
   - MYACIL.acilBlok(el,{sb,mod}): Acil satırlar bloğu — OE Faaliyet, MK Faaliyet ve Giriş panosunun en üstünde.
                                   mod "mk": onay bekleyen Uçak satırının yanında kırmızı "Uçak yüklemesini onayla" kutusu (rpc my_ucak_onayla).
   - MYACIL.ayrinti(sb,tur,no)   : Ayrıntılar penceresi — ERP ingest bilgileri + Takip Durumu geçmişi (rpc my_ayrinti).
   Formlarda <div id="my-acil" data-mod="oe|mk"></div> varsa oturum açılınca kendiliğinden çizilir (ARB_ACTIVE). */
(function(){
  if(window.MYACIL) return;
  function esc(t){ return String(t==null?"":t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function fd(s){ s=String(s||""); var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m?(m[3]+"."+m[2]+"."+m[1].slice(2)):s; }
  function fdt(s){ if(!s) return ""; var d=new Date(s); if(isNaN(d)) return String(s);
    var p=function(x){return String(x).padStart(2,"0");}; return p(d.getDate())+"."+p(d.getMonth()+1)+"."+String(d.getFullYear()).slice(2)+" "+p(d.getHours())+":"+p(d.getMinutes()); }
  function stil(){
    if(document.getElementById("myacil-css")) return;
    var s=document.createElement("style"); s.id="myacil-css";
    s.textContent=
      ".myab{margin:0 0 16px;font-family:'Segoe UI',system-ui,sans-serif}"
     +".myab h3{margin:0 0 6px;font-size:13.5px;color:#b0003a;font-weight:700}"
     +".myab .myw{overflow-x:auto}"
     +"table.mya{border-collapse:collapse;font-size:12px;width:auto}"
     +"table.mya th{background:#16324f;color:#fff;font-weight:600;font-size:10.5px;text-align:left;padding:3px 7px;white-space:nowrap;vertical-align:bottom;line-height:12px}"
     +"table.mya td{background:#fde4ec;border-bottom:1px solid #f3c6d4;padding:3px 7px;white-space:nowrap;line-height:16px;color:#1c2430}"
     +"table.mya td.w{max-width:40ch;overflow:hidden;text-overflow:ellipsis}"
     +"table.mya tr{cursor:context-menu}"
     +".my-ucak-bek{color:#9aa5b1}.my-ucak-ok{color:#000}"
     +".my-onay{display:inline-block;background:#c62828;color:#fff;font-weight:700;font-size:11.5px;border:0;border-radius:5px;padding:3px 9px;cursor:pointer;white-space:nowrap}"
     +".my-onay:disabled{opacity:.6;cursor:default}"
     +".my-modal{position:fixed;inset:0;background:rgba(10,25,40,.45);z-index:100000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto;font-family:'Segoe UI',system-ui,sans-serif}"
     +".my-modal .box{background:#fff;color:#1c2430;border-radius:10px;max-width:760px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);padding:16px 18px;font-size:13px}"
     +".my-modal h4{margin:0 0 4px;font-size:15px;color:#16324f}.my-modal h5{margin:14px 0 6px;font-size:13px;color:#16324f}"
     +".my-modal table{border-collapse:collapse;font-size:12px;width:100%}"
     +".my-modal td,.my-modal th{border-bottom:1px solid #eef1f5;padding:3px 6px;text-align:left;vertical-align:top}"
     +".my-modal th{background:#eef4fb;color:#16324f;font-weight:600;font-size:11px;white-space:nowrap}"
     +".my-modal td.k{color:#5a6b7d;white-space:nowrap;width:1%}"
     +".my-modal .x{float:right;border:0;background:none;font-size:20px;cursor:pointer;color:#5a6b7d;line-height:1}"
     +".my-modal .mut{color:#8a97a4}";
    document.head.appendChild(s);
  }
  async function liste(sb){
    var r=await sb.rpc("my_faaliyet_liste");
    if(r.error) throw r.error;
    return r.data||{rows:[]};
  }
  function sekilHtml(r){
    if(!r.sekil) return "";
    if(r.sekil==="Uçak") return r.ucak_onay?'<span class="my-ucak-ok">Uçak</span>':'<span class="my-ucak-bek" title="MK onayı bekleniyor">Uçak</span>';
    return esc(r.sekil);
  }
  function kisiKod(def){
    try{ if(window.ARB_KISI_AL&&typeof ARB_ROLE_EMAIL!=="undefined"){ var k=ARB_KISI_AL(ARB_ROLE_EMAIL); if(k&&k.kod) return k.kod; } }catch(e){}
    try{ if(typeof ARB_ACTIVE!=="undefined"&&typeof ARB_MB_SB!=="undefined"&&ARB_ACTIVE===ARB_MB_SB) return "MB"; }catch(e){}
    return def||"";
  }
  async function acilBlok(el,o){
    if(!el) return; o=o||{}; stil();
    var sb=o.sb, mod=o.mod||"giris", d;
    try{ d=await liste(sb); }catch(e){ el.innerHTML=""; return; }
    var rows=(d.rows||[]).filter(function(r){ return r.durum==="Acil"; });
    if(!rows.length){ el.innerHTML=""; return; }
    var mk=mod==="mk";
    var h='<div class="myab"><h3>ACİL YÜKLEMELER · MY ('+rows.length+')</h3><div class="myw"><table class="mya"><thead><tr>'
      +'<th>No</th><th>Proje Adı</th><th>Adet</th><th>AÜP /<br>Termin</th><th>Hedef<br>Yükleme Tarihi</th><th>Yükleme<br>Şekli</th>'+(mk?'<th></th>':'')+'<th>Açıklama</th></tr></thead><tbody>'
      +rows.map(function(r){
        var no=r.tur==="PEM"?("PEM "+r.kod):r.kod;
        var onay=(mk&&r.sekil==="Uçak"&&!r.ucak_onay)?'<button class="my-onay" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'">Uçak yüklemesini onayla</button>':'';
        return '<tr data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'"><td title="'+esc(r.no)+'">'+esc(no)+'</td><td class="w" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td>'
          +'<td style="text-align:right">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td><td><b>'+fd(r.hedef)+'</b></td><td>'+sekilHtml(r)+'</td>'
          +(mk?'<td>'+onay+'</td>':'')+'<td class="w" title="'+esc(r.aciklama)+'">'+esc(r.aciklama)+'</td></tr>';
      }).join("")+'</tbody></table></div></div>';
    el.innerHTML=h;
    el.querySelectorAll("tr[data-tur]").forEach(function(tr){
      tr.addEventListener("contextmenu",function(ev){ ev.preventDefault(); ayrinti(sb,tr.getAttribute("data-tur"),tr.getAttribute("data-no")); });
      tr.addEventListener("dblclick",function(){ ayrinti(sb,tr.getAttribute("data-tur"),tr.getAttribute("data-no")); });
    });
    el.querySelectorAll("button.my-onay").forEach(function(b){
      b.addEventListener("click",async function(ev){
        ev.stopPropagation(); b.disabled=true; b.textContent="Onaylanıyor…";
        var r=await sb.rpc("my_ucak_onayla",{p_tur:b.getAttribute("data-tur"),p_no:b.getAttribute("data-no"),p_kisi:kisiKod("MK")});
        if(r.error){ b.disabled=false; b.textContent="Uçak yüklemesini onayla"; alert("Onaylanamadı: "+r.error.message); return; }
        acilBlok(el,o);
      });
    });
  }
  function etiket(k){
    var M={proje_no:"Proje No",proje_adi:"Proje Adı",proje_durumu:"Proje Durumu",adet:"Adet",mvt:"MVT",aup:"AÜP",gyt:"PST (GYT)",ulke:"Ülke",
      uretim_notlari:"Üretim Notları",satis_santiye_notlari:"Satış/Şantiye Notları",satinalma_notlari:"Satınalma Notları",aksesuar_yuklenme_tarihi:"Aksesuar Yüklenme Tarihi",
      anlasma_fiyati:"Anlaşma Fiyatı",santiye_sorumlusu:"Şantiye Sorumlusu",satir_nr:"PEM No",no:"No",termin_tarihi:"Termin Tarihi",durum:"Durum",durum_kod:"Durum Kodu",
      aciliyet:"Aciliyet",kategori:"Kategori",talep:"Talep",miktar:"Miktar",sebep:"Sebep",talep_aciklamasi:"Talep Açıklaması",maliyet:"Maliyet",talep_tarihi:"Talep Tarihi",
      yonetim_onay_tarihi:"Yönetim Onay Tarihi",malzeme_onay_tarihi:"Malzeme Onay Tarihi",talep_acan:"Talep Açan",talep_eden:"Talep Eden",sevk_tarihi:"Sevk Tarihi",
      sevk_sekli:"Sevk Şekli",not_alani:"Not",tedarikci:"Tedarikçi",depo_inceleme:"Depo İnceleme",satinalma_inceleme:"Satınalma İnceleme",
      malzeme_listesi_ekl_tar:"Malzeme Listesi Ekl. Tar.",poz_no:"Poz No",musteri_poz_no:"Müşteri Poz No",bina:"Bina",kat:"Kat",daire:"Daire",
      kalite_onay_tarihi:"Kalite Onay Tarihi",tr_eksik_malzeme:"TR Eksik Malzeme",fr_eksik_malzeme:"FR Eksik Malzeme",durum_degistiren:"Durumu Değiştiren",
      teslim_edilecek_birim:"Teslim Edilecek Birim",ekbilgi:"Ek Bilgi",notlar:"Notlar",termin:"Termin",proje:"Proje"};
    return M[k]||String(k).replace(/_/g," ").replace(/^./,function(c){return c.toUpperCase();});
  }
  function deger(v){ if(v==null||v==="") return '<span class="mut">—</span>'; var s=String(v); if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return fd(s); if(/^\d{4}-\d{2}-\d{2}T/.test(s)) return fdt(s); return esc(s); }
  function kv(o){ if(!o) return '<div class="mut">Kayıt yok</div>';
    return '<table>'+Object.keys(o).map(function(k){ return '<tr><td class="k">'+esc(etiket(k))+'</td><td>'+deger(o[k])+'</td></tr>'; }).join("")+'</table>'; }
  async function ayrinti(sb,tur,no){
    stil();
    var m=document.createElement("div"); m.className="my-modal";
    m.innerHTML='<div class="box"><button class="x" title="Kapat">×</button><h4>'+esc(tur==="PEM"?"PEM "+no:no)+' · Ayrıntılar</h4><div class="mut">Yükleniyor…</div></div>';
    document.body.appendChild(m);
    var kapat=function(){ m.remove(); document.removeEventListener("keydown",esk); };
    var esk=function(e){ if(e.key==="Escape") kapat(); };
    document.addEventListener("keydown",esk);
    m.addEventListener("click",function(e){ if(e.target===m||e.target.classList.contains("x")) kapat(); });
    var r=await sb.rpc("my_ayrinti",{p_tur:tur,p_no:no});
    var box=m.querySelector(".box");
    if(r.error){ box.querySelector(".mut").textContent="Hata: "+r.error.message; return; }
    var d=r.data||{}, t=d.takip||{}, log=d.log||[];
    var erp=d.erp; var erpH="";
    if(Array.isArray(erp)) erpH=erp.length?erp.map(function(x,i){ return (erp.length>1?'<div class="mut" style="margin-top:6px">Satır '+(i+1)+'</div>':'')+kv(x); }).join(""):'<div class="mut">Son ERP çekiminde kayıt yok</div>';
    else erpH=kv(erp);
    var takipH='<table><tr><td class="k">Takip Durumu</td><td><b>'+esc(t.durum||"Normal")+'</b></td></tr>'
      +(t.durum==="Acil"?'<tr><td class="k">Hedef Yükleme Tarihi</td><td>'+fd(t.hedef_yukleme)+'</td></tr><tr><td class="k">Yükleme Şekli</td><td>'+esc(t.yukleme_sekli||"")
        +(t.yukleme_sekli==="Uçak"?(t.ucak_onay?' · MK onayladı ('+esc(t.ucak_onay_kisi||"")+', '+fdt(t.ucak_onay_at)+')':' · <span style="color:#b40000">MK onayı bekleniyor</span>'):'')+'</td></tr>'
        +'<tr><td class="k">Açıklama</td><td>'+esc(t.aciklama||"")+'</td></tr>':'')+'</table>';
    var logH=log.length?'<table><tr><th>Tarih</th><th>Kişi</th><th>Değişiklik</th><th>Eski</th><th>Yeni</th><th>Bilgi</th></tr>'+log.map(function(l){
        var dt=l.detay||{}, b=[]; if(dt.hedef) b.push("Hedef "+fd(dt.hedef)); if(dt.sekil) b.push(dt.sekil); if(dt.aciklama) b.push(dt.aciklama);
        return '<tr><td style="white-space:nowrap">'+fdt(l.at)+'</td><td>'+esc(l.kisi)+'</td><td>'+esc(l.olay)+'</td><td>'+esc(l.eski)+'</td><td>'+esc(l.yeni)+'</td><td>'+esc(b.join(" · "))+'</td></tr>'; }).join("")+'</table>'
      :'<div class="mut">Takip durumu değişikliği yok</div>';
    var sv=d.sevk; var sevkH=sv?'<table><tr><td class="k">Güncel</td><td>'+esc(sv.guncel||"")+'</td></tr><tr><td class="k">Önceki</td><td>'+esc(sv.onceki||"")+'</td></tr><tr><td class="k">Güncellendi</td><td>'+fdt(sv.updated_at)+'</td></tr></table>':'<div class="mut">—</div>';
    box.innerHTML='<button class="x" title="Kapat">×</button><h4>'+esc(tur==="PEM"?"PEM "+no:no)+' · Ayrıntılar</h4>'
      +'<h5>Takip Durumu</h5>'+takipH
      +'<h5>Takip Durumu Değişiklikleri</h5>'+logH
      +'<h5>Sevk Durumu (OE)</h5>'+sevkH
      +'<h5>ERP Bilgileri (son çekim)</h5>'+erpH
      +(d.erp_ek?'<h5>ERP · Hazır PEM/PRJ</h5>'+kv(d.erp_ek):'');
  }
  window.MYACIL={liste:liste,acilBlok:acilBlok,ayrinti:ayrinti,fd:fd,esc:esc,stil:stil};
  /* Formlarda otomatik çizim */
  var t0=Date.now();
  async function oto(){
    var el=document.getElementById("my-acil"); if(!el) return;
    var cli=(typeof ARB_ACTIVE!=="undefined")?ARB_ACTIVE:null;
    if(!cli||document.getElementById("arb-gate")){ if(Date.now()-t0<60000) setTimeout(oto,700); return; }
    var s=null; try{ s=await cli.auth.getSession(); }catch(e){}
    if(!(s&&s.data&&s.data.session)){ if(Date.now()-t0<60000) setTimeout(oto,700); return; }
    var mod=el.getAttribute("data-mod")||"oe";
    acilBlok(el,{sb:cli,mod:mod});
    setInterval(function(){ acilBlok(el,{sb:cli,mod:mod}); },5*60*1000);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){ setTimeout(oto,400); }); else setTimeout(oto,400);
})();
