# Odoo MCP - Tarad Marketplace

## ข้อมูลเซิร์ฟเวอร์
- **URL:** https://tarad.sumana.org
- **Database:** odoo_tarad
- **เวอร์ชัน Odoo:** 18.0 (final)
- **ประเภท:** Marketplace Multi Vendor

## Tools ที่มีใน Odoo MCP

### 1. `odoo-mcp-tarad_odoo_list_servers`
**หน้าที่:** แสดงเซิร์ฟเวอร์ Odoo ที่ตั้งค่าไว้
**ตัวอย่างการใช้:**
```bash
odoo-mcp-tarad_odoo_list_servers
```

### 2. `odoo-mcp-tarad_odoo_search_read`
**หน้าที่:** ค้นหาและอ่านข้อมูลจากโมเดล Odoo
**พารามิเตอร์:**
- `model` - ชื่อโมเดล (เช่น 'res.partner', 'sale.order')
- `domain` - เงื่อนไขการค้นหา (array)
- `fields` - ฟิลด์ที่ต้องการอ่าน (array)
- `limit` - จำนวนข้อมูลสูงสุด
- `offset` - ข้ามข้อมูลจำนวน
- `order` - เรียงลำดับข้อมูล

**ตัวอย่าง:**
```bash
# ค้นหาลูกค้า
odoo-mcp-tarad_odoo_search_read model=res.partner fields='["name","email"]' limit=10

# ค้นหาออเดอร์ที่ยังไม่ยืนยัน
odoo-mcp-tarad_odoo_search_read model=sale.order domain='[["state","=","draft"]]'
```

### 3. `odoo-mcp-tarad_odoo_search_count`
**หน้าที่:** นับจำนวนข้อมูลที่ตรงกับเงื่อนไข
**พารามิเตอร์:**
- `model` - ชื่อโมเดล
- `domain` - เงื่อนไขการค้นหา

**ตัวอย่าง:**
```bash
# นับจำนวนลูกค้า
odoo-mcp-tarad_odoo_search_count model=res.partner

# นับจำนวนสินค้าที่มีในสต็อก
odoo-mcp-tarad_odoo_search_count model=product.product domain='[["qty_available",">",0]]'
```

### 4. `odoo-mcp-tarad_odoo_read`
**หน้าที่:** อ่านข้อมูลเฉพาะจาก ID
**พารามิเตอร์:**
- `model` - ชื่อโมเดล
- `ids` - รายการ ID ที่ต้องการอ่าน (array)
- `fields` - ฟิลด์ที่ต้องการอ่าน

**ตัวอย่าง:**
```bash
# อ่านข้อมูลลูกค้า ID 1,2,3
odoo-mcp-tarad_odoo_read model=res.partner ids='[1,2,3]' fields='["name","email","phone"]'
```

### 5. `odoo-mcp-tarad_odoo_create`
**หน้าที่:** สร้างข้อมูลใหม่ในโมเดล
**พารามิเตอร์:**
- `model` - ชื่อโมเดล
- `values` - ข้อมูลที่ต้องการสร้าง (object)

**ตัวอย่าง:**
```bash
# สร้างลูกค้าใหม่
odoo-mcp-tarad_odoo_create model=res.partner values='{"name":"ลูกค้าใหม่","email":"new@example.com"}'
```

### 6. `odoo-mcp-tarad_odoo_write`
**หน้าที่:** อัปเดตข้อมูลที่มีอยู่
**พารามิเตอร์:**
- `model` - ชื่อโมเดล
- `ids` - รายการ ID ที่ต้องการอัปเดต
- `values` - ข้อมูลที่ต้องการอัปเดต

**ตัวอย่าง:**
```bash
# อัปเดตอีเมลลูกค้า
odoo-mcp-tarad_odoo_write model=res.partner ids='[1]' values='{"email":"updated@example.com"}'
```

### 7. `odoo-mcp-tarad_odoo_delete`
**หน้าที่:** ลบข้อมูลจากโมเดล
**พารามิเตอร์:**
- `model` - ชื่อโมเดล
- `ids` - รายการ ID ที่ต้องการลบ

**ตัวอย่าง:**
```bash
# ลบข้อมูลทดสอบ
odoo-mcp-tarad_odoo_delete model=res.partner ids='[999]'
```

### 8. `odoo-mcp-tarad_odoo_execute`
**หน้าที่:** เรียกใช้เมธอดใดๆ ในโมเดล Odoo
**พารามิเตอร์:**
- `model` - ชื่อโมเดล
- `method` - ชื่อเมธอดที่ต้องการเรียก
- `args` - อาร์กิวเมนต์ (array)
- `kwargs` - อาร์กิวเมนต์แบบ keyword (object)

**ตัวอย่าง:**
```bash
# ยืนยันออเดอร์
odoo-mcp-tarad_odoo_execute model=sale.order method=action_confirm args='[123]'

# เรียกเมธอด custom
odoo-mcp-tarad_odoo_execute model=res.partner method=custom_method kwargs='{"param":"value"}'
```

