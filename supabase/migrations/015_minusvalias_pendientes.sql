-- Minusvalías pendientes de compensar, una fila por usuario y año.
-- La última escritura de ese año sustituye importe y compensado.
-- No inventa pérdidas: la tabla nace vacía.
-- Caducidad (en la app, no aquí): el año N se puede compensar hasta el final de N+4.
-- La API escribe con ON CONFLICT (user_id, anio) DO UPDATE.
-- RLS: cada usuario autenticado solo ve y escribe las suyas (auth.uid() = user_id).
-- postgres y la API (DATABASE_URL) no pasan por RLS. La app sí.

CREATE TABLE IF NOT EXISTS public.minusvalias_pendientes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  anio integer NOT NULL CHECK (anio >= 1990 AND anio <= 2100),
  importe numeric NOT NULL CHECK (importe > 0),
  compensado numeric NOT NULL DEFAULT 0 CHECK (compensado >= 0 AND compensado <= importe),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anio)
);

ALTER TABLE public.minusvalias_pendientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minusvalias_pendientes_own ON public.minusvalias_pendientes;
CREATE POLICY minusvalias_pendientes_own ON public.minusvalias_pendientes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.minusvalias_pendientes TO authenticated;
