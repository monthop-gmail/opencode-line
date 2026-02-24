# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCode LINE Bot — bridges LINE Messaging API to OpenCode AI coding agent via REST API. Three Docker services: LINE bot (Bun), OpenCode server (Alpine), Cloudflare tunnel. Supports multiple AI models via `/model` command (Anthropic, DeepSeek, OpenCode built-in).

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
docker exec opencode-server cat /root/.config/opencode/opencode.json     # Check provider config
```

## Architecture

```
LINE app → Cloudflare Tunnel → line-bot (Bun, port 3000) → opencode (port 4096) → AI Model
```

- **`src/index.ts`** — Single-file application (~1000 lines). All bot logic: webhook handler, session management, OpenCode REST client, LINE message sending, image handling, group chat filtering, user memory, time context, model switching, LINE commands (/about, /help, /model, /playground, /meditation, /cny), web /about page (HTML).
- **`opencode.json`** — Anthropic + DeepSeek provider configuration for OpenCode (mounted read-only into container)
- **`Dockerfile`** — LINE bot container (`oven/bun:1`, Debian)
- **`Dockerfile.opencode`** — OpenCode server extending `ghcr.io/anomalyco/opencode:latest` (Alpine) with dev tools (git, curl, jq, gh), python3/pip, and pre-configured model.json for Claude
- **`docker-compose.yml`** — Orchestrates 3 services with 2 named volumes + config mount
- **`workspace/AGENTS.md`** — Instructions file for OpenCode (big-pickle) inside the container. Tells big-pickle it runs as a LINE Bot server, not CLI terminal.

## Key Design Decisions

**OpenCode REST API (not SDK):** The `@opencode-ai/sdk` is workspace-only and can't be used in standalone Docker. All calls use direct `fetch()` to `http://opencode:4096` with Basic auth (`opencode:{password}`) and `x-opencode-directory` header.

**Model switching via `/model` command:** Users can switch models per session. Default: `big-pickle` (free, provider: opencode). Options: `pickle` (free), `deepseek`/`reasoner` (deepseek), `haiku`/`sonnet`/`opus` (anthropic). Model preference stored in `modelPrefs` Map per group/user. The `model` parameter is passed per-message to OpenCode API `POST /session/{id}/message`.

**Default model: big-pickle (free):** OpenCode's free built-in model (200K context, $0 cost). Requires OpenCode Zen API token in `auth.json`. The `model.json` is pre-configured in `Dockerfile.opencode` for Claude Sonnet as the server-side default, but the bot defaults to `pickle` via the `DEFAULT_MODEL` constant.

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
- `ANTHROPIC_API_KEY` — Anthropic API key ([get one](https://console.anthropic.com/settings/keys))
- `DEEPSEEK_API_KEY` — DeepSeek API key (optional, for deepseek-chat/deepseek-reasoner)
- `CLOUDFLARE_TUNNEL_TOKEN` — Tunnel authentication
- `OPENCODE_PASSWORD` — OpenCode server Basic auth password (default: `changeme`)
- `GITHUB_TOKEN` — GitHub PAT for `gh` CLI inside OpenCode container (optional)
- `LINE_OA_URL` — LINE Official Account URL (used in /about, /cny, /meditation, /playground, welcome message, and web /about page)
- `PROMPT_TIMEOUT_MS` — Prompt timeout in ms (default: `120000`)

## Docker Volumes

Two separate volumes are critical — they persist different data across container restarts:
- **`opencode-data`** → `/root/.local/share/opencode` — auth.json (OpenCode Zen API token)
- **`opencode-state`** → `/root/.local/state/opencode` — model.json (default model, pre-configured in Dockerfile)
- **`./opencode.json`** → `/root/.config/opencode/opencode.json` (read-only bind mount — Anthropic/DeepSeek provider config)

If `opencode-state` is missing, OpenCode defaults to the model in Dockerfile.opencode (claude-sonnet-4-6).

## LINE Bot Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `/new` | — | เริ่ม session ใหม่ |
| `/abort` | — | ยกเลิก prompt ที่กำลังทำ |
| `/sessions` | — | ดูสถานะ session |
| `/model` | `/model <name>` | ดู/เปลี่ยน AI model (pickle/haiku/sonnet/opus) |
| `/about` | `/who` | แนะนำตัว bot |
| `/help` | `/คำสั่ง` | คำสั่งทั้งหมด |
| `/playground` | `/pg` | Playground info |
| `/meditation` | `/jibjib`, `/meditate`, `/สมาธิ` | JIBJIB Meditation DApp |
| `/cny` | — | อวยพรตรุษจีน |

## Web Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check (plain text) |
| `GET` | `/about` | About page (HTML, dark theme, meditation card, tech stack) |
| `POST` | `/webhook` | LINE webhook endpoint |

## JIBJIB Meditation DApp

Referenced in `/meditation` command and web `/about` page. Meditation DApp for earning token rewards on JB Chain and KUB Testnet. Source: [jibjib-meditation-dapp](https://github.com/monthop-gmail/jibjib-meditation-dapp), deployed at https://jibjib-meditation.pages.dev.

## Gotchas

- Big-pickle has no vision. Images: silent in group, short reply in 1:1 ("ยังดูรูปไม่ได้ครับ"). `workspace/AGENTS.md` also instructs AI not to pretend it can see images.
- `model.json` is pre-configured in `Dockerfile.opencode` but may be overwritten by the `opencode-state` volume on subsequent runs.
- `model.json` (state) and `auth.json` (data) are in **different directories** — they need separate Docker volume mounts.
- OpenCode image entrypoint is `opencode`, so command should be `["serve", ...]` not `["opencode", "serve", ...]`.
- Cloudflare tunnel URL changes on every container restart — must update LINE webhook URL in LINE Developer Console.
- `workspace/` directory is not tracked in git — it's team's working data mounted into the container.
- After container recreate, sessions are lost (in-memory Map) — users just need to send a new message to create a fresh session.
- LINE replyToken expires quickly — if bot takes too long to respond, replyMessage will fail and fall back to pushMessage (uses quota).
