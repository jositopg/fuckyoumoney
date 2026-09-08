-- Efectivo con trabajo + diagnóstico para humanos y para cualquier IA.
-- Pegar ENTERO en SQL Editor y Run. Se puede ejecutar más de una vez.
--
-- Orden de lectura:
--   1. SELECT * FROM ai_guide ORDER BY sort;
--   2. SELECT patrimonio_ia();          -- briefing + veredicto + acciones
--   3. SELECT * FROM v_cash_jobs;
--   4. SELECT * FROM v_real_estate_yield;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_target_months numeric;

COMMENT ON COLUMN public.profiles.emergency_target_months IS
  'Meses de gasto a cubrir con efectivo de emergencia. NULL = aún no lo ha dicho (la app asume 6).';

CREATE OR REPLACE VIEW public.v_cash_jobs
  WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.id,
  p.name,
  p.value,
  CASE
    WHEN p.extra->>'job' IN ('emergency', 'parked', 'working', 'idle') THEN p.extra->>'job'
    WHEN COALESCE(NULLIF(p.extra->>'interestRate', '')::numeric, 0) > 0 THEN 'working'
    ELSE 'idle'
  END AS job,
  NULLIF(p.extra->>'parkedReason', '') AS parked_reason,
  COALESCE(NULLIF(p.extra->>'interestRate', '')::numeric, 0) AS interest_rate,
  p.extra
FROM public.v_positions p
WHERE p.kind = 'asset' AND p.class = 'cash';

CREATE OR REPLACE VIEW public.v_real_estate_yield
  WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  count(*)::int AS properties,
  COALESCE(sum(p.value), 0) AS value,
  COALESCE(sum(p.value) FILTER (
    WHERE COALESCE(p.extra->>'propertyType', '') <> 'vivienda_habitual'
      AND COALESCE(p.extra->>'status', '') NOT IN ('vivienda_habitual', 'uso_propio')
  ), 0) AS rental_value,
  COALESCE(sum(p.value) FILTER (
    WHERE p.extra->>'propertyType' = 'vivienda_habitual'
      OR p.extra->>'status' IN ('vivienda_habitual', 'uso_propio')
  ), 0) AS habitual_value,
  COALESCE(sum(COALESCE(NULLIF(p.extra->>'monthlyRent', '')::numeric, 0)), 0) AS monthly_gross_rent,
  COALESCE(sum(COALESCE(NULLIF(p.extra->>'ttmNetCashflow', '')::numeric, 0)), 0) AS ttm_net_cashflow,
  COALESCE(sum(COALESCE(NULLIF(p.extra->>'ttmNetCashflow', '')::numeric, 0)), 0) / 12.0 AS monthly_net,
  count(*) FILTER (WHERE p.extra->>'status' = 'alquilado')::int AS rented,
  count(*) FILTER (WHERE p.extra->>'status' = 'vacio')::int AS vacant,
  count(*) FILTER (WHERE p.extra->>'status' = 'reforma')::int AS renovation,
  count(*) FILTER (
    WHERE COALESCE(p.extra->>'valueSource', '') <> 'mercado' OR p.value <= 0
  )::int AS missing_market_value
FROM public.v_positions p
WHERE p.kind = 'asset' AND p.class = 'real_estate'
GROUP BY p.user_id;

CREATE OR REPLACE FUNCTION public.patrimonio_ia()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expenses numeric;
  target_months numeric;
  target_asked boolean;
  idle numeric := 0;
  parked numeric := 0;
  working numeric := 0;
  emergency_assigned numeric := 0;
  unparked numeric := 0;
  emergency_assumed boolean := false;
  emergency_have numeric := 0;
  emergency_target numeric := 0;
  emergency_gap numeric := 0;
  emergency_months numeric;
  monthly_interest numeric := 0;
  monthly_debt numeric := 0;
  expensive_debt numeric := 0;
  re public.v_real_estate_yield%ROWTYPE;
  verdict text;
  headline text;
  actions jsonb := '[]'::jsonb;
  questions jsonb := '[]'::jsonb;
  missing jsonb := '[]'::jsonb;
  parked_blank int := 0;
  parked_names text;
  net_yield numeric;
  gross_yield numeric;