### 9. `odoo-mcp-tarad_odoo_fields_get`
**หน้าที่:** ดูโครงสร้างฟิลด์ของโมเดล
**พารามิเตอร์:**
- `model` - ชื่อโมเดล
- `attributes` - คุณสมบัติที่ต้องการดู (array)

**ตัวอย่าง:**
```bash
# ดูโครงสร้างโมเดลลูกค้า
odoo-mcp-tarad_odoo_fields_get model=res.partner attributes='["string","type","required"]'
```

### 10. `odoo-mcp-tarad_odoo_version`
**หน้าที่:** ดูเวอร์ชัน Odoo server
**ตัวอย่าง:**
```bash
odoo-mcp-tarad_odoo_version
```

## ข้อมูล Marketplace

### โมดูลหลักที่ติดตั้ง
1. `odoo_marketplace` - Odoo Multi Vendor Marketplace (Webkul)
2. `account` - Invoicing
3. `website` - Website
4. `stock` - Inventory
5. `website_sale` - eCommerce
6. `mail` - Discuss
7. `stock_account` - WMS Accounting
8. `website_sms` - Send SMS to Visitor

### สถิติระบบ
- **ลูกค้า (res.partner):** 46 ราย
- **สินค้า (product.product):** 59 รายการ
- **ออเดอร์ขาย (sale.order):** 43 ออเดอร์
- **การเคลื่อนไหวสินค้า (stock.picking):** 32 รายการ
- **บิล/ใบแจ้งหนี้ (account.move):** 24 ใบ

### ประเภทสินค้า
ขายเฟอร์นิเจอร์สำนักงานและอุปกรณ์เสริมเป็นหลัก:
- Acoustic Bloc Screens (295 บาท)
- Cabinet with Doors (140 บาท)
- Conference Chair (33 บาท)
- Customizable Desk (750 บาท)
- Desk Combination (450 บาท)
- อุปกรณ์เสริมต่างๆ (5-12 บาท)

### ผู้ขายในระบบ (6 ราย)
1. **PropSpace Agent Demo** - approved, 0 rating, 0 sales
2. **PropSpace Seller Two** - approved, 0 rating, 0 sales
3. **ขนมไทยแม่บุญมี** - approved, rating 5.0, 1 sale
4. **งานฝีมือบ้านไทย** - approved, rating 10.0, 1 sale
5. **ร้านทดสอบ Pending** - pending, rating 10.0, 0 sales
6. **ร้านสวนผักออร์แกนิค** - approved, rating 10.0, 1 sale

## ฟิลด์พิเศษสำหรับ Marketplace
- `seller` - เป็นผู้ขายหรือไม่ (boolean)
- `state` - สถานะผู้ขาย (approved, pending)
- `average_rating` - คะแนนรีวิวเฉลี่ย
- `sol_count` - จำนวนยอดขาย
- `commission` - ค่าคอมมิชชันเริ่มต้น
- `warehouse_id` - คลังสินค้าเริ่มต้น
- `return_policy` - นโยบายคืนสินค้า
- `shipping_policy` - นโยบายการจัดส่ง
- `profile_image` - รูปโปรไฟล์
- `profile_banner` - แบนเนอร์โปรไฟล์

## Prompt ตัวอย่างสำหรับใช้งาน

### สำหรับถามเกี่ยวกับ Marketplace
```
"ดูข้อมูลผู้ขายใน marketplace"
"ดูออเดอร์ล่าสุด"
"ดูสินค้าที่ขายดี"
"ดูรีวิวผู้ขาย"
"ดูค่าคอมมิชชัน"
"ดูนโยบายการคืนสินค้า"
"ดูสถิติยอดขาย"
"ดูข้อมูลการชำระเงินผู้ขาย"
```

### สำหรับใช้ Odoo MCP
```
"ใช้ odoo-mcp ค้นหาลูกค้า"
"สร้างออเดอร์ใหม่ด้วย odoo-mcp"
"อัปเดตสถานะออเดอร์"
"ดูโครงสร้างโมเดล product.product"
"เรียกเมธอด custom ใน Odoo"
```

### Prompt เจาะจง
```
"ผู้ขายไหนมียอดขายสูงสุด"
"สินค้าอะไรขายดีที่สุด"
"ดูออเดอร์ที่ยังไม่จัดส่ง"
"ดูยอดขายรายเดือน"
"ค้นหา partner ที่มี email ตรงกับ..."
"สร้าง sale.order ใหม่ด้วยข้อมูล..."
"อัปเดต stock ของสินค้า..."
"เรียก method action_confirm บน sale.order"
```

## หมายเหตุ
- ระบบใช้ Odoo 18.0 Marketplace Multi Vendor จาก Webkul
- สามารถใช้ tools ทั้ง 10 ตัวทำงานกับระบบได้ทั้งหมด
- ข้อมูลอัปเดตล่าสุด: 2026-02-24