-- Run as the administrator in the SQL editor. Includes today's partial count (JST).
WITH period AS (SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS today)
SELECT now() AS counted_at, today - 29 AS period_start, today AS period_end,
       count(DISTINCT browser_id) AS active_browsers
FROM period LEFT JOIN public.usage_browser_days ON used_on BETWEEN today - 29 AND today
GROUP BY today;

-- After noting the result above, run this separately to remove older analytics rows.
-- DELETE FROM public.usage_browser_days
-- WHERE used_on < (now() AT TIME ZONE 'Asia/Tokyo')::date - 29;