BEGIN
  SELECT monthly_expenses, emergency_target_months
    INTO expenses, target_months
  FROM public.profiles
  LIMIT 1;

  expenses := COALESCE(expenses, 0);
  target_asked := target_months IS NOT NULL AND target_months > 0;
  target_months := COALESCE(NULLIF(target_months, 0), 6);

  SELECT
    COALESCE(sum(value) FILTER (WHERE job = 'idle'), 0),
    COALESCE(sum(value) FILTER (WHERE job = 'parked'), 0),
    COALESCE(sum(value) FILTER (WHERE job = 'working'), 0),
    COALESCE(sum(value) FILTER (WHERE job = 'emergency'), 0),
    COALESCE(sum(value * interest_rate / 100.0 / 12.0), 0),
    count(*) FILTER (WHERE job = 'parked' AND parked_reason IS NULL),
    string_agg(name, ', ') FILTER (WHERE job = 'parked' AND parked_reason IS NULL)
  INTO idle, parked, working, emergency_assigned, monthly_interest, parked_blank, parked_names
  FROM public.v_cash_jobs;

  unparked := emergency_assigned + working + idle;
  emergency_assumed := emergency_assigned <= 0 AND unparked > 0;
  emergency_have := CASE WHEN emergency_assumed THEN unparked ELSE emergency_assigned END;
  emergency_target := CASE WHEN expenses > 0 THEN target_months * expenses ELSE 0 END;
  emergency_gap := GREATEST(0, emergency_target - emergency_have);
  emergency_months := CASE WHEN expenses > 0 THEN round((emergency_have / expenses) * 10) / 10 ELSE NULL END;

  SELECT COALESCE(sum(monthly_payment), 0) INTO monthly_debt FROM public.liabilities;

  SELECT COALESCE(sum(balance), 0) INTO expensive_debt
  FROM public.liabilities
  WHERE type = 'credit_card' OR COALESCE(interest_rate, 0) > 10;

  SELECT * INTO re FROM public.v_real_estate_yield LIMIT 1;

  IF re.rental_value > 0 AND re.monthly_gross_rent > 0 THEN
    gross_yield := round((re.monthly_gross_rent * 12 / re.rental_value) * 1000) / 10;
  END IF;
  IF re.rental_value > 0 THEN
    net_yield := round((re.ttm_net_cashflow / re.rental_value) * 1000) / 10;
  END IF;

  IF expenses <= 0 THEN
    missing := missing || jsonb_build_array('monthly_expenses');
    questions := questions || jsonb_build_array(jsonb_build_object(
      'id', 'expenses',
      'prompt', '¿Cuánto gastas al mes para vivir?',
      'why', 'Sin ese número no se puede decir si el colchón o la renta cubren tu vida.'
    ));
  END IF;

  IF NOT target_asked THEN
    questions := questions || jsonb_build_array(jsonb_build_object(
      'id', 'emergency_target',
      'prompt', '¿Cuántos meses de gastos quieres dejar de emergencia?',
      'why', 'Por defecto usamos 6 meses. El colchón se mide contra tu número.'
    ));
  END IF;

  IF idle > 0 THEN
    questions := questions || jsonb_build_array(jsonb_build_object(
      'id', 'idle_cash',
      'prompt', format('Hay %s € parados. ¿Es colchón, está aparcado por algo, o sobra para que rinda?', round(idle)),
      'why', 'El efectivo sin trabajo ni motivo es el hueco más fácil de leer.'
    ));
  END IF;

  IF parked_blank > 0 THEN
    questions := questions || jsonb_build_array(jsonb_build_object(
      'id', 'parked_reason',
      'prompt', format('¿Para qué está aparcado el dinero de %s?', parked_names),
      'why', 'Si no hay motivo, no está aparcado: está parado.'
    ));
  END IF;

  IF expensive_debt > 0 THEN
    actions := actions || jsonb_build_array(jsonb_build_object(
      'id', 'expensive_debt',
      'title', 'Liquida la deuda cara',
      'detail', 'Hay pasivos con interés alto o tarjeta. Eso manda sobre cualquier cuenta remunerada.'
    ));
  END IF;

  IF expenses > 0 AND emergency_gap > 0 THEN
    actions := actions || jsonb_build_array(jsonb_build_object(
      'id', 'fill_emergency',
      'title', format('Completa el colchón (%s meses)', target_months),
      'detail', format('Faltan %s € en efectivo de emergencia, no en fondos.', round(emergency_gap))
    ));
  END IF;

  IF idle > 0 AND NOT (emergency_assumed AND emergency_gap > 0) THEN
    actions := actions || jsonb_build_array(jsonb_build_object(
      'id', 'assign_idle',
      'title', 'Ponle un trabajo al efectivo parado',
      'detail', format('%s € al 0%% y sin motivo. O es emergencia, o está aparcado, o debería rendir.', round(idle))
    ));
  END IF;

  IF COALESCE(re.vacant, 0) > 0 THEN
    actions := actions || jsonb_build_array(jsonb_build_object(
      'id', 'vacant_re',
      'title', format('%s inmuebles vacíos', re.vacant),
      'detail', 'El valor está en el patrimonio; el neto del año no. El hueco está en Finca.'
    ));
  END IF;

  IF COALESCE(re.monthly_gross_rent, 0) > 0 AND COALESCE(re.ttm_net_cashflow, 0) = 0 THEN
    missing := missing || jsonb_build_array('real_estate_ttm_net');
  END IF;

  IF COALESCE(re.missing_market_value, 0) > 0 THEN
    missing := missing || jsonb_build_array('real_estate_market_value');
  END IF;

  IF expenses <= 0 THEN
    verdict := 'unknown';
    headline := 'Falta tu gasto mensual para saber si el patrimonio está bien o mal.';
  ELSIF expensive_debt > 0 THEN
    verdict := 'weak';
    headline := 'Hay deuda cara. Eso manda sobre cualquier otra decisión.';
  ELSIF emergency_months IS NOT NULL AND emergency_months < 1 THEN
    verdict := 'weak';
    headline := 'El colchón no cubre un mes. Prioridad: liquidez, no más ladrillo.';
  ELSIF emergency_gap > 0 THEN
    verdict := 'ok';
    headline := format('Colchón: %s meses. Te faltan %s € para llegar a %s.', emergency_months, round(emergency_gap), target_months);
  ELSIF idle > 0 THEN
    verdict := 'ok';
    headline := format('El colchón está. %s € están parados al 0%%.', round(idle));
  ELSIF COALESCE(re.properties, 0) > 0 AND COALESCE(re.ttm_net_cashflow, 0) <> 0 THEN
    verdict := 'solid';
    headline := format('El efectivo tiene trabajo. El inmobiliario deja %s € netos al año.', round(re.ttm_net_cashflow));
  ELSIF COALESCE(re.properties, 0) > 0 THEN
    verdict := 'solid';
    headline := 'El efectivo tiene trabajo. Del inmobiliario solo hay valor, no un neto claro.';
  ELSE
    verdict := 'solid';
    headline := 'El efectivo tiene trabajo. No hay dinero parado sin motivo.';
  END IF;

  IF verdict = 'solid' AND (COALESCE(re.vacant, 0) > 0 OR idle > 0 OR emergency_gap > 0) THEN
    verdict := 'ok';
  END IF;

  RETURN jsonb_build_object(
    'asOf', now(),
    'currency', 'EUR',
    'howto', 'Briefing de patrimonio. No inventes cifras. Lee diagnosis antes de opinar. Inmuebles source=finca son read-only. Hipotecas = class=mortgage kind=liability. stocks/crypto NO son emergencia. Usa ttmNetCashflow, no el alquiler bruto.',
    'totals', (SELECT to_jsonb(t) FROM public.v_net_worth t LIMIT 1),
    'monthlyExpenses', expenses,
    'emergencyTargetMonths', target_months,
    'money', jsonb_build_object(
      'emergency', emergency_have,
      'emergencyAssigned', emergency_assigned,
      'emergencyAssumed', emergency_assumed,
      'parked', parked,
      'working', working,
      'idle', idle,
      'emergencyTarget', emergency_target,
      'emergencyGap', emergency_gap,
      'emergencyMonths', emergency_months
    ),
    'realEstate', jsonb_build_object(
      'properties', COALESCE(re.properties, 0),
      'value', COALESCE(re.value, 0),
      'rentalValue', COALESCE(re.rental_value, 0),
      'habitualValue', COALESCE(re.habitual_value, 0),
      'monthlyGrossRent', COALESCE(re.monthly_gross_rent, 0),
      'ttmNetCashflow', COALESCE(re.ttm_net_cashflow, 0),
      'monthlyNet', COALESCE(re.monthly_net, 0),
      'grossYieldPct', gross_yield,
      'netYieldPct', net_yield,
      'rented', COALESCE(re.rented, 0),
      'vacant', COALESCE(re.vacant, 0),
      'missingMarketValue', COALESCE(re.missing_market_value, 0)
    ),
    'cashflow', jsonb_build_object(
      'monthlyExpenses', expenses,
      'monthlyDebtPayments', monthly_debt,
      'monthlyCashInterest', round(monthly_interest * 100) / 100,
      'monthlyGrossPassive', round((COALESCE(re.monthly_gross_rent, 0) + monthly_interest) * 100) / 100,
      'monthlyNetPassive', round((COALESCE(re.monthly_net, 0) + monthly_interest) * 100) / 100
    ),
    'diagnosis', jsonb_build_object(
      'verdict', verdict,
      'headline', headline,
      'actions', actions,
      'questions', questions,
      'missing', missing
    ),
    'allocation', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.value DESC), '[]'::jsonb) FROM public.v_allocation a),
    'positions', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.kind, p.class, p.name), '[]'::jsonb) FROM public.v_positions p)
  );
