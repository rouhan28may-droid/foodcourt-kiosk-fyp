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

  let refreshTimer = null;

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeObject(v) {
    return v && typeof v === "object" ? v : {};
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

  function getRestaurant(order) {
    try {
      const state = typeof FC.getState === "function" ? FC.getState() : {};
      return safeArray(state.restaurants).find((r) => r.id === order.restaurantId) || null;
    } catch {
      return null;
    }
  }

  function paymentStatusText(order) {
    const status = String(order.status || "").toLowerCase();
    const payment = safeObject(order.payment);

    if (payment.success || ["paid", "preparing", "ready", "completed"].includes(status)) {
      return "Paid";
    }

    if (status === "awaiting_cash_payment") return "Cash payment pending";
    if (status === "awaiting_payment") return "Online payment pending";
    if (status === "approved") return "Waiting for payment";

    return "Pending";
  }

  function statusLabelText(status) {
    const s = String(status || "").toLowerCase();

    if (s === "pending_approval") return "Waiting for Restaurant Approval";
    if (s === "approved") return "Approved - Waiting for Payment";
    if (s === "awaiting_payment") return "Waiting for Online Payment";
    if (s === "awaiting_cash_payment") return "Waiting for Cash Payment";
    if (s === "paid") return "Payment Confirmed";
    if (s === "preparing") return "Meal is Preparing";
    if (s === "ready") return "Order is Ready";
    if (s === "completed") return "Order Completed";
    if (s === "rejected") return "Order Rejected";

    return "Checking...";
  }

  function statusHintText(status) {
    const s = String(status || "").toLowerCase();

    if (s === "pending_approval") return "Your order has been sent to the restaurant for approval.";
    if (s === "approved") return "Your order is approved. Complete payment to start preparation.";
    if (s === "awaiting_payment") return "Scan the Stripe QR shown on kiosk and complete online payment.";
    if (s === "awaiting_cash_payment") return "Please pay cash to staff. Staff will confirm payment from the cash counter page.";
    if (s === "paid") return "Payment is confirmed. The restaurant will start preparing your meal.";
    if (s === "preparing") return "Your meal is being prepared.";
    if (s === "ready") return "Your order is ready. Please collect it from the counter.";
    if (s === "completed") return "Your order has been completed.";
    if (s === "rejected") return "Your order was rejected. Please contact the counter.";

    return "Checking latest order status.";
  }

  function setBadge(status) {
    if (!statusBadge) return;

    const s = String(status || "").toLowerCase();

    statusBadge.className = "pill";

    if (["paid", "preparing", "ready", "completed"].includes(s)) {
      statusBadge.classList.add("badge-green");
    } else if (s === "rejected") {
      statusBadge.classList.add("badge-red");
    } else {
      statusBadge.classList.add("badge-yellow");
    }

    statusBadge.textContent = String(s || "checking").toUpperCase();
  }

  function setStep(el, active) {
    if (!el) return;

    el.className = active
      ? "rounded-2xl border border-emerald-400/40 bg-emerald-500/15 p-3"
      : "rounded-2xl border border-white/10 bg-white/5 p-3";
  }

  function renderSteps(status) {
    const s = String(status || "").toLowerCase();

    setStep(stepPaid, ["paid", "preparing", "ready", "completed"].includes(s));
    setStep(stepPreparing, ["preparing", "ready", "completed"].includes(s));
    setStep(stepReady, ["ready", "completed"].includes(s));
    setStep(stepCompleted, s === "completed");
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
    if (mainStatusLabel) mainStatusLabel.textContent = statusLabelText(order.status);
    if (statusHint) statusHint.textContent = statusHintText(order.status);
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
              <div class="font-semibold text-slate-100">${item.name || "Item"}</div>
              <div class="text-xs text-slate-400">Qty ${qty}</div>
            </div>
            <div class="text-right">${money(qty * price, order.currency || "PKR")}</div>
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

  refreshTimer = setInterval(loadOrder, 5000);

  window.addEventListener("focus", loadOrder);

  window.addEventListener("beforeunload", () => {
    if (refreshTimer) clearInterval(refreshTimer);
  });
})();