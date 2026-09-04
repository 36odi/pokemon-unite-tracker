-- 2026-09-03 適用済み。再実行禁止。実施内容の参照用。
-- 戻し方と残件は ../avg-stats-db-migration.md を参照。
-- Authorized change: add the single average-exclusion flag. No row DML.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.battles IN ACCESS EXCLUSIVE MODE;
DO $migration$
DECLARE
  before_count bigint;
  after_count bigint;
  before_hash text;
  after_hash text;
BEGIN
  SELECT count(*), md5(coalesce(string_agg(md5(to_jsonb(b)::text), '' ORDER BY id), ''))
    INTO before_count, before_hash FROM public.battles b;
  ALTER TABLE public.battles
    ADD COLUMN exclude_from_avg_stats boolean NOT NULL DEFAULT false;
  SELECT count(*), md5(coalesce(string_agg(md5((to_jsonb(b) - 'exclude_from_avg_stats')::text), '' ORDER BY id), ''))
    INTO after_count, after_hash FROM public.battles b;
  IF before_count IS DISTINCT FROM after_count OR before_hash IS DISTINCT FROM after_hash THEN
    RAISE EXCEPTION 'Existing battle data changed; abort migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.battles WHERE exclude_from_avg_stats IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'New flags are not all false; abort migration';
  END IF;
END
$migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT count(*) AS records,
       count(*) FILTER (WHERE exclude_from_avg_stats = false) AS false_records,
       count(*) FILTER (WHERE exclude_from_avg_stats = true) AS true_records,
       count(*) FILTER (WHERE exclude_from_avg_stats IS NULL) AS null_records,
       md5(coalesce(string_agg(md5((to_jsonb(b) - 'exclude_from_avg_stats')::text), '' ORDER BY id), '')) AS original_rows_md5
FROM public.battles b;
