import * as line from "@line/bot-sdk"
import { createHmac } from "node:crypto"

// --- Config ---
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
const channelSecret = process.env.LINE_CHANNEL_SECRET
const port = Number(process.env.PORT ?? 3000)
const opencodeUrl = (process.env.OPENCODE_URL ?? "http://opencode:4096").replace(/\/$/, "")
const opencodePassword = process.env.OPENCODE_PASSWORD ?? ""
const opencodeDir = process.env.OPENCODE_DIR ?? "/workspace"
const lineOAUrl = process.env.LINE_OA_URL ?? "https://line.me/ti/p/~your-oa"

if (!channelAccessToken || !channelSecret) {
  console.error("Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET")
  process.exit(1)
}

console.log("LINE bot configuration:")
console.log("- Channel access token present:", !!channelAccessToken)
console.log("- Channel secret present:", !!channelSecret)
console.log("- Webhook port:", port)
console.log("- OpenCode URL:", opencodeUrl)
console.log("- OpenCode dir:", opencodeDir)

// --- LINE Client ---
const lineClient = new line.messagingApi.MessagingApiClient({ channelAccessToken })

// --- OpenCode HTTP Client (direct fetch, no SDK needed) ---
const opencodeAuth = opencodePassword
  ? "Basic " + Buffer.from(`opencode:${opencodePassword}`).toString("base64")
  : ""

async function opencodeRequest(method: string, path: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = {
    "x-opencode-directory": encodeURIComponent(opencodeDir),
  }
  if (opencodeAuth) headers["Authorization"] = opencodeAuth
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const resp = await fetch(`${opencodeUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(300_000), // 5 min for long prompts
  })

  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`OpenCode API ${resp.status}: ${text.slice(0, 300)}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function createSession(title: string): Promise<{ id: string }> {
  return opencodeRequest("POST", "/session", { title })
}

async function sendPrompt(sessionId: string, text: string): Promise<any> {
  return opencodeRequest("POST", `/session/${sessionId}/message`, {
    parts: [{ type: "text", text }],
  })
}

async function abortSession(sessionId: string): Promise<void> {
  await opencodeRequest("POST", `/session/${sessionId}/abort`).catch(() => {})
}

// --- Handle incoming LINE Image message ---
async function handleImageMessage(
  userId: string,
  messageId: string,
  replyToken: string,
  sessionKey: string | null = userId,
  isGroup: boolean = false,
): Promise<void> {
  console.log(`Image message from ${userId}, group: ${isGroup}, key: ${sessionKey}`)

  // Send acknowledgment first
  await lineClient.replyMessage({
    replyToken,
    messages: [{ type: "text", text: "Received your image! Analyzing..." }],
  }).catch(() => {})

  try {
    // Download image from LINE
    const imageBuffer = await lineClient.getMessageContent(messageId)
    
    // Convert to base64
    const base64 = Buffer.from(imageBuffer).toString("base64")
    
    // Send to OpenCode - note: OpenCode may not support image input directly
    // For now, we'll just acknowledge receipt
    await sendMessage(sessionKey || userId, `Image received! (${base64.length} bytes)\n\nNote: Image analysis depends on OpenCode's vision capabilities.`)
  } catch (err: any) {
    console.error("Error handling image:", err?.message)
    await sendMessage(sessionKey || userId, `Failed to process image: ${err?.message?.slice(0, 200) ?? "Unknown error"}`)
  }
}

// --- Wait for OpenCode server ---
async function waitForOpenCode(maxRetries = 30, delayMs = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const headers: Record<string, string> = {}
      if (opencodeAuth) headers["Authorization"] = opencodeAuth
      const resp = await fetch(`${opencodeUrl}/global/health`, {
        headers,
        signal: AbortSignal.timeout(3000),
      })
      if (resp.ok) {
        console.log("OpenCode server is ready")
        return true
      }
    } catch {
      // not ready yet
    }
    console.log(`Waiting for OpenCode server... (${i + 1}/${maxRetries})`)
    await new Promise((r) => setTimeout(r, delayMs))
  }
  console.error("OpenCode server did not become ready")
  return false
}

// --- Session Management ---
// For user chats: key = userId
// For group chats: key = groupId
const sessions = new Map<string, { sessionId: string; userId: string; isGroup: boolean }>()

