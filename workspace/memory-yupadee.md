# Memory - Yupadee

## Session: 2026-02-26 21:33 - 21:58

### Topics Discussed

#### 1. LINE Bot File Handling
- **Question**: ส่ง text file ใน LINE สามารถ save ลง `/workspace/temp/` และอ่านได้ไหม
- **Answer**: ได้! ต้อง download ผ่าน LINE Messaging API แล้ว save เป็นไฟล์

#### 2. File Isolation per Chat
- **Problem**: ไฟล์จากแต่ละห้อง/chat จะไม่ปนกันอย่างไร (1:1 และกลุ่ม)
- **Solution**: แยก folder ตาม session key
  ```
  /workspace/temp/
  ├── U1234567890abcdef/      # 1:1 chat (userId)
  ├── C9876543210fedcba/      # Group chat (groupId)
  ```
- **File naming**: `{timestamp}_{safe_filename}` เพื่อไม่ทับกัน

#### 3. Implementation Done
- ✅ เพิ่ม `handleFileMessage()` function
- ✅ รองรับไฟล์: `.txt`, `.csv`, `.json`, `.js`, `.ts`, `.py`, `.md`, `.log`
- ✅ Save แยก folder ตาม session key
- ✅ อ่านเนื้อหาส่งให้ AI วิเคราะห์
- ✅ อัปเดต `/help` command
- ✅ สร้าง PR #10: https://github.com/monthop-gmail/opencode-line/pull/10

#### 4. Issue vs PR Discussion
- **Issue**: สำหรับปัญหา/ไอเดีย/งานที่ต้องการทำ (ยังไม่มี code)
- **PR**: สำหรับเสนอ code ที่แก้ไขเสร็จแล้ว
- **Workflow**: Issue → Discuss → Code → PR → Merge → Close Issue

#### 5. OCR Issue (#7)
- **Current state**: Bot รับรูปได้ แต่ส่งแค่ text บอกว่า "มีรูป" ไม่ได้ส่งเนื้อหารูปให้ AI
- **Requirement**: ต้องส่งรูปเป็น base64 data URL ให้ OpenCode

#### 6. OCR Alternatives (ไม่ใช้ AI Vision)

| Option | Pros | Cons |
|--------|------|------|
| **Tesseract.js** | Free, รันใน bot ได้เลย, รองรับไทย | ความแม่นยำปานกลาง, ช้า (1-3 วินาที) |
| **Google Cloud Vision** | แม่นยำสูงมาก, เร็ว, รองรับไทย | ฟรี 1,000/month แล้วคิดเงิน ($1.50/1,000) |
| **LINE CLOVA OCR** | ภาษาไทยแม่นยำมาก, ฟรี 1,000/month, LINE ecosystem | ต้องสมัคร CLOVA API |
| **Azure Computer Vision** | แม่นยำสูง | ต้องมี Azure account, คิดเงิน |
| **AWS Textract** | แม่นยำสูง | ต้องมี AWS account, คิดเงิน |

#### 7. Recommended OCR Solution
- **LINE CLOVA OCR** เหมาะสุดสำหรับ Bot เรา
  - อยู่ LINE ecosystem เดียวกัน
  - ภาษาไทยแม่นยำที่สุด
  - มี free tier
  - API เรียบง่าย

### Next Actions
- [ ] Merge PR #10 (file handling)
- [ ] Decide OCR implementation (CLOVA vs AI Vision vs Tesseract)
- [ ] Implement OCR feature if requested

### Preferences
- ชอบภาษาไทยเป็นหลัก
- สนใจ solution ที่ฟรีหรือมี free tier
- ใช้ GitHub workflow (Issue → PR)

---

## Update: 2026-02-26 22:02 - Typhoon OCR

### Typhoon OCR Discussion
- **User asked**: "Typhoon ocr เป็นไงบ้าง"
- **Finding**: ไม่พบข้อมูลชัดเจนของ "Typhoon OCR"
  - อาจเป็น open source project เล็ก
  - หรือชื่อคล้ายกัน (EasyOCR, PaddleOCR, etc.)

### Possible OCR Names (ภาษาไทย)
1. **EasyOCR** - Python, รองรับไทยดี, Open source
2. **PaddleOCR** - ของ Baidu, เร็วและแม่นยำ
3. **Tesseract OCR** - เก่าแก่, ต้องลง lang pack
4. **CLOVA OCR** - ของ LINE, ไทยแม่นยำสุด
5. **Google Cloud Vision** - แม่นยำสูง, ฟรี 1,000/month

