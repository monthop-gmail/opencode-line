# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCode LINE Bot — bridges LINE Messaging API to OpenCode AI coding agent via REST API. Three Docker services: LINE bot (Bun), OpenCode server (Alpine), Cloudflare tunnel.

## Commands

```bash
# Local development
cp .env.example .env   # Set credentials first
bun install
bun dev                # Run bot locally

# Docker deployment (production)
docker compose up -d --build          # Build and deploy all services
docker compose up -d --build line-bot # Rebuild only LINE bot
docker compose up -d --build opencode # Rebuild only OpenCode server

# Logs (use container names, not service names)
docker logs opencode-line-bot --tail 30    # LINE bot logs
docker logs opencode-server --tail 30      # OpenCode server logs
docker logs opencode-line-tunnel           # Tunnel URL (changes on restart)

# Useful checks
docker exec opencode-server gh auth status   # Verify GitHub CLI auth
docker exec opencode-server cat /root/.local/state/opencode/model.json   # Check default model
docker exec opencode-server cat /root/.local/share/opencode/auth.json    # Check OpenCode Zen auth
```

## Architecture

```
LINE app → Cloudflare Tunnel → line-bot (Bun, port 3000) → opencode (port 4096) → /workspace
```

- **`src/index.ts`** — Single-file application (~760 lines). All bot logic: webhook handler, session management, OpenCode REST client, LINE message sending, image handling, group chat filtering, user memory, time context.
- **`Dockerfile`** — LINE bot container (`oven/bun:1`, Debian)
- **`Dockerfile.opencode`** — OpenCode server extending `ghcr.io/anomalyco/opencode:latest` (Alpine) with dev tools (git, curl, jq, gh)
- **`docker-compose.yml`** — Orchestrates 3 services with 2 named volumes (`opencode-data` for auth, `opencode-state` for model selection)
- **`workspace/AGENTS.md`** — Instructions file for OpenCode (big-pickle) inside the container. Tells big-pickle it runs as a LINE Bot server, not CLI terminal.

## Key Design Decisions

**OpenCode REST API (not SDK):** The `@opencode-ai/sdk` is workspace-only and can't be used in standalone Docker. All calls use direct `fetch()` to `http://opencode:4096` with Basic auth (`opencode:{password}`) and `x-opencode-directory` header.

**Model: big-pickle (free):** OpenCode's free built-in model (200K context, $0 cost). Requires OpenCode Zen API token in `auth.json` at `/root/.local/share/opencode/auth.json` with format: `{"opencode": {"type": "api", "key": "sk-..."}}`. Default model must be persisted in `model.json` at `/root/.local/state/opencode/model.json` with format: `{"recent":[{"providerID":"opencode","modelID":"big-pickle"}]}`. Without this, `defaultModel()` falls back to first sorted provider model (gemini-3-pro, paid).

**Question tool prevention:** Every prompt is prefixed with `[IMPORTANT: Do NOT use the question tool...]` because the question tool blocks the REST API indefinitely waiting for interactive input. On timeout (2 min), bot aborts the session and polls for partial response via `GET /session/{id}/message`.

**LINE SDK v9:** Uses `MessagingApiClient` for text and `MessagingApiBlobClient` for binary content (image download). These are separate clients.

**Reply strategy:** Always use `replyMessage` first (free, unlimited) before falling back to `pushMessage` (300/month on free plan). Never waste `replyToken` on acknowledgment messages — save it for the actual AI response.

**Group chat sessions:** Session key priority: `groupId` → `roomId` → `userId`. Group members share one session. AI-powered `[SKIP]` detection decides if messages are directed at the bot (checked with `startsWith("[SKIP]")`). No manual trigger needed — natural group chat experience.

**User context enrichment:** Every prompt includes:
- User Memory — LINE profile (displayName) + message count, cached 1 hour
- Time Context — Bangkok timezone in ISO 8601 format (e.g., `[Time: 2026-02-19T23:57+07:00]`)
- Reply Context — `quotedMessageId` when user replies to a message

## Environment Variables

Required in `.env` (not committed):
- `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` — LINE Messaging API credentials
- `CLOUDFLARE_TUNNEL_TOKEN` — Tunnel authentication
- `OPENCODE_PASSWORD` — OpenCode server Basic auth password (default: `changeme`)
- `GITHUB_TOKEN` — GitHub PAT for `gh` CLI inside OpenCode container
- `LINE_OA_URL` — LINE Official Account URL (used in /about, /cny commands)
- `PROMPT_TIMEOUT_MS` — Prompt timeout in ms (default: `120000`)

## Docker Volumes

Two separate volumes are critical — they persist different data across container restarts:
- **`opencode-data`** → `/root/.local/share/opencode` — auth.json (OpenCode Zen API token)
- **`opencode-state`** → `/root/.local/state/opencode` — model.json (default model = big-pickle)

If `opencode-state` is missing, OpenCode defaults to gemini-3-pro (paid, requires payment method).

## Gotchas

- OpenCode API does not support `image` part type (returns 400). Big-pickle has no vision. Images are acknowledged as text only.
- `model.json` (state) and `auth.json` (data) are in **different directories** — they need separate Docker volume mounts.
- OpenCode image entrypoint is `opencode`, so command should be `["serve", ...]` not `["opencode", "serve", ...]`.
- Cloudflare tunnel URL changes on every container restart — must update LINE webhook URL in LINE Developer Console.
- `workspace/` directory is not tracked in git — it's team's working data mounted into the container.
- After container recreate, sessions are lost (in-memory Map) — users just need to send a new message to create a fresh session.
- LINE replyToken expires quickly — if bot takes too long to respond, replyMessage will fail and fall back to pushMessage (uses quota).
