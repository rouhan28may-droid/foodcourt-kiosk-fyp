(async function () {
  window.FC = window.FC || {};

  const $ = (id) => document.getElementById(id);

  const messageBox = $("messageBox");
  const trackPanel = $("trackPanel");
  const orderIdLabel = $("orderIdLabel");
  const restaurantLabel = $("restaurantLabel");
  const serviceLabel = $("serviceLabel");
  const paymentLabel = $("paymentLabel");
  const mainStatusLabel = $("mainStatusLabel");
  const statusBadge = $("statusBadge");
  const statusHint = $("statusHint");
  const prepTimeLabel = $("prepTimeLabel");
  const lastUpdatedLabel = $("lastUpdatedLabel");
  const itemsList = $("itemsList");
  const refreshBtn = $("refreshBtn");

  const stepPaid = $("stepPaid");
  const stepPreparing = $("stepPreparing");
  const stepReady = $("stepReady");
  const stepCompleted = $("stepCompleted");

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id") || "";

  const DEFAULT_APPROVAL_SECONDS = 12;
  let refreshTimer = null;

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeObject(v) {
    return v && typeof v === "object" ? v : {};
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showMessage(type, text) {
    if (!messageBox) return;

    messageBox.classList.remove("hidden");
    messageBox.textContent = text;

    if (type === "error") {
      messageBox.className = "mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200";
    } else {
      messageBox.className = "mt-5 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200";
    }
  }

  function hideMessage() {
    if (messageBox) messageBox.classList.add("hidden");
  }

  function money(value, currency = "PKR") {
    try {
      return new Intl.NumberFormat("en-PK", {
        style: "currency",
        currency,
        maximumFractionDigits: 0
      }).format(Number(value || 0));
    } catch {
      return `${currency} ${Math.round(Number(value || 0))}`;
    }
  }

  function serviceText(order = {}) {
    const type = order.serviceType || order.service_type || "";
    const table = String(order.tableNumber || order.table_number || "").trim();

    if (type === "dine_in") {
      return table ? `Dine In - Table ${table}` : "Dine In";
    }

    if (type === "takeaway") return "Takeaway";

    return "Not selected";
  }

  function getStateSafe() {
    try {
      if (typeof FC.getStateSafe === "function") return FC.getStateSafe();
      if (typeof FC.getState === "function") return FC.getState();
    } catch {}
    return {};
  }

  function getRestaurant(order) {
    try {
      const state = getStateSafe();
      return safeArray(state.restaurants).find((r) => r.id === order.restaurantId) || null;
    } catch {
      return null;
    }
  }

  function approvalWindowSeconds() {
    try {
      if (typeof FC.approvalWindowSeconds === "function") {
        return Number(FC.approvalWindowSeconds()) || DEFAULT_APPROVAL_SECONDS;
      }
    } catch {}

    const state = getStateSafe();
    const n = Number(state.settings?.approvalWindowSeconds || DEFAULT_APPROVAL_SECONDS);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_APPROVAL_SECONDS;
  }

  function approvalStartTime(order = {}) {
    const payment = safeObject(order.payment);
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

  function approvalSecondsLeft(order = {}) {
    try {
      if (typeof FC.orderApprovalSecondsLeft === "function") {
        return Math.max(0, Number(FC.orderApprovalSecondsLeft(order)) || 0);
      }
    } catch {}

    const elapsedMs = Date.now() - approvalStartTime(order);
    const leftMs = Math.max(0, approvalWindowSeconds() * 1000 - elapsedMs);
    return Math.ceil(leftMs / 1000);
  }

  function approvalProgressPercent(order = {}) {
    const elapsedMs = Math.max(0, Date.now() - approvalStartTime(order));
    const totalMs = approvalWindowSeconds() * 1000;
    return Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)));
  }

  function paymentMethodOf(order = {}) {
    const payment = safeObject(order.payment);
    const raw = String(
      order.paymentMethod ||
      order.payment_method ||
      payment.paymentMethod ||
      payment.method ||
      payment.provider ||
      ""
    ).toLowerCase();

    if (raw.includes("cash") || raw.includes("counter")) return "cash";
    if (raw.includes("online") || raw.includes("stripe") || raw.includes("card") || raw.includes("qr")) return "online";

    return "";
  }

  function paymentStatusText(order = {}) {
    const status = String(order.status || "").toLowerCase();
    const payment = safeObject(order.payment);
    const method = paymentMethodOf(order);

    if (status === "pending_approval") return "Restaurant confirmation pending";
    if (status === "rejected") return "Order rejected";

    if (payment.success || ["paid", "preparing", "ready", "completed"].includes(status)) {
      return method === "cash" ? "Cash paid" : "Paid";
    }

    if (status === "awaiting_cash_payment") return "Cash payment pending";

    if (status === "awaiting_payment") {
      return method === "cash" ? "Cash payment pending" : "Online payment pending";
    }

    if (status === "approved") return "Waiting for payment";

    return "Pending";
  }

  function approvalModeText(order = {}) {
    const mode = String(order.approvalMode || order.payment?.approvalMode || "").toLowerCase();

    if (mode.includes("auto")) return "Auto-accepted";
    if (mode.includes("restaurant_manual")) return "Accepted by restaurant";
    if (mode.includes("rejected")) return "Rejected by restaurant";

    return "";
  }

  function statusLabelText(order = {}) {
    const s = String(order.status || "").toLowerCase();

    if (s === "pending_approval") return "Waiting for Restaurant Approval";
    if (s === "approved") {
      const mode = approvalModeText(order);
      return mode ? `${mode} - Waiting for Payment` : "Approved - Waiting for Payment";
    }
    if (s === "awaiting_payment") return "Waiting for Payment";
    if (s === "awaiting_cash_payment") return "Waiting for Cash Payment";
    if (s === "paid") return "Payment Confirmed";
    if (s === "preparing") return "Meal is Preparing";
    if (s === "ready") return "Order is Ready";
    if (s === "completed") return "Order Completed";
    if (s === "rejected") return "Order Rejected";

    return "Checking...";
  }

  function statusHintHtml(order = {}) {
    const s = String(order.status || "").toLowerCase();
    const method = paymentMethodOf(order);
    const mode = approvalModeText(order);
    const reason =
      order.rejectReason ||
      order.reject_reason ||
      order.payment?.rejectReason ||
      order.payment?.rejectionReason ||
      "Food item is not available right now.";

    if (s === "pending_approval") {
      const secondsLeft = approvalSecondsLeft(order);
      const progress = approvalProgressPercent(order);

      return `
        <div class="fc-approval-card rounded-3xl border border-amber-400/20 bg-white/5 p-4">
          <div class="grid sm:grid-cols-[140px,1fr] gap-4 items-center">
            <div class="fc-cooking-stage">
              <div class="fc-steam s1"></div>
              <div class="fc-steam s2"></div>
              <div class="fc-steam s3"></div>
              <div class="fc-pot-lid"></div>
              <div class="fc-pot"></div>
              <div class="fc-pot-flame"></div>
            </div>

            <div>
              <div class="text-lg font-semibold text-slate-100">
                Restaurant is checking your order
                <span class="fc-dot-loader"><span>.</span><span>.</span><span>.</span></span>
              </div>

              <div class="mt-2 text-sm text-slate-300">
                Your request has been sent to the restaurant. They can approve or reject it based on availability.
              </div>

              <div class="mt-3 flex items-center justify-between gap-3 text-sm">
                <span class="text-slate-400">Auto-accept countdown</span>
                <span class="pill badge-yellow">${secondsLeft > 0 ? `${secondsLeft}s left` : "Checking acceptance..."}</span>
              </div>

              <div class="fc-progress-track mt-3">
                <div class="fc-progress-fill" style="width:${progress}%"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (s === "approved") {
      const autoText = mode === "Auto-accepted"
        ? `The restaurant did not reject within ${approvalWindowSeconds()} seconds, so your order was accepted automatically.`
        : "Your order is approved by the restaurant.";

      return `
        <div class="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          ${escapeHtml(autoText)} Complete ${method === "cash" ? "cash payment at the counter" : "online payment from the kiosk QR"} to start preparation.
        </div>
      `;
    }

    if (s === "awaiting_payment") {
      return method === "cash"
        ? "Please pay cash to staff. Staff must scan/confirm the cash payment before preparation starts."
        : "Please complete online payment from the kiosk Stripe QR.";
    }

    if (s === "awaiting_cash_payment") return "Please pay cash to staff. Staff will confirm payment from the cash counter page.";
    if (s === "paid") return "Payment is confirmed. The restaurant will start preparing your meal.";
    if (s === "preparing") return "Your meal is being prepared.";
    if (s === "ready") return "Your order is ready. Please collect it from the counter.";
    if (s === "completed") return "Your order has been completed.";

    if (s === "rejected") {
      return `
        <div class="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4">
          <div class="font-semibold text-rose-100">Sorry, the restaurant rejected this order.</div>
          <div class="mt-2 text-sm text-rose-100">Reason: ${escapeHtml(reason)}</div>
          <div class="mt-3 text-sm text-slate-300">
            Please place another order, choose a different item, or try another restaurant.
          </div>
        </div>
      `;
    }

    return "Checking latest order status.";
  }

  function setBadge(status) {
    if (!statusBadge) return;

    const s = String(status || "").toLowerCase();

    statusBadge.className = "pill";

    if (["approved", "paid", "preparing", "ready", "completed"].includes(s)) {
      statusBadge.classList.add("badge-green");
    } else if (s === "rejected") {
      statusBadge.classList.add("badge-red");
    } else {
      statusBadge.classList.add("badge-yellow");
    }

    statusBadge.textContent = String(s || "checking").toUpperCase();
  }

  function setStep(el, active, warning = false) {
    if (!el) return;

    if (active) {
      el.className = warning
        ? "rounded-2xl border border-yellow-400/40 bg-yellow-500/15 p-3"
        : "rounded-2xl border border-emerald-400/40 bg-emerald-500/15 p-3";
    } else {
      el.className = "rounded-2xl border border-white/10 bg-white/5 p-3";
    }
  }

  function renderSteps(status) {
    const s = String(status || "").toLowerCase();

    setStep(stepPaid, ["paid", "preparing", "ready", "completed"].includes(s));
    setStep(stepPreparing, ["preparing", "ready", "completed"].includes(s));
    setStep(stepReady, ["ready", "completed"].includes(s));
    setStep(stepCompleted, s === "completed");

    if (s === "approved" || s === "awaiting_payment" || s === "awaiting_cash_payment") {
      setStep(stepPaid, true, true);
    }
  }

  async function seedSafe() {
    try {
      if (typeof FC.seed === "function") {
        await FC.seed();
      }
    } catch (err) {
      console.warn("order-track.js: seed failed", err);
    }
  }

  async function getOrderSafe(id) {
    try {
      if (typeof FC.getOrder === "function") {
        return await FC.getOrder(id);
      }
    } catch (err) {
      console.error("order-track.js: getOrder failed", err);
    }

    return null;
  }

  function renderOrder(order) {
    if (!order) {
      if (trackPanel) trackPanel.classList.add("hidden");
      showMessage("error", "Order not found. Make sure the order ID is correct.");
      return;
    }

    hideMessage();
    if (trackPanel) trackPanel.classList.remove("hidden");

    const restaurant = getRestaurant(order);

    if (orderIdLabel) orderIdLabel.textContent = order.id || "—";
    if (restaurantLabel) restaurantLabel.textContent = restaurant?.name || "Restaurant";
    if (serviceLabel) serviceLabel.textContent = serviceText(order);
    if (paymentLabel) paymentLabel.textContent = paymentStatusText(order);
    if (mainStatusLabel) mainStatusLabel.textContent = statusLabelText(order);
    if (statusHint) statusHint.innerHTML = statusHintHtml(order);
    if (prepTimeLabel) prepTimeLabel.textContent = `${restaurant?.prepTimeMins || 15} minutes estimated`;
    if (lastUpdatedLabel) lastUpdatedLabel.textContent = `Updated ${new Date().toLocaleTimeString()}`;

    setBadge(order.status);
    renderSteps(order.status);

    if (itemsList) {
      const rows = safeArray(order.items).map((item) => {
        const qty = Number(item.qty || 0);
        const price = Number(item.price || 0);

        return `
          <div class="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div>
              <div class="font-semibold text-slate-100">${escapeHtml(item.name || "Item")}</div>
              <div class="text-xs text-slate-400">Qty ${qty}</div>
            </div>
            <div class="text-right">${escapeHtml(money(qty * price, order.currency || "PKR"))}</div>
          </div>
        `;
      }).join("");

      itemsList.innerHTML = rows || `<div class="text-slate-400">No items found.</div>`;
    }
  }

  async function loadOrder() {
    if (!orderId) {
      renderOrder(null);
      showMessage("error", "Missing order_id in URL.");
      return;
    }

    await seedSafe();
    const order = await getOrderSafe(orderId);
    renderOrder(order);
  }

  if (refreshBtn) {
    refreshBtn.onclick = loadOrder;
  }

  await loadOrder();

  refreshTimer = setInterval(loadOrder, 1000);

  window.addEventListener("focus", loadOrder);

  window.addEventListener("beforeunload", () => {
    if (refreshTimer) clearInterval(refreshTimer);
  });
})();