### Next Steps
- รอ user ยืนยันชื่อ OCR ที่ถูกต้อง
- จะประเมินและแนะนำวิธี integrate กับ Bot

---

## Update: 2026-02-26 22:08 - Typhoon OCR Implementation ✅

### Typhoon OCR Confirmed
- **URL**: https://opentyphoon.ai/model/typhoon-ocr
- **Developer**: SCB 10X (คนไทย!)
- **Model**: Qwen3-VL 2B (Vision-Language)
- **Released**: Nov 2025 (v1.5)
- **Free Tier**: 20 requests/min (1,200/hr)

### Why Typhoon OCR?
- ✅ **ดีที่สุดสำหรับภาษาไทย** - ออกแบบมาเพื่อไทยโดยเฉพาะ
- ✅ **ดีกว่า GPT-5, Gemini 2.5 Flash** ใน Thai document understanding
- ✅ **Layout-aware** - เข้าใจโครงสร้างเอกสารซับซ้อน
- ✅ **ฟรี** - เพียงพอสำหรับ Bot
- ✅ **API ง่าย** - OpenAI-compatible format

### Implementation Done
- ✅ เพิ่ม `callTyphoonOCR()` function
- ✅ แก้ `handleImageMessage()` ใช้ Typhoon OCR
- ✅ ดาวน์โหลดรูปจาก LINE → ส่งให้ Typhoon API → ได้ text กลับ
- ✅ บันทึกผลลัพธ์: `/workspace/temp/{sessionKey}/{timestamp}_ocr_result.md`
- ✅ อัปเดต `/help` command พร้อมข้อมูล OCR
- ✅ เพิ่ม `TYPHOON_OCR_API_KEY` ใน `.env.example`
- ✅ อัปเดต PR #10 รวม OCR + File handling

### API Usage
```typescript
const response = await fetch('https://api.opentyphoon.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TYPHOON_OCR_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'typhoon-ocr',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } },
        { type: 'text', text: 'Please extract all text...' },
      ],
    }],
  }),
})
```

### User Flow
1. ผู้ใช้ส่งรูปภาพใน LINE
2. Bot ตอบ "กำลังอ่านรูปด้วย OCR..."
3. ดาวน์โหลดรูปจาก LINE
4. ส่งให้ Typhoon OCR API
5. ได้ text กลับ → บันทึกไฟล์ + ส่งให้ผู้ใช้

### Next Actions (Updated)
- [x] Merge PR #10 (file handling + OCR)
- [x] ตั้งค่า `TYPHOON_OCR_API_KEY` ใน `.env`
- [ ] ทดสอบ OCR กับรูปภาษาไทย

### API Key Setup
1. ไป https://playground.opentyphoon.ai/api-key
2. สร้าง account + login
3. สร้าง API key ใหม่
4. Copy ใส่ `.env`:
   ```bash
   TYPHOON_OCR_API_KEY=your-api-key-here
   ```
5. Restart bot

---

## Update: 2026-02-26 22:19 - AI Timeout Issue

### Problem
AI ดำเนินการบางเรื่องนาน บางเรื่องเร็ว จนเกิด error:
```
❌ API Error: The operation was aborted.
⏱️ คำตอบยังไม่ครบ รอสัก 1 นาที แล้วพิมพ์ "ต่อ" เพื่อขอส่วนที่เหลือ
```

**สาเหตุ**: Timeout ตั้งไว้ที่ 2 นาที (120,000 ms) แต่ AI ทำงานบางอย่างไม่ทัน

### Proposed Solution: Task Complexity Assessment

**ไอเดีย**: ให้ Bot ประเมินก่อนว่างานจะเร็วหรือช้า

#### Option 1: Rule-Based Assessment (แนะนำ)
ใช้ rule ง่ายๆ ประเมินก่อนส่งให้ AI:

```typescript
function estimateTaskComplexity(text: string, hasAttachment: boolean): 'fast' | 'slow' {
  if (hasAttachment) return 'slow'              // มีไฟล์แนบ
  if (text.length > 1000) return 'slow'         // ข้อความยาว
  if (text.includes('เขียน code')) return 'slow' // ขอเขียน code
  if (text.includes('create') || text.includes('build')) return 'slow'
  if (text.includes('/model') || text.includes('/help')) return 'fast'
  return 'fast'
}
```

