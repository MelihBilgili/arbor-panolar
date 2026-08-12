-- ============================================================
-- Maaş-Prim — kalıcı, düzenlenebilir tablo (Melih kararı 2026-08-12)
-- Pano (pano_ozel_html mali_maasprim) bu tabloyu anon publishable key ile
-- okur/yazar. Personel ekle / satır sil / yeni ay prim ekle → doğrudan buraya.
-- Supabase SQL Editor'de (postgres role) RUN edilir. Kur: 1 € = 55,11 (12.08.26).
-- € kalemleri (geçen ay prim) bu kurla TL'ye çevrilerek girildi.
-- ============================================================

create table if not exists public.maas_prim (
  id             uuid primary key default gen_random_uuid(),
  sira           int,
  kisi           text not null,
  ise_giris      text,           -- "19.11.2014" (foto tablosundan)
  tahsil         text,           -- kod ("2","4","6","-")
  kidem          text,           -- yıl ("3,33")
  yol_yemek      numeric,        -- TL, sabit
  son_artis      text,           -- "%44,3"
  cari_yil_maas  numeric,        -- TL (2026)
  gecen_yil_maas numeric,        -- TL (2025)
  cari_ay_prim   numeric,        -- Yol-Yemek dahil, TL
  gecen_ay_prim  numeric,        -- Yol-Yemek dahil, TL
  updated_at     timestamptz default now()
);

-- anon publishable key ile tam CRUD (pano düzenleme kutuları için)
alter table public.maas_prim enable row level security;
drop policy if exists mp_anon_all on public.maas_prim;
create policy mp_anon_all on public.maas_prim
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.maas_prim to anon, authenticated;

-- ---- SEED (mevcut maaş tablosu − Emircan Yılmaz + Mehmet Konak + Melike Başaran) ----
truncate public.maas_prim;
insert into public.maas_prim
 (sira,kisi,ise_giris,tahsil,kidem,yol_yemek,son_artis,cari_yil_maas,gecen_yil_maas,cari_ay_prim,gecen_ay_prim) values
 (1 ,'Melike Hilal Gökdemir',null        ,'2','2'   ,6000 ,'%44,3',50500 ,35000 ,null,null),
 (2 ,'Ayşenur Özdemir'      ,'24.04.2024','2','2'   ,6000 ,'%51,7',45500 ,30000 ,null,22595),
 (3 ,'Okan Altun'           ,'2.07.2025' ,'4','0'   ,null ,'%50,0',51000 ,34000 ,null,12675),
 (4 ,'Burak Tekin Yılmaz'   ,'2.08.2021' ,'2','4'   ,6000 ,'%32,6',57000 ,43000 ,null,12600),
 (5 ,'Sedanur Özdemir'      ,'11.04.2022','2','3,33',6000 ,'%35,0',54000 ,40000 ,null,13000),
 (6 ,'Taha Berk Dirice'     ,'2.10.2023' ,'4','1,83',6000 ,'%34,6',54500 ,40500 ,null,11000),
 (7 ,'Hanane Bouchellal'    ,'27.05.2024','4','1,25',16000,'%33,3',52000 ,39000 ,null,23000),
 (8 ,'Mustafa Nas'          ,'24.03.2025','4','0,33',null ,'%37,8',51000 ,37000 ,null,27555),
 (9 ,'Deniz Aslan'          ,'10.07.2026','4','0'   ,2000 ,'%44,2',75000 ,52000 ,null,3000 ),
 (10,'Orhan Bulut'          ,'19.11.2014','2','11'  ,6000 ,'%29,4',66000 ,51000 ,null,53457),
 (11,'Onur Ekinci'          ,'1.05.2024' ,'4','1,25',6000 ,'%37,3',46000 ,33500 ,null,11022),
 (12,'Fatma Alkan'          ,null        ,'6','4'   ,6000 ,'%26,6',116500,92000 ,null,null ),
 (13,'Özgül Bedestenci'     ,'2.07.2024' ,'4','1'   ,6000 ,'%26,5',71500 ,56500 ,null,null ),
 (14,'Özlem Yıldız'         ,'28.07.2023',null,'2'  ,6000 ,'%28,1',36500 ,28500 ,null,7164 ),
 (15,'Mertcan Müngen'       ,null        ,null,'5'  ,null ,'%30,8',42500 ,32500 ,null,null ),
 (16,'Toufik Hadjene'       ,null        ,null,'8'  ,null ,'%26,7',95000 ,75000 ,null,null ),
 (17,'Mehmet Konak'         ,'3.12.2012' ,null,null ,null ,null   ,0     ,0     ,0   ,0    ),
 (18,'Melike Başaran'       ,'1.06.2026' ,null,null ,null ,null   ,null  ,null  ,null,11022);
