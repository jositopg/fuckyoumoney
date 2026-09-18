-- Una cuenta bancaria puede partirse: colchón + apartado + resto a invertir.
-- extra.slices = [{job, amount, parkedReason?}]. El resto del saldo es idle.
-- Pegar ENTERO y Run.

CREATE OR REPLACE VIEW public.v_cash_jobs
  WITH (security_invoker = true)
AS
WITH cash AS (
  SELECT
    p.user_id,
    p.id,
    p.name,
    p.value AS account_value,
    p.extra,
    COALESCE(NULLIF(p.extra->>'interestRate', '')::numeric, 0) AS interest_rate
  FROM public.v_positions p
  WHERE p.kind = 'asset' AND p.class = 'cash'
),
sliced AS (
  SELECT
    c.user_id,
    c.id,
    c.name,
    c.account_value,
    c.interest_rate,
    c.extra,
    CASE
      WHEN e.elem->>'job' IN ('emergency', 'parked') THEN e.elem->>'job'
      ELSE 'idle'
    END AS job,
    COALESCE((e.elem->>'amount')::numeric, 0) AS amount,
    NULLIF(e.elem->>'parkedReason', '') AS parked_reason
  FROM cash c
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.extra->'slices', '[]'::jsonb)) AS e(elem)
  WHERE jsonb_typeof(c.extra->'slices') = 'array'
    AND jsonb_array_length(c.extra->'slices') > 0
    AND e.elem->>'job' IN ('emergency', 'parked')
),
sliced_sum AS (
  SELECT id, sum(GREATEST(amount, 0)) AS allocated
  FROM sliced
  GROUP BY id
),
remainder AS (
  SELECT
    c.user_id,
    c.id,
    c.name,
    c.account_value,
    c.interest_rate,
    c.extra,
    'idle'::text AS job,
    GREATEST(c.account_value - COALESCE(s.allocated, 0), 0) AS amount,
    NULL::text AS parked_reason
  FROM cash c
  JOIN sliced_sum s ON s.id = c.id
  WHERE c.account_value - COALESCE(s.allocated, 0) > 0.005
),
legacy AS (
  SELECT
    c.user_id,
    c.id,
    c.name,
    c.account_value,
    c.interest_rate,
    c.extra,
    CASE
      WHEN c.extra->>'job' IN ('emergency', 'parked') THEN c.extra->>'job'
      ELSE 'idle'
    END AS job,
    c.account_value AS amount,
    NULLIF(c.extra->>'parkedReason', '') AS parked_reason
  FROM cash c
  WHERE jsonb_typeof(c.extra->'slices') IS DISTINCT FROM 'array'
     OR jsonb_array_length(COALESCE(c.extra->'slices', '[]'::jsonb)) = 0
)
SELECT user_id, id, name, amount AS value, job, parked_reason, interest_rate, extra
FROM sliced
WHERE amount > 0
UNION ALL
SELECT user_id, id, name, amount AS value, job, parked_reason, interest_rate, extra
FROM remainder
UNION ALL
SELECT user_id, id, name, amount AS value, job, parked_reason, interest_rate, extra
FROM legacy;

COMMENT ON VIEW public.v_cash_jobs IS
  'Una fila por uso. value = trozo, no el saldo del banco. slices en extra; el resto es idle. TAE no cambia el job.';

INSERT INTO public.ai_guide (sort, topic, content) VALUES
(7, 'cash_slices',
 $g$Una cuenta bancaria es UN saldo. Los usos son trozos de ese saldo.

extra.slices = [{ "job": "emergency"|"parked", "amount": euros, "parkedReason": "..." }].
El resto (account − sum(slices)) es idle = a invertir.
Si no hay slices, extra.job aplica a TODO el saldo (legado).

No trates cada cuenta como un solo uso. Jose puede tener colchón, un apartado y dinero a invertir en la misma cuenta BBVA.
$g$)
ON CONFLICT (sort) DO UPDATE SET topic = EXCLUDED.topic, content = EXCLUDED.content;
