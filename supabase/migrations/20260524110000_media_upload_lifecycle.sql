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
    where coalesce(t.metadata->>'upload_path', '') = ''
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
