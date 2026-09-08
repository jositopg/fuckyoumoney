-- Aplicar cuando exista ~/.fuckyoumoney-db.env (DATABASE_URL del proyecto jwcrrnevvtxaycsqjmem).
-- Hasta entonces FYM empaqueta metadata extra como FYM1:{json} en assets.notes.

DO $$ BEGIN
  ALTER TYPE public.asset_type ADD VALUE IF NOT EXISTS 'vehicle';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.liabilities
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS assets_user_source_external_uid
  ON public.assets (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wealth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of date NOT NULL,
  net_worth numeric NOT NULL,
  total_assets numeric NOT NULL,
  total_liabilities numeric NOT NULL,
  liquid_assets numeric NOT NULL,
  real_estate_value numeric NOT NULL DEFAULT 0,
  allocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, as_of)
);

CREATE TABLE IF NOT EXISTS public.external_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  as_of timestamptz NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_snapshots_user_source_idx
  ON public.external_snapshots (user_id, source, as_of DESC);

ALTER TABLE public.wealth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wealth_snapshots_own ON public.wealth_snapshots;
CREATE POLICY wealth_snapshots_own ON public.wealth_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS external_snapshots_own ON public.external_snapshots;
CREATE POLICY external_snapshots_own ON public.external_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.v_positions AS
SELECT
  a.id,
  a.user_id,
  a.name,
  a.type::text AS class,
  'asset'::text AS kind,
  COALESCE(a.manual_value, a.quantity * COALESCE(a.purchase_price, 0), 0) AS value,
  a.is_liquid,
  a.source,
  a.institution,
  a.currency,
  a.metadata,
  a.read_only,
  a.updated_at
FROM public.assets a
UNION ALL
SELECT
  l.id,
  l.user_id,
  l.name,
  l.type::text AS class,
  'liability'::text AS kind,
  l.balance AS value,
  false AS is_liquid,
  l.source,
  l.institution,
  l.currency,
  l.metadata,
  false AS read_only,
  l.updated_at
FROM public.liabilities l;

CREATE OR REPLACE VIEW public.v_net_worth AS
SELECT
  user_id,
  SUM(CASE WHEN kind = 'asset' THEN value ELSE 0 END) AS total_assets,
  SUM(CASE WHEN kind = 'liability' THEN value ELSE 0 END) AS total_liabilities,
  SUM(CASE WHEN kind = 'asset' THEN value ELSE -value END) AS net_worth,
  SUM(CASE WHEN kind = 'asset' AND is_liquid THEN value ELSE 0 END) AS liquid_assets,
  SUM(CASE WHEN kind = 'asset' AND class = 'real_estate' THEN value ELSE 0 END) AS real_estate_value
FROM public.v_positions
GROUP BY user_id;

CREATE OR REPLACE VIEW public.v_allocation AS
SELECT
  user_id,
  class,
  SUM(value) AS value
FROM public.v_positions
WHERE kind = 'asset'
GROUP BY user_id, class;

REVOKE ALL ON public.v_positions FROM PUBLIC;
REVOKE ALL ON public.v_net_worth FROM PUBLIC;
REVOKE ALL ON public.v_allocation FROM PUBLIC;
GRANT SELECT ON public.v_positions TO authenticated;
GRANT SELECT ON public.v_net_worth TO authenticated;
GRANT SELECT ON public.v_allocation TO authenticated;

COMMENT ON VIEW public.v_net_worth IS 'Patrimonio neto por usuario. IA: leer esta vista primero. Cifras EUR.';
COMMENT ON VIEW public.v_allocation IS 'Asignación por clase de activo (solo assets, sin deudas).';
COMMENT ON VIEW public.v_positions IS 'Posiciones unificadas (activos + pasivos). kind=asset|liability. real_estate con institution=finca es solo lectura.';

COMMENT ON TABLE public.assets IS 'Activos de Jose. type: cash, stock, etf, crypto, commodity, real_estate, pension, vehicle/other. Inmuebles Finca: institution=finca, notes FYM1:{json}.';
COMMENT ON TABLE public.liabilities IS 'Pasivos. type: mortgage, personal_loan, car_loan, credit_card, student_loan, other. El principal de hipoteca vive aquí, no en Finca.';
COMMENT ON TABLE public.profiles IS 'Un perfil por usuario. monthly_expenses = gasto mensual para autonomía.';
COMMENT ON TABLE public.wealth_snapshots IS 'Foto diaria/mensual de patrimonio neto. Para series temporales.';

-- Briefing de una fila para una IA en terminal. Preferir esta función.
CREATE OR REPLACE FUNCTION public.patrimonio_ia()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH pos AS (
  SELECT * FROM public.v_positions
),
tot AS (
  SELECT * FROM public.v_net_worth
)
SELECT jsonb_build_object(
  'asOf', to_jsonb(now()),
  'currency', 'EUR',
  'howto', 'Briefing de patrimonio de Jose. No inventes cifras. Inmuebles institution=finca son read-only (app Finca). Hipotecas = liabilities type=mortgage.',
  'totals', (SELECT to_jsonb(t) FROM tot t LIMIT 1),
  'allocation', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.value DESC), '[]'::jsonb) FROM public.v_allocation a),
  'positions', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.kind, p.class, p.name), '[]'::jsonb) FROM pos p)
);
$$;

REVOKE ALL ON FUNCTION public.patrimonio_ia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patrimonio_ia() TO postgres;
COMMENT ON FUNCTION public.patrimonio_ia() IS 'JSON de patrimonio para Grok en terminal. node scripts/dump-wealth.mjs o SELECT patrimonio_ia();';
