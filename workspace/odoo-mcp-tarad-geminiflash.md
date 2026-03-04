# Odoo MCP Exploration Logs

## Server Information
- **URL:** https://tarad.sumana.org
- **Database:** `odoo_tarad`
- **Odoo Version:** 18.0-20260119 (Series 18.0)

## Installed Modules
- **odoo_marketplace:** Installed
  - *Summary:* Start your marketplace in odoo with Odoo Multi-Vendor Marketplace. Allow Multiple sellers to sell their products on your marketplace website.

## Exploration Prompts & Results

### 1. General Survey
- **Action:** List servers and version.
- **Result:** Successfully connected to Odoo 18.0. Found 46 partners in the system.

### 2. Marketplace Analysis
- **Action:** Search for marketplace-related models and data.
- **Key Models Found:**
  - `seller.shop` (Seller Shops)
  - `seller.payment` (Payments)
  - `marketplace.dashboard` (Reporting)
  - `product.template` (Extended with marketplace fields like `status` and `marketplace_seller_id`)

### 3. Seller Shops Data
- **Active Shops:**
  - สวนผักออร์แกนิค (Approved)
  - ขนมไทยแม่บุญมี (Approved)
  - งานฝีมือบ้านไทย (Approved)
  - PropSpace Agent Demo (Approved)

### 4. Marketplace Products
- **Sample Approved Products:**
  - ผักกาดออร์แกนิค (Seller: ร้านสวนผักออร์แกนิค)
  - ขนมชั้นหวานมัน (Seller: ขนมไทยแม่บุญมี)
  - คอนโด The Base Riverside (Seller: PropSpace Agent Demo)

---
*Last Updated: 2026-02-24 (UTC)*

## Extended Module Exploration

### 1. Active Functional Areas
- **Sales (sale):** Active with 43 orders. Recent activity found in Jan 2026.
- **Invoicing (account):** Active with 24 journal entries/invoices.
- **Inventory (stock):** 2 Warehouses configured (`WH`, `My Co`).
- **Website:** 2 Websites configured.

### 2. Uninstalled Modules (Not in use)
- CRM, Purchase, Project, MRP, HR are currently **uninstalled**.

### 3. Business Context
- The system is primarily used as a **Multi-Vendor Marketplace** and **E-commerce** platform.
- Activity involves both demo data and test Thai customers (e.g., "ลูกค้าทดสอบ").
