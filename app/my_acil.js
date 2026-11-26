/* MY-FAALIYET (28.10.2026, Melih): MY Faaliyet ortak betiği — kaynak kod/my_acil.js → app/my_acil.js
   - MYACIL.liste(sb)            : rpc my_faaliyet_liste() → {damga, oe_at, rows[]} (PRJ/PEM panosunun yurt dışı içeriği, İptal hariç;
                                   sıra: Acil (hedef yükleme tarihine göre) → Normal (AÜP / termin tarihine göre))
   - MYACIL.acilBlok(el,{sb,mod}): Acil satırlar bloğu — OE Faaliyet, MK Faaliyet ve Giriş panosunun en üstünde.
                                   mod "mk": onay bekleyen Uçak satırının yanında kırmızı "Uçak yüklemesini onayla" kutusu (rpc my_ucak_onayla).
   - MYACIL.ayrinti(sb,tur,no)   : Ayrıntılar penceresi — ERP ingest bilgileri + Takip Durumu geçmişi (rpc my_ayrinti).
   Formlarda <div id="my-acil" data-mod="oe|mk|ctp"></div> (ctp: salt-okur, CTP-ACIL-GRAFIK) varsa oturum açılınca kendiliğinden çizilir (ARB_ACTIVE). */
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
     +".my-kz{display:inline-block;background:#c62828;color:#fff;font-weight:600;border-radius:3px;padding:0 4px;font-size:11px}input.my-kes{width:92px}input.my-kes.kz{background:#c62828;color:#fff;border-color:#c62828}input.my-kes.kz::-webkit-calendar-picker-indicator{filter:invert(1)}" /* KES-GGAA-OE */
     +"input.my-ack{font:inherit;font-size:12px;width:30ch;border:1px solid #d9a3b6;border-radius:4px;padding:1px 6px;background:#fff;color:#1c2430}input.my-ack:focus{outline:none;border-color:#b0003a}input.my-ack:disabled{opacity:.6}"
     +"table.mya td.w.mack{white-space:nowrap;min-width:30ch;max-width:52ch;overflow:hidden;text-overflow:ellipsis} /* MY-TEK-SATIR (10.11.2026, Melih): satirlar tek satir, en yeni aciklama basta, tamami hover */"+"table.mya.nr-kapali tr.my-nr{display:none}table.mya tr.my-nr td{background:#fff;border-bottom-color:#e6eaef}table.mya tr.my-nrbas td{cursor:pointer;user-select:none}table.mya tr.my-sh td{background:#fff;border-bottom-color:#e6eaef}table.mya tr.my-sh button.del{border:0;background:none;color:#9aa5b1;cursor:pointer;font-size:12px;padding:0 2px}table.mya tr.my-sh button.del:hover{color:#b40000}"; /* MY-DURUM-MK-OE */ /* MY-ACK-SATIR (06.11.2026, Melih/OE): açıklama kayıtları alt alta, tamamı görünür */
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
    var nor=(mod==="ctp"?[]:(d.rows||[])).filter(function(r){ return r.durum!=="Acil"&&!(mod==="mk"&&r.blok==="sevk"); }); /* EU-CTP-KOPYA (25.11.2026, Melih): CTP'de Normal takiptekiler bandı yok — aynı satırlar EU içeriğinin tablolarında */ /* MY-DURUM-MK-OE: Normal takiptekiler acilden ayri bantta */ /* MK-TEKIL (19.11.2026, Melih): MK Faaliyet'te Sevke Hazır Projeler kendi tablosunda — Normal bantta tekrar yok */
    var sh=(mod==="giris"&&Array.isArray(o.sahsi))?o.sahsi:[]; /* GIRIS-ACIL-SAHSI */
    if(!rows.length&&!nor.length&&!sh.length){ el.innerHTML=""; if(o.sonra) try{ o.sonra(el); }catch(e){} return; }
    var mk=mod==="mk", gr=mod==="giris";
    var ackTers=function(s){ return String(s==null?"":s).split("\n").reverse().join("\n"); }; /* MY-ACK-YENI-UST (10.11.2026, Melih): aciklama satirlari en yeni ustte */
    var ack=gr||mod==="oe"; /* MY-ACIKLAMA-OE (06.11.2026, Melih): Açıklama Ekle sütunu OE Faaliyet'te de (rpc my_aciklama_ekle onur.form@ → "OE" önekli) */
    /* MY-KESIN-YUKLEME (06.11.2026, Melih): Kesinleşen Yükleme Tarihi (OE girer; Giriş'te MB de). Durum 3 Sevke Hazır + boş → kırmızı satır "Yükleme tarihi gir";
       tarih girilenler beyaz zeminle altta "Yükleneceği Kesinleşenler" grubunda (kesin tarihe göre). */
    var kesEd=(mod==="oe"); /* KES-GGAA-OE (20.11.2026, Melih): Kesinleşen Yükleme Tarihi yalnız OE Faaliyet'te girilir, diğer yerlerde salt-okur */
    if(mod==="oe"&&el._oeAcik===undefined){ el._oeAcik=1; el._tbAcik=true; el._ksAcik=true; } /* OE-BANT-ACIK (19.11.2026, Melih): OE Faaliyet'te Yükleme Planlaması Beklenenler ve Yükleneceği Kesinleşenler açık başlar */
    var kesR=rows.filter(function(r){ return !!r.kesin; }).sort(function(a,b){ return String(a.kesin).localeCompare(String(b.kesin))||String(a.no).localeCompare(String(b.no)); });
    var anaR=rows.filter(function(r){ return !r.kesin; });
    /* MY-TERMIN-BANT (06.11.2026, Melih): AÜP/Termin bugün ya da ileri tarihli (kesinleşmemiş) satırlar "Termini Beklenenler" açılır bandında, kesinleşenlerin hemen üstünde; kapalı başlar (el._tbAcik) */
    var bugun=new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Istanbul"});
    var tbR=anaR.filter(function(r){ return r.tarih&&String(r.tarih).slice(0,10)>=bugun; }).sort(function(a,b){ return String(a.tarih).localeCompare(String(b.tarih))||String(a.no).localeCompare(String(b.no)); });
    anaR=anaR.filter(function(r){ return tbR.indexOf(r)<0; });
    /* MY-UCAK-UST + MY-YPB-BANT (19.11.2026, Melih): MK onayı bekleyen uçak yüklemeleri en üstte açık grupta ("UÇAK YÜKLEMESİ ONAYI BEKLENENLER");
       kalan kesinleşmemiş satırlar (eski üst satırlar + Termini Beklenenler) tek kapalı bantta "YÜKLEME PLANLAMASI BEKLENENLER" (el._tbAcik, tr.my-tb) */
    var ucB=function(r){ return r.sekil==="Uçak"&&!r.ucak_onay; };
    var ucR=anaR.concat(tbR).filter(ucB);
    anaR=anaR.concat(tbR).filter(function(r){ return !ucB(r); }); tbR=anaR; var anaR0=ucR; if(gr) el._tbAcik=true; /* GIRIS-YPB-ACIK (20.11.2026, Melih; GIRIS-YPB-GIZLI yerine): Giriş panosunda Yükleme Planlaması Beklenenler her zaman açık, kapatılamaz */
    var ncol=12+(mk?1:0); /* MY-GOREV-GUN */
    /* MY-ACIL-SORUMLU (06.11.2026, Melih): Durum'un sağında Sorumlu + Görev (yalnız PEM, ERP durum no'suna göre) */
    var SG={"0":["Buse Hanım","Malzeme listesini yükle"],"0.1":["Onur Bey","Malzeme onayını ver"],"1":["Berat Bey","Termini gir"],"1.2":["Berat Bey","Termini gir"] /* MY-SORUMLU-12-BERAT (13.11.2026, Melih; MY-SORUMLU-12-SEMIH yerine) */,"1.3":["Berat Bey · Umut Bey · Semih Bey","Termini gir"],"2":["Semih Bey","Termini gir"]};
    var sg=function(r){ /* MY-OE-ENGEL (17.11.2026, Melih): OE notu görevi askıya alıyorsa (sunucu, my_gorev tip MO) Sorumlu = beklenen taraf, Görev = kısa metin, kırmızı yok */ if(r.g_tip==="MO"&&r.g_gorev) return [r.g_sorumlu||"Müşteri",r.g_gorev+(r.g_zaman&&r.g_zaman_txt?" ("+r.g_zaman_txt+")":""),0,r.g_zaman?"mz":"mo"]; /* MY-OE-ZAMAN (17.11.2026, Melih): notta tarihin ne zaman girileceği belirtilmişse kırmızı yok */ /* MY-KESIN-OE-GOREV (17.11.2026, Melih): sevke hazır (PEM 3 / PRJ 8) satırda Kesinleşen Yükleme Tarihi yok ve Açıklama'da OE notu (neden) yoksa Sorumlu Onur Bey, Görev "Yükleme tarihi işlenecek" */ if(kesOE(r)) return ["Onur Bey","Yükleme tarihi işlenecek",1]; if(r.tur!=="PEM") return ["",""]; /* MY-GOREV-MUSTERI → MY-OE-ENGEL ile değişti (not anlamı sunucuda okunur) */  /* MY-TERMIN-GIRILDI (13.11.2026, Melih): AÜP/Termin dolu PEM'de Sorumlu/Görev ("Termini gir") gösterilmez; MY-TERMIN-GECTI (13.11.2026, Melih): termin bugünden önceyse Sorumlu + kırmızı "Termin geçti" */ var m=/^\s*(\d+(?:[.,]\d+)?)/.exec(String(r.durum_erp||"")); var s=(m&&SG[m[1].replace(",",".")])||null; if(r.tarih) return (s&&String(r.tarih).slice(0,10)<bugun)?[s[0],"Termin geçti",1]:["",""]; return s||["",""]; }; var sgTd=function(g,r){ var st=g[2]?' style="color:#c62828"':''; /* MY-GOREV-GUN (17.11.2026, Melih): Görev'in sağında Gün = görevin terettüp ettiği günden bu yana takvim günü (my_gorev.basla, sunucu); 1 gün ve üzeri ise Sorumlu kırmızı zemin beyaz yazı */ var gun=(r&&g[1]&&r.g_basla&&r.g_gorev===g[1])?Math.max(0,Math.round((Date.parse(bugun)-Date.parse(String(r.g_basla).slice(0,10)))/864e5)):null; var ss=(gun!==null&&gun>=1&&g[3]!=="mz"&&(g[3]!=="mo"||g[0]==="Onur Bey"))? /* MY-OE-ENGEL-SEVK (17.11.2026, Melih): Sevkiyat beklenen satırda sorumlu OE, kırmızı kuralı işler */' style="background:#c62828;color:#fff;font-weight:600"':st; return '<td'+ss+'>'+esc(g[0])+'</td><td'+st+'>'+esc(g[1])+'</td><td style="text-align:right">'+(gun===null?'':gun)+'</td>'; };
    var shz=function(r){ var n=dno(r); return n===3||n===8; }; var kesOE=function(r){ return !!r.no&&!r.kesin&&shz(r)&&r.g_tip!=="MO"; }; /* MY-OE-ENGEL: OE notunun anlamı sunucuda (my-oe-engel) okunur */ /* MY-KESIN-OE-GOREV */ /* MY-SEVKE-HAZIR-8 (10.11.2026, Melih): PEM 3 ve PRJ 8 Sevke Hazir -> kirmizi + Yukleme tarihi gir */
    var kesHtml=function(r){
      var kz=!r.kesin&&shz(r);
      if(kesEd) return '<input type="date" class="my-kes'+(kz?' kz':'')+'" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'" value="'+esc(r.kesin?String(r.kesin).slice(0,10):"")+'">';
      return r.kesin?'<b>'+fd(r.kesin)+'</b>':(kz?'<span class="my-kz">gg.aa.yy</span>':''); /* KES-GGAA-OE: "Yükleme tarihi gir" yerine kırmızı zemin beyaz gg.aa.yy */
    }; /* MY-ACIKLAMA-EKLE (28.10.2026): Giriş panosunda "Açıklama Ekle" sütunu (yalnız MB) */
    var shH=sh.length?('<tr class="my-grp"><td colspan="'+ncol+'">ŞAHSİ PEM\'LER ('+sh.length+')</td></tr>'+sh.map(function(r){ var e=r.erp||{}, g=sg({tur:"PEM",durum_erp:e.durum,tarih:e.termin});
      return '<tr class="my-sh" data-id="'+esc(r.id)+'" data-tur="PEM" data-no="'+esc(r.kod)+'"><td class="w" style="max-width:24ch" title="'+esc(e.durum)+'">'+esc(e.durum)+'</td>'+sgTd(g)+'<td>PEM '+esc(r.kod)+'</td>'
        +'<td class="w" title="'+esc((e.proje||"")+(e.ekbilgi?" · "+e.ekbilgi:""))+'">'+esc(e.proje)+'</td><td style="text-align:right">'+esc(e.adet)+'</td><td>'+fd(e.termin)+'</td><td></td><td></td>'
        +'<td><button class="del" data-id="'+esc(r.id)+'" title="Gündemden kapat (sil)">✕</button></td>'+(mk?'<td></td>':'')
        +'<td class="w mack ged" data-f="konu" data-type="text" title="'+esc(r.konu)+'">'+esc(r.konu)+'</td></tr>'; }).join("")
      +(rows.length?'<tr class="my-grp"><td colspan="'+ncol+'">ACİL</td></tr>':'')):''; /* GIRIS-ACIL-SAHSI (10.11.2026, Melih): Giriş'te gündemdeki acil olmayan PEM'ler en üstte */
    var h='<div class="myab"><h3>ACİL YÜKLEMELER</h3><div class="myw"><table class="mya'+(el._ksAcik?'':' ks-kapali')+(el._tbAcik?'':' tb-kapali')+'"><thead><tr>'
      +'<th>Durum</th><th>Sorumlu</th><th>Görev</th><th title="Görevin terettüp ettiği günden bu yana geçen gün">Gün</th><th>No</th><th>Proje Adı</th><th>Adet</th><th>AÜP /<br>Termin</th><th>Hedef<br>Yükleme Tarihi</th><th>Kesinleşen<br>Yükleme Tarihi</th><th>Yükleme<br>Şekli</th>'+(mk?'<th></th>':'')+'<th>Açıklama'+(ack?' <span style="font-weight:400">(Ekle)</span>':'')+'</th>'+'</tr></thead><tbody>'+shH
      +anaR0.concat(tbR,kesR).map(function(r,i){ var anaR=anaR0; /* MY-YPB-BANT: üst = uçak onayı bekleyenler, bant = tbR */
        var no=r.tur==="PEM"?("PEM "+r.kod):r.kod;
        var onay=(mk&&r.sekil==="Uçak"&&!r.ucak_onay)?'<button class="my-onay" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'">Uçak yüklemesini onayla</button>':'';
        var cls=r.kesin?'my-ks':(tbR.indexOf(r)>=0?'my-tb':'' /* MY-SHZ-PEMBE-YOK (17.11.2026, Melih): sevke hazırlar pembe değil */);
        var grp=((i===0&&anaR.length)?'<tr class="my-grp"><td colspan="'+ncol+'">UÇAK YÜKLEMESİ ONAYI BEKLENENLER ('+anaR.length+')</td></tr>':'')+((i===anaR.length&&tbR.length)?(gr?'<tr class="my-grp"><td colspan="'+ncol+'">':'<tr class="my-grp my-tbbas" title="Aç / kapat"><td colspan="'+ncol+'"><span class="my-ok">'+(el._tbAcik?'▾':'▸')+'</span> ')+'YÜKLEME PLANLAMASI BEKLENENLER ('+tbR.length+')</td></tr>':'')+((i===anaR.length+tbR.length&&kesR.length)?'<tr class="my-grp my-ksbas" title="Aç / kapat"><td colspan="'+ncol+'"><span class="my-ok">'+(el._ksAcik?'▾':'▸')+'</span> YÜKLENECEĞİ KESİNLEŞENLER ('+kesR.length+')</td></tr>':'');
        return grp+'<tr class="'+cls+'" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'"><td class="w" style="max-width:24ch" title="'+esc(r.durum_erp)+'">'+esc(r.durum_erp)+'</td>'+sgTd(sg(r),r)+'<td title="'+esc(r.no)+'">'+esc(no)+'</td><td class="w" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td>'
          +'<td style="text-align:right">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td><td><b>'+fd(r.hedef)+'</b></td><td>'+kesHtml(r)+'</td><td>'+sekilHtml(r)+'</td>'
          +(mk?'<td>'+onay+'</td>':'')+'<td class="w mack'+(ack?' my-acked':'')+'" title="'+esc(ackTers(r.aciklama))+'">'+esc(ackTers(r.aciklama))+'</td>' /* MY-ACK-SATIR / MY-ACK-YENI-UST */+'</tr>';
      }).join("")+'</tbody></table></div>'
      +(nor.length?'<div class="myw" style="margin-top:6px"><table class="mya'+(el._nrAcik?'':' nr-kapali')+'"><tbody><tr class="my-grp my-nrbas" title="Aç / kapat"><td colspan="6"><span class="my-ok">'+(el._nrAcik?'▾':'▸')+'</span> NORMAL TAKİPTEKİLER ('+nor.length+') · Acile çevirmek için satıra sağ tıklayın</td></tr>'
        +nor.map(function(r){ var no=r.tur==="PEM"?("PEM "+r.kod):r.kod; return '<tr class="my-nr" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'"><td class="w" style="max-width:24ch" title="'+esc(r.durum_erp)+'">'+esc(r.durum_erp)+'</td><td>'+esc(no)+'</td><td class="w" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td><td style="text-align:right">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td><td>'+(r.talep?'<span style="color:#9aa5b1">'+esc(r.talep)+' talebi MY onayında</span>':'')+'</td></tr>'; }).join("")
        +'</tbody></table></div>':'')+'</div>';
    el.innerHTML=h;
    el.querySelectorAll("tr.my-nrbas").forEach(function(g){ g.addEventListener("click",function(){ el._nrAcik=!el._nrAcik; var tb=g.closest("table"); if(tb) tb.classList.toggle("nr-kapali",!el._nrAcik); var ok=g.querySelector(".my-ok"); if(ok) ok.textContent=el._nrAcik?"▾":"▸"; }); });
    var KD=mod==="mk"?"MK":(mod==="oe"?"OE":"MB");
    var aMenu=function(ev,tr){ /* MY-DURUM-MK-OE (10.11.2026, Melih): MK/OE/Giriş doğrudan Normal<->Acil (rpc my_durum_yaz) */
      var tt=tr.getAttribute("data-tur"), nn=tr.getAttribute("data-no");
      if(mod==="ctp") return ayrinti(sb,tt,nn); /* CTP-ACIL-GRAFIK (14.11.2026, Melih): CTP Faaliyet salt-okur — sağ tık yalnız Ayrıntılar */
      var r=(d.rows||[]).filter(function(x){ return x.tur===tt&&x.no===nn; })[0]; if(!r) return ayrinti(sb,tt,nn);
      sKapat(); sStil(); var m=document.createElement("div"); m.id="mys-ctx"; m.className="mys-ctx";
      var lbl=r.tur==="PEM"?"PEM "+r.kod:r.kod;
      var ops=r.durum==="Acil"?[["normal","Normale çevir"],["ayr","Ayrıntılar"]]:[["acil","Acile çevir"],["ayr","Ayrıntılar"]];
      m.innerHTML='<div class="h">'+esc(lbl)+' · '+esc(r.proje)+'</div>'+ops.map(function(x){ return '<div class="i" data-o="'+x[0]+'">'+x[1]+'</div>'; }).join("");
      document.body.appendChild(m);
      m.style.left=Math.max(4,Math.min(ev.clientX,window.innerWidth-m.offsetWidth-6))+"px";
      m.style.top=Math.max(4,Math.min(ev.clientY,window.innerHeight-m.offsetHeight-6))+"px";
      m.querySelectorAll(".i").forEach(function(i){ i.onclick=async function(){ sKapat(); var op=i.getAttribute("data-o");
        if(op==="ayr") return ayrinti(sb,r.tur,r.no);
        if(op==="normal"){ if(!confirm(lbl+" · "+r.proje+"\n\nNormal takibe alınsın mı?")) return;
          var x=await sb.rpc("my_durum_yaz",{p_tur:r.tur,p_no:r.no,p_durum:"Normal",p_kisi:kisiKod(KD),p_proje:r.proje||null});
          if(x.error){ alert("Kaydedilemedi: "+x.error.message); return; } return acilBlok(el,o); }
        if(op==="acil") return dAcilPencere(sb,r,kisiKod(KD),function(){ acilBlok(el,o); });
      }; });
    };
    /* MY-KESIN-BANT (06.11.2026, Melih): Kesinleşenler grubu açılır bant, kapalı başlar; durum yenilemelerde korunur (el._ksAcik) */
    el.querySelectorAll("tr.my-tbbas").forEach(function(g){ g.addEventListener("click",function(){ el._tbAcik=!el._tbAcik; var t=g.closest("table"); if(t) t.classList.toggle("tb-kapali",!el._tbAcik); var o=g.querySelector(".my-ok"); if(o) o.textContent=el._tbAcik?"▾":"▸"; }); }); /* MY-TERMIN-BANT */
    el.querySelectorAll("tr.my-ksbas").forEach(function(g){ g.addEventListener("click",function(){ el._ksAcik=!el._ksAcik; var t=g.closest("table"); if(t) t.classList.toggle("ks-kapali",!el._ksAcik); var o=g.querySelector(".my-ok"); if(o) o.textContent=el._ksAcik?"▾":"▸"; }); });
    el.querySelectorAll("tr[data-tur]").forEach(function(tr){
      tr.addEventListener("contextmenu",function(ev){ ev.preventDefault(); aMenu(ev,tr); }); /* MY-DURUM-MK-OE */
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
    el.querySelectorAll("td.my-acked").forEach(function(td){ /* MY-ACK-HUCRE (10.11.2026, Melih): Aciklama hucresine tikla -> bos satir, Enter/odak kaybi -> eklenir, Esc -> vazgec */
      td.style.cursor="text";
      td.addEventListener("click",function(ev){
        ev.stopPropagation(); if(td.querySelector("input")) return;
        var tr=td.closest("tr"), eski=td.innerHTML, bitti=false;
        td.innerHTML='<input class="my-ack" style="width:100%;box-sizing:border-box" placeholder="Yazıp Enter\'a basın">';
        var inp=td.querySelector("input"); inp.focus();
        var geri=function(){ bitti=true; td.innerHTML=eski; };
        var kaydet=async function(){
          if(bitti) return; var t=inp.value.trim(); if(!t){ geri(); return; }
          bitti=true; inp.disabled=true;
          var r=await sb.rpc("my_aciklama_ekle",{p_tur:tr.getAttribute("data-tur"),p_no:tr.getAttribute("data-no"),p_metin:t});
          if(r.error){ bitti=false; inp.disabled=false; alert("Eklenemedi: "+r.error.message); return; }
          acilBlok(el,o);
        };
        inp.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); kaydet(); } else if(e.key==="Escape"){ geri(); } });
        inp.addEventListener("blur",function(){ kaydet(); });
        inp.addEventListener("dblclick",function(e){ e.stopPropagation(); });
        inp.addEventListener("contextmenu",function(e){ e.stopPropagation(); });
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
    if(o.sonra) try{ o.sonra(el); }catch(e){} /* GIRIS-ACIL-SAHSI */
  }
  function dAcilPencere(sb,r,k,sonra){ /* MY-DURUM-MK-OE: dogrudan Acile cevir (MK/OE/MB) */
    sStil(); var m=document.createElement("div"); m.className="my-modal";
    var hd=r.tarih?String(r.tarih).slice(0,10):"";
    m.innerHTML='<div class="box" style="max-width:460px"><button class="x" title="Kapat">×</button>'
      +'<h4>Acile çevir · '+esc(r.tur==="PEM"?"PEM "+r.kod:r.kod)+'</h4><div class="mut" style="margin-bottom:10px">'+esc(r.proje)+'</div>'
      +'<label class="mys-fl">Açıklama<textarea id="da_ac" rows="3"></textarea></label>'
      +'<label class="mys-fl">Hedef Yükleme Tarihi<input id="da_hd" type="date" value="'+esc(hd)+'"></label>'
      +'<label class="mys-fl">Yükleme Şekli<select id="da_sk"><option selected>Kamyon</option><option>Uçak</option></select></label>'
      +'<div class="mut" style="font-size:11.5px;margin:4px 0 10px">Satır hemen acil takibe alınır; OE\'ye ve MB\'ye bildirim gider.</div>'
      +'<div style="display:flex;gap:8px;justify-content:flex-end"><button class="mys-btn sec" id="da_vz">Vazgeç</button><button class="mys-btn" id="da_ok">Acile çevir</button></div></div>';
    document.body.appendChild(m);
    var kapat=function(){ m.remove(); };
    m.addEventListener("click",function(e){ if(e.target===m||e.target.classList.contains("x")) kapat(); });
    m.querySelector("#da_vz").onclick=kapat;
    m.querySelector("#da_ok").onclick=async function(){
      var hedef=m.querySelector("#da_hd").value, sekil=m.querySelector("#da_sk").value, ac=m.querySelector("#da_ac").value.trim();
      if(!hedef){ alert("Hedef yükleme tarihini giriniz."); return; }
      var g=new Date().toLocaleDateString("tr-TR",{timeZone:"Europe/Istanbul",day:"2-digit",month:"2-digit",year:"2-digit"}).replace(/\./g,"/");
      var b=m.querySelector("#da_ok"); b.disabled=true; b.textContent="Kaydediliyor…";
      var x=await sb.rpc("my_durum_yaz",{p_tur:r.tur,p_no:r.no,p_durum:"Acil",p_hedef:hedef,p_sekil:sekil,p_aciklama:ac?(k+" "+g+": "+ac):null,p_kisi:k,p_proje:r.proje||null});
      if(x.error){ b.disabled=false; b.textContent="Acile çevir"; alert("Kaydedilemedi: "+x.error.message); return; }
      kapat();
      try{ await sb.functions.invoke("my-takip",{body:{islem:"acil",tur:r.tur,no:r.no,proje:r.proje}}); }catch(e){}
      if(sonra) sonra();
    };
    setTimeout(function(){ var t=m.querySelector("#da_ac"); if(t) t.focus(); },50);
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
     +"table.mys tr.grp td{background:#f3f7fb;color:#16324f;font-weight:700;font-size:12px;padding:5px 7px;cursor:default}table.mys .gh{font-weight:400;color:#5a6b7d;font-size:11px}" /* SANTIYE-TEK-SERIT */
     +".mys-q{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#dbe7f3;color:#16324f;font-size:11px;font-weight:700;cursor:help;position:relative;vertical-align:1px;margin-left:5px;outline:none}"
     +".mys-q:hover::after,.mys-q:focus::after{content:attr(data-tip);position:absolute;left:22px;top:-6px;z-index:60;width:360px;background:#16324f;color:#fff;font-weight:400;font-size:11.5px;line-height:1.45;padding:7px 10px;border-radius:6px;white-space:normal;box-shadow:0 4px 14px rgba(0,0,0,.2)}" /* SANTIYE-SORU-IKON */
     +".mys-msg{font-size:12.5px;font-weight:600;min-height:16px;margin:4px 0}.mys-msg.ok{color:#2e7d54}.mys-msg.err{color:#b40000}";
    document.head.appendChild(s);
  }
  /* SANTIYE-TEK-SERIT (24.11.2026, Melih): şantiye formlarında PEM, proje ve ofis tabloları aynı 10 sütun genişliği —
     PEM · Talep/Müşteri Onay · Proje Adı · Yükleme Şekli · Ek Bilgi · Adet · Termin/AÜP · Hedef/Şantiyede İstenen · Açıklama (2 kat) · Takip */
  var SW=[64,72,133,64,210,44,72,110,460,280];
  /* YI-GENISLIK (26.11.2026, Melih): Yurt İçi şantiye formunda Proje Adı ~%10 dar (133→120, proje tablosunda 3 sütunluk alan 407→366; Ek Bilgi 210→182), Şantiyede İstenen %40 geniş (110→154) */
  if(/\/santiye-yi\//.test(location.pathname)){ SW[2]=120; SW[4]=182; SW[7]=154; }
  function swCol(){ return '<colgroup>'+SW.map(function(x){ return '<col style="width:'+x+'px">'; }).join('')+'</colgroup>'; }
  function swTop(){ return SW.reduce(function(a,x){return a+x;},0); }
  /* SANTIYE-SORU-IKON (24.11.2026, Melih): blok açıklamaları formun başlığındaki "?" (arb-hlp) penceresine taşınır */
  function hlpEkle(id,txt){ var n=0; (function f(){ var p=document.querySelector(".arb-hlp-pop"); if(!p){ if(n++<40) setTimeout(f,250); return; }
    if(document.getElementById(id)) return; var d=document.createElement("div"); d.id=id; d.className="sub"; d.textContent=txt; p.appendChild(d); })(); }
  function sKapat(){ var m=document.getElementById("mys-ctx"); if(m) m.remove(); }
  /* PEM-OFIS-MY (10.11.2026, Melih): ofis stoğu PEM'lerinin tek sorumlusu MY — tüm şantiye formlarında sayfanın en altında ortak, salt-okur tablo */
  function ofisBlok(R){
    var el=document.getElementById("my-ofis");
    if(!el){ var w=document.querySelector(".wrap")||document.body; el=document.createElement("div"); el.id="my-ofis"; w.appendChild(el); }
    if(!R.length){ el.innerHTML=""; return; }
    hlpEkle("hlp-ofis","Ofis Stoğu PEM'leri: Ofis stoklarının sorumlusu MY'dir; bu tablo tüm şantiye formlarında ortaktır ve bilgi içindir.");
    /* SANTIYE-TEK-SERIT (24.11.2026, Melih): ofis bloğu üstteki PEM tablosuyla aynı sütunlar; açıklama metni "?" içinde */
    /* SANTIYE-ALT-BANT (24.11.2026, Melih): açılır bant (kapalı başlar; yeniden çizimde açık/kapalı korunur) — CSS details.sbant şantiye şablonunda */
    var ofAcik=!!el.querySelector("details[open]");
    el.innerHTML='<details class="mysan sbant"'+(ofAcik?' open':'')+'><summary><h3>Ofis Stoğu PEM\'leri <span style="font-weight:400;font-size:12px;color:#5a6b7d">('+R.length+')</span></h3></summary>'
      +'<div class="myw"><table class="mys fx" style="width:'+swTop()+'px">'+swCol()
      +'<thead><tr><th>PEM</th><th class="sm">Talep<br>Tarihi</th><th>Proje Adı</th><th class="sm">Yükleme<br>Şekli</th><th>Ek Bilgi</th><th>Adet</th><th class="sm">Termin<br>Tarihi</th><th class="ek sm">Hedef<br>Yükleme Tarihi</th><th class="ek">Sevk Durumu</th><th class="ek sm">Takip<br>Durumu</th></tr></thead><tbody>'
      +R.map(function(r){ var ac=r.durum==="Acil";
        return '<tr class="'+(ac?'acil':'')+'" style="cursor:default"><td title="'+esc(r.no+(r.durum_erp?' · '+r.durum_erp:''))+'">'+esc(r.kod)+'</td><td>'+fd(r.talep_tarihi)+'</td>'
          +'<td class="w" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td><td>'+sekilHtml(r)+'</td><td class="w" title="'+esc(r.ekbilgi)+'">'+esc(r.ekbilgi)+'</td><td class="n">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td>'
          +'<td>'+(ac?fd(r.hedef):'')+'</td><td class="w" title="'+esc(r.sevk_durumu)+'">'+esc(r.sevk_durumu)+'</td><td class="dur '+(ac?'acil':'')+'">'+esc(r.durum||"Normal")+'</td></tr>';
      }).join("")+'</tbody></table></div></details>';
  }
  async function santiyeBlok(el,o){
    if(!el) return; o=o||{}; stil(); sStil();
    var sb=o.sb, kod=o.kod, d;
    try{ var r0=await sb.rpc("my_santiye_liste",{p_kod:kod}); if(r0.error) throw r0.error; d=r0.data||{rows:[]}; }catch(e){ el.innerHTML=""; return; }
    var rows=d.rows||[];
    ofisBlok(kod==="yi"?[]:(d.ofis||[])); /* PEM-OFIS-MY · PEM-OFIS-YI-YOK (18.11.2026): Yurt İçi şantiye formunda ofis stoğu PEM'leri gösterilmez */
    if(!rows.length){ el.innerHTML=""; return; }
    /* SANTIYE-BLOK-BASLIK (19.11.2026, Melih): MY Faaliyet ile aynı başlıklar ve sıra; PEM ERP durumuna göre ikiye ayrılır */
    var pno=function(r){ var m=/^\s*(\d+(?:[.,]\d+)?)/.exec(String(r.durum_erp||"")); return m?parseFloat(m[1].replace(",",".")):0; };
    var B=[["pem","Sevke Hazır PEM'ler",true,function(r){ return pno(r)>=3; }],["pem","Üretimdeki PEM'ler",true,function(r){ return pno(r)<3; }],["sevk","Sevke Hazır Projeler · Durum 8 / 8.1",false],["prj","Üretimdeki Projeler · Durum 4.1 – 7.1",false]];
    /* SANTIYE-TEK-SERIT (24.11.2026, Melih): tüm PEM'ler tek başlıklı tabloda, Sevke Hazır / Üretimdeki grup satırı; Yükleme Şekli Ek Bilgi'nin solunda;
       Açıklama 2 kat genişlik; projeler (formda olmayanlar) aynı sütunlarda — Proje No · Müşteri Onay Tarihi · Proje Adı (Şekil+Ek Bilgi genişliği dahil) */
    var on={}, pn=rows.filter(function(r){ return r.tur==="PRJ"; }).map(function(r){ return r.no; });
    if(pn.length){ try{ var ro=await sb.rpc("santiye_onay_tarihi",{p_nolar:pn}); (ro.data||[]).forEach(function(x){ on[x.proje_no]=x.onay; }); }catch(e){} } /* PRJ-ONAY-TARIHI */
    var ek='<th class="ek sm">Hedef<br>Yükleme Tarihi</th><th class="ek">Açıklama</th><th class="ek sm">Takip<br>Durumu</th>';
    var HP='<th>PEM</th><th class="sm">Talep<br>Tarihi</th><th>Proje Adı</th><th class="sm">Yükleme<br>Şekli</th><th>Ek Bilgi</th><th>Adet</th><th class="sm">Termin<br>Tarihi</th>'+ek;
    var HJ='<th>Proje No</th><th class="sm">Proje<br>Onay Tarihi</th>'/* PRJ-ONAY-BASLIK (24.11.2026, Melih) */+'<th colspan="3">Proje Adı</th><th>Adet</th><th class="sm">AÜP</th>'+ek;
    var satir=function(r,gi){
      var ac=r.durum==="Acil", pem=r.tur==="PEM";
      var ilk=pem
        ? '<td title="'+esc(r.no+(r.durum_erp?' · '+r.durum_erp:''))+'">'+esc(r.kod)+'</td><td>'+fd(r.talep_tarihi)+'</td><td class="w" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td><td>'+sekilHtml(r)+'</td><td class="w" title="'+esc(r.ekbilgi)+'">'+esc(r.ekbilgi)+'</td><td class="n">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td>'
        : '<td title="'+esc(r.no)+'">'+esc(r.kod)+'</td><td>'+fd(on[r.no]||"")+'</td><td class="w" colspan="3" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td><td class="n">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td>';
      var dur=esc(r.durum||"Normal")+(r.talep?' <span class="bek" title="MY onayı bekleniyor">→ '+esc(r.talep)+' (MY onayı bekliyor)</span>':'');
      return '<tr class="'+(ac?'acil':'')+'" data-g="'+gi+'" data-tur="'+esc(r.tur)+'" data-no="'+esc(r.no)+'">'+ilk
        +'<td>'+(ac?fd(r.hedef):'')+'</td><td class="w" title="'+esc(r.aciklama)+'">'+(ac?esc(r.aciklama):'')+'</td>'
        +'<td class="dur '+(ac?'acil':'')+'" title="'+esc(String(r.durum||'Normal')+(r.talep?' → '+r.talep+' (MY onayı bekliyor)':''))+'">'+dur+'</td></tr>';
    };
    hlpEkle("hlp-mys","Projeleriniz ve PEM'leriniz: Satıra sağ tıklayarak acil ya da normal takibe alma talebinde bulunabilir, ayrıntıları görebilirsiniz. Talepler MY onayından sonra geçerli olur.");
    var tablo=function(head,bl){
      var body=bl.map(function(b){ var gi=B.indexOf(b); var R=rows.filter(function(r){ return r.blok===b[0]&&(!b[3]||b[3](r)); }); if(!R.length) return "";
        return '<tr class="grp" data-gb="'+gi+'"><td colspan="10">'+esc(b[1])+' <span class="gh">· Sağ tıklayarak acile çevir</span></td></tr>'+R.map(function(r){ return satir(r,gi); }).join(""); }).join("");
      return body?'<div class="myw" style="margin-top:6px"><table class="mys fx" style="width:'+swTop()+'px">'+swCol()+'<thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>':'';
    };
    var h='<div class="mysan"><h3>Projeleriniz ve PEM\'leriniz</h3><div class="mys-msg" id="mys-msg"></div>'
      +tablo(HP,[B[0],B[1]])+tablo(HJ,[B[2],B[3]])+'</div>';
    el.innerHTML=h;
    var bul=function(tr){ var t=tr.getAttribute("data-tur"), n=tr.getAttribute("data-no"); return rows.filter(function(r){ return r.tur===t&&r.no===n; })[0]; };
    var msg=function(t,ok){ var m=el.querySelector("#mys-msg"); if(!m) return; m.className="mys-msg "+(ok?"ok":"err"); m.textContent=t; };
    /* SANTIYE-BIRLESIK (19.11.2026, Melih): şantiye formunun kendi proje tablolarındaki (PST / Yükleme Planı) projeler burada tekrar gösterilmez;
       o tablolara Takip Durumu ve aynı sağ tık menüsü eklenir (sBirlestir, form render sonrası da çağrılır) */
    S.el=el; S.rows=rows; S.sb=sb; S.yenile=function(){ santiyeBlok(el,o); }; S.msg=msg;
    el.querySelectorAll("tr[data-tur]").forEach(function(tr){
      tr.addEventListener("contextmenu",function(ev){ ev.preventDefault(); var r=bul(tr); if(r) sMenu(ev,r); });
    });
    sBirlestir();
  }
  var S={};
  function sMenu(ev,r){
        var sb=S.sb, msg=S.msg, yen=S.yenile; sKapat();
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
          if(op==="acil") return sAcilPencere(sb,r,yen,msg);
          if(op==="normal"){ if(!confirm(lbl+" · "+r.proje+"\n\nNormal takibe alma talebi MY'ye gönderilsin mi?")) return; sTalep(sb,r,"Normal",{},yen,msg); }
        }; });
  }
  function sBirlestir(){
    var el=S.el; if(!el||!S.rows) return;
    if(!document.getElementById("mysb-css")){ var st=document.createElement("style"); st.id="mysb-css"; st.textContent="td.mytakip.acil{color:#c62828;font-weight:700}td.mytakip .bek{color:#9aa5b1;font-weight:400}#bloklar tr[data-pno],#ileri tr[data-pno]{cursor:context-menu}"; document.head.appendChild(st); }
    var set={};
    document.querySelectorAll("#bloklar tr[data-pno], #ileri tr[data-pno]") /* SANTIYE-BIRLESIK2 */.forEach(function(tr){
      var no=tr.getAttribute("data-pno"), r=S.rows.filter(function(x){ return x.tur==="PRJ"&&x.no===no; })[0];
      var td=tr.querySelector("td.mytakip");
      if(!r){ if(td) td.textContent=""; return; }
      set[no]=1;
      if(td){ var ac=r.durum==="Acil"; td.className="c mytakip"+(ac?" acil":"");
        td.innerHTML=esc(r.durum||"Normal")+(ac&&r.hedef?' · '+fd(r.hedef):'')+(r.talep?' <span class="bek">→ '+esc(r.talep)+' (MY onayı bekliyor)</span>':''); }
      if(!tr._myctx){ tr._myctx=1; tr.addEventListener("contextmenu",function(ev){ if(ev.target.closest&&ev.target.closest("input,textarea")) return; ev.preventDefault();
        var rr=S.rows.filter(function(x){ return x.tur==="PRJ"&&x.no===no; })[0]; if(rr) sMenu(ev,rr); }); }
    });
    el.querySelectorAll('tr[data-tur="PRJ"]').forEach(function(tr){ tr.style.display=set[tr.getAttribute("data-no")]?"none":""; });
    el.querySelectorAll(".myw").forEach(function(w){ var vis=[].some.call(w.querySelectorAll("tbody tr[data-tur]"),function(t){ return t.style.display!=="none"; });
      w.style.display=vis?"":"none"; var h=w.previousElementSibling; if(h&&h.tagName==="H4") h.style.display=vis?"":"none";
      w.querySelectorAll("tr.grp[data-gb]").forEach(function(g){ var gb=g.getAttribute("data-gb"); g.style.display=[].some.call(w.querySelectorAll('tr[data-g="'+gb+'"]'),function(t){ return t.style.display!=="none"; })?"":"none"; }); }); /* SANTIYE-TEK-SERIT */
    var kalan=[].some.call(el.querySelectorAll(".myw"),function(w){ return w.style.display!=="none"; }); var k=el.firstChild; if(k){ [].forEach.call(k.querySelectorAll(":scope>h3,:scope>.alt"),function(x){ x.style.display=kalan?"":"none"; }); k.style.border=kalan?"":"0"; k.style.padding=kalan?"":"0"; k.style.background=kalan?"":"none"; } /* mesaj kutusu görünür kalır */
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
      +'<label class="mys-fl">Şantiyede İstenen Tarih<input id="ms_hd" type="date" value="" min="'+bugunIso()+'"></label>' /* SANTIYE-ISTENEN-B (20.11.2026, Melih): hedef = istenen − nakliye süresi (rpc nakliye_hedef) */
      +'<label class="mys-fl">Yükleme Şekli<select id="ms_sk"><option selected>Kamyon</option><option>Uçak</option></select></label>'
      +'<div class="mut" style="font-size:11.5px;margin:4px 0 10px">Talep MY onayına gönderilir; onaylanınca satır acil takibe alınır.</div>'
      +'<div style="display:flex;gap:8px;justify-content:flex-end"><button class="mys-btn sec" id="ms_vz">Vazgeç</button><button class="mys-btn" id="ms_ok">Talebi gönder</button></div></div>';
    document.body.appendChild(m);
    var kapat=function(){ m.remove(); };
    m.addEventListener("click",function(e){ if(e.target===m||e.target.classList.contains("x")) kapat(); });
    m.querySelector("#ms_vz").onclick=kapat;
    m.querySelector("#ms_ok").onclick=async function(){
      var ist=m.querySelector("#ms_hd").value, sekil=m.querySelector("#ms_sk").value, aciklama=m.querySelector("#ms_ac").value.trim();
      if(!ist){ alert("Şantiyede istenen tarihi giriniz."); return; }
      if(ist<bugunIso()){ alert("Şantiyede istenen tarih bugünden önce olamaz."); return; } /* ISTENEN-GECMIS-YASAK */
      var b=m.querySelector("#ms_ok"); b.disabled=true; b.textContent="Gönderiliyor…";
      var nh=await sb.rpc("nakliye_hedef",{p_istenen:ist,p_no:r.no,p_form:(typeof FORM_KODU!=="undefined"?FORM_KODU:null)});
      if(nh.error||!nh.data){ b.disabled=false; b.textContent="Talebi gönder"; alert("Hedef yükleme hesaplanamadı: "+((nh.error&&nh.error.message)||"")); return; }
      var hedef=String(nh.data).slice(0,10); aciklama=(aciklama?aciklama+" · ":"")+"Şantiyede istenen: "+fd(ist);
      var ok=await sTalep(sb,r,"Acil",{hedef:hedef,sekil:sekil,aciklama:aciklama},sonra,msg);
      if(ok) kapat(); else { b.disabled=false; b.textContent="Talebi gönder"; }
    };
    setTimeout(function(){ var t=m.querySelector("#ms_ac"); if(t) t.focus(); },50);
  }
  document.addEventListener("click",function(e){ if(!e.target.closest||!e.target.closest("#mys-ctx")) sKapat(); });
  document.addEventListener("keydown",function(e){ if(e.key==="Escape") sKapat(); });

  /* MK-SEVK-PRJ (19.11.2026, Melih): MK Faaliyet'te Acil Yüklemeler'in üstünde yurt dışı Sevke Hazır Projeler (durum 8 / 8.1).
     Hedef Yükleme Tarihi: acil satırda acil hedefi, değilse plan_hedef (rpc my_plan_yaz); boşsa kırmızı zemin "Tarih gir" — tıklayınca tarih kutusu. */
  async function sevkPrjBlok(el,o){
    if(!el) return; stil(); var sb=o.sb, d;
    try{ d=await liste(sb); }catch(e){ el.innerHTML='<div class="myab"><h3>SEVKE HAZIR PROJELER</h3><div style="color:#b40000">Okunamadı: '+esc(e.message||e)+'</div></div>'; return; }
    var R=(d.rows||[]).filter(function(r){ return r.blok==="sevk"&&r.durum!=="Acil"; }); /* MK-TEKIL: acil olanlar yalnız Acil Yüklemeler tablosunda */
    if(!R.length){ el.innerHTML=""; return; }
    if(!document.getElementById("mksp-css")){ var st=document.createElement("style"); st.id="mksp-css"; st.textContent="td.mksp-tg{background:#c62828!important;color:#fff!important;font-weight:700;cursor:pointer;text-align:center}td[data-mksp]{cursor:pointer}"; document.head.appendChild(st); }
    var eksik=R.filter(function(r){ return !(r.durum==="Acil"&&r.hedef)&&!r.plan; }).length;
    el.innerHTML='<div class="myab"><h3>SEVKE HAZIR PROJELER <span style="font-weight:400;font-size:12px;color:#5a6b7d">· Durum 8 / 8.1'+(eksik?' · '+eksik+' satırda hedef yükleme tarihi girilmedi':'')+'</span></h3><div class="myw"><table class="mya"><thead><tr>'
      +'<th>Durum</th><th>No</th><th>Proje Adı</th><th>Adet</th><th>AÜP</th><th>Hedef<br>Yükleme Tarihi</th><th>Kesinleşen<br>Yükleme Tarihi</th><th>Takip<br>Durumu</th></tr></thead><tbody>'
      +R.map(function(r){ var ac=r.durum==="Acil"&&r.hedef;
        var hd=ac?'<td><b>'+fd(r.hedef)+'</b></td>':(r.plan?'<td data-mksp="1" title="Hedef yükleme tarihini değiştir">'+fd(r.plan)+'</td>':'<td class="mksp-tg" data-mksp="1">Tarih gir</td>');
        return '<tr class="my-ks" data-no="'+esc(r.no)+'"><td class="w" style="max-width:24ch" title="'+esc(r.durum_erp)+'">'+esc(r.durum_erp)+'</td><td title="'+esc(r.no)+'">'+esc(r.kod)+'</td><td class="w" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td><td style="text-align:right">'+esc(r.adet)+'</td><td>'+fd(r.tarih)+'</td>'
          +hd+'<td>'+(r.kesin?'<b>'+fd(r.kesin)+'</b>':'')+'</td><td'+(r.durum==="Acil"?' style="color:#c62828;font-weight:700"':'')+'>'+esc(r.durum||"Normal")+'</td></tr>'; }).join("")
      +'</tbody></table></div></div>';
    el.querySelectorAll("td[data-mksp]").forEach(function(td){ td.addEventListener("click",function(){
      if(td.querySelector("input")) return; var no=td.parentNode.getAttribute("data-no"), r=R.filter(function(x){ return x.no===no; })[0]; if(!r) return;
      var es=td.innerHTML, cl=td.className, bitti=false; td.className=""; td.innerHTML='<input type="date" value="'+esc(r.plan?String(r.plan).slice(0,10):"")+'" style="font:inherit;font-size:12px">';
      var i=td.querySelector("input"); i.focus(); try{ if(i.showPicker) i.showPicker(); }catch(e){}
      var geri=function(){ if(bitti) return; bitti=true; td.className=cl; td.innerHTML=es; };
      i.addEventListener("keydown",function(e){ if(e.key==="Escape"){ e.preventDefault(); geri(); } });
      i.addEventListener("blur",function(){ setTimeout(geri,150); });
      i.addEventListener("change",async function(){ if(bitti) return; bitti=true;
        var x=await sb.rpc("my_plan_yaz",{p_tur:"PRJ",p_no:r.no,p_tarih:i.value||null,p_proje:r.proje||null});
        if(x.error){ alert("Kaydedilemedi: "+x.error.message); td.className=cl; td.innerHTML=es; return; }
        sevkPrjBlok(el,o); });
    }); });
  }

  /* PEM-GECMIS-SEBEP (26.11.2026, Melih): hedef yükleme tarihi geçmiş PEM'de yeni şantiyede istenen tarih + sebep (zorunlu) penceresi;
     rpc my_plan_yaz p_sebep (sunucu da sebepsiz değişikliği reddeder). Yurt İçi şantiye formu ve MY Faaliyet ortak. */
  function bugunIso(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function gecmisPencere(sb,r,sonra){ stil();
    var m=document.createElement("div"); m.className="my-modal";
    m.innerHTML='<div class="box" style="max-width:460px"><button class="x" title="Kapat">×</button>'
      +'<h4>Şantiyede istenen tarihi geçmiş · PEM '+esc(r.kod)+'</h4><div class="mut" style="margin-bottom:10px">'+esc(r.proje)+'</div>'
      +'<div style="font-size:12px;margin-bottom:10px">'+(r.istenen?'Şantiyede istenen: <b style="color:#c62828">'+fd(r.istenen)+'</b> · ':'')+'Hedef yükleme: <b>'+fd(r.plan)+'</b></div>'
      +'<label class="mys-fl">Şantiyede İstenen Yeni Tarih<input id="mg_ist" type="date" min="'+bugunIso()+'"></label>'
      +'<label class="mys-fl">Değişikliğin sebebi (zorunlu)<textarea id="mg_sb" rows="3"></textarea></label>'
      +'<div class="mut" style="font-size:11.5px;margin:4px 0 10px">Hedef yükleme tarihi, şantiyede istenen tarihten nakliye süresi düşülerek hesaplanır.</div>'
      +'<div style="display:flex;gap:8px;justify-content:flex-end"><button class="mys-btn sec" id="mg_vz">Vazgeç</button><button class="mys-btn" id="mg_ok">Kaydet</button></div></div>';
    document.body.appendChild(m);
    var kapat=function(){ m.remove(); };
    m.addEventListener("click",function(e){ if(e.target===m||e.target.classList.contains("x")) kapat(); });
    m.querySelector("#mg_vz").onclick=kapat;
    m.querySelector("#mg_ok").onclick=async function(){
      var ist=m.querySelector("#mg_ist").value, sb2=m.querySelector("#mg_sb").value.trim();
      if(!ist){ alert("Şantiyede istenen yeni tarihi giriniz."); return; }
      if(ist<bugunIso()){ alert("Şantiyede istenen tarih bugünden önce olamaz."); return; }
      if(!sb2){ m.querySelector("#mg_sb").focus(); alert("Tarih değişikliğinin sebebini yazınız."); return; }
      var b=m.querySelector("#mg_ok"); b.disabled=true; b.textContent="Kaydediliyor…";
      var x=await sb.rpc("my_plan_yaz",{p_tur:r.tur||"PEM",p_no:r.no,p_tarih:null,p_proje:r.proje||null,p_istenen:ist,p_sebep:sb2});
      if(x.error){ b.disabled=false; b.textContent="Kaydet"; alert("Kaydedilemedi: "+x.error.message); return; }
      kapat(); if(sonra) sonra(x.data);
    };
    setTimeout(function(){ var t=m.querySelector("#mg_ist"); if(t) t.focus(); },50);
  }
  /* YI-SEVK-PEM (19.11.2026, Melih): Yurt İçi şantiye formunda yurt içi Sevke Hazır PEM'ler (rpc yi_sevk_pem_liste);
     Hedef Yükleme Tarihi = my_takip.plan_hedef (rpc my_plan_yaz, EB); boşsa kırmızı zemin "Tarih gir". */
  async function yiSevkPemBlok /* YI-SON2-DAR (26.11.2026, Melih): Termin GG.AA (tam tarih hover) dar dolgu, Şantiyede İstenen 258→129px · YI-GENIS2 (26.11.2026, Melih): Ek Bilgi 47→71ch (%50), Şantiyede İstenen 112→258px (%130) · YI-EKBILGI-GENIS (26.11.2026): Ek Bilgi 26→47ch (%80) · YI-ISTENEN-ORTA (26.11.2026, Melih): Şantiyede İstenen başlığı ve hücreleri ortalı · YI-EKBILGI-DAR: Ek Bilgi 46→26ch, tam metin hover'da */(el,o){
    if(!el) return; stil(); var sb=o.sb, R;
    try{ var x0=await sb.rpc("yi_sevk_pem_liste"); if(x0.error) throw x0.error; R=x0.data||[]; }catch(e){ el.innerHTML=""; return; }
    if(!R.length){ el.innerHTML=""; return; }
    if(!document.getElementById("mksp-css")){ var st=document.createElement("style"); st.id="mksp-css"; st.textContent="td.mksp-tg{background:#c62828!important;color:#fff!important;font-weight:700;cursor:pointer;text-align:center}td[data-mksp]{cursor:pointer}"; document.head.appendChild(st); }
    var bg=bugunIso(), gec=function(r){ var t=r.istenen||r.plan; return !(r.durum==="Acil"&&r.hedef)&&t&&String(t).slice(0,10)<bg; }; /* PEM-GECMIS-SEBEP · PEM-GECMIS-ISTENEN: şantiyede istenen (yoksa hedef) geçti */
    var tarihli=function(r){ return (r.durum==="Acil"&&r.hedef)||r.istenen; }; /* SANTIYE-ISTENEN-B: EB şantiyede istenen tarihi girer, hedef = istenen − nakliye (my_plan_yaz p_istenen) */
    var eksik=R.filter(function(r){ return !tarihli(r); }).length;
    el.innerHTML='<div class="myab" style="margin-bottom:14px"><h3>SEVKE HAZIR PEM\'LER <span style="font-weight:400;font-size:12px;color:#5a6b7d">· Yurt içi'+(eksik?' · '+eksik+' satırda şantiyede istenen tarih girilmedi':'')+'</span></h3><div class="myw"><table class="mya"><thead><tr>'
      +'<th>PEM</th><th>Talep<br>Tarihi</th><th>Proje Adı</th><th>Ek Bilgi</th><th>Adet</th><th style="padding-left:3px;padding-right:3px;text-align:center">Termin<br>Tarihi</th><th style="min-width:129px;text-align:center">Şantiyede<br>İstenen Tarih</th></tr></thead><tbody>'
      +R.map(function(r){ var ac=r.durum==="Acil"&&r.hedef;
        var hd=ac?'<td style="text-align:center" title="Acil hedef yükleme tarihi"><b>'+fd(r.hedef)+'</b></td>':(gec(r)?'<td data-mksp="1" data-gec="1" style="text-align:center;color:#c62828;font-weight:700" title="Şantiyede istenen tarih ('+fd(r.istenen||r.plan)+') geçti, yükleme yapılmadı — tıklayıp şantiyede istenen yeni tarihi ve sebebini girin">'+(r.istenen?fd(r.istenen):fd(r.plan))+'</td>'
          :r.istenen?'<td data-mksp="1" style="text-align:center" title="Şantiyede istenen tarihi değiştir · Hedef yükleme '+fd(r.plan)+'">'+fd(r.istenen)+'</td>':'<td class="mksp-tg" data-mksp="1" style="text-align:center">Tarih gir</td>');
        return '<tr class="my-ks" data-no="'+esc(r.no)+'"><td title="'+esc(r.no+' · '+(r.durum_erp||''))+'">'+esc(r.kod)+'</td><td>'+fd(r.talep_tarihi)+'</td><td class="w" style="max-width:29ch" title="'+esc(r.proje)+'">'+esc(r.proje)+'</td><td class="w" style="max-width:71ch" title="'+esc(r.ekbilgi)+'">'+esc(r.ekbilgi)+'</td><td style="text-align:right">'+esc(r.adet)+'</td><td style="padding-left:3px;padding-right:3px;text-align:center" title="'+fd(r.tarih)+'">'+String(fd(r.tarih)).slice(0,5)+'</td>'+hd+'</tr>'; }).join("")
      +'</tbody></table></div></div>';
    el.querySelectorAll("td[data-mksp]").forEach(function(td){ td.addEventListener("click",function(){
      if(td.querySelector("input")) return; var no=td.parentNode.getAttribute("data-no"), r=R.filter(function(x){ return x.no===no; })[0]; if(!r) return;
      if(td.getAttribute("data-gec")){ gecmisPencere(sb,r,function(){ yiSevkPemBlok(el,o); }); return; } /* PEM-GECMIS-SEBEP */
      var es=td.innerHTML, cl=td.className, bitti=false; td.className=""; td.innerHTML='<input type="date" min="'+bugunIso()+'" value="'+esc(r.istenen?String(r.istenen).slice(0,10):"")+'" style="font:inherit;font-size:12px">';
      var i=td.querySelector("input"); i.focus(); try{ if(i.showPicker) i.showPicker(); }catch(e){}
      var geri=function(){ if(bitti) return; bitti=true; td.className=cl; td.innerHTML=es; };
      i.addEventListener("keydown",function(e){ if(e.key==="Escape"){ e.preventDefault(); geri(); } });
      i.addEventListener("blur",function(){ setTimeout(geri,150); });
      i.addEventListener("change",async function(){ if(bitti) return; bitti=true;
        if(i.value && i.value<bugunIso()){ alert("Şantiyede istenen tarih bugünden önce olamaz."); td.className=cl; td.innerHTML=es; return; } /* ISTENEN-GECMIS-YASAK */
        var x=await sb.rpc("my_plan_yaz",{p_tur:"PEM",p_no:r.no,p_tarih:null,p_proje:r.proje||null,p_istenen:i.value||null});
        if(x.error){ alert("Kaydedilemedi: "+x.error.message); td.className=cl; td.innerHTML=es; return; }
        yiSevkPemBlok(el,o); });
    }); });
  }
  window.MYACIL={liste:liste,acilBlok:acilBlok,santiyeBlok:santiyeBlok,ayrinti:ayrinti,fd:fd,esc:esc,stil:stil,sevkPrjBlok:sevkPrjBlok,santiyeBirlestir:sBirlestir,SW:SW,yiSevkPemBlok:yiSevkPemBlok /* METIN-ISTENEN-YENI */,gecmisPencere:gecmisPencere,bugunIso:bugunIso};
  /* Formlarda otomatik çizim */
  var t0=Date.now();
  async function oto(){
    var el=document.getElementById("my-acil"), es=document.getElementById("my-santiye"), sp=document.getElementById("mk-sevk-prj"); if(!el&&!es&&!sp) return;
    var cli=(typeof ARB_ACTIVE!=="undefined")?ARB_ACTIVE:null;
    if(!cli||document.getElementById("arb-gate")){ if(Date.now()-t0<60000) setTimeout(oto,700); return; }
    var s=null; try{ s=await cli.auth.getSession(); }catch(e){}
    if(!(s&&s.data&&s.data.session)){ if(Date.now()-t0<60000) setTimeout(oto,700); return; }
    if(es){ var skod=es.getAttribute("data-kod")||((typeof ARB_STORE!=="undefined")?String(ARB_STORE).replace(/^arbform_santiye_/,""):"");
      if(skod==="yi"){ var yp=document.getElementById("yi-sevk-pem"); if(!yp){ /* YI-ANKET-SAG (24.11.2026, Melih): Yurt İçi formunda Toplam Memnuniyet, Sevke Hazır PEM'lerin sağında; iki sütun ekran genişliğini aşmaz */
          var yr=document.createElement("div"); yr.id="yi-ust"; yr.style.cssText="display:flex;gap:12px;align-items:flex-start;width:100%;margin-bottom:14px";
          es.parentNode.insertBefore(yr,es.nextSibling);
          yp=document.createElement("div"); yp.id="yi-sevk-pem"; yp.style.cssText="flex:0 0 auto"; yr.appendChild(yp); /* YI-UST-SAG (26.11.2026, Melih): PEM tablosu doğal genişliğinde, kaydırmasız */
          var an=document.getElementById("anket"); if(an){ an.style.cssText="flex:0 1 auto;min-width:0;margin-left:auto;overflow-x:auto"; yr.appendChild(an); }
          /* YI-UST-SAG: şerit sayfa kutusunun sağına taşar, ekranın sağ kenarına kadar uzanır; memnuniyet bloğu sağa yaslı */
          var yg=function(){ var l=yr.getBoundingClientRect().left; yr.style.width=Math.max(300,document.documentElement.clientWidth-l-12)+"px"; }; yg(); window.addEventListener("resize",yg); }
        yiSevkPemBlok(yp,{sb:cli}); setInterval(function(){ if(!yp.querySelector("input")) yiSevkPemBlok(yp,{sb:cli}); },5*60*1000); } /* YI-SEVK-PEM */
      if(skod){ santiyeBlok(es,{sb:cli,kod:skod}); setInterval(function(){ if(!document.querySelector(".my-modal")&&!document.getElementById("mys-ctx")) santiyeBlok(es,{sb:cli,kod:skod}); },5*60*1000); } }
    if(sp){ sevkPrjBlok(sp,{sb:cli}); setInterval(function(){ if(!sp.querySelector("input")) sevkPrjBlok(sp,{sb:cli}); },5*60*1000); } /* MK-SEVK-PRJ */
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
