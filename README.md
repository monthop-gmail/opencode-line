# OpenCode LINE Bot

LINE Bot powered by **OpenCode** — AI assistant ที่ใช้ผ่าน LINE ส่งข้อความ ให้ AI ช่วยได้

## Architecture

```
LINE app → Cloudflare Tunnel → line-bot (Bun, :3000) → OpenCode (:4096) → AI Model
                                                              ↕
                                                        MCP tools (stdio)
```

3 Docker services:
- **opencode** — OpenCode server with Anthropic/DeepSeek/Google/OpenAI/Qwen providers + MCP tools (Alpine)
- **line-bot** — LINE webhook handler (Bun/TypeScript)
- **cloudflared** — Cloudflare tunnel (exposes webhook to internet)

## Features

- **Model switching** — `/model` command เปลี่ยน AI model ได้ per session
- Multi-turn conversation with session persistence
- Group chat — AI ตัดสินใจเองว่าจะตอบหรือไม่ ([SKIP] detection)
- Loading animation ขณะรอ AI ตอบ (1:1 chat)
- Auto-retry session on 404
- Message chunking (LINE 5000 char limit)
- LINE commands: /about, /help, /new, /model, /playground, /meditation, etc.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/monthop-gmail/opencode-line.git
cd opencode-line

# 2. Setup env
cp .env.example .env
# Edit .env: LINE credentials, ANTHROPIC_API_KEY, CLOUDFLARE_TUNNEL_TOKEN

# 3. Deploy
docker compose up -d --build

# 4. Check logs
docker logs opencode-line-bot --tail 30
docker logs opencode-server --tail 30
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API token |
| `LINE_CHANNEL_SECRET` | LINE channel secret |
| `LINE_OA_URL` | LINE Official Account URL |
| `ANTHROPIC_API_KEY` | Anthropic API key ([get one](https://console.anthropic.com/settings/keys)) |
| `DEEPSEEK_API_KEY` | DeepSeek API key (optional) |
| `GOOGLE_API_KEY` | Google AI API key (optional, for Gemini models) |
| `QWEN_API_KEY` | Qwen/DashScope API key (optional, for Qwen models) |
| `ODOO_URL` | Odoo server URL (for odoo-mcp) |
| `ODOO_DB` | Odoo database name |
| `ODOO_USERNAME` | Odoo username |
| `ODOO_PASSWORD` | Odoo password |
| `BRAVE_API_KEY` | Brave Search API key (for brave-search MCP) |
| `OPENCODE_PASSWORD` | OpenCode server password (default: changeme) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare tunnel token |
| `PROMPT_TIMEOUT_MS` | Prompt timeout (default: 120000) |

## LINE Bot Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `/new` | — | เริ่ม session ใหม่ |
| `/abort` | — | ยกเลิกและเริ่มใหม่ |
| `/sessions` | — | ดูสถานะ session |
| `/model` | `/model <name>` | ดู/เปลี่ยน AI model |
| `/about` | `/who` | แนะนำตัว bot |
| `/help` | `/คำสั่ง` | คำสั่งทั้งหมด |
| `/playground` | `/pg` | Playground info |
| `/meditation` | `/jibjib`, `/meditate`, `/สมาธิ` | JIBJIB Meditation DApp |
| `/cny` | — | อวยพรตรุษจีน |

## Model Switching

สลับ AI model ได้ผ่านคำสั่ง `/model`:

| Command | Model | Provider | Cost |
|---------|-------|----------|------|
| `/model pickle` | Big Pickle | opencode | **$0 (Free)** |
| `/model deepseek` | DeepSeek Chat | deepseek | $ |
| `/model reasoner` | DeepSeek Reasoner | deepseek | $ |
| `/model haiku` | Claude Haiku 4.5 | anthropic | $ |
| `/model sonnet` | Claude Sonnet 4.6 | anthropic | $$ |
| `/model opus` | Claude Opus 4.6 | anthropic | $$$ |
| `/model gpt5` | GPT-5.2 | openai | $$ |
| `/model gpt5mini` | GPT-5 Mini | openai | $ |
| `/model gpt5pro` | GPT-5.2 Pro | openai | $$$ |
| `/model codex` | GPT-5.2 Codex | openai | $$ |
| `/model gemini` | Gemini 3 Pro | google | $ |
| `/model gemini31` | Gemini 3.1 Pro | google | $ |
| `/model geminiflash` | Gemini 3 Flash | google | $ |

- Default: **Big Pickle (Free)**
- Model preference stored per group/user session
- `/model` (ไม่ใส่ชื่อ) → ดู model ปัจจุบัน + ตัวเลือก

## MCP Tools

Bot มี MCP tools สำหรับเชื่อมต่อระบบภายนอก (config: `workspace/opencode.json`):

| MCP Server | Transport | Description |
|------------|-----------|-------------|
| **context7** | remote | ค้นหา documentation ของ library/framework ต่างๆ |
| **gh_grep** | remote | ค้นหา code ตัวอย่างจาก GitHub repositories |
| **odoo-mcp-tarad** | local (stdio) | Odoo ERP integration (XML-RPC) — [source](https://github.com/monthop-gmail/odoo-mcp-claude) |
| **brave-search** | local (npx) | ค้นหาข้อมูลจากเว็บ (Brave Search API) |
| **jbchain** | local | EVM blockchain: JIB Chain (chain 8899) |
| **kubchain** | local | EVM blockchain: Bitkub Chain (chain 96) |
| **kubtestnet** | local | EVM blockchain: Bitkub Testnet (chain 25925) |
| **kubl2testnet** | local | EVM blockchain: Kub L2 Testnet (chain 259251) |

## Web Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/about` | About page (HTML) |
| `POST` | `/webhook` | LINE webhook |
