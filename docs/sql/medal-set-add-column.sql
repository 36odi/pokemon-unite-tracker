-- 対戦記録にメダルセット（記録時点の中身）を保存する列を追加する。既存行は変更しない（すべて NULL）。
-- 1回だけ実行する。同名の列があればエラーで止まる（IF NOT EXISTS は使わない）。
-- 値の形: {"label":"白6+茶6+青2","slots":[メダル名 or null ×10],"rarities":["gold"|"silver"|"bronze" ×10]}
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
    ADD COLUMN medal_set jsonb NULL;
  -- 中身はオブジェクトのみ・大きさは4KBまで（想定外の巨大データを防ぐ）
  ALTER TABLE public.battles
    ADD CONSTRAINT battles_medal_set_shape
    CHECK (medal_set IS NULL OR (jsonb_typeof(medal_set) = 'object' AND pg_column_size(medal_set) <= 4096));
  SELECT count(*), md5(coalesce(string_agg(md5((to_jsonb(b) - 'medal_set')::text), '' ORDER BY id), ''))
    INTO after_count, after_hash FROM public.battles b;
  IF before_count IS DISTINCT FROM after_count OR before_hash IS DISTINCT FROM after_hash THEN
    RAISE EXCEPTION 'Existing battle data changed; abort migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.battles WHERE medal_set IS NOT NULL) THEN
    RAISE EXCEPTION 'New column is not all NULL; abort migration';
  END IF;
END
$migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
-- 確認：records が適用前と同じ、with_medal_set が 0
SELECT count(*) AS records,
       count(*) FILTER (WHERE medal_set IS NOT NULL) AS with_medal_set
FROM public.battles;
