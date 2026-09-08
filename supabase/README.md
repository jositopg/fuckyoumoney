# Base de datos (para Grok en terminal)

No hay chat IA dentro de la app. El patrimonio se consulta aquí.

```bash
# Briefing JSON (Finca siempre; FYM si existe ~/.fuckyoumoney-db.env)
cd ~/Proyectos/fuck-you-money && npm run wealth
```

## Proyectos

| App | Postgres | Env local |
|---|---|---|
| Finca (inmuebles, ops) | `emkihlljnhykevlehprh` | `~/.finca-db.env` |
| FYM (balance consolidado) | `jwcrrnevvtxaycsqjmem` | `~/.fuckyoumoney-db.env` |

## Qué leer

1. `npm run wealth` — un JSON con totales y posiciones.
2. Si FYM ya tiene la migración: `SELECT patrimonio_ia();`
3. Inmuebles crudos: en Finca, `SELECT patrimonio_macro_snapshot();`

## Convenciones

- EUR. `kind=asset|liability`.
- Inmuebles `institution=finca` o `source=finca`: solo lectura. Gestión en Finca.
- Hipotecas (principal): `liabilities.type = mortgage`. Finca no lo tiene.
- Autonomía = (líquido − deudas) / `profiles.monthly_expenses`. El ladrillo no entra.
- Metadata extra en `assets.notes` como `FYM1:{json}` hasta aplicar `001_wealth_os.sql`.

No inventar cifras que no estén en el JSON/SQL.
