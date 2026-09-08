-- Colchón (puede remunerar) + apartado con motivo. El resto a fondos.
-- TAE de cuenta no es invertirlo. Pegar ENTERO y Run.

CREATE OR REPLACE VIEW public.v_cash_jobs
  WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.id,
  p.name,
  p.value,
  CASE
    WHEN p.extra->>'job' IN ('emergency', 'parked') THEN p.extra->>'job'
    ELSE 'idle'
  END AS job,
  NULLIF(p.extra->>'parkedReason', '') AS parked_reason,
  COALESCE(NULLIF(p.extra->>'interestRate', '')::numeric, 0) AS interest_rate,
  p.extra
FROM public.v_positions p
WHERE p.kind = 'asset' AND p.class = 'cash';

COMMENT ON VIEW public.v_cash_jobs IS
  'emergency = colchón (TAE ok). parked = apartado con parked_reason. idle = a fondos. TAE no cambia el job.';


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
  invested numeric := 0;
  deployable numeric := 0;
  monthly_net_passive numeric := 0;
  expense_coverage numeric;
  re public.v_real_estate_yield%ROWTYPE;
  verdict text;
  headline text;
  actions jsonb := '[]'::jsonb;
  questions jsonb := '[]'::jsonb;
  missing jsonb := '[]'::jsonb;
  moves jsonb := '[]'::jsonb;
  parked_blank int := 0;
  parked_names text;
  net_yield numeric;
  gross_yield numeric;
  total_assets numeric := 0;
  mix_re_pct numeric := 0;
  mix_cash_pct numeric := 0;
  mix_invested_pct numeric := 0;
  mix_shock numeric;
  mix_shock_target numeric := 6;
  mix_stance text := 'ok';
  mix_headline text := '';
  mix_detail text := '';
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

  SELECT COALESCE(sum(value), 0) INTO invested
  FROM public.v_positions
  WHERE kind = 'asset' AND class IN ('stock', 'etf', 'crypto');

  deployable := CASE
    WHEN expenses <= 0 THEN 0
    WHEN emergency_assumed THEN GREATEST(0, unparked - emergency_target)
    ELSE GREATEST(0, idle)
  END;

  SELECT * INTO re FROM public.v_real_estate_yield LIMIT 1;

  monthly_net_passive := round((COALESCE(re.monthly_net, 0) + monthly_interest) * 100) / 100;
  IF expenses > 0 THEN
    expense_coverage := round((monthly_net_passive / expenses) * 1000) / 1000;
  END IF;

  SELECT COALESCE(sum(value), 0) INTO total_assets
  FROM public.v_positions WHERE kind = 'asset';

  IF total_assets > 0 THEN
    mix_re_pct := round((COALESCE(re.value, 0) / total_assets) * 1000) / 10;
    mix_cash_pct := round(((unparked + parked) / total_assets) * 1000) / 10;
    mix_invested_pct := round((invested / total_assets) * 1000) / 10;
  END IF;
  mix_shock_target := CASE WHEN mix_re_pct >= 60 THEN 12 ELSE 6 END;
  IF expenses > 0 THEN
    mix_shock := round((unparked / expenses) * 10) / 10;
  END IF;

  IF COALESCE(re.properties, 0) = 0 THEN
    mix_stance := 'ok';
    mix_headline := 'Sin ladrillo no hay sesgo inmobiliario que juzgar.';
    mix_detail := 'La mezcla se mira cuando hay inmuebles y otra cosa al lado.';
  ELSIF expenses <= 0 THEN
    mix_stance := 'unknown';
    mix_headline := format('El ladrillo es el %s%% del patrimonio.', mix_re_pct);
    mix_detail := format('Efectivo %s%% · fondos %s%%. Sin tu gasto no se sabe si el efectivo aguanta un parón. No vendas hasta saberlo.', mix_cash_pct, mix_invested_pct);
  ELSIF mix_re_pct < 60 THEN
    mix_stance := 'ok';
    mix_headline := format('La mezcla no está atrapada en ladrillo (%s%%).', mix_re_pct);
    mix_detail := CASE WHEN mix_shock IS NOT NULL THEN format('Si el alquiler para, el efectivo cubre %s meses.', mix_shock) ELSE 'Hay margen fuera del inmueble.' END;
  ELSIF mix_shock IS NOT NULL AND mix_shock < 6 THEN
    mix_stance := 'divest_brick';
    mix_headline := 'Si el alquiler para, el efectivo no llega a 6 meses.';
    mix_detail := format('Ladrillo %s%% · efectivo %s%%. Equilibrar es vender (vacíos), no aportar a fondos.', mix_re_pct, mix_cash_pct);
  ELSIF mix_shock IS NOT NULL AND mix_shock < mix_shock_target AND COALESCE(re.vacant, 0) >= 2 THEN
    mix_stance := 'divest_brick';
    mix_headline := format('El ladrillo pesa %s%% y hay %s vacíos.', mix_re_pct, re.vacant);
    mix_detail := format('Si el alquiler para, el efectivo cubre %s meses. Los vacíos son los candidatos a vender.', mix_shock);
  ELSIF mix_shock IS NOT NULL AND mix_shock >= 6 AND mix_invested_pct < 15 THEN
    mix_stance := 'rebalance_with_cash';
    mix_headline := format('El ladrillo pesa %s%%, pero no hace falta vender.', mix_re_pct);
    mix_detail := format('Si el alquiler para, el efectivo cubre %s meses. Equilibra con fondos, no deshaciendo pisos.', mix_shock);
  ELSE
    mix_stance := 'ok';
    mix_headline := format('Ladrillo %s%%, y hay colchón de golpe.', mix_re_pct);
    mix_detail := format('Fondos %s%% · efectivo %s%%.', mix_invested_pct, mix_cash_pct);
  END IF;

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
    IF unparked > 0 THEN
      moves := moves || jsonb_build_array(jsonb_build_object(
        'id', 'need_expenses',
        'stance', 'classify',
        'amount', round(unparked),
        'title', 'Efectivo sin partir',
        'detail', 'Sin el gasto mensual no se sabe cuánto es colchón y cuánto sobra para fondos.'
      ));
    END IF;
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
    moves := moves || jsonb_build_array(jsonb_build_object(
      'id', 'expensive_debt',
      'stance', 'pay_down',
      'amount', round(expensive_debt),
      'title', 'Deuda cara',
      'detail', 'Antes de aportar a fondos.'
    ));
  END IF;

  IF expenses > 0 AND emergency_gap > 0 THEN
    actions := actions || jsonb_build_array(jsonb_build_object(
      'id', 'fill_emergency',
      'title', format('Completa el colchón (%s meses)', target_months),
      'detail', format('Faltan %s € en efectivo de emergencia, no en fondos.', round(emergency_gap))
    ));
    moves := moves || jsonb_build_array(jsonb_build_object(
      'id', 'fill_emergency',
      'stance', 'leave',
      'amount', round(emergency_gap),
      'title', format('Apartar a colchón (%s meses)', target_months),
      'detail', 'Ese trozo se deja en efectivo. No va a fondos.'
    ));
  END IF;

  IF emergency_assumed AND expenses > 0 AND emergency_gap <= 0 AND emergency_target > 0 THEN
    moves := moves || jsonb_build_array(jsonb_build_object(
      'id', 'hold_cushion',
      'stance', 'leave',
      'amount', round(emergency_target),
      'title', format('Colchón (%s meses)', target_months),
      'detail', 'Se queda en efectivo. Márcalo en las cuentas para no volver a mezclarlo.'
    ));
  END IF;

  IF deployable > 0 AND mix_stance IS DISTINCT FROM 'divest_brick' THEN
    actions := actions || jsonb_build_array(jsonb_build_object(
      'id', 'deploy_idle',
      'title', 'El sobrante tiene que rendir',
      'detail', format('%s € no son colchón. A fondos. Eligiendo el fondo no se gana; moviéndolo, sí.', round(deployable))
    ));
    moves := moves || jsonb_build_array(jsonb_build_object(
      'id', 'deploy_idle',
      'stance', 'deploy',
      'amount', round(deployable),
      'title', CASE WHEN emergency_assumed THEN 'Sobrante de cuentas → que rinda' ELSE 'Efectivo parado → que rinda' END,
      'detail', CASE WHEN invested > 0
        THEN 'Aportar a lo que ya está invertido. No hace falta un tracker: el valor al abrir la app es la foto.'
        ELSE 'A fondos. No hace falta elegir el producto aquí, ni seguir el mercado cada día.'
      END
    ));
  END IF;

  IF working > 0 AND expenses > 0 AND emergency_gap <= 0 AND working >= expenses THEN
    moves := moves || jsonb_build_array(jsonb_build_object(
      'id', 'working_surplus',
      'stance', 'deploy',
      'amount', round(working),
      'title', 'Efectivo que rinde poco',
      'detail', 'TAE de cuenta no es un fondo. Si no lo vas a gastar en 1–3 años, también a que rinda de verdad.'
    ));
  END IF;

  IF COALESCE(re.vacant, 0) > 0 AND mix_stance = 'divest_brick' THEN
    moves := moves || jsonb_build_array(jsonb_build_object(
      'id', 'divest_vacant',
      'stance', 'divest',
      'amount', NULL,
      'title', format('%s inmuebles vacíos → vender', re.vacant),
      'detail', 'Si pasa algo, no hay efectivo de sobra. Los vacíos se venden; lo alquilado, no.'
    ));
  ELSIF COALESCE(re.vacant, 0) > 0 THEN
    actions := actions || jsonb_build_array(jsonb_build_object(
      'id', 'vacant_re',
      'title', format('%s inmuebles vacíos', re.vacant),
      'detail', 'El valor está en el patrimonio; el neto del año no. El hueco está en Finca.'
    ));
    moves := moves || jsonb_build_array(jsonb_build_object(
      'id', 'vacant_re',
      'stance', 'operate',
      'amount', NULL,
      'title', format('%s inmuebles vacíos', re.vacant),
      'detail', CASE WHEN mix_stance = 'rebalance_with_cash'
        THEN 'Ponerlos a producir. El equilibrio sale del efectivo a fondos, no de vender lo alquilado.'
        ELSE 'Ponerlos a producir. Vender solo si el golpe no se cubre con efectivo.'
      END
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
  ELSIF emergency_gap > 0 AND deployable > 0 THEN
    verdict := 'ok';
    headline := format('Aparta %s € de colchón. %s € sobran: a que rindan.', round(emergency_gap), round(deployable));
  ELSIF emergency_gap > 0 THEN
    verdict := 'ok';
    headline := format('Colchón: %s meses. Te faltan %s € para llegar a %s.', emergency_months, round(emergency_gap), target_months);
  ELSIF deployable > 0 THEN
    verdict := 'ok';
    headline := format('El colchón está. %s € deberían estar rindiendo, no en cuenta.', round(deployable));
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

  IF verdict = 'solid' AND (COALESCE(re.vacant, 0) > 0 OR idle > 0 OR deployable > 0 OR emergency_gap > 0) THEN
    verdict := 'ok';
  END IF;

  RETURN jsonb_build_object(
    'asOf', now(),
    'currency', 'EUR',
    'howto', 'Briefing. Lee diagnosis.verdict, diagnosis.mix y diagnosis.moves. mix.stance=divest_brick → reducir ladrillo (vacíos). rebalance_with_cash → NO vender, equilibrar con fondos. Ladrillo alto no es vender por defecto. Usa ttmNetCashflow, no el alquiler bruto.',
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
      'emergencyMonths', emergency_months,
      'deployable', round(deployable),
      'invested', round(invested)
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
      'monthlyNetPassive', monthly_net_passive,
      'expenseCoverage', expense_coverage
    ),
    'mix', jsonb_build_object(
      'realEstatePct', mix_re_pct,
      'cashPct', mix_cash_pct,
      'investedPct', mix_invested_pct,
      'shockMonths', mix_shock,
      'shockTargetMonths', mix_shock_target,
      'stance', mix_stance,
      'headline', mix_headline,
      'detail', mix_detail
    ),
    'diagnosis', jsonb_build_object(
      'verdict', verdict,
      'headline', headline,
      'mix', jsonb_build_object(
        'realEstatePct', mix_re_pct,
        'cashPct', mix_cash_pct,
        'investedPct', mix_invested_pct,
        'shockMonths', mix_shock,
        'shockTargetMonths', mix_shock_target,
        'stance', mix_stance,
        'headline', mix_headline,
        'detail', mix_detail
      ),
      'moves', moves,
      'actions', actions,
      'questions', questions,
      'missing', missing
    ),
    'allocation', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.value DESC), '[]'::jsonb) FROM public.v_allocation a),
    'positions', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.kind, p.class, p.name), '[]'::jsonb) FROM public.v_positions p)
  );
