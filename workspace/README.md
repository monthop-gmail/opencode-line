# Workspace Onboard Opencode

Workspace สำหรับ collaboration กับ Opencode (LINE Bot)

---

## โครงสร้าง Workspace

```
/workspace/
├── AGENTS.md                    # Instructions สำหรับ bot (สำคัญ!)
├── README.md                    # ไฟล์นี้ - อธิบายโครงสร้าง workspace
├── opencode.json                # Opencode configuration + MCP servers
│
├── projects/                    # งานจริง — แต่ละตัวมี git repo แยก
│   ├── ccss-math-k-cc-framework/
│   ├── hosting-skill/
│   ├── location-share/
│   ├── location-share-pwa/
│   ├── location-share-scripts/
│   ├── lottery-checker/
│   ├── odoo-line-bot/
│   ├── opencode-line/
│   └── opencode-line-productivity-store/
│
├── playground/                  # ทดลอง/เรียนรู้
│   └── template-repo/
│
├── repos/                       # clone มาอ้างอิง
│   └── odoo-mcp-claude/
│
├── docs/                        # เอกสารทั่วไป
│
├── skill-*.md                   # MCP Skills
│   └── skill-odoo-marketplace.md
│
├── memory-*.md                  # Memory/Context จาก sessions ก่อนหน้า
│   ├── memory-for-nst-opencode.md
│   ├── memory-hct.md
│   ├── memory-icb.md
│   ├── memory-mtr.md
│   ├── memory-willpower.md
│   └── memory-yupadee.md
│
├── odoo-mcp-tarad.md            # Odoo MCP configuration
└── odoo-mcp-tarad-geminiflash.md
```

---

## วิธีหาไฟล์ตาม Topic

### Odoo Related
- **Skills:** `skill-odoo-*.md`
- **Config:** `odoo-mcp-tarad.md`, `odoo-mcp-tarad-geminiflash.md`
- **MCP Source:** `repos/odoo-mcp-claude/`

### Blockchain (EVM)
- **MCP Config:** `opencode.json` — jbchain, kubchain, kubtestnet, kubl2testnet

### Memory/Context จาก Sessions ก่อนหน้า
- `memory-*.md` — อ่านเพื่อเข้าใจ context เดิม

### Workflow & Guidelines
- `AGENTS.md` — Instructions สำหรับ bot

---

## ประเภทไฟล์

| ไฟล์ | วัตถุประสงค์ |
|------|-------------|
| `AGENTS.md` | **สำคัญที่สุด** — Instructions สำหรับ bot |
| `README.md` | อธิบายโครงสร้าง workspace (ไฟล์นี้) |
| `docs/*.md` | เอกสารทั่วไป, guides, tutorials |
| `skill-*.md` | MCP skills สำหรับใช้กับ tools |
| `memory-*.md` | Context จาก sessions ก่อนหน้า |
| `projects/` | งานจริง — แต่ละตัวมี git repo แยก |
| `playground/` | ทดลอง/เรียนรู้ |
| `repos/` | clone มาอ้างอิง |

---

## Workflow การทำงาน

เมื่อ user พูดคุยกับ bot:

1. **Bot อ่าน AGENTS.md** — เข้าใจ role และ rules
2. **Bot อ่าน README.md** — เข้าใจโครงสร้าง workspace
3. **ตอบคำถาม** — ให้ข้อมูลทันที
4. **สร้างไฟล์ใหม่** (ถ้า user ขอ):
   - `docs/*.md` สำหรับเอกสารทั่วไป
   - `skill-*.md` สำหรับ MCP skills
   - หรือสร้าง project ใหม่ใน `projects/`
5. **Git Commit & Push** — บันทึกขึ้น GitHub

---

## Projects

| Project | Path | Description |
|---------|------|-------------|
| ccss-math-k-cc-framework | projects/ | CCSS Math framework |
| hosting-skill | projects/ | Hosting skill |
| location-share | projects/ | Location sharing app |
| location-share-pwa | projects/ | Location share PWA |
| location-share-scripts | projects/ | Location share scripts |
| lottery-checker | projects/ | Lottery checker |
| odoo-line-bot | projects/ | Odoo LINE bot |
| opencode-line | projects/ | OpenCode LINE bot source |
| opencode-line-productivity-store | projects/ | Productivity store |

---

## MCP Tools

| MCP | Description |
|-----|-------------|
| context7 | ค้นหา documentation ของ library/framework |
| gh_grep | ค้นหา code ตัวอย่างจาก GitHub |
| odoo-mcp-tarad | เชื่อมต่อ Odoo ERP |
| jbchain | EVM: JIB Chain (8899) |
| kubchain | EVM: Bitkub Chain (96) |
| kubtestnet | EVM: Bitkub Testnet (25925) |
| kubl2testnet | EVM: Kub L2 Testnet (259251) |

---

## GitHub Repos

| Repo | Visibility | Description |
|------|-----------|-------------|
| `monthop-gmail/workspace-onboard-opencode` | Private | Workspace นี้ |
| `monthop-gmail/opencode-line` | Public | LINE Bot source code |

---

## Notes

- Workspace นี้ใช้สำหรับ **LINE Bot** ไม่ใช่ CLI terminal
- Bot ไม่สามารถดูรูปภาพได้
- Bot ต้องไม่ใช้ question tool (จะทำให้ API ค้าง)
- ข้อความตอบกลับควรสั้นกระชับ (LINE limit 5000 ตัวอักษร)
- **สร้าง project ใหม่ใน `projects/` เสมอ** พร้อม `git init`

---

*Last updated: 2026-03-04*
