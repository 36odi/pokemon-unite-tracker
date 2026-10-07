-- 訂正を保存する列のみ追加。既存のランク・レートは変更しない。
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.battles ADD COLUMN played_rank text NULL
  CHECK (played_rank IN ('ビギナー','スーパー','ハイパー','エリート','エキスパート','マスター','レジェンド'));
NOTIFY pgrst, 'reload schema';
COMMIT;
