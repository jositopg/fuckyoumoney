# F*ck You Money

App Vite + React + TypeScript.

## Desarrollo

```bash
npm install
cp .env.example .env
npm run dev
```

## Env (Supabase)

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY (anon only)

Set both in Vercel Project Settings -> Environment Variables for Production and Preview.

## Sync

Logged-in: CRUD assets/liabilities (inmuebles de Finca son solo lectura),
migración localStorage one-shot, sync `POST /api/sync-finca`.
No hay chat IA en la app: el patrimonio se consulta desde la terminal con `npm run wealth`.
Arquitectura: `AGENTS.md`. Schema: `supabase/README.md`.

## Scripts

```bash
npx vitest run
npm run build
```

## API del patrimonio

`GET/POST /api/patrimonio` con `Authorization: Bearer <FYM_MCP_TOKEN>`. Lectura: `patrimonio`, `posiciones`, `evolucion`. Escritura: `fijar_valor`, `fijar_detalle`, `crear_posicion`, `fijar_minusvalia`. Sin `confirmar: true` no escribe. `posiciones` incluye la plusvalía latente.

`fijar_detalle` cambia solo los campos enviados. `institucion` pasa a la columna `institution` (en un fondo, también es el broker). `cuotaMensual` queda en `metadata.monthlyPayment`. La nómina (`ingresoMensualNeto`, `pagasAnuales` 12 o 14) se guarda en la posición y no entra en el neto. Una aportación anual a pensión por encima de 1.500 € avisa. El detalle está en `AGENTS.md`.

Vista previa, no escribe:

```json
{
  "herramienta": "fijar_detalle",
  "argumentos": {
    "posicion": "Vanguard FTSE All world (ING)",
    "campos": {
      "participaciones": 120.5,
      "isin": "IE00BK5BQT80",
      "institucion": "ING"
    },
    "confirmar": false
  }
}
```
