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
  if (!result?.parts) return "เสร็จแล้วครับ (ไม่มีข้อความตอบกลับ)"

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

  return parts.join("\n\n") || "เสร็จแล้วครับ (ไม่มีข้อความตอบกลับ)"
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
    await sendMessage(sessionKey || userId, `ประมวลผลรูปภาพไม่สำเร็จครับ: ${err?.message?.slice(0, 200) ?? "ไม่ทราบสาเหตุ"}`, replyToken)
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
    const welcomeMsg = `🧑‍💻 สวัสดีครับ! ผม OpenCode AI Bot

💬 พิมพ์อะไรก็ได้ ผมช่วยเขียน code ให้ครับ
📖 พิมพ์ /help ดูคำสั่งทั้งหมด
🔒 คุยส่วนตัว: ${lineOAUrl}`
    
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
      messages: [{ type: "text", text: "เริ่ม session ใหม่แล้วครับ ส่งข้อความมาได้เลย!" }],
    })
    return
  }

  if (text.toLowerCase() === "/abort") {
    const session = sessionKey ? sessions.get(sessionKey) : null
    if (session) {
      await abortSession(session.sessionId)
      await lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "ยกเลิกคำสั่งแล้วครับ" }],
      })
    } else {
      await lineClient.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "ไม่มี session ที่ใช้งานอยู่ครับ" }],
      })
    }
    return
  }

  if (text.toLowerCase() === "/sessions") {
    const session = sessionKey ? sessions.get(sessionKey) : null
    const msg = session
      ? `กำลังใช้งาน session อยู่ครับ (ID: ...${session.sessionId.slice(-8)})\nพิมพ์ /new เพื่อเริ่มใหม่`
      : "ยังไม่มี session ครับ ส่งข้อความมาเพื่อเริ่มใช้งาน!"
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

💬 คุยส่วนตัวกับ AI: ${lineOAUrl}

📦 GitHub: https://github.com/monthop-gmail/opencode-line`
    
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: cnyMsg }],
    })
    return
  }

  // About command
  if (text.toLowerCase() === "/about" || text.toLowerCase() === "/who") {
    const aboutMsg = `🧑‍💻 สวัสดีครับ! ผมคือ OpenCode AI Bot

🤖 Model: Big-Pickle (200K context, ฟรี!)
📱 ทำงานผ่าน LINE — ถามอะไรก็ได้ ช่วยเขียน code ให้

🧪 Playground — พิมพ์ /playground
🧘 Meditation — พิมพ์ /meditation

📦 GitHub: https://github.com/monthop-gmail/opencode-line
💬 คุยส่วนตัว: ${lineOAUrl}
📖 พิมพ์ /help ดูคำสั่งทั้งหมด`
    
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: aboutMsg }],
    })
    return
  }

  // Playground command
  if (text.toLowerCase() === "/playground" || text.toLowerCase() === "/pg") {
    const playgroundMsg = `🧪 Playground — ทดลองเขียน code ผ่าน LINE Bot

📋 วิธีเริ่มต้น:
1. สร้าง LINE Group + เชิญ bot เข้ากลุ่ม
2. ส่งข้อความให้ bot สร้าง repo ใหม่จาก template
3. เขียน code ผ่าน LINE → bot push → auto deploy!

📦 Template:
https://github.com/monthop-gmail/opencode-line-playground-template-000

🔄 CI/CD:
  PR ต้อง link issue (เช่น closes #123)
  Push to main → auto deploy ไป Cloudflare Pages

📖 ดู prompt สำหรับสร้าง repo ใหม่ได้ที่ README ของ template`

    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: playgroundMsg }],
    })
    return
  }

  // Meditation command
  if (text.toLowerCase() === "/meditation" || text.toLowerCase() === "/meditate" || text.toLowerCase() === "/jibjib" || text.toLowerCase() === "/สมาธิ") {
    const meditationMsg = `🧘 JIBJIB Meditation DApp

ทำสมาธิ 5 นาที รับ Reward บน Blockchain

💰 รางวัลต่อรอบ:
  JB Chain — JIBJIB 100K / JIBJIB C 50K / JBC 0.01
  KUB Testnet — tKUB 0.001

📌 กติกา:
  ทำได้ 3 ครั้ง/วัน เว้น 3 ชม. ระหว่างรอบ
  Bonus 2x หลัง 22:00 UTC
  ออกจากหน้าจอ = เริ่มใหม่ (anti-cheat)

🔗 เปิดแอป:
https://jibjib-meditation.pages.dev

👨‍💻 ร่วม Dev:
  GitHub: https://github.com/monthop-gmail/jibjib-meditation-dapp
  Issues: https://github.com/monthop-gmail/jibjib-meditation-dapp/issues
  Tech: Solidity / React / Wagmi V2 / RainbowKit`

    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: meditationMsg }],
    })
    return
  }

  // Help command
  if (text.toLowerCase() === "/help" || text.toLowerCase() === "/คำสั่ง") {
    const helpMsg = `📖 คำสั่งทั้งหมด:

🤖 ทั่วไป
  /about — แนะนำตัว bot
  /help — คำสั่งทั้งหมด
  /cny — อวยพรตรุษจีน

💻 Session
  /new — เริ่มบทสนทนาใหม่
  /abort — ยกเลิกคำสั่งที่กำลังทำ
  /sessions — ดูสถานะ session

🧪 Playground
  /playground — เริ่มต้นสร้าง playground

🧘 Meditation
  /meditation — ทำสมาธิรับ Reward

💬 วิธีใช้งาน:
  แชทส่วนตัว — พิมพ์ได้เลย!
  ในกลุ่ม — พิมพ์ได้เลย bot จะตอบเฉพาะข้อความที่เกี่ยวข้อง`
    
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
      await sendMessage(sessionKey || userId, "สร้าง session ไม่สำเร็จครับ ลองส่งข้อความใหม่อีกครั้ง", replyToken)
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
      await sendMessage(sessionKey || userId, "Session หมดอายุแล้วครับ ส่งข้อความมาใหม่ได้เลย", replyToken)
    } else {
      await sendMessage(sessionKey || userId, `เกิดข้อผิดพลาดครับ: ${err?.message?.slice(0, 200) ?? "ไม่ทราบสาเหตุ"}`, replyToken)
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

    // About page
    if (req.method === "GET" && url.pathname === "/about") {
      const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenCode LINE Bot — About</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a1a;color:#e0e0e0;min-height:100vh;padding:2rem 1rem}
  .container{max-width:640px;margin:0 auto}
  h1{font-size:1.8rem;margin-bottom:.5rem;background:linear-gradient(135deg,#6c5ce7,#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  h2{font-size:1.3rem;margin-top:2rem;margin-bottom:.75rem;color:#a29bfe}
  p,li{line-height:1.7;color:#b2bec3;margin-bottom:.5rem}
  a{color:#74b9ff;text-decoration:none}
  a:hover{text-decoration:underline}
  .card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:1.25rem;margin-bottom:1rem}
  .card h3{color:#55efc4;font-size:1.1rem;margin-bottom:.5rem}
  .badge{display:inline-block;background:rgba(108,92,231,.2);color:#a29bfe;padding:.2rem .6rem;border-radius:6px;font-size:.8rem;margin:.15rem .2rem}
  .badge-green{background:rgba(85,239,196,.15);color:#55efc4}
  ul{padding-left:1.2rem}
  .links{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1rem}
  .links a{background:rgba(108,92,231,.15);border:1px solid rgba(108,92,231,.3);padding:.5rem 1rem;border-radius:8px;font-size:.9rem}
  .links a:hover{background:rgba(108,92,231,.3);text-decoration:none}
  footer{margin-top:3rem;text-align:center;color:#636e72;font-size:.8rem}
</style>
</head>
<body>
<div class="container">
  <h1>OpenCode LINE Bot</h1>
  <p>AI coding agent ที่ใช้ผ่าน LINE — ถามคำถาม เขียนโค้ด ให้ AI ช่วยได้เลย</p>

  <h2>JIBJIB Meditation DApp</h2>
  <div class="card">
    <h3>ทำสมาธิ 5 นาที รับ Reward บน Blockchain</h3>
    <p>DApp สำหรับฝึกสมาธิ ทำครบ 5 นาทีรับ token reward อัตโนมัติ รองรับหลาย chain</p>
    <ul>
      <li><span class="badge badge-green">JB Chain</span> JIBJIB 100K / JIBJIB C 50K / JBC 0.01 ต่อรอบ</li>
      <li><span class="badge badge-green">KUB Testnet</span> tKUB 0.001 ต่อรอบ</li>
      <li>ทำได้ 3 ครั้ง/วัน เว้น 3 ชม. ระหว่างรอบ — Bonus 2x หลัง 22:00 UTC</li>
    </ul>
    <div class="links">
      <a href="https://jibjib-meditation.pages.dev" target="_blank">เปิดแอป</a>
      <a href="https://github.com/monthop-gmail/jibjib-meditation-dapp" target="_blank">GitHub Repo</a>
    </div>
  </div>

  <h2>Tech Stack</h2>
  <div class="card">
    <p>
      <span class="badge">Solidity 0.8.19</span>
      <span class="badge">React</span>
      <span class="badge">Wagmi V2</span>
      <span class="badge">Viem</span>
      <span class="badge">RainbowKit</span>
      <span class="badge">Cloudflare Pages</span>
    </p>
  </div>

  <h2>ร่วม Dev</h2>
  <div class="card">
    <h3>Open Source — ยินดีต้อนรับทุกคน</h3>
    <ul>
      <li>Fork repo แล้ว PR มาได้เลย</li>
      <li>ดู <a href="https://github.com/monthop-gmail/jibjib-meditation-dapp/issues" target="_blank">Issues</a> สำหรับงานที่รอคนช่วย</li>
      <li>Smart Contract (Solidity) / Frontend (React) / UX Design</li>
    </ul>
  </div>

  <h2>LINE Bot Commands</h2>
  <div class="card">
    <ul>
      <li><strong>/new</strong> — เริ่ม session ใหม่</li>
      <li><strong>/abort</strong> — ยกเลิก prompt ที่กำลังทำ</li>
      <li><strong>/about</strong> — แนะนำตัว bot</li>
      <li><strong>/help</strong> — ดูคำสั่งทั้งหมด</li>
    </ul>
  </div>

  <div class="links"><a href="${lineOAUrl}" target="_blank">เพิ่มเพื่อน LINE Bot</a></div>

  <footer><p>Built with OpenCode + LINE Messaging API</p></footer>
</div>
</body>
</html>`
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
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