END;
$$;

GRANT SELECT ON public.v_cash_jobs TO authenticated;
GRANT SELECT ON public.v_real_estate_yield TO authenticated;
GRANT EXECUTE ON FUNCTION public.patrimonio_ia() TO authenticated;

COMMENT ON VIEW public.v_cash_jobs IS 'Efectivo por trabajo: emergency | parked | working | idle. parked no es colchón.';
COMMENT ON VIEW public.v_real_estate_yield IS 'Valor inmobiliario + bruto contratado + neto TTM. El neto manda, no el alquiler.';
COMMENT ON FUNCTION public.patrimonio_ia() IS 'SELECT patrimonio_ia(); briefing + money + realEstate + diagnosis.verdict.';

INSERT INTO public.ai_guide (sort, topic, content) VALUES
(1, 'start_here',
 $g$Eres una IA con acceso al Postgres de Fuck You Money, el balance consolidado del patrimonio de Jose (EUR).

Pasos:
1. SELECT patrimonio_ia();
2. Lee diagnosis.verdict y diagnosis.headline ANTES de opinar.
3. SELECT * FROM v_cash_jobs;
4. SELECT * FROM v_real_estate_yield;
5. SELECT * FROM v_positions;

Reglas:
- No inventes números. Si falta un campo, dilo (diagnosis.missing).
- verdict: unknown = faltan datos; weak = mal ahora; ok = bien con matices; solid = en orden.
- Efectivo: emergency / parked / working / idle. parked NO es colchón. idle = parado al 0% sin motivo.
- stocks, etf, crypto NO son emergencia. Son inversión. Pueden bajar.
- Inmuebles: usa ttmNetCashflow (neto 12 meses), NUNCA monthlyRent como si fuera neto.
- Inmuebles source=finca o institution=finca son SOLO LECTURA. La gestión es la app Finca.
- Finca NO guarda el principal de hipoteca. Hipotecas = liabilities type=mortgage.
- Autonomía = (liquid cash, no fondos − deudas) / monthly_expenses. El ladrillo NO entra.
- No digas "diversifica inmuebles": el ladrillo ES el negocio. Habla de vacío, neto y valores de mercado.
- App: https://fuckyoumoney.vercel.app  Finca: https://lasfincas.vercel.app
$g$),
(2, 'tables',
 $g$profiles — monthly_expenses = gasto de vida. emergency_target_months = meses de colchón (NULL = no lo ha dicho, asume 6).
assets — type: cash, stock, etf, crypto, commodity, real_estate, pension, bond, other, vehicle, business, receivable.
  Valor = manual_value si > 0; si no, quantity * purchase_price.
  extra (metadata || notes FYM1) para cash: job, interestRate, parkedReason.
  extra para real_estate: monthlyRent (bruto), ttmNetCashflow (neto año), status, valueSource.
liabilities — type: mortgage, personal_loan, car_loan, credit_card, student_loan, other. balance = principal vivo.
v_cash_jobs — una fila por cuenta, con job.
v_real_estate_yield — valor, bruto, neto TTM, vacíos, sin valor de mercado.
v_positions / v_net_worth / v_allocation — vistas unificadas.
$g$),
(3, 'finca',
 $g$Los inmuebles operativos viven en otro Postgres (Finca). Aquí solo hay el dato macro: valor de Jose, renta bruta, neto TTM, estado.
No hay inquilinos, DNI, facturas ni Drive.
Si ttmNetCashflow = 0 y monthlyRent > 0, el bruto está y el neto no: o no hay movimientos en Finca, o el año aún no produjo.
$g$),
(4, 'how_to_judge',
 $g$Orden de prioridad para concluir:
1. Si monthly_expenses es null/0 → no juzgues. Pregunta el gasto.
2. Deuda cara (tarjeta o TIN > 10%) → lo primero es liquidarla.
3. Colchón = cash job=emergency. Si nadie está tagged, se asume el efectivo no aparcado. Pregunta cuántos meses quiere (3/6/12).
4. idle > 0 después del colchón → o se aparca con motivo (impuestos, reforma, entrada) o se pone a rendir.
5. parked sin parkedReason → pregunta el motivo. Sin motivo es idle.
6. Inmuebles: valor + neto TTM + vacíos + pisos sin valor de mercado. El bruto contratado es expectativa, no caja.
7. No trates el patrimonio inmobiliario alto como un error de asignación.
$g$)
ON CONFLICT (sort) DO UPDATE SET topic = EXCLUDED.topic, content = EXCLUDED.content;