// --- Handle LINE Join events (bot added to group) ---
async function handleJoinEvent(event: any): Promise<void> {
  const groupId = event.source?.groupId
  const roomId = event.source?.roomId
  const chatId = groupId || roomId
  
  if (chatId) {
    console.log(`Bot joined group/room: ${chatId}`)
    // Send welcome message with CNY greeting
    const welcomeMsg = `🧑‍💻 OpenCode AI Bot joined!
    
🎊 สวัสดีปีมะเส็ง 2569 🧧

Send any coding prompt to start.

Commands:
/new - New session
/abort - Cancel
/sessions - Show session
/cny - อวยพรตรุษจีน

💬 คุยส่วนตัว: ${lineOAUrl}`
    
    if (groupId) {
      await lineClient.pushMessage({
        to: groupId,
        messages: [{ type: "text", text: welcomeMsg }],
      }).catch((err: any) => console.error("Welcome error:", err?.message))
    }
  }
}

// --- Handle LINE Leave events (bot removed from group) ---
async function handleLeaveEvent(event: any): Promise<void> {
  const groupId = event.source?.groupId
  const roomId = event.source?.roomId
  const chatId = groupId || roomId
  
  if (chatId) {
    console.log(`Bot left group/room: ${chatId}`)
    sessions.delete(chatId)
  }
}

// --- Get session key based on source type ---
function getSessionKey(event: any): string | null {
  if (event.source?.userId) {
    return event.source.userId
  }
  if (event.source?.groupId) {
    return event.source.groupId
  }
  if (event.source?.roomId) {
    return event.source.roomId
  }
  return null
}

// --- LINE Signature Validation ---
function validateSignature(body: string, signature: string): boolean {
  const hash = createHmac("SHA256", channelSecret!)
    .update(body)
    .digest("base64")
  return hash === signature
}

// --- Chunk long messages for LINE (max 5000 chars) ---
const LINE_MAX_TEXT = 5000

function chunkText(text: string, limit: number = LINE_MAX_TEXT): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    let breakAt = remaining.lastIndexOf("\n", limit)
    if (breakAt < limit * 0.3) {
      breakAt = remaining.lastIndexOf(" ", limit)
    }
    if (breakAt < limit * 0.3) {
      breakAt = limit
    }

    const chunk = remaining.slice(0, breakAt)
    remaining = remaining.slice(breakAt).trimStart()

    const backtickCount = (chunk.match(/```/g) || []).length
    if (backtickCount % 2 !== 0) {
      chunks.push(chunk + "\n```")
      remaining = "```\n" + remaining
    } else {
      chunks.push(chunk)
    }
  }

  return chunks
}

// --- Send long message via Push API ---
async function sendMessage(userId: string, text: string): Promise<void> {
  const chunks = chunkText(text)
  for (const chunk of chunks) {
    await lineClient
      .pushMessage({
        to: userId,
        messages: [{ type: "text", text: chunk }],
      })
      .catch((err: any) => {
        console.error("Failed to send LINE message:", err?.message ?? err)
      })
  }
}

