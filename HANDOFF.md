# HANDOFF — fuckyoumoney wealth OS

**Fecha:** 2026-09-18  
**Rama:** `main`  
**Repos:** `~/Proyectos/fuck-you-money` → `jositopg/fuckyoumoney`  
**Finca:** `~/Proyectos/finca` → `jositopg/finca`

## Producto

- **Finca**: gestión operativa del inmobiliario.
- **FYM**: inventario del patrimonio. Portada = neto + veredicto + efectivo (emergencia/aparcado/rinde/parado) + inmuebles (valor y neto) + asignación + posiciones.
- **IA: no va en la app.** Grok lee SQL (`npm run wealth` / `patrimonio_ia()`), que ya trae `diagnosis.verdict`.
- Efectivo tiene un trabajo. El colchón no son los fondos. El alquiler bruto no es el neto.
- No hay análisis en tiempo real de inversiones. Hay foto + `moves` (dejar / mover a que rinda / producir / reducir ladrillo).
- Mezcla: vender ladrillo solo si un parón de alquiler no se cubre con efectivo. Si se cubre, el equilibrio es efectivo → fondos.
- Efectivo: colchón (puede remunerar) o apartado con motivo. Todo lo demás, a fondos. TAE ≠ invertido.

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
- [x] Efectivo con job + colchón en meses + neto inmobiliario + diagnosis en `patrimonio_ia()` (2026-09-08)
- [x] FYM ya tiene posiciones (neto ~4.49M, 23 inmuebles con valor, gasto y jobs rellenos)
- [x] Jose: gasto mensual + meses de colchón en Ajustes (2000 € / 12 meses)
- [x] Jose: marcar cada cuenta (emergencia / aparcado / a invertir)
- [x] Recorte de producto 2026-09-18: sin Insights/filosofía/autonomía-UI; Finca fuera de la portada; preguntas accionables; precios se persisten; SQL mix sin cola decimal

## Cómo consultar el patrimonio

```bash
cd ~/Proyectos/fuck-you-money && npm run wealth
```

`npm run wealth` y `SELECT patrimonio_ia()` ya traen cuentas, inmuebles y `diagnosis`.

## Huecos

- Snapshots mensuales aún en localStorage (el sparkline del hero no viaja de dispositivo).
- `patrimonio_ia()` SQL sigue con umbral mixto 60% / 15% fondos; la app usa bandas landlord/financial. La portada manda; SQL es briefing.
- Varias posiciones de fondos/acciones sin ticker → no hay foto de precio al abrir.
