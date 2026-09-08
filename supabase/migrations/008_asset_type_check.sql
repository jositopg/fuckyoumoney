-- El CHECK de type se quedó corto: vehicle/business/receivable existen en el enum
-- y en la app, pero el INSERT/UPDATE los rechazaba.
-- ticker_source NULL tiene que ser legal (cuentas sin ticker).

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_type_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_type_check CHECK (
  type = ANY (ARRAY[
    'stock'::text,
    'etf'::text,
    'crypto'::text,
    'commodity'::text,
    'real_estate'::text,
    'cash'::text,
    'bond'::text,
    'pension'::text,
    'other'::text,
    'vehicle'::text,
    'business'::text,
    'receivable'::text
  ])
);

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_ticker_source_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_ticker_source_check CHECK (
  ticker_source IS NULL OR ticker_source = ANY (ARRAY['yahoo'::text, 'coingecko'::text])
);
