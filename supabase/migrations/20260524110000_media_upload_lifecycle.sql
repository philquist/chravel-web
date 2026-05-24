-- Canonical media upload metadata and orphan cleanup helpers.

create index if not exists trip_media_index_metadata_checksum_idx
  on public.trip_media_index ((metadata->>'checksum'));

create or replace function public.cleanup_orphaned_trip_media_variants(max_rows integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  with orphaned as (
    select t.id
    from public.trip_media_index t
    where coalesce(t.metadata->>'orphan_variant', '') = 'true'
      and t.created_at < now() - interval '7 days'
    limit greatest(max_rows, 1)
  )
  delete from public.trip_media_index i
  using orphaned o
  where i.id = o.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_orphaned_trip_media_variants(integer) from public;
grant execute on function public.cleanup_orphaned_trip_media_variants(integer) to service_role;

comment on function public.cleanup_orphaned_trip_media_variants(integer) is
  'Deletes trip_media_index rows explicitly marked metadata.orphan_variant=true and older than 7 days. Callable by service_role only (scheduled job / edge function).';
