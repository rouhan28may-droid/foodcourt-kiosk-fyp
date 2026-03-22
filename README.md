# Food Court Kiosk System — FYP Static Demo

This is a **static** (no-backend) demo to present the full flow:

- **Customer Kiosk**: Browse restaurant menus → add to cart → send order for approval → QR payment → receipt → queue  
- **Restaurant Dashboard**: Approve/reject orders → manage live statuses → disable menu items  
- **Owner/Admin Dashboard**: System overview → analytics → ad controls → XLSX report export

## ✅ How to Run (Recommended)

Because the project loads JSON files, run it with a **local server**:

### Option A (Python)
1. Open terminal inside the folder
2. Run:
   ```bash
   python -m http.server 8000
   ```
3. Open:
   - http://localhost:8000

### Option B (VS Code Live Server)
Right click `index.html` → **Open with Live Server**

## Demo Credentials

**Admin**
- admin / admin123

**Restaurant**
- spicehub / 1234
- pastaco / 1234
- greenbowl / 1234

## What Your Supervisor Will See

### Flow (End-to-End)
1. Kiosk places an order → goes to **Pending Approval**
2. Restaurant approves → kiosk shows **Pay Now**
3. QR shown → **Simulate Payment Success**
4. Receipt is generated → Print
5. Restaurant updates status Preparing → Ready → Completed
6. Admin sees analytics + exports XLSX reports

## Notes (For Marks)
Implemented + demo-ready:
- **Auto-approval logic** (online + all items available)
- **Estimated prep time**
- **Payment timeout + order lock**
- **Ad idle-mode + impression tracking**
- **Peak hour + best seller analytics**
- **XLSX exports** (simulated end-of-day email)

Everything is pure front-end with **localStorage as the database**.

Good luck.


## Hardware Layer Console
Open `hardware.html` to demonstrate simulated integration with:
- Network health + latency
- Printer status + paper consumption
- Payment gateway verification logs
- Offline queue flushing
- Device logs for supervisor demo
