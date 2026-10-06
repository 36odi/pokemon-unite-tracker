-- New table only. A name collision fails instead of altering an existing table.
BEGIN;
CREATE TABLE public.usage_browser_days (
  browser_id uuid NOT NULL,
  used_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Tokyo')::date,
  CONSTRAINT usage_browser_days_pkey PRIMARY KEY (browser_id, used_on)
);
ALTER TABLE public.usage_browser_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usage_browser_days FROM PUBLIC, anon, authenticated;
REVOKE ALL (browser_id, used_on) ON public.usage_browser_days FROM PUBLIC, anon, authenticated;
GRANT INSERT (browser_id) ON public.usage_browser_days TO anon;
CREATE POLICY usage_browser_days_insert ON public.usage_browser_days
  FOR INSERT TO anon WITH CHECK (true);
COMMIT;
