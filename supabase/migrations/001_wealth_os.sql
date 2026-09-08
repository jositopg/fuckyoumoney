-- Fuck You Money — schema para humanos y para cualquier IA.
-- Proyecto: jwcrrnevvtxaycsqjmem
-- Pegar ENTERO en SQL Editor y Run. Se puede ejecutar más de una vez.
--
-- Orden de lectura para una IA:
--   1. SELECT * FROM ai_guide ORDER BY sort;
--   2. SELECT patrimonio_ia();
--   3. SELECT * FROM v_net_worth;
--   4. SELECT * FROM v_positions;

-- Tipos (si ya existen, no pasa nada)
DO $$ BEGIN
  CREATE TYPE public.display_currency AS ENUM ('EUR', 'USD', 'GBP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.asset_type AS ENUM (
    'stock', 'etf', 'crypto', 'commodity', 'real_estate',
    'cash', 'bond', 'pension', 'other', 'vehicle'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ticker_source AS ENUM ('yahoo', 'coingecko');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.liability_type AS ENUM (
    'mortgage', 'personal_loan', 'car_loan', 'credit_card', 'student_loan', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tablas base (si el proyecto estaba vacío)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,
  display_currency public.display_currency NOT NULL DEFAULT 'EUR',
  monthly_expenses numeric
);

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.asset_type NOT NULL,
  ticker text,
  ticker_source public.ticker_source,
  quantity numeric NOT NULL DEFAULT 1,
  purchase_price numeric,
  purchase_date date,
  manual_value numeric,
  currency text NOT NULL DEFAULT 'EUR',
  institution text,
  country text,
  notes text,
  is_liquid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.liability_type NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  original_amount numeric,
  interest_rate numeric,
  monthly_payment numeric,
  start_date date,
  end_date date,
  currency text NOT NULL DEFAULT 'EUR',
  institution text,
  notes text,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_cache (
  symbol text PRIMARY KEY,
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  change_pct numeric,
  source text,
  last_updated timestamptz NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS assets_user_id_idx ON public.assets (user_id);
CREATE INDEX IF NOT EXISTS liabilities_user_id_idx ON public.liabilities (user_id);

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

CREATE TABLE IF NOT EXISTS public.ai_guide (
  sort int PRIMARY KEY,
  topic text NOT NULL,
  content text NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wealth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_guide ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_own ON public.profiles;
CREATE POLICY profiles_own ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS assets_own ON public.assets;
CREATE POLICY assets_own ON public.assets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS liabilities_own ON public.liabilities;
CREATE POLICY liabilities_own ON public.liabilities
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS wealth_snapshots_own ON public.wealth_snapshots;
CREATE POLICY wealth_snapshots_own ON public.wealth_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS external_snapshots_own ON public.external_snapshots;
CREATE POLICY external_snapshots_own ON public.external_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_guide_read ON public.ai_guide;
CREATE POLICY ai_guide_read ON public.ai_guide FOR SELECT USING (true);

INSERT INTO public.ai_guide (sort, topic, content) VALUES
(1, 'start_here',
 $g$Eres una IA con acceso al Postgres de Fuck You Money, el balance consolidado del patrimonio de Jose (EUR).

Pasos:
1. SELECT patrimonio_ia();
2. SELECT * FROM v_net_worth;
3. SELECT * FROM v_positions;
4. SELECT * FROM v_allocation;

Reglas:
- No inventes números. Si falta un campo, dilo.
- Inmuebles con source=finca o institution=finca son SOLO LECTURA. La gestión es la app Finca.
- Finca NO guarda el principal de hipoteca. Hipotecas = liabilities type=mortgage.
- Autonomía = (liquid_assets - total_liabilities) / profiles.monthly_expenses. El ladrillo NO entra.
- Líquido = filas con is_liquid = true (cash, stock, etf, crypto).
- App: https://fuckyoumoney.vercel.app  Finca: https://lasfincas.vercel.app
$g$),
(2, 'tables',
 $g$profiles — un row por usuario. monthly_expenses = gasto mensual de vida.
assets — activos. type: cash, stock, etf, crypto, commodity, real_estate, pension, bond, other, vehicle.
  Valor = manual_value si > 0; si no, quantity * purchase_price.
  institution=finca → inmueble ingerido desde Finca (read_only).
liabilities — pasivos. type: mortgage, personal_loan, car_loan, credit_card, student_loan, other. balance = principal vivo.
wealth_snapshots — fotos para series temporales.
external_snapshots — último sync crudo de Finca.
v_positions / v_net_worth / v_allocation — vistas para analizar. RLS: cada usuario solo ve lo suyo.
$g$),
(3, 'finca',
 $g$Los inmuebles operativos viven en otro Postgres (Finca). Aquí solo hay el dato macro: valor de Jose, renta, estado.
No hay inquilinos, DNI, facturas ni Drive.
$g$)
ON CONFLICT (sort) DO UPDATE SET topic = EXCLUDED.topic, content = EXCLUDED.content;

CREATE OR REPLACE FUNCTION public.fym_parse_notes(notes text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF notes IS NULL OR notes = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  IF notes LIKE 'FYM1:%' THEN
    BEGIN
      RETURN substring(notes FROM 6)::jsonb;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('human', notes);
    END;
  END IF;
  RETURN jsonb_build_object('human', notes);
END;
$$;

CREATE OR REPLACE VIEW public.v_positions
  WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.user_id,
  a.name,
  a.type::text AS class,
  'asset'::text AS kind,
  COALESCE(NULLIF(a.manual_value, 0), a.quantity * COALESCE(a.purchase_price, 0), 0) AS value,
  a.is_liquid,
  COALESCE(NULLIF(a.source, ''), CASE WHEN a.institution = 'finca' THEN 'finca' ELSE 'manual' END) AS source,
  a.institution,
  a.currency,
  a.metadata || public.fym_parse_notes(a.notes) AS extra,
  (a.read_only OR a.institution = 'finca') AS read_only,
  a.ticker,
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
  COALESCE(NULLIF(l.source, ''), 'manual') AS source,
  l.institution,
  l.currency,
  COALESCE(l.metadata, '{}'::jsonb) AS extra,
  false AS read_only,
  NULL::text AS ticker,
  l.updated_at
FROM public.liabilities l;

CREATE OR REPLACE VIEW public.v_net_worth
  WITH (security_invoker = true)
AS
SELECT
  user_id,
  SUM(CASE WHEN kind = 'asset' THEN value ELSE 0 END) AS total_assets,
  SUM(CASE WHEN kind = 'liability' THEN value ELSE 0 END) AS total_liabilities,
  SUM(CASE WHEN kind = 'asset' THEN value ELSE -value END) AS net_worth,
  SUM(CASE WHEN kind = 'asset' AND is_liquid THEN value ELSE 0 END) AS liquid_assets,
  SUM(CASE WHEN kind = 'asset' AND class = 'real_estate' THEN value ELSE 0 END) AS real_estate_value
FROM public.v_positions
GROUP BY user_id;

CREATE OR REPLACE VIEW public.v_allocation
  WITH (security_invoker = true)
AS
SELECT
  user_id,
  class,
  SUM(value) AS value
FROM public.v_positions
WHERE kind = 'asset'
GROUP BY user_id, class;

CREATE OR REPLACE FUNCTION public.patrimonio_ia()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
SELECT jsonb_build_object(
  'asOf', now(),
  'currency', 'EUR',
  'howto', 'Briefing de patrimonio de Jose. No inventes cifras. Inmuebles source=finca son read-only (app Finca). Hipotecas = class=mortgage kind=liability.',
  'totals', (SELECT to_jsonb(t) FROM public.v_net_worth t LIMIT 1),
  'monthlyExpenses', (SELECT monthly_expenses FROM public.profiles LIMIT 1),
  'allocation', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.value DESC), '[]'::jsonb) FROM public.v_allocation a),
  'positions', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.kind, p.class, p.name), '[]'::jsonb) FROM public.v_positions p)
);
$$;

