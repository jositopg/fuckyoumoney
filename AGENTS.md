# Fuck You Money

> Actualiza este archivo en el mismo commit si cambia el modelo de datos, una vista, una convención o una limitación. Foto del estado actual, no diario. Sirve para cualquier agente.

App personal de Jose para anotar y ver su patrimonio: un número (neto), veredicto, mezcla, efectivo con job, inmuebles, posiciones. No gestiona inmuebles (eso es Finca). Sin chat en la app, sin pedagogía de libro, sin pantalla de indicadores paralela. Uso exclusivo, datos reales.

Repo `jositopg/fuckyoumoney`. En producción: https://fuckyoumoney.vercel.app. Handoff: `HANDOFF.md`. Schema: `supabase/README.md`.

## Stack

React 19, TypeScript ~5.9, Vite 8, Tailwind 3. PWA. Auth: Supabase email y contraseña. Base: otro proyecto Supabase, distinto del de Finca.

```bash
npm install
npm run dev
npx vitest run    # una pasada; npm test abre el watcher
npm run lint
npm run build     # tsc -b && vite build
npm run wealth    # briefing JSON del patrimonio, para esta terminal
```

Un cambio no está listo hasta que `npx vitest run`, lint y build salen limpios. Merge a `main` solo con build y test verdes.

- Serverless: `api/sync-finca.js` (ingesta de inmuebles). No hay chat en la app.
- SQL: `supabase/migrations/001_wealth_os.sql` con `~/.fuckyoumoney-db.env`.

## Carpetas

- `src/components`, `src/hooks`, `src/lib` — sync con Finca, mapeo Supabase, metadata `FYM1:`
- `src/types.ts` — modelo de UI (`Asset`). `src/utils` — diagnóstico
- `src/test`
- `api/sync-finca.js`
- `scripts/dump-wealth.mjs`, `scripts/run-sql.mjs`
- `supabase/migrations`

## Roles

| App | Rol |
|---|---|
| Finca | Operación inmobiliaria. Publica `patrimonio_macro_snapshot()`. |
| FYM | Balance consolidado. Inmuebles de solo lectura (`source=finca`). El resto de clases se editan aquí. El principal de las hipotecas vive aquí. |

## Consulta del patrimonio

No hay chat embebido. Con acceso a este Postgres:

```sql
SELECT * FROM ai_guide ORDER BY sort;
SELECT patrimonio_ia();
```

En la terminal: `cd ~/Proyectos/fuck-you-money && node scripts/dump-wealth.mjs` (o `npm run wealth`).

## Modelo local (`src/types.ts`)

`Asset` es el modelo de UI. `category: debt` son pasivos (valor positivo, se resta en `getNetWorth`). Campos extra: `source` (`manual` | `finca` | `market`), `readOnly`.

Cloud: tablas `assets` y `liabilities`. Metadata extra en `notes` como `FYM1:{...}` (`src/lib/fymMeta.ts`) hasta aplicar la migración jsonb.

Nunca mapear `type=real_estate` a vehicles. `institution=finca` marca origen Finca.

## Sync con Finca

`POST /api/sync-finca` con Bearer JWT de Supabase. Lee `FINCA_DATABASE_URL` (o `~/.finca-db.env` en local) y llama `patrimonio_macro_snapshot()`. Upsert de `assets` con `id` = uuid de la propiedad Finca. No dispares ese POST contra producción por tu cuenta.

## API del patrimonio

`https://fuckyoumoney.vercel.app/api/patrimonio` con `Authorization: Bearer <FYM_MCP_TOKEN>`. El token está en `~/.fuckyoumoney-db.env`, fuera del repo. GET lista las herramientas. POST acepta `{ "herramienta", "argumentos" }` o un mensaje MCP.

Lectura: `patrimonio`, `posiciones`. Escritura: `fijar_valor`, `crear_posicion`. Sin `confirmar: true` solo hay vista previa. Al confirmar hace falta `clave`. No edita inmuebles `source=finca`. No devuelve email, DNI ni el token.

## Lectura en vivo de Finca

El agente de este repo tiene el servidor MCP `finca` (stdio). Las cifras salen de las mismas funciones que la app de alquileres. Puede leer y, con `confirmar: true` y una `clave`, registrar un cobro, un gasto o cerrar una tarea. No devuelve DNI, email, teléfono, NIF ni archivos.

