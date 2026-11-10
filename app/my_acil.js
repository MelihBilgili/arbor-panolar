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
     +".my-modal .mut{color:#8a97a4}"
     +"table.mya tr.my-kz td{background:#f4a6a6;border-bottom-color:#e57373}table.mya tr.my-ks td{background:#fff;border-bottom-color:#e6eaef}" /* MY-KESIN-YUKLEME */
     +"table.mya tr.my-grp td{background:#eef4fb;color:#16324f;font-weight:700;font-size:11.5px;padding:5px 7px;border-bottom:1px solid #d3e0ee;cursor:default}"
     +"table.mya tr.my-ksbas td{cursor:pointer;user-select:none}table.mya.ks-kapali tr.my-ks{display:none}"
     +"table.mya tr.my-tbbas td{cursor:pointer;user-select:none}table.mya.tb-kapali tr.my-tb{display:none}" /* MY-TERMIN-BANT */ /* MY-KESIN-BANT */
     +".my-kg{color:#b40000;font-weight:700;margin-right:5px}input.my-kes{font:inherit;font-size:11.5px;border:1px solid #d9a3b6;border-radius:4px;padding:0 3px;background:#fff;color:#1c2430}input.my-kes:disabled{opacity:.6}"
     +"input.my-ack{font:inherit;font-size:12px;width:30ch;border:1px solid #d9a3b6;border-radius:4px;padding:1px 6px;background:#fff;color:#1c2430}input.my-ack:focus{outline:none;border-color:#b0003a}input.my-ack:disabled{opacity:.6}"
     +"table.mya td.w.mack{white-space:pre-line;min-width:30ch;max-width:52ch;vertical-align:top}"; /* MY-ACK-SATIR (06.11.2026, Melih/OE): açıklama kayıtları alt alta, tamamı görünür */
    document.head.appendChild(s);
  }
  async function liste(sb){
    var r=await sb.rpc("my_faaliyet_liste");
    if(r.error) throw r.error;
    return r.data||{rows:[]};
  }
  function sekilHtml(r){
    if(!r.sekil) return "Kamyon"; /* MY-SEKIL-KAMYON: varsayılan yükleme şekli */
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
    /* MY-ACIL-DURUM (06.11.2026, Melih): en solda ERP durumu; sıra önce durum (ERP durum no, küçükten büyüğe), sonra hedef yükleme tarihi */
    var dno=function(r){ var m=/^\s*(\d+(?:[.,]\d+)?)/.exec(String(r.durum_erp||"")); return m?parseFloat(m[1].replace(",",".")):999; };
    rows.sort(function(a,b){ return (dno(a)-dno(b))||String(a.durum_erp||"").localeCompare(String(b.durum_erp||""),"tr")||String(a.hedef||"9999").localeCompare(String(b.hedef||"9999"))||String(a.no).localeCompare(String(b.no)); });
    if(!rows.length){ el.innerHTML=""; return; }
    var mk=mod==="mk", gr=mod==="giris";
    var ackTers=function(s){ return String(s==null?"":s).split("\n").reverse().join("\n"); }; /* MY-ACK-YENI-UST (10.11.2026, Melih): aciklama satirlari en yeni ustte */
    var ack=gr||mod==="oe"; /* MY-ACIKLAMA-OE (06.11.2026, Melih): Açıklama Ekle sütunu OE Faaliyet'te de (rpc my_aciklama_ekle onur.form@ → "OE" önekli) */
    /* MY-KESIN-YUKLEME (06.11.2026, Melih): Kesinleşen Yükleme Tarihi (OE girer; Giriş'te MB de). Durum 3 Sevke Hazır + boş → kırmızı satır "Yükleme tarihi gir";
       tarih girilenler beyaz zeminle altta "Yükleneceği Kesinleşenler" grubunda (kesin tarihe göre). */
    var kesEd=(mod==="oe"||gr);
    var kesR=rows.filter(function(r){ return !!r.kesin; }).sort(function(a,b){ return String(a.kesin).localeCompare(String(b.kesin))||String(a.no).localeCompare(String(b.no)); });
    var anaR=rows.filter(function(r){ return !r.kesin; });
    /* MY-TERMIN-BANT (06.11.2026, Melih): AÜP/Termin bugün ya da ileri tarihli (kesinleşmemiş) satırlar "Termini Beklenenler" açılır bandında, kesinleşenlerin hemen üstünde; kapalı başlar (el._tbAcik) */
    var bugun=new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Istanbul"});
    var tbR=anaR.filter(function(r){ return r.tarih&&String(r.tarih).slice(0,10)>=bugun; }).sort(function(a,b){ return String(a.tarih).localeCompare(String(b.tarih))||String(a.no).localeCompare(String(b.no)); });
    anaR=anaR.filter(function(r){ return tbR.indexOf(r)<0; });
    var ncol=11+(mk?1:0)+(ack?1:0);
    /* MY-ACIL-SORUMLU (06.11.2026, Melih): Durum'un sağında Sorumlu + Görev (yalnız PEM, ERP durum no'suna göre) */
    var SG={"0":["Buse Hanım","Malzeme listesini yükle"],"0.1":["Onur Bey","Malzeme onayını ver"],"1":["Berat Bey","Termini gir"],"1.2":["Umut Bey","Termini gir"],"1.3":["Berat Bey · Umut Bey · Semih Bey","Termini gir"],"2":["Semih Bey","Termini gir"]};
    var sg=function(r){ if(r.tur!=="PEM") return ["",""]; var m=/^\s*(\d+(?:[.,]\d+)?)/.exec(String(r.durum_erp||"")); return (m&&SG[m[1].replace(",",".")])||["",""]; };
    var shz=function(r){ var n=dno(r); return n===3||n===8; }; /* MY-SEVKE-HAZIR-8 (10.11.2026, Melih): PEM 3 ve PRJ 8 Sevke Hazir -> kirmizi + Yukleme tarihi gir */
    var kesHtml=function(r){
      var kz=!r.kesin&&shz(r);
      if(kesEd) return (kz?'<span class="my-kg">Yükleme tarihi gir</span>':'')+'<input type="date" class="my-kes" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'" value="'+esc(r.kesin?String(r.kesin).slice(0,10):"")+'">';
      return r.kesin?'<b>'+fd(r.kesin)+'</b>':(kz?'<span class="my-kg">Yükleme tarihi gir</span>':'');
    }; /* MY-ACIKLAMA-EKLE (28.10.2026): Giriş panosunda "Açıklama Ekle" sütunu (yalnız MB) */
    var h='<div class="myab"><h3>ACİL YÜKLEMELER · MY ('+rows.length+')</h3><div class="myw"><table class="mya'+(el._ksAcik?'':' ks-kapali')+(el._tbAcik?'':' tb-kapali')+'"><thead><tr>'
      +'<th>Durum</th><th>Sorumlu</th><th>Görev</th><th>No</th><th>Proje Adı</th><th>Adet</th><th>AÜP /<br>Termin</th><th>Hedef<br>Yükleme Tarihi</th><th>Kesinleşen<br>Yükleme Tarihi</th><th>Yükleme<br>Şekli</th>'+(mk?'<th></th>':'')+'<th>Açıklama</th>'+(ack?'<th>Açıklama Ekle</th>':'')+'</tr></thead><tbody>'
      +anaR.concat(tbR,kesR).map(function(r,i){
        var no=r.tur==="PEM"?("PEM "+r.kod):r.kod;
        var onay=(mk&&r.sekil==="Uçak"&&!r.ucak_onay)?'<button class="my-onay" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'">Uçak yüklemesini onayla</button>':'';
        var cls=r.kesin?'my-ks':(tbR.indexOf(r)>=0?'my-tb':(shz(r)?'my-kz':''));
        var grp=((i===anaR.length&&tbR.length)?'<tr class="my-grp my-tbbas" title="Aç / kapat"><td colspan="'+ncol+'"><span class="my-ok">'+(el._tbAcik?'▾':'▸')+'</span> TERMİNİ BEKLENENLER ('+tbR.length+')</td></tr>':'')+((i===anaR.length+tbR.length&&kesR.length)?'<tr class="my-grp my-ksbas" title="Aç / kapat"><td colspan="'+ncol+'"><span class="my-ok">'+(el._ksAcik?'▾':'▸')+'</span> YÜKLENECEĞİ KESİNLEŞENLER ('+kesR.length+')</td></tr>':'');
        return grp+'<tr class="'+cls+'" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'"><td class="w" style="max-width:24ch" title="'+esc(r.durum_erp)+'">'+esc(r.durum_erp)+'</td><td>'+esc(sg(r)[0])+'</td><td>'+esc(sg(r)[1])+'</td><td title="'+esc(r.no)+'">'+esc(no)+'</td><td class="w" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td>'
          +'<td style="text-align:right">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td><td><b>'+fd(r.hedef)+'</b></td><td>'+kesHtml(r)+'</td><td>'+sekilHtml(r)+'</td>'
          +(mk?'<td>'+onay+'</td>':'')+'<td class="w mack" title="'+esc(ackTers(r.aciklama))+'">'+esc(ackTers(r.aciklama))+'</td>' /* MY-ACK-SATIR / MY-ACK-YENI-UST */
          +(ack?'<td><input class="my-ack" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'" placeholder="Yazıp Enter’a basın"></td>':'')+'</tr>';
      }).join("")+'</tbody></table></div></div>';
    el.innerHTML=h;
    /* MY-KESIN-BANT (06.11.2026, Melih): Kesinleşenler grubu açılır bant, kapalı başlar; durum yenilemelerde korunur (el._ksAcik) */
    el.querySelectorAll("tr.my-tbbas").forEach(function(g){ g.addEventListener("click",function(){ el._tbAcik=!el._tbAcik; var t=g.closest("table"); if(t) t.classList.toggle("tb-kapali",!el._tbAcik); var o=g.querySelector(".my-ok"); if(o) o.textContent=el._tbAcik?"▾":"▸"; }); }); /* MY-TERMIN-BANT */
    el.querySelectorAll("tr.my-ksbas").forEach(function(g){ g.addEventListener("click",function(){ el._ksAcik=!el._ksAcik; var t=g.closest("table"); if(t) t.classList.toggle("ks-kapali",!el._ksAcik); var o=g.querySelector(".my-ok"); if(o) o.textContent=el._ksAcik?"▾":"▸"; }); });
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
    el.querySelectorAll("input.my-kes").forEach(function(inp){ /* MY-KESIN-YUKLEME */
      inp.addEventListener("dblclick",function(ev){ ev.stopPropagation(); });
      inp.addEventListener("contextmenu",function(ev){ ev.stopPropagation(); });
      inp.addEventListener("change",async function(){
        var v=inp.value||null; if(v&&!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
        inp.disabled=true;
        var r=await sb.rpc("my_kesin_yukleme",{p_tur:inp.getAttribute("data-tur"),p_no:inp.getAttribute("data-no"),p_tarih:v});
        if(r.error){ inp.disabled=false; alert("Kaydedilemedi: "+r.error.message); return; }
        try{ document.dispatchEvent(new CustomEvent("my-kesin",{detail:{tur:inp.getAttribute("data-tur"),no:inp.getAttribute("data-no")}})); }catch(e){} /* MY-KESIN-SEVK-OTO: boş sevk durumu sunucuda doldu, formlar tazelesin */
        acilBlok(el,o);
      });
    });
    el.querySelectorAll("input.my-ack").forEach(function(inp){
      inp.addEventListener("dblclick",function(ev){ ev.stopPropagation(); });
      inp.addEventListener("contextmenu",function(ev){ ev.stopPropagation(); });
      inp.addEventListener("keydown",async function(ev){
        if(ev.key!=="Enter") return; ev.preventDefault();
        var t=inp.value.trim(); if(!t) return;
        inp.disabled=true;
        var r=await sb.rpc("my_aciklama_ekle",{p_tur:inp.getAttribute("data-tur"),p_no:inp.getAttribute("data-no"),p_metin:t});
        if(r.error){ inp.disabled=false; alert("Eklenemedi: "+r.error.message); return; }
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
  /* MY-SANTIYE (28.10.2026, Melih): şantiye formlarının en üstünde o şantiyenin MY Faaliyet satırları (MY formundaki hâliyle).
     Sağ tık: Acile çevir / Normale çevir / Ayrıntılar. Değişiklik doğrudan uygulanmaz — talep olarak MY onayına gider
     (rpc my_santiye_talep + edge my-takip islem "santiye_talep" → MY'ye mail; onay bekleyen talep gri görünür). */
  function sKisi(){
    try{ if(window.ARB_KISI_AL&&typeof ARB_ROL_EMAIL!=="undefined"){ var k=ARB_KISI_AL(ARB_ROL_EMAIL); if(k&&k.kod) return k.kod; } }catch(e){}
    try{ if(typeof ARB_ACTIVE!=="undefined"&&typeof ARB_MB_SB!=="undefined"&&ARB_ACTIVE===ARB_MB_SB) return "MB"; }catch(e){}
    return "";
  }
  function sStil(){
    if(document.getElementById("mysan-css")) return;
    var s=document.createElement("style"); s.id="mysan-css";
    s.textContent=
      ".mysan{margin:0 0 18px;font-family:'Segoe UI',system-ui,sans-serif}"
     +".mysan h3{margin:0 0 4px;font-size:14px;color:#16324f}.mysan .alt{font-size:11.5px;color:#5a6b7d;margin:0 0 8px}"
     +".mysan h4{margin:10px 0 4px;font-size:12.5px;color:#16324f}"
     +".mysan .myw{overflow-x:auto}"
     +"table.mys{border-collapse:collapse;font-size:12px;width:auto;background:#fff}"
     +"table.mys.fx{table-layout:fixed}table.mys.fx th,table.mys.fx td{overflow:hidden;text-overflow:ellipsis}table.mys.fx td.w{max-width:none}" /* MY-HIZA */
     +"table.mys th{background:#eef4fb;color:#16324f;font-weight:600;font-size:11px;text-align:left;padding:3px 7px;white-space:nowrap;vertical-align:bottom;line-height:12px;border-bottom:2px solid #d3e0ee}"
     +"table.mys th.sm{font-size:9.5px;line-height:11px}table.mys th.ek{background:#e3edf7}"
     +"table.mys td{border-bottom:1px solid #eef1f5;padding:2px 7px;white-space:nowrap;line-height:17px;color:#1c2430}"
     +"table.mys td.n{text-align:right}table.mys td.w{max-width:30ch;overflow:hidden;text-overflow:ellipsis}"
     +"table.mys tr{cursor:context-menu}table.mys tr.acil td{background:#fde4ec;border-bottom-color:#f3c6d4}"
     +"table.mys td.dur{font-weight:600;color:#5a6b7d}table.mys td.dur.acil{color:#b0003a}table.mys td.dur .bek{color:#9aa5b1;font-weight:600}"
     +".mys-ctx{position:fixed;z-index:100001;background:#fff;border:1px solid #c9d6e3;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.18);min-width:190px;padding:4px 0;font-size:13px;font-family:'Segoe UI',system-ui,sans-serif}"
     +".mys-ctx .h{padding:5px 12px 6px;font-size:11px;color:#5a6b7d;border-bottom:1px solid #eef1f5;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
     +".mys-ctx .i{padding:7px 12px;cursor:pointer}.mys-ctx .i:hover{background:#eef4fb}.mys-ctx .i.pas{color:#9aa5b1;cursor:default}.mys-ctx .i.pas:hover{background:none}"
     +".mys-fl{display:block;font-size:12px;color:#5a6b7d;margin:0 0 8px}.mys-fl textarea,.mys-fl input,.mys-fl select{display:block;width:100%;font:inherit;font-size:13px;color:#1c2430;border:1px solid #cdd6df;border-radius:6px;padding:6px 8px;margin-top:3px;box-sizing:border-box}"
     +".mys-btn{border:0;border-radius:8px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#2e7d54;color:#fff}.mys-btn.sec{background:#e3edf7;color:#16324f;font-weight:600}"
     +".mys-msg{font-size:12.5px;font-weight:600;min-height:16px;margin:4px 0}.mys-msg.ok{color:#2e7d54}.mys-msg.err{color:#b40000}";
    document.head.appendChild(s);
  }
  function sKapat(){ var m=document.getElementById("mys-ctx"); if(m) m.remove(); }
  async function santiyeBlok(el,o){
    if(!el) return; o=o||{}; stil(); sStil();
    var sb=o.sb, kod=o.kod, d;
    try{ var r0=await sb.rpc("my_santiye_liste",{p_kod:kod}); if(r0.error) throw r0.error; d=r0.data||{rows:[]}; }catch(e){ el.innerHTML=""; return; }
    var rows=d.rows||[];
    if(!rows.length){ el.innerHTML=""; return; }
    var B=[["prj","Projeler · 4.1 – 7.1",false],["sevk","Sevke Hazır · 8 / 8.1",false],["pem","PEM",true]];
    var ek='<th class="ek sm">Hedef<br>Yükleme Tarihi</th><th class="ek sm">Yükleme<br>Şekli</th><th class="ek">Açıklama</th><th class="ek sm">Takip<br>Durumu</th>';
    var h='<div class="mysan"><h3>Projeleriniz ve PEM\'leriniz</h3><div class="alt">Satıra sağ tıklayarak acil ya da normal takibe alma talebinde bulunabilir, ayrıntıları görebilirsiniz. Talepler MY onayından sonra geçerli olur.</div><div class="mys-msg" id="mys-msg"></div>'
      +B.map(function(b){
        var R=rows.filter(function(r){ return r.blok===b[0]; }); if(!R.length) return "";
        var head=b[2]?'<th>PEM</th><th class="sm">Talep<br>Tarihi</th><th>Proje Adı</th><th>Ek Bilgi</th><th>Adet</th><th class="sm">Termin<br>Tarihi</th>':'<th>NO</th><th>PROJE ADI</th><th>Ad</th><th>AÜP</th>';
        /* MY-HIZA (28.10.2026): PEM'de Talep Tarihi 2. sütun; proje bloklarının son 6 sütunu PEM'in son 6 sütunuyla hizalı */
        var W=[64,72,133,210,44,72,84,64,230,280]; if(!b[2]) W=[W[0],W[1]+W[2]+W[3]].concat(W.slice(4)); /* MY-AD-DAR: Proje Adı %30 dar (PEM 190→133; proje 472→330 görünür, sağ boşluk) */
        var padAd=b[2]?'':' style="padding-right:'+(W[1]-330+7)+'px"';
        return '<h4>'+esc(b[1])+'</h4><div class="myw"><table class="mys fx" style="width:'+W.reduce(function(a,x){return a+x;},0)+'px"><colgroup>'+W.map(function(x){ return '<col style="width:'+x+'px">'; }).join('')+'</colgroup><thead><tr>'+head+ek+'</tr></thead><tbody>'+R.map(function(r){
          var ac=r.durum==="Acil";
          var ilk=b[2]
            ? '<td title="'+esc(r.no+(r.durum_erp?' · '+r.durum_erp:''))+'">'+esc(r.kod)+'</td><td>'+fd(r.talep_tarihi)+'</td><td class="w" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td><td class="w" title="'+esc(r.ekbilgi)+'">'+esc(r.ekbilgi)+'</td><td class="n">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td>'
            : '<td title="'+esc(r.no)+'">'+esc(r.kod)+'</td><td class="w"'+padAd+' title="'+esc(r.proje)+'">'+esc(r.proje)+'</td><td class="n">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td>';
          var dur=esc(r.durum||"Normal")+(r.talep?' <span class="bek" title="MY onayı bekleniyor">→ '+esc(r.talep)+' (MY onayı bekliyor)</span>':'');
          return '<tr class="'+(ac?'acil':'')+'" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'">'+ilk
            +'<td>'+(ac?fd(r.hedef):'')+'</td><td>'+sekilHtml(r)+'</td><td class="w" title="'+esc(r.aciklama)+'">'+(ac?esc(r.aciklama):'')+'</td>'
            +'<td class="dur '+(ac?'acil':'')+'" title="'+esc(String(r.durum||'Normal')+(r.talep?' → '+r.talep+' (MY onayı bekliyor)':''))+'">'+dur+'</td></tr>';
        }).join("")+'</tbody></table></div>';
      }).join("")+'</div>';
    el.innerHTML=h;
    var bul=function(tr){ var t=tr.getAttribute("data-tur"), n=tr.getAttribute("data-no"); return rows.filter(function(r){ return r.tur===t&&r.no===n; })[0]; };
    var msg=function(t,ok){ var m=el.querySelector("#mys-msg"); if(!m) return; m.className="mys-msg "+(ok?"ok":"err"); m.textContent=t; };
    el.querySelectorAll("tr[data-tur]").forEach(function(tr){
      tr.addEventListener("contextmenu",function(ev){
        ev.preventDefault(); sKapat(); var r=bul(tr); if(!r) return;
        var m=document.createElement("div"); m.id="mys-ctx"; m.className="mys-ctx";
        var lbl=r.tur==="PEM"?"PEM "+r.kod:r.kod;
        var ops=[];
        if(r.talep) ops.push(["", r.talep+" talebi MY onayı bekliyor", true]);
        else if(r.durum==="Acil") ops.push(["normal","Normale çevir"]);
        else ops.push(["acil","Acile çevir"]);
        ops.push(["ayr","Ayrıntılar"]);
        m.innerHTML='<div class="h">'+esc(lbl)+' · '+esc(r.proje)+'</div>'+ops.map(function(x){ return '<div class="i'+(x[2]?' pas':'')+'" data-o="'+x[0]+'">'+esc(x[1])+'</div>'; }).join("");
        document.body.appendChild(m);
        m.style.left=Math.max(4,Math.min(ev.clientX,window.innerWidth-m.offsetWidth-6))+"px";
        m.style.top=Math.max(4,Math.min(ev.clientY,window.innerHeight-m.offsetHeight-6))+"px";
        m.querySelectorAll(".i[data-o]").forEach(function(i){ var op=i.getAttribute("data-o"); if(!op) return; i.onclick=function(){ sKapat();
          if(op==="ayr") return ayrinti(sb,r.tur,r.no);
          if(op==="acil") return sAcilPencere(sb,r,function(){ santiyeBlok(el,o); },msg);
          if(op==="normal"){ if(!confirm(lbl+" · "+r.proje+"\n\nNormal takibe alma talebi MY'ye gönderilsin mi?")) return; sTalep(sb,r,"Normal",{},function(){ santiyeBlok(el,o); },msg); }
        }; });
      });
    });
  }
  async function sTalep(sb,r,durum,ek,sonra,msg){
    var res=await sb.rpc("my_santiye_talep",{p_tur:r.tur,p_no:r.no,p_durum:durum,p_hedef:ek.hedef||null,p_sekil:ek.sekil||null,p_aciklama:ek.aciklama||null,p_kisi:sKisi()||null});
    if(res.error){ msg("Gönderilemedi: "+res.error.message,false); return false; }
    var h=""; try{ var x=await sb.functions.invoke("my-takip",{body:{islem:"santiye_talep",tur:r.tur,no:r.no}}); h=(x&&x.data&&x.data.mail==="ok")?" · MY'ye mail gönderildi":""; }catch(e){}
    if(sonra) await sonra();
    msg((r.tur==="PEM"?"PEM "+r.kod:r.kod)+" · "+durum+" talebi MY onayına gönderildi"+h,true);
    return true;
  }
  function sAcilPencere(sb,r,sonra,msg){
    var m=document.createElement("div"); m.className="my-modal";
    var hd=r.tarih?String(r.tarih).slice(0,10):"";
    m.innerHTML='<div class="box" style="max-width:460px"><button class="x" title="Kapat">×</button>'
      +'<h4>Acile çevirme talebi · '+esc(r.tur==="PEM"?"PEM "+r.kod:r.kod)+'</h4><div class="mut" style="margin-bottom:10px">'+esc(r.proje)+'</div>'
      +'<label class="mys-fl">Açıklama<textarea id="ms_ac" rows="3"></textarea></label>'
      +'<label class="mys-fl">Hedef Yükleme Tarihi<input id="ms_hd" type="date" value="'+esc(hd)+'"></label>'
      +'<label class="mys-fl">Yükleme Şekli<select id="ms_sk"><option selected>Kamyon</option><option>Uçak</option></select></label>'
      +'<div class="mut" style="font-size:11.5px;margin:4px 0 10px">Talep MY onayına gönderilir; onaylanınca satır acil takibe alınır.</div>'
      +'<div style="display:flex;gap:8px;justify-content:flex-end"><button class="mys-btn sec" id="ms_vz">Vazgeç</button><button class="mys-btn" id="ms_ok">Talebi gönder</button></div></div>';
    document.body.appendChild(m);
    var kapat=function(){ m.remove(); };
    m.addEventListener("click",function(e){ if(e.target===m||e.target.classList.contains("x")) kapat(); });
    m.querySelector("#ms_vz").onclick=kapat;
    m.querySelector("#ms_ok").onclick=async function(){
      var hedef=m.querySelector("#ms_hd").value, sekil=m.querySelector("#ms_sk").value, aciklama=m.querySelector("#ms_ac").value.trim();
      if(!hedef){ alert("Hedef yükleme tarihini giriniz."); return; }
      var b=m.querySelector("#ms_ok"); b.disabled=true; b.textContent="Gönderiliyor…";
      var ok=await sTalep(sb,r,"Acil",{hedef:hedef,sekil:sekil,aciklama:aciklama},sonra,msg);
      if(ok) kapat(); else { b.disabled=false; b.textContent="Talebi gönder"; }
    };
    setTimeout(function(){ var t=m.querySelector("#ms_ac"); if(t) t.focus(); },50);
  }
  document.addEventListener("click",function(e){ if(!e.target.closest||!e.target.closest("#mys-ctx")) sKapat(); });
  document.addEventListener("keydown",function(e){ if(e.key==="Escape") sKapat(); });
  window.MYACIL={liste:liste,acilBlok:acilBlok,santiyeBlok:santiyeBlok,ayrinti:ayrinti,fd:fd,esc:esc,stil:stil};
  /* Formlarda otomatik çizim */
  var t0=Date.now();
  async function oto(){
    var el=document.getElementById("my-acil"), es=document.getElementById("my-santiye"); if(!el&&!es) return;
    var cli=(typeof ARB_ACTIVE!=="undefined")?ARB_ACTIVE:null;
    if(!cli||document.getElementById("arb-gate")){ if(Date.now()-t0<60000) setTimeout(oto,700); return; }
    var s=null; try{ s=await cli.auth.getSession(); }catch(e){}
    if(!(s&&s.data&&s.data.session)){ if(Date.now()-t0<60000) setTimeout(oto,700); return; }
    if(es){ var skod=es.getAttribute("data-kod")||((typeof ARB_STORE!=="undefined")?String(ARB_STORE).replace(/^arbform_santiye_/,""):"");
      if(skod){ santiyeBlok(es,{sb:cli,kod:skod}); setInterval(function(){ if(!document.querySelector(".my-modal")&&!document.getElementById("mys-ctx")) santiyeBlok(es,{sb:cli,kod:skod}); },5*60*1000); } }
    if(!el) return;
    var mod=el.getAttribute("data-mod")||"oe";
    acilBlok(el,{sb:cli,mod:mod});
    setInterval(function(){ /* MY-ACK-KORU: yazarken yenileme yok; sayfa sürümü değiştiyse yeniden yükle */
      if(el.querySelector("input.my-ack:focus")||[].some.call(el.querySelectorAll("input.my-ack"),function(i){return i.value.trim();})||document.querySelector(".my-modal")) return;
      try{ var sc=document.querySelector('script[src*="my_acil.js?v="]'); var cv=sc&&(sc.getAttribute("src").match(/v=(\w+)/)||[])[1];
        if(cv) fetch(location.pathname,{cache:"no-store"}).then(function(r){return r.text();}).then(function(t){ var m=t.match(/my_acil\.js\?v=(\w+)/); if(m&&m[1]!==cv) location.reload(); }).catch(function(){}); }catch(e){}
      acilBlok(el,{sb:cli,mod:mod}); },5*60*1000);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){ setTimeout(oto,400); }); else setTimeout(oto,400);
})();
