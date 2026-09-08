-- Fondos que cayeron en type=other (sin assetType el mapper viejo devolvía other).
UPDATE public.assets
SET type = 'etf'
WHERE type = 'other'
  AND ticker IS NOT NULL
  AND ticker <> '';

INSERT INTO public.ai_guide (sort, topic, content) VALUES
(6, 'investments',
 $g$Cartera financiera (no el ladrillo):
- class/type etf o stock. ticker o extra.isin identifican el producto (VWCE.DE, IE00BK5BQT80).
- extra.assetType: etf | fondo_indexado | fondo_activo | accion.
- extra.region: world | us | europe | em | spain | asia | mixed.
- extra.assetClass: equity | bonds | mixed | money_market | commodity | real_estate.
- extra.broker: intermediario (Indexa, MyInvestor, IBKR…).
- type=other CON ticker = fondo mal grabado; trátalo como etf.
- Diversificación de ESTA manga: concentración por ticker, región y clase. El 70% ladrillo es otro tema (diagnosis.mix).
$g$)
ON CONFLICT (sort) DO UPDATE SET topic = EXCLUDED.topic, content = EXCLUDED.content;
