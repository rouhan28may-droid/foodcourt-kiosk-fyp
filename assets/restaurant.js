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

  // 20-second restaurant approval flow
  const APPROVAL_WINDOW_SECONDS = 20;
  const APPROVAL_WINDOW_MS = APPROVAL_WINDOW_SECONDS * 1000;

  const approvalWindowLabel = $("approvalWindowLabel");
  const rejectModal = $("rejectModal");
  const rejectOrderId = $("rejectOrderId");
  const rejectOrderLabel = $("rejectOrderLabel");
  const rejectReasonInput = $("rejectReasonInput");
  const rejectReasonErr = $("rejectReasonErr");
  const rejectCloseBtn = $("rejectCloseBtn");
  const rejectCancelBtn = $("rejectCancelBtn");
  const rejectConfirmBtn = $("rejectConfirmBtn");

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

  const ORDER_BELL_SOUND_PATH = "assets/sounds/order-bell.mp3";
  let restaurantAudioContext = null;
  let restaurantBellAudio = null;
  let restaurantSoundEnabled = false;
  let pendingOrderBellInitialized = false;
  let notifiedPendingOrderIds = new Set();
  let recentlyAlertedPendingOrderIds = new Set();
  let lastBellPlayedAt = 0;
  let activeBellAudios = [];
  let titleResetTimer = null;
  const originalDocumentTitle = document.title;

  function saveSess() {
    localStorage.setItem(sessKey, JSON.stringify({ restaurantId }));
  }

  function setText(el, value) {
    if (el) el.textContent = String(value ?? "");
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function orderCreatedTime(order = {}) {
    const raw = order.approvalRequestedAt || order.createdAt || order.created_at || order.time || "";
    const parsed = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function approvalElapsedMs(order = {}) {
    return Math.max(0, Date.now() - orderCreatedTime(order));
  }

  function approvalSecondsLeft(order = {}) {
    const leftMs = Math.max(0, APPROVAL_WINDOW_MS - approvalElapsedMs(order));
    return Math.ceil(leftMs / 1000);
  }

  function approvalProgressPercent(order = {}) {
    const elapsed = Math.min(APPROVAL_WINDOW_MS, approvalElapsedMs(order));
    return Math.max(0, Math.min(100, Math.round((elapsed / APPROVAL_WINDOW_MS) * 100)));
  }

  function approvalExpired(order = {}) {
    return approvalElapsedMs(order) >= APPROVAL_WINDOW_MS;
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

  function injectRestaurantBellStyles() {
    if (document.getElementById("restaurantBellStyles")) return;

    const style = document.createElement("style");
    style.id = "restaurantBellStyles";
    style.textContent = `
      .fc-new-pending-order {
        position: relative;
        border-color: rgba(249, 115, 22, .95) !important;
        box-shadow:
          0 0 0 3px rgba(249, 115, 22, .20),
          0 18px 42px rgba(249, 115, 22, .18) !important;
        animation: fc-new-order-pulse 1.1s ease-in-out infinite;
      }

      .fc-new-order-badge {
        color: #fff7ed !important;
        background: rgba(249, 115, 22, .22) !important;
        border-color: rgba(249, 115, 22, .75) !important;
      }

      @keyframes fc-new-order-pulse {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2px); }
      }
    `;

    document.head.appendChild(style);
  }

  function getRestaurantAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!restaurantAudioContext) {
      restaurantAudioContext = new AudioContextClass();
    }

    return restaurantAudioContext;
  }

  function unlockRestaurantSound() {
    restaurantSoundEnabled = true;

    try {
      const ctx = getRestaurantAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    } catch {}

    try {
      if (!restaurantBellAudio) {
        restaurantBellAudio = new Audio(ORDER_BELL_SOUND_PATH);
        restaurantBellAudio.preload = "auto";
        restaurantBellAudio.volume = 0.95;
      }
    } catch {}
  }

  function installRestaurantSoundUnlockHandlers() {
    ["click", "touchstart", "keydown"].forEach((evt) => {
      window.addEventListener(evt, unlockRestaurantSound, { passive: true });
    });
  }

  function playGeneratedOrderBell() {
    try {
      const ctx = getRestaurantAudioContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.45, now + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
      master.connect(ctx.destination);

      const ring = (start, frequency) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, now + start);
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(1, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.36);

        osc.connect(gain);
        gain.connect(master);
        osc.start(now + start);
        osc.stop(now + start + 0.40);
      };

      ring(0.00, 880);
      ring(0.28, 1174);
      ring(0.58, 988);
    } catch (err) {
      console.warn("restaurant.js: generated bell failed", err);
    }
  }

  function playOrderBell() {
    const now = Date.now();

    // Keep a very small guard only to stop duplicate rings from the fast 500ms refresh.
    // New orders placed normally after this will always play the custom MP3 again.
    if (now - lastBellPlayedAt < 650) return;
    lastBellPlayedAt = now;

    unlockRestaurantSound();

    try {
      // Create a fresh Audio object every time. Reusing one audio element can fail
      // after the first play on Chromium/Raspberry Pi, causing fallback beeps.
      const audio = new Audio(`${ORDER_BELL_SOUND_PATH}?v=custom-bell-2`);
      audio.preload = "auto";
      audio.volume = 1.0;
      audio.currentTime = 0;

      const cleanup = () => {
        activeBellAudios = activeBellAudios.filter((item) => item !== audio);
        try {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        } catch {}
      };

      audio.addEventListener("ended", cleanup, { once: true });
      audio.addEventListener("error", () => {
        console.warn("restaurant.js: custom order-bell.mp3 could not be played. Check assets/sounds/order-bell.mp3 path.");
        cleanup();
      }, { once: true });

      activeBellAudios.push(audio);

      const playPromise = audio.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((err) => {
          console.warn("restaurant.js: custom order bell play was blocked/failed", err);
          cleanup();
        });
      }
    } catch (err) {
      console.warn("restaurant.js: custom order bell failed", err);
    }
  }

  function flashRestaurantTitle(newCount) {
    if (titleResetTimer) clearTimeout(titleResetTimer);

    document.title = newCount > 1
      ? `🔔 ${newCount} New Orders`
      : "🔔 New Order Received";

    titleResetTimer = setTimeout(() => {
      document.title = originalDocumentTitle;
    }, 5000);
  }

  function notifyNewPendingOrders(orders) {
    const pending = safeArray(orders).filter((o) => o.status === "pending_approval");
    const pendingIds = new Set(pending.map((o) => String(o.id || "")).filter(Boolean));

    if (!pendingOrderBellInitialized) {
      pendingOrderBellInitialized = true;
      notifiedPendingOrderIds = new Set(pendingIds);
      return;
    }

    const newPending = pending.filter((o) => {
      const id = String(o.id || "");
      return id && !notifiedPendingOrderIds.has(id);
    });

    if (!newPending.length) {
      return;
    }

    newPending.forEach((order) => {
      const id = String(order.id || "");
      notifiedPendingOrderIds.add(id);
      recentlyAlertedPendingOrderIds.add(id);

      setTimeout(() => {
        recentlyAlertedPendingOrderIds.delete(id);
      }, 9000);
    });

    playOrderBell();
    flashRestaurantTitle(newPending.length);
    logSafe(`New pending order alert: ${newPending.map((o) => o.id).join(", ")}`);
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

  async function approveOrder(orderId, mode = "restaurant_manual") {
    await updateOrderSafe(orderId, {
      status: "approved",
      approvedAt: nowISO(),
      approvalRespondedAt: nowISO(),
      approvalMode: mode,
      rejectReason: ""
    });
  }

  async function rejectOrder(orderId, reason) {
    const cleanReason = String(reason || "").trim();

    await updateOrderSafe(orderId, {
      status: "rejected",
      rejectReason: cleanReason,
      rejectedAt: nowISO(),
      approvalRespondedAt: nowISO(),
      approvalMode: "restaurant_rejected",
      rejectedByRestaurantId: restaurantId
    });
  }

  async function autoApproveExpiredPendingOrders(orders) {
    const pending = safeArray(orders).filter((o) => o.status === "pending_approval");
    let changed = false;

    for (const order of pending) {
      if (!approvalExpired(order)) continue;

      try {
        await approveOrder(order.id, `auto_approved_after_${APPROVAL_WINDOW_SECONDS}s`);
        logSafe(`Order ${order.id} auto-approved after ${APPROVAL_WINDOW_SECONDS} seconds.`);
        changed = true;
      } catch (err) {
        console.error("restaurant.js: auto approval failed", err);
      }
    }

    return changed;
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
    if (status === "timed_out") return `<span class="pill badge-red">TIMED OUT</span>`;
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

  function closeRejectModal() {
    if (rejectModal) rejectModal.classList.add("hidden");
    if (rejectOrderId) rejectOrderId.value = "";
    if (rejectOrderLabel) rejectOrderLabel.textContent = "";
    if (rejectReasonInput) rejectReasonInput.value = "";
    if (rejectReasonErr) rejectReasonErr.classList.add("hidden");
  }

  function openRejectModal(order) {
    if (!order || !rejectModal) return;

    if (rejectOrderId) rejectOrderId.value = order.id;
    if (rejectOrderLabel) {
      rejectOrderLabel.textContent = `Order ${order.id} • ${serviceLabel(order)} • ${money(order.total)}`;
    }

    if (rejectReasonInput) {
      rejectReasonInput.value = "";
      setTimeout(() => rejectReasonInput.focus(), 80);
    }

    if (rejectReasonErr) rejectReasonErr.classList.add("hidden");
    rejectModal.classList.remove("hidden");
  }

  async function confirmRejectFromModal() {
    const orderId = String(rejectOrderId?.value || "").trim();
    const reason = String(rejectReasonInput?.value || "").trim();

    if (!orderId) return;

    if (reason.length < 5) {
      if (rejectReasonErr) {
        rejectReasonErr.textContent = "Please enter a valid rejection reason with at least 5 characters.";
        rejectReasonErr.classList.remove("hidden");
      }
      if (rejectReasonInput) rejectReasonInput.focus();
      return;
    }

    try {
      const orders = await getOrdersForRestaurantSafe();
      const order = safeArray(orders).find((o) => String(o.id) === orderId);

      if (!order || order.status !== "pending_approval") {
        closeRejectModal();
        await renderAll();
        return;
      }

      await rejectOrder(orderId, reason);
      logSafe(`Order ${orderId} rejected by restaurant. Reason: ${reason}`);
      closeRejectModal();
      await renderAll();
    } catch (err) {
      console.error("restaurant.js: reject failed", err);
      if (rejectReasonErr) {
        rejectReasonErr.textContent = `Reject failed: ${err.message || err}`;
        rejectReasonErr.classList.remove("hidden");
      }
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
      const items = safeArray(o.items).map((it) => `${escapeHtml(it.name || "Item")} × ${Number(it.qty || 0)}`).join(", ");
      const secondsLeft = approvalSecondsLeft(o);
      const progress = approvalProgressPercent(o);
      const createdText = o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : "";

      const div = document.createElement("div");
      const isNewOrderAlert = recentlyAlertedPendingOrderIds.has(String(o.id || ""));
      div.className = "p-4 rounded-2xl bg-white/5 border border-amber-400/20" + (isNewOrderAlert ? " fc-new-pending-order" : "");
      div.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="font-semibold">${escapeHtml(o.id)}</div>
              ${serviceBadge(o)}
              <span class="pill badge-yellow">Pending Approval</span>
              ${isNewOrderAlert ? `<span class="pill fc-new-order-badge">🔔 New Order</span>` : ""}
            </div>

            <div class="text-xs text-slate-400 mt-2">
              ${escapeHtml(createdText)} • ${items}
            </div>

            <div class="text-sm text-slate-200 mt-3">
              Total: <span class="pill">${money(o.total)}</span>
            </div>

            <div class="text-xs text-slate-400 mt-2">
              Order Type: <span class="text-slate-200">${escapeHtml(serviceLabel(o))}</span>
            </div>

            <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-widest text-slate-500">Decision Timer</div>
                  <div class="text-sm font-semibold text-slate-100 mt-1">
                    Auto-accept in <span class="text-amber-300">${secondsLeft}</span> second${secondsLeft === 1 ? "" : "s"}
                  </div>
                </div>

                <div class="text-3xl">🍳</div>
              </div>

              <div class="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                <div class="h-full rounded-full bg-amber-400 transition-all duration-500" style="width:${progress}%"></div>
              </div>
            </div>
          </div>

          <div class="flex gap-2 flex-wrap justify-end">
            <button class="btn-primary text-sm" data-act="approve">Approve Order</button>
            <button class="btn-ghost text-sm border-rose-400/40 text-rose-200" data-act="reject">Reject with Reason</button>
          </div>
        </div>
      `;

      const approveBtn = div.querySelector('[data-act="approve"]');
      const rejectBtn = div.querySelector('[data-act="reject"]');

      approveBtn.onclick = async () => {
        try {
          await approveOrder(o.id, "restaurant_manual");
          logSafe(`Order ${o.id} approved by restaurant.`);
          await renderAll();
        } catch (err) {
          console.error("restaurant.js: approve failed", err);
          alert(`Approve failed: ${err.message || err}`);
        }
      };

      rejectBtn.onclick = () => {
        openRejectModal(o);
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
    const n = Number(value || 0);
    const amount = Number.isFinite(n) ? n : 0;
    const rounded = Math.round(amount);
    const sign = rounded < 0 ? "-" : "";
    const formatted = Math.abs(rounded).toLocaleString("en-PK");
    return `${sign}Rs ${formatted}`;
  }

  function reportNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function rejectionReasonOf(order = {}) {
    const payment = safeObject(order.payment);

    return String(
      order.rejectReason ||
      order.rejectionReason ||
      order.rejectedReason ||
      order.reject_reason ||
      order.rejection_reason ||
      payment.rejectReason ||
      payment.rejectionReason ||
      ""
    ).trim();
  }

  function timeoutReasonOf(order = {}) {
    const payment = safeObject(order.payment);

    return String(
      order.timeoutReason ||
      order.timedOutReason ||
      order.timeout_reason ||
      order.timed_out_reason ||
      payment.timeoutReason ||
      payment.timedOutReason ||
      payment.timeout_reason ||
      payment.timed_out_reason ||
      ""
    ).trim();
  }

  function timedOutAtOf(order = {}) {
    const payment = safeObject(order.payment);

    return (
      order.timedOutAt ||
      order.timed_out_at ||
      order.timeoutAt ||
      order.timeout_at ||
      payment.timedOutAt ||
      payment.timed_out_at ||
      payment.timeoutAt ||
      payment.timeout_at ||
      ""
    );
  }

  function normalizePaymentMethod(value) {
    const v = String(value || "").trim().toLowerCase();

    if (!v) return "";
    if (v.includes("cash") || v === "cod" || v.includes("counter")) return "cash";
    if (v.includes("online") || v.includes("stripe") || v.includes("card") || v.includes("qr")) return "online";

    return "";
  }

  function paymentMethodOf(order = {}) {
    const payment = safeObject(order.payment);

    const detected = normalizePaymentMethod(
      order.paymentMethod ||
      order.payment_method ||
      payment.paymentMethod ||
      payment.method ||
      payment.provider ||
      ""
    );

    if (detected) return detected;

    if (payment.stripeSessionId || payment.stripeCheckoutUrl) return "online";
    if (payment.cashToken || payment.cashConfirmedAt) return "cash";

    return "online";
  }

  function paymentMethodLabel(order = {}) {
    const method = paymentMethodOf(order);

    if (method === "cash") return "Cash";
    if (method === "online") return "Online / Stripe";

    return "Not selected";
  }

  function paymentStatusLabel(order = {}) {
    const status = String(order.status || "").toLowerCase();
    const payment = safeObject(order.payment);
    const method = paymentMethodOf(order);

    if (payment.success || ["paid", "preparing", "ready", "completed"].includes(status)) {
      return method === "cash" ? "Cash Paid" : "Online Paid";
    }

    if (status === "rejected") return "Rejected";
    if (status === "timed_out") return "Timed Out / Abandoned";
    if (status === "pending_approval") return "Pending Approval";
    if (status === "approved") return "Approved - Payment Pending";
    if (status === "awaiting_payment") return method === "cash" ? "Cash Pending" : "Online Pending";

    return status || "Pending";
  }

  function paidOrActiveStatus(status) {
    return ["paid", "preparing", "ready", "completed"].includes(String(status || "").toLowerCase());
  }

  function prepMinutes(order) {
    const start = validDate(order.approvedAt || order.createdAt);
    const end = validDate(order.readyAt || order.completedAt || order.paidAt);

    if (!start || !end) return "";

    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return minutes >= 0 ? minutes : "";
  }

  function addonsOfItem(item = {}) {
    const raw = item.addons || item.selectedAddons || item.options || [];

    return safeArray(raw)
      .map((addon) => {
        const a = safeObject(addon);
        const name = String(a.name || a.title || "").trim();
        if (!name) return null;

        return {
          id: String(a.id || a.addonId || a.key || name).trim(),
          name,
          price: Number(a.price || 0),
          qty: Math.max(1, Number(a.qty || a.quantity || 1))
        };
      })
      .filter(Boolean);
  }

  function addonText(addons) {
    return safeArray(addons)
      .map((addon) => {
        const qty = Number(addon.qty || 1);
        const price = Number(addon.price || 0);
        const qtyText = qty > 1 ? ` x${qty}` : "";
        const priceText = price ? ` (${reportCurrency(price)})` : "";
        return `${addon.name}${qtyText}${priceText}`;
      })
      .join(", ");
  }

  function itemBaseName(item = {}) {
    return String(item.originalName || item.baseName || item.name || "Item")
      .replace(/\s*\(\+.*\)\s*$/i, "")
      .trim() || "Item";
  }

  function itemAddonsSummary(item = {}) {
    return addonText(addonsOfItem(item));
  }

  function orderAddonsSummary(order = {}) {
    const parts = [];

    safeArray(order.items).forEach((item) => {
      const summary = itemAddonsSummary(item);
      if (summary) parts.push(`${itemBaseName(item)}: ${summary}`);
    });

    return parts.join(" | ");
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
    return new Set(safeArray(order.items).map((it) => itemBaseName(it) || it.itemId || "Item")).size;
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
        const name = itemBaseName(item);
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

  function buildAddonStats(orders) {
    const stats = {};

    safeArray(orders).forEach((order) => {
      safeArray(order.items).forEach((item) => {
        addonsOfItem(item).forEach((addon) => {
          const key = addon.name || "Add-on";
          const qty = Number(item.qty || 0) * Number(addon.qty || 1);
          const sales = qty * Number(addon.price || 0);

          if (!stats[key]) {
            stats[key] = {
              addon: key,
              total_qty: 0,
              total_sales: 0,
              order_lines: 0
            };
          }

          stats[key].total_qty += qty;
          stats[key].total_sales += sales;
          stats[key].order_lines += 1;
        });
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
          paid_active: 0,
          dine_in: 0,
          takeaway: 0,
          cash: 0,
          online: 0,
          rejected: 0,
          timed_out: 0,
          revenue: 0,
          tax: 0
        };
      }

      const paidActive = paidOrActiveStatus(order.status);
      const method = paymentMethodOf(order);

      stats[day].orders += 1;
      if (paidActive) stats[day].paid_active += 1;
      if (serviceTypeOf(order) === "dine_in") stats[day].dine_in += 1;
      if (serviceTypeOf(order) === "takeaway") stats[day].takeaway += 1;
      if (method === "cash") stats[day].cash += 1;
      if (method === "online") stats[day].online += 1;
      if (String(order.status || "").toLowerCase() === "rejected") stats[day].rejected += 1;
      if (String(order.status || "").toLowerCase() === "timed_out") stats[day].timed_out += 1;
      if (paidActive) {
        stats[day].revenue += Number(order.total || 0);
        stats[day].tax += Number(order.tax || 0);
      }
    });

    return Object.values(stats).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function buildStatusStats(orders) {
    const stats = {};

    safeArray(orders).forEach((order) => {
      const status = String(order.status || "unknown").toLowerCase();
      stats[status] = (stats[status] || 0) + 1;
    });

    return Object.entries(stats)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => String(a.status).localeCompare(String(b.status)));
  }

  function buildPaymentStats(orders) {
    const stats = {
      cash: { method: "Cash", orders: 0, revenue: 0, tax: 0 },
      online: { method: "Online / Stripe", orders: 0, revenue: 0, tax: 0 }
    };

    safeArray(orders).forEach((order) => {
      const method = paymentMethodOf(order) === "cash" ? "cash" : "online";
      stats[method].orders += 1;
      stats[method].revenue += Number(order.total || 0);
      stats[method].tax += Number(order.tax || 0);
    });

    return [stats.cash, stats.online];
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
    const paidOrActive = monthOrders.filter((o) => paidOrActiveStatus(o.status));

    const totalRevenue = paidOrActive.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalTax = paidOrActive.reduce((sum, o) => sum + Number(o.tax || 0), 0);
    const rejectedOrders = monthOrders.filter((o) => String(o.status || "").toLowerCase() === "rejected");
    const timedOutOrders = monthOrders.filter((o) => String(o.status || "").toLowerCase() === "timed_out");
    const dineInCount = paidOrActive.filter((o) => serviceTypeOf(o) === "dine_in").length;
    const takeawayCount = paidOrActive.filter((o) => serviceTypeOf(o) === "takeaway").length;
    const cashOrders = paidOrActive.filter((o) => paymentMethodOf(o) === "cash");
    const onlineOrders = paidOrActive.filter((o) => paymentMethodOf(o) === "online");
    const cashRevenue = cashOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const onlineRevenue = onlineOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const prepValues = paidOrActive
      .map(prepMinutes)
      .filter((v) => typeof v === "number" && Number.isFinite(v));

    const avgPrep =
      prepValues.length > 0
        ? Math.round(prepValues.reduce((sum, v) => sum + v, 0) / prepValues.length)
        : "";

    const itemStats = buildItemStats(paidOrActive);
    const addonStats = buildAddonStats(paidOrActive);
    const dailyStats = buildDailyStats(monthOrders);
    const statusStats = buildStatusStats(monthOrders);
    const paymentStats = buildPaymentStats(paidOrActive);
    const bestSeller = itemStats[0]?.item || "—";
    const bestAddon = addonStats[0]?.addon || "—";

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
      ["Rejected Orders", rejectedOrders.length],
      ["Timed Out / Abandoned Orders", timedOutOrders.length],
      ["Dine In Orders", dineInCount],
      ["Takeaway Orders", takeawayCount],
      ["Cash Orders", cashOrders.length],
      ["Online Orders", onlineOrders.length],
      ["Cash Revenue", reportCurrency(cashRevenue)],
      ["Online Revenue", reportCurrency(onlineRevenue)],
      ["Average Preparation Time (minutes)", avgPrep],
      ["Best Seller", bestSeller],
      ["Best Add-on", bestAddon],
      [],
      ["Daily Summary"],
      ["Date", "Orders", "Paid / Active", "Dine In", "Takeaway", "Cash", "Online", "Rejected", "Timed Out", "Revenue", "Tax"]
    ];

    dailyStats.forEach((d) => {
      summaryRows.push([
        d.date,
        d.orders,
        d.paid_active,
        d.dine_in,
        d.takeaway,
        d.cash,
        d.online,
        d.rejected,
        d.timed_out,
        reportCurrency(d.revenue),
        reportCurrency(d.tax)
      ]);
    });

    const ordersHeaderRowIndex = summaryRows.length + 2;

    summaryRows.push([]);
    summaryRows.push(["Orders Overview"]);
    summaryRows.push([
      "Order ID",
      "Restaurant",
      "Order Date",
      "Order Placed",
      "Approved At",
      "Paid At",
      "Service Type",
      "Table Number",
      "Order Type",
      "Payment Method",
      "Payment Status",
      "Status",
      "Subtotal",
      "Tax",
      "Total",
      "Items Summary",
      "Add-ons Summary",
      "Total Dish Qty",
      "Unique Dishes",
      "Rejection Reason",
      "Timeout / Abandoned Reason",
      "Timed Out At"
    ]);

    monthOrders.forEach((o) => {
      summaryRows.push([
        o.id,
        restaurantName,
        dateOnly(o.createdAt),
        timeOnly(o.createdAt),
        timeOnly(o.approvedAt),
        timeOnly(o.paidAt),
        serviceTypeLabel(o),
        tableNumberOf(o),
        serviceLabel(o),
        paymentMethodLabel(o),
        paymentStatusLabel(o),
        o.status || "",
        reportCurrency(o.subtotal),
        reportCurrency(o.tax),
        reportCurrency(o.total),
        itemsSummary(o),
        orderAddonsSummary(o),
        totalDishQty(o),
        uniqueDishCount(o),
        rejectionReasonOf(o),
        timeoutReasonOf(o),
        timeOnly(timedOutAtOf(o))
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
        "Payment Method",
        "Payment Status",
        "Order Date",
        "Placed At",
        "Approved At",
        "Paid At",
        "Prep Time (min)",
        "Status",
        "Dish",
        "Add-ons",
        "Qty",
        "Unit Price",
        "Line Total",
        "Rejection Reason",
        "Timeout / Abandoned Reason",
        "Timed Out At"
      ]
    ];

    monthOrders.forEach((o) => {
      const orderItems = safeArray(o.items);

      if (!orderItems.length) {
        lineRows.push([
          o.id,
          restaurantName,
          serviceTypeLabel(o),
          tableNumberOf(o),
          serviceLabel(o),
          paymentMethodLabel(o),
          paymentStatusLabel(o),
          dateOnly(o.createdAt),
          timeOnly(o.createdAt),
          timeOnly(o.approvedAt),
          timeOnly(o.paidAt),
          prepMinutes(o),
          o.status || "",
          "",
          "",
          0,
          reportCurrency(0),
          reportCurrency(0),
          rejectionReasonOf(o),
          timeoutReasonOf(o),
          timeOnly(timedOutAtOf(o))
        ]);
        return;
      }

      orderItems.forEach((it) => {
        const qty = Number(it.qty || 0);
        const unitPrice = Number(it.price || 0);

        lineRows.push([
          o.id,
          restaurantName,
          serviceTypeLabel(o),
          tableNumberOf(o),
          serviceLabel(o),
          paymentMethodLabel(o),
          paymentStatusLabel(o),
          dateOnly(o.createdAt),
          timeOnly(o.createdAt),
          timeOnly(o.approvedAt),
          timeOnly(o.paidAt),
          prepMinutes(o),
          o.status || "",
          itemBaseName(it),
          itemAddonsSummary(it),
          qty,
          reportCurrency(unitPrice),
          reportCurrency(qty * unitPrice),
          rejectionReasonOf(o),
          timeoutReasonOf(o),
          timeOnly(timedOutAtOf(o))
        ]);
      });
    });

    const itemRows = [
      [`${restaurantName} - Item Sales`],
      [`Month: ${monthTitle(now)}`],
      [],
      ["Item", "Total Qty Sold", "Total Sales", "Order Lines"]
    ];

    itemStats.forEach((it) => {
      itemRows.push([
        it.item,
        it.total_qty,
        reportCurrency(it.total_sales),
        it.order_count
      ]);
    });

    const addonRows = [
      [`${restaurantName} - Add-ons Sales`],
      [`Month: ${monthTitle(now)}`],
      [],
      ["Add-on", "Total Qty Sold", "Total Sales", "Order Lines"]
    ];

    addonStats.forEach((it) => {
      addonRows.push([
        it.addon,
        it.total_qty,
        reportCurrency(it.total_sales),
        it.order_lines
      ]);
    });

    const paymentRows = [
      [`${restaurantName} - Payment Summary`],
      [`Month: ${monthTitle(now)}`],
      [],
      ["Payment Method", "Paid / Active Orders", "Revenue", "Tax"]
    ];

    paymentStats.forEach((p) => {
      paymentRows.push([
        p.method,
        p.orders,
        reportCurrency(p.revenue),
        reportCurrency(p.tax)
      ]);
    });

    paymentRows.push([]);
    paymentRows.push(["Status Summary"]);
    paymentRows.push(["Status", "Orders"]);

    statusStats.forEach((s) => {
      paymentRows.push([s.status, s.count]);
    });

    const wb = XLSX.utils.book_new();
    wb.Props = {
      Title: `${restaurantName} Monthly Sales Report`,
      Subject: "Food Court Kiosk Sales Report",
      Author: "Food Court Kiosk",
      CreatedDate: new Date()
    };

    const summarySheet = createSheet(
      summaryRows,
      [24, 18, 16, 16, 16, 14, 14, 14, 14, 20, 18, 16, 12, 12, 12, 52, 42, 14, 14, 32, 34, 18],
      monthOrders.length ? `A${ordersHeaderRowIndex + 1}:V${summaryRows.length}` : undefined
    );
    addMerge(summarySheet, 0, 0, 0, 21);
    addMerge(summarySheet, 1, 0, 1, 21);
    addMerge(summarySheet, 2, 0, 2, 21);

    const lineSheet = createSheet(
      lineRows,
      [22, 18, 15, 14, 22, 18, 18, 14, 14, 14, 14, 16, 16, 28, 40, 8, 12, 12, 32, 34, 18],
      `A4:U${lineRows.length}`
    );
    addMerge(lineSheet, 0, 0, 0, 20);
    addMerge(lineSheet, 1, 0, 1, 20);

    const itemSheet = createSheet(
      itemRows,
      [34, 16, 16, 14],
      `A4:D${itemRows.length}`
    );
    addMerge(itemSheet, 0, 0, 0, 3);
    addMerge(itemSheet, 1, 0, 1, 3);

    const addonSheet = createSheet(
      addonRows,
      [34, 16, 16, 14],
      `A4:D${addonRows.length}`
    );
    addMerge(addonSheet, 0, 0, 0, 3);
    addMerge(addonSheet, 1, 0, 1, 3);

    const paymentSheet = createSheet(
      paymentRows,
      [24, 20, 16, 16],
      `A4:D${paymentRows.length}`
    );
    addMerge(paymentSheet, 0, 0, 0, 3);
    addMerge(paymentSheet, 1, 0, 1, 3);

    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(wb, lineSheet, "Order Lines");
    XLSX.utils.book_append_sheet(wb, itemSheet, "Item Sales");
    XLSX.utils.book_append_sheet(wb, addonSheet, "Add-ons Sales");
    XLSX.utils.book_append_sheet(wb, paymentSheet, "Payment Summary");

    const safeRestaurantName = String(restaurantName).replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
    XLSX.writeFile(wb, `${safeRestaurantName || "Restaurant"}_Monthly_Sales_Report.xlsx`);

    return true;
  }

  injectRestaurantBellStyles();
  installRestaurantSoundUnlockHandlers();

  if (approvalWindowLabel) {
    approvalWindowLabel.textContent = `${APPROVAL_WINDOW_SECONDS}s`;
  }

  if (rejectCloseBtn) {
    rejectCloseBtn.onclick = closeRejectModal;
  }

  if (rejectCancelBtn) {
    rejectCancelBtn.onclick = closeRejectModal;
  }

  if (rejectConfirmBtn) {
    rejectConfirmBtn.onclick = confirmRejectFromModal;
  }

  if (rejectReasonInput) {
    rejectReasonInput.addEventListener("input", () => {
      if (rejectReasonErr) rejectReasonErr.classList.add("hidden");
    });

    rejectReasonInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        await confirmRejectFromModal();
      }
    });
  }

  document.querySelectorAll(".rejectQuickReason").forEach((btn) => {
    btn.addEventListener("click", () => {
      const reason = btn.getAttribute("data-reason") || "";
      if (rejectReasonInput) {
        rejectReasonInput.value = reason;
        rejectReasonInput.focus();
      }
      if (rejectReasonErr) rejectReasonErr.classList.add("hidden");
    });
  });

  if (rejectModal) {
    rejectModal.addEventListener("click", (e) => {
      if (e.target === rejectModal) closeRejectModal();
    });
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

      let orders = await getOrdersForRestaurantSafe();

      const autoApproved = await autoApproveExpiredPendingOrders(orders);
      if (autoApproved) {
        orders = await getOrdersForRestaurantSafe();
      }

      notifyNewPendingOrders(orders);

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
      unlockRestaurantSound();
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
  }, 500);

  window.addEventListener("fc:state-changed", () => {
    if (!restaurantId) return;
    renderAll();
  });

  window.addEventListener("focus", () => {
    if (!restaurantId) return;
    renderAll();
  });
})();