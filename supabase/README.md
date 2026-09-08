# Base de datos — contrato para cualquier IA

Fuck You Money no tiene chat. El patrimonio se analiza **en SQL**.

Proyecto Supabase: `jwcrrnevvtxaycsqjmem`  
App: https://fuckyoumoney.vercel.app

## Si tienes acceso a este Postgres

```sql
SELECT * FROM ai_guide ORDER BY sort;   -- instrucciones (también con anon key)
SELECT patrimonio_ia();                 -- briefing JSON (login o service_role)
SELECT * FROM v_net_worth;
SELECT * FROM v_positions;
SELECT * FROM v_allocation;
```

No inventes cifras. EUR. Inmuebles `source=finca` son solo lectura (la app Finca los opera). Hipotecas = `v_positions` donde `kind=liability` y `class=mortgage`.

## Si estás en la terminal de Jose

```bash
# Inmuebles (Finca) — ya funciona
node ~/Proyectos/fuck-you-money/scripts/dump-wealth.mjs

# Patrimonio completo — cuando exista ~/.fuckyoumoney-db.env
node ~/Proyectos/fuck-you-money/scripts/run-sql.mjs "SELECT patrimonio_ia();"
```

URI de FYM: Dashboard → Settings → Database → URI, guardar en `~/.fuckyoumoney-db.env` como `DATABASE_URL=...` (chmod 600). Aplicar schema:

```bash
cd ~/Proyectos/fuck-you-money
node scripts/run-sql.mjs supabase/migrations/001_wealth_os.sql
```

## RLS

`ai_guide` es legible con anon (sin cifras). El resto exige el usuario de Jose (`authenticated`) o `service_role` / `postgres`.