GRANT SELECT ON public.ai_guide TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liabilities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wealth_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_snapshots TO authenticated;
GRANT SELECT ON public.v_positions TO authenticated;
GRANT SELECT ON public.v_net_worth TO authenticated;
GRANT SELECT ON public.v_allocation TO authenticated;
GRANT EXECUTE ON FUNCTION public.patrimonio_ia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fym_parse_notes(text) TO authenticated;

COMMENT ON TABLE public.ai_guide IS 'Leer primero. Instrucciones para cualquier IA. Sin cifras.';
COMMENT ON TABLE public.assets IS 'Activos. Valor = manual_value o quantity*purchase_price. institution=finca → inmueble read-only.';
COMMENT ON TABLE public.liabilities IS 'Pasivos. balance = principal vivo. mortgage no existe en Finca.';
COMMENT ON TABLE public.profiles IS 'monthly_expenses = gasto mensual para autonomía.';
COMMENT ON VIEW public.v_positions IS 'Activos y pasivos unificados. kind=asset|liability.';
COMMENT ON VIEW public.v_net_worth IS 'Totales por usuario.';
COMMENT ON VIEW public.v_allocation IS 'Suma de activos por class.';
COMMENT ON FUNCTION public.patrimonio_ia() IS 'SELECT patrimonio_ia(); — briefing JSON. Requiere login o service_role.';