END;
$$;

COMMENT ON FUNCTION public.patrimonio_ia() IS 'SELECT patrimonio_ia(); briefing + diagnosis.moves (leave/deploy/operate/pay_down/classify). Foto, no ticker.';

INSERT INTO public.ai_guide (sort, topic, content) VALUES
(4, 'how_to_judge',
 $g$Orden para concluir. Foto del patrimonio, no análisis en tiempo real.

1. Si monthly_expenses es null/0 → no juzgues. Pregunta el gasto. Sin eso no se parte el efectivo.
2. Lee diagnosis.moves: leave = dejar; deploy = mover a que rinda (fondos); operate = poner inmueble a producir; pay_down = liquidar deuda; classify = asignar.
3. Deuda cara → pay_down antes de aportar a fondos.
4. Colchón = leave en efectivo. Nunca fondos ni cripto.
5. money.deployable = efectivo que no es colchón ni parked. A fondos. TAE de cuenta NO es invertirlo. El colchón SÍ puede estar remunerado.
5b. parked exige parkedReason (reforma, juicio, impuestos, entrada…). Sin motivo es idle.
6. stocks/etf/crypto ya invertidos: leave. Una caída del NAV no es señal de venta.
7. Lee diagnosis.mix.stance:
   - ok → la mezcla aguanta.
   - rebalance_with_cash → el ladrillo pesa, PERO NO VENDAS. Equilibra aportando efectivo a fondos.
   - divest_brick → si el alquiler para, el efectivo no llega. Reduce ladrillo, empezando por vacíos. No aportes a fondos (empeorarías el colchón).
   - unknown → falta el gasto mensual.
8. Ladrillo alto no es un error por sí solo. El test es: ¿aguanta el efectivo un parón de alquiler? 6 meses mínimo; 12 si el ladrillo ≥ 60%.
9. Inmuebles: ttmNetCashflow (neto), nunca monthlyRent como caja.
10. cashflow.expenseCoverage = renta neta / gasto.
$g$),
(5, 'no_realtime',
 $g$Fuck You Money no es un bróker. No hay precios en vivo, ni P&L diario, ni alertas.
Los fondos se revalorizan al abrir la app para que el neto sea una foto cierta.
Las conclusiones son de asignación (qué dejar, qué mover, qué producir), no de timing.
$g$)
ON CONFLICT (sort) DO UPDATE SET topic = EXCLUDED.topic, content = EXCLUDED.content;
