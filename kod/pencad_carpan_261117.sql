-- CAM-ONAY-ALIS25 (17.11.2026, Melih "A"): onay kıyası Pencad alış ×2,5. Yalnız satış/alış çarpanı döner (alış dönmez).
-- migration pencad_carpan_261117 · Geri alma: drop function public.pencad_carpan(text,numeric); drop function public.cam_ad_nrm(text);
create or replace function public.cam_ad_nrm(s text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(coalesce(s,'')),'akustik','acoustic','g'),'ar\s*-?\s*we','ar-we','g'),'ug\s*=\s*[0-9.,]+','','g'),
    '(^|[^0-9.])[01]\.[0-9](?![0-9.])','\1','g'),'ar90','ar','g'),'[\s,]+','','g')
$$;
create or replace function public.pencad_carpan(p_komb text, p_ug numeric default null)
returns table(stok_kodu text, carpan numeric)
language plpgsql stable security definer set search_path=public as $$
declare st text; em text := coalesce(auth.jwt()->>'email','');
begin
  if em not in ('int@arbor.com.tr','cam.form@arbor.com.tr') then return; end if;
  select c.stok_kodu into st from cam_listesi c where c.kombinasyon=p_komb and c.stok_kodu is not null limit 1;
  if st is null then
    select c.stok_kodu into st from cam_listesi c where c.stok_kodu is not null and cam_ad_nrm(c.kombinasyon)=cam_ad_nrm(p_komb)
      order by (p_ug is not null and c.ug is not null and abs(c.ug-p_ug)<0.01) desc limit 1;
  end if;
  return query
    select p.stok_kodu, round(p.satis/p.maliyet,4) from pencad_cam p
    where p.maliyet>0 and p.satis>0 and (p.stok_kodu=st or (st is null and cam_ad_nrm(p.kombinasyon)=cam_ad_nrm(p_komb)))
    order by (p.stok_kodu=st) desc nulls last limit 1;
end $$;
revoke all on function public.pencad_carpan(text,numeric) from public, anon;
grant execute on function public.pencad_carpan(text,numeric) to authenticated, service_role;
