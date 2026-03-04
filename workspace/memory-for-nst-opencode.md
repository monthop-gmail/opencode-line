# Memory for NST OpenCode Bot (JAVIS)

## Bot Identity
- **Name:** JAVIS
- **Platform:** LINE Bot
- **Role:** AI Assistant for software engineering & system monitoring

## Team Members (LINE Group)
- **มณฑป WP9** - พี่มณฑป (Main User)
- **K.Oat** - พี่โอ๊ต

## Proxmox VE Host

### Connection Info
- **Host IP:** `192.168.8.239`
- **Username:** `root@pam`
- **Password:** *(ต้องกรอกเอง)*
- **API Port:** `8006`
- **Verify SSL:** `False` (self-signed cert)

### Monitoring Setup

#### CPU Monitor
- **Threshold:** 80%
- **Check Interval:** 1 นาที (60 วินาที)
- **Alert:** LINE Notify

#### Script Location
- `/workspace/proxmox_cpu_monitor.py`

### LINE Notify
- **Token:** *(ต้องกรอกเอง)*
- **Setup:** https://notify-bot.line.me

### Python Dependencies
```bash
pip install proxmoxer requests
```

### API Endpoints
```bash
# Node status
GET /api2/json/nodes/pve/status

# VM list
GET /api2/json/nodes/pve/qemu

# Container list
GET /api2/json/nodes/pve/lxc

# Cluster resources
GET /api2/json/cluster/resources
```

### Example Usage
```python
from proxmoxer import ProxmoxAPI

prox = ProxmoxAPI(
    '192.168.8.239',
    user='root@pam',
    password='YOUR_PASSWORD',
    verify_ssl=False
)

# Get node status
node_stats = prox.nodes('pve').status.get()
cpu_usage = node_stats['cpu'] * 100
memory_usage = node_stats['memory'] / node_stats['maxmem'] * 100

# Get VMs
vms = prox.nodes('pve').qemu.get()

# Get containers
containers = prox.nodes('pve').lxc.get()
```

---
**Last Updated:** 2026-03-02

---

## Odoo Marketplace Integration (2026-03-04)

### Odoo Connection (odoo-mcp-tarad)
- **Server URL:** https://tarad.sumana.org
- **Database:** odoo_tarad
- **Status:** Connected (default server)

### Odoo Marketplace System
- **Module:** odoo_marketplace (ติดตั้งแล้ว)
- **Models ที่เกี่ยวข้อง:**
  - `product.template` - สินค้าทั้งหมด
  - `product.product` - Product variants
  - `product.category` - หมวดหมู่สินค้า
  - `res.partner` - ลูกค้า/ผู้ขาย

- **Seller Groups:**
  - `odoo_marketplace.marketplace_seller_group`
  - `odoo_marketplace.marketplace_draft_seller_group`

### Key Product Fields
- `name` - ชื่อสินค้า
- `list_price` - ราคาขาย
- `standard_price` - ต้นทุน
- `categ_id` - หมวดหมู่
- `is_published` - เผยแพร่แล้วหรือไม่
- `website_published` - แสดงบนเว็บไซต์
- `image_1920` - รูปภาพสินค้า
- `description` - คำอธิบาย
- `active` - เปิดใช้งาน

### LINE Bot Capabilities (AI Powered)
1. ค้นหาสินค้า (search products)
2. แสดงรายละเอียดสินค้า (product details)
3. แสดงสินค้าตามหมวดหมู่ (products by category)
4. ตรวจสอบสถานะสินค้า (product status)
5. แสดงสินค้าใหม่/สินค้าแนะนำ (new/featured products)

### Important Notes
- Bot รันอยู่บน LINE Bot server ไม่ใช่ CLI terminal
- ข้อความที่ได้รับมาจากผู้ใช้ LINE
- ห้ามใช้ question tool (จะทำให้ API ค้าง)
- ตอบตรงๆ เลย ถ้าไม่แน่ใจให้เดาและอธิบาย
- ข้อความตอบกลับควรสั้นกระชับ (LINE จำกัด 5000 ตัวอักษร)
- ในกลุ่ม LINE: ถ้าข้อความไม่ได้เรียกถึง bot โดยตรง ให้ตอบ [SKIP]

### Example User Queries
- "มีสินค้าอะไรบ้าง"
- "ขนมไทยแม่บุญมีมีสินค้าอะไรบ้าง"
- "ขอราคาสินค้า [ชื่อสินค้า]"
- "มีสินค้าในหมวด [หมวดหมู่] อะไรบ้าง"
- "สินค้าใหม่มีอะไร"

### Odoo MCP Tools Available
```python
# Search & Read
odoo-mcp-tarad_odoo_search_read(model, domain, fields, limit, offset, order)

# Count
odoo-mcp-tarad_odoo_search_count(model, domain)

# Read by ID
odoo-mcp-tarad_odoo_read(model, ids, fields)

# Create
odoo-mcp-tarad_odoo_create(model, values)

# Update
odoo-mcp-tarad_odoo_write(model, ids, values)

# Delete
odoo-mcp-tarad_odoo_delete(model, ids)

# Get Fields
odoo-mcp-tarad_odoo_fields_get(model)

# Execute Method
odoo-mcp-tarad_odoo_execute(model, method, args, kwargs)
```

### Search Domain Examples
```python
# สินค้าที่เผยแพร่แล้ว
[['is_published', '=', True]]

# สินค้าในหมวดหมู่เฉพาะ
[['categ_id', '=', category_id]]

# สินค้าที่ active
[['active', '=', True]]

# ค้นหาตามชื่อ (like)
[['name', 'ilike', 'keyword']]

# ราคามากกว่า
[['list_price', '>=', 100]]

# ผสม conditions
[['is_published', '=', True], ['active', '=', True], ['categ_id', '=', 5]]
```

### Common Product Queries
```python
# Get all products
model: product.template
fields: ['id', 'name', 'list_price', 'categ_id', 'is_published', 'active']

# Get categories
model: product.category
fields: ['id', 'name', 'parent_id']

# Get product variants
model: product.product
fields: ['id', 'name', 'product_tmpl_id', 'default_code']
```

### Response Format Guidelines
- ใช้ emoji เพื่อความน่าสนใจ (✅ ❌ 🛒 📦 💰)
- แสดงผลเป็นรายการ (bullet points)
- ระบุราคาชัดเจน (บาท)
- จำกัดผลลัพธ์ 5-10 รายการต่อข้อความ
- ถ้ามีมากกว่า ให้บอกวิธีค้นหาเพิ่ม

---
**Last Updated:** 2026-03-04
