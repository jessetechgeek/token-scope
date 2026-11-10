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

Claude Code reads these settings when a session starts. Set them once in the place that fits each way you run it, and every later session reports without a flag. Sessions that are already open will not report.

Replace the three placeholders. The token is your `TOKENSCOPE_API_TOKEN`, so keep the file private.

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
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "https://<your-domain>/v1/logs",
    "OTEL_EXPORTER_OTLP_LOGS_HEADERS": "Authorization=Bearer <your TOKENSCOPE_API_TOKEN>",
    "OTEL_LOGS_EXPORT_INTERVAL": "2000",
    "OTEL_RESOURCE_ATTRIBUTES": "developer=<your name>-<surface>"
  }
}
```

Use a different `developer` value per surface where the surface honors it, such as `jesse-cli`, and the dashboard's developer breakdown shows usage by surface.

### CLI

Merge the `env` block into your user settings file, `~/.claude/settings.json`, keeping any keys already there. This applies to every project and every session.

### Desktop app

The Code tab runs Claude Code on the machine where the app runs and uses that machine's user settings. On Windows that is `%USERPROFILE%\.claude\settings.json`, which is a different file from the one in WSL. The regular chat in the desktop app does not export Claude Code telemetry. The desktop app ignores `OTEL_RESOURCE_ATTRIBUTES`, so it sends no `developer`. TokenScope labels those events `<TOKENSCOPE_DEFAULT_DEVELOPER>-desktop`, for example `jesse-desktop` when the default developer is `jesse`.

### Cloud sessions

Not supported. In testing, Claude Code cloud sessions did not send telemetry to TokenScope, even with the endpoint set in the cloud environment's settings file and the token injected through a network secret. A plain `curl` from the same sandbox reached the API, so the network path is fine. The cloud exporter simply sent nothing.

### Local API

For a local API, use `http://localhost:3000/v1/logs` as the endpoint. When Claude Code runs in WSL and the API runs on Windows, `localhost` does not reach it. Use the Windows host address instead.

To try a configuration without changing user settings, save the JSON as `claude-telemetry.json` and start a session with `claude --settings ./claude-telemetry.json`.

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

Query parameters are `range` (`1h`, `24h`, `7d`, `30d`, `90d`), `metric` (`cost` or `requests`, for breakdown and sessions) and, for breakdown, `by` (`model`, `agent`, `skill`, `mcp`, `developer`, `query`). Sessions take `group=developer` to roll sessions up by developer.

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

The tests run without a database. They cover the OTLP mapper, time buckets, session signing, ingest dedupe and batching, range selection, and the auth and ingest routes over HTTP against a stubbed SQL client. CI runs them and the web build on every push and pull request.

The SQL itself and the read routes have been checked against a real Neon database by hand, but there are no automated database tests yet.

## Limits

- No retention policy. Rows are kept until you delete them.
- Sign-in has a short delay on a wrong password but no real rate limit.
- Only the `live` source exists. Local history import, manual import, demo data and MCP are not ported.

## License

[MIT](LICENSE). Copyright (c) 2026 Milan Jovanović and Jesse Nicodemus.
