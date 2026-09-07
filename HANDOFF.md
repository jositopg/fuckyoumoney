# HANDOFF — fuckyoumoney wealth OS

**Fecha:** 2026-09-07  
**Rama:** `feat/wealth-os` (NO está en `main` hasta que build+test pasen)  
**Repos:** `~/Proyectos/fuck-you-money` → `jositopg/fuckyoumoney`  
**Finca:** `~/Proyectos/finca` → `jositopg/finca`

Si lees esto en una sesión nueva: **continúa aquí, no redes cubras el diagnóstico.** La revisión de producto ya está hecha. Implementa / termina lo que quede en la sección Estado.

## Qué es esta app

- **Finca** (`lasfincas.vercel.app`): gestión operativa del inmobiliario (inquilinos, facturas, fiscal). No se toca el CRUD operativo.
- **fuckyoumoney** (`fuckyoumoney.vercel.app`): balance macro de TODO el patrimonio (lectura, stats, gráficos, IA). Inventario de no-inmuebles sí se edita aquí; inmuebles **solo lectura desde Finca**.

## Decisiones cerradas (no reabrir)

1. Seguir en **Vite + React 19 + Tailwind + Vercel**. Backend = carpeta `/api` (serverless). No migrar a Next.js en este ciclo.
2. **Supabase FYM** (`jwcrrnevvtxaycsqjmem`) es la fuente de verdad de posiciones. Proyecto distinto al de Finca (`emkihlljnhykevlehprh`).
3. Inmuebles: Finca publica un snapshot SQL (`patrimonio_macro_snapshot()`). FYM lo ingiere por `POST /api/sync-finca`. Hipotecas (principal vivo) **siguen en FYM `liabilities`** — Finca no tiene esa tabla.
4. IA = **SpaceXAI / xAI**. Preferir `XAI_API_KEY` + `https://api.x.ai/v1` modelo `grok-4.6`. Fallback: Vercel AI Gateway `xai/grok-4.6` con OIDC (`VERCEL_OIDC_TOKEN` en prod). Nunca OpenAI/Anthropic/Gemini.
5. No hay `DATABASE_URL` de FYM en esta máquina (solo anon key en Vercel). Por eso el schema extra vive en `supabase/migrations/001_wealth_os.sql` **sin aplicar**. Hasta entonces, metadata extra se guarda como `FYM1:{json}` en `assets.notes`.
6. Copia local `~/Proyectos/fuck-you-money` ya está al día con `origin/main` (commit supabase 39e4114) + esta rama.

## Credenciales (no commitear)

| Qué | Dónde |
|---|---|
| Finca Postgres | `~/.finca-db.env` (`DATABASE_URL`, chmod 600). Aplicar SQL: `cd ~/Proyectos/finca && node scripts/run-sql.mjs archivo.sql` |
| FYM anon | Vercel env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (ya en prod). Local: `vercel env pull .env.local` |
| FYM Postgres | **NO está** en `~/.fuckyoumoney-db.env`. Crearlo cuando Jose pase la connection string. Luego `node scripts/run-sql.mjs supabase/migrations/001_wealth_os.sql` |
| Finca → FYM sync | Env **FYM** `FINCA_DATABASE_URL` (mismo valor que Finca DATABASE_URL). Añadir a Vercel Production+Preview+Development |
| IA | `XAI_API_KEY` (ideal) o Gateway OIDC en Vercel. Hoy **no hay** XAI_API_KEY en el entorno |

## Estado de implementación

Marca cada ítem al terminarlo.

- [x] Diagnóstico Finca + FYM
- [x] Rama `feat/wealth-os`, Vercel link, pull env
- [x] Vista + función SQL en **Finca** (`v_patrimonio_propiedades`, `v_patrimonio_cashflow`, `patrimonio_macro_snapshot()`) — aplicada en Postgres Finca, 20 propiedades
- [x] Mapper FYM: `real_estate` SÍ sincroniza; `type=real_estate` ya no cae a vehicles; metadata `FYM1:`
- [x] `POST /api/sync-finca` (JWT Supabase + lee snapshot Finca + upsert assets)
- [x] `POST /api/ai` (brief del patrimonio + grok-4.6 / Gateway)
- [x] UI: banner Finca, inmuebles read-only, asignación en home, chat IA
- [x] Tests mapper + wealthBrief + snapshot mapping (113 tests)
- [x] `FINCA_DATABASE_URL` en Vercel (Production/Preview/Development)
- [ ] Aplicar `001_wealth_os.sql` cuando exista DATABASE_URL de FYM (`~/.fuckyoumoney-db.env`)
- [ ] Merge a `main` + confirmar deploy Vercel + login real + sync Finca + una pregunta a la IA
- [ ] `XAI_API_KEY` en Vercel (si Gateway OIDC no basta)

## Cómo sigue mañana (orden)

1. Leer este archivo y `CLAUDE.md`.
2. `git status` en ambos repos. Si hay cambios sin commit, commitear.
3. Si Finca SQL no está aplicada: `node scripts/run-sql.mjs scripts/sql/v_patrimonio_macro.sql` y probar `SELECT jsonb_object_keys(patrimonio_macro_snapshot());`
4. Si `/api/sync-finca` no está, implementarla. Probar con `vercel dev` (hace falta login).
5. Completar UI y tests.
6. `npm test && npm run build`. Merge a main solo si pasa.
7. Jose tiene que confirmar login OAuth/password en la app real — no se puede probar OAuth desde el agente.

## Huecos conocidos (no son bugs del ciclo)

- Finca no modela principal de hipoteca → equity = valor bruto hasta que exista.
- 8/20 propiedades sin `valor_mercado` (caen a catastro o a `null`).
- Snapshots mensuales siguen en localStorage hasta `wealth_snapshots`.
- `price_cache` existe y no se escribe.
- Onboarding todavía habla de “sin servidor” en la copia local antigua; GitHub ya tiene auth — alinear copy.
- Hobby Vercel: funciones ~10s. El chat IA es un solo turno con el brief inyectado (sin loop de tools) para caber.

## Contacto de arquitectura viva

Detalles de convenciones de código: `CLAUDE.md` (este repo) y `~/Proyectos/finca/CLAUDE.md`.
