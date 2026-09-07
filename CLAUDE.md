# Fuck You Money

> Actualiza este archivo en el mismo commit si cambia el modelo de datos, una vista, una convención o una limitación. Foto del estado actual, no diario.

App personal de Jose para ver **todo su patrimonio en macro**: activos, pasivos, liquidez, autonomía, gráficos. **No gestiona** inmuebles (eso es Finca). Uso exclusivo, datos reales — no perder/corromper datos.

Repo `jositopg/fuckyoumoney`, Vercel: `https://fuckyoumoney.vercel.app`.  
Handoff vivo de la reconstrucción: `HANDOFF.md`.

## Stack

React 19 + TypeScript + Vite + Tailwind. PWA. Auth: Supabase email/password. DB: Supabase Postgres (proyecto `jwcrrnevvtxaycsqjmem`, distinto de Finca).

- `npm run dev` / `npm test` / `npm run build` (`tsc -b && vite build`)
- Serverless: `api/sync-finca.js`, `api/ai.js` (Vercel)
- SQL extra: `supabase/migrations/001_wealth_os.sql` — aplicar con `node scripts/run-sql.mjs` cuando exista `~/.fuckyoumoney-db.env`

## Roles vs Finca

| App | Rol |
|---|---|
| Finca | Operación inmobiliaria. Publica `patrimonio_macro_snapshot()`. |
| FYM | Balance consolidado. Inmuebles **read-only** (`source=finca`). Resto de clases se editan aquí. Hipotecas (principal) viven aquí. |

## Modelo local (`src/types.ts`)

`Asset` es el modelo de UI. `category: debt` son pasivos (valor positivo, se resta en `getNetWorth`).  
Campos extra: `source` (`manual` \| `finca` \| `market`), `readOnly`.

Cloud: tablas `assets` + `liabilities`. Metadata que no cabe en columnas se serializa en `notes` como `FYM1:{...}` (`src/lib/fymMeta.ts`) hasta aplicar la migración jsonb.

**Nunca** mapear `type=real_estate` a vehicles. `institution='finca'` marca origen Finca.

## Sync Finca

`POST /api/sync-finca` con Bearer JWT de Supabase. Lee `FINCA_DATABASE_URL` (o `~/.finca-db.env` en local) y llama `patrimonio_macro_snapshot()`. Upsert de `assets` con `id` = uuid de la propiedad Finca.

## IA

`POST /api/ai`. System prompt + JSON del patrimonio (`src/utils/wealthBrief.ts`). Modelo `grok-4.6` vía `XAI_API_KEY` o Vercel AI Gateway `xai/grok-4.6`. No inventa cifras: solo razona sobre el brief.

## Convenciones

- Importes UI en EUR, locale `es-ES` (`formatEur`).
- Autonomía = `(líquido − deudas) / gastos mensuales`. Líquido = cash + stocks + crypto.
- Inmuebles Finca no se editan ni se borran desde el formulario; se regeneran en el sync.
- Tras cada commit en este repo: `git push` de la rama de trabajo. Merge a `main` solo con build+test verdes.

## Limitaciones

- Sin DATABASE_URL de FYM no se pueden crear vistas `v_net_worth` / `wealth_snapshots`.
- OAuth Google no se prueba desde el agente.
- Principal hipotecario no viene de Finca.
