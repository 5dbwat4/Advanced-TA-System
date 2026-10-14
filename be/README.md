![tasaas banner](../.github/assets/banner.png)

# Advanced TA System — Backend

API server for **Advanced TA System**, a teaching-assistant system built for the *Zhejiang
University Computer Systems* lab courses.

Fastify + Prisma (SQLite) + Socket.IO. Serves the REST API, the realtime checkoff
channel, and an MCP endpoint. The web app lives in [`../fe`](../fe).

## Tech stack

- **Server**: Fastify 5, `@fastify/cors`, `@fastify/jwt`, `zod` (validation)
- **Data**: Prisma 5 on SQLite
- **Realtime**: `socket.io`
- **Auth**: JWT bearer tokens, WebAuthn passkeys (`@simplewebauthn/server`),
  bcrypt passwords, ZJU unified login (`login-zju`)
- **MCP**: `@modelcontextprotocol/sdk`
- **Runtime**: `tsx` (TypeScript executed directly, no build step)

## Scripts

```bash
pnpm dev        # tsx watch src/index.ts
pnpm start      # tsx src/index.ts
pnpm typecheck  # tsc --noEmit
pnpm db:push    # prisma db push (apply schema)
pnpm db:seed    # seed initial data
pnpm db:studio  # prisma studio
```

## Environment

Copy `.env.example` to `.env` and set:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite URL, e.g. `file:./dev.db` |
| `JWT_SECRET` | JWT signing secret (required in production) |
| `CREDENTIAL_KEY` | Key for encrypting stored credentials (required in production) |
| `PORT` | HTTP port (default `3001`) |
| `ROOT` | Public site root, used for absolute links |
| `PASSKEY_RP_NAME` / `PASSKEY_RP_ID` / `PASSKEY_ORIGIN` | WebAuthn relying-party config |

## Layout

```
src/
  index.ts        bootstrap, error handler, route registration
  env.ts          environment loading / validation
  routes/         REST route plugins (one per domain)
  lib/            domain logic (prisma, realtime, auth, scoring, upstream sync, ...)
  mcp/            MCP server, principal resolution and tools
prisma/
  schema.prisma   data model
  seed.ts         seed script
```

## Data model

Key Prisma models (see `prisma/schema.prisma`):

- `User`, `Class`, `Student`
- `Experiment`, `QuestionBank`, `Question`
- `Score` — `type`: `0` functional test, `1` checkoff Q&A, `2` report,
  `3` standalone scored project
- `Remark` — per `(student, experiment)`, `type`: `0` checkoff, `1` report
- `ReportReview`, `Criteria`
- `CheckpointClaimed`, `FocusStudent`, `DevBoard`, `XzzdHomework`
- `PersonalAccessToken`, `McpAuditLog`

## API

- REST under `/api/*`; health at `GET /api/health`
- Realtime via Socket.IO (checkoff master/slave, score change, report grading)
- MCP endpoint at `/mcp`, authenticated with personal access tokens

## Database

There are no migrations — the schema is applied with `prisma db push`. For a fresh
environment: `pnpm db:push && pnpm db:seed`.

## Docker

From the monorepo root:

```bash
docker build -f be/Dockerfile -t tsaas-be .
docker run -d --name tsaas-be \
  -p 127.0.0.1:3001:3001 \
  -v tsaas-data:/app/data \
  -e TZ=Asia/Shanghai \
  --env-file be/.env.production \
  tsaas-be
```

The container persists SQLite to `/app/data`, runs `prisma db push` on start, serves
on `:3001`, and exposes a `/api/health` healthcheck.

---

A 5dbwat4 Product · [github.com/5dbwat4](https://github.com/5dbwat4)