// --- Handle incoming LINE message ---
async function handleTextMessage(
  userId: string,
  text: string,
  replyToken: string,
  sessionKey: string | null = userId,
  isGroup: boolean = false,
): Promise<void> {
  console.log(`Text message from ${userId}, group: ${isGroup}, key: ${sessionKey}`)

  // Special commands
  if (text.toLowerCase() === "/new") {
    if (sessionKey) sessions.delete(sessionKey)
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: "Session cleared. Next message starts a new session." }],
    })
    return
  }

  if (text.toLowerCase() === "/abort") {
    const session = sessionKey ? sessions.get(sessionKey) : null
    if (session) {
      await abortSession(session.sessionId)
      await lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "Prompt cancelled." }],
      })
    } else {
      await lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "No active session." }],
      })
    }
    return
  }

  if (text.toLowerCase() === "/sessions") {
    const session = sessionKey ? sessions.get(sessionKey) : null
    const msg = session
      ? `Active session: ${session.sessionId}`
      : "No active session. Send a message to start one."
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: msg }],
    })
    return
  }

  // CNY Greeting command
  if (text.toLowerCase() === "/cny") {
    const cnyMsg = `🧧 สวัสดีปีมะเส็ง 2569 🧧

🎊 ขอให้มีความสุข มีโชค มีลาภ
💰 ร่ำรวย อายุยืน สุขภาพดี
🐍 ปีงูให้ทุกอย่างราบรื่น

🌐 Website: ${opencodeUrl.replace('http://', '').replace(':4096', '')}

💬 คุยส่วนตัวกับ AI: ${lineOAUrl}

🎯 Workshop: https://opencode-playground-workspace-007.pages.dev/`
    
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: cnyMsg }],
    })
    return
  }

  // About command
  if (text.toLowerCase() === "/about" || text.toLowerCase() === "/who") {
    const aboutMsg = `🧑‍💻 สวัสดีครับ!

ผมคือ OpenCode AI Bot
🤖 Model: Big-Pickle (opencode/big-pickle)
📝 Context: 200,000 tokens
💰 ฟรี!

ช่วยเขียน code สร้างโปรเจกต์ และตอบคำถามได้

💬 คุยส่วนตัว: ${lineOAUrl}`
    
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: aboutMsg }],
    })
    return
  }

  // Get or create OpenCode session
  let session = sessionKey ? sessions.get(sessionKey) : null

  if (!session) {
    console.log("Creating new OpenCode session...")
    try {
      const result = await createSession(`LINE: ${userId.slice(-8)}${isGroup ? " (group)" : ""}`)
      console.log("Created OpenCode session:", result.id)
      session = { sessionId: result.id, userId, isGroup }
      if (sessionKey) sessions.set(sessionKey, session)
    } catch (err: any) {
      console.error("Failed to create session:", err?.message)
      await sendMessage(sessionKey || userId, "Failed to create coding session. Please try again.")
      return
    }
  }

  // Send prompt to OpenCode
  console.log("Sending to OpenCode:", text)
  try {
    const result = await sendPrompt(session.sessionId, text)

    // Extract text parts from response
    const responseText =
      result?.info?.content ||
      result?.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n") ||
      "Done. (no text output)"

    console.log(`Response length: ${responseText.length} chars`)
    await sendMessage(sessionKey || userId, responseText)
  } catch (err: any) {
    console.error("OpenCode prompt error:", err?.message)

    // If session not found, clear and retry
    if (err?.message?.includes("404") || err?.message?.includes("not found")) {
      if (sessionKey) sessions.delete(sessionKey)
      await sendMessage(sessionKey || userId, "Session expired. Please send your message again.")
    } else {
      await sendMessage(sessionKey || userId, `Error: ${err?.message?.slice(0, 200) ?? "Unknown error"}`)
    }
  }
}

// --- Start ---
await waitForOpenCode()

// --- HTTP Server for LINE Webhook ---
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)

    // Health check
    if (req.method === "GET" && url.pathname === "/") {
      return new Response("OpenCode LINE Bot is running")
    }

    // LINE Webhook
    if (req.method === "POST" && url.pathname === "/webhook") {
      const body = await req.text()
      const signature = req.headers.get("x-line-signature") || ""

      if (!validateSignature(body, signature)) {
        console.error("Invalid LINE signature")
        return new Response("Invalid signature", { status: 403 })
      }

      let parsed: { events: any[] }
      try {
        parsed = JSON.parse(body)
      } catch {
        return new Response("Invalid JSON", { status: 400 })
      }

      // Process events async (return 200 immediately so LINE doesn't retry)
      for (const event of parsed.events) {
        // Handle Join events (bot added to group)
        if (event.type === "join") {
          handleJoinEvent(event).catch((err) => {
            console.error("Error handling join event:", err)
          })
          continue
        }
        
        // Handle Leave events (bot removed from group)
        if (event.type === "leave") {
          handleLeaveEvent(event).catch((err) => {
            console.error("Error handling leave event:", err)
          })
          continue
        }
        
        // Handle text messages (user or group)
        if (
          event.type === "message" &&
          event.message?.type === "text" &&
          event.source?.userId
        ) {
          const sessionKey = getSessionKey(event)
          const isGroup = !!event.source?.groupId || !!event.source?.roomId
          
          handleTextMessage(
            event.source.userId,
            event.message.text,
            event.replyToken,
            sessionKey,
            isGroup,
          ).catch((err) => {
            console.error("Error handling text message:", err)
          })
        }
        
        // Handle image messages (user or group)
        if (
          event.type === "message" &&
          event.message?.type === "image" &&
          event.source?.userId
        ) {
          const sessionKey = getSessionKey(event)
          const isGroup = !!event.source?.groupId || !!event.source?.roomId
          
          handleImageMessage(
            event.source.userId,
            event.message.id,
            event.replyToken,
            sessionKey,
            isGroup,
          ).catch((err) => {
            console.error("Error handling image message:", err)
          })
        }
      }

      return new Response("OK")
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`LINE bot webhook listening on http://localhost:${port}/webhook`)
