-- Fuck You Money — schema para humanos y para cualquier IA con acceso a este Postgres.
-- Proyecto: jwcrrnevvtxaycsqjmem
-- Aplicar: node scripts/run-sql.mjs supabase/migrations/001_wealth_os.sql
--
-- Orden de lectura para una IA:
--   1. SELECT * FROM ai_guide ORDER BY sort;
--   2. SELECT patrimonio_ia();
--   3. SELECT * FROM v_net_worth;
--   4. SELECT * FROM v_positions;
-- No inventar cifras. Todo está en EUR. Inmuebles Finca = solo lectura.

BEGIN;

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

-- Guía en la propia base: visible incluso con la anon key (no hay cifras).
CREATE TABLE IF NOT EXISTS public.ai_guide (
  sort int PRIMARY KEY,
  topic text NOT NULL,
  content text NOT NULL
);

ALTER TABLE public.ai_guide ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_guide_read ON public.ai_guide;
CREATE POLICY ai_guide_read ON public.ai_guide FOR SELECT USING (true);

INSERT INTO public.ai_guide (sort, topic, content) VALUES
(1, 'start_here',
 $g$Eres una IA con acceso al Postgres de Fuck You Money, el balance consolidado del patrimonio de Jose (EUR).

Pasos:
1. SELECT patrimonio_ia();          -- briefing JSON (cifras). Requiere estar autenticado como Jose o ser postgres/service_role.
2. SELECT * FROM v_net_worth;       -- totales.
3. SELECT * FROM v_positions;       -- cada activo y pasivo.
4. SELECT * FROM v_allocation;      -- peso por clase.

Reglas:
- No inventes números. Si falta un campo, dilo.
- Inmuebles con source=finca o institution=finca son SOLO LECTURA. La gestión (inquilinos, facturas, fiscal) es la app Finca, otro proyecto.
- Finca NO guarda el principal de hipoteca. Las hipotecas están en liabilities (type=mortgage).
- Autonomía financiera = (liquid_assets - total_liabilities) / profiles.monthly_expenses. El ladrillo NO entra en autonomía.
- Líquido = cash + stock + etf + crypto (is_liquid = true).
- App de UI: https://fuckyoumoney.vercel.app  Finca: https://lasfincas.vercel.app
$g$),
(2, 'tables',
 $g$profiles — un row por usuario. monthly_expenses = gasto mensual de vida.
assets — activos. type: cash, stock, etf, crypto, commodity, real_estate, pension, bond, other/vehicle.
  Valor = manual_value si > 0; si no, quantity * purchase_price.
  institution=finca → inmueble ingerido desde Finca (read_only).
  notes puede empezar por FYM1:{json} con renta, municipio, etc. Preferir columna metadata.
liabilities — pasivos. type: mortgage, personal_loan, car_loan, credit_card, student_loan, other. balance = principal vivo.
wealth_snapshots — fotos diarias/mensuales para series.
external_snapshots — payload crudo del último sync Finca.
v_positions / v_net_worth / v_allocation — vistas listas para analizar. RLS: cada usuario solo ve lo suyo.
$g$),
(3, 'finca',
 $g$Los inmuebles operativos viven en otro Postgres (Finca). Aquí solo hay el dato macro: valor de Jose, renta contratada, estado.
No hay inquilinos, DNI, facturas ni Drive. Si hace falta operar un piso, eso es Finca, no este proyecto.
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

ALTER TABLE public.wealth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wealth_snapshots_own ON public.wealth_snapshots;
CREATE POLICY wealth_snapshots_own ON public.wealth_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS external_snapshots_own ON public.external_snapshots;
CREATE POLICY external_snapshots_own ON public.external_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.ai_guide TO anon, authenticated;
GRANT SELECT ON public.v_positions TO authenticated;
GRANT SELECT ON public.v_net_worth TO authenticated;
GRANT SELECT ON public.v_allocation TO authenticated;
GRANT EXECUTE ON FUNCTION public.patrimonio_ia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fym_parse_notes(text) TO authenticated;

COMMENT ON TABLE public.ai_guide IS 'Leer primero. Instrucciones para cualquier IA con acceso a este Postgres. Sin cifras.';
COMMENT ON TABLE public.assets IS 'Activos. Valor = manual_value o quantity*purchase_price. institution=finca → inmueble read-only desde la app Finca.';
COMMENT ON TABLE public.liabilities IS 'Pasivos. balance = principal vivo. mortgage no existe en Finca.';
COMMENT ON TABLE public.profiles IS 'monthly_expenses = gasto mensual para calcular autonomía.';
COMMENT ON TABLE public.wealth_snapshots IS 'Serie temporal de patrimonio neto.';
COMMENT ON TABLE public.external_snapshots IS 'Último payload crudo de Finca.';
COMMENT ON VIEW public.v_positions IS 'Activos y pasivos unificados. kind=asset|liability. extra = metadata + FYM1 notes parseadas.';
COMMENT ON VIEW public.v_net_worth IS 'Totales por usuario. Primera vista con cifras después de patrimonio_ia().';
COMMENT ON VIEW public.v_allocation IS 'Suma de activos por class (cash, real_estate, stock, …).';
COMMENT ON FUNCTION public.patrimonio_ia() IS 'SELECT patrimonio_ia(); — briefing JSON completo. Requiere login (RLS) o service_role.';

COMMENT ON COLUMN public.assets.name IS 'Nombre visible (banco, ticker largo, dirección corta del piso).';
COMMENT ON COLUMN public.assets.type IS 'cash|stock|etf|crypto|commodity|real_estate|pension|bond|other';
COMMENT ON COLUMN public.assets.manual_value IS 'Valor total EUR si no hay precio de mercado. Preferido para cash, pension, real_estate, other.';
COMMENT ON COLUMN public.assets.is_liquid IS 'true = computa para autonomía (cash/stock/etf/crypto).';
COMMENT ON COLUMN public.assets.source IS 'manual|finca|market';
COMMENT ON COLUMN public.assets.read_only IS 'true para filas Finca: no editar desde FYM.';
COMMENT ON COLUMN public.liabilities.balance IS 'Principal vivo en EUR (positivo).';
COMMENT ON COLUMN public.liabilities.monthly_payment IS 'Cuota mensual EUR.';
COMMENT ON COLUMN public.profiles.monthly_expenses IS 'Gasto de vida mensual EUR (colchón / autonomía).';

COMMIT;
