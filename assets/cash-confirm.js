(async function () {
  window.FC = window.FC || {};

  const $ = (id) => document.getElementById(id);

  const pageMessage = $("pageMessage");
  const orderPanel = $("orderPanel");
  const orderIdLabel = $("orderIdLabel");
  const restaurantLabel = $("restaurantLabel");
  const serviceLabel = $("serviceLabel");
  const statusLabel = $("statusLabel");
  const totalLabel = $("totalLabel");
  const itemsList = $("itemsList");
  const staffNameInput = $("staffNameInput");
  const staffPinInput = $("staffPinInput");
  const amountReceivedInput = $("amountReceivedInput");
  const changeGivenLabel = $("changeGivenLabel");
  const confirmCashBtn = $("confirmCashBtn");
  const refreshBtn = $("refreshBtn");
  const confirmPanel = $("confirmPanel");

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order_id") || "";
  const cashToken = params.get("cash_token") || "";

  let currentOrder = null;

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeObject(v) {
    return v && typeof v === "object" ? v : {};
  }

  function showMessage(type, text) {
    if (!pageMessage) return;

    pageMessage.classList.remove("hidden");
    pageMessage.textContent = text;

    if (type === "success") {
      pageMessage.className = "mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200";
    } else if (type === "error") {
      pageMessage.className = "mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200";
    } else {
      pageMessage.className = "mt-5 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200";
    }
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

    if (type === "dine_in") return table ? `Dine In - Table ${table}` : "Dine In";
    if (type === "takeaway") return "Takeaway";
    return "Not selected";
  }

  function getRestaurantName(order) {
    try {
      const state = typeof FC.getState === "function" ? FC.getState() : {};
      const restaurant = safeArray(state.restaurants).find((r) => r.id === order.restaurantId);
      return restaurant?.name || "Restaurant";
    } catch {
      return "Restaurant";
    }
  }

  function paymentText(order) {
    const status = String(order.status || "").toLowerCase();
    const payment = safeObject(order.payment);

    if (payment.success || ["paid", "preparing", "ready", "completed"].includes(status)) return "Paid";
    if (status === "awaiting_cash_payment") return "Cash Pending";
    if (status === "awaiting_payment") return "Payment Pending";
    return status || "Pending";
  }

  function updateChangePreview() {
    if (!currentOrder || !changeGivenLabel) return;

    const total = Number(currentOrder.total || 0);
    const received = Number(amountReceivedInput?.value || 0);
    const change = Math.max(0, received - total);
    changeGivenLabel.textContent = money(change, currentOrder.currency || "PKR");
  }

  async function seedSafe() {
    try {
      if (typeof FC.seed === "function") await FC.seed();
    } catch (err) {
      console.warn("cash-confirm.js: seed failed", err);
    }
  }

  async function getOrderSafe(id) {
    try {
      if (typeof FC.getOrder === "function") return await FC.getOrder(id);
    } catch (err) {
      console.error("cash-confirm.js: getOrder failed", err);
    }

    return null;
  }

  function renderOrder(order) {
    currentOrder = order;

    if (!order) {
      if (orderPanel) orderPanel.classList.add("hidden");
      showMessage("error", "Order not found. Make sure Supabase is connected and the order exists.");
      return;
    }

    if (orderPanel) orderPanel.classList.remove("hidden");

    if (orderIdLabel) orderIdLabel.textContent = order.id || "—";
    if (restaurantLabel) restaurantLabel.textContent = getRestaurantName(order);
    if (serviceLabel) serviceLabel.textContent = serviceText(order);
    if (statusLabel) statusLabel.textContent = paymentText(order);
    if (totalLabel) totalLabel.textContent = money(order.total || 0, order.currency || "PKR");

    if (amountReceivedInput && !amountReceivedInput.value) {
      amountReceivedInput.value = String(Math.ceil(Number(order.total || 0)));
    }
    updateChangePreview();

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

    const alreadyPaid = safeObject(order.payment).success || ["paid", "preparing", "ready", "completed"].includes(order.status);

    if (alreadyPaid) {
      if (confirmPanel) confirmPanel.classList.add("hidden");
      showMessage("success", "This order is already paid. No further cash confirmation is required.");
    } else if (!["awaiting_cash_payment", "awaiting_payment", "approved"].includes(order.status)) {
      showMessage("warn", `Current order status is "${order.status}". Confirm only after collecting cash.`);
    } else {
      if (pageMessage) pageMessage.classList.add("hidden");
      if (confirmPanel) confirmPanel.classList.remove("hidden");
    }
  }

  async function loadOrder() {
    if (!orderId) {
      renderOrder(null);
      showMessage("error", "Missing order_id in URL.");
      return;
    }

    showMessage("warn", "Loading order...");
    await seedSafe();

    const order = await getOrderSafe(orderId);
    renderOrder(order);
  }

  async function confirmCashPayment() {
    if (!currentOrder) {
      showMessage("error", "Order not loaded.");
      return;
    }

    const staffName = String(staffNameInput?.value || "Staff").trim() || "Staff";
    const staffPin = String(staffPinInput?.value || "").trim();
    const amountReceived = Number(amountReceivedInput?.value || 0);
    const total = Number(currentOrder.total || 0);
    const changeGiven = Math.max(0, amountReceived - total);

    if (!staffPin) {
      showMessage("error", "Enter staff PIN first.");
      return;
    }

    if (amountReceived < total) {
      showMessage("error", `Amount received is less than total due. Total due is ${money(total, currentOrder.currency || "PKR")}.`);
      return;
    }

    if (confirmCashBtn) {
      confirmCashBtn.disabled = true;
      confirmCashBtn.classList.add("opacity-60");
      confirmCashBtn.textContent = "Confirming...";
    }

    try {
      if (typeof FC.confirmCashPayment !== "function") {
        throw new Error("Cash confirmation function is missing. Update assets/storage.js first.");
      }

      const updated = await FC.confirmCashPayment(currentOrder.id, {
        cashToken,
        staffPin,
        staffName,
        amountReceived,
        changeGiven
      });

      currentOrder = updated;
      showMessage("success", `Cash payment confirmed successfully. Change given: ${money(changeGiven, currentOrder.currency || "PKR")}.`);
      renderOrder(updated);
    } catch (err) {
      console.error("cash-confirm.js: cash confirmation failed", err);
      showMessage("error", err.message || "Cash confirmation failed.");
    } finally {
      if (confirmCashBtn) {
        confirmCashBtn.disabled = false;
        confirmCashBtn.classList.remove("opacity-60");
        confirmCashBtn.textContent = "Confirm Payment Received";
      }
    }
  }

  if (amountReceivedInput) {
    amountReceivedInput.addEventListener("input", updateChangePreview);
  }

  if (confirmCashBtn) {
    confirmCashBtn.onclick = confirmCashPayment;
  }

  if (refreshBtn) {
    refreshBtn.onclick = loadOrder;
  }

  if (staffPinInput) {
    staffPinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmCashPayment();
    });
  }

  if (amountReceivedInput) {
    amountReceivedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmCashPayment();
    });
  }

  await loadOrder();

  window.addEventListener("focus", loadOrder);
})();
