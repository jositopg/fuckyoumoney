# HANDOFF — fuckyoumoney wealth OS

**Fecha:** 2026-09-08  
**Rama:** `main`  
**Repos:** `~/Proyectos/fuck-you-money` → `jositopg/fuckyoumoney`  
**Finca:** `~/Proyectos/finca` → `jositopg/finca`

## Producto

- **Finca**: gestión operativa del inmobiliario.
- **FYM**: inventario del patrimonio. Portada = neto + asignación + posiciones. Alta en 3 campos. Inmuebles solo lectura desde Finca.
- **IA: no va en la app.** Grok lee SQL (`npm run wealth` / `patrimonio_ia()`).
- Reconfiguración 2026-09-08: fuera autonomía/frases/pills/onboarding falso. Tipos nuevos: business, receivable, other.

## Decisiones

1. Vite + React 19 + Tailwind + Vercel. `/api/sync-finca` para ingesta. Sin Next.js.
2. Supabase FYM `jwcrrnevvtxaycsqjmem` ≠ Finca `emkihlljnhykevlehprh`.
3. Hipotecas (principal) en FYM `liabilities`. Finca no las modela.
4. Sin chat embebido. Sin `api/ai.js`.
5. `~/.fuckyoumoney-db.env` **existe** (2026-09-08). Schema `001_wealth_os.sql` aplicado.

## Credenciales

| Qué | Dónde |
|---|---|
| Finca Postgres | `~/.finca-db.env` |
| FYM anon | Vercel `VITE_SUPABASE_*` |
| FYM Postgres | `~/.fuckyoumoney-db.env` |
| Sync | Vercel `FINCA_DATABASE_URL` (ya está) |

## Estado

- [x] Snapshot Finca `patrimonio_macro_snapshot()` (20 propiedades)
- [x] Sync FYM ← Finca, mapper real_estate, UI asignación + read-only
- [x] Quitar chat IA de la app (2026-09-08)
- [x] `scripts/dump-wealth.mjs` / `npm run wealth`
- [x] Migración `001_wealth_os.sql` autoexplicativa (`ai_guide`, `patrimonio_ia()`, vistas, comentarios)
- [x] `~/.fuckyoumoney-db.env` + `001_wealth_os.sql` aplicado (`ai_guide`, vistas, tablas)
- [ ] Jose: login en fuckyoumoney.vercel.app y sync Finca (FYM `assets` sigue en 0 filas)

## Cómo consultar el patrimonio

```bash
cd ~/Proyectos/fuck-you-money && npm run wealth
```

Hoy solo rellena `finca` (inmuebles). Cuando exista el env de FYM, rellena también cuentas, fondos y deudas.

## Huecos

- 8/20 inmuebles sin `valor_mercado`.
- Snapshots mensuales aún en localStorage hasta aplicar la migración.
- Onboarding copy (“sin servidor”) desfasada.
