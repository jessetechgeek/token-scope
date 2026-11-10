# TokenScope for Node

Track Claude Code requests, tokens and estimated API cost in a dashboard. A Fastify API stores usage in Postgres and a React client charts it. It runs on Vercel with Neon, so there is no server to keep alive.

Costs are estimates from API prices. They are not your subscription bill.

## Credit

This project is a Node port of [TokenScope](https://github.com/m-jovanovic/tokenscope) by [Milan Jovanović](https://github.com/m-jovanovic). The idea, the OTLP telemetry approach, the data model and the original dashboard are his work, released under the MIT license. If you want the full .NET version with TimescaleDB, local history import and the MCP tools, use his repository.

This repository uses the same MIT license and keeps his copyright notice. The Node port, the sign-in and the redesign are by Jesse Nicodemus.

## What is different

| | Original | This port |
| --- | --- | --- |
| Runtime | .NET 10, Docker | Node 22, Fastify, Vercel functions |
| Database | TimescaleDB | Plain Postgres (Neon). Hourly totals are kept in a `spend_1h` table that ingest updates |
| Data sources | Live telemetry, local history, manual import, demo data | Live telemetry only |
| MCP tools | Yes | No |
| Access | None built in | Password sign-in, bearer token for telemetry |
| Dashboard | Sidebar with Database tab | Redesigned: top bar, one spend figure, model colors |

## How it works

1. Claude Code exports `api_request` events as OTLP JSON to `POST /v1/logs`.
2. One SQL statement per batch claims event keys, inserts new rows and adds to the hourly rollup, so replayed events are ignored.
3. The dashboard reads full hours and days from the rollup and the current partial hour from raw rows.

Only usage metadata is stored: time, model, session, token counts, cost and optional agent, skill and MCP names. Prompts, responses and tool contents are not.

## Run it locally

You need Node 22 or newer and a Postgres database. A free [Neon](https://neon.com) project works. Use its pooled connection string, the one whose host contains `-pooler`.

```sh
npm install
npm --prefix web ci
cp .env.example .env
```

Fill in `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `TOKENSCOPE_API_TOKEN` | The sign-in password, and the bearer token Claude Code sends. Use a long random value |
| `TOKENSCOPE_DEFAULT_DEVELOPER` | Label for events that carry none. Optional, defaults to `me` |

Create the tables, build, and start the API on port 3000:

```sh
npm run migrate
npm run build:ts
node --env-file=.env node_modules/fastify-cli/cli.js start -l info dist/app.js
```

In a second terminal start the dashboard on port 5199. It proxies `/api` to the API:

```sh
npm run web:dev
```

If `TOKENSCOPE_API_TOKEN` is empty and `NODE_ENV` is not `production`, the API skips authentication. In production it answers 503 until the token is set.

## Connect Claude Code

Save this as `claude-telemetry.json`, replace the two placeholders, and keep the file private because it contains your password:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "none",
    "OTEL_TRACES_EXPORTER": "none",
    "OTEL_LOG_USER_PROMPTS": "0",
    "OTEL_LOG_ASSISTANT_RESPONSES": "0",
    "OTEL_LOG_TOOL_DETAILS": "0",
    "OTEL_LOG_TOOL_CONTENT": "0",
    "OTEL_LOG_RAW_API_BODIES": "0",
    "OTEL_EXPORTER_OTLP_LOGS_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "http://localhost:3000/v1/logs",
    "OTEL_EXPORTER_OTLP_LOGS_HEADERS": "Authorization=Bearer <your TOKENSCOPE_API_TOKEN>",
    "OTEL_RESOURCE_ATTRIBUTES": "developer=<your name>"
  }
}
```

Start a new session with it, then send a request:

```sh
claude --settings ./claude-telemetry.json
```

For a deployed instance, set the endpoint to `https://<your-domain>/v1/logs`. Settings are read when a session starts, so sessions that are already open will not report.

When Claude Code runs in WSL and the API runs on Windows, `localhost` does not reach it. Use the Windows host address instead.

## Deploy to Vercel

1. Import the repository. Set the Application Preset to **Other** and leave the root directory as `./`. Do not use the Services preset.
2. Add the environment variables `DATABASE_URL` and `TOKENSCOPE_API_TOKEN`, and optionally `TOKENSCOPE_DEFAULT_DEVELOPER`.
3. Deploy, then run `npm run migrate` once against the database.

`vercel.json` builds the API and the client, serves `web/dist` as static files and sends `/api/*`, `/v1/*` and `/health` to the function in `api/index.js`. Put the Vercel function region next to your database region to keep queries fast.

Neon scales idle compute to zero. The dashboard refreshes about every 30 seconds while the tab is visible and stops after 10 minutes without input, so a forgotten tab does not keep the database awake.

## API

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/logs` | Bearer | OTLP JSON ingest |
| `GET /api/summary` `timeseries` `breakdown` `sessions` `live` `status` | Session or bearer | Dashboard data |
| `GET /api/session`, `POST /api/login`, `POST /api/logout` | Open | Sign-in |
| `GET /health` | Open | Database check |

Query parameters are `range` (`1h`, `24h`, `7d`, `30d`, `90d`) and, for breakdown, `by` (`model`, `agent`, `skill`, `mcp`, `developer`, `query`).

## Project layout

```
src/plugins    database and auth plugins, loaded by autoload
src/routes     /api, /v1 and /health handlers
src/lib        OTLP mapping, ingest SQL, queries, sessions
db/schema.sql  tables and the hourly rollup
api/index.js   Vercel function entry
web/           React client (Vite)
test/          unit tests
```

## Tests

```sh
npm test
```

The unit tests cover the OTLP mapper and the time-bucket helpers. The SQL paths have been checked against a real Neon database by hand, but there are no automated database tests yet.

## Limits

- No retention policy. Rows are kept until you delete them.
- Sign-in has a short delay on a wrong password but no real rate limit.
- Only the `live` source exists. Local history import, manual import, demo data and MCP are not ported.

## License

[MIT](LICENSE). Copyright (c) 2026 Milan Jovanović and Jesse Nicodemus.
