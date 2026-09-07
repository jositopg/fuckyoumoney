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
migración localStorage one-shot, sync `POST /api/sync-finca`, chat `POST /api/ai`.
Arquitectura viva: `CLAUDE.md`. Continuación de sesión: `HANDOFF.md`.

## Scripts

```bash
npx vitest run
npm run build
```
