-- ============================================================
-- 0024: Coverage teams replace the 11 GICS sectors
--
-- The app used the 11 GICS sectors as coverage-team names, but the fund only
-- recruits into the seven groups on the application form: Consumer,
-- Industrials, TMT, FIG, Healthcare, Energy, Derivatives. This remaps every
-- stored coverage value onto those seven. Mirrors LEGACY_TEAM_ALIASES in
-- lib/sectors.ts — change both together.
--
-- Market-data sectors are NOT touched: holdings_snapshots.sector and
-- position_approvals.sector still carry GICS names straight off the feed.
-- ============================================================

create or replace function public.coverage_team_of(old_sector text)
returns text
language sql
immutable
as $$
  select case old_sector
    when 'Technology'             then 'TMT'
    when 'Communication Services' then 'TMT'
    when 'Financial Services'     then 'FIG'
    when 'Real Estate'            then 'FIG'
    when 'Consumer Cyclical'      then 'Consumer'
    when 'Consumer Defensive'     then 'Consumer'
    when 'Basic Materials'        then 'Industrials'
    when 'Utilities'              then 'Energy'
    else old_sector
  end;
$$;

-- ── Team files ──────────────────────────────────────────────────────────────
-- Two sectors can merge into one team, so root folders that would collide on
-- team_folders_root_name_key get their old sector appended first.
with ranked as (
  select
    id,
    name,
    sector,
    row_number() over (
      partition by public.coverage_team_of(sector), lower(name)
      order by created_at, id
    ) as rn
  from public.team_folders
  where parent_id is null
)
update public.team_folders f
set name = ranked.name || ' (' || ranked.sector || ')'
from ranked
where f.id = ranked.id
  and ranked.rn > 1;

-- The inherit-sector triggers would re-read each parent's pre-update sector
-- and undo the remap, so move whole trees with them off. Every descendant maps
-- identically to its root, so the tree stays consistent either way.
alter table public.team_folders disable trigger team_folders_inherit_sector_trg;
alter table public.team_files   disable trigger team_files_inherit_sector_trg;

update public.team_folders
set sector = public.coverage_team_of(sector)
where sector <> public.coverage_team_of(sector);

update public.team_files
set sector = public.coverage_team_of(sector)
where sector <> public.coverage_team_of(sector);

alter table public.team_folders enable trigger team_folders_inherit_sector_trg;
alter table public.team_files   enable trigger team_files_inherit_sector_trg;

-- ── Everything else keyed on a coverage sector ──────────────────────────────
update public.user_profiles
set coverage_sector = public.coverage_team_of(coverage_sector)
where coverage_sector is not null
  and coverage_sector <> public.coverage_team_of(coverage_sector);

update public.research_posts
set sector = public.coverage_team_of(sector)
where sector is not null
  and sector <> public.coverage_team_of(sector);

update public.stock_alerts
set sector = public.coverage_team_of(sector)
where sector <> public.coverage_team_of(sector);

drop function public.coverage_team_of(text);
