-- Fotos diarias por posición. Una fila por usuario, posición y día: la última escritura gana.
-- created_at se queda en la primera inserción.
-- No inventa histórico. El backfill solo apunta el valor de hoy (Europe/Madrid)
-- y no reescribe assets ni liabilities.
-- participaciones solo si extra.participaciones es un número > 0.
-- assets.quantity = 1 no son títulos.
-- RLS: cada usuario autenticado solo ve y escribe sus filas (auth.uid() = user_id).
-- postgres y la API (DATABASE_URL) no pasan por RLS. La app sí.

CREATE TABLE IF NOT EXISTS public.position_snapshots (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  position_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('asset', 'liability')),
  fecha date NOT NULL,
  valor numeric NOT NULL,
  participaciones numeric,
  precio_por_participacion numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, position_id, fecha)
);

CREATE INDEX IF NOT EXISTS position_snapshots_user_fecha_idx
  ON public.position_snapshots (user_id, fecha);

ALTER TABLE public.position_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS position_snapshots_own ON public.position_snapshots;
CREATE POLICY position_snapshots_own ON public.position_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_snapshots TO authenticated;

INSERT INTO public.position_snapshots (
  user_id, position_id, kind, fecha, valor, participaciones, precio_por_participacion
)
SELECT
  p.user_id,
  p.id,
  p.kind,
  (timezone('Europe/Madrid', now()))::date,
  p.value,
  CASE
    WHEN p.shares ~ '^[0-9]+([.][0-9]+)?$'
    THEN CASE WHEN p.shares::numeric > 0 THEN p.shares::numeric END
  END,
  CASE
    WHEN p.shares ~ '^[0-9]+([.][0-9]+)?$'
    THEN CASE
      WHEN p.shares::numeric > 0 AND p.value > 0
      THEN round(p.value / p.shares::numeric, 4)
    END
  END
FROM (
  SELECT user_id, id, kind, value, extra->>'participaciones' AS shares
  FROM public.v_positions
) p
ON CONFLICT (user_id, position_id, fecha) DO UPDATE SET
  valor = EXCLUDED.valor,
  participaciones = EXCLUDED.participaciones,
  precio_por_participacion = EXCLUDED.precio_por_participacion,
  kind = EXCLUDED.kind;