**Workflow:**
- **Fast**: ทำเลย + reply ปกติ (timeout 2-3 นาที)
- **Slow**: Reply ทันที "งานอยู่ในคิว预计 2-3 นาที" แล้วค่อยส่งให้ AI

#### Option 2: Two-Phase Prompt
ส่ง prompt 2 รอบ:
1. Round 1: ให้ AI ประเมิน "fast" หรือ "slow"
2. Round 2: ทำตามผลประเมิน

**ข้อเสีย**: เรียก AI 2 ครั้ง (ช้ากว่าเดิม!)

#### Option 3: Increase Timeout (ง่ายสุด)
แก้ `.env`:
```bash
PROMPT_TIMEOUT_MS=300000  # เพิ่มเป็น 5 นาที
```

### Comparison

| Option | Complexity | User Experience | Implementation |
|--------|------------|-----------------|----------------|
| **Rule-Based** | กลาง | ดี - แจ้งล่วงหน้า | ปานกลาง |
| **Two-Phase** | สูง | ปานกลาง - ช้าลง | ยาก |
| **Increase Timeout** | ต่ำ | ปานกลาง - รอนาน | ง่ายมาก |

### Decision
- **Pending**: User กำลังพิจารณา
- **แนะนำ**: Option 1 (Rule-Based) หรือ Option 3 (Increase Timeout)

### Next Actions
- [ ] User ตัดสินใจเลือก option
- [ ] Implement ตามที่เลือก
- [ ] Test กับงานที่ใช้เวลานาน

---

## Update: 2026-02-26 22:33 - Prompt-Based Solution (New Idea!)

### User's Proposed Solution
แก้ที่ **prompt** โดยตรง - บอก AI ให้ประเมินเอง:

```
[TASK TIME ASSESSMENT]
ก่อนเริ่มงาน ประเมินว่างานนี้จะใช้เวลานานกว่า 2 นาทีหรือไม่:
- ถ้าใช่ (>2 นาที): ตอบทันทีว่า "รับทราบ ดำเนินการทันที อีก 3 นาที มาพิมพ์ abc"
- ถ้าไม่ (<2 นาที): ทำงานได้เลย แล้วตอบผลลัพธ์
```

### Advantages
✅ **ง่าย** - แค่เพิ่ม instruction ใน prompt ไม่ต้องแก้ logic
✅ **AI ตัดสินใจเอง** - AI รู้ดีที่สุดว่างานจะใช้เวลานานไหม
✅ **ไม่เพิ่ม round-trip** - ถ้างานเร็ว AI ทำเลยตอบเลย
✅ **Flexible** - AI ปรับได้ตามความซับซ้อนของงาน

### Disadvantages
⚠️ **AI อาจประเมินผิด** - บางครั้ง AI ก็ประเมินเวลาผิด
⚠️ **เพิ่ม 1 token** - ต้องเพิ่ม text ใน prompt

### Implementation
แก้ `sendPrompt()` function เพิ่ม instruction:

```typescript
const timeAssessment = `
[TASK TIME ASSESSMENT]
Before starting, estimate if this task will take more than 2 minutes:
- If YES (>2 min): Respond FIRST with "รับทราบ ดำเนินการทันที อีก 3 นาที มาพิมพ์ abc"
- If NO (<2 min): Proceed with the task immediately and respond with result
`

const prefixed = `[IMPORTANT: ...]\n\n${timeAssessment}\n\n[USER REQUEST]\n${text}`
```

### Comparison with Previous Options

| Option | Simplicity | Accuracy | Overhead |
|--------|------------|----------|----------|
| **Rule-Based** | กลาง | ปานกลาง | ต่ำ |
| **Two-Phase** | ต่ำ | สูง | สูง (2 calls) |
| **Increase Timeout** | สูงมาก | ต่ำ | ต่ำ |
| **Prompt Instruction** (ใหม่!) | **สูงมาก** | **ปานกลาง-สูง** | **ต่ำมาก** |

### Decision
- **Pending**: User กำลังพิจารณา
- **แนะนำ**: Prompt Instruction (ง่ายสุด + ได้ผลดี)

### Next Actions (Updated)
- [ ] User ตัดสินใจ
- [ ] เพิ่ม time assessment instruction ใน prompt
- [ ] Test กับงานที่ใช้เวลานาน
