-- 読み取り専用。Supabase SQL Editor で、列追加の前に確認する（データは変更しない）。
-- 1) battles の列一覧。medal_set がまだ無いことを確認する。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'battles'
ORDER BY ordinal_position;

-- 2) 既存の制約。medal_set という名前の制約が無いことを確認する。
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.battles'::regclass;

-- 3) ユーザー定義トリガー（無いことを前回確認済み。変化が無いかの確認）。
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.battles'::regclass AND NOT tgisinternal;

-- 4) 現在の件数（適用後の照合用に控えておく）。
SELECT count(*) AS records FROM public.battles;
