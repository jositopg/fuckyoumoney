-- Reparto objetivo del perfil. Sin esta columna, o si es null, no hay aviso.
-- No rellena filas y no cambia saldos ni el gasto.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asignacion_objetivo jsonb;

COMMENT ON COLUMN public.profiles.asignacion_objetivo IS
  'inmuebles, bolsa y liquidez en enteros que suman 100, y tolerancia en puntos. Sin objetivo no hay aviso.';
