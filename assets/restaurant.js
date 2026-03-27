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

  function parseISO(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function pad2(v) {
    return String(v).padStart(2, "0");
  }

  function formatDateOnly(iso) {
    const d = parseISO(iso);
    if (!d) return "—";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function formatTimeOnly(iso) {
    const d = parseISO(iso);
    if (!d) return "—";
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function minutesBetween(startIso, endIso) {
    const start = parseISO(startIso);
    const end = parseISO(endIso);
    if (!start || !end) return null;
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    return mins >= 0 ? mins : null;
  }

  function itemsSummary(items) {
    return safeArray(items)
      .map((it) => `${it.name || "Item"} x${Number(it.qty || 0)}`)
      .join(" | ");
  }

  function totalDishQty(items) {
    return safeArray(items).reduce((sum, it) => sum + Number(it.qty || 0), 0);
  }

  function uniqueDishCount(items) {
    return safeArray(items).length;
  }

  function buildPatchedPayment(order, timelinePatch = {}, paymentPatch = {}) {
    const currentPayment = safeObject(order?.payment);
    const currentTimeline = safeObject(currentPayment.timeline);

    return {
      ...currentPayment,
      ...paymentPatch,
      timeline: {
        ...currentTimeline,
        ...timelinePatch
      }
    };
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

  let audioCtx = null;
  let lastPendingIds = new Set();
  let pendingSnapshotReady = false;

  async function ensureAudioReady() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;

      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      return audioCtx;
    } catch (err) {
      console.warn("Audio init failed:", err);
      return null;
    }
  }

  async function beepNewOrder() {
    const ctx = await ensureAudioReady();
    if (!ctx) return;

    const makeBeep = (startOffset, duration, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + startOffset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };

    try {
      makeBeep(0, 0.16, 880);
      makeBeep(0.22, 0.16, 988);
    } catch (err) {
      console.warn("Beep failed:", err);
    }
  }

  function detectNewPendingOrders(orders) {
    const pendingIds = new Set(
      safeArray(orders)
        .filter((o) => o.status === "pending_approval")
        .map((o) => o.id)
    );

    if (!pendingSnapshotReady) {
      lastPendingIds = pendingIds;
      pendingSnapshotReady = true;
      return;
    }

    let hasNewPending = false;
    for (const id of pendingIds) {
      if (!lastPendingIds.has(id)) {
        hasNewPending = true;
        break;
      }
    }

    lastPendingIds = pendingIds;

    if (hasNewPending) {
      beepNewOrder();
    }
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
            <div class="font-semibold">${o.id}</div>
            <div class="text-xs text-slate-400 mt-1">
              ${o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : ""} • ${items}
            </div>
            <div class="text-sm text-slate-200 mt-2">Total: <span class="pill">${money(o.total)}</span></div>
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
        const approvedAt = nowISO();

        await updateOrderSafe(o.id, {
          status: "approved",
          approvedAt,
          payment: buildPatchedPayment(o, { approvedAt })
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
            </div>
            <div class="text-xs text-slate-400 mt-1">${items}</div>
            <div class="text-sm text-slate-200 mt-2">Total: <span class="pill">${money(o.total)}</span></div>
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
        const deliveredAt = nowISO();

        await updateOrderSafe(o.id, {
          status: "completed",
          deliveredAt,
          payment: buildPatchedPayment(o, { deliveredAt })
        });

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

  if (exportBtn) {
    exportBtn.onclick = async () => {
      const r = getRestaurant();
      if (!r) return;

      try {
        if (typeof FC.exportRestaurantSalesReport === "function") {
          const ok = await FC.exportRestaurantSalesReport(r.id);
          if (ok !== false) {
            logSafe(`Professional sales report exported for ${r.name}.`);
            return;
          }
        }

        const orders = await getOrdersForRestaurantSafe();
        const todayOrders = safeArray(orders).filter((o) => isToday(o.createdAt));
        const paid = todayOrders.filter((o) => paidLikeStatus(o.status));

        const orderRows = paid.map((o) => ({
          order_id: o.id,
          restaurant: r.name,
          order_date: formatDateOnly(o.createdAt),
          order_placed: formatTimeOnly(o.createdAt),
          approved_at: formatTimeOnly(o.approvedAt),
          delivered_at: formatTimeOnly(o.deliveredAt || safeObject(o.payment).timeline?.deliveredAt),
          prep_time_minutes: minutesBetween(
            o.approvedAt,
            o.deliveredAt || safeObject(o.payment).timeline?.deliveredAt
          ) ?? "",
          status: o.status,
          subtotal: o.subtotal,
          tax: o.tax,
          total: o.total,
          total_dish_qty: totalDishQty(o.items),
          unique_dishes: uniqueDishCount(o.items),
          items_summary: itemsSummary(o.items)
        }));

        const itemRows = [];
        paid.forEach((o) => {
          safeArray(o.items).forEach((it) => {
            itemRows.push({
              order_id: o.id,
              restaurant: r.name,
              order_date: formatDateOnly(o.createdAt),
              placed_at: formatTimeOnly(o.createdAt),
              approved_at: formatTimeOnly(o.approvedAt),
              delivered_at: formatTimeOnly(o.deliveredAt || safeObject(o.payment).timeline?.deliveredAt),
              dish: it.name,
              qty: it.qty,
              unit_price: it.price,
              line_total: Number(it.qty || 0) * Number(it.price || 0)
            });
          });
        });

        if (typeof FC.downloadXLSX === "function") {
          FC.downloadXLSX(`${String(r.name || "Restaurant").replace(/\s+/g, "_")}_Sales_Report.xlsx`, [
            { name: "Orders", rows: orderRows },
            { name: "Items", rows: itemRows }
          ]);
          logSafe(`Fallback sales report exported for ${r.name}.`);
        }
      } catch (err) {
        console.error("restaurant.js: export failed", err);
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

      detectNewPendingOrders(orders);

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
      lastPendingIds = new Set();
      pendingSnapshotReady = false;
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
      await ensureAudioReady();
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
    await ensureAudioReady();
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