Herramientas: `listar_fincas`, `cobros_pendientes`, `huecos`, `avisos`, `resumen`, `modelo_420`, `rendimiento`, `repercutir`, `tareas`, `movimientos`.

Úsalas cuando Jose pregunte por una renta, un cobro, la fiscalidad o una ficha. Los totales y la fiscalidad son las fincas de Jose en alquiler. `listar_fincas`, `tareas` y `movimientos` también ven las de terceros.

El producto sigue sincronizando solo `patrimonio_macro_snapshot()`. No copies filas de inquilinos a `assets`, a un commit ni a las notas. Un cobro o un gasto se registra con las herramientas de Finca, no creando una posición en este patrimonio.

## Convenciones

- Importes de UI en EUR, locale `es-ES` (`formatEur`).
- Autonomía (legado) = `(líquido − deudas) / gastos mensuales`. Líquido = cash + stocks + crypto.
- Colchón de emergencia = efectivo `job=emergency` (si nadie está tagged, el efectivo no aparcado). Nunca fondos ni cripto.
- Efectivo: una cuenta = un saldo de banco. Los usos son trozos: `emergency` (colchón) + `parked` (apartado con motivo) + resto `idle` (a fondos). `extra.slices` cuando hay más de un uso; si no, `job` en toda la cuenta. TAE no es invertirlo.
- Inversión = `type=etf|stock` (nunca `other`). Extra: assetType, isin/ticker, region, assetClass, broker. Sin ticker o ISIN no se identifica.
- Inmuebles: valor y `ttmNetCashflow` (neto 12 meses). El alquiler contratado es bruto, no caja.
- Diagnóstico: `diagnoseWealth()` en la app y `patrimonio_ia()→diagnosis` en SQL. Mismo criterio. La app usa TypeScript; SQL es para la terminal (`npm run wealth`).
- Foto declarada: los importes los pone Jose. No hay precios al abrir ni interés diario. Tap en una posición editable = confirmar o cambiar el número; «Editar ficha» para el resto. Cuentas: «Saldos» recorre la lista. `updatedAt` es la fecha de la foto; el efectivo con 30 días o más se marca. `fijar_valor` escribe `lastInterestUpdate` en `metadata` y en las notas `FYM1` para que un cliente viejo no vuelva a sumar el TAE.
- `diagnosis.moves`: leave / deploy / operate / pay_down / divest.
- Mezcla (`diagnosis.mix`): ladrillo alto no implica vender. Si el efectivo aguanta un parón de alquiler, equilibra con fondos. Vender solo si el golpe no se cubre; candidatos = vacíos.
- Inmuebles de Finca no se editan ni se borran desde el formulario; los regenera el sync. El sync es automático; el error sale en portada; el botón está en Ajustes.
- Preguntas del veredicto: gasto o colchón → Ajustes; idle o apartado sin motivo → editar esa cuenta. Un movimiento `deploy` abre el efectivo parado.
- Al cargar, la nube gana. Solo se sube una fila que ya existe si este dispositivo la tiene pendiente (`dirty`) y su `updatedAt` es posterior. Una fila que aún no está en la nube sí se sube. `saveCloudAsset` actualiza con el `updated_at` leído; si no afecta a ninguna fila, recarga esa ficha y no la pisa. El service worker (`fym-v14`) pide los JS a la red antes que a la caché. Un deploy no puede borrar inversiones. Si falla el delete en la nube, no se borra en local.

## No tocar

- No leas en el chat, no copies y no hagas commit de `.env`, `.env.local`, `~/.fuckyoumoney-db.env`, `~/.finca-db.env`, `FINCA_DATABASE_URL` ni ninguna clave. `.env*` está en `.gitignore` (se versiona `.env.example`).
- Nada de `service_role` en el cliente. En el front solo la clave anon.
- Los datos son de producción. No borres ni reescribas filas como efecto colateral. Un SQL pedido va con `node scripts/run-sql.mjs`, sin pegar la URL.

## Push

La app ya está en producción. Tras cada commit: `git push` sin preguntar.

## Limitaciones

- Sin `~/.fuckyoumoney-db.env` no se leen cuentas, deudas ni fondos desde SQL (el inmobiliario sí, vía Finca).
- El principal hipotecario no viene de Finca.
- El login de la app no se prueba desde el agente.
