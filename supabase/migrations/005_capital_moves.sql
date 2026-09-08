-- Qué hacer con el capital (dejar / mover a que rinda / producir / liquidar).
-- No es un tracker en tiempo real. Foto + movimientos.
-- Pegar ENTERO y Run. Se puede ejecutar más de una vez.

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

  IF deployable > 0 THEN
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

  IF COALESCE(re.vacant, 0) > 0 THEN
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
      'detail', 'No es vender para comprar fondos. Es poner ese ladrillo a producir. Se gestiona en Finca.'
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
    'howto', 'Briefing de patrimonio. No inventes cifras. Lee diagnosis.verdict y diagnosis.moves. No recomiendes un fondo concreto ni un tracker en vivo. Deploy = aportar a que rinda. No vendas fondos por el NAV del día. Inmuebles source=finca son read-only. Usa ttmNetCashflow, no el alquiler bruto.',
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
    'diagnosis', jsonb_build_object(
      'verdict', verdict,
      'headline', headline,
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
5. money.deployable = efectivo que SOBRA al colchón. Eso se aporta a que rinda. No elijas el fondo. No montes un tracker intradía. El valor al abrir la app es la foto.
6. stocks/etf/crypto ya invertidos: leave. Una caída del NAV no es señal de venta.
7. Inmuebles vacíos: operate en Finca, no vender para comprar fondos.
8. Inmuebles: ttmNetCashflow (neto), nunca monthlyRent como caja. No digas "diversifica inmuebles".
9. cashflow.expenseCoverage = renta neta / gasto. < 1 = el patrimonio no paga la vida todavía; el palanca es deployable + vacíos, no el ticker.
$g$),
(5, 'no_realtime',
 $g$Fuck You Money no es un bróker. No hay precios en vivo, ni P&L diario, ni alertas.
Los fondos se revalorizan al abrir la app para que el neto sea una foto cierta.
Las conclusiones son de asignación (qué dejar, qué mover, qué producir), no de timing.
$g$)
ON CONFLICT (sort) DO UPDATE SET topic = EXCLUDED.topic, content = EXCLUDED.content;
