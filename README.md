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

Logged-in: CRUD assets/liabilities, one-shot localStorage migration, real_estate omitted (local only), no price_cache writes, light profile upsert on login.

## Scripts

```bash
npx vitest run
npm run build
```
