-- 読み取り専用。対象プロジェクトのSupabase SQL Editorで、列追加の承認前に確認する。
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'battles'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.battles'::regclass;

SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.battles'::regclass AND NOT tgisinternal;

-- 適用後も上の列定義でboolean / NO / falseを確認する。
