# Claude Code REST API Server - Project Brief

## Overview

สร้าง REST API Server ที่ wrap Claude Code CLI เพื่อให้สามารถเรียกใช้ผ่าน HTTP ได้ เหมือนกับที่ OpenCode มี REST API

**เป้าหมาย:** ใช้แทน `spawn()` ใน claude-code-line เพื่อให้ session management ดีขึ้น และเป็นไปในทางเดียวกับ opencode-line

## Reference Projects

ศึกษาและนำ concept จาก (เรียงตามความสำคัญ):

1. **opencode-line** (ตัวอย่างหลัก - ใช้ REST API)
   - https://github.com/monthop-gmail/opencode-line
   - เป็น LINE Bot ที่ใช้ OpenCode REST API
   - ดู `src/index.ts` สำหรับ pattern REST API call
   - ดู `docker-compose.yml` สำหรับ Docker architecture

2. **claude-code-line** (ต้องปรับปรุง)
   - https://github.com/monthop-gmail/claude-code-line
   - LINE Bot ที่ใช้ Claude Code (spawn version - ต้องเปลี่ยน)
   - ดู `src/index.ts` สำหรับ current implementation

3. **claude-code-web-terminal**
   - https://github.com/monthop-gmail/claude-code-web-terminal
   - WebSocket + PTY integration
   - ดู `backend/src/claude/wrapper.js` สำหรับ Claude CLI handling

4. **claude-cli-rest-api** (ดู concept ไม่เอา code Python)
   - https://github.com/bryankthompson/claude-cli-rest-api
   - REST API wrapper (Python) - ศึกษาแนวคิดเท่านั้น

## Tech Stack

- **Runtime:** Bun หรือ Node.js (TypeScript)
- **Server:** Express.js หรือ Fastify
- **Container:** Docker

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Compose                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐     REST      ┌───────────────────────┐     │
│   │  LINE Bot    │ ───────────► │  Claude Code API       │     │
│   │  (Bun/Node)  │              │  Server (Bun)         │     │
│   └──────────────┘              │                        │     │
│                                 │  ┌──────────────────┐  │     │
│                                 │  │ Session Manager  │  │     │
│                                 │  │ (in-memory Map)  │  │     │
│                                 │  └──────────────────┘  │     │
│                                 │  ┌──────────────────┐  │     │
│                                 │  │ Claude CLI Spawn │  │     │
│                                 │  │ (subprocess)     │  │     │
│                                 │  └──────────────────┘  │     │
│                                 └───────────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Core Features

1. **REST Endpoints**

   | Method | Endpoint | Description |
   |--------|----------|-------------|
   | POST | `/query` | ส่ง prompt ไป Claude Code |
   | GET | `/sessions` | รายการ sessions ที่ active |
   | GET | `/sessions/:id` | ดู session details |
   | DELETE | `/sessions/:id` | ลบ/resume session |

2. **Query Request**

   ```json
   {
     "prompt": "เขียน function บวกเลข 2 ตัว",
     "sessionId": "uuid (optional)",
     "maxTurns": 10,
     "maxBudgetUsd": 1.0,
     "model": "sonnet"
   }
   ```

3. **Query Response**

   ```json
   {
     "content": "ผลลัพธ์จาก Claude Code...",
     "sessionId": "uuid",
     "costUsd": 0.05,
     "durationMs": 5000,
     "usage": {
       "inputTokens": 1000,
       "outputTokens": 500
     }
   }
   ```

4. **Session Management**
   - รองรับ session persistence (resume conversation)
   - แต่ละ session เก็บ conversation history
   - Timeout handling (configurable)

5. **Claude Code Integration**
   - ใช้ `claude -p --resume <sessionId>` สำหรับต่อเนื่อง
   - รองรับ model selection (sonnet, haiku, opus)
   - รองรับ maxTurns, maxBudgetUsd

### Configuration

```typescript
interface Config {
  anthropicApiKey: string;
  defaultModel: 'sonnet' | 'haiku' | 'opus';
  defaultMaxTurns: number;
  defaultMaxBudgetUsd: number;
  defaultTimeoutMs: number;
  maxConcurrentSessions: number;
}
```

## File Structure

```
claude-code-api/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # Express/Fastify setup
│   ├── config.ts          # Configuration
│   ├── types.ts           # TypeScript types
│   ├── session/
│   │   ├── manager.ts     # Session management
│   │   └── store.ts       # In-memory session store
│   ├── claude/
│   │   ├── runner.ts      # Claude CLI spawn & output handling
│   │   └── parser.ts      # Parse CLI output
│   └── routes/
│       ├── query.ts       # POST /query
│       └── sessions.ts    # Session routes
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── tsconfig.json
```

## Docker Compose

```yaml
services:
  claude-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_MODEL=${CLAUDE_MODEL:-sonnet}
      - CLAUDE_MAX_TURNS=${CLAUDE_MAX_TURNS:-10}
      - CLAUDE_MAX_BUDGET_USD=${CLAUDE_MAX_BUDGET_USD:-1.0}
      - CLAUDE_TIMEOUT_MS=${CLAUDE_TIMEOUT_MS:-300000}
    volumes:
      - claude-sessions:/app/sessions
    restart: unless-stopped

volumes:
  claude-sessions:
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key |
| `CLAUDE_MODEL` | No | sonnet | Default model |
| `CLAUDE_MAX_TURNS` | No | 10 | Max turns per prompt |
| `CLAUDE_MAX_BUDGET_USD` | No | 1.0 | Max budget per prompt |
| `CLAUDE_TIMEOUT_MS` | No | 300000 | Timeout (5 min) |
| `PORT` | No | 3000 | Server port |

## CLI Integration

ใช้ Claude Code CLI ในโหมด print:

```bash
# Single query
echo "prompt" | claude -p

# Resume session
echo "prompt" | claude -p --resume <sessionId>
```

**Output handling:**
- Parse stdout สำหรับ response
- Parse stderr สำหรับ progress/tool use
- Track cost จาก CLI output

## Key Differences from claude-cli-rest-api (Python)

- ใช้ Bun/Node.js แทน Python
- ใช้ spawn() กับ Claude Code CLI โดยตรง
- Session management ใน memory (ไม่ต้องการ persistence ในขั้นแรก)
- TypeScript สำหรับ type safety

## Next Steps (Future)

- Streaming response (Server-Sent Events)
- WebSocket support
- Session persistence (Redis/File)
- Multiple model support
- MCP server integration

## Notes

- ศึกษา opencode-line เป็นหลักสำหรับ pattern LINE Bot → REST API
- ศึกษา claude-code-line สำหรับ Claude CLI integration
- ศึกษา claude-code-web-terminal สำหรับ PTY/stream handling
