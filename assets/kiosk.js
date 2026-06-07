(async function () {
  window.FC = window.FC || {};

  const $ = (id) => document.getElementById(id);

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

  function safeSessionRead(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function logSafe(message) {
    try {
      if (typeof FC.log === "function") FC.log(message);
    } catch (err) {
      console.error("kiosk.js log failed", err);
    }
  }

  function alertSafe(message) {
    try {
      window.alert(message);
    } catch {
      console.warn(message);
    }
  }

  async function seedSafe() {
    try {
      if (typeof FC.seed === "function") {
        await FC.seed();
      }
    } catch (err) {
      console.error("kiosk.js: seed failed", err);
    }
  }

  async function getOrderSafe(orderId) {
    if (!orderId) return null;
    try {
      return await Promise.resolve(FC.getOrder(orderId));
    } catch (err) {
      console.error("kiosk.js: getOrder failed", err);
      return null;
    }
  }

  async function createOrderSafe(payload) {
    return await Promise.resolve(FC.createOrder(payload));
  }

  async function updateOrderSafe(orderId, patch) {
    return await Promise.resolve(FC.updateOrder(orderId, patch));
  }

  async function fetchAllOrdersSafe() {
    try {
      if (typeof FC.fetchAllOrders === "function") {
        return await FC.fetchAllOrders();
      }
    } catch (err) {
      console.warn("kiosk.js: fetchAllOrders failed, falling back to local state", err);
    }

    const s = safeState();
    return safeArray(s.orders);
  }

  function nowISO() {
    try {
      if (typeof FC.nowISO === "function") return FC.nowISO();
    } catch {}
    return new Date().toISOString();
  }

  function money(value) {
    try {
      if (typeof FC.money === "function") return FC.money(value);
    } catch {}
    return String(value ?? 0);
  }

  function computeTotals(items) {
    try {
      if (typeof FC.computeTotals === "function") return FC.computeTotals(items);
    } catch {}
    const subtotal = safeArray(items).reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.qty || 0)), 0);
    const tax = Math.round(subtotal * 0.13);
    return { subtotal, tax, total: subtotal + tax };
  }

  function trackAdImpressionSafe(adId) {
    try {
      if (typeof FC.trackAdImpression === "function") {
        FC.trackAdImpression(adId);
      }
    } catch (err) {
      console.error("kiosk.js: trackAdImpression failed", err);
    }
  }

  function simulateGatewayVerifySafe(success) {
    try {
      if (typeof FC.simulateGatewayVerify === "function") {
        FC.simulateGatewayVerify(success);
      }
    } catch (err) {
      console.error("kiosk.js: simulateGatewayVerify failed", err);
    }
  }

  function simulatePrinterPaperUseSafe() {
    try {
      if (typeof FC.simulatePrinterPaperUse === "function") {
        FC.simulatePrinterPaperUse();
      }
    } catch (err) {
      console.error("kiosk.js: simulatePrinterPaperUse failed", err);
    }
  }

  async function createStripeCheckoutSession(order) {
    const res = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ order })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok || !data.url || !data.sessionId) {
      throw new Error(data.error || `Stripe session creation failed. HTTP ${res.status}`);
    }

    return data;
  }

  async function verifyStripeSession(sessionId) {
    const res = await fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`, {
      method: "GET"
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Stripe verification failed. HTTP ${res.status}`);
    }

    return data;
  }

  function showStripeQr(checkoutUrl) {
    if (!qrBox) return;

    qrBox.innerHTML = "";
    qrBox.style.cursor = "pointer";

    try {
      new QRCode(qrBox, {
        text: checkoutUrl,
        width: 220,
        height: 220
      });
    } catch (err) {
      console.error("kiosk.js: Stripe QR render failed", err);
      qrBox.innerHTML = `
        <div class="text-xs text-slate-900 break-all p-3">
          ${escapeHtml(checkoutUrl)}
        </div>
      `;
    }

    qrBox.onclick = () => {
      window.location.href = checkoutUrl;
    };
  }

  async function finalizeStripePaidOrder(orderId, stripeSessionData) {
    const order = await getOrderSafe(orderId);

    if (!order) {
      throw new Error("Order not found after Stripe payment.");
    }

    if (["paid", "preparing", "ready", "completed"].includes(order.status)) {
      if (payInterval) clearInterval(payInterval);
      payInterval = null;
      if (paymentModal) paymentModal.classList.add("hidden");
      currentPayOrderId = null;
      currentStripeCheckoutUrl = "";
      awaitingOrderId = order.id;
      saveSession();
      await openReceipt(order.id);
      return;
    }

    const payment = {
      ...safeObject(order.payment),
      success: true,
      method: "online",
      paymentMethod: "online",
      provider: "Stripe",
      stripeSessionId: stripeSessionData.sessionId || "",
      stripePaymentStatus: stripeSessionData.paymentStatus || "",
      stripeStatus: stripeSessionData.status || "",
      stripeCustomerEmail: stripeSessionData.customerEmail || "",
      verifiedAt: nowISO()
    };

    await updateOrderSafe(order.id, {
      status: "paid",
      paidAt: nowISO(),
      payment
    });

    simulateGatewayVerifySafe(true);
    logSafe(`Stripe payment verified for ${order.id}.`);

    awaitingOrderId = order.id;
    saveSession();

    if (payInterval) clearInterval(payInterval);
    payInterval = null;

    if (paymentModal) paymentModal.classList.add("hidden");
    currentPayOrderId = null;
    currentStripeCheckoutUrl = "";

    await openReceipt(order.id);
  }

  function startStripePolling(orderId, sessionId) {
    if (payInterval) clearInterval(payInterval);

    let pollCount = 0;

    payInterval = setInterval(async () => {
      pollCount += 1;

      try {
        const stripeSession = await verifyStripeSession(sessionId);

        if (payStatus) {
          payStatus.textContent = `Stripe status: ${stripeSession.paymentStatus || "checking"}...`;
        }

        if (stripeSession.paymentStatus === "paid" && stripeSession.status === "complete") {
          clearInterval(payInterval);
          payInterval = null;
          await finalizeStripePaidOrder(orderId, stripeSession);
          return;
        }

        if (pollCount >= 120) {
          clearInterval(payInterval);
          payInterval = null;

          if (payStatus) {
            payStatus.textContent = "Payment is not completed yet. Scan the QR again or open Stripe Checkout.";
          }
        }
      } catch (err) {
        console.warn("kiosk.js: Stripe polling failed", err);
      }
    }, 3000);
  }

  async function handleStripeReturn() {
    if (stripeReturnHandled) return false;
    stripeReturnHandled = true;

    const params = new URLSearchParams(window.location.search);
    const stripeSuccess = params.get("stripe_success");
    const stripeCancel = params.get("stripe_cancel");
    const orderId = params.get("order_id");
    const sessionId = params.get("session_id");

    if (!stripeSuccess && !stripeCancel) return false;

    window.history.replaceState({}, document.title, window.location.pathname);

    if (stripeCancel) {
      if (orderId) {
        awaitingOrderId = orderId;
        autoStripeStartedForOrderId = null;
        saveSession();

        const order = await getOrderSafe(orderId);
        if (order) {
          await updateOrderSafe(orderId, { status: "awaiting_payment" });
          renderFlow({ ...order, status: "awaiting_payment" });
        }
      }

      alertSafe("Stripe payment was cancelled. Please try again.");
      return true;
    }

    if (!orderId || !sessionId) {
      alertSafe("Stripe return is missing order/session information.");
      return true;
    }

    try {
      const stripeSession = await verifyStripeSession(sessionId);

      if (stripeSession.paymentStatus === "paid" && stripeSession.status === "complete") {
        await finalizeStripePaidOrder(orderId, stripeSession);
      } else {
        awaitingOrderId = orderId;
        autoStripeStartedForOrderId = null;
        saveSession();
        alertSafe("Stripe payment is not completed yet.");
      }
    } catch (err) {
      console.error("kiosk.js: Stripe return verification failed", err);
      alertSafe(`Stripe verification failed: ${err.message || err}`);
    }

    return true;
  }

  const elTabs = $("restaurantTabs");
  const elMenu = $("menuGrid");
  const elCart = $("cartItems");
  const elSubtotal = $("subtotal");
  const elTax = $("tax");
  const elTotal = $("total");
  const elCheckout = $("checkoutBtn");
  const elClearCart = $("clearCartBtn");
  const elReset = $("resetBtn");

  const servicePanel = $("servicePanel");
  const serviceModeDineIn = $("serviceModeDineIn");
  const serviceModeTakeaway = $("serviceModeTakeaway");
  const dineInOption = $("dineInOption");
  const takeawayOption = $("takeawayOption");
  const tableNumberWrap = $("tableNumberWrap");
  const tableNumberInput = $("tableNumberInput");
  const serviceSummary = $("serviceSummary");
  const serviceError = $("serviceError");

  const paymentMethodPanel = $("paymentMethodPanel");
  const paymentMethodOnline = $("paymentMethodOnline");
  const paymentMethodCash = $("paymentMethodCash");
  const onlinePaymentOption = $("onlinePaymentOption");
  const cashPaymentOption = $("cashPaymentOption");
  const paymentMethodSummary = $("paymentMethodSummary");
  const paymentMethodNote = $("paymentMethodNote");
  const paymentMethodError = $("paymentMethodError");

  const elActiveName = $("activeRestaurantName");
  const elActiveTagline = $("activeRestaurantTagline");
  const elTaxRateLabel = $("taxRateLabel");
  const elQueueCount = $("queueCount");

  const elSearch = $("searchInput");
  const elCategory = $("categorySelect");
  const elFlowPanel = $("flowPanel");

  const paymentModal = $("paymentModal");
  const qrBox = $("qrBox");
  const payAmount = $("payAmount");
  const payCountdown = $("payCountdown");
  const payStatus = $("payStatus");
  const closePaymentBtn = $("closePaymentBtn");
  const simulatePayBtn = $("simulatePayBtn");
  const simulateFailBtn = $("simulateFailBtn");

  const receiptModal = $("receiptModal");
  const printArea = $("printArea");
  const receiptHint = $("receiptHint");
  const closeReceiptBtn = $("closeReceiptBtn");
  const printBtn = $("printBtn");
  const doneBtn = $("doneBtn");

  const adsOverlay = $("adsOverlay");
  const adTitle = $("adTitle");
  const adSubtitle = $("adSubtitle");
  const fullscreenBtn = $("fullscreenBtn");
  const kioskTopBar = $("kioskTopBar");
  const kioskLockOverlay = $("kioskLockOverlay");
  const kioskUnlockTitle = $("kioskUnlockTitle");
  const kioskUnlockMessage = $("kioskUnlockMessage");
  const kioskLockActions = $("kioskLockActions");
  const kioskPinInput = $("kioskPinInput");
  const kioskPinError = $("kioskPinError");
  const kioskUnlockBtn = $("kioskUnlockBtn");

  let kioskFullscreenStarted = false;
  let kioskExitLocked = false;

  function injectKioskFullscreenStyles() {
    if (document.getElementById("kioskFullscreenStyles")) return;

    const style = document.createElement("style");
    style.id = "kioskFullscreenStyles";
    style.textContent = `
      body.kiosk-fullscreen-mode #kioskTopBar {
        display: none !important;
      }

      body.kiosk-fullscreen-mode main {
        padding-top: 1.5rem !important;
      }

      body.kiosk-exit-locked {
        overflow: hidden !important;
      }

      body.kiosk-exit-locked #kioskLockOverlay {
        display: block !important;
      }
    `;

    document.head.appendChild(style);
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  async function requestKioskFullscreen() {
    const el = document.documentElement;

    if (el.requestFullscreen) return await el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    if (el.msRequestFullscreen) return el.msRequestFullscreen();

    throw new Error("Fullscreen API is not supported in this browser.");
  }

  function getKioskPassword() {
    const s = safeState();

    const candidates = [
      s.settings?.kioskPin,
      s.settings?.kioskPassword,
      s.settings?.adminPin,
      s.kioskPin,
      s.kioskPassword,
      localStorage.getItem("fc_kiosk_pin"),
      localStorage.getItem("kioskPin"),
      localStorage.getItem("kiosk_password")
    ];

    const found = candidates.find((x) => String(x || "").trim());

    return String(found || "1234").trim();
  }

  function setKioskDeviceLockState(locked) {
    try {
      if (typeof FC.setDevice === "function") {
        FC.setDevice("kioskDisplay", { locked: !!locked });
      }
    } catch (err) {
      console.warn("kiosk.js: kiosk display lock state update failed", err);
    }
  }

  function applyKioskFullscreenUi(active) {
    document.body.classList.toggle("kiosk-fullscreen-mode", !!active);

    if (kioskTopBar) {
      kioskTopBar.classList.toggle("hidden", !!active);
    }

    if (fullscreenBtn) {
      fullscreenBtn.textContent = active ? "Full Screen Active" : "Full Screen";
      fullscreenBtn.disabled = !!active;
      fullscreenBtn.classList.toggle("opacity-60", !!active);
      fullscreenBtn.classList.toggle("cursor-not-allowed", !!active);
    }
  }

  function showKioskExitLock() {
    kioskExitLocked = true;
    document.body.classList.add("kiosk-exit-locked");
    setKioskDeviceLockState(true);

    if (kioskLockOverlay) {
      kioskLockOverlay.classList.remove("hidden");
    }

    if (kioskUnlockTitle) {
      kioskUnlockTitle.textContent = "Admin Password Required";
    }

    if (kioskUnlockMessage) {
      kioskUnlockMessage.textContent = "Fullscreen was exited. Enter kiosk password to continue.";
    }

    if (kioskLockActions) {
      kioskLockActions.classList.remove("hidden");
    }

    if (kioskPinError) {
      kioskPinError.textContent = "Incorrect password.";
      kioskPinError.classList.add("hidden");
    }

    if (kioskPinInput) {
      kioskPinInput.value = "";
      setTimeout(() => kioskPinInput.focus(), 80);
    }
  }

  function hideKioskExitLock() {
    kioskExitLocked = false;
    document.body.classList.remove("kiosk-exit-locked");
    setKioskDeviceLockState(false);

    if (kioskLockOverlay) {
      kioskLockOverlay.classList.add("hidden");
    }

    if (kioskPinInput) {
      kioskPinInput.value = "";
    }

    if (kioskPinError) {
      kioskPinError.classList.add("hidden");
    }
  }

  async function enterCustomerFullscreen() {
    try {
      kioskFullscreenStarted = true;
      await requestKioskFullscreen();
      applyKioskFullscreenUi(true);
      hideKioskExitLock();
    } catch (err) {
      console.error("kiosk.js: fullscreen failed", err);
      alertSafe("Fullscreen could not start. Please allow fullscreen in browser settings.");
    }
  }

  function handleFullscreenChange() {
    const active = !!getFullscreenElement();

    applyKioskFullscreenUi(active);

    if (!active && kioskFullscreenStarted) {
      showKioskExitLock();
    }
  }

  injectKioskFullscreenStyles();

  if (fullscreenBtn) {
    fullscreenBtn.onclick = async () => {
      await enterCustomerFullscreen();
    };
  }

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  document.addEventListener("msfullscreenchange", handleFullscreenChange);

  if (kioskUnlockBtn) {
    kioskUnlockBtn.onclick = () => {
      const entered = String(kioskPinInput?.value || "").trim();
      const expected = getKioskPassword();

      if (entered === expected) {
        hideKioskExitLock();
        return;
      }

      if (kioskPinError) {
        kioskPinError.classList.remove("hidden");
      }

      if (kioskPinInput) {
        kioskPinInput.value = "";
        kioskPinInput.focus();
      }
    };
  }

  if (kioskPinInput) {
    kioskPinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && kioskUnlockBtn) {
        kioskUnlockBtn.click();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (!kioskExitLocked) return;

    if (e.key === "Escape" || e.key === "Tab" || e.key === "Backspace") {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  const sessionKey = "fc_session";
  const session = safeSessionRead(sessionKey, {});
  let activeRestaurantId = session.activeRestaurantId || "r1";
  let cart = safeArray(session.cart);
  let awaitingOrderId = session.awaitingOrderId || null;
  let serviceType = session.serviceType || "";
  let tableNumber = String(session.tableNumber || "");
  let paymentMethod = session.paymentMethod || "";

  let payInterval = null;
  let paySecondsLeft = 0;
  let currentPayOrderId = null;
  let currentReceiptOrderId = null;
  let currentStripeCheckoutUrl = "";
  let autoStripeStartedForOrderId = null;
  let autoCashSlipStartedForOrderId = null;
  let autoCashPaidReceiptOpenedForOrderId = null;
  let stripeReturnHandled = false;

  let idleSeconds = 0;
  let adsIdx = 0;
  let adTimer = null;

  let renderBusy = false;
  let rerenderRequested = false;

  function saveSession() {
    localStorage.setItem(
      sessionKey,
      JSON.stringify({
        activeRestaurantId,
        cart,
        awaitingOrderId,
        serviceType,
        tableNumber,
        paymentMethod
      })
    );
  }

  function serviceLabel(type = serviceType) {
    if (type === "dine_in") return "Dine In";
    if (type === "takeaway") return "Takeaway";
    return "Not selected";
  }

  function serviceText(order = {}) {
    const type = order.serviceType || order.service_type || order.orderType || "";
    const table = String(order.tableNumber || order.table_number || "").trim();

    if (type === "dine_in") {
      return table ? `Dine In â€¢ Table ${table}` : "Dine In";
    }

    if (type === "takeaway") return "Takeaway";

    return "Order type not selected";
  }


  function normalizePaymentMethod(value) {
    const v = String(value || "").trim().toLowerCase();

    if (v === "cash" || v === "cod" || v === "counter") return "cash";
    if (v === "online" || v === "stripe" || v === "card" || v === "qr") return "online";

    return "";
  }

  function paymentMethodOf(order = {}) {
    const explicit = normalizePaymentMethod(
      order.paymentMethod ||
      order.payment?.paymentMethod ||
      order.payment?.method ||
      order.payment_method ||
      ""
    );

    if (explicit) return explicit;

    if (order?.id && awaitingOrderId && String(order.id) === String(awaitingOrderId)) {
      return normalizePaymentMethod(paymentMethod);
    }

    return "";
  }

  function paymentMethodLabel(method = paymentMethod) {
    const normalized = normalizePaymentMethod(method);

    if (normalized === "cash") return "Cash";
    if (normalized === "online") return "Online";

    return "Not selected";
  }

  function paymentStatusText(order = {}) {
    const method = paymentMethodOf(order);
    const status = String(order.status || "").toLowerCase();
    const success = !!order.payment?.success;

    if (method === "cash") {
      if (success || ["paid", "preparing", "ready", "completed"].includes(status)) return "Cash Paid";
      return "Cash Pending";
    }

    if (success || ["paid", "preparing", "ready", "completed"].includes(status)) return "Online Paid";
    if (status === "awaiting_payment") return "Online Payment Pending";

    return "Payment Pending";
  }

  function trackingUrlForOrder(order = {}) {
    try {
      if (typeof FC.orderTrackingUrl === "function") return FC.orderTrackingUrl(order.id);
    } catch {}

    const url = new URL("/order-track.html", window.location.origin);
    url.searchParams.set("order_id", String(order.id || ""));
    return url.toString();
  }

  function cashConfirmUrlForOrder(order = {}) {
    try {
      if (typeof FC.cashConfirmUrl === "function") {
        return FC.cashConfirmUrl(order.id, order.payment?.cashToken || "");
      }
    } catch {}

    const url = new URL("/cash-confirm.html", window.location.origin);
    url.searchParams.set("order_id", String(order.id || ""));
    if (order.payment?.cashToken) url.searchParams.set("cash_token", String(order.payment.cashToken));
    return url.toString();
  }

  function setPaymentMethod(method) {
    paymentMethod = normalizePaymentMethod(method);

    saveSession();
    renderPaymentMethodPanel();
    renderCart();
  }

  function getPaymentMethodSelection() {
    const method = normalizePaymentMethod(paymentMethod);

    if (!method) {
      return {
        ok: false,
        message: "Please select Online or Cash payment before checkout."
      };
    }

    return {
      ok: true,
      paymentMethod: method,
      label: paymentMethodLabel(method)
    };
  }

  function renderPaymentMethodPanel() {
    if (!paymentMethodPanel) return;

    const selectedClasses = ["border-indigo-400/70", "bg-indigo-500/15", "ring-1", "ring-indigo-400/40"];
    const normalClasses = ["border-white/10", "bg-white/5"];

    const applyOptionState = (el, selected) => {
      if (!el) return;
      el.classList.remove(...selectedClasses, ...normalClasses);
      if (selected) {
        el.classList.add(...selectedClasses);
      } else {
        el.classList.add(...normalClasses);
      }
    };

    const method = normalizePaymentMethod(paymentMethod);

    if (paymentMethodOnline) paymentMethodOnline.checked = method === "online";
    if (paymentMethodCash) paymentMethodCash.checked = method === "cash";

    applyOptionState(onlinePaymentOption, method === "online");
    applyOptionState(cashPaymentOption, method === "cash");

    if (paymentMethodSummary) {
      paymentMethodSummary.textContent = paymentMethodLabel(method);
    }

    if (paymentMethodNote) {
      paymentMethodNote.textContent =
        method === "cash"
          ? "Cash order will print a staff confirmation QR and a customer tracking QR."
          : method === "online"
            ? "Online order will show Stripe QR and print a customer tracking QR after payment."
            : "Cash orders print staff confirmation QR. Online orders show Stripe QR.";
    }

    if (paymentMethodError) {
      const check = getPaymentMethodSelection();
      paymentMethodError.textContent = check.message || "";
      paymentMethodError.classList.toggle("hidden", check.ok || !cart.length);
    }
  }

  function resetPaymentMethodSelection() {
    paymentMethod = "";
    if (paymentMethodOnline) paymentMethodOnline.checked = false;
    if (paymentMethodCash) paymentMethodCash.checked = false;
    renderPaymentMethodPanel();
  }

  function setServiceType(type) {
    serviceType = type;
    if (type !== "dine_in") {
      tableNumber = "";
      if (tableNumberInput) tableNumberInput.value = "";
    }
    saveSession();
    renderServicePanel();
    renderCart();
  }

  function getServiceSelection() {
    const type = serviceType;
    const table = String(tableNumberInput?.value ?? tableNumber ?? "").trim();

    if (!type) {
      return {
        ok: false,
        message: "Please select Dine In or Takeaway before checkout."
      };
    }

    if (type === "dine_in" && !table) {
      return {
        ok: false,
        message: "Please enter table number for Dine In order."
      };
    }

    return {
      ok: true,
      serviceType: type,
      tableNumber: type === "dine_in" ? table : "",
      label: type === "dine_in" ? `Dine In â€¢ Table ${table}` : "Takeaway"
    };
  }

  function renderServicePanel() {
    if (!servicePanel) return;

    const tableValue = String(tableNumberInput?.value ?? tableNumber ?? "").trim();

    if (serviceModeDineIn) serviceModeDineIn.checked = serviceType === "dine_in";
    if (serviceModeTakeaway) serviceModeTakeaway.checked = serviceType === "takeaway";

    if (tableNumberWrap) {
      tableNumberWrap.classList.toggle("hidden", serviceType !== "dine_in");
    }

    if (tableNumberInput && tableNumberInput.value !== tableNumber) {
      tableNumberInput.value = tableNumber;
    }

    const selectedClasses = ["border-indigo-400/70", "bg-indigo-500/15", "ring-1", "ring-indigo-400/40"];
    const normalClasses = ["border-white/10", "bg-white/5"];

    const applyOptionState = (el, selected) => {
      if (!el) return;
      el.classList.remove(...selectedClasses, ...normalClasses);
      if (selected) {
        el.classList.add(...selectedClasses);
      } else {
        el.classList.add(...normalClasses);
      }
    };

    applyOptionState(dineInOption, serviceType === "dine_in");
    applyOptionState(takeawayOption, serviceType === "takeaway");

    if (serviceSummary) {
      serviceSummary.textContent =
        serviceType === "dine_in"
          ? (tableValue ? `Dine In â€¢ Table ${tableValue}` : "Dine In")
          : serviceLabel();
    }

    if (serviceError) {
      const check = getServiceSelection();
      serviceError.textContent = check.message || "";
      serviceError.classList.toggle("hidden", check.ok || !cart.length);
    }
  }

  function resetServiceSelection() {
    serviceType = "";
    tableNumber = "";
    if (tableNumberInput) tableNumberInput.value = "";
    if (serviceModeDineIn) serviceModeDineIn.checked = false;
    if (serviceModeTakeaway) serviceModeTakeaway.checked = false;
    renderServicePanel();
  }

  function getRestaurants() {
    return safeArray(safeState().restaurants);
  }

  function getRestaurant() {
    const restaurants = getRestaurants();
    if (!restaurants.length) return null;
    return restaurants.find((r) => r.id === activeRestaurantId) || restaurants[0];
  }

  function getRestaurantById(id) {
    return getRestaurants().find((r) => r.id === id) || null;
  }

  function uniqueCategories(menu) {
    const cats = ["All"];
    for (const m of safeArray(menu)) {
      if (m?.category && !cats.includes(m.category)) cats.push(m.category);
    }
    return cats;
  }

  function resetIdle() {
    idleSeconds = 0;
    if (adsOverlay && !adsOverlay.classList.contains("hidden")) {
      hideAds();
    }
  }

  function hideAds() {
    if (adsOverlay) adsOverlay.classList.add("hidden");
    if (adTimer) clearInterval(adTimer);
    adTimer = null;
  }

  function showAds() {
    const s = safeState();
    const enabledAds = safeArray(s.ads).filter((a) => a && a.enabled);

    if (!enabledAds.length || !adsOverlay || !adTitle || !adSubtitle) return;

    const renderAd = () => {
      const ad = enabledAds[adsIdx % enabledAds.length];
      if (!ad) return;
      adTitle.textContent = ad.title || "";
      adSubtitle.textContent = ad.subtitle || "";
      trackAdImpressionSafe(ad.id);
    };

    adsOverlay.classList.remove("hidden");
    renderAd();

    if (adTimer) clearInterval(adTimer);
    adTimer = setInterval(() => {
      adsIdx = (adsIdx + 1) % enabledAds.length;
      renderAd();
    }, 5000);
  }

  ["mousemove", "mousedown", "touchstart", "keydown", "scroll"].forEach((evt) => {
    window.addEventListener(evt, resetIdle, { passive: true });
  });

  if (adsOverlay) {
    adsOverlay.addEventListener("click", resetIdle);
  }

  setInterval(() => {
    const s = safeState();
    const afterSeconds = Number(s.settings?.idleAdsAfterSeconds || 240);
    idleSeconds += 1;
    if (idleSeconds >= afterSeconds) {
      showAds();
    }
  }, 1000);

  function addToCart(restaurantId, menuItem) {
    if (!menuItem) return;

    if (cart.length && cart[0].restaurantId !== restaurantId) {
      alertSafe("Cart contains items from another restaurant. Clear cart to switch restaurants.");
      return;
    }

    const found = cart.find((x) => x.itemId === menuItem.id);
    if (found) {
      found.qty += 1;
    } else {
      cart.push({
        restaurantId,
        itemId: menuItem.id,
        name: menuItem.name,
        price: Number(menuItem.price || 0),
        qty: 1
      });
    }

    saveSession();
    renderCart();
  }

  function updateQty(itemId, delta) {
    const it = cart.find((x) => x.itemId === itemId);
    if (!it) return;

    it.qty += delta;

    if (it.qty <= 0) {
      cart = cart.filter((x) => x.itemId !== itemId);
    }

    saveSession();
    renderCart();
  }

  function clearCart() {
    cart = [];
    resetServiceSelection();
    resetPaymentMethodSelection();
    saveSession();
    renderCart();
  }

  async function refreshQueueCount() {
    if (!elQueueCount) return;

    const orders = await fetchAllOrdersSafe();
    const count = safeArray(orders).filter((o) =>
      ["paid", "preparing", "ready"].includes(o.status)
    ).length;

    elQueueCount.textContent = String(count);
  }

  function renderTabs() {
    if (!elTabs) return;

    const restaurants = getRestaurants();
    const current = getRestaurant();
    if (current) activeRestaurantId = current.id;

    elTabs.innerHTML = "";

    restaurants.forEach((r) => {
      const btn = document.createElement("button");
      btn.className =
        "px-4 py-2 rounded-2xl border border-white/10 text-sm " +
        (r.id === activeRestaurantId ? "bg-white/10" : "bg-white/5 hover:bg-white/10");

      btn.innerHTML = `
        <div class="font-semibold">${r.name || "Restaurant"}</div>
        <div class="text-xs text-slate-400">${r.online ? "Online" : "Offline"}</div>
      `;

      btn.onclick = async () => {
        activeRestaurantId = r.id;
        saveSession();
        await renderAll();
      };

      elTabs.appendChild(btn);
    });
  }

  function renderCategorySelect() {
    if (!elCategory) return;

    const r = getRestaurant();
    const cats = uniqueCategories(r?.menu || []);
    const current = elCategory.value || "All";

    elCategory.innerHTML = "";

    cats.forEach((c) => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      elCategory.appendChild(o);
    });

    elCategory.value = cats.includes(current) ? current : "All";
  }

  async function renderMenu() {
    if (!elMenu) return;

    const s = safeState();
    const r = getRestaurant();

    if (!r) {
      elMenu.innerHTML = `<div class="text-sm text-slate-400">No restaurants loaded.</div>`;
      if (elActiveName) elActiveName.textContent = "Restaurant";
      if (elActiveTagline) elActiveTagline.textContent = "Tagline";
      return;
    }

    if (elActiveName) elActiveName.textContent = r.name || "Restaurant";
    if (elActiveTagline) elActiveTagline.textContent = r.tagline || "Tagline";
    if (elTaxRateLabel) {
      elTaxRateLabel.textContent = Math.round((Number(s.settings?.taxRate || 0.13)) * 100) + "%";
    }

    await refreshQueueCount();

    const search = (elSearch?.value || "").toLowerCase().trim();
    const cat = elCategory?.value || "All";

    const filtered = safeArray(r.menu).filter((m) => {
      if (cat !== "All" && m.category !== cat) return false;
      if (search && !String(m.name || "").toLowerCase().includes(search)) return false;
      return true;
    });

    elMenu.innerHTML = "";

    if (!filtered.length) {
      elMenu.innerHTML = `<div class="text-sm text-slate-400">No matching items found.</div>`;
      return;
    }

    filtered.forEach((m) => {
      const card = document.createElement("div");
      card.className = "card p-4";

      const available = !!(r.online && m.available);

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold">${m.name || ""}</div>
            <div class="text-xs text-slate-400 mt-1">${m.category || "General"} â€¢ ${m.fast ? "Fast item" : "Standard"}</div>
          </div>
          <div class="text-sm font-semibold">${money(Number(m.price || 0))}</div>
        </div>
        <div class="mt-4 flex items-center justify-between">
          <div class="text-xs ${available ? "text-emerald-300" : "text-rose-300"}">
            ${available ? "Available" : (r.online ? "Out of stock" : "Restaurant offline")}
          </div>
          <button class="${available ? "btn-primary" : "btn-ghost opacity-40 cursor-not-allowed"} text-sm" ${available ? "" : "disabled"}>
            Add
          </button>
        </div>
      `;

      const btn = card.querySelector("button");
      btn.onclick = () => {
        if (!available) return;
        addToCart(r.id, m);
      };

      elMenu.appendChild(card);
    });
  }

  function renderCart() {
    if (!elCart || !elSubtotal || !elTax || !elTotal || !elCheckout) return;

    elCart.innerHTML = "";

    if (!cart.length) {
      elCart.innerHTML = `<div class="text-sm text-slate-400">Cart is empty. Add items to proceed.</div>`;
    } else {
      cart.forEach((it) => {
        const row = document.createElement("div");
        row.className = "flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10";

        row.innerHTML = `
          <div class="min-w-0">
            <div class="font-semibold truncate">${it.name || ""}</div>
            <div class="text-xs text-slate-400 mt-1">${money(Number(it.price || 0))} â€¢ Qty ${Number(it.qty || 0)}</div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button class="btn-ghost text-sm px-3 py-2">-</button>
            <button class="btn-ghost text-sm px-3 py-2">+</button>
          </div>
        `;

        const [minus, plus] = row.querySelectorAll("button");
        minus.onclick = () => updateQty(it.itemId, -1);
        plus.onclick = () => updateQty(it.itemId, +1);

        elCart.appendChild(row);
      });
    }

    const totals = computeTotals(cart);
    elSubtotal.textContent = money(totals.subtotal);
    elTax.textContent = money(totals.tax);
    elTotal.textContent = money(totals.total);

    renderServicePanel();
    renderPaymentMethodPanel();

    const serviceReady = getServiceSelection().ok;
    const paymentReady = getPaymentMethodSelection().ok;
    const disabled = cart.length === 0 || !serviceReady || !paymentReady;
    elCheckout.disabled = disabled;
    elCheckout.classList.toggle("opacity-50", disabled);
  }

  function hideFlow() {
    if (elFlowPanel) elFlowPanel.classList.add("hidden");
  }

  function renderFlow(order) {
    if (!elFlowPanel || !order) return;

    elFlowPanel.classList.remove("hidden");
    elFlowPanel.className = "mt-6 glass p-5 rounded-3xl";

    const r = getRestaurantById(order.restaurantId) || getRestaurant();
    const items = safeArray(order.items);
    const svcText = serviceText(order);

    if (order.status === "pending_approval") {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">Order Sent</div>
            <div class="text-xl font-semibold mt-1">Waiting for Approval</div>
            <div class="text-sm text-slate-300 mt-2">Order <span class="pill">${order.id}</span> sent to <span class="pill">${r?.name || "Restaurant"}</span> â€¢ <span class="pill">${svcText}</span></div>
          </div>
          <div class="pill badge-yellow">Pending</div>
        </div>
        <div class="mt-4 text-sm text-slate-400">Restaurant will approve/reject based on availability.</div>
      `;
      return;
    }

    if (order.status === "rejected") {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">Rejected</div>
            <div class="text-xl font-semibold mt-1">Order Not Available</div>
            <div class="text-sm text-slate-300 mt-2">Reason: <span class="pill">${order.rejectReason || "Not specified"}</span></div>
          </div>
          <div class="pill badge-red">Rejected</div>
        </div>
        <div class="mt-5 flex gap-2">
          <button id="tryAgainBtn" class="btn-primary">Modify & Try Again</button>
          <button id="cancelBtn" class="btn-ghost">Cancel</button>
        </div>
      `;

      const tryAgainBtn = elFlowPanel.querySelector("#tryAgainBtn");
      const cancelBtn = elFlowPanel.querySelector("#cancelBtn");

      if (tryAgainBtn) {
        tryAgainBtn.onclick = () => {
          awaitingOrderId = null;
          saveSession();
          hideFlow();
        };
      }

      if (cancelBtn) {
        cancelBtn.onclick = () => {
          awaitingOrderId = null;
          cart = [];
          saveSession();
          renderCart();
          hideFlow();
        };
      }

      return;
    }

    if (order.status === "approved" || order.status === "awaiting_payment" || order.status === "awaiting_cash_payment") {
      const method = paymentMethodOf(order);

      if (method === "cash") {
        const pendingCash = order.status === "awaiting_cash_payment";
        elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">${pendingCash ? "Cash Payment" : "Approved"}</div>
            <div class="text-xl font-semibold mt-1">${pendingCash ? "Waiting for Cash Confirmation" : "Cash Slip Starting"}</div>
            <div class="text-sm text-slate-300 mt-2">
              Estimated prep: <span class="pill">${r?.prepTimeMins || 15} min</span>
              • <span class="pill">${svcText}</span>
              • <span class="pill">Cash Payment</span>
            </div>
            <div class="text-sm text-slate-400 mt-3">
              Print the cash slip and take payment at counter. Staff must scan the cash confirmation QR and confirm payment before preparation starts.
            </div>
          </div>
          <div class="pill badge-yellow">${pendingCash ? "Cash Pending" : "Approved"}</div>
        </div>
        <div class="mt-5 flex gap-2 flex-wrap">
          <button id="cashSlipBtn" class="btn-primary">${pendingCash ? "Reprint Cash Slip" : "Print Cash Slip"}</button>
          <button id="trackBtn" class="btn-ghost">Open Tracking Page</button>
        </div>
      `;

        const cashSlipBtn = elFlowPanel.querySelector("#cashSlipBtn");
        const trackBtn = elFlowPanel.querySelector("#trackBtn");

        if (cashSlipBtn) {
          cashSlipBtn.onclick = async () => {
            await openCashSlip(order.id);
          };
        }

        if (trackBtn) {
          trackBtn.onclick = () => {
            window.open(trackingUrlForOrder(order), "_blank", "noopener,noreferrer");
          };
        }

        if (order.status === "approved" && autoCashSlipStartedForOrderId !== order.id) {
          autoCashSlipStartedForOrderId = order.id;
          setTimeout(async () => {
            await openCashSlip(order.id);
          }, 500);
        }

        return;
      }

      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">Approved</div>
            <div class="text-xl font-semibold mt-1">Stripe Payment Starting</div>
            <div class="text-sm text-slate-300 mt-2">
              Estimated prep: <span class="pill">${r?.prepTimeMins || 15} min</span>
              • <span class="pill">${svcText}</span>
              • Priority: <span class="pill">${items.some((i) => i.fast) ? "Fast items" : "Standard"}</span>
            </div>
            <div class="text-sm text-slate-400 mt-3">
              Payment QR will open automatically. Scan it to pay through Stripe sandbox.
            </div>
          </div>
          <div class="pill badge-green">Approved</div>
        </div>
      `;

      if (autoStripeStartedForOrderId !== order.id) {
        autoStripeStartedForOrderId = order.id;
        setTimeout(async () => {
          await openPayment(order.id);
        }, 500);
      }

      return;
    }

    if (["paid", "preparing", "ready", "completed"].includes(order.status)) {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">In Queue</div>
            <div class="text-xl font-semibold mt-1">Order Confirmed</div>
            <div class="text-sm text-slate-300 mt-2">Order <span class="pill">${order.id}</span> is now in preparation queue. <span class="pill">${svcText}</span></div>
          </div>
          <div class="pill badge-green">${String(order.status).toUpperCase()}</div>
        </div>
        <div class="mt-4 text-sm text-slate-400">You can show this screen as proof of payment.</div>
      `;
    }
  }

  async function refreshFlowPanel() {
    if (!awaitingOrderId) {
      hideFlow();
      return;
    }

    const o = await getOrderSafe(awaitingOrderId);
    if (o) renderFlow(o);
    else hideFlow();
  }
async function browserPrintSlipOnly(orderId) {
  const order = await getOrderSafe(orderId);
  if (!order) return false;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Cash Slip ${escapeHtml(order.id)}</title>
        <style>${getReceiptCss()}</style>
      </head>
      <body>
        ${buildFullReceiptMarkup(order)}
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => {
        iframe.remove();
      }, 1200);
    }
  }, 900);

  simulatePrinterPaperUseSafe();
  return true;
}
  async function openCashSlip(orderId) {
  const order = await getOrderSafe(orderId);

  if (!order) {
    alertSafe("Order not found. Cannot print cash slip.");
    return;
  }

  const payment = {
    ...safeObject(order.payment),
    attemptCount: Number(order.payment?.attemptCount || 0) + 1,
    success: false,
    method: "cash",
    paymentMethod: "cash",
    provider: "Cash Counter",
    cashSlipPrintedAt: nowISO(),
    trackingUrl: trackingUrlForOrder(order),
    cashConfirmUrl: cashConfirmUrlForOrder(order)
  };

  try {
    await updateOrderSafe(orderId, {
      status: "awaiting_payment",
      payment
    });

    awaitingOrderId = orderId;
    saveSession();

    logSafe(`Cash slip generated for ${orderId}.`);

    await openReceipt(orderId);

    setTimeout(async () => {
      await browserPrintSlipOnly(orderId);
    }, 700);

    await refreshFlowPanel();
  } catch (err) {
    console.error("kiosk.js: cash slip failed", err);
    alertSafe(`Cash slip failed: ${err.message || err}`);
  }
  }

  async function openPayment(orderId) {
    const order = await getOrderSafe(orderId);
    if (!order) return;

    if (paymentMethodOf(order) === "cash" || normalizePaymentMethod(paymentMethod) === "cash") {
      await openCashSlip(orderId);
      return;
    }

    currentPayOrderId = orderId;
    currentStripeCheckoutUrl = "";

    if (paymentModal) paymentModal.classList.remove("hidden");

    if (qrBox) {
      qrBox.innerHTML = `
        <div class="text-slate-900 text-sm p-4 text-center">
          Creating Stripe checkout...
        </div>
      `;
      qrBox.onclick = null;
    }

    if (payAmount) {
      payAmount.textContent = `Amount: ${money(order.total)} (${order.currency || "PKR"})`;
    }

    if (payCountdown) {
      payCountdown.textContent = "Stripe";
    }

    if (payStatus) {
      payStatus.textContent = "Creating secure Stripe payment session...";
    }

    if (simulateFailBtn) {
      simulateFailBtn.classList.add("hidden");
    }

    if (simulatePayBtn) {
      simulatePayBtn.classList.remove("hidden");
      simulatePayBtn.disabled = true;
      simulatePayBtn.textContent = "Preparing Stripe...";
    }

    if (payInterval) clearInterval(payInterval);
    payInterval = null;

    const payment = {
      ...safeObject(order.payment),
      attemptCount: Number(order.payment?.attemptCount || 0) + 1,
      success: false,
      method: "online",
      paymentMethod: "online",
      provider: "Stripe",
      createdAt: nowISO()
    };

    await updateOrderSafe(orderId, {
      status: "awaiting_payment",
      payment
    });

    try {
      const restaurant = getRestaurantById(order.restaurantId);

      const payload = {
        ...order,
        restaurantName: restaurant?.name || "Restaurant",
        serviceType: order.serviceType || order.service_type || "",
        tableNumber: order.tableNumber || order.table_number || "",
        currency: order.currency || "PKR"
      };

      const stripeSession = await createStripeCheckoutSession(payload);
      currentStripeCheckoutUrl = stripeSession.url;

      const updatedPayment = {
        ...payment,
        stripeSessionId: stripeSession.sessionId,
        stripeCheckoutUrl: stripeSession.url
      };

      await updateOrderSafe(orderId, {
        status: "awaiting_payment",
        payment: updatedPayment
      });

      showStripeQr(stripeSession.url);

      if (payStatus) {
        payStatus.textContent = "Scan this QR code to pay with Stripe sandbox, or tap Open Stripe Checkout.";
      }

      if (simulatePayBtn) {
        simulatePayBtn.disabled = false;
        simulatePayBtn.textContent = "Open Stripe Checkout";
        simulatePayBtn.onclick = () => {
          window.location.href = stripeSession.url;
        };
      }

      startStripePolling(orderId, stripeSession.sessionId);
    } catch (err) {
      console.error("kiosk.js: Stripe checkout failed", err);

      if (payStatus) {
        payStatus.textContent = `Stripe checkout failed: ${err.message || err}`;
      }

      if (simulatePayBtn) {
        simulatePayBtn.disabled = false;
        simulatePayBtn.textContent = "Retry Stripe Payment";
        simulatePayBtn.onclick = async () => {
          currentStripeCheckoutUrl = "";
          await openPayment(orderId);
        };
      }
    }

    await refreshFlowPanel();
  }

  async function closePayment() {
    if (paymentModal) paymentModal.classList.add("hidden");
    if (payInterval) clearInterval(payInterval);
    payInterval = null;
    if (qrBox) {
      qrBox.innerHTML = "";
      qrBox.onclick = null;
      qrBox.style.cursor = "";
    }
    currentPayOrderId = null;
    currentStripeCheckoutUrl = "";
    await refreshFlowPanel();
  }

  if (closePaymentBtn) {
    closePaymentBtn.onclick = async () => {
      await closePayment();
    };
  }

  if (simulateFailBtn) {
    simulateFailBtn.classList.add("hidden");
  }

  if (simulatePayBtn) {
    simulatePayBtn.textContent = "Open Stripe Checkout";
    simulatePayBtn.onclick = () => {
      if (!currentStripeCheckoutUrl) {
        if (payStatus) payStatus.textContent = "Stripe Checkout is still loading...";
        return;
      }

      window.location.href = currentStripeCheckoutUrl;
    };
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getReceiptCss() {
    return `
    @page {
      size: 80mm;
      margin: 0;
    }

    html {
      margin: 0;
      padding: 0;
      width: 80mm;
      background: #ffffff;
    }

    body {
      margin: 0;
      padding: 0;
      width: 80mm;
      background: #ffffff;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      box-sizing: border-box;
      overflow: hidden;
    }

    .print-shell {
      width: 80mm;
      box-sizing: border-box;
      padding: 2mm 3mm 2mm 3mm;
      background: #fff;
      display: inline-block;
    }

    .print-root {
      width: 74mm;
      margin: 0 auto;
      background: #fff;
      font-size: 12px;
      line-height: 1.28;
    }

    .slip {
      margin: 0;
      padding: 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .copy-badge {
      text-align: center;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      margin: 0 0 5px 0;
    }

    .title {
      font-size: 20px;
      font-weight: 700;
      text-align: center;
      margin: 0;
    }

    .sub-title {
      font-size: 12px;
      text-align: center;
      margin-top: 3px;
    }

    .meta {
      font-size: 11px;
      text-align: center;
      margin-top: 4px;
    }

    .divider {
      border: 0;
      border-top: 1px dashed #000;
      margin: 7px 0;
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .row + .row {
      margin-top: 3px;
    }

    .label {
      font-size: 12px;
    }

    .value {
      font-size: 12px;
      text-align: right;
      white-space: nowrap;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 12px;
    }

    th, td {
      padding: 4px 0;
      vertical-align: top;
    }

    th {
      font-weight: 700;
      border-bottom: 1px solid #000;
    }

    td.item {
      width: 62%;
      padding-right: 6px;
      word-break: break-word;
    }

    td.qty, th.qty {
      width: 14%;
      text-align: center;
    }

    td.amount, th.amount {
      width: 24%;
      text-align: right;
      white-space: nowrap;
    }

    .kitchen-items td.item,
    .kitchen-items th.item {
      width: 86%;
      text-align: left;
      padding-right: 6px;
      word-break: break-word;
    }

    .kitchen-items td.qty,
    .kitchen-items th.qty {
      width: 14%;
      text-align: center;
      white-space: nowrap;
    }

    .totals {
      margin-top: 7px;
    }

    .grand-total {
      margin-top: 5px;
      padding-top: 5px;
      border-top: 1px solid #000;
      font-size: 16px;
      font-weight: 700;
    }

    .footer {
      margin-top: 9px;
      text-align: center;
      font-size: 11px;
    }

    .tear-separator {
      margin: 4mm 0 3mm 0;
      text-align: center;
    }

    .tear-separator .line {
      border-top: 1px dashed #000;
      height: 0;
    }

    .tear-separator .text {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      margin: 2px 0;
    }

    .kitchen-note {
      margin-top: 9px;
      border: 1px dashed #000;
      padding: 6px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
    }

    .prep-note {
      margin-top: 7px;
      text-align: center;
      font-size: 11px;
    }

    .qr-section {
      margin-top: 8px;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .qr-title {
      font-size: 10px;
      font-weight: 700;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .qr-img {
      width: 30mm;
      height: 30mm;
      display: block;
      margin: 0 auto;
      border: 1px solid #000;
      padding: 1mm;
      box-sizing: border-box;
    }

    .qr-url {
      margin-top: 3px;
      font-size: 8px;
      word-break: break-all;
      line-height: 1.15;
    }

    .payment-warning {
      margin-top: 7px;
      border: 1px dashed #000;
      padding: 6px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
    }


    @media screen {
      html, body {
        width: auto;
        overflow: auto;
        background: transparent;
      }

      .print-shell {
        width: auto;
        max-width: 340px;
        padding: 10px;
        border-radius: 12px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      }

      .print-root {
        width: 100%;
      }
    }
  `;
  }


  function qrServiceUrl(value, size = 180) {
    const text = String(value || "").trim();
    if (!text) return "";

    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
  }

  function qrBlock(title, value) {
    const text = String(value || "").trim();
    if (!text) return "";

    return `
      <div class="qr-section">
        <div class="qr-title">${escapeHtml(title)}</div>
        <img class="qr-img" src="${escapeHtml(qrServiceUrl(text, 180))}" alt="${escapeHtml(title)} QR">
        <div class="qr-url">${escapeHtml(text)}</div>
      </div>
    `;
  }

  function orderPaymentMethodText(order = {}) {
    const method = paymentMethodOf(order);
    return method === "cash" ? "Cash" : "Online / Stripe";
  }

  function orderIsCashPending(order = {}) {
    const status = String(order.status || "").toLowerCase();
    const payment = safeObject(order.payment);

    return (
      paymentMethodOf(order) === "cash" &&
      !payment.success &&
      ["approved", "awaiting_payment", "awaiting_cash_payment"].includes(status)
    );
  }

  function buildCustomerSlip(order) {
    const restaurant = getRestaurantById(order.restaurantId);
    const receiptDate = order.paidAt || order.createdAt || nowISO();
    const trackingUrl = trackingUrlForOrder(order);
    const cashConfirmUrl = cashConfirmUrlForOrder(order);
    const cashPending = orderIsCashPending(order);

    const itemRows = safeArray(order.items).map((item) => {
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.price || 0);
      const lineTotal = qty * unitPrice;

      return `
      <tr>
        <td class="item">${escapeHtml(item.name)}</td>
        <td class="qty">${qty}</td>
        <td class="amount">${escapeHtml(money(lineTotal))}</td>
      </tr>
    `;
    }).join("");

    return `
    <section class="slip">
      <div class="copy-badge">${cashPending ? "CASH PAYMENT SLIP" : "CUSTOMER COPY"}</div>
      <div class="title">Food Court Kiosk</div>
      <div class="sub-title">${escapeHtml(restaurant?.name || "")}</div>
      <div class="meta">${cashPending ? "Cash Slip" : "Receipt"} • ${escapeHtml(new Date(receiptDate).toLocaleString())}</div>

      <hr class="divider" />

      <div class="row">
        <div class="label">Order ID</div>
        <div class="value"><b>${escapeHtml(order.id)}</b></div>
      </div>
      <div class="row">
        <div class="label">Order Type</div>
        <div class="value"><b>${escapeHtml(serviceText(order))}</b></div>
      </div>
      <div class="row">
        <div class="label">Payment Method</div>
        <div class="value"><b>${escapeHtml(orderPaymentMethodText(order))}</b></div>
      </div>
      <div class="row">
        <div class="label">Payment Status</div>
        <div class="value"><b>${escapeHtml(paymentStatusText(order))}</b></div>
      </div>

      <table>
        <thead>
          <tr>
            <th align="left">Item</th>
            <th class="qty">Qty</th>
            <th class="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <hr class="divider" />

      <div class="totals">
        <div class="row">
          <div class="label">Subtotal</div>
          <div class="value">${escapeHtml(money(order.subtotal || 0))}</div>
        </div>
        <div class="row">
          <div class="label">Tax</div>
          <div class="value">${escapeHtml(money(order.tax || 0))}</div>
        </div>
        <div class="row grand-total">
          <div>Total</div>
          <div>${escapeHtml(money(order.total || 0))}</div>
        </div>
      </div>

      ${cashPending ? `
        <div class="payment-warning">
          CASH NOT PAID YET<br>
          Staff must confirm payment before preparation starts.
        </div>
        ${qrBlock("Staff Cash Confirmation", cashConfirmUrl)}
      ` : ""}

      ${qrBlock("Customer Order Tracking", trackingUrl)}

      <div class="footer">
        ${cashPending ? "Take this slip to cash counter" : "Thank you"}<br>
        ${cashPending ? "Meal starts after cash confirmation" : "Please wait for your order"}
      </div>
    </section>
  `;
  }

  function buildRestaurantSlip(order) {
    const restaurant = getRestaurantById(order.restaurantId);
    const receiptDate = order.paidAt || order.createdAt || nowISO();
    const cashPending = orderIsCashPending(order);

    const itemRows = safeArray(order.items).map((item) => {
      const qty = Number(item.qty || 0);

      return `
      <tr>
        <td class="item">${escapeHtml(item.name)}</td>
        <td class="qty">${qty}</td>
      </tr>
    `;
    }).join("");

    return `
    <section class="slip">
      <div class="copy-badge">RESTAURANT COPY</div>
      <div class="title">${escapeHtml(restaurant?.name || "Restaurant")}</div>
      <div class="meta">Order • ${escapeHtml(order.id)}</div>
      <div class="meta">${escapeHtml(serviceText(order))}</div>
      <div class="meta">${escapeHtml(new Date(receiptDate).toLocaleString())}</div>
      <div class="meta">Payment • ${escapeHtml(paymentStatusText(order))}</div>

      <hr class="divider" />

      <table class="kitchen-items">
        <thead>
          <tr>
            <th class="item">Item</th>
            <th class="qty">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div class="kitchen-note">
        ${cashPending ? "CASH PENDING • DO NOT START PREPARATION" : "PAID ORDER • START PREPARATION"}
      </div>
      <div class="prep-note">
        ${cashPending ? "Wait until cashier confirms cash payment" : "Give this slip to the waiter / restaurant"}
      </div>
    </section>
  `;
  }

  function buildTearSeparator() {
    return `
    <div class="tear-separator">
      <div class="line"></div>
      <div class="text">TEAR HERE</div>
      <div class="line"></div>
    </div>
  `;
  }

  function buildFullReceiptMarkup(order) {
    return `
    <div class="print-shell">
      <div class="print-root">
        ${buildCustomerSlip(order)}
        ${buildTearSeparator()}
        ${buildRestaurantSlip(order)}
      </div>
    </div>
  `;
  }

  async function renderReceiptPreview(orderId) {
    const order = await getOrderSafe(orderId);
    if (!order || !receiptModal || !printArea || !receiptHint) return;

    currentReceiptOrderId = orderId;
    receiptModal.classList.remove("hidden");

    if (receiptHint) {
      receiptHint.textContent = orderIsCashPending(order)
        ? `Print this cash slip. Staff must confirm cash payment. Order ID: ${order.id}`
        : `Show/print this receipt. Order ID: ${order.id}`;
    }

    printArea.style.maxHeight = "calc(100vh - 250px)";
    printArea.style.overflowY = "auto";
    printArea.style.overflowX = "hidden";
    printArea.style.paddingRight = "6px";
    printArea.style.scrollBehavior = "smooth";

    printArea.innerHTML = `
    <style>${getReceiptCss()}</style>
    ${buildFullReceiptMarkup(order)}
  `;

    printArea.scrollTop = 0;
  }

  async function openReceipt(orderId) {
    await renderReceiptPreview(orderId);
  }

  async function printReceiptOnly(orderId) {
    const order = await getOrderSafe(orderId);
    if (!order) return false;

    const restaurant = getRestaurantById(order.restaurantId);
    const payload = {
      ...order,
      restaurantName: restaurant?.name || "Restaurant",
      serviceType: order.serviceType || order.service_type || "",
      tableNumber: order.tableNumber || order.table_number || "",
      paymentMethod: paymentMethodOf(order),
      paymentStatus: paymentStatusText(order),
      trackingUrl: trackingUrlForOrder(order),
      cashConfirmUrl: cashConfirmUrlForOrder(order)
    };

    if (typeof FC.printReceiptSilently === "function") {
      const oldPrintText = printBtn ? printBtn.textContent : "Print Receipt";
      const oldDoneText = doneBtn ? doneBtn.textContent : "Done";

      try {
        if (printBtn) {
          printBtn.disabled = true;
          printBtn.classList.add("opacity-50");
          printBtn.textContent = "Printing...";
        }

        if (doneBtn) {
          doneBtn.disabled = true;
          doneBtn.classList.add("opacity-50");
          doneBtn.textContent = "Please wait...";
        }

        if (receiptHint) {
          receiptHint.textContent = `Printing receipt for Order ID: ${order.id}...`;
        }

        await FC.printReceiptSilently(payload);
        simulatePrinterPaperUseSafe();

        if (receiptHint) {
          receiptHint.textContent = `Receipt printed successfully. Order ID: ${order.id}`;
        }

        return true;
      } catch (err) {
        console.error("kiosk.js: silent print failed", err);
        if (receiptHint) {
          receiptHint.textContent = `Printing failed for Order ID: ${order.id}`;
        }
        alertSafe(`Printing failed: ${err.message || err}`);
        return false;
      } finally {
        if (printBtn) {
          printBtn.disabled = false;
          printBtn.classList.remove("opacity-50");
          printBtn.textContent = oldPrintText;
        }

        if (doneBtn) {
          doneBtn.disabled = false;
          doneBtn.classList.remove("opacity-50");
          doneBtn.textContent = oldDoneText;
        }
      }
    }

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden", "true");

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Receipt ${escapeHtml(order.id)}</title>
        <style>${getReceiptCss()}</style>
      </head>
      <body>
        ${buildFullReceiptMarkup(order)}
      </body>
    </html>
  `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } finally {
        const cleanup = () => {
          setTimeout(() => {
            iframe.remove();
          }, 500);
        };

        if ("onafterprint" in iframe.contentWindow) {
          iframe.contentWindow.onafterprint = cleanup;
        } else {
          cleanup();
        }
      }
    }, 350);

    simulatePrinterPaperUseSafe();
    return true;
  }

  async function closeReceipt() {
    if (receiptModal) receiptModal.classList.add("hidden");

    if (printArea) {
      printArea.scrollTop = 0;
      printArea.style.maxHeight = "";
      printArea.style.overflowY = "";
      printArea.style.overflowX = "";
      printArea.style.paddingRight = "";
      printArea.style.scrollBehavior = "";
    }

    if (awaitingOrderId) {
      const o = await getOrderSafe(awaitingOrderId);

      if (o && o.status === "paid") {
        await updateOrderSafe(o.id, { status: "preparing" });
      }

      if (o && o.status === "awaiting_cash_payment") {
        currentReceiptOrderId = null;
        renderFlow(o);
        await refreshQueueCount();
        return;
      }
    }

    awaitingOrderId = null;
    currentReceiptOrderId = null;
    cart = [];
    resetServiceSelection();
    resetPaymentMethodSelection();
    saveSession();
    renderCart();
    hideFlow();
    await renderAll();
  }

  if (closeReceiptBtn) {
    closeReceiptBtn.onclick = async () => {
      await closeReceipt();
    };
  }

  if (doneBtn) {
    doneBtn.onclick = async () => {
      await closeReceipt();
    };
  }

  if (printBtn) {
    printBtn.onclick = async () => {
      if (!currentReceiptOrderId) return;
      await printReceiptOnly(currentReceiptOrderId);
    };
  }

  if (paymentMethodOnline) {
    paymentMethodOnline.addEventListener("change", () => {
      setPaymentMethod("online");
    });
  }

  if (paymentMethodCash) {
    paymentMethodCash.addEventListener("change", () => {
      setPaymentMethod("cash");
    });
  }

  if (onlinePaymentOption) {
    onlinePaymentOption.addEventListener("click", () => {
      if (paymentMethodOnline) paymentMethodOnline.checked = true;
      setPaymentMethod("online");
    });
  }

  if (cashPaymentOption) {
    cashPaymentOption.addEventListener("click", () => {
      if (paymentMethodCash) paymentMethodCash.checked = true;
      setPaymentMethod("cash");
    });
  }

  if (serviceModeDineIn) {
    serviceModeDineIn.addEventListener("change", () => {
      setServiceType("dine_in");
      if (tableNumberInput) {
        setTimeout(() => tableNumberInput.focus(), 30);
      }
    });
  }

  if (serviceModeTakeaway) {
    serviceModeTakeaway.addEventListener("change", () => {
      setServiceType("takeaway");
    });
  }

  if (dineInOption) {
    dineInOption.addEventListener("click", () => {
      if (serviceModeDineIn) serviceModeDineIn.checked = true;
      setServiceType("dine_in");
      if (tableNumberInput) {
        setTimeout(() => tableNumberInput.focus(), 30);
      }
    });
  }

  if (takeawayOption) {
    takeawayOption.addEventListener("click", () => {
      if (serviceModeTakeaway) serviceModeTakeaway.checked = true;
      setServiceType("takeaway");
    });
  }

  if (tableNumberInput) {
    tableNumberInput.addEventListener("input", () => {
      tableNumber = String(tableNumberInput.value || "").trim();
      saveSession();
      renderServicePanel();
      renderCart();
    });
  }

  if (elCheckout) {
    elCheckout.onclick = async () => {
      if (!cart.length) return;

      const serviceSelection = getServiceSelection();
      if (!serviceSelection.ok) {
        if (serviceError) {
          serviceError.textContent = serviceSelection.message;
          serviceError.classList.remove("hidden");
        }
        return;
      }

      const paymentSelection = getPaymentMethodSelection();
      if (!paymentSelection.ok) {
        if (paymentMethodError) {
          paymentMethodError.textContent = paymentSelection.message;
          paymentMethodError.classList.remove("hidden");
        }
        return;
      }

      serviceType = serviceSelection.serviceType;
      tableNumber = serviceSelection.tableNumber;
      paymentMethod = paymentSelection.paymentMethod;
      saveSession();
      renderServicePanel();
      renderPaymentMethodPanel();

      const r = getRestaurant();
      if (!r) {
        alertSafe("No restaurant loaded.");
        return;
      }

      if (!r.online) {
        alertSafe("Restaurant is offline right now.");
        return;
      }

      const allAvailable = cart.every((ci) => {
        const mi = safeArray(r.menu).find((x) => x.id === ci.itemId);
        return mi && mi.available;
      });

      const totals = computeTotals(cart);

      try {
        const order = await createOrderSafe({
          restaurantId: r.id,
          serviceType: serviceSelection.serviceType,
          tableNumber: serviceSelection.tableNumber,
          paymentMethod: paymentSelection.paymentMethod,
          items: cart.map((x) => ({
            ...x,
            fast: !!safeArray(r.menu).find((m) => m.id === x.itemId)?.fast
          })),
          totals
        });

        awaitingOrderId = order.id;
        saveSession();
        renderFlow(order);
        await refreshQueueCount();

        if (allAvailable && r.online) {
          setTimeout(async () => {
            const o = await getOrderSafe(order.id);
            if (o && o.status === "pending_approval") {
              await updateOrderSafe(order.id, {
                status: "approved",
                approvedAt: nowISO()
              });
              logSafe(`Order ${order.id} auto-approved (restaurant online + items available).`);
            }
          }, 900);
        }
      } catch (err) {
        console.error("Checkout failed:", err);
        alertSafe(`Checkout failed: ${err.message || err}`);
      }
    };
  }

  if (elClearCart) {
    elClearCart.onclick = () => {
      clearCart();
    };
  }

  if (elReset) {
    elReset.onclick = async () => {
      if (confirm("Reset demo state? This clears all orders and settings.")) {
        try {
          await FC.reset();
        } catch (err) {
          console.error("kiosk.js: reset failed", err);
        }
        location.reload();
      }
    };
  }

  if (elSearch) {
    elSearch.addEventListener("input", () => {
      renderMenu();
    });
  }

  if (elCategory) {
    elCategory.addEventListener("change", () => {
      renderMenu();
    });
  }

  setInterval(async () => {
    if (!awaitingOrderId) return;
    const o = await getOrderSafe(awaitingOrderId);
    if (!o) return;

    if (
      o.status === "paid" &&
      paymentMethodOf(o) === "cash" &&
      autoCashPaidReceiptOpenedForOrderId !== o.id &&
      (!receiptModal || receiptModal.classList.contains("hidden"))
    ) {
      autoCashPaidReceiptOpenedForOrderId = o.id;
      await openReceipt(o.id);
    }

    renderFlow(o);
    await refreshQueueCount();
  }, 900);

  async function renderAll() {
    if (renderBusy) {
      rerenderRequested = true;
      return;
    }

    renderBusy = true;

    try {
      renderTabs();
      renderCategorySelect();
      await renderMenu();
      renderCart();
      await refreshFlowPanel();
    } catch (err) {
      console.error("kiosk.js: renderAll failed", err);
    } finally {
      renderBusy = false;
      if (rerenderRequested) {
        rerenderRequested = false;
        renderAll();
      }
    }
  }

  await seedSafe();
  await handleStripeReturn();
  await renderAll();

  window.addEventListener("fc:state-changed", async () => {
    await renderAll();
    if (awaitingOrderId) {
      const o = await getOrderSafe(awaitingOrderId);
      if (o) renderFlow(o);
    }
  });

  window.addEventListener("focus", () => {
    renderAll();
  });
})();
