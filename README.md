# Mushroom farm

A small web app for running a mushroom farm. Iteration 1: keep a list of grow rooms (add, list, edit, delete).

## Run

```bash
npm start
```

Then open http://localhost:8080. Needs Node 22.13 or newer; there are no npm dependencies.

| Env var | Default | Meaning |
|---|---|---|
| `FARM_PORT` | `8080` | HTTP port (0 picks a free one) |
| `FARM_DB` | `data/v2.db` | SQLite database file, or `:memory:` |

## Test

```bash
npm test
```

Design: `docs/superpowers/specs/2026-10-16-rooms-design.md`.
