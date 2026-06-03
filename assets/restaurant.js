(async function () {
  window.FC = window.FC || {};

  const $ = (id) => document.getElementById(id);

  const loginBox = $("loginBox");
  const appBox = $("appBox");
  const logoutBtn = $("logoutBtn");

  const userInput = $("userInput");
  const passInput = $("passInput");
  const loginBtn = $("loginBtn");
  const loginErr = $("loginErr");

  const restName = $("restName");
  const pendingList = $("pendingList");
  const activeList = $("activeList");
  const menuList = $("menuList");
  const onlineLabel = $("onlineLabel");
  const toggleOnlineBtn = $("toggleOnlineBtn");
  const exportBtn = $("exportBtn");

  const paidCount = $("paidCount");
  const revenue = $("revenue");
  const bestSeller = $("bestSeller");

  const sessKey = "fc_restaurant_session";

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeObject(v) {
    return v && typeof v === "object" ? v : {};
  }

  function safeState() {
    try {
      if (typeof FC.getStateSafe === "function") return FC.getStateSafe();
      return typeof FC.getState === "function" ? (FC.getState() || {}) : {};
    } catch {
      return {};
    }
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(sessKey) || "{}");
    } catch {
      return {};
    }
  }

  let restaurantId = readSession().restaurantId || null;

  function saveSess() {
    localStorage.setItem(sessKey, JSON.stringify({ restaurantId }));
  }

  function setText(el, value) {
    if (el) el.textContent = String(value ?? "");
  }

  function logSafe(message) {
    try {
      if (typeof FC.log === "function") FC.log(message);
    } catch (err) {
      console.error("restaurant.js log failed", err);
    }
  }

  function money(value) {
    try {
      if (typeof FC.money === "function") return FC.money(value);
    } catch {}
    return String(value ?? 0);
  }

  function nowISO() {
    try {
      if (typeof FC.nowISO === "function") return FC.nowISO();
    } catch {}
    return new Date().toISOString();
  }

  async function seedSafe() {
    try {
      if (typeof FC.seed === "function") {
        await FC.seed();
      }
    } catch (err) {
      console.error("restaurant.js: seed failed", err);
    }
  }

  async function loadUsers() {
    try {
      const res = await fetch("data/users.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error("restaurant.js: users load failed", err);
      return { restaurants: [] };
    }
  }

  function showApp() {
    loginBox?.classList.add("hidden");
    appBox?.classList.remove("hidden");
    logoutBtn?.classList.remove("hidden");
  }

  function showLogin() {
    loginBox?.classList.remove("hidden");
    appBox?.classList.add("hidden");
    logoutBtn?.classList.add("hidden");
  }

  function getRestaurant() {
    const s = safeState();
    return safeArray(s.restaurants).find((r) => r.id === restaurantId) || null;
  }

  async function getOrdersForRestaurantSafe() {
    try {
      if (typeof FC.fetchOrdersForRestaurant === "function") {
        return await FC.fetchOrdersForRestaurant(restaurantId);
      }
    } catch (err) {
      console.warn("restaurant.js: fetchOrdersForRestaurant failed, falling back", err);
    }

    try {
      return await Promise.resolve(FC.ordersForRestaurant(restaurantId));
    } catch (err) {
      console.error("restaurant.js: ordersForRestaurant failed", err);
      return [];
    }
  }

  async function updateOrderSafe(orderId, patch) {
    return await Promise.resolve(FC.updateOrder(orderId, patch));
  }

  async function toggleRestaurantOnlineSafe() {
    try {
      await Promise.resolve(FC.toggleRestaurantOnline(restaurantId));
    } catch (err) {
      console.error("restaurant.js: toggleRestaurantOnline failed", err);
    }
  }

  async function toggleMenuItemSafe(restId, itemId) {
    try {
      await Promise.resolve(FC.toggleMenuItem(restId, itemId));
    } catch (err) {
      console.error("restaurant.js: toggleMenuItem failed", err);
    }
  }

  function isToday(iso) {
    try {
      if (typeof FC.isToday === "function") return FC.isToday(iso);
    } catch {}
    if (!iso) return false;
    const d = new Date(iso);
    const n = new Date();
    return (
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate()
    );
  }

  function paidLikeStatus(status) {
    return ["paid", "preparing", "ready", "completed"].includes(status);
  }

  function activeStatus(status) {
    return ["approved", "awaiting_payment", "paid", "preparing", "ready"].includes(status);
  }

  function statusBadge(status) {
    if (status === "pending_approval") return `<span class="pill badge-yellow">PENDING</span>`;
    if (status === "rejected") return `<span class="pill badge-red">REJECTED</span>`;
    if (status === "awaiting_payment") return `<span class="pill badge-yellow">AWAIT PAY</span>`;
    if (["paid", "preparing", "ready", "completed"].includes(status)) {
      return `<span class="pill badge-green">${String(status).toUpperCase()}</span>`;
    }
    return `<span class="pill">${String(status || "").toUpperCase()}</span>`;
  }

  function serviceTypeOf(order) {
    return order?.serviceType || order?.service_type || order?.orderType || order?.order_type || "";
  }

  function tableNumberOf(order) {
    return String(order?.tableNumber || order?.table_number || order?.tableNo || order?.table_no || "").trim();
  }

  function serviceLabel(order) {
    const type = serviceTypeOf(order);
    const table = tableNumberOf(order);

    if (type === "dine_in") {
      return table ? `Dine In • Table ${table}` : "Dine In";
    }

    if (type === "takeaway") return "Takeaway";

    return "Not selected";
  }

  function serviceTypeLabel(order) {
    const type = serviceTypeOf(order);
    if (type === "dine_in") return "Dine In";
    if (type === "takeaway") return "Takeaway";
    return "Not selected";
  }

  function serviceBadge(order) {
    const type = serviceTypeOf(order);
    const label = serviceLabel(order);

    if (type === "dine_in") {
      return `<span class="pill badge-yellow">${label}</span>`;
    }

    if (type === "takeaway") {
      return `<span class="pill badge-green">${label}</span>`;
    }

    return `<span class="pill">${label}</span>`;
  }

  function computeRestaurantSummary(orders) {
    const todayOrders = safeArray(orders).filter((o) => isToday(o.createdAt));
    const paid = todayOrders.filter((o) => paidLikeStatus(o.status));

    const paidCountValue = paid.length;
    const revenueValue = paid.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const itemCounts = {};
    paid.forEach((o) => {
      safeArray(o.items).forEach((it) => {
        const name = it.name || "Unknown";
        itemCounts[name] = (itemCounts[name] || 0) + Number(it.qty || 0);
      });
    });

    const bestSellerValue =
      Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    return {
      paidCount: paidCountValue,
      revenue: revenueValue,
      bestSeller: bestSellerValue
    };
  }

  async function renderPending(orders) {
    if (!pendingList) return;

    const pending = safeArray(orders).filter((o) => o.status === "pending_approval");
    pendingList.innerHTML = "";

    if (!pending.length) {
      pendingList.innerHTML = `<div class="text-sm text-slate-400">No pending approvals.</div>`;
      return;
    }

    for (const o of pending) {
      const items = safeArray(o.items).map((it) => `${it.name}×${it.qty}`).join(", ");

      const div = document.createElement("div");
      div.className = "p-4 rounded-2xl bg-white/5 border border-white/10";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="font-semibold">${o.id}</div>
              ${serviceBadge(o)}
            </div>
            <div class="text-xs text-slate-400 mt-1">
              ${o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : ""} • ${items}
            </div>
            <div class="text-sm text-slate-200 mt-2">
              Total: <span class="pill">${money(o.total)}</span>
            </div>
            <div class="text-xs text-slate-400 mt-2">
              Order Type: <span class="text-slate-200">${serviceLabel(o)}</span>
            </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button class="btn-primary text-sm" data-act="approve">Approve</button>
            <button class="btn-ghost text-sm" data-act="reject">Reject</button>
          </div>
        </div>
        <div class="mt-3 hidden" data-reject-box>
          <select class="tws-select" data-reason>
            <option value="Out of stock">Out of stock</option>
            <option value="Kitchen busy">Kitchen busy</option>
            <option value="Item unavailable">Item unavailable</option>
          </select>
          <button class="btn-primary mt-2 text-sm" data-act="confirm-reject">Confirm Reject</button>
        </div>
      `;

      const approveBtn = div.querySelector('[data-act="approve"]');
      const rejectBtn = div.querySelector('[data-act="reject"]');
      const rejBox = div.querySelector("[data-reject-box]");
      const reasonSel = div.querySelector("[data-reason]");
      const confirmReject = div.querySelector('[data-act="confirm-reject"]');

      approveBtn.onclick = async () => {
        await updateOrderSafe(o.id, {
          status: "approved",
          approvedAt: nowISO()
        });
        logSafe(`Order ${o.id} approved by restaurant.`);
        await renderAll();
      };

      rejectBtn.onclick = () => {
        rejBox?.classList.toggle("hidden");
      };

      confirmReject.onclick = async () => {
        await updateOrderSafe(o.id, {
          status: "rejected",
          rejectReason: reasonSel?.value || "Rejected"
        });
        logSafe(`Order ${o.id} rejected (${reasonSel?.value || "Rejected"}).`);
        await renderAll();
      };

      pendingList.appendChild(div);
    }
  }

  async function renderActive(orders) {
    if (!activeList) return;

    const active = safeArray(orders).filter((o) => activeStatus(o.status));
    activeList.innerHTML = "";

    if (!active.length) {
      activeList.innerHTML = `<div class="text-sm text-slate-400">No active orders.</div>`;
      return;
    }

    for (const o of active) {
      const items = safeArray(o.items).map((it) => `${it.name}×${it.qty}`).join(", ");

      const div = document.createElement("div");
      div.className = "p-4 rounded-2xl bg-white/5 border border-white/10";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="font-semibold">${o.id}</div>
              ${statusBadge(o.status)}
              ${serviceBadge(o)}
            </div>
            <div class="text-xs text-slate-400 mt-1">${items}</div>
            <div class="text-sm text-slate-200 mt-2">
              Total: <span class="pill">${money(o.total)}</span>
            </div>
            <div class="text-xs text-slate-400 mt-2">
              Order Type: <span class="text-slate-200">${serviceLabel(o)}</span>
            </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button class="btn-ghost text-sm" data-act="prep" ${o.status === "paid" ? "" : "disabled"}>Preparing</button>
            <button class="btn-ghost text-sm" data-act="ready" ${o.status === "preparing" ? "" : "disabled"}>Ready</button>
            <button class="btn-primary text-sm" data-act="done" ${o.status === "ready" ? "" : "disabled"}>Complete</button>
          </div>
        </div>
      `;

      const prep = div.querySelector('[data-act="prep"]');
      const ready = div.querySelector('[data-act="ready"]');
      const done = div.querySelector('[data-act="done"]');

      prep.onclick = async () => {
        await updateOrderSafe(o.id, { status: "preparing" });
        logSafe(`Order ${o.id} → preparing.`);
        await renderAll();
      };

      ready.onclick = async () => {
        await updateOrderSafe(o.id, { status: "ready" });
        logSafe(`Order ${o.id} → ready.`);
        await renderAll();
      };

      done.onclick = async () => {
        await updateOrderSafe(o.id, { status: "completed" });
        logSafe(`Order ${o.id} → completed.`);
        await renderAll();
      };

      activeList.appendChild(div);
    }
  }

  async function renderMenu() {
    if (!menuList) return;

    const r = getRestaurant();
    menuList.innerHTML = "";

    if (!r) {
      menuList.innerHTML = `<div class="text-sm text-slate-400">Restaurant not found.</div>`;
      return;
    }

    const menu = safeArray(r.menu);
    if (!menu.length) {
      menuList.innerHTML = `<div class="text-sm text-slate-400">No menu items loaded.</div>`;
      return;
    }

    for (const m of menu) {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10";
      row.innerHTML = `
        <div class="min-w-0">
          <div class="font-semibold truncate">${m.name || ""}</div>
          <div class="text-xs text-slate-400 mt-1">${m.category || "General"} • ${money(m.price || 0)}</div>
        </div>
        <button class="${m.available ? "btn-ghost" : "btn-primary"} text-xs px-3 py-2">
          ${m.available ? "Disable" : "Enable"}
        </button>
      `;

      row.querySelector("button").onclick = async () => {
        await toggleMenuItemSafe(r.id, m.id);
        await renderAll();
      };

      menuList.appendChild(row);
    }
  }

  function renderSummary(orders) {
    const r = getRestaurant();
    if (!r) return;

    setText(restName, r.name || "Restaurant");
    setText(onlineLabel, r.online ? "Yes" : "No");

    const a = computeRestaurantSummary(orders);
    setText(paidCount, a.paidCount);
    setText(revenue, money(a.revenue));
    setText(bestSeller, a.bestSeller);
  }

  if (toggleOnlineBtn) {
    toggleOnlineBtn.onclick = async () => {
      await toggleRestaurantOnlineSafe();
      await renderAll();
    };
  }

  // ---------- Professional Excel Report Helpers ----------
  function validDate(value) {
    const d = new Date(value || "");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dateOnly(value) {
    const d = validDate(value);
    if (!d) return "";
    return d.toISOString().slice(0, 10);
  }

  function timeOnly(value) {
    const d = validDate(value);
    if (!d) return "";
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function monthTitle(value) {
    const d = validDate(value) || new Date();
    return d.toLocaleString("en-US", {
      month: "long",
      year: "numeric"
    });
  }

  function isSameMonth(value, baseDate) {
    const d = validDate(value);
    if (!d) return false;

    return (
      d.getFullYear() === baseDate.getFullYear() &&
      d.getMonth() === baseDate.getMonth()
    );
  }

  function reportCurrency(value) {
    return Number(value || 0);
  }

  function prepMinutes(order) {
    const start = validDate(order.approvedAt || order.createdAt);
    const end = validDate(order.readyAt || order.completedAt || order.paidAt);

    if (!start || !end) return "";

    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return minutes >= 0 ? minutes : "";
  }

  function itemsSummary(order) {
    return safeArray(order.items)
      .map((it) => `${it.name || "Item"} x${Number(it.qty || 0)}`)
      .join(" | ");
  }

  function totalDishQty(order) {
    return safeArray(order.items).reduce((sum, it) => sum + Number(it.qty || 0), 0);
  }

  function uniqueDishCount(order) {
    return new Set(safeArray(order.items).map((it) => it.name || it.itemId || "Item")).size;
  }

  function safeSheetName(name) {
    return String(name || "Sheet")
      .replace(/[\\/?*[\]:]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Sheet";
  }

  function createSheet(rows, widths, autoFilterRef) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map((wch) => ({ wch }));

    if (autoFilterRef) {
      ws["!autofilter"] = { ref: autoFilterRef };
    }

    return ws;
  }

  function addMerge(ws, startRow, startCol, endRow, endCol) {
    ws["!merges"] = ws["!merges"] || [];
    ws["!merges"].push({
      s: { r: startRow, c: startCol },
      e: { r: endRow, c: endCol }
    });
  }

  function buildItemStats(orders) {
    const stats = {};

    safeArray(orders).forEach((order) => {
      safeArray(order.items).forEach((item) => {
        const name = item.name || "Unknown";
        const qty = Number(item.qty || 0);
        const unitPrice = Number(item.price || 0);
        const lineTotal = qty * unitPrice;

        if (!stats[name]) {
          stats[name] = {
            item: name,
            total_qty: 0,
            total_sales: 0,
            order_count: 0
          };
        }

        stats[name].total_qty += qty;
        stats[name].total_sales += lineTotal;
        stats[name].order_count += 1;
      });
    });

    return Object.values(stats).sort((a, b) => b.total_qty - a.total_qty);
  }

  function buildDailyStats(orders) {
    const stats = {};

    safeArray(orders).forEach((order) => {
      const day = dateOnly(order.createdAt);
      if (!day) return;

      if (!stats[day]) {
        stats[day] = {
          date: day,
          orders: 0,
          dine_in: 0,
          takeaway: 0,
          revenue: 0
        };
      }

      stats[day].orders += 1;
      stats[day].revenue += Number(order.total || 0);

      if (serviceTypeOf(order) === "dine_in") stats[day].dine_in += 1;
      if (serviceTypeOf(order) === "takeaway") stats[day].takeaway += 1;
    });

    return Object.values(stats).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function exportMonthlyRestaurantReport(restaurant, orders) {
    if (typeof XLSX === "undefined") {
      alert("XLSX library is not loaded.");
      return false;
    }

    const now = new Date();
    const restaurantName = restaurant?.name || "Restaurant";

    const normalizedOrders = safeArray(orders)
      .map((o) => safeObject(o))
      .filter((o) => o && o.id);

    const monthOrders = normalizedOrders.filter((o) => isSameMonth(o.createdAt, now));
    const paidStatuses = new Set(["paid", "preparing", "ready", "completed"]);
    const paidOrActive = monthOrders.filter((o) => paidStatuses.has(o.status));

    const totalRevenue = paidOrActive.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalTax = paidOrActive.reduce((sum, o) => sum + Number(o.tax || 0), 0);
    const dineInCount = paidOrActive.filter((o) => serviceTypeOf(o) === "dine_in").length;
    const takeawayCount = paidOrActive.filter((o) => serviceTypeOf(o) === "takeaway").length;

    const prepValues = paidOrActive
      .map(prepMinutes)
      .filter((v) => typeof v === "number" && Number.isFinite(v));

    const avgPrep =
      prepValues.length > 0
        ? Math.round(prepValues.reduce((sum, v) => sum + v, 0) / prepValues.length)
        : "";

    const itemStats = buildItemStats(paidOrActive);
    const dailyStats = buildDailyStats(paidOrActive);
    const bestSeller = itemStats[0]?.item || "—";

    const summaryRows = [
      [`${restaurantName} - Monthly Sales Report`],
      [`Month: ${monthTitle(now)}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ["Summary"],
      ["Restaurant Name", restaurantName],
      ["Total Revenue Up Till Now Of The Month", reportCurrency(totalRevenue)],
      ["Total Tax Collected", reportCurrency(totalTax)],
      ["Total Orders This Month", monthOrders.length],
      ["Paid / Active Orders", paidOrActive.length],
      ["Dine In Orders", dineInCount],
      ["Takeaway Orders", takeawayCount],
      ["Average Preparation Time (minutes)", avgPrep],
      ["Best Seller", bestSeller],
      [],
      ["Daily Summary"],
      ["Date", "Orders", "Dine In", "Takeaway", "Revenue"]
    ];

    dailyStats.forEach((d) => {
      summaryRows.push([
        d.date,
        d.orders,
        d.dine_in,
        d.takeaway,
        reportCurrency(d.revenue)
      ]);
    });

    summaryRows.push([]);
    summaryRows.push(["Item Summary"]);
    summaryRows.push(["Item", "Total Qty Sold", "Total Sales", "Order Lines"]);

    itemStats.forEach((it) => {
      summaryRows.push([
        it.item,
        it.total_qty,
        reportCurrency(it.total_sales),
        it.order_count
      ]);
    });

    const orderRows = [
      [`${restaurantName} - Orders Overview`],
      [`Month: ${monthTitle(now)}`],
      [],
      [
        "Order ID",
        "Restaurant",
        "Service Type",
        "Table Number",
        "Order Type",
        "Order Date",
        "Order Placed",
        "Approved At",
        "Paid At",
        "Prep Time (min)",
        "Status",
        "Subtotal",
        "Tax",
        "Total",
        "Items Summary",
        "Total Dish Qty",
        "Unique Dishes"
      ]
    ];

    monthOrders.forEach((o) => {
      orderRows.push([
        o.id,
        restaurantName,
        serviceTypeLabel(o),
        tableNumberOf(o),
        serviceLabel(o),
        dateOnly(o.createdAt),
        timeOnly(o.createdAt),
        timeOnly(o.approvedAt),
        timeOnly(o.paidAt),
        prepMinutes(o),
        o.status || "",
        reportCurrency(o.subtotal),
        reportCurrency(o.tax),
        reportCurrency(o.total),
        itemsSummary(o),
        totalDishQty(o),
        uniqueDishCount(o)
      ]);
    });

    const lineRows = [
      [`${restaurantName} - Order Lines`],
      [`Month: ${monthTitle(now)}`],
      [],
      [
        "Order ID",
        "Restaurant",
        "Service Type",
        "Table Number",
        "Order Type",
        "Order Date",
        "Placed At",
        "Approved At",
        "Paid At",
        "Prep Time (min)",
        "Status",
        "Dish",
        "Qty",
        "Unit Price",
        "Line Total"
      ]
    ];

    monthOrders.forEach((o) => {
      safeArray(o.items).forEach((it) => {
        const qty = Number(it.qty || 0);
        const unitPrice = Number(it.price || 0);

        lineRows.push([
          o.id,
          restaurantName,
          serviceTypeLabel(o),
          tableNumberOf(o),
          serviceLabel(o),
          dateOnly(o.createdAt),
          timeOnly(o.createdAt),
          timeOnly(o.approvedAt),
          timeOnly(o.paidAt),
          prepMinutes(o),
          o.status || "",
          it.name || "Item",
          qty,
          reportCurrency(unitPrice),
          reportCurrency(qty * unitPrice)
        ]);
      });
    });

    const wb = XLSX.utils.book_new();

    const summarySheet = createSheet(
      summaryRows,
      [18, 18, 14, 14, 14, 18, 18, 18, 18, 18],
      dailyStats.length ? `A17:E${16 + dailyStats.length + 1}` : undefined
    );
    addMerge(summarySheet, 0, 0, 0, 9);
    addMerge(summarySheet, 1, 0, 1, 9);
    addMerge(summarySheet, 2, 0, 2, 9);

    const ordersSheet = createSheet(
      orderRows,
      [22, 18, 15, 14, 22, 14, 14, 14, 14, 16, 16, 12, 12, 12, 48, 14, 14],
      `A4:Q${orderRows.length}`
    );
    addMerge(ordersSheet, 0, 0, 0, 16);
    addMerge(ordersSheet, 1, 0, 1, 16);

    const lineSheet = createSheet(
      lineRows,
      [22, 18, 15, 14, 22, 14, 14, 14, 14, 16, 16, 28, 8, 12, 12],
      `A4:O${lineRows.length}`
    );
    addMerge(lineSheet, 0, 0, 0, 14);
    addMerge(lineSheet, 1, 0, 1, 14);

    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(wb, ordersSheet, "Orders Overview");
    XLSX.utils.book_append_sheet(wb, lineSheet, "Order Lines");

    const safeRestaurantName = String(restaurantName).replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
    XLSX.writeFile(wb, `${safeRestaurantName || "Restaurant"}_Monthly_Sales_Report.xlsx`);

    return true;
  }

  if (exportBtn) {
    exportBtn.onclick = async () => {
      const r = getRestaurant();
      if (!r) return;

      try {
        const orders = await getOrdersForRestaurantSafe();
        exportMonthlyRestaurantReport(r, orders);
        logSafe(`Monthly sales report exported for ${r.name}.`);
      } catch (err) {
        console.error("restaurant.js: export failed", err);
        alert("Export failed. Check console for details.");
      }
    };
  }

  let renderBusy = false;
  let rerenderRequested = false;

  async function renderAll() {
    if (!restaurantId) return;

    if (renderBusy) {
      rerenderRequested = true;
      return;
    }

    renderBusy = true;

    try {
      const r = getRestaurant();
      if (!r) {
        showLogin();
        return;
      }

      const orders = await getOrdersForRestaurantSafe();
      renderSummary(orders);
      await renderPending(orders);
      await renderActive(orders);
      await renderMenu();
    } catch (err) {
      console.error("restaurant.js: renderAll failed", err);
    } finally {
      renderBusy = false;
      if (rerenderRequested) {
        rerenderRequested = false;
        renderAll();
      }
    }
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem(sessKey);
      restaurantId = null;
      showLogin();
    };
  }

  if (loginBtn) {
    loginBtn.onclick = async () => {
      if (loginErr) loginErr.textContent = "";

      const u = (userInput?.value || "").trim();
      const p = (passInput?.value || "").trim();

      if (!u || !p) {
        if (loginErr) loginErr.textContent = "Enter username and password.";
        return;
      }

      const users = await loadUsers();
      const match = safeArray(users.restaurants).find(
        (x) => x.username === u && x.password === p
      );

      if (!match) {
        if (loginErr) loginErr.textContent = "Invalid credentials.";
        return;
      }

      restaurantId = match.restaurantId;
      saveSess();
      showApp();
      await renderAll();
    };
  }

  [userInput, passInput].forEach((input) => {
    input?.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && loginBtn) {
        e.preventDefault();
        await loginBtn.onclick();
      }
    });
  });

  await seedSafe();

  if (restaurantId) {
    showApp();
    await renderAll();
  } else {
    showLogin();
  }

  setInterval(() => {
    if (!restaurantId) return;
    renderAll();
  }, 1200);

  window.addEventListener("fc:state-changed", () => {
    if (!restaurantId) return;
    renderAll();
  });

  window.addEventListener("focus", () => {
    if (!restaurantId) return;
    renderAll();
  });
})();