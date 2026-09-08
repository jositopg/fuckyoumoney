# Fuck You Money

> Actualiza este archivo en el mismo commit si cambia el modelo de datos, una vista, una convención o una limitación. Foto del estado actual, no diario.

App personal de Jose para **anotar y ver su patrimonio**: un número (neto), asignación, lista de posiciones. **No gestiona** inmuebles (eso es Finca). Sin chat IA, sin pedagogía de libro. Uso exclusivo, datos reales.

Repo `jositopg/fuckyoumoney`, Vercel: `https://fuckyoumoney.vercel.app`.  
Handoff: `HANDOFF.md`. Schema para Grok: `supabase/README.md`.

## Stack

React 19 + TypeScript + Vite + Tailwind. PWA. Auth: Supabase email/password. DB: Supabase Postgres (`jwcrrnevvtxaycsqjmem`, distinto de Finca).

- `npm run dev` / `npm test` / `npm run build`
- `npm run wealth` — briefing JSON para hablar del patrimonio en esta terminal
- Serverless: `api/sync-finca.js` (ingesta inmuebles). **No hay chat IA en la app.**
- SQL: `supabase/migrations/001_wealth_os.sql` con `~/.fuckyoumoney-db.env`

## Roles vs Finca

| App | Rol |
|---|---|
| Finca | Operación inmobiliaria. Publica `patrimonio_macro_snapshot()`. |
| FYM | Balance consolidado. Inmuebles **read-only** (`source=finca`). Resto de clases se editan aquí. Hipotecas (principal) viven aquí. |

## Grok u otra IA (no en la app)

No hay chat embebido. Cualquier IA con acceso a este Postgres:

```sql
SELECT * FROM ai_guide ORDER BY sort;
SELECT patrimonio_ia();
```

En la terminal de Jose:

```bash
cd ~/Proyectos/fuck-you-money && node scripts/dump-wealth.mjs
```

Contrato: `supabase/README.md`. Migración: `supabase/migrations/001_wealth_os.sql`.

## Modelo local (`src/types.ts`)

`Asset` es el modelo de UI. `category: debt` son pasivos (valor positivo, se resta en `getNetWorth`).  
Campos extra: `source` (`manual` \| `finca` \| `market`), `readOnly`.

Cloud: tablas `assets` + `liabilities`. Metadata extra en `notes` como `FYM1:{...}` (`src/lib/fymMeta.ts`) hasta aplicar la migración jsonb.

**Nunca** mapear `type=real_estate` a vehicles. `institution='finca'` marca origen Finca.

## Sync Finca

`POST /api/sync-finca` con Bearer JWT de Supabase. Lee `FINCA_DATABASE_URL` (o `~/.finca-db.env` en local) y llama `patrimonio_macro_snapshot()`. Upsert de `assets` con `id` = uuid de la propiedad Finca.

## Convenciones

- Importes UI en EUR, locale `es-ES` (`formatEur`).
- Autonomía = `(líquido − deudas) / gastos mensuales`. Líquido = cash + stocks + crypto.
- Inmuebles Finca no se editan ni se borran desde el formulario; se regeneran en el sync.
- Tras cada commit: `git push`. Merge a `main` solo con build+test verdes.

## Limitaciones

- Sin `~/.fuckyoumoney-db.env` Grok no lee cuentas/deudas/fondos desde SQL (sí el inmobiliario vía Finca).
- Principal hipotecario no viene de Finca.
- OAuth/password de la app no se prueba desde el agente.
