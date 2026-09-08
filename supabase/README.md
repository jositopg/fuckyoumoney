# Base de datos — contrato para cualquier IA

Fuck You Money no tiene chat. El patrimonio se analiza **en SQL**.

Proyecto Supabase: `jwcrrnevvtxaycsqjmem`  
App: https://fuckyoumoney.vercel.app

## Si tienes acceso a este Postgres

```sql
SELECT * FROM ai_guide ORDER BY sort;   -- instrucciones (también con anon key)
SELECT patrimonio_ia();                 -- briefing + diagnosis.verdict
SELECT * FROM v_cash_jobs;              -- emergency | parked | working | idle
SELECT * FROM v_real_estate_yield;      -- valor, bruto, neto TTM
SELECT * FROM v_net_worth;
SELECT * FROM v_positions;
```

No inventes cifras. EUR. Lee `diagnosis.verdict` y `diagnosis.moves` antes de opinar. `deploy` = aportar a que rinda (fondos), no un ticker en vivo ni un fondo concreto. Efectivo parado ≠ colchón. Inmuebles: usa `ttmNetCashflow`, no el alquiler bruto. `source=finca` es solo lectura. Hipotecas = `kind=liability` y `class=mortgage`.

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
