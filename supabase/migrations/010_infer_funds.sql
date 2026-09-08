-- Fondos metidos como "otro" por el nombre (Inbestme, Numantia, ETF…).
UPDATE public.assets
SET type = 'etf'
WHERE type = 'other'
  AND (
    ticker IS NOT NULL AND ticker <> ''
    OR name ~* '(etf|fondo|inbestme|indexa|vanguard|numantia|ishares|amundi|vwce|iwda)'
  );
