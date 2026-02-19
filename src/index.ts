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

// --- Logging helper ---
function log(...args: any[]) {
  const ts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date())
  console.log(`[${ts}]`, ...args)
}

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
const lineBlobClient = new line.messagingApi.MessagingApiBlobClient({ channelAccessToken })

// --- OpenCode HTTP Client (direct fetch, no SDK needed) ---
const opencodeAuth = opencodePassword
  ? "Basic " + Buffer.from(`opencode:${opencodePassword}`).toString("base64")
  : ""

async function opencodeRequest(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<any> {
  const headers: Record<string, string> = {
    "x-opencode-directory": encodeURIComponent(opencodeDir),
  }
  if (opencodeAuth) headers["Authorization"] = opencodeAuth
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const resp = await fetch(`${opencodeUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: signal ?? AbortSignal.timeout(300_000),
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

const PROMPT_TIMEOUT_MS = Number(process.env.PROMPT_TIMEOUT_MS ?? 120_000) // 2 min

type PromptContent = string | { parts: Array<{ type: string; text?: string; image?: { url: string } }> }

async function sendPrompt(sessionId: string, content: PromptContent, isGroup: boolean = false, userId?: string, quotedMessageId?: string): Promise<any> {
  // Prefix to prevent interactive question tool (blocks the API)
  let prefixed = `[IMPORTANT: Always respond directly with text. Do NOT use the question tool to ask clarifying questions. If unsure, make your best guess and explain your assumptions.]\n\n`

  // Add user context if available
  if (userId) {
    const userContext = getUserContext(userId)
    if (userContext) {
      prefixed += `${userContext}\n\n`
    }
  }

  // Add reply context if this is a reply
  if (quotedMessageId) {
    prefixed += `[This is a reply to a previous message (quoted message ID: ${quotedMessageId})]\n\n`
  }

  // Add time context
  prefixed += `${getTimeContext()}\n\n`

  if (isGroup) {
    prefixed += `[GROUP CHAT: You are in a group chat. If this message is clearly NOT directed at you (just people chatting with each other, unrelated conversations), respond with exactly [SKIP] and nothing else. If the message mentions you, asks a question, or could be directed at you, respond normally.]\n\n`
  }

  // Build parts array
  let parts: Array<{ type: string; text?: string; image?: { url: string } }>
  if (typeof content === "string") {
    parts = [{ type: "text", text: prefixed + content }]
  } else {
    // Update text parts with prefix
    parts = content.parts.map(p => {
      if (p.type === "text") {
        return { ...p, text: prefixed + (p.text || "") }
      }
      return p
    })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROMPT_TIMEOUT_MS)

  try {
    const result = await opencodeRequest("POST", `/session/${sessionId}/message`, {
      parts,
    }, controller.signal)
    clearTimeout(timeout)
    return result
  } catch (err: any) {
    clearTimeout(timeout)
    // On timeout, try to get partial response from messages
    if (err?.name === "AbortError" || err?.message?.includes("abort")) {
      console.log("Prompt timed out, fetching partial response...")
      await abortSession(sessionId)
      return fetchLastAssistantMessage(sessionId)
    }
    throw err
  }
}

async function fetchLastAssistantMessage(sessionId: string): Promise<any> {
  try {
    const messages = await opencodeRequest("GET", `/session/${sessionId}/message`)
    if (!Array.isArray(messages)) return null
    // Find last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.info?.role === "assistant") return messages[i]
    }
  } catch {
    // ignore
  }
  return null
}

async function abortSession(sessionId: string): Promise<void> {
  await opencodeRequest("POST", `/session/${sessionId}/abort`).catch(() => {})
}

// --- Extract response text from all part types ---
function extractResponse(result: any): string {
  if (!result?.parts) return "Done. (no text output)"

  const parts: string[] = []

  for (const p of result.parts) {
    // Direct text response
    if (p.type === "text" && p.text) {
      parts.push(p.text)
    }
    // Tool question - extract the question text for user
    if (p.type === "tool" && p.tool === "question" && p.state?.input?.questions) {
      for (const q of p.state.input.questions) {
        let qText = q.question || ""
        if (q.options?.length) {
          qText += "\n" + q.options.map((o: any, i: number) => `${i + 1}. ${o.label}${o.description ? ` - ${o.description}` : ""}`).join("\n")
        }
        if (qText) parts.push(qText)
      }
    }
    // Reasoning - use as fallback if no text parts
    if (p.type === "reasoning" && p.text) {
      if (!result.parts.some((x: any) => x.type === "text" && x.text)) {
        parts.push(p.text)
      }
    }
  }

  return parts.join("\n\n") || "Done. (no text output)"
}

// --- Handle incoming LINE Image message ---
async function handleImageMessage(
  userId: string,
  messageId: string,
  replyToken: string,
  sessionKey: string | null = userId,
  isGroup: boolean = false,
): Promise<void> {
  const userName = userProfiles.get(userId)?.displayName || userId.slice(-8)
  log(`📷 Image from ${userName}, group: ${isGroup}, key: ${sessionKey?.slice(-8)}`)

  try {
    // Download image from LINE (SDK v9 uses BlobClient)
    const stream = await lineBlobClient.getMessageContent(messageId)
    const chunks: Buffer[] = []
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk))
    }
    const imageBuffer = Buffer.concat(chunks)
    const base64 = imageBuffer.toString("base64")
    const sizeKB = Math.round(imageBuffer.length / 1024)
    log(`📷 Image downloaded: ${sizeKB}KB`)

    // Send image description to OpenCode session
    const key = sessionKey || userId
    let session = sessions.get(key)
    if (!session) {
      log("[image] Creating new session...")
      const result = await createSession(`LINE: ${userId.slice(-8)}`)
      log("[image] Session created:", result.id)
      session = { sessionId: result.id, userId, isGroup }
      sessions.set(key, session)
    }
    log("[image] Sending prompt to OpenCode...")
    const mimeType = imageBuffer[0] === 0xFF ? "image/jpeg"
                   : imageBuffer[0] === 0x89 ? "image/png"
                   : "image/jpeg"
    const result = await sendPrompt(session.sessionId, `[User sent an image (${sizeKB}KB, ${mimeType}). Image analysis is not yet supported by the current model. Please acknowledge that you received the image and let the user know.]`, isGroup, userId)
    log("[image] Got response, extracting...")
    const responseText = extractResponse(result)
    log(`📷 Response (${responseText.length} chars): ${responseText.slice(0, 100)}${responseText.length > 100 ? "..." : ""}`)
    await sendMessage(key, responseText, replyToken)
    log("[image] Done")
  } catch (err: any) {
    log("❌ Error handling image:", err?.message)
    await sendMessage(sessionKey || userId, `Failed to process image: ${err?.message?.slice(0, 200) ?? "Unknown error"}`, replyToken)
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

// --- User Memory ---
interface UserProfile {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
  firstSeen: number
  lastSeen: number
  messageCount: number
}
const userProfiles = new Map<string, UserProfile>()

async function getUserProfile(userId: string): Promise<UserProfile | null> {
  // Check cache first
  const cached = userProfiles.get(userId)
  if (cached && Date.now() - cached.lastSeen < 3600000) { // 1 hour cache
    cached.lastSeen = Date.now()
    cached.messageCount++
    return cached
  }

  try {
    const profile = await lineClient.getProfile(userId)
    const userProfile: UserProfile = {
      userId,
      displayName: profile.displayName || "Unknown",
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
      firstSeen: cached?.firstSeen || Date.now(),
      lastSeen: Date.now(),
      messageCount: (cached?.messageCount || 0) + 1,
    }
    userProfiles.set(userId, userProfile)
    return userProfile
  } catch (err) {
    console.warn("Failed to get user profile:", err)
    return cached || null
  }
}

function getUserContext(userId: string): string {
  const profile = userProfiles.get(userId)
  if (!profile) return ""
  return `[User Info: ${profile.displayName} (messages: ${profile.messageCount})]`
}

function getTimeContext(): string {
  const now = new Date()
  const bangkokTime = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now)
  return `[Time: ${bangkokTime}+07:00]`
}

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

📖 พิมพ์ /help ดูคำสั่งทั้งหมด
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
// Group/room uses groupId/roomId so all members share one session
// 1:1 chat uses userId
function getSessionKey(event: any): string | null {
  if (event.source?.groupId) {
    return event.source.groupId
  }
  if (event.source?.roomId) {
    return event.source.roomId
  }
  if (event.source?.userId) {
    return event.source.userId
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

// --- Send message: replyMessage first (free), fallback to pushMessage ---
async function sendMessage(to: string, text: string, replyToken?: string): Promise<void> {
  const chunks = chunkText(text)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    // First chunk: try replyMessage (free, no quota)
    if (i === 0 && replyToken) {
      try {
        await lineClient.replyMessage({
          replyToken,
          messages: [{ type: "text", text: chunk }],
        })
        continue
      } catch (err: any) {
        console.log("replyMessage failed, falling back to push:", err?.message)
      }
    }

    // Remaining chunks or reply failed: pushMessage with retry
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await lineClient.pushMessage({
          to,
          messages: [{ type: "text", text: chunk }],
        })
        break
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        if (msg.includes("429") && attempt < 2) {
          const delay = (attempt + 1) * 5000
          console.log(`Rate limited, retrying in ${delay / 1000}s...`)
          await new Promise((r) => setTimeout(r, delay))
        } else {
          console.error("Failed to send LINE message:", msg)
          break
        }
      }
    }
  }
}

// --- Handle incoming LINE message ---
async function handleTextMessage(
  userId: string,
  text: string,
  replyToken: string,
  sessionKey: string | null = userId,
  isGroup: boolean = false,
  quotedMessageId?: string,
): Promise<void> {
  const userName = userProfiles.get(userId)?.displayName || userId.slice(-8)
  log(`💬 ${userName}: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}" [group:${isGroup}, key:${sessionKey?.slice(-8)}, quoted:${quotedMessageId || "none"}]`)

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

📱 ทำงานบน LINE Bot

🧪 มี Workspace ให้ทดสอบเขียน Code ได้

📦 GitHub: https://github.com/monthop-gmail/opencode-playground-workspace-007
🌐 Deploy: https://opencode-playground-workspace-007.pages.dev

💬 คุยส่วนตัว: ${lineOAUrl}`
    
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: aboutMsg }],
    })
    return
  }

  // Help command
  if (text.toLowerCase() === "/help" || text.toLowerCase() === "/คำสั่ง") {
    const helpMsg = `📖 คำสั่งทั้งหมด:

🤖 ทั่วไป
  /about - เกี่ยวกับ bot
  /help - คำสั่งทั้งหมด
  /cny - อวยพรตรุษจีน

💻 Session
  /new - เริ่ม session ใหม่
  /abort - ยกเลิก prompt
  /sessions - ดู session ปัจจุบัน

👥 ในกลุ่ม: @mention bot หรือพิมพ์ opencode นำหน้า
💬 แชทส่วนตัว: ถามได้เลย!`
    
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: helpMsg }],
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
      await sendMessage(sessionKey || userId, "Failed to create coding session. Please try again.", replyToken)
      return
    }
  }

  // Send prompt to OpenCode
  log(`➡️ Sending to OpenCode (session: ${session.sessionId.slice(-8)}): ${text.slice(0, 60)}${text.length > 60 ? "..." : ""}`)
  try {
    // Get user profile for context
    await getUserProfile(userId)
    
    const result = await sendPrompt(session.sessionId, text, isGroup, userId, quotedMessageId)

    // Extract response from all part types
    const responseText = extractResponse(result)

    // In group: skip if AI decides message isn't for it
    const trimmedResponse = responseText.trim()
    if (isGroup && (trimmedResponse === "[SKIP]" || trimmedResponse.startsWith("[SKIP]\n") || trimmedResponse.startsWith("[SKIP] "))) {
      log(`⏭️ Skipped: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`)
      return
    }

    const modelId = result?.info?.modelID || "?"
    const cost = result?.info?.cost ?? 0
    log(`⬅️ Response (${responseText.length} chars, model:${modelId}, cost:${cost}): ${responseText.slice(0, 100)}${responseText.length > 100 ? "..." : ""}`)
    await sendMessage(sessionKey || userId, responseText, replyToken)
  } catch (err: any) {
    log("❌ OpenCode prompt error:", err?.message)

    // If session not found, clear and retry
    if (err?.message?.includes("404") || err?.message?.includes("not found")) {
      if (sessionKey) sessions.delete(sessionKey)
      await sendMessage(sessionKey || userId, "Session expired. Please send your message again.", replyToken)
    } else {
      await sendMessage(sessionKey || userId, `Error: ${err?.message?.slice(0, 200) ?? "Unknown error"}`, replyToken)
    }
  }
}

// --- Check if bot is mentioned in a group message ---
function isBotMentioned(event: any): boolean {
  // Check LINE mention API
  const mentionees = event.message?.mention?.mentionees
  if (Array.isArray(mentionees)) {
    if (mentionees.some((m: any) => m.type === "user" && m.userId === botUserId)) return true
  }
  // Check text triggers
  const text = (event.message?.text ?? "").toLowerCase()
  if (text.startsWith("@bot") || text.startsWith("opencode") || text.startsWith("@opencode")) return true
  // Commands always respond
  if (text.startsWith("/")) return true
  return false
}

// --- Start ---
await waitForOpenCode()

// Get bot userId for mention detection
let botUserId = ""
try {
  const info = await lineClient.getBotInfo()
  botUserId = info.userId ?? ""
  console.log("Bot userId:", botUserId)
} catch (err: any) {
  console.warn("Could not get bot info:", err?.message)
}

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
          const isGroup = !!event.source?.groupId || !!event.source?.roomId
          const sessionKey = getSessionKey(event)
          const quotedMessageId = event.message?.quotedMessageId

          handleTextMessage(
            event.source.userId,
            event.message.text,
            event.replyToken,
            sessionKey,
            isGroup,
            quotedMessageId,
          ).catch((err) => {
            console.error("Error handling text message:", err)
          })
        }

        // Handle image messages (including group)
        if (
          event.type === "message" &&
          event.message?.type === "image" &&
          event.source?.userId
        ) {
          const isGroup = !!event.source?.groupId || !!event.source?.roomId
          const sessionKey = getSessionKey(event)

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
