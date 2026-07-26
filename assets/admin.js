(async function () {
  window.FC = window.FC || {};

  const safeArr = (v) => Array.isArray(v) ? v : [];
  const safeObj = (v) => (v && typeof v === "object" ? v : {});
  const setText = (el, value) => { if (el) el.textContent = String(value ?? ""); };

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  try {
    if (typeof FC.seed === "function") {
      await FC.seed();
    }
  } catch (err) {
    console.error("admin.js: seed failed", err);
  }

  const loginBox = document.getElementById("loginBox");
  const appBox = document.getElementById("appBox");
  const logoutBtn = document.getElementById("logoutBtn");

  const userInput = document.getElementById("userInput");
  const passInput = document.getElementById("passInput");
  const loginBtn = document.getElementById("loginBtn");
  const loginErr = document.getElementById("loginErr");

  const mRevenue = document.getElementById("mRevenue");
  const mOrders = document.getElementById("mOrders");
  const mPeak = document.getElementById("mPeak");
  const mPayRate = document.getElementById("mPayRate");

  const restaurantsPanel = document.getElementById("restaurantsPanel");
  const analyticsPanel = document.getElementById("analyticsPanel");
  const adsPanel = document.getElementById("adsPanel");
  const logPanel = document.getElementById("logPanel");

  const exportAllBtn = document.getElementById("exportAllBtn");
  const resetAdsBtn = document.getElementById("resetAdsBtn");

  const cashCounterPanel = document.getElementById("cashCounterPanel");
  const adminHardwareHealthLabel = document.getElementById("adminHardwareHealthLabel");
  const adminHardwareIssues = document.getElementById("adminHardwareIssues");
  const adminDevicesPanel = document.getElementById("adminDevicesPanel");
  const adminDeviceLogs = document.getElementById("adminDeviceLogs");
  const adminSimulateLatencyBtn = document.getElementById("adminSimulateLatencyBtn");
  const adminTestPrintBtn = document.getElementById("adminTestPrintBtn");
  const adminConsumePaperBtn = document.getElementById("adminConsumePaperBtn");
  const adminGatewaySuccessBtn = document.getElementById("adminGatewaySuccessBtn");
  const adminGatewayFailBtn = document.getElementById("adminGatewayFailBtn");
  const adminLockKioskBtn = document.getElementById("adminLockKioskBtn");
  const adminClearDeviceLogsBtn = document.getElementById("adminClearDeviceLogsBtn");

  const adminHardwareWarningBox = document.getElementById("adminHardwareWarningBox");
  const adminHardwareWarningTitle = document.getElementById("adminHardwareWarningTitle");
  const adminHardwareWarningMessage = document.getElementById("adminHardwareWarningMessage");

  const adminNetworkStatusBadge = document.getElementById("adminNetworkStatusBadge");
  const adminNetworkLastSeen = document.getElementById("adminNetworkLastSeen");
  const adminNetworkWarning = document.getElementById("adminNetworkWarning");
  const adminNetworkOnlineBtn = document.getElementById("adminNetworkOnlineBtn");
  const adminNetworkOfflineBtn = document.getElementById("adminNetworkOfflineBtn");

  const adminPrinterStatusBadge = document.getElementById("adminPrinterStatusBadge");
  const adminLowPaperWarning = document.getElementById("adminLowPaperWarning");
  const adminPrinterPaperValue = document.getElementById("adminPrinterPaperValue");
  const adminPrinterPaperBar = document.getElementById("adminPrinterPaperBar");
  const adminPrinterOnlineBtn = document.getElementById("adminPrinterOnlineBtn");
  const adminPrinterOfflineBtn = document.getElementById("adminPrinterOfflineBtn");
  const adminPaperDownBtn = document.getElementById("adminPaperDownBtn");
  const adminPaperUpBtn = document.getElementById("adminPaperUpBtn");
  const adminPaperResetBtn = document.getElementById("adminPaperResetBtn");

  const adminPaymentGatewayStatusBadge = document.getElementById("adminPaymentGatewayStatusBadge");
  const adminPaymentGatewayWarning = document.getElementById("adminPaymentGatewayWarning");
  const adminPaymentGatewayOnlineBtn = document.getElementById("adminPaymentGatewayOnlineBtn");
  const adminPaymentGatewayOfflineBtn = document.getElementById("adminPaymentGatewayOfflineBtn");

  const adminKioskDisplayStatusBadge = document.getElementById("adminKioskDisplayStatusBadge");
  const adminKioskDisplayWarning = document.getElementById("adminKioskDisplayWarning");
  const adminKioskDisplayOnlineBtn = document.getElementById("adminKioskDisplayOnlineBtn");
  const adminKioskDisplayOfflineBtn = document.getElementById("adminKioskDisplayOfflineBtn");

  const scanCashQrBtn = document.getElementById("scanCashQrBtn");
  const cashQrScannerModal = document.getElementById("cashQrScannerModal");
  const cashQrReader = document.getElementById("cashQrReader");
  const cashQrManualInput = document.getElementById("cashQrManualInput");
  const cashQrLoadBtn = document.getElementById("cashQrLoadBtn");
  const cashQrCloseBtn = document.getElementById("cashQrCloseBtn");
  const cashQrMessage = document.getElementById("cashQrMessage");

  const sessKey = "fc_admin_session";
  let loggedIn = false;
  let isRendering = false;
  let rerenderRequested = false;
  let cashCounterSelectedOrderId = "";
  let cashCounterScannedTokens = {};
  let cashQrScanner = null;
  let cashQrScannerRunning = false;
  let selectedAdminRestaurantId = "";

  try {
    selectedAdminRestaurantId = localStorage.getItem("fc_admin_selected_restaurant_id") || "";
  } catch {
    selectedAdminRestaurantId = "";
  }

  try {
    const sess = JSON.parse(localStorage.getItem(sessKey) || "{}");
    loggedIn = !!sess.loggedIn;
  } catch {
    loggedIn = false;
  }

  const HARDWARE_LOW_PAPER_PERCENT = 15;
  const HARDWARE_PRINT_PAPER_STEP = 1;
  const HARDWARE_KIOSK_HEARTBEAT_STALE_MS = 35000;

  function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function formatLastSeen(value) {
    if (!value) return "—";
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return "—";

    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;

    return new Date(time).toLocaleString();
  }

  function setHidden(el, hidden) {
    if (el) el.classList.toggle("hidden", !!hidden);
  }

  function setBadge(el, online, onlineText = "ONLINE", offlineText = "OFFLINE") {
    if (!el) return;
    el.textContent = online ? onlineText : offlineText;
    el.className = `pill ${online ? "badge-green" : "badge-red"}`;
  }

  function getStateSafe() {
    try {
      return typeof FC.getState === "function" ? (FC.getState() || {}) : {};
    } catch {
      return {};
    }
  }

  function saveStateSafe(state) {
    try {
      if (typeof FC.setState === "function") {
        FC.setState(state);
      } else if (FC.KEY) {
        localStorage.setItem(FC.KEY, JSON.stringify(state));
      }
    } catch (err) {
      console.error("admin.js: failed to save state", err);
    }
  }

  function money(amount) {
    const n = Number(amount || 0);
    try {
      if (typeof FC.money === "function") return FC.money(n);
    } catch {}
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 0
    }).format(n);
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

  function nowISO() {
    try {
      if (typeof FC.nowISO === "function") return FC.nowISO();
    } catch {}
    return new Date().toISOString();
  }

  function approvalWindowSeconds() {
    try {
      if (typeof FC.approvalWindowSeconds === "function") {
        const n = Number(FC.approvalWindowSeconds());
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch {}

    const state = getStateSafe();
    const n = Number(state.settings?.approvalWindowSeconds || 20);
    if (n === 12) return 20;
    return Number.isFinite(n) && n > 0 ? n : 20;
  }

  function orderApprovalStart(order = {}) {
    const payment = safeObj(order.payment);
    const raw =
      order.approvalRequestedAt ||
      order.approval_requested_at ||
      payment.approvalRequestedAt ||
      order.createdAt ||
      order.created_at ||
      "";

    const parsed = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function orderApprovalSecondsLeft(order = {}) {
    try {
      if (typeof FC.orderApprovalSecondsLeft === "function") {
        return Math.max(0, Number(FC.orderApprovalSecondsLeft(order)) || 0);
      }
    } catch {}

    const elapsed = Date.now() - orderApprovalStart(order);
    const left = Math.max(0, approvalWindowSeconds() * 1000 - elapsed);
    return Math.ceil(left / 1000);
  }

  function approvalModeText(order = {}) {
    const mode = String(order.approvalMode || order.payment?.approvalMode || "").toLowerCase();

    if (mode.includes("auto")) return "Auto Accepted";
    if (mode.includes("restaurant_manual")) return "Accepted by Restaurant";
    if (mode.includes("rejected")) return "Rejected by Restaurant";
    if (mode.includes("pending")) return "Pending Restaurant";

    return "";
  }

  function logSafe(message) {
    try {
      if (typeof FC.log === "function") FC.log(message);
    } catch (err) {
      console.error("admin.js log failed:", err);
    }
  }

  function normalizeServiceType(value) {
    const v = String(value || "").trim().toLowerCase();

    if (v === "dine_in" || v === "dine-in" || v === "dine in") return "dine_in";
    if (v === "takeaway" || v === "take_away" || v === "take-away" || v === "take away") return "takeaway";

    return "";
  }

  function normalizeTableNumber(serviceType, value) {
    const table = String(value || "").trim();
    return serviceType === "dine_in" ? table : "";
  }

  function serviceTypeLabel(order) {
    const type = normalizeServiceType(
      order?.serviceType ||
      order?.service_type ||
      order?.orderType ||
      order?.order_type ||
      ""
    );

    if (type === "dine_in") return "Dine In";
    if (type === "takeaway") return "Takeaway";

    return "Not selected";
  }

  function tableNumberOf(order) {
    const type = normalizeServiceType(
      order?.serviceType ||
      order?.service_type ||
      order?.orderType ||
      order?.order_type ||
      ""
    );

    return normalizeTableNumber(
      type,
      order?.tableNumber ||
      order?.table_number ||
      order?.tableNo ||
      order?.table_no ||
      ""
    );
  }

  function serviceSummary(order) {
    const type = normalizeServiceType(
      order?.serviceType ||
      order?.service_type ||
      order?.orderType ||
      order?.order_type ||
      ""
    );

    const table = tableNumberOf(order);

    if (type === "dine_in") {
      return table ? `Dine In • Table ${table}` : "Dine In";
    }

    if (type === "takeaway") return "Takeaway";

    return "Not selected";
  }

  function normalizeOrder(order) {
    if (!order) return null;

    // Supabase row shape
    if ("restaurant_id" in order || "order_items" in order) {
      const serviceType = normalizeServiceType(order.service_type || order.serviceType || "");
      const tableNumber = normalizeTableNumber(serviceType, order.table_number || order.tableNumber || "");

      const payment = safeObj(order.payment);

      return {
        id: order.id,
        restaurantId: order.restaurant_id,
        serviceType,
        tableNumber,
        items: safeArr(order.order_items).map((it) => ({
          itemId: it.menu_item_id ?? null,
          name: it.name,
          originalName: it.original_name || it.originalName || it.base_name || it.name,
          price: Number(it.price || 0),
          basePrice: Number(it.base_price || it.basePrice || it.price || 0),
          addonTotal: Number(it.addon_total || it.addonTotal || 0),
          addons: safeArr(it.addons || it.selected_addons || it.options),
          qty: Number(it.qty || 0),
          fast: !!it.fast
        })),
        subtotal: Number(order.subtotal || 0),
        tax: Number(order.tax || 0),
        total: Number(order.total || 0),
        currency: order.currency || "PKR",
        status: order.status || "pending_approval",
        paymentMethod: order.payment_method || payment.paymentMethod || payment.method || "",
        rejectReason: order.reject_reason || payment.rejectReason || payment.rejectionReason || null,
        createdAt: order.created_at || null,
        approvalRequestedAt: order.approval_requested_at || payment.approvalRequestedAt || order.created_at || null,
        approvalRespondedAt: order.approval_responded_at || payment.approvalRespondedAt || null,
        approvalMode: order.approval_mode || payment.approvalMode || "",
        rejectedAt: order.rejected_at || payment.rejectedAt || null,
        rejectedByRestaurantId: order.rejected_by_restaurant_id || payment.rejectedByRestaurantId || null,
        timedOutAt: order.timed_out_at || payment.timedOutAt || payment.timed_out_at || null,
        timeoutReason: order.timeout_reason || payment.timeoutReason || payment.timeout_reason || "",
        approvedAt: order.approved_at || payment.approvedAt || null,
        paidAt: order.paid_at || null,
        payment
      };
    }

    // Local/demo shape
    const serviceType = normalizeServiceType(order.serviceType || order.service_type || order.orderType || "");
    const tableNumber = normalizeTableNumber(serviceType, order.tableNumber || order.table_number || order.tableNo || "");

    const payment = safeObj(order.payment);

    return {
      id: order.id,
      restaurantId: order.restaurantId,
      serviceType,
      tableNumber,
      items: safeArr(order.items),
      subtotal: Number(order.subtotal || 0),
      tax: Number(order.tax || 0),
      total: Number(order.total || 0),
      currency: order.currency || "PKR",
      status: order.status || "pending_approval",
      paymentMethod: order.paymentMethod || order.payment_method || payment.paymentMethod || payment.method || "",
      rejectReason: order.rejectReason || payment.rejectReason || payment.rejectionReason || null,
      createdAt: order.createdAt || null,
      approvalRequestedAt: order.approvalRequestedAt || payment.approvalRequestedAt || order.createdAt || null,
      approvalRespondedAt: order.approvalRespondedAt || payment.approvalRespondedAt || null,
      approvalMode: order.approvalMode || payment.approvalMode || "",
      rejectedAt: order.rejectedAt || payment.rejectedAt || null,
      rejectedByRestaurantId: order.rejectedByRestaurantId || payment.rejectedByRestaurantId || null,
      timedOutAt: order.timedOutAt || payment.timedOutAt || payment.timed_out_at || null,
      timeoutReason: order.timeoutReason || payment.timeoutReason || payment.timeout_reason || "",
      approvedAt: order.approvedAt || payment.approvedAt || null,
      paidAt: order.paidAt || null,
      payment
    };
  }

  async function fetchOrdersFromSupabase() {
    if (!FC.supabase || typeof FC.supabase.from !== "function") {
      return null;
    }

    try {
      const { data, error } = await FC.supabase
        .from("orders")
        .select(`
          *,
          order_items (
            menu_item_id,
            name,
            price,
            qty,
            fast
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return safeArr(data).map(normalizeOrder).filter(Boolean);
    } catch (err) {
      console.warn("admin.js: Supabase orders fetch failed, falling back to local state.", err);
      return null;
    }
  }

  async function getDashboardData() {
    const state = getStateSafe();

    let orders = await fetchOrdersFromSupabase();
    if (!orders) {
      orders = safeArr(state.orders).map(normalizeOrder).filter(Boolean);
    }

    return {
      state,
      restaurants: safeArr(state.restaurants),
      ads: safeArr(state.ads),
      logs: safeArr(state.logs),
      adMetrics: safeObj(state.adMetrics),
      orders
    };
  }

  function computeMetrics(data) {
    const ordersToday = safeArr(data.orders).filter((o) => isToday(o.createdAt));
    const paidStatuses = new Set(["paid", "preparing", "ready", "completed"]);
    const paidToday = ordersToday.filter((o) => paidStatuses.has(o.status));

    const revenue = paidToday.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const byHour = {};
    for (const o of paidToday) {
      const dt = new Date(o.paidAt || o.createdAt || Date.now());
      const h = dt.getHours();
      byHour[h] = (byHour[h] || 0) + 1;
    }

    let peakHour = "—";
    let peakCount = -1;
    Object.keys(byHour).forEach((h) => {
      if (byHour[h] > peakCount) {
        peakCount = byHour[h];
        peakHour = `${String(h).padStart(2, "0")}:00`;
      }
    });

    let attempts = 0;
    let successes = 0;
    for (const o of ordersToday) {
      attempts += Number(o.payment?.attemptCount || 0);
      if (o.payment?.success) successes += 1;
    }

    const payRate = attempts > 0 ? Math.round((successes / attempts) * 100) : 0;

    const dineInCount = paidToday.filter((o) => o.serviceType === "dine_in").length;
    const takeawayCount = paidToday.filter((o) => o.serviceType === "takeaway").length;

    return {
      revenue,
      ordersTodayCount: ordersToday.length,
      peakHour,
      payRate,
      dineInCount,
      takeawayCount
    };
  }

  async function loadUsers() {
    try {
      const res = await fetch("data/users.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error("admin.js: users.json load failed", err);
      return { admins: [] };
    }
  }

  async function showApp() {
    loginBox?.classList.add("hidden");
    appBox?.classList.remove("hidden");
    logoutBtn?.classList.remove("hidden");
    await renderAll();
  }

  function showLogin() {
    loginBox?.classList.remove("hidden");
    appBox?.classList.add("hidden");
    logoutBtn?.classList.add("hidden");
  }

  function renderMetrics(data) {
    const a = computeMetrics(data);
    setText(mRevenue, money(a.revenue));
    setText(mOrders, a.ordersTodayCount);
    setText(mPeak, a.peakHour);
    setText(mPayRate, `${a.payRate}%`);
  }

  async function renderRestaurants(data) {
    if (!restaurantsPanel) return;

    const restaurants = safeArr(data.restaurants);
    restaurantsPanel.innerHTML = "";

    if (!restaurants.length) {
      restaurantsPanel.innerHTML = `<div class="text-sm text-slate-400">No restaurants loaded.</div>`;
      return;
    }

    const hasSelected = restaurants.some((r) => String(r.id) === String(selectedAdminRestaurantId));
    if (!selectedAdminRestaurantId || !hasSelected) {
      selectedAdminRestaurantId = restaurants[0]?.id || "";
    }

    try {
      localStorage.setItem("fc_admin_selected_restaurant_id", selectedAdminRestaurantId);
    } catch {}

    const selectedRestaurant = restaurants.find((r) => String(r.id) === String(selectedAdminRestaurantId)) || restaurants[0];
    const paidStatuses = new Set(["paid", "preparing", "ready", "completed"]);

    const restaurantStats = (r) => {
      const restOrders = safeArr(data.orders).filter((o) => String(o.restaurantId) === String(r.id));
      const today = restOrders.filter((o) => isToday(o.createdAt));
      const paidToday = today.filter((o) => paidStatuses.has(String(o.status || "").toLowerCase()));

      return {
        totalToday: today.length,
        paidToday: paidToday.length,
        revenueToday: paidToday.reduce((sum, o) => sum + Number(o.total || 0), 0),
        dineInToday: paidToday.filter((o) => o.serviceType === "dine_in").length,
        takeawayToday: paidToday.filter((o) => o.serviceType === "takeaway").length,
        pendingApproval: restOrders.filter((o) => o.status === "pending_approval").length,
        awaitingPayment: restOrders.filter((o) => ["approved", "awaiting_payment", "awaiting_cash_payment"].includes(String(o.status || "").toLowerCase())).length,
        rejectedToday: today.filter((o) => o.status === "rejected").length,
        timedOutToday: today.filter((o) => o.status === "timed_out").length,
        autoAcceptedToday: today.filter((o) => String(o.approvalMode || o.payment?.approvalMode || "").toLowerCase().includes("auto")).length
      };
    };

    const selectedStats = restaurantStats(selectedRestaurant);
    const selectedMenu = safeArr(selectedRestaurant?.menu);
    const onlineText = selectedRestaurant?.online ? "OPEN" : "CLOSED";
    const enabledCount = selectedMenu.filter((m) => m.available).length;
    const disabledCount = selectedMenu.length - enabledCount;

    restaurantsPanel.innerHTML = `
      <div class="grid lg:grid-cols-12 gap-4">
        <div class="lg:col-span-4">
          <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold">Restaurants</div>
                <div class="text-xs text-slate-400 mt-1">Select one restaurant to manage.</div>
              </div>
              <span class="pill">${restaurants.length}</span>
            </div>

            <div class="mt-3 space-y-2 max-h-[68vh] overflow-y-auto pr-1">
              ${restaurants.map((r) => {
                const st = restaurantStats(r);
                const active = String(r.id) === String(selectedRestaurant?.id);
                return `
                  <button type="button" data-admin-select-restaurant="${escapeHtml(r.id)}"
                    class="w-full text-left rounded-2xl border ${active ? "border-orange-400/50 bg-orange-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"} p-3 transition">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <div class="font-semibold truncate">${escapeHtml(r.name || "Restaurant")}</div>
                        <div class="text-xs text-slate-400 mt-1 truncate">${escapeHtml(r.tagline || "")}</div>
                      </div>
                      <span class="pill ${r.online ? "badge-green" : "badge-red"}">${r.online ? "OPEN" : "CLOSED"}</span>
                    </div>
                    <div class="mt-2 grid grid-cols-3 gap-1 text-[11px] text-slate-300">
                      <span class="rounded-xl bg-white/5 px-2 py-1">Pay ${st.awaitingPayment}</span>
                      <span class="rounded-xl bg-white/5 px-2 py-1">Pend ${st.pendingApproval}</span>
                      <span class="rounded-xl bg-white/5 px-2 py-1">Out ${st.timedOutToday}</span>
                    </div>
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        </div>

        <div class="lg:col-span-8">
          <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="min-w-0">
                <div class="text-xs uppercase tracking-widest text-slate-400">Selected Restaurant</div>
                <div class="text-2xl font-semibold mt-1 truncate">${escapeHtml(selectedRestaurant?.name || "Restaurant")}</div>
                <div class="text-sm text-slate-400 mt-1">${escapeHtml(selectedRestaurant?.tagline || "")}</div>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                <span class="pill ${selectedRestaurant?.online ? "badge-green" : "badge-red"}">${onlineText}</span>
                <button type="button" class="btn-ghost text-sm" data-admin-toggle-selected-restaurant>
                  ${selectedRestaurant?.online ? "Close Restaurant" : "Open Restaurant"}
                </button>
              </div>
            </div>

            <div class="mt-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                <div class="text-xs uppercase tracking-widest text-slate-400">Sales Today</div>
                <div class="text-lg font-semibold mt-1">${money(selectedStats.revenueToday)}</div>
              </div>
              <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                <div class="text-xs uppercase tracking-widest text-slate-400">Orders</div>
                <div class="text-lg font-semibold mt-1">${selectedStats.totalToday}</div>
              </div>
              <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                <div class="text-xs uppercase tracking-widest text-slate-400">Awaiting Pay</div>
                <div class="text-lg font-semibold mt-1">${selectedStats.awaitingPayment}</div>
              </div>
              <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                <div class="text-xs uppercase tracking-widest text-slate-400">Timed Out</div>
                <div class="text-lg font-semibold mt-1">${selectedStats.timedOutToday}</div>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/25 p-3">
              <div class="flex items-center gap-2 flex-wrap text-xs text-slate-300">
                <span class="pill badge-yellow">Pending Approval: ${selectedStats.pendingApproval}</span>
                <span class="pill badge-red">Rejected Today: ${selectedStats.rejectedToday}</span>
                <span class="pill badge-green">Auto Accepted: ${selectedStats.autoAcceptedToday}</span>
                <span class="pill">Dine In: ${selectedStats.dineInToday}</span>
                <span class="pill">Takeaway: ${selectedStats.takeawayToday}</span>
              </div>
            </div>

            <div class="mt-6 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div class="text-sm font-semibold">Menu Availability</div>
                <div class="text-xs text-slate-400 mt-1">
                  Showing all ${selectedMenu.length} items for this restaurant only. Enabled: ${enabledCount} • Disabled: ${disabledCount}
                </div>
              </div>
              <div class="pill">Cleaner selected view</div>
            </div>

            <div class="mt-3 grid sm:grid-cols-2 gap-2 max-h-[52vh] overflow-y-auto pr-1">
              ${selectedMenu.length ? selectedMenu.map((m) => `
                <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/45 p-3">
                  <div class="min-w-0">
                    <div class="text-sm font-semibold truncate">${escapeHtml(m.name || "Item")}</div>
                    <div class="text-xs text-slate-400 mt-1 truncate">${escapeHtml(m.category || "General")} • ${money(m.price || 0)}</div>
                  </div>
                  <button type="button" class="${m.available ? "btn-ghost" : "btn-primary"} text-xs px-3 py-2 shrink-0" data-admin-toggle-menu-item="${escapeHtml(m.id)}">
                    ${m.available ? "Disable" : "Enable"}
                  </button>
                </div>
              `).join("") : `
                <div class="sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                  No menu items loaded for this restaurant.
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;

    restaurantsPanel.querySelectorAll("[data-admin-select-restaurant]").forEach((btn) => {
      btn.onclick = async () => {
        selectedAdminRestaurantId = btn.getAttribute("data-admin-select-restaurant") || "";
        try {
          localStorage.setItem("fc_admin_selected_restaurant_id", selectedAdminRestaurantId);
        } catch {}
        await renderAll();
      };
    });

    const toggleSelectedBtn = restaurantsPanel.querySelector("[data-admin-toggle-selected-restaurant]");
    if (toggleSelectedBtn && selectedRestaurant) {
      toggleSelectedBtn.onclick = async () => {
        try {
          if (typeof FC.toggleRestaurantOnline === "function") {
            await Promise.resolve(FC.toggleRestaurantOnline(selectedRestaurant.id));
          }
        } catch (err) {
          console.error("admin.js: toggle selected restaurant failed", err);
        }
        await renderAll();
      };
    }

    restaurantsPanel.querySelectorAll("[data-admin-toggle-menu-item]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          if (typeof FC.toggleMenuItem === "function" && selectedRestaurant) {
            await Promise.resolve(FC.toggleMenuItem(selectedRestaurant.id, btn.getAttribute("data-admin-toggle-menu-item")));
          }
        } catch (err) {
          console.error("admin.js: toggle selected menu item failed", err);
        }
        await renderAll();
      };
    });
  }

  function renderAnalytics(data) {
    if (!analyticsPanel) return;

    const paidToday = data.orders.filter((o) =>
      isToday(o.createdAt) &&
      !["pending_approval", "rejected", "awaiting_payment"].includes(o.status)
    );

    const dineInCount = paidToday.filter((o) => o.serviceType === "dine_in").length;
    const takeawayCount = paidToday.filter((o) => o.serviceType === "takeaway").length;
    const unknownTypeCount = paidToday.filter((o) => !o.serviceType).length;

    const byRest = {};
    paidToday.forEach((o) => {
      byRest[o.restaurantId] = (byRest[o.restaurantId] || 0) + Number(o.total || 0);
    });

    const ranking = Object.entries(byRest)
      .sort((a, b) => b[1] - a[1])
      .map(([rid, rev]) => {
        const rn = data.restaurants.find((r) => r.id === rid)?.name || rid;
        return { restaurant: rn, revenue: rev };
      });

    const itemCounts = {};
    paidToday.forEach((o) => {
      safeArr(o.items).forEach((it) => {
        itemCounts[it.name] = (itemCounts[it.name] || 0) + Number(it.qty || 0);
      });
    });

    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, qty]) => ({ item: name, qty }));

    const impressions = safeObj(data.adMetrics.impressions);
    const adImpressions = Object.entries(impressions)
      .map(([adId, count]) => {
        const ad = data.ads.find((x) => x.id === adId);
        return { ad: ad?.title || adId, impressions: count };
      })
      .sort((a, b) => b.impressions - a.impressions);

    analyticsPanel.innerHTML = `
      <div class="grid sm:grid-cols-2 gap-4">
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-sm font-semibold">Restaurant Ranking (Revenue)</div>
          <div class="mt-3 space-y-2 text-sm">
            ${
              ranking.length
                ? ranking.map((x) => `
                    <div class="flex justify-between text-slate-300">
                      <span>${x.restaurant}</span>
                      <span>${money(x.revenue)}</span>
                    </div>
                  `).join("")
                : `<div class="text-slate-400 text-sm">No paid orders today.</div>`
            }
          </div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-sm font-semibold">Top Items (Qty)</div>
          <div class="mt-3 space-y-2 text-sm">
            ${
              topItems.length
                ? topItems.map((x) => `
                    <div class="flex justify-between text-slate-300">
                      <span>${x.item}</span>
                      <span>${x.qty}</span>
                    </div>
                  `).join("")
                : `<div class="text-slate-400 text-sm">No sales yet.</div>`
            }
          </div>
        </div>
      </div>

      <div class="mt-4 grid sm:grid-cols-3 gap-4">
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Dine In</div>
          <div class="text-2xl font-semibold mt-2">${dineInCount}</div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Takeaway</div>
          <div class="text-2xl font-semibold mt-2">${takeawayCount}</div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Not Marked</div>
          <div class="text-2xl font-semibold mt-2">${unknownTypeCount}</div>
        </div>
      </div>

      <div class="mt-4 grid sm:grid-cols-4 gap-4">
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Pending Approval</div>
          <div class="text-2xl font-semibold mt-2">${data.orders.filter((o) => o.status === "pending_approval").length}</div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Rejected Today</div>
          <div class="text-2xl font-semibold mt-2">${data.orders.filter((o) => isToday(o.createdAt) && o.status === "rejected").length}</div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Auto Accepted Today</div>
          <div class="text-2xl font-semibold mt-2">${data.orders.filter((o) => isToday(o.createdAt) && String(o.approvalMode || o.payment?.approvalMode || "").toLowerCase().includes("auto")).length}</div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Approval Window</div>
          <div class="text-2xl font-semibold mt-2">${approvalWindowSeconds()}s</div>
        </div>
      </div>

      <div class="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10">
        <div class="text-sm font-semibold">Approval / Rejection Monitor</div>
        <div class="mt-3 space-y-2 text-sm">
          ${
            data.orders.filter((o) => ["pending_approval", "approved", "rejected"].includes(String(o.status || "").toLowerCase())).slice(0, 8).length
              ? data.orders.filter((o) => ["pending_approval", "approved", "rejected"].includes(String(o.status || "").toLowerCase())).slice(0, 8).map((o) => `
                  <div class="flex justify-between gap-3 text-slate-300 border-b border-white/5 pb-2">
                    <span class="truncate">${o.id} • ${restaurantNameById(data.restaurants, o.restaurantId)}</span>
                    <span class="text-right">${escapeHtml(adminPaymentStatus(o))}</span>
                  </div>
                `).join("")
              : `<div class="text-slate-400 text-sm">No approval/rejection activity yet.</div>`
          }
        </div>
      </div>

      <div class="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10">
        <div class="text-sm font-semibold">Ad Impressions</div>
        <div class="mt-3 space-y-2 text-sm">
          ${
            adImpressions.length
              ? adImpressions.map((x) => `
                  <div class="flex justify-between text-slate-300">
                    <span>${x.ad}</span>
                    <span>${x.impressions}</span>
                  </div>
                `).join("")
              : `<div class="text-slate-400 text-sm">No impressions tracked yet.</div>`
          }
        </div>
      </div>
    `;
  }


  // ---------- Cash Counter + Hardware Console inside Admin ----------
  function adminPaymentMethodOf(order) {
    const payment = safeObj(order?.payment);
    const raw = String(
      order?.paymentMethod ||
      order?.payment_method ||
      payment.paymentMethod ||
      payment.method ||
      payment.provider ||
      "online"
    ).toLowerCase();

    if (raw.includes("cash") || raw === "cod" || raw === "counter") return "cash";
    return "online";
  }

  function adminPaymentStatus(order) {
    const status = String(order?.status || "").toLowerCase();
    const payment = safeObj(order?.payment);
    const mode = approvalModeText(order);

    if (payment.success || ["paid", "preparing", "ready", "completed"].includes(status)) return "Paid";
    if (status === "awaiting_payment") return adminPaymentMethodOf(order) === "cash" ? "Cash Pending" : "Online Pending";
    if (status === "approved") return mode ? `${mode} - Payment Pending` : "Approved - Payment Pending";
    if (status === "pending_approval") return `Pending Approval (${orderApprovalSecondsLeft(order)}s left)`;
    if (status === "rejected") return `Rejected${order.rejectReason ? ` - ${order.rejectReason}` : ""}`;
    if (status === "timed_out") return `Timed Out${order.timeoutReason ? ` - ${order.timeoutReason}` : ""}`;
    return status || "Unknown";
  }

  function adminCashPending(order) {
    const status = String(order?.status || "").toLowerCase();
    const payment = safeObj(order?.payment);
    return (
      adminPaymentMethodOf(order) === "cash" &&
      !payment.success &&
      ["approved", "awaiting_payment", "awaiting_cash_payment"].includes(status)
    );
  }

  function adminOrderItemsText(order) {
    const items = safeArr(order?.items);
    if (!items.length) return "No items";
    return items.map((it) => `${it.name || "Item"} x${Number(it.qty || 0)}`).join(" | ");
  }

  function parseCashQrPayload(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;

    try {
      const url = new URL(text);
      const orderId = url.searchParams.get("order_id") || url.searchParams.get("orderId") || url.searchParams.get("id");
      const cashToken = url.searchParams.get("cash_token") || url.searchParams.get("cashToken") || "";
      if (orderId) return { orderId: String(orderId).trim(), cashToken: String(cashToken).trim(), raw: text };
    } catch {}

    try {
      const obj = JSON.parse(text);
      const orderId = obj.order_id || obj.orderId || obj.id;
      const cashToken = obj.cash_token || obj.cashToken || obj.token || "";
      if (orderId) return { orderId: String(orderId).trim(), cashToken: String(cashToken).trim(), raw: text };
    } catch {}

    if (text.startsWith("FC_CASH_ORDER|")) {
      const parts = text.split("|");
      return {
        orderId: String(parts[1] || "").trim(),
        cashToken: String(parts[2] || "").trim(),
        raw: text
      };
    }

    const match = text.match(/ORD-[A-Z0-9-]+/i);
    if (match) return { orderId: match[0], cashToken: "", raw: text };

    return { orderId: text, cashToken: "", raw: text };
  }

  function setCashQrMessage(text, type = "info") {
    if (!cashQrMessage) return;
    cashQrMessage.textContent = text;
    cashQrMessage.className = type === "error"
      ? "mt-3 text-sm text-rose-300"
      : type === "success"
        ? "mt-3 text-sm text-emerald-300"
        : "mt-3 text-sm text-slate-300";
  }

  async function stopCashQrScanner() {
    if (cashQrScanner && cashQrScannerRunning) {
      try {
        await cashQrScanner.stop();
      } catch (err) {
        console.warn("admin.js: scanner stop failed", err);
      }
    }
    cashQrScannerRunning = false;
  }

  async function closeCashQrScanner() {
    await stopCashQrScanner();
    if (cashQrScannerModal) cashQrScannerModal.classList.add("hidden");
  }

  async function loadCashOrderFromQrText(text) {
    const parsed = parseCashQrPayload(text);

    if (!parsed || !parsed.orderId) {
      setCashQrMessage("Could not read order id from QR.", "error");
      return;
    }

    cashCounterSelectedOrderId = parsed.orderId;
    if (parsed.cashToken) cashCounterScannedTokens[parsed.orderId] = parsed.cashToken;

    await closeCashQrScanner();
    await renderAll();

    setTimeout(() => {
      cashCounterPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  async function openCashQrScanner() {
    if (!cashQrScannerModal) return;

    cashQrScannerModal.classList.remove("hidden");
    if (cashQrManualInput) cashQrManualInput.value = "";
    setCashQrMessage("Starting camera scanner...");

    if (typeof Html5Qrcode === "undefined") {
      setCashQrMessage("Camera scanner library not loaded. Type or paste the Order ID manually.", "error");
      return;
    }

    try {
      if (!cashQrScanner) {
        cashQrScanner = new Html5Qrcode("cashQrReader");
      }

      if (cashQrScannerRunning) return;

      await cashQrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (!decodedText) return;
          await loadCashOrderFromQrText(decodedText);
        },
        () => {}
      );

      cashQrScannerRunning = true;
      setCashQrMessage("Scanner active. Point the camera at the cash QR on the receipt.", "success");
    } catch (err) {
      console.error("admin.js: QR scanner failed", err);
      setCashQrMessage("Camera scanner could not start. Use manual Order ID entry below.", "error");
    }
  }

  function renderCashCounter(data) {
    if (!cashCounterPanel) return;

    const activeEl = document.activeElement;
    if (activeEl && cashCounterPanel.contains(activeEl)) {
      return;
    }

    const allCashOrders = safeArr(data.orders)
      .filter((order) => adminPaymentMethodOf(order) === "cash")
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

    let visibleOrders = allCashOrders.filter(adminCashPending);

    if (cashCounterSelectedOrderId) {
      const selected = safeArr(data.orders).find((o) => String(o.id) === String(cashCounterSelectedOrderId));
      visibleOrders = selected ? [selected] : [];
    }

    cashCounterPanel.innerHTML = "";

    const awaitingPaymentOrders = safeArr(data.orders).filter((order) => {
      const status = String(order?.status || "").toLowerCase();
      const payment = safeObj(order?.payment);
      return !payment.success && ["approved", "awaiting_payment", "awaiting_cash_payment"].includes(status);
    });

    const cashPendingOrders = allCashOrders.filter(adminCashPending);
    const onlinePendingOrders = awaitingPaymentOrders.filter((order) => adminPaymentMethodOf(order) !== "cash");
    const timedOutToday = safeArr(data.orders).filter((order) => String(order?.status || "").toLowerCase() === "timed_out" && isToday(order.createdAt));
    const rejectedToday = safeArr(data.orders).filter((order) => String(order?.status || "").toLowerCase() === "rejected" && isToday(order.createdAt));

    const attentionRows = [
      ...cashPendingOrders.slice(0, 3).map((order) => ({ label: "Cash Pending", badge: "badge-yellow", order })),
      ...onlinePendingOrders.slice(0, 3).map((order) => ({ label: "Online Pending", badge: "badge-yellow", order })),
      ...timedOutToday.slice(0, 3).map((order) => ({ label: "Timed Out", badge: "badge-red", order })),
      ...rejectedToday.slice(0, 3).map((order) => ({ label: "Rejected", badge: "badge-red", order }))
    ].slice(0, 6);

    cashCounterPanel.innerHTML = `
      <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
          <div class="text-xs uppercase tracking-widest text-slate-400">Cash Pending</div>
          <div class="text-xl font-semibold mt-1">${cashPendingOrders.length}</div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
          <div class="text-xs uppercase tracking-widest text-slate-400">Online Pending</div>
          <div class="text-xl font-semibold mt-1">${onlinePendingOrders.length}</div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
          <div class="text-xs uppercase tracking-widest text-slate-400">Timed Out Today</div>
          <div class="text-xl font-semibold mt-1">${timedOutToday.length}</div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
          <div class="text-xs uppercase tracking-widest text-slate-400">Rejected Today</div>
          <div class="text-xl font-semibold mt-1">${rejectedToday.length}</div>
        </div>
      </div>

      <div class="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div class="text-sm font-semibold">Payment Attention</div>
            <div class="text-xs text-slate-400 mt-1">Cash confirmations, online pending payments, abandoned and rejected orders.</div>
          </div>
          <span class="pill">Live</span>
        </div>
        <div class="mt-3 space-y-2">
          ${attentionRows.length ? attentionRows.map((row) => `
            <div class="flex items-center justify-between gap-3 rounded-xl bg-slate-950/35 border border-white/10 px-3 py-2 text-xs">
              <div class="min-w-0 truncate">
                <span class="pill ${row.badge}">${row.label}</span>
                <span class="ml-2 text-slate-300">${escapeHtml(row.order.id || "")}</span>
                <span class="ml-2 text-slate-500">${escapeHtml(restaurantNameById(data.restaurants, row.order.restaurantId))}</span>
              </div>
              <div class="font-semibold">${money(row.order.total || 0)}</div>
            </div>
          `).join("") : `<div class="text-sm text-slate-400">No payment issues right now.</div>`}
        </div>
      </div>

      <div class="mt-4 text-sm font-semibold">Cash Confirmation</div>
    `;

    if (cashCounterSelectedOrderId) {
      const banner = document.createElement("div");
      banner.className = "p-3 rounded-2xl bg-indigo-500/10 border border-indigo-400/20 text-sm text-indigo-100 flex items-center justify-between gap-3 flex-wrap";
      banner.innerHTML = `
        <div>Showing scanned/selected order: <span class="pill">${cashCounterSelectedOrderId}</span></div>
        <button class="btn-ghost text-xs" data-clear-cash-selection>Show All Pending Cash Orders</button>
      `;
      banner.querySelector("[data-clear-cash-selection]").onclick = async () => {
        cashCounterSelectedOrderId = "";
        await renderAll();
      };
      cashCounterPanel.appendChild(banner);
    }

    if (!visibleOrders.length) {
      cashCounterPanel.innerHTML += `
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10 text-sm text-slate-400">
          ${cashCounterSelectedOrderId ? "Selected cash order was not found. Scan again or enter a valid Order ID." : "No cash payments waiting right now."}
        </div>
      `;
      return;
    }

    visibleOrders.forEach((order) => {
      const restaurantName = restaurantNameById(data.restaurants, order.restaurantId);
      const total = Number(order.total || 0);
      const payment = safeObj(order.payment);
      const isPaid = payment.success || ["paid", "preparing", "ready", "completed"].includes(String(order.status || "").toLowerCase());
      const canConfirm = adminCashPending(order);
      const amountReceived = Number(payment.cashReceived || payment.amountReceived || total || 0);
      const changeGiven = Number(payment.cashChange || payment.changeGiven || 0);

      const div = document.createElement("div");
      div.className = "p-4 rounded-2xl bg-white/5 border border-white/10";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="font-semibold">${order.id}</div>
              <span class="pill ${isPaid ? "badge-green" : "badge-yellow"}">${isPaid ? "CASH PAID" : "CASH PENDING"}</span>
              <span class="pill">${restaurantName}</span>
            </div>
            <div class="text-xs text-slate-400 mt-2">${serviceSummary(order)}</div>
            <div class="text-xs text-slate-400 mt-1 break-words">${adminOrderItemsText(order)}</div>
            <div class="text-sm text-slate-200 mt-2">Total Due: <span class="pill">${money(total)}</span></div>
          </div>
          <div class="text-right text-xs text-slate-400">
            <div>${order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}</div>
            <div class="mt-1">${adminPaymentStatus(order)}</div>
          </div>
        </div>

        ${isPaid ? `
          <div class="mt-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-4 text-sm text-emerald-200">
            Payment already received by ${payment.cashConfirmedBy || payment.paymentReceivedBy || "Staff"}.<br>
            Received: <b>${money(amountReceived)}</b> • Change Given: <b>${money(changeGiven)}</b>
          </div>
        ` : `
          <div class="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input class="tws-input" data-cash-staff placeholder="Staff name" value="Admin" />
            <input class="tws-input" data-cash-pin type="password" inputmode="numeric" placeholder="Staff PIN" />
            <input class="tws-input" data-cash-received type="number" min="0" step="1" placeholder="Amount received" />
            <div class="rounded-2xl bg-slate-950/50 border border-white/10 px-4 py-3 text-sm">
              <div class="text-xs text-slate-400">Change Given</div>
              <div class="font-semibold mt-1" data-cash-change>${money(0)}</div>
            </div>
          </div>

          <button class="btn-primary w-full mt-3" data-confirm-cash ${canConfirm ? "" : "disabled"}>Confirm Payment Received</button>
          <div class="text-xs text-slate-400 mt-2" data-cash-note>
            ${canConfirm ? "Enter collected amount. Change is calculated automatically." : `Current status is "${order.status}". Cash can be confirmed after restaurant approval.`}
          </div>
        `}
      `;

      if (!isPaid) {
        const staffInput = div.querySelector("[data-cash-staff]");
        const pinInput = div.querySelector("[data-cash-pin]");
        const receivedInput = div.querySelector("[data-cash-received]");
        const changeEl = div.querySelector("[data-cash-change]");
        const confirmBtn = div.querySelector("[data-confirm-cash]");
        const noteEl = div.querySelector("[data-cash-note]");

        const updateChange = () => {
          const received = Number(receivedInput?.value || 0);
          const change = Math.max(0, received - total);
          if (changeEl) changeEl.textContent = money(change);
        };

        receivedInput?.addEventListener("input", updateChange);

        confirmBtn.onclick = async () => {
          const staffName = String(staffInput?.value || "Admin").trim() || "Admin";
          const staffPin = String(pinInput?.value || "").trim();
          const amountReceived = Number(receivedInput?.value || 0);
          const changeGiven = Math.max(0, amountReceived - total);

          if (!staffPin) {
            if (noteEl) noteEl.textContent = "Enter staff PIN first.";
            return;
          }

          if (amountReceived < total) {
            if (noteEl) noteEl.textContent = `Amount received is less than total due (${money(total)}).`;
            return;
          }

          if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.classList.add("opacity-60");
            confirmBtn.textContent = "Confirming...";
          }

          try {
            if (typeof FC.confirmCashPayment !== "function") {
              throw new Error("FC.confirmCashPayment is missing. Update storage.js first.");
            }

            await FC.confirmCashPayment(order.id, {
              cashToken: cashCounterScannedTokens[order.id] || safeObj(order.payment).cashToken || "",
              staffName,
              staffPin,
              amountReceived,
              changeGiven
            });

            logSafe(`Admin confirmed cash payment for ${order.id}. Received ${amountReceived}, change ${changeGiven}.`);
            cashCounterSelectedOrderId = "";
            await renderAll();
          } catch (err) {
            console.error("admin.js: cash confirmation failed", err);
            if (noteEl) noteEl.textContent = err.message || "Cash confirmation failed.";
            if (confirmBtn) {
              confirmBtn.disabled = false;
              confirmBtn.classList.remove("opacity-60");
              confirmBtn.textContent = "Confirm Payment Received";
            }
          }
        };
      }

      cashCounterPanel.appendChild(div);
    });
  }

  function adminGetDevices() {
    const defaults = {
      network: { online: true, latencyMs: 42, lastHeartbeatAt: "" },
      printer: { online: true, paper: 100, paperPercent: 100, paperRollMeters: 80, lowPaper: false },
      paymentGateway: { online: true, provider: "Stripe / Cash Counter", lastVerifyAt: null },
      kioskDisplay: { online: true, brightness: 75, locked: false, maintenanceMode: false, outOfOrder: false },
      localCache: { enabled: true, queuedOrders: 0 }
    };

    let devices = {};
    try {
      if (typeof FC.getDevices === "function") devices = FC.getDevices() || {};
      else devices = safeObj(getStateSafe().devices);
    } catch {
      devices = safeObj(getStateSafe().devices);
    }

    return {
      ...defaults,
      ...safeObj(devices),
      network: { ...defaults.network, ...safeObj(devices.network) },
      printer: { ...defaults.printer, ...safeObj(devices.printer) },
      paymentGateway: { ...defaults.paymentGateway, ...safeObj(devices.paymentGateway) },
      kioskDisplay: { ...defaults.kioskDisplay, ...safeObj(devices.kioskDisplay) },
      localCache: { ...defaults.localCache, ...safeObj(devices.localCache) }
    };
  }

  function adminDeviceHealth() {
    const d = adminGetDevices();
    const issues = [];
    const paper = clampPercent(d.printer?.paper ?? d.printer?.paperPercent ?? 100);
    const lastHeartbeatRaw = d.network?.lastHeartbeatAt || d.network?.lastSeenAt || d.kioskDisplay?.lastSeenAt || d.kioskDisplay?.lastHeartbeatAt || "";
    const lastHeartbeatMs = lastHeartbeatRaw ? Date.parse(lastHeartbeatRaw) : NaN;
    const heartbeatStale = Number.isFinite(lastHeartbeatMs) && (Date.now() - lastHeartbeatMs) > HARDWARE_KIOSK_HEARTBEAT_STALE_MS;

    if (!d.network?.online || heartbeatStale) issues.push("Network offline");
    if (Number(d.network?.latencyMs || 0) > 150) issues.push("High network latency");
    if (!d.printer?.online) issues.push("Printer offline");
    if (paper <= HARDWARE_LOW_PAPER_PERCENT) issues.push("Printer paper low");
    if (!d.paymentGateway?.online) issues.push("Payment gateway offline");
    if (!d.kioskDisplay?.online) issues.push("Kiosk display offline");
    if (d.kioskDisplay?.locked) issues.push("Kiosk locked");

    return { ok: issues.length === 0, issues, heartbeatStale, paper };
  }

  function adminDeviceLog(message, level = "INFO") {
    try {
      if (typeof FC.deviceLog === "function") {
        FC.deviceLog(message, level);
        return;
      }
    } catch (err) {
      console.warn("admin.js: FC.deviceLog failed", err);
    }

    const st = getStateSafe();
    st.deviceLogs = safeArr(st.deviceLogs);
    st.deviceLogs.unshift({ at: nowISO(), level, message });
    st.deviceLogs = st.deviceLogs.slice(0, 40);
    saveStateSafe(st);
  }

  function adminSetDevice(key, patch, message = "") {
    const cleanPatch = safeObj(patch);

    try {
      if (typeof FC.setDevice === "function") {
        const updated = FC.setDevice(key, cleanPatch);
        if (message) adminDeviceLog(message, cleanPatch.online === false ? "WARN" : "INFO");
        return updated;
      }
    } catch (err) {
      console.error("admin.js: setDevice failed", err);
    }

    const st = getStateSafe();
    st.devices = safeObj(st.devices);
    st.devices[key] = {
      ...safeObj(st.devices[key]),
      ...cleanPatch,
      updatedAt: nowISO()
    };
    saveStateSafe(st);

    if (message) adminDeviceLog(message, cleanPatch.online === false ? "WARN" : "INFO");
    return st.devices[key];
  }

  function adminSetDeviceOnline(key, online, label) {
    return adminSetDevice(
      key,
      { online: !!online, manuallyControlled: true, updatedAt: nowISO() },
      `${label || key} turned ${online ? "ON" : "OFF"} from admin hardware console.`
    );
  }

  function adminToggleDevice(key) {
    const d = adminGetDevices();
    const labelMap = {
      network: "Network",
      printer: "Printer",
      paymentGateway: "Payment gateway",
      kioskDisplay: "Kiosk display"
    };
    return adminSetDeviceOnline(key, !d[key]?.online, labelMap[key] || key);
  }

  function adminSetPaperPercent(value, reason = "Paper percentage manually updated") {
    const nextPaper = clampPercent(value);
    const updated = adminSetDevice("printer", {
      paper: nextPaper,
      paperPercent: nextPaper,
      paperRollMeters: 80,
      lowPaper: nextPaper <= HARDWARE_LOW_PAPER_PERCENT,
      updatedAt: nowISO()
    }, `${reason}: ${nextPaper}% remaining.`);

    if (nextPaper <= HARDWARE_LOW_PAPER_PERCENT) {
      adminDeviceLog(`LOW PAPER: printer paper is ${nextPaper}%. Replace 80m thermal roll soon.`, "WARN");
    }

    return updated;
  }

  function adminConsumePrinterPaper(amount = HARDWARE_PRINT_PAPER_STEP, reason = "Printer paper consumed") {
    const d = adminGetDevices();
    const current = clampPercent(d.printer?.paper ?? d.printer?.paperPercent ?? 100);
    return adminSetPaperPercent(current - Number(amount || 0), reason);
  }

  function renderHardwareConsole(data) {
    if (!adminHardwareHealthLabel && !adminDevicesPanel && !adminDeviceLogs) return;

    const d = adminGetDevices();
    const health = adminDeviceHealth();
    const paper = clampPercent(d.printer?.paper ?? d.printer?.paperPercent ?? 100);
    const lastHeartbeatRaw = d.network?.lastHeartbeatAt || d.network?.lastSeenAt || d.kioskDisplay?.lastSeenAt || d.kioskDisplay?.lastHeartbeatAt || "";
    const networkOnline = !!d.network?.online && !health.heartbeatStale;
    const printerOnline = !!d.printer?.online;
    const gatewayOnline = !!d.paymentGateway?.online;
    const kioskOnline = !!d.kioskDisplay?.online;
    const lowPaper = paper <= HARDWARE_LOW_PAPER_PERCENT;

    if (adminHardwareHealthLabel) {
      adminHardwareHealthLabel.innerHTML = health.ok
        ? `All Systems Normal <span class="pill badge-green">HEALTHY</span>`
        : `Action Required <span class="pill badge-red">DEGRADED</span>`;
    }

    if (adminHardwareIssues) {
      adminHardwareIssues.textContent = health.ok ? "No active hardware issues detected." : `Issues: ${health.issues.join(" • ")}`;
      adminHardwareIssues.className = health.ok ? "text-sm text-emerald-300 mt-2" : "text-sm text-rose-300 mt-2";
    }

    setHidden(adminHardwareWarningBox, health.ok);
    if (!health.ok) {
      setText(adminHardwareWarningTitle, "Hardware Attention Required");
      setText(adminHardwareWarningMessage, health.issues.join(" • "));
    }

    setBadge(adminNetworkStatusBadge, networkOnline, "ONLINE", "NO NETWORK");
    setText(adminNetworkLastSeen, `Last heartbeat: ${formatLastSeen(lastHeartbeatRaw)}`);
    setHidden(adminNetworkWarning, networkOnline);

    setBadge(adminPrinterStatusBadge, printerOnline, "ONLINE", "OFFLINE");
    setHidden(adminLowPaperWarning, !lowPaper);
    setText(adminPrinterPaperValue, `${paper}%`);
    if (adminPrinterPaperBar) {
      adminPrinterPaperBar.style.width = `${paper}%`;
      adminPrinterPaperBar.className = `h-full rounded-full ${paper <= HARDWARE_LOW_PAPER_PERCENT ? "bg-red-500" : paper <= 30 ? "bg-amber-500" : "bg-green-500"}`;
    }

    setBadge(adminPaymentGatewayStatusBadge, gatewayOnline, "ONLINE", "OFFLINE");
    setHidden(adminPaymentGatewayWarning, gatewayOnline);

    setBadge(adminKioskDisplayStatusBadge, kioskOnline, "ONLINE", "MAINTENANCE");
    setHidden(adminKioskDisplayWarning, kioskOnline);

    if (adminDevicesPanel) {
      const rows = [
        [
          "network",
          "Network",
          `${networkOnline ? "Connected" : "No network"} • latency=${Number(d.network?.latencyMs || 0)}ms • heartbeat=${formatLastSeen(lastHeartbeatRaw)}`,
          networkOnline
        ],
        [
          "printer",
          "Printer",
          `${printerOnline ? "Ready" : "Printing blocked"} • paper=${paper}% • lowPaper=${lowPaper ? "yes" : "no"}`,
          printerOnline && !lowPaper
        ],
        [
          "paymentGateway",
          "Payment Gateway",
          `provider=${d.paymentGateway?.provider || "Stripe / Cash Counter"} • online=${gatewayOnline ? "yes" : "no"}`,
          gatewayOnline
        ],
        [
          "kioskDisplay",
          "Kiosk Display",
          `${kioskOnline ? "Customer dashboard active" : "Maintenance / Out of Order"} • locked=${!!d.kioskDisplay?.locked}`,
          kioskOnline
        ],
        [
          "localCache",
          "Local Cache",
          `enabled=${!!d.localCache?.enabled} • queuedOrders=${Number(d.localCache?.queuedOrders || 0)}`,
          true
        ]
      ];

      adminDevicesPanel.innerHTML = rows.map(([key, title, sub, online]) => `
        <div class="p-3 rounded-2xl bg-white/5 border ${online ? "border-white/10" : "border-red-400/30"}">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="min-w-0">
              <div class="font-semibold">${title}</div>
              <div class="text-xs text-slate-400 mt-1">${sub}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="pill ${online ? "badge-green" : "badge-red"}">${online ? "OK" : "ATTENTION"}</span>
              ${key !== "localCache" ? `<button class="btn-ghost text-xs px-3 py-2" data-admin-toggle-device="${key}">Toggle</button>` : ""}
            </div>
          </div>
        </div>
      `).join("");

      adminDevicesPanel.querySelectorAll("[data-admin-toggle-device]").forEach((btn) => {
        btn.onclick = async () => {
          adminToggleDevice(btn.getAttribute("data-admin-toggle-device"));
          await renderAll();
        };
      });
    }

    if (adminDeviceLogs) {
      const logs = safeArr(data.state?.deviceLogs).slice(0, 10);
      adminDeviceLogs.innerHTML = logs.length
        ? logs.map((l) => `
            <div class="p-2 rounded-xl bg-white/5 border border-white/10 text-xs">
              <div class="text-slate-400">${l.at ? new Date(l.at).toLocaleTimeString() : ""} • ${l.level || "INFO"}</div>
              <div class="text-slate-200 mt-1">${escapeHtml(l.message || "")}</div>
            </div>
          `).join("")
        : `<div class="text-sm text-slate-400">No device events yet.</div>`;
    }
  }

  function renderAds(data) {
    if (!adsPanel) return;

    adsPanel.innerHTML = "";

    if (!data.ads.length) {
      adsPanel.innerHTML = `<div class="text-sm text-slate-400">No ads loaded.</div>`;
      return;
    }

    for (const ad of data.ads) {
      const count = Number(data.adMetrics?.impressions?.[ad.id] || 0);
      const rest = ad.restaurantId
        ? (data.restaurants.find((r) => r.id === ad.restaurantId)?.name || ad.restaurantId)
        : "All";

      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-white/5 border border-white/10";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold truncate">${ad.title || "Ad"}</div>
            <div class="text-xs text-slate-400 mt-1">${rest} • ${ad.enabled ? "Enabled" : "Disabled"}</div>
            <div class="text-xs text-slate-300 mt-2">Impressions: <span class="pill">${count}</span></div>
          </div>
          <button class="${ad.enabled ? "btn-ghost" : "btn-primary"} text-xs px-3 py-2" data-toggle>
            ${ad.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      `;

      const btn = div.querySelector("[data-toggle]");
      if (btn) {
        btn.onclick = async () => {
          const st = getStateSafe();
          st.ads = safeArr(st.ads);

          const i = st.ads.findIndex((x) => x.id === ad.id);
          if (i === -1) return;

          st.ads[i].enabled = !st.ads[i].enabled;
          saveStateSafe(st);
          logSafe(`Ad ${ad.id} enabled=${st.ads[i].enabled}`);
          await renderAll();
        };
      }

      adsPanel.appendChild(div);
    }
  }

  function renderLogs(data) {
    if (!logPanel) return;

    logPanel.innerHTML = "";

    const logs = safeArr(data.logs);
    if (!logs.length) {
      logPanel.innerHTML = `<div class="text-sm text-slate-400">No log entries yet.</div>`;
      return;
    }

    logs.forEach((l) => {
      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300";
      div.innerHTML = `
        <div class="text-slate-400">${new Date(l.at || Date.now()).toLocaleTimeString()}</div>
        <div class="mt-1">${l.message || ""}</div>
      `;
      logPanel.appendChild(div);
    });
  }

  // ---------- Professional Admin Excel Report ----------
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

  function reportNumber(value) {
    const n = Number(value || 0);
    return `Rs ${Number.isFinite(n) ? n.toLocaleString("en-PK", { maximumFractionDigits: 0 }) : "0"}`;
  }

  function paidReportStatus(status) {
    return ["paid", "preparing", "ready", "completed"].includes(status);
  }

  function prepMinutes(order) {
    const start = validDate(order.approvedAt || order.createdAt);
    const end = validDate(order.readyAt || order.completedAt || order.paidAt);

    if (!start || !end) return "";

    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return minutes >= 0 ? minutes : "";
  }

  function itemsSummary(order) {
    return safeArr(order.items)
      .map((it) => `${it.name || "Item"} x${Number(it.qty || 0)}`)
      .join(" | ");
  }

  function totalDishQty(order) {
    return safeArr(order.items).reduce((sum, it) => sum + Number(it.qty || 0), 0);
  }

  function uniqueDishCount(order) {
    return new Set(safeArr(order.items).map((it) => it.name || it.itemId || "Item")).size;
  }

  function safeSheetName(name) {
    return String(name || "Sheet")
      .replace(/[\\/?*\[\]:]/g, " ")
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

  function restaurantNameById(restaurants, restaurantId) {
    return safeArr(restaurants).find((r) => r.id === restaurantId)?.name || restaurantId || "Unknown";
  }

  function buildRestaurantReportRows(restaurants, orders) {
    const rows = [
      [
        "Restaurant",
        "Online",
        "Total Orders",
        "Paid / Active Orders",
        "Dine In",
        "Takeaway",
        "Not Marked",
        "Subtotal",
        "Tax",
        "Revenue",
        "Best Seller"
      ]
    ];

    safeArr(restaurants).forEach((r) => {
      const restOrders = safeArr(orders).filter((o) => o.restaurantId === r.id);
      const paid = restOrders.filter((o) => paidReportStatus(o.status));

      const itemCounts = {};
      paid.forEach((o) => {
        safeArr(o.items).forEach((it) => {
          const name = it.name || "Unknown";
          itemCounts[name] = (itemCounts[name] || 0) + Number(it.qty || 0);
        });
      });

      const bestSeller =
        Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      rows.push([
        r.name || r.id,
        r.online ? "Online" : "Offline",
        restOrders.length,
        paid.length,
        paid.filter((o) => o.serviceType === "dine_in").length,
        paid.filter((o) => o.serviceType === "takeaway").length,
        paid.filter((o) => !o.serviceType).length,
        reportNumber(paid.reduce((sum, o) => sum + Number(o.subtotal || 0), 0)),
        reportNumber(paid.reduce((sum, o) => sum + Number(o.tax || 0), 0)),
        reportNumber(paid.reduce((sum, o) => sum + Number(o.total || 0), 0)),
        bestSeller
      ]);
    });

    return rows;
  }

  function buildItemSummaryRows(restaurants, orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      safeArr(order.items).forEach((item) => {
        const name = item.name || "Unknown";
        const restaurantName = restaurantNameById(restaurants, order.restaurantId);
        const key = `${restaurantName}__${name}`;
        const qty = Number(item.qty || 0);
        const unitPrice = Number(item.price || 0);
        const lineTotal = qty * unitPrice;

        if (!stats[key]) {
          stats[key] = {
            restaurant: restaurantName,
            item: name,
            total_qty: 0,
            total_sales: 0,
            order_lines: 0
          };
        }

        stats[key].total_qty += qty;
        stats[key].total_sales += lineTotal;
        stats[key].order_lines += 1;
      });
    });

    const rows = [
      ["Restaurant", "Item", "Total Qty Sold", "Total Sales", "Order Lines"]
    ];

    Object.values(stats)
      .sort((a, b) => b.total_sales - a.total_sales)
      .forEach((it) => {
        rows.push([
          it.restaurant,
          it.item,
          it.total_qty,
          reportNumber(it.total_sales),
          it.order_lines
        ]);
      });

    return rows;
  }

  function buildOrderRows(restaurants, orders) {
    const rows = [
      [
        "Order ID",
        "Restaurant",
        "Status",
        "Service Type",
        "Table Number",
        "Order Type",
        "Order Date",
        "Order Placed",
        "Approved At",
        "Paid At",
        "Prep Time (min)",
        "Subtotal",
        "Tax",
        "Total",
        "Items Summary",
        "Total Dish Qty",
        "Unique Dishes"
      ]
    ];

    safeArr(orders).forEach((o) => {
      rows.push([
        o.id,
        restaurantNameById(restaurants, o.restaurantId),
        o.status || "",
        serviceTypeLabel(o),
        tableNumberOf(o),
        serviceSummary(o),
        dateOnly(o.createdAt),
        timeOnly(o.createdAt),
        timeOnly(o.approvedAt),
        timeOnly(o.paidAt),
        prepMinutes(o),
        reportNumber(o.subtotal),
        reportNumber(o.tax),
        reportNumber(o.total),
        itemsSummary(o),
        totalDishQty(o),
        uniqueDishCount(o)
      ]);
    });

    return rows;
  }

  function buildOrderLineRows(restaurants, orders) {
    const rows = [
      [
        "Order ID",
        "Restaurant",
        "Status",
        "Service Type",
        "Table Number",
        "Order Type",
        "Order Date",
        "Placed At",
        "Paid At",
        "Dish",
        "Qty",
        "Unit Price",
        "Line Total"
      ]
    ];

    safeArr(orders).forEach((o) => {
      safeArr(o.items).forEach((it) => {
        const qty = Number(it.qty || 0);
        const unitPrice = Number(it.price || 0);

        rows.push([
          o.id,
          restaurantNameById(restaurants, o.restaurantId),
          o.status || "",
          serviceTypeLabel(o),
          tableNumberOf(o),
          serviceSummary(o),
          dateOnly(o.createdAt),
          timeOnly(o.createdAt),
          timeOnly(o.paidAt),
          it.name || "Item",
          qty,
          reportNumber(unitPrice),
          reportNumber(qty * unitPrice)
        ]);
      });
    });

    return rows;
  }

  function buildAdRows(data) {
    const rows = [
      ["Ad ID", "Title", "Restaurant", "Enabled", "Impressions"]
    ];

    const impressions = safeObj(data.adMetrics?.impressions);

    safeArr(data.ads).forEach((ad) => {
      rows.push([
        ad.id || "",
        ad.title || "",
        ad.restaurantId
          ? restaurantNameById(data.restaurants, ad.restaurantId)
          : "All Restaurants",
        ad.enabled ? "Yes" : "No",
        Number(impressions[ad.id] || 0)
      ]);
    });

    return rows;
  }

  function buildLogRows(data) {
    const rows = [
      ["Time", "Message"]
    ];

    safeArr(data.logs).forEach((log) => {
      rows.push([
        log.at ? new Date(log.at).toLocaleString() : "",
        log.message || ""
      ]);
    });

    return rows;
  }

  function exportAdminReport(data) {
    if (typeof XLSX === "undefined") {
      alert("XLSX library is not loaded.");
      return false;
    }

    const now = new Date();
    const monthOrders = safeArr(data.orders).filter((o) => isSameMonth(o.createdAt, now));
    const paidOrders = monthOrders.filter((o) => paidReportStatus(o.status));

    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalSubtotal = paidOrders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
    const totalTax = paidOrders.reduce((sum, o) => sum + Number(o.tax || 0), 0);

    const dineInCount = paidOrders.filter((o) => o.serviceType === "dine_in").length;
    const takeawayCount = paidOrders.filter((o) => o.serviceType === "takeaway").length;
    const notMarkedCount = paidOrders.filter((o) => !o.serviceType).length;

    const itemSummaryRows = buildItemSummaryRows(data.restaurants, paidOrders);
    const bestSeller = itemSummaryRows[1]?.[1] || "—";

    const summaryRows = [
      ["Food Court Admin Monthly Report"],
      [`Month: ${monthTitle(now)}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ["Executive Summary"],
      ["Total Restaurants", safeArr(data.restaurants).length],
      ["Total Orders This Month", monthOrders.length],
      ["Paid / Active Orders", paidOrders.length],
      ["Total Subtotal", reportNumber(totalSubtotal)],
      ["Total Tax", reportNumber(totalTax)],
      ["Total Revenue", reportNumber(totalRevenue)],
      ["Dine In Orders", dineInCount],
      ["Takeaway Orders", takeawayCount],
      ["Not Marked Orders", notMarkedCount],
      ["Best Seller", bestSeller],
      [],
      ["Restaurant Ranking"],
      ["Restaurant", "Revenue", "Paid Orders", "Dine In", "Takeaway"]
    ];

    const ranking = safeArr(data.restaurants).map((r) => {
      const restPaid = paidOrders.filter((o) => o.restaurantId === r.id);
      return {
        restaurant: r.name || r.id,
        revenue: restPaid.reduce((sum, o) => sum + Number(o.total || 0), 0),
        orders: restPaid.length,
        dine_in: restPaid.filter((o) => o.serviceType === "dine_in").length,
        takeaway: restPaid.filter((o) => o.serviceType === "takeaway").length
      };
    }).sort((a, b) => b.revenue - a.revenue);

    ranking.forEach((r) => {
      summaryRows.push([
        r.restaurant,
        reportNumber(r.revenue),
        r.orders,
        r.dine_in,
        r.takeaway
      ]);
    });

    const restaurantRows = buildRestaurantReportRows(data.restaurants, monthOrders);
    const orderRows = buildOrderRows(data.restaurants, monthOrders);
    const orderLineRows = buildOrderLineRows(data.restaurants, monthOrders);
    const adRows = buildAdRows(data);
    const logRows = buildLogRows(data);

    const wb = XLSX.utils.book_new();

    const summarySheet = createSheet(
      summaryRows,
      [28, 18, 18, 16, 16, 16, 16, 16, 16, 16],
      ranking.length ? `A18:E${17 + ranking.length}` : undefined
    );
    addMerge(summarySheet, 0, 0, 0, 9);
    addMerge(summarySheet, 1, 0, 1, 9);
    addMerge(summarySheet, 2, 0, 2, 9);

    const restaurantSheet = createSheet(
      restaurantRows,
      [22, 12, 14, 18, 12, 12, 12, 14, 14, 14, 28],
      `A1:K${restaurantRows.length}`
    );

    const ordersSheet = createSheet(
      orderRows,
      [22, 20, 16, 15, 14, 22, 14, 14, 14, 14, 16, 12, 12, 12, 50, 14, 14],
      `A1:Q${orderRows.length}`
    );

    const orderLinesSheet = createSheet(
      orderLineRows,
      [22, 20, 16, 15, 14, 22, 14, 14, 14, 28, 8, 12, 12],
      `A1:M${orderLineRows.length}`
    );

    const itemSheet = createSheet(
      itemSummaryRows,
      [20, 28, 14, 14, 14],
      `A1:E${itemSummaryRows.length}`
    );

    const adSheet = createSheet(
      adRows,
      [16, 30, 22, 12, 14],
      `A1:E${adRows.length}`
    );

    const logSheet = createSheet(
      logRows,
      [24, 80],
      `A1:B${logRows.length}`
    );

    XLSX.utils.book_append_sheet(wb, summarySheet, "Executive Summary");
    XLSX.utils.book_append_sheet(wb, restaurantSheet, "Restaurant Summary");
    XLSX.utils.book_append_sheet(wb, ordersSheet, "All Orders");
    XLSX.utils.book_append_sheet(wb, orderLinesSheet, "Order Lines");
    XLSX.utils.book_append_sheet(wb, itemSheet, "Item Summary");
    XLSX.utils.book_append_sheet(wb, adSheet, "Ad Metrics");
    XLSX.utils.book_append_sheet(wb, logSheet, "System Logs");

    XLSX.writeFile(wb, `FoodCourt_Admin_Monthly_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    return true;
  }

  // ---------- Upgraded Admin Excel Report v2: payment, cash/online, dine-in/takeaway, add-ons ----------
  function advNormalizePaymentMethod(value) {
    const v = String(value || "").trim().toLowerCase();

    if (v === "cash" || v === "cod" || v === "counter" || v.includes("cash")) return "cash";
    if (v === "online" || v === "stripe" || v === "card" || v === "qr" || v.includes("stripe")) return "online";

    return "online";
  }

  function advPaymentMethodOf(order) {
    const payment = safeObj(order?.payment);
    return advNormalizePaymentMethod(
      order?.paymentMethod ||
      order?.payment_method ||
      payment.paymentMethod ||
      payment.method ||
      payment.provider ||
      "online"
    );
  }

  function advPaymentMethodLabel(order) {
    const method = advPaymentMethodOf(order);
    if (method === "cash") return "Cash";
    if (method === "online") return "Online / Stripe";
    return "Not selected";
  }

  function advPaymentStatusLabel(order) {
    const status = String(order?.status || "").toLowerCase();
    const payment = safeObj(order?.payment);
    const method = advPaymentMethodOf(order);

    if (payment.success || paidReportStatus(status)) return "Paid";
    if (status === "awaiting_payment") return method === "cash" ? "Cash Pending" : "Online Pending";
    if (status === "pending_approval") return "Pending Approval";
    if (status === "approved") return "Approved - Payment Pending";
    if (status === "rejected") return "Rejected";
    if (status === "timed_out") return "Timed Out / Abandoned";

    return status || "Unknown";
  }

  function advItemBaseName(item) {
    const raw = String(item?.originalName || item?.baseName || item?.name || "Item").trim();
    return raw.replace(/\s*\(\+\s*[^)]+\)\s*$/i, "").trim() || raw;
  }

  function advAddonListFromItem(item) {
    const explicit = safeArr(item?.addons || item?.selectedAddons || item?.selected_addons || item?.options)
      .map((addon) => {
        const a = safeObj(addon);
        const name = String(a.name || a.title || a.label || "").trim();
        if (!name) return null;
        return {
          name,
          price: Number(a.price || 0),
          qty: Math.max(1, Number(a.qty || a.quantity || 1))
        };
      })
      .filter(Boolean);

    if (explicit.length) return explicit;

    const name = String(item?.name || "");
    const match = name.match(/\(\+\s*([^)]+)\)/i);
    if (!match) return [];

    return match[1]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((name) => ({ name, price: 0, qty: 1 }));
  }

  function advItemAddonSummary(item) {
    const addons = advAddonListFromItem(item);
    if (!addons.length) return "";

    return addons
      .map((addon) => {
        const qty = Number(addon.qty || 1);
        const price = Number(addon.price || 0);
        const qtyText = qty > 1 ? ` x${qty}` : "";
        const priceText = price > 0 ? ` (${reportNumber(price)})` : "";
        return `${addon.name}${qtyText}${priceText}`;
      })
      .join(", ");
  }

  function advOrderAddonSummary(order) {
    const rows = [];

    safeArr(order?.items).forEach((item) => {
      const addText = advItemAddonSummary(item);
      if (addText) rows.push(`${advItemBaseName(item)}: ${addText}`);
    });

    return rows.join(" | ");
  }

  function advItemsSummary(order) {
    return safeArr(order?.items)
      .map((it) => {
        const qty = Number(it.qty || 0);
        const addText = advItemAddonSummary(it);
        return `${advItemBaseName(it)}${addText ? ` (+ ${addText})` : ""} x${qty}`;
      })
      .join(" | ");
  }

  function advBuildPaymentSummaryRows(orders) {
    const groups = {
      cash: { method: "Cash", orders: 0, subtotal: 0, tax: 0, revenue: 0 },
      online: { method: "Online / Stripe", orders: 0, subtotal: 0, tax: 0, revenue: 0 }
    };

    safeArr(orders).forEach((order) => {
      const key = advPaymentMethodOf(order) === "cash" ? "cash" : "online";
      groups[key].orders += 1;
      groups[key].subtotal += Number(order.subtotal || 0);
      groups[key].tax += Number(order.tax || 0);
      groups[key].revenue += Number(order.total || 0);
    });

    const rows = [["Payment Method", "Orders", "Subtotal", "Tax", "Revenue"]];
    Object.values(groups).forEach((g) => {
      rows.push([g.method, g.orders, reportNumber(g.subtotal), reportNumber(g.tax), reportNumber(g.revenue)]);
    });

    return rows;
  }

  function advBuildStatusSummaryRows(orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      const status = String(order.status || "unknown");
      if (!stats[status]) {
        stats[status] = { status, orders: 0, revenue: 0 };
      }

      stats[status].orders += 1;
      stats[status].revenue += Number(order.total || 0);
    });

    const rows = [["Status", "Orders", "Total Amount"]];
    Object.values(stats)
      .sort((a, b) => b.orders - a.orders)
      .forEach((s) => rows.push([s.status, s.orders, reportNumber(s.revenue)]));

    return rows;
  }

  function advBuildDailyRows(orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      const day = dateOnly(order.createdAt);
      if (!day) return;

      if (!stats[day]) {
        stats[day] = {
          date: day,
          orders: 0,
          paid: 0,
          cash: 0,
          online: 0,
          dine_in: 0,
          takeaway: 0,
          rejected: 0,
          timed_out: 0,
          tax: 0,
          revenue: 0
        };
      }

      const s = stats[day];
      const status = String(order.status || "").toLowerCase();
      s.orders += 1;
      if (paidReportStatus(order.status)) s.paid += 1;
      if (advPaymentMethodOf(order) === "cash") s.cash += 1;
      else s.online += 1;
      if (order.serviceType === "dine_in") s.dine_in += 1;
      if (order.serviceType === "takeaway") s.takeaway += 1;
      if (status === "rejected") s.rejected += 1;
      if (status === "timed_out") s.timed_out += 1;
      if (paidReportStatus(order.status)) {
        s.tax += Number(order.tax || 0);
        s.revenue += Number(order.total || 0);
      }
    });

    const rows = [["Date", "Orders", "Paid / Active", "Cash", "Online", "Dine In", "Takeaway", "Rejected", "Timed Out / Abandoned", "Tax", "Revenue"]];
    Object.values(stats)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach((d) => {
        rows.push([
          d.date,
          d.orders,
          d.paid,
          d.cash,
          d.online,
          d.dine_in,
          d.takeaway,
          d.rejected,
          d.timed_out,
          reportNumber(d.tax),
          reportNumber(d.revenue)
        ]);
      });

    return rows;
  }

  function advBuildAddonRows(restaurants, orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      const restaurant = restaurantNameById(restaurants, order.restaurantId);

      safeArr(order.items).forEach((item) => {
        const addons = advAddonListFromItem(item);
        if (!addons.length) return;

        addons.forEach((addon) => {
          const key = `${restaurant}__${addon.name}`;
          const itemQty = Number(item.qty || 0);
          const addonQty = Number(addon.qty || 1) * itemQty;
          const relatedSales = Number(item.price || 0) * itemQty;

          if (!stats[key]) {
            stats[key] = {
              restaurant,
              addon: addon.name,
              addon_qty: 0,
              order_lines: 0,
              related_sales: 0
            };
          }

          stats[key].addon_qty += addonQty;
          stats[key].order_lines += 1;
          stats[key].related_sales += relatedSales;
        });
      });
    });

    const rows = [["Restaurant", "Add-on", "Addon Qty", "Order Lines", "Related Item Sales"]];
    Object.values(stats)
      .sort((a, b) => b.addon_qty - a.addon_qty)
      .forEach((x) => {
        rows.push([
          x.restaurant,
          x.addon,
          x.addon_qty,
          x.order_lines,
          reportNumber(x.related_sales)
        ]);
      });

    return rows;
  }

  function advBuildRestaurantRows(restaurants, orders) {
    const rows = [[
      "Restaurant",
      "Online",
      "Total Orders",
      "Paid / Active Orders",
      "Cash Orders",
      "Online Orders",
      "Dine In",
      "Takeaway",
      "Not Marked",
      "Subtotal",
      "Tax",
      "Revenue",
      "Best Seller"
    ]];

    safeArr(restaurants).forEach((r) => {
      const restOrders = safeArr(orders).filter((o) => o.restaurantId === r.id);
      const paid = restOrders.filter((o) => paidReportStatus(o.status));

      const itemCounts = {};
      paid.forEach((o) => {
        safeArr(o.items).forEach((it) => {
          const name = advItemBaseName(it) || "Unknown";
          itemCounts[name] = (itemCounts[name] || 0) + Number(it.qty || 0);
        });
      });

      const bestSeller = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      rows.push([
        r.name || r.id,
        r.online ? "Online" : "Offline",
        restOrders.length,
        paid.length,
        paid.filter((o) => advPaymentMethodOf(o) === "cash").length,
        paid.filter((o) => advPaymentMethodOf(o) !== "cash").length,
        paid.filter((o) => o.serviceType === "dine_in").length,
        paid.filter((o) => o.serviceType === "takeaway").length,
        paid.filter((o) => !o.serviceType).length,
        reportNumber(paid.reduce((sum, o) => sum + Number(o.subtotal || 0), 0)),
        reportNumber(paid.reduce((sum, o) => sum + Number(o.tax || 0), 0)),
        reportNumber(paid.reduce((sum, o) => sum + Number(o.total || 0), 0)),
        bestSeller
      ]);
    });

    return rows;
  }

  function advBuildItemRows(restaurants, orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      safeArr(order.items).forEach((item) => {
        const restaurant = restaurantNameById(restaurants, order.restaurantId);
        const itemName = advItemBaseName(item);
        const key = `${restaurant}__${itemName}`;
        const qty = Number(item.qty || 0);
        const unitPrice = Number(item.price || 0);
        const lineTotal = qty * unitPrice;

        if (!stats[key]) {
          stats[key] = {
            restaurant,
            item: itemName,
            total_qty: 0,
            total_sales: 0,
            order_lines: 0
          };
        }

        stats[key].total_qty += qty;
        stats[key].total_sales += lineTotal;
        stats[key].order_lines += 1;
      });
    });

    const rows = [["Restaurant", "Item", "Total Qty Sold", "Total Sales", "Order Lines"]];
    Object.values(stats)
      .sort((a, b) => b.total_sales - a.total_sales)
      .forEach((it) => rows.push([it.restaurant, it.item, it.total_qty, reportNumber(it.total_sales), it.order_lines]));

    return rows;
  }

  function advBuildOrderRows(restaurants, orders) {
    const rows = [[
      "Order ID",
      "Restaurant",
      "Status",
      "Payment Method",
      "Payment Status",
      "Approval Mode",
      "Approval Requested At",
      "Approval Responded At",
      "Rejection Reason",
      "Timeout / Abandoned Reason",
      "Timed Out At",
      "Service Type",
      "Table Number",
      "Order Type",
      "Order Date",
      "Order Placed",
      "Approved At",
      "Paid At",
      "Prep Time (min)",
      "Subtotal",
      "Tax",
      "Total",
      "Items Summary",
      "Add-ons Summary",
      "Total Dish Qty",
      "Unique Dishes"
    ]];

    safeArr(orders).forEach((o) => {
      rows.push([
        o.id,
        restaurantNameById(restaurants, o.restaurantId),
        o.status || "",
        advPaymentMethodLabel(o),
        advPaymentStatusLabel(o),
        approvalModeText(o),
        timeOnly(o.approvalRequestedAt || o.createdAt),
        timeOnly(o.approvalRespondedAt || o.rejectedAt || o.approvedAt),
        o.rejectReason || "",
        o.timeoutReason || "",
        timeOnly(o.timedOutAt),
        serviceTypeLabel(o),
        tableNumberOf(o),
        serviceSummary(o),
        dateOnly(o.createdAt),
        timeOnly(o.createdAt),
        timeOnly(o.approvedAt),
        timeOnly(o.paidAt),
        prepMinutes(o),
        reportNumber(o.subtotal),
        reportNumber(o.tax),
        reportNumber(o.total),
        advItemsSummary(o),
        advOrderAddonSummary(o),
        totalDishQty(o),
        uniqueDishCount(o)
      ]);
    });

    return rows;
  }

  function advBuildOrderLineRows(restaurants, orders) {
    const rows = [[
      "Order ID",
      "Restaurant",
      "Status",
      "Payment Method",
      "Payment Status",
      "Approval Mode",
      "Rejection Reason",
      "Timeout / Abandoned Reason",
      "Service Type",
      "Table Number",
      "Order Type",
      "Order Date",
      "Placed At",
      "Paid At",
      "Base Dish",
      "Dish Display Name",
      "Add-ons",
      "Qty",
      "Unit Price",
      "Line Total"
    ]];

    safeArr(orders).forEach((o) => {
      safeArr(o.items).forEach((it) => {
        const qty = Number(it.qty || 0);
        const unitPrice = Number(it.price || 0);

        rows.push([
          o.id,
          restaurantNameById(restaurants, o.restaurantId),
          o.status || "",
          advPaymentMethodLabel(o),
          advPaymentStatusLabel(o),
          approvalModeText(o),
          o.rejectReason || "",
          o.timeoutReason || "",
          serviceTypeLabel(o),
          tableNumberOf(o),
          serviceSummary(o),
          dateOnly(o.createdAt),
          timeOnly(o.createdAt),
          timeOnly(o.paidAt),
          advItemBaseName(it),
          it.name || "Item",
          advItemAddonSummary(it),
          qty,
          reportNumber(unitPrice),
          reportNumber(qty * unitPrice)
        ]);
      });
    });

    return rows;
  }

  function exportAdminReport(data) {
    if (typeof XLSX === "undefined") {
      alert("XLSX library is not loaded.");
      return false;
    }

    const now = new Date();
    const monthOrders = safeArr(data.orders).filter((o) => isSameMonth(o.createdAt, now));
    const paidOrders = monthOrders.filter((o) => paidReportStatus(o.status));

    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalSubtotal = paidOrders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
    const totalTax = paidOrders.reduce((sum, o) => sum + Number(o.tax || 0), 0);

    const cashOrders = paidOrders.filter((o) => advPaymentMethodOf(o) === "cash");
    const onlineOrders = paidOrders.filter((o) => advPaymentMethodOf(o) !== "cash");
    const rejectedOrders = monthOrders.filter((o) => String(o.status || "").toLowerCase() === "rejected");
    const timedOutOrders = monthOrders.filter((o) => String(o.status || "").toLowerCase() === "timed_out");
    const dineInCount = paidOrders.filter((o) => o.serviceType === "dine_in").length;
    const takeawayCount = paidOrders.filter((o) => o.serviceType === "takeaway").length;
    const notMarkedCount = paidOrders.filter((o) => !o.serviceType).length;

    const itemRowsForBest = advBuildItemRows(data.restaurants, paidOrders);
    const bestSeller = itemRowsForBest[1]?.[1] || "—";

    const summaryRows = [
      ["Food Court Admin Monthly Report"],
      [`Month: ${monthTitle(now)}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ["Executive Summary"],
      ["Total Restaurants", safeArr(data.restaurants).length],
      ["Total Orders This Month", monthOrders.length],
      ["Paid / Active Orders", paidOrders.length],
      ["Cash Orders", cashOrders.length],
      ["Online Orders", onlineOrders.length],
      ["Rejected Orders", rejectedOrders.length],
      ["Timed Out / Abandoned Orders", timedOutOrders.length],
      ["Total Subtotal", reportNumber(totalSubtotal)],
      ["Total Tax", reportNumber(totalTax)],
      ["Total Revenue", reportNumber(totalRevenue)],
      ["Cash Revenue", reportNumber(cashOrders.reduce((sum, o) => sum + Number(o.total || 0), 0))],
      ["Online Revenue", reportNumber(onlineOrders.reduce((sum, o) => sum + Number(o.total || 0), 0))],
      ["Dine In Orders", dineInCount],
      ["Takeaway Orders", takeawayCount],
      ["Not Marked Orders", notMarkedCount],
      ["Best Seller", bestSeller],
      [],
      ["Restaurant Ranking"],
      ["Restaurant", "Revenue", "Paid Orders", "Cash", "Online", "Dine In", "Takeaway"]
    ];

    const ranking = safeArr(data.restaurants).map((r) => {
      const restPaid = paidOrders.filter((o) => o.restaurantId === r.id);
      return {
        restaurant: r.name || r.id,
        revenue: restPaid.reduce((sum, o) => sum + Number(o.total || 0), 0),
        orders: restPaid.length,
        cash: restPaid.filter((o) => advPaymentMethodOf(o) === "cash").length,
        online: restPaid.filter((o) => advPaymentMethodOf(o) !== "cash").length,
        dine_in: restPaid.filter((o) => o.serviceType === "dine_in").length,
        takeaway: restPaid.filter((o) => o.serviceType === "takeaway").length
      };
    }).sort((a, b) => b.revenue - a.revenue);

    ranking.forEach((r) => {
      summaryRows.push([
        r.restaurant,
        reportNumber(r.revenue),
        r.orders,
        r.cash,
        r.online,
        r.dine_in,
        r.takeaway
      ]);
    });

    const wb = XLSX.utils.book_new();

    const summarySheet = createSheet(summaryRows, [28, 18, 18, 14, 14, 14, 14, 14, 14, 14], ranking.length ? `A22:G${21 + ranking.length}` : undefined);
    addMerge(summarySheet, 0, 0, 0, 9);
    addMerge(summarySheet, 1, 0, 1, 9);
    addMerge(summarySheet, 2, 0, 2, 9);

    const dailyRows = advBuildDailyRows(monthOrders);
    const restaurantRows = advBuildRestaurantRows(data.restaurants, monthOrders);
    const orderRows = advBuildOrderRows(data.restaurants, monthOrders);
    const orderLineRows = advBuildOrderLineRows(data.restaurants, monthOrders);
    const itemRows = advBuildItemRows(data.restaurants, paidOrders);
    const addonRows = advBuildAddonRows(data.restaurants, paidOrders);
    const paymentRows = advBuildPaymentSummaryRows(paidOrders);
    const statusRows = advBuildStatusSummaryRows(monthOrders);
    const adRows = buildAdRows(data);
    const logRows = buildLogRows(data);

    XLSX.utils.book_append_sheet(wb, summarySheet, "Executive Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(dailyRows, [14, 10, 14, 10, 10, 10, 10, 12, 18, 12, 14], `A1:K${dailyRows.length}`), "Daily Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(restaurantRows, [24, 12, 14, 18, 12, 12, 10, 10, 12, 14, 14, 14, 30], `A1:M${restaurantRows.length}`), "Restaurant Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(orderRows, [22, 20, 16, 16, 18, 18, 18, 18, 32, 36, 18, 15, 14, 22, 14, 14, 14, 14, 16, 12, 12, 12, 55, 45, 14, 14], `A1:Z${orderRows.length}`), "All Orders");
    XLSX.utils.book_append_sheet(wb, createSheet(orderLineRows, [22, 20, 16, 16, 18, 18, 30, 36, 15, 14, 22, 14, 14, 14, 28, 34, 35, 8, 12, 12], `A1:T${orderLineRows.length}`), "Order Lines");
    XLSX.utils.book_append_sheet(wb, createSheet(itemRows, [20, 30, 14, 14, 14], `A1:E${itemRows.length}`), "Item Sales");
    XLSX.utils.book_append_sheet(wb, createSheet(addonRows, [20, 28, 14, 14, 18], `A1:E${addonRows.length}`), "Add-ons Sales");
    XLSX.utils.book_append_sheet(wb, createSheet(paymentRows, [20, 12, 14, 14, 14], `A1:E${paymentRows.length}`), "Payment Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(statusRows, [20, 12, 14], `A1:C${statusRows.length}`), "Status Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(adRows, [16, 30, 22, 12, 14], `A1:E${adRows.length}`), "Ad Metrics");
    XLSX.utils.book_append_sheet(wb, createSheet(logRows, [24, 80], `A1:B${logRows.length}`), "System Logs");

    XLSX.writeFile(wb, `FoodCourt_Admin_Monthly_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    return true;
  }

  async function exportAll() {
    const data = await getDashboardData();

    try {
      exportAdminReport(data);
      logSafe("Admin monthly report exported (XLSX download).");
    } catch (err) {
      console.error("admin.js: export failed", err);
      logSafe("Admin XLSX export failed. Check console.");
      alert("Export failed. Check console for details.");
    }
  }

  async function renderAll() {
    if (!loggedIn) return;

    if (isRendering) {
      rerenderRequested = true;
      return;
    }

    isRendering = true;

    try {
      const data = await getDashboardData();
      renderMetrics(data);
      await renderRestaurants(data);
      renderAnalytics(data);
      renderCashCounter(data);
      renderHardwareConsole(data);
      renderAds(data);
      renderLogs(data);
    } catch (err) {
      console.error("admin.js renderAll failed", err);
      if (logPanel) {
        logPanel.innerHTML = `
          <div class="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-200">
            Admin panel render failed. Check console for details.
          </div>
        `;
      }
    } finally {
      isRendering = false;

      if (rerenderRequested) {
        rerenderRequested = false;
        renderAll();
      }
    }
  }

  if (exportAllBtn) {
    exportAllBtn.onclick = async () => {
      await exportAll();
    };
  }

  if (resetAdsBtn) {
    resetAdsBtn.onclick = async () => {
      try {
        if (typeof FC.resetAdMetrics === "function") {
          FC.resetAdMetrics();
        } else {
          const st = getStateSafe();
          st.adMetrics = { impressions: {}, totalSeconds: 0 };
          saveStateSafe(st);
          logSafe("Ad metrics reset.");
        }
      } catch (err) {
        console.error("admin.js: reset ads failed", err);
      }

      await renderAll();
    };
  }


  if (adminSimulateLatencyBtn) {
    adminSimulateLatencyBtn.onclick = async () => {
      try {
        const ms = Math.floor(Math.random() * 320) + 30;
        adminSetDevice("network", { online: true, latencyMs: ms, lastManualCheckAt: nowISO() }, `Network latency simulated at ${ms}ms.`);
        if (ms > 150) adminDeviceLog("Latency spike detected from admin console.", "WARN");
      } catch (err) {
        console.error("admin.js: simulate latency failed", err);
      }
      await renderAll();
    };
  }

  if (adminTestPrintBtn) {
    adminTestPrintBtn.onclick = async () => {
      try {
        const d = adminGetDevices();
        if (!d.printer?.online) {
          adminDeviceLog("Test print blocked because printer is OFF.", "WARN");
          alert("Printer is OFF. Turn ON the printer from Hardware Console before test print.");
          await renderAll();
          return;
        }

        adminDeviceLog("Admin test print allowed. Paper percentage reduced by 1%.", "INFO");
        adminConsumePrinterPaper(HARDWARE_PRINT_PAPER_STEP, "Test print paper usage");
      } catch (err) {
        console.error("admin.js: test print failed", err);
      }
      await renderAll();
    };
  }

  if (adminConsumePaperBtn) {
    adminConsumePaperBtn.onclick = async () => {
      try {
        adminConsumePrinterPaper(HARDWARE_PRINT_PAPER_STEP, "One receipt simulated from admin console");
      } catch (err) {
        console.error("admin.js: consume paper failed", err);
      }
      await renderAll();
    };
  }

  if (adminGatewaySuccessBtn) {
    adminGatewaySuccessBtn.onclick = async () => {
      try {
        adminSetDevice("paymentGateway", { online: true, provider: "Stripe / Cash Counter", lastVerifyAt: nowISO(), lastResult: "success" }, "Payment gateway marked SUCCESS and turned ON.");
      } catch (err) {
        console.error("admin.js: gateway success failed", err);
      }
      await renderAll();
    };
  }

  if (adminGatewayFailBtn) {
    adminGatewayFailBtn.onclick = async () => {
      try {
        adminSetDevice("paymentGateway", { online: false, provider: "Stripe / Cash Counter", lastVerifyAt: nowISO(), lastResult: "failed" }, "Payment gateway failure simulated. Online payment turned OFF.");
      } catch (err) {
        console.error("admin.js: gateway failure failed", err);
      }
      await renderAll();
    };
  }

  if (adminLockKioskBtn) {
    adminLockKioskBtn.onclick = async () => {
      const d = adminGetDevices();
      adminSetDevice("kioskDisplay", { locked: !d.kioskDisplay?.locked, updatedAt: nowISO() }, `Kiosk ${!d.kioskDisplay?.locked ? "locked" : "unlocked"} from admin console.`);
      await renderAll();
    };
  }

  if (adminClearDeviceLogsBtn) {
    adminClearDeviceLogsBtn.onclick = async () => {
      const st = getStateSafe();
      st.deviceLogs = [];
      saveStateSafe(st);
      await renderAll();
    };
  }

  if (adminNetworkOnlineBtn) {
    adminNetworkOnlineBtn.onclick = async () => {
      adminSetDevice("network", { online: true, manuallyControlled: true, latencyMs: 42, lastManualCheckAt: nowISO() }, "Network manually turned ON from admin console.");
      await renderAll();
    };
  }

  if (adminNetworkOfflineBtn) {
    adminNetworkOfflineBtn.onclick = async () => {
      adminSetDevice("network", { online: false, manuallyControlled: true, latencyMs: 0, lastManualCheckAt: nowISO() }, "Network manually turned OFF from admin console.");
      await renderAll();
    };
  }

  if (adminPrinterOnlineBtn) {
    adminPrinterOnlineBtn.onclick = async () => {
      adminSetDeviceOnline("printer", true, "Printer");
      await renderAll();
    };
  }

  if (adminPrinterOfflineBtn) {
    adminPrinterOfflineBtn.onclick = async () => {
      adminSetDeviceOnline("printer", false, "Printer");
      await renderAll();
    };
  }

  if (adminPaperDownBtn) {
    adminPaperDownBtn.onclick = async () => {
      const d = adminGetDevices();
      adminSetPaperPercent(clampPercent(d.printer?.paper ?? d.printer?.paperPercent ?? 100) - 5, "Paper manually decreased");
      await renderAll();
    };
  }

  if (adminPaperUpBtn) {
    adminPaperUpBtn.onclick = async () => {
      const d = adminGetDevices();
      adminSetPaperPercent(clampPercent(d.printer?.paper ?? d.printer?.paperPercent ?? 100) + 5, "Paper manually increased");
      await renderAll();
    };
  }

  if (adminPaperResetBtn) {
    adminPaperResetBtn.onclick = async () => {
      adminSetPaperPercent(100, "New 80m paper roll installed/reset");
      await renderAll();
    };
  }

  if (adminPaymentGatewayOnlineBtn) {
    adminPaymentGatewayOnlineBtn.onclick = async () => {
      adminSetDevice("paymentGateway", { online: true, provider: "Stripe / Cash Counter", lastVerifyAt: nowISO(), lastResult: "manual_on" }, "Payment gateway manually turned ON.");
      await renderAll();
    };
  }

  if (adminPaymentGatewayOfflineBtn) {
    adminPaymentGatewayOfflineBtn.onclick = async () => {
      adminSetDevice("paymentGateway", { online: false, provider: "Stripe / Cash Counter", lastVerifyAt: nowISO(), lastResult: "manual_off" }, "Payment gateway manually turned OFF. Online payments unavailable.");
      await renderAll();
    };
  }

  if (adminKioskDisplayOnlineBtn) {
    adminKioskDisplayOnlineBtn.onclick = async () => {
      adminSetDevice("kioskDisplay", { online: true, maintenanceMode: false, outOfOrder: false, updatedAt: nowISO() }, "Customer kiosk display turned ON.");
      await renderAll();
    };
  }

  if (adminKioskDisplayOfflineBtn) {
    adminKioskDisplayOfflineBtn.onclick = async () => {
      adminSetDevice("kioskDisplay", { online: false, maintenanceMode: true, outOfOrder: true, updatedAt: nowISO() }, "Customer kiosk display turned OFF. Maintenance / Out of Order mode enabled.");
      await renderAll();
    };
  }

  if (scanCashQrBtn) {
    scanCashQrBtn.onclick = async () => {
      await openCashQrScanner();
    };
  }

  if (cashQrCloseBtn) {
    cashQrCloseBtn.onclick = async () => {
      await closeCashQrScanner();
    };
  }

  if (cashQrLoadBtn) {
    cashQrLoadBtn.onclick = async () => {
      await loadCashOrderFromQrText(cashQrManualInput?.value || "");
    };
  }

  if (cashQrManualInput) {
    cashQrManualInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await loadCashOrderFromQrText(cashQrManualInput.value || "");
      }
    });
  }

  if (cashQrScannerModal) {
    cashQrScannerModal.addEventListener("click", async (e) => {
      if (e.target === cashQrScannerModal) await closeCashQrScanner();
    });
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem(sessKey);
      loggedIn = false;
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
      const ok = safeArr(users.admins).find((x) => x.username === u && x.password === p);

      if (!ok) {
        if (loginErr) loginErr.textContent = "Invalid credentials.";
        return;
      }

      loggedIn = true;
      localStorage.setItem(sessKey, JSON.stringify({ loggedIn: true, at: nowISO() }));
      await showApp();
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

  if (loggedIn) {
    await showApp();
  } else {
    showLogin();
  }

  setInterval(() => {
    if (!loggedIn) return;
    if (cashCounterPanel && cashCounterPanel.contains(document.activeElement)) return;
    renderAll();
  }, 1500);

  window.addEventListener("focus", () => {
    if (loggedIn) renderAll();
  });

  window.addEventListener("fc:state-changed", () => {
    if (loggedIn) renderAll();
  });
})();