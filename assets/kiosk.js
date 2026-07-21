(async function () {
  window.FC = window.FC || {};

  const $ = (id) => document.getElementById(id);

  const RESTAURANT_APPROVAL_SECONDS = 20;
  const RESTAURANT_APPROVAL_MS = RESTAURANT_APPROVAL_SECONDS * 1000;

  const KIOSK_IDLE_TIMEOUT_SECONDS = 90;
  const KIOSK_POSTER_AD_SECONDS = 5;
  const TABLE_BUTTON_VALUES = [
    ...Array.from({ length: 10 }, (_, i) => `A${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `B${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `C${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `D${i + 1}`)
  ];

  const KIOSK_ADS = [
    {
      id: "main-video",
      type: "video",
      src: "assets/ads/kiosk-main-video.mp4",
      title: "Food Court Deals",
      subtitle: "Watch today’s offers while the kiosk is idle.",
      offer: "Fresh Deals",
      restaurant: "Food Court Kiosk"
    },
    {
      id: "burger-20-off",
      type: "image",
      src: "assets/ads/burger-20-off.jpg",
      title: "Burger Deal",
      subtitle: "Get a delicious burger deal from your favorite food court restaurant.",
      offer: "20% OFF",
      restaurant: "Burger Special"
    },
    {
      id: "shinwari-special",
      type: "image",
      src: "assets/ads/shinwari-special.jpg",
      title: "Anonymous Shinwari Special",
      subtitle: "Enjoy traditional Shinwari taste with today’s special item.",
      offer: "Special Item",
      restaurant: "Anonymous Shinwari"
    },
    {
      id: "pizza-deal",
      type: "image",
      src: "assets/ads/pizza-deal.jpg",
      title: "Pizza Deal",
      subtitle: "Hot, cheesy and fresh pizza offer for food court customers.",
      offer: "20% OFF",
      restaurant: "Pizza Deal"
    },
    {
      id: "combo-offer",
      type: "image",
      src: "assets/ads/combo-offer.jpg",
      title: "Combo Offer",
      subtitle: "Order more, save more with a food court combo deal.",
      offer: "Combo Deal",
      restaurant: "Food Court Combo"
    }
  ];

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

  function stripeQrSize() {
    const w = Number(window.innerWidth || 1024);
    const h = Number(window.innerHeight || 768);

    if (w <= 820) {
      return Math.max(280, Math.min(340, Math.floor(w - 96)));
    }

    if (h <= 760) return 340;
    if (h <= 900) return 370;

    return 400;
  }

  function showStripeQr(checkoutUrl) {
    if (!qrBox) return;

    const qrSize = stripeQrSize();

    qrBox.innerHTML = "";
    qrBox.style.cursor = "default";
    qrBox.style.setProperty("--fc-stripe-qr-size", `${qrSize}px`);
    qrBox.onclick = null;
    qrBox.setAttribute("aria-label", "Stripe payment QR code. Scan with phone to complete payment.");

    if (qrBox.parentElement) {
      qrBox.parentElement.style.setProperty("--fc-stripe-qr-size", `${qrSize}px`);
    }

    try {
      new QRCode(qrBox, {
        text: checkoutUrl,
        width: qrSize,
        height: qrSize,
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (err) {
      console.error("kiosk.js: Stripe QR render failed", err);
      qrBox.innerHTML = `
        <div class="text-xs text-slate-900 break-all p-3">
          Payment QR could not be displayed. Please ask staff for help.
        </div>
      `;
    }
  }

  async function finalizeStripePaidOrder(orderId, stripeSessionData) {
    const order = await getOrderSafe(orderId);

    if (!order) {
      throw new Error("Order not found after Stripe payment.");
    }

    if (order.status === "timed_out") {
      elFlowPanel.innerHTML = `
        <div class="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div class="text-xs uppercase tracking-widest text-amber-200">Order Timed Out</div>
              <div class="text-xl font-semibold mt-1">This unpaid order was closed due to inactivity.</div>
              <div class="text-sm text-slate-300 mt-2">
                The kiosk has been reset for the next customer. Please start a new order.
              </div>
            </div>
            <div class="pill badge-yellow">Timed Out</div>
          </div>
        </div>
      `;
      return;
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
      autoPrintReceiptOnce(order.id);
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
    autoPrintReceiptOnce(order.id);
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

  const restaurantApprovalModal = $("restaurantApprovalModal");
  const approvalAnimation = $("approvalAnimation");
  const approvalCountdown = $("approvalCountdown");
  const approvalProgressBar = $("approvalProgressBar");
  const approvalWaitTitle = $("approvalWaitTitle");
  const approvalWaitMessage = $("approvalWaitMessage");
  const approvalWaitSubMessage = $("approvalWaitSubMessage");
  const approvalStatusBadge = $("approvalStatusBadge");
  const approvalRejectionBox = $("approvalRejectionBox");
  const approvalAcceptedBox = $("approvalAcceptedBox");

  const adsOverlay = $("adsOverlay");
  const adTitle = $("adTitle");
  const adSubtitle = $("adSubtitle");
  const kioskAdVideo = $("kioskAdVideo");
  const kioskAdImage = $("kioskAdImage");
  const kioskAdFallback = $("kioskAdFallback");
  const kioskAdLabel = $("kioskAdLabel");
  const kioskAdOffer = $("kioskAdOffer");
  const kioskAdRestaurant = $("kioskAdRestaurant");
  const kioskAdProgressBar = $("kioskAdProgressBar");
  const kioskAdDots = $("kioskAdDots");
  const kioskAdStartBtn = $("kioskAdStartBtn");
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


  function injectRestaurantApprovalStyles() {
    if (document.getElementById("restaurantApprovalStyles")) return;

    const style = document.createElement("style");
    style.id = "restaurantApprovalStyles";
    style.textContent = `
      .fc-approval-card {
        position: relative;
        overflow: hidden;
      }

      .fc-approval-card::before {
        content: "";
        position: absolute;
        inset: -2px;
        pointer-events: none;
        background: radial-gradient(circle at 20% 20%, rgba(249, 115, 22, 0.16), transparent 32%),
                    radial-gradient(circle at 80% 15%, rgba(129, 140, 248, 0.12), transparent 30%);
      }

      .fc-cooking-stage {
        width: 130px;
        height: 130px;
        position: relative;
        margin: 0 auto;
      }

      .fc-pot {
        position: absolute;
        left: 18px;
        right: 18px;
        bottom: 22px;
        height: 45px;
        border-radius: 0 0 28px 28px;
        background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.08));
        border: 1px solid rgba(255,255,255,.18);
        box-shadow: 0 14px 34px rgba(0,0,0,.28);
        animation: fc-pot-bounce 1.2s ease-in-out infinite;
      }

      .fc-pot::before {
        content: "";
        position: absolute;
        left: -13px;
        top: 12px;
        width: 18px;
        height: 18px;
        border: 3px solid rgba(255,255,255,.18);
        border-right: 0;
        border-radius: 16px 0 0 16px;
      }

      .fc-pot::after {
        content: "";
        position: absolute;
        right: -13px;
        top: 12px;
        width: 18px;
        height: 18px;
        border: 3px solid rgba(255,255,255,.18);
        border-left: 0;
        border-radius: 0 16px 16px 0;
      }

      .fc-pot-lid {
        position: absolute;
        left: 28px;
        right: 28px;
        bottom: 68px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,.22);
        animation: fc-lid-shake 1.2s ease-in-out infinite;
      }

      .fc-pot-flame {
        position: absolute;
        left: 47px;
        bottom: 5px;
        width: 36px;
        height: 36px;
        border-radius: 50% 50% 50% 50%;
        background: linear-gradient(180deg, rgba(251,191,36,.95), rgba(249,115,22,.6));
        filter: blur(.2px);
        transform: rotate(45deg);
        animation: fc-flame 0.65s ease-in-out infinite alternate;
      }

      .fc-steam {
        position: absolute;
        bottom: 84px;
        width: 10px;
        height: 32px;
        border-radius: 999px;
        background: rgba(255,255,255,.32);
        filter: blur(1px);
        animation: fc-steam-rise 1.35s ease-in-out infinite;
      }

      .fc-steam.s1 { left: 43px; animation-delay: 0s; }
      .fc-steam.s2 { left: 61px; animation-delay: .25s; }
      .fc-steam.s3 { left: 79px; animation-delay: .48s; }

      @keyframes fc-steam-rise {
        0% { transform: translateY(12px) scale(.75); opacity: 0; }
        35% { opacity: .85; }
        100% { transform: translateY(-18px) scale(1.18); opacity: 0; }
      }

      @keyframes fc-pot-bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }

      @keyframes fc-lid-shake {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        35% { transform: translateX(-2px) rotate(-2deg); }
        70% { transform: translateX(2px) rotate(2deg); }
      }

      @keyframes fc-flame {
        from { transform: rotate(45deg) scale(.86); opacity: .72; }
        to { transform: rotate(45deg) scale(1.05); opacity: 1; }
      }

      .fc-progress-track {
        height: 10px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.1);
      }

      .fc-progress-fill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(99,102,241,.9), rgba(249,115,22,.95));
        transition: width .45s ease;
      }

      .fc-dot-loader span {
        display: inline-block;
        animation: fc-dot-pulse 1.2s ease-in-out infinite;
      }

      .fc-dot-loader span:nth-child(2) { animation-delay: .18s; }
      .fc-dot-loader span:nth-child(3) { animation-delay: .36s; }

      @keyframes fc-dot-pulse {
        0%, 80%, 100% { opacity: .25; transform: translateY(0); }
        40% { opacity: 1; transform: translateY(-2px); }
      }
    `;

    document.head.appendChild(style);
  }

  function injectKioskCustomerFlowStyles() {
    if (document.getElementById("kioskCustomerFlowStyles")) return;

    const style = document.createElement("style");
    style.id = "kioskCustomerFlowStyles";
    style.textContent = `
      #tableNumberInput {
        cursor: default !important;
        caret-color: transparent !important;
        user-select: none;
      }

      .fc-table-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      .fc-table-btn {
        min-height: 44px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.16);
        background: rgba(255,255,255,.06);
        color: #f8fafc;
        font-weight: 850;
        font-size: 14px;
        touch-action: manipulation;
        transition: background-color .12s ease, border-color .12s ease, transform .12s ease;
      }

      .fc-table-btn:hover,
      .fc-table-btn.fc-table-active {
        background: rgba(249,115,22,.22);
        border-color: rgba(249,115,22,.82);
        color: #fff7ed;
        box-shadow: 0 0 0 3px rgba(249,115,22,.12);
      }

      .fc-table-btn.fc-table-active {
        transform: translateY(-1px);
      }

      #restaurantApprovalModal {
        z-index: 70 !important;
      }

      #restaurantApprovalModal > div {
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #approvalAnimation.fc-cooking-stage {
        width: 150px;
        height: 150px;
      }

      #approvalAnimation .fc-pot {
        left: 20px;
        right: 20px;
        bottom: 28px;
        height: 52px;
      }

      #approvalAnimation .fc-pot-lid {
        left: 32px;
        right: 32px;
        bottom: 82px;
      }

      #approvalAnimation .fc-pot-flame {
        left: 57px;
        bottom: 8px;
      }

      #approvalAnimation .fc-steam {
        bottom: 98px;
      }

      #approvalAnimation .fc-steam.s1 { left: 51px; }
      #approvalAnimation .fc-steam.s2 { left: 70px; }
      #approvalAnimation .fc-steam.s3 { left: 89px; }

      #paymentModal {
        overflow-y: auto !important;
      }

      #paymentModal > div {
        min-height: 100vh !important;
        padding-top: 18px !important;
        padding-bottom: 18px !important;
      }

      #paymentModal .fc-payment-card {
        max-width: 900px !important;
        width: min(900px, calc(100vw - 36px)) !important;
        max-height: calc(100vh - 36px) !important;
        overflow-y: auto !important;
      }

      #paymentModal .fc-payment-grid {
        grid-template-columns: minmax(360px, 430px) minmax(260px, 1fr) !important;
        align-items: center !important;
      }

      #paymentModal .fc-qr-shell {
        min-height: calc(var(--fc-stripe-qr-size, 380px) + 36px) !important;
        padding: 18px !important;
        overflow: visible !important;
      }

      #qrBox {
        width: var(--fc-stripe-qr-size, 380px) !important;
        height: var(--fc-stripe-qr-size, 380px) !important;
        max-width: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: visible !important;
      }

      #qrBox canvas,
      #qrBox img,
      #qrBox table {
        width: var(--fc-stripe-qr-size, 380px) !important;
        height: var(--fc-stripe-qr-size, 380px) !important;
        max-width: 100% !important;
        max-height: 100% !important;
      }

      .fc-payment-hidden {
        display: none !important;
      }

      #paymentModal:not(.hidden) > div {
        display: flex !important;
      }

      #paymentModal:not(.hidden) .fc-payment-card {
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      #paymentModal:not(.hidden) .fc-payment-grid {
        display: grid !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      #paymentModal:not(.hidden) .fc-qr-shell {
        display: flex !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      .fc-payment-customer-note {
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.055);
        border-radius: 18px;
        padding: 14px;
        color: #dbeafe;
        font-size: 14px;
        line-height: 1.45;
      }


      #restaurantTabs {
        width: 100%;
        display: grid !important;
        grid-template-columns: repeat(5, minmax(118px, 1fr));
        gap: 10px !important;
        align-items: stretch;
      }

      .fc-restaurant-tab {
        min-width: 0 !important;
        min-height: 58px !important;
        position: relative;
        overflow: hidden;
        padding: 8px 10px !important;
        border-radius: 18px !important;
        text-align: center !important;
        transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease, opacity .15s ease;
      }

      .fc-restaurant-tab .font-semibold {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13.5px !important;
        line-height: 1.1;
      }

      .fc-restaurant-tab-open {
        background: rgba(255,255,255,.075) !important;
        border-color: rgba(34,197,94,.36) !important;
        box-shadow: inset 0 0 0 1px rgba(34,197,94,.10);
      }

      .fc-restaurant-tab-open.fc-restaurant-tab-active {
        background: linear-gradient(135deg, rgba(34,197,94,.17), rgba(255,255,255,.07)) !important;
        border-color: rgba(34,197,94,.78) !important;
        box-shadow: 0 0 0 3px rgba(34,197,94,.12), 0 14px 34px rgba(0,0,0,.24);
      }

      .fc-restaurant-tab-closed {
        background: linear-gradient(135deg, rgba(127,29,29,.38), rgba(255,255,255,.04)) !important;
        border: 2px solid rgba(248,113,113,.82) !important;
        opacity: .86;
        box-shadow: inset 0 0 0 1px rgba(248,113,113,.14);
      }

      .fc-restaurant-tab-closed::after {
        content: "CLOSED";
        position: absolute;
        top: 5px;
        right: -24px;
        transform: rotate(32deg);
        background: rgba(220,38,38,.96);
        color: #fff;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: .07em;
        padding: 2px 28px;
        border: 1px solid rgba(255,255,255,.25);
        box-shadow: 0 6px 14px rgba(0,0,0,.22);
      }

      .fc-restaurant-tab-closed.fc-restaurant-tab-active {
        opacity: 1;
        background: linear-gradient(135deg, rgba(127,29,29,.50), rgba(255,255,255,.055)) !important;
        border-color: rgba(248,113,113,1) !important;
        box-shadow: 0 0 0 4px rgba(239,68,68,.16), 0 14px 34px rgba(0,0,0,.25);
      }

      .fc-restaurant-status-open,
      .fc-restaurant-status-closed {
        margin-top: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 10.5px;
        font-weight: 950;
        letter-spacing: .055em;
      }

      .fc-restaurant-status-open {
        color: #86efac;
        background: rgba(34,197,94,.14);
        border: 1px solid rgba(34,197,94,.34);
      }

      .fc-restaurant-status-closed {
        color: #fecaca;
        background: rgba(239,68,68,.18);
        border: 1px solid rgba(248,113,113,.45);
      }

      .fc-restaurant-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        display: inline-block;
        background: currentColor;
        box-shadow: 0 0 10px currentColor;
      }

      @media (min-width: 1024px) {
        aside.lg\:col-span-4 > .glass {
          margin-top: 12px;
        }
      }

      @media (max-width: 1180px) {
        #restaurantTabs {
          grid-template-columns: repeat(4, minmax(110px, 1fr));
        }
      }

      @media (max-width: 760px) {
        #restaurantTabs {
          grid-template-columns: repeat(2, minmax(120px, 1fr));
        }
      }

      @media (max-width: 820px) {
        .fc-table-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        #paymentModal .fc-payment-grid {
          grid-template-columns: 1fr !important;
        }

        #paymentModal .fc-payment-card {
          width: min(94vw, 640px) !important;
        }

        #paymentModal .fc-qr-shell {
          min-height: calc(var(--fc-stripe-qr-size, 320px) + 32px) !important;
        }

        #qrBox,
        #qrBox canvas,
        #qrBox img,
        #qrBox table {
          width: var(--fc-stripe-qr-size, 320px) !important;
          height: var(--fc-stripe-qr-size, 320px) !important;
        }
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
  injectRestaurantApprovalStyles();
  injectKioskCustomerFlowStyles();

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
  let autoPrintedReceiptOrderIds = new Set();
  let stripeReturnHandled = false;
  let approvalAutoAcceptTimers = new Map();

  let idleSeconds = 0;
  let adsIdx = 0;
  let adTimer = null;
  let adProgressTimer = null;
  let adProgressStartedAt = 0;
  let adProgressDurationMs = 0;
  let adsActive = false;
  let idleTimeoutInProgress = false;

  let renderBusy = false;
  let rerenderRequested = false;


  let itemDetailModal = null;
  let itemDetailCurrentRestaurantId = null;
  let itemDetailCurrentItem = null;
  let itemDetailQty = 1;
  let itemDetailSelectedAddons = new Set();

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

  function autoPrintReceiptOnce(orderId, delay = 700) {
    if (!orderId || autoPrintedReceiptOrderIds.has(orderId)) return;

    autoPrintedReceiptOrderIds.add(orderId);

    setTimeout(async () => {
      try {
        await printReceiptOnly(orderId);
      } catch (err) {
        console.error("kiosk.js: automatic bridge print failed", err);
      }
    }, delay);
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
      return table ? `Dine In • Table ${table}` : "Dine In";
    }

    if (type === "takeaway") return "Takeaway";

    return "Order type not selected";
  }



  function orderDateMs(value) {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function approvalStartMs(order = {}) {
    return (
      orderDateMs(order.approvalRequestedAt) ||
      orderDateMs(order.approval_requested_at) ||
      orderDateMs(order.requestedAt) ||
      orderDateMs(order.createdAt) ||
      orderDateMs(order.created_at) ||
      Date.now()
    );
  }

  function approvalSecondsLeft(order = {}) {
    const elapsed = Date.now() - approvalStartMs(order);
    return Math.max(0, Math.ceil((RESTAURANT_APPROVAL_MS - elapsed) / 1000));
  }

  function approvalProgressPercent(order = {}) {
    const elapsed = Math.max(0, Date.now() - approvalStartMs(order));
    const progress = Math.min(100, Math.round((elapsed / RESTAURANT_APPROVAL_MS) * 100));
    return Math.max(4, progress);
  }

  function rejectionReasonOf(order = {}) {
    return String(
      order.rejectReason ||
      order.rejectionReason ||
      order.rejectedReason ||
      order.reject_reason ||
      order.rejection_reason ||
      order.payment?.rejectReason ||
      ""
    ).trim();
  }

  function isFinalOrderStatus(status) {
    return ["approved", "awaiting_payment", "awaiting_cash_payment", "paid", "preparing", "ready", "completed", "rejected", "cancelled", "timed_out"].includes(String(status || "").toLowerCase());
  }

  function canTimeoutOrderStatus(status) {
    return ["pending_approval", "approved", "awaiting_payment", "awaiting_cash_payment"].includes(String(status || "").toLowerCase());
  }

  async function markCurrentUnpaidOrderTimedOut() {
    if (!awaitingOrderId) return;

    const orderId = awaitingOrderId;

    try {
      const order = await getOrderSafe(orderId);
      if (!order) return;

      if (!canTimeoutOrderStatus(order.status)) return;

      clearRestaurantAutoAccept(order.id);

      const timeoutAt = nowISO();
      const payment = {
        ...safeObject(order.payment),
        timedOutAt: timeoutAt,
        timeoutReason: `Customer inactive for ${KIOSK_IDLE_TIMEOUT_SECONDS} seconds`,
        abandonedBy: "kiosk_idle_timeout"
      };

      await updateOrderSafe(order.id, {
        status: "timed_out",
        payment
      });

      logSafe(`Order ${order.id} timed out because customer was inactive for ${KIOSK_IDLE_TIMEOUT_SECONDS} seconds.`);
    } catch (err) {
      console.error("kiosk.js: timed-out order update failed", err);
    }
  }

  async function autoAcceptPendingOrder(orderId) {
    const order = await getOrderSafe(orderId);
    if (!order || order.status !== "pending_approval") return;

    const secondsLeft = approvalSecondsLeft(order);
    if (secondsLeft > 0) {
      scheduleRestaurantAutoAccept(order);
      return;
    }

    try {
      await updateOrderSafe(order.id, {
        status: "approved",
        approvedAt: nowISO(),
        autoAccepted: true,
        autoAcceptedAt: nowISO(),
        restaurantResponse: "auto_accepted"
      });

      logSafe(`Order ${order.id} auto-accepted after ${RESTAURANT_APPROVAL_SECONDS} seconds.`);
    } catch (err) {
      console.error("kiosk.js: auto-accept failed", err);
    }
  }

  function scheduleRestaurantAutoAccept(order = {}) {
    if (!order?.id || order.status !== "pending_approval") return;

    const existing = approvalAutoAcceptTimers.get(order.id);
    if (existing) clearTimeout(existing);

    const delay = Math.max(0, approvalSecondsLeft(order) * 1000);

    const timer = setTimeout(async () => {
      approvalAutoAcceptTimers.delete(order.id);
      await autoAcceptPendingOrder(order.id);
    }, delay || 50);

    approvalAutoAcceptTimers.set(order.id, timer);
  }

  function clearRestaurantAutoAccept(orderId) {
    if (!orderId) return;
    const timer = approvalAutoAcceptTimers.get(orderId);
    if (timer) clearTimeout(timer);
    approvalAutoAcceptTimers.delete(orderId);
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

  function cashQrPayloadForOrder(order = {}) {
    const orderId = String(order.id || "").trim();
    const token = String(order.payment?.cashToken || "").trim();
    return token ? `FC_CASH_ORDER|${orderId}|${token}` : `FC_CASH_ORDER|${orderId}`;
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

  function ensureTableSelectionGrid() {
    if (!tableNumberWrap || !tableNumberInput) return null;

    tableNumberInput.readOnly = true;
    tableNumberInput.setAttribute("aria-readonly", "true");
    tableNumberInput.setAttribute("autocomplete", "off");
    tableNumberInput.placeholder = "Select table below";

    let grid = $("tableNumberGrid");
    if (grid) return grid;

    grid = document.createElement("div");
    grid.id = "tableNumberGrid";
    grid.className = "fc-table-grid";
    tableNumberInput.insertAdjacentElement("afterend", grid);
    return grid;
  }

  function selectTableNumber(value) {
    serviceType = "dine_in";
    tableNumber = String(value || "").trim();

    if (tableNumberInput) {
      tableNumberInput.value = tableNumber;
    }

    saveSession();
    renderServicePanel();
    renderCart();
  }

  function renderTableSelectionGrid() {
    const grid = ensureTableSelectionGrid();
    if (!grid) return;

    grid.innerHTML = "";

    TABLE_BUTTON_VALUES.forEach((value) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fc-table-btn" + (String(tableNumber || "") === value ? " fc-table-active" : "");
      btn.textContent = value;
      btn.setAttribute("aria-pressed", String(String(tableNumber || "") === value));
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        selectTableNumber(value);
      });
      grid.appendChild(btn);
    });
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
      label: type === "dine_in" ? `Dine In • Table ${table}` : "Takeaway"
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

    renderTableSelectionGrid();

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
          ? (tableValue ? `Dine In • Table ${tableValue}` : "Dine In")
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

  function normalizedAds() {
    return KIOSK_ADS.filter((ad) => ad && ad.src && ad.type);
  }

  function clearAdTimers() {
    if (adTimer) clearTimeout(adTimer);
    adTimer = null;

    if (adProgressTimer) clearInterval(adProgressTimer);
    adProgressTimer = null;
  }

  function resetAdProgress() {
    if (kioskAdProgressBar) {
      kioskAdProgressBar.style.width = "0%";
    }

    if (adProgressTimer) clearInterval(adProgressTimer);
    adProgressTimer = null;
  }

  function startAdProgress(durationMs) {
    resetAdProgress();

    adProgressStartedAt = Date.now();
    adProgressDurationMs = Math.max(600, Number(durationMs || 0));

    const tick = () => {
      const elapsed = Date.now() - adProgressStartedAt;
      const pct = Math.min(100, Math.round((elapsed / adProgressDurationMs) * 100));
      if (kioskAdProgressBar) kioskAdProgressBar.style.width = `${pct}%`;

      if (pct >= 100 && adProgressTimer) {
        clearInterval(adProgressTimer);
        adProgressTimer = null;
      }
    };

    tick();
    adProgressTimer = setInterval(tick, 120);
  }

  function renderAdDots(total, activeIndex) {
    if (!kioskAdDots) return;

    kioskAdDots.innerHTML = "";

    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement("span");
      dot.className = "kiosk-ad-dot" + (i === activeIndex ? " active" : "");
      kioskAdDots.appendChild(dot);
    }
  }

  function stopAdMedia() {
    if (kioskAdVideo) {
      try {
        kioskAdVideo.pause();
      } catch {}
      kioskAdVideo.removeAttribute("src");
      kioskAdVideo.load();
      kioskAdVideo.classList.add("hidden");
      kioskAdVideo.onended = null;
      kioskAdVideo.onerror = null;
    }

    if (kioskAdImage) {
      kioskAdImage.removeAttribute("src");
      kioskAdImage.classList.add("hidden");
      kioskAdImage.onerror = null;
    }

    if (kioskAdFallback) {
      kioskAdFallback.classList.add("hidden");
    }
  }

  function showAdFallback(ad = {}) {
    stopAdMedia();

    if (kioskAdFallback) {
      kioskAdFallback.classList.remove("hidden");
      kioskAdFallback.innerHTML = `
        <div class="text-7xl">🍽️</div>
        <div class="mt-5 text-4xl font-black">${escapeHtml(ad.title || "Food Court Deals")}</div>
        <div class="mt-3 text-xl text-slate-200">${escapeHtml(ad.subtitle || "Touch the screen to start ordering.")}</div>
      `;
    }

    startAdProgress(KIOSK_POSTER_AD_SECONDS * 1000);

    adTimer = setTimeout(() => {
      showNextAd();
    }, KIOSK_POSTER_AD_SECONDS * 1000);
  }

  function renderAdMeta(ad = {}) {
    if (kioskAdLabel) {
      kioskAdLabel.textContent = ad.type === "video" ? "Idle Mode • Video Advertisement" : "Idle Mode • Food Promotion";
    }

    if (adTitle) adTitle.textContent = ad.title || "Food Court Advertisement";
    if (adSubtitle) adSubtitle.textContent = ad.subtitle || "Touch anywhere to start a fresh order.";
    if (kioskAdOffer) kioskAdOffer.textContent = ad.offer || "Today’s Deals";
    if (kioskAdRestaurant) kioskAdRestaurant.textContent = ad.restaurant || "Food Court Kiosk";

    trackAdImpressionSafe(ad.id || `ad-${adsIdx}`);
  }

  function showNextAd() {
    const ads = normalizedAds();

    if (!adsOverlay || !ads.length || !adsActive) return;

    clearAdTimers();
    stopAdMedia();

    const index = adsIdx % ads.length;
    const ad = ads[index];
    adsIdx = (adsIdx + 1) % ads.length;

    renderAdDots(ads.length, index);
    renderAdMeta(ad);

    if (ad.type === "video" && kioskAdVideo) {
      kioskAdVideo.classList.remove("hidden");
      kioskAdVideo.muted = true;
      kioskAdVideo.playsInline = true;
      kioskAdVideo.loop = false;
      kioskAdVideo.src = ad.src;

      kioskAdVideo.onloadedmetadata = () => {
        const duration = Number(kioskAdVideo.duration || 0);
        startAdProgress((duration > 0 ? duration : 12) * 1000);
      };

      kioskAdVideo.onended = () => {
        showNextAd();
      };

      kioskAdVideo.onerror = () => {
        showAdFallback(ad);
      };

      const playPromise = kioskAdVideo.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          showAdFallback(ad);
        });
      }

      startAdProgress(12000);
      return;
    }

    if (ad.type === "image" && kioskAdImage) {
      kioskAdImage.classList.remove("hidden");
      kioskAdImage.src = ad.src;
      kioskAdImage.alt = ad.title || "Food Court advertisement";
      kioskAdImage.onerror = () => {
        showAdFallback(ad);
      };

      startAdProgress(KIOSK_POSTER_AD_SECONDS * 1000);

      adTimer = setTimeout(() => {
        showNextAd();
      }, KIOSK_POSTER_AD_SECONDS * 1000);
      return;
    }

    showAdFallback(ad);
  }

  async function clearCustomerSessionForIdleTimeout() {
    await markCurrentUnpaidOrderTimedOut();

    awaitingOrderId = null;
    currentPayOrderId = null;
    currentReceiptOrderId = null;
    currentStripeCheckoutUrl = "";
    autoStripeStartedForOrderId = null;
    autoCashSlipStartedForOrderId = null;
    autoCashPaidReceiptOpenedForOrderId = null;
    autoPrintedReceiptOrderIds = new Set();

    cart = [];
    resetServiceSelection();
    resetPaymentMethodSelection();

    if (payInterval) clearInterval(payInterval);
    payInterval = null;

    if (paymentModal) paymentModal.classList.add("hidden");
    if (receiptModal) receiptModal.classList.add("hidden");
    if (itemDetailModal) closeItemDetailModal();

    saveSession();
    renderCart();
    hideFlow();

    try {
      await renderAll();
    } catch (err) {
      console.warn("kiosk.js: render after idle cleanup failed", err);
    }
  }

  function resetIdle(evt) {
    idleSeconds = 0;

    if (adsActive && adsOverlay && !adsOverlay.classList.contains("hidden")) {
      hideAds();
    }
  }

  function hideAds() {
    adsActive = false;
    clearAdTimers();
    stopAdMedia();
    resetAdProgress();

    if (adsOverlay) adsOverlay.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }

  async function showAds() {
    if (!adsOverlay || adsActive || idleTimeoutInProgress) return;

    idleTimeoutInProgress = true;

    try {
      await clearCustomerSessionForIdleTimeout();
    } finally {
      idleTimeoutInProgress = false;
    }

    const ads = normalizedAds();
    if (!ads.length) return;

    adsActive = true;
    adsOverlay.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");

    showNextAd();
  }

  ["mousemove", "mousedown", "touchstart", "keydown", "scroll"].forEach((evt) => {
    window.addEventListener(evt, resetIdle, { passive: true });
  });

  if (adsOverlay) {
    adsOverlay.addEventListener("click", resetIdle);
    adsOverlay.addEventListener("touchstart", resetIdle, { passive: true });
  }

  if (kioskAdStartBtn) {
    kioskAdStartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      resetIdle(e);
    });
  }

  setInterval(async () => {
    if (adsActive || idleTimeoutInProgress) return;

    const s = safeState();
    const afterSeconds = Number(s.settings?.idleAdsAfterSeconds || KIOSK_IDLE_TIMEOUT_SECONDS);
    const effectiveSeconds = Number.isFinite(afterSeconds) && afterSeconds > 0 ? afterSeconds : KIOSK_IDLE_TIMEOUT_SECONDS;

    idleSeconds += 1;

    if (idleSeconds >= effectiveSeconds) {
      idleSeconds = 0;
      await showAds();
    }
  }, 1000);

  function ensureItemDetailModal() {
    if (itemDetailModal && document.body.contains(itemDetailModal)) return itemDetailModal;

    document.querySelectorAll("#itemDetailModal").forEach((oldModal) => oldModal.remove());

    const wrap = document.createElement("div");
    wrap.id = "itemDetailModal";
    wrap.className = "hidden fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm";
    wrap.innerHTML = `
      <div class="h-full w-full flex items-center justify-center px-4 py-5">
        <div class="max-w-5xl w-full max-h-[92vh] overflow-hidden rounded-3xl bg-slate-950 border border-white/10 shadow-2xl">
          <div class="grid md:grid-cols-2 min-h-[520px]">
            <div id="itemDetailImageWrap" class="bg-white/5 min-h-[260px] md:min-h-full"></div>

            <div class="flex flex-col min-h-[520px]">
              <div class="p-6 border-b border-white/10">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div id="itemDetailCategory" class="text-xs uppercase tracking-widest text-slate-400"></div>
                    <div id="itemDetailName" class="text-2xl font-semibold mt-1 text-slate-100 break-words"></div>
                    <div id="itemDetailPrice" class="text-xl font-semibold mt-3 text-slate-100"></div>
                  </div>
                  <button id="itemDetailCloseBtn" type="button" class="btn-ghost text-sm shrink-0">Close</button>
                </div>

                <div id="itemDetailDescription" class="text-sm text-slate-300 mt-4 leading-relaxed"></div>
              </div>

              <div class="p-6 flex-1 overflow-y-auto">
                <div id="itemDetailAddonsPanel" class="hidden">
                  <div class="text-sm font-semibold text-slate-100">Add-ons</div>
                  <div id="itemDetailAddons" class="mt-3 space-y-2"></div>
                </div>

                <div id="itemDetailNoAddons" class="hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                  No add-ons are available for this item.
                </div>
              </div>

              <div class="p-5 border-t border-white/10 bg-slate-950/95">
                <div class="flex items-center justify-between gap-4 flex-wrap">
                  <div class="flex items-center gap-3">
                    <button id="itemDetailMinusBtn" type="button" class="btn-ghost text-xl px-4">-</button>
                    <div id="itemDetailQtyLabel" class="text-xl font-semibold min-w-8 text-center">1</div>
                    <button id="itemDetailPlusBtn" type="button" class="btn-ghost text-xl px-4">+</button>
                  </div>

                  <button id="itemDetailAddBtn" type="button" class="btn-primary min-w-[220px]">
                    Add to Cart
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);
    itemDetailModal = wrap;

    const detailEl = (id) => itemDetailModal.querySelector(`#${id}`);
    const closeBtn = detailEl("itemDetailCloseBtn");
    const minusBtn = detailEl("itemDetailMinusBtn");
    const plusBtn = detailEl("itemDetailPlusBtn");
    const addBtn = detailEl("itemDetailAddBtn");

    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) closeItemDetailModal();
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeItemDetailModal();
      });
    }

    if (minusBtn) {
      minusBtn.addEventListener("click", (e) => {
        e.preventDefault();
        itemDetailQty = Math.max(1, itemDetailQty - 1);
        renderItemDetailPricing();
      });
    }

    if (plusBtn) {
      plusBtn.addEventListener("click", (e) => {
        e.preventDefault();
        itemDetailQty += 1;
        renderItemDetailPricing();
      });
    }

    if (addBtn) {
      addBtn.addEventListener("click", (e) => {
        e.preventDefault();

        if (!itemDetailCurrentItem || !itemDetailCurrentRestaurantId) return;

        const item = itemDetailCurrentItem;
        const selectedAddons = safeArray(item.addons).filter((a) =>
          itemDetailSelectedAddons.has(String(a.id || a.name))
        );
        const addonTotal = selectedAddons.reduce((sum, a) => sum + Number(a.price || 0), 0);
        const finalPrice = Number(item.price || 0) + addonTotal;
        const addonNames = selectedAddons.map((a) => a.name).filter(Boolean);
        const addonKey = selectedAddons.map((a) => String(a.id || a.name)).sort().join("_");
        const cartKey = addonKey ? `${item.id}__${addonKey}` : String(item.id);

        addToCart(itemDetailCurrentRestaurantId, {
          ...item,
          itemId: item.id,
          cartKey,
          name: addonNames.length ? `${item.name} (${addonNames.join(", ")})` : item.name,
          price: finalPrice,
          qty: itemDetailQty,
          basePrice: Number(item.price || 0),
          addons: selectedAddons
        });

        closeItemDetailModal();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && itemDetailModal && !itemDetailModal.classList.contains("hidden")) {
        closeItemDetailModal();
      }
    });

    return wrap;
  }

  function closeItemDetailModal() {
    if (itemDetailModal) itemDetailModal.classList.add("hidden");

    document.body.classList.remove("overflow-hidden");

    itemDetailCurrentRestaurantId = null;
    itemDetailCurrentItem = null;
    itemDetailQty = 1;
    itemDetailSelectedAddons = new Set();
  }

  function renderItemDetailPricing() {
    const item = itemDetailCurrentItem;
    if (!item || !itemDetailModal) return;

    const selectedAddons = safeArray(item.addons).filter((a) =>
      itemDetailSelectedAddons.has(String(a.id || a.name))
    );
    const addonTotal = selectedAddons.reduce((sum, a) => sum + Number(a.price || 0), 0);
    const unitTotal = Number(item.price || 0) + addonTotal;
    const total = unitTotal * itemDetailQty;

    const qtyLabel = itemDetailModal.querySelector("#itemDetailQtyLabel");
    const addBtn = itemDetailModal.querySelector("#itemDetailAddBtn");
    const priceLabel = itemDetailModal.querySelector("#itemDetailPrice");

    if (qtyLabel) qtyLabel.textContent = String(itemDetailQty);
    if (priceLabel) priceLabel.textContent = money(unitTotal);
    if (addBtn) addBtn.textContent = `Add ${itemDetailQty} - ${money(total)}`;
  }

  function itemFallbackDescription(item = {}) {
    const name = item.name || "This item";
    const category = item.category || "menu item";

    if (String(category).toLowerCase().includes("drink")) {
      return `${name} is a refreshing drink served chilled with your order.`;
    }

    if (String(category).toLowerCase().includes("side")) {
      return `${name} is a side item that pairs well with main meals.`;
    }

    if (String(category).toLowerCase().includes("burger")) {
      return `${name} is prepared with a fresh bun, seasoned filling, and restaurant sauce.`;
    }

    if (String(category).toLowerCase().includes("rice")) {
      return `${name} is prepared fresh with spices and served as a filling rice meal.`;
    }

    return `${name} is prepared fresh by the selected restaurant and served according to the current order.`;
  }

  function openItemDetailModal(restaurantId, item) {
    if (!item) return;

    ensureItemDetailModal();

    itemDetailCurrentRestaurantId = restaurantId;
    itemDetailCurrentItem = item;
    itemDetailQty = 1;
    itemDetailSelectedAddons = new Set();

    const detailEl = (id) => itemDetailModal.querySelector(`#${id}`);

    const imageWrap = detailEl("itemDetailImageWrap");
    const category = detailEl("itemDetailCategory");
    const name = detailEl("itemDetailName");
    const description = detailEl("itemDetailDescription");
    const addonsPanel = detailEl("itemDetailAddonsPanel");
    const addonsWrap = detailEl("itemDetailAddons");
    const noAddons = detailEl("itemDetailNoAddons");

    const img = String(item.image || item.img || item.photo || "").trim();
    const desc = String(item.description || item.desc || item.details || itemFallbackDescription(item)).trim();

    if (imageWrap) {
      imageWrap.innerHTML = img
        ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(item.name || "Food item")}" class="w-full h-full min-h-[260px] object-cover" onerror="this.parentElement.innerHTML='<div class=&quot;h-full min-h-[260px] flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5 text-center p-8&quot;><div><div class=&quot;text-5xl&quot;>🍽️</div><div class=&quot;mt-3 text-slate-300 font-semibold&quot;>Image Not Available</div></div></div>';">`
        : `<div class="h-full min-h-[260px] flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5 text-center p-8">
             <div>
               <div class="text-5xl">🍽️</div>
               <div class="mt-3 text-slate-300 font-semibold">Image Not Available</div>
               <div class="mt-1 text-xs text-slate-500">Add image in assets/images/menu</div>
             </div>
           </div>`;
    }

    if (category) category.textContent = item.category || "Menu Item";
    if (name) name.textContent = item.name || "Food Item";
    if (description) description.textContent = desc;

    const addons = safeArray(item.addons);

    if (addons.length && addonsWrap && addonsPanel && noAddons) {
      addonsPanel.classList.remove("hidden");
      noAddons.classList.add("hidden");
      addonsWrap.innerHTML = "";

      addons.forEach((addon) => {
        const addonId = String(addon.id || addon.name || "");
        const row = document.createElement("label");
        row.className = "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 cursor-pointer hover:bg-white/10 transition";
        row.innerHTML = `
          <div class="flex items-center gap-3">
            <input type="checkbox" class="accent-indigo-500" data-addon-id="${escapeHtml(addonId)}">
            <div>
              <div class="text-sm font-semibold text-slate-100">${escapeHtml(addon.name || "Add-on")}</div>
              <div class="text-xs text-slate-400">Optional add-on</div>
            </div>
          </div>
          <div class="text-sm font-semibold text-slate-100">+ ${escapeHtml(money(Number(addon.price || 0)))}</div>
        `;

        const checkbox = row.querySelector("input");
        if (checkbox) {
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) itemDetailSelectedAddons.add(addonId);
            else itemDetailSelectedAddons.delete(addonId);
            renderItemDetailPricing();
          });
        }

        addonsWrap.appendChild(row);
      });
    } else {
      if (addonsPanel) addonsPanel.classList.add("hidden");
      if (noAddons) noAddons.classList.remove("hidden");
      if (addonsWrap) addonsWrap.innerHTML = "";
    }

    itemDetailModal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");

    renderItemDetailPricing();
  }

  function addToCart(restaurantId, menuItem) {
    if (!menuItem) return;

    if (cart.length && cart[0].restaurantId !== restaurantId) {
      alertSafe("Cart contains items from another restaurant. Clear cart to switch restaurants.");
      return;
    }

    const baseItemId = menuItem.itemId ?? menuItem.id;
    const cartKey = String(menuItem.cartKey || baseItemId || "");
    const qtyToAdd = Math.max(1, Number(menuItem.qty || 1));
    const found = cart.find((x) => String(x.cartKey || x.itemId) === cartKey);

    if (found) {
      found.qty += qtyToAdd;
    } else {
      cart.push({
        restaurantId,
        itemId: baseItemId,
        cartKey,
        name: menuItem.name,
        price: Number(menuItem.price || 0),
        qty: qtyToAdd,
        basePrice: Number(menuItem.basePrice || menuItem.price || 0),
        addons: safeArray(menuItem.addons)
      });
    }

    saveSession();
    renderCart();
  }

  function updateQty(cartKeyOrItemId, delta) {
    const key = String(cartKeyOrItemId || "");
    const it = cart.find((x) => String(x.cartKey || x.itemId) === key);
    if (!it) return;

    it.qty += delta;

    if (it.qty <= 0) {
      cart = cart.filter((x) => String(x.cartKey || x.itemId) !== key);
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
      const isOpen = !!r.online;
      const isActive = r.id === activeRestaurantId;
      const btn = document.createElement("button");

      btn.className =
        "px-4 py-2 rounded-2xl border text-sm fc-restaurant-tab " +
        (isOpen ? "fc-restaurant-tab-open " : "fc-restaurant-tab-closed ") +
        (isActive ? "fc-restaurant-tab-active" : "");

      btn.setAttribute("aria-label", `${r.name || "Restaurant"} is ${isOpen ? "open" : "closed"}`);

      btn.innerHTML = `
        <div class="font-semibold">${escapeHtml(r.name || "Restaurant")}</div>
        <div class="${isOpen ? "fc-restaurant-status-open" : "fc-restaurant-status-closed"}">
          <span class="fc-restaurant-status-dot"></span>
          <span>${isOpen ? "OPEN" : "CLOSED"}</span>
        </div>
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

    if (!r.online) {
      const closedNotice = document.createElement("div");
      closedNotice.className = "sm:col-span-2 xl:col-span-3 rounded-3xl border border-rose-400/40 bg-rose-500/12 p-5 text-rose-100";
      closedNotice.innerHTML = `
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-rose-200">Restaurant Closed</div>
            <div class="text-xl font-semibold mt-1">${escapeHtml(r.name || "This restaurant")} is currently closed.</div>
            <div class="text-sm text-rose-100/90 mt-2">Please choose another open restaurant from the tabs above.</div>
          </div>
          <div class="pill badge-red">CLOSED</div>
        </div>
      `;
      elMenu.appendChild(closedNotice);
    }

    if (!filtered.length) {
      if (r.online) {
        elMenu.innerHTML = `<div class="text-sm text-slate-400">No matching items found.</div>`;
      }
      return;
    }

    filtered.forEach((m) => {
      const card = document.createElement("div");
      card.className = "card p-4 cursor-pointer hover:bg-white/10 transition";

      const available = !!(r.online && m.available);
      const img = String(m.image || m.img || m.photo || "").trim();
      const desc = String(m.description || m.desc || m.details || "").trim();

      card.innerHTML = `
        ${img ? `
          <div class="-m-4 mb-4 overflow-hidden rounded-t-2xl bg-white/5">
            <img src="${escapeHtml(img)}" alt="${escapeHtml(m.name || "Food item")}" loading="lazy" decoding="async" class="w-full h-36 object-cover">
          </div>
        ` : ""}
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold truncate">${escapeHtml(m.name || "")}</div>
            <div class="text-xs text-slate-400 mt-1">${escapeHtml(m.category || "General")} • ${m.fast ? "Fast item" : "Standard"}</div>
            ${desc ? `<div class="text-xs text-slate-500 mt-2 line-clamp-2">${escapeHtml(desc)}</div>` : ""}
          </div>
          <div class="text-sm font-semibold shrink-0">${money(Number(m.price || 0))}</div>
        </div>
        <div class="mt-4 flex items-center justify-between">
          <div class="text-xs ${available ? "text-emerald-300" : "text-rose-300"}">
            ${available ? "Available" : (r.online ? "Out of stock" : "Restaurant Closed")}
          </div>
          <button class="${available ? "btn-primary" : "btn-ghost opacity-40 cursor-not-allowed"} text-sm rounded-full px-4" ${available ? "" : "disabled"}>
            +
          </button>
        </div>
      `;

      card.onclick = () => {
        if (!available) return;
        openItemDetailModal(r.id, m);
      };

      const btn = card.querySelector("button");
      btn.onclick = (e) => {
        e.stopPropagation();
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
            <div class="text-xs text-slate-400 mt-1">${money(Number(it.price || 0))} • Qty ${Number(it.qty || 0)}</div>
            ${safeArray(it.addons).length ? `<div class="text-xs text-slate-500 mt-1">${escapeHtml(safeArray(it.addons).map((a) => a.name).join(", "))}</div>` : ""}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button class="btn-ghost text-sm px-3 py-2">-</button>
            <button class="btn-ghost text-sm px-3 py-2">+</button>
          </div>
        `;

        const [minus, plus] = row.querySelectorAll("button");
        const rowKey = it.cartKey || it.itemId;
        minus.onclick = () => updateQty(rowKey, -1);
        plus.onclick = () => updateQty(rowKey, +1);

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

  function renderApprovalCookingAnimation() {
    if (!approvalAnimation) return;

    approvalAnimation.className = "fc-cooking-stage";
    approvalAnimation.innerHTML = `
      <div class="fc-steam s1"></div>
      <div class="fc-steam s2"></div>
      <div class="fc-steam s3"></div>
      <div class="fc-pot-lid"></div>
      <div class="fc-pot"></div>
      <div class="fc-pot-flame"></div>
    `;
  }

  function showRestaurantApprovalPopup(order = {}, restaurant = null, svcText = "") {
    if (!restaurantApprovalModal) return false;

    const secondsLeft = approvalSecondsLeft(order);
    const elapsedProgress = approvalProgressPercent(order);
    const remainingProgress = Math.max(0, Math.min(100, 100 - elapsedProgress));

    restaurantApprovalModal.classList.remove("hidden");
    renderApprovalCookingAnimation();

    if (approvalCountdown) approvalCountdown.textContent = String(secondsLeft);
    if (approvalProgressBar) approvalProgressBar.style.width = `${remainingProgress}%`;
    if (approvalStatusBadge) approvalStatusBadge.textContent = "Pending";

    if (approvalWaitTitle) {
      approvalWaitTitle.textContent = "Restaurant is checking your order...";
    }

    if (approvalWaitMessage) {
      approvalWaitMessage.innerHTML = `
        Order <span class="pill">${escapeHtml(order.id || "")}</span>
        sent to <span class="pill">${escapeHtml(restaurant?.name || "Restaurant")}</span>
        • <span class="pill">${escapeHtml(svcText || serviceText(order))}</span>
      `;
    }

    if (approvalWaitSubMessage) {
      approvalWaitSubMessage.innerHTML = `
        Please wait while the restaurant checks item availability. If there is no response within
        ${RESTAURANT_APPROVAL_SECONDS} seconds, the order will be accepted automatically.
      `;
    }

    if (approvalRejectionBox) approvalRejectionBox.classList.add("hidden");
    if (approvalAcceptedBox) approvalAcceptedBox.classList.add("hidden");

    return true;
  }

  function hideRestaurantApprovalPopup() {
    if (restaurantApprovalModal) {
      restaurantApprovalModal.classList.add("hidden");
    }
  }

  function hideFlow() {
    hideRestaurantApprovalPopup();
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
      scheduleRestaurantAutoAccept(order);

      showRestaurantApprovalPopup(order, r, svcText);

      if (elFlowPanel) {
        elFlowPanel.innerHTML = "";
        elFlowPanel.classList.add("hidden");
      }

      return;
    }

    clearRestaurantAutoAccept(order.id);
    hideRestaurantApprovalPopup();

    if (order.status === "rejected") {
      const reason = rejectionReasonOf(order) || "Food item is not available right now.";

      elFlowPanel.innerHTML = `
        <div class="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-5">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div class="text-xs uppercase tracking-widest text-rose-200">Order Rejected</div>
              <div class="text-2xl font-semibold mt-1">Sorry, the restaurant rejected this order.</div>
              <div class="text-sm text-slate-200 mt-3">
                Reason: <span class="pill">${escapeHtml(reason)}</span>
              </div>
              <div class="text-sm text-slate-300 mt-3">
                You can modify your cart, make another order, or try a different restaurant.
              </div>
            </div>
            <div class="pill badge-red">Rejected</div>
          </div>

          <div class="mt-5 flex gap-2 flex-wrap">
            <button id="tryAgainBtn" class="btn-primary">Modify & Try Again</button>
            <button id="newOrderBtn" class="btn-ghost">Make Another Order</button>
            <button id="differentRestaurantBtn" class="btn-ghost">Try Different Restaurant</button>
          </div>
        </div>
      `;

      const tryAgainBtn = elFlowPanel.querySelector("#tryAgainBtn");
      const newOrderBtn = elFlowPanel.querySelector("#newOrderBtn");
      const differentRestaurantBtn = elFlowPanel.querySelector("#differentRestaurantBtn");

      if (tryAgainBtn) {
        tryAgainBtn.onclick = () => {
          awaitingOrderId = null;
          saveSession();
          hideFlow();
          renderCart();
        };
      }

      if (newOrderBtn) {
        newOrderBtn.onclick = () => {
          awaitingOrderId = null;
          cart = [];
          resetServiceSelection();
          resetPaymentMethodSelection();
          saveSession();
          renderCart();
          hideFlow();
        };
      }

      if (differentRestaurantBtn) {
        differentRestaurantBtn.onclick = () => {
          awaitingOrderId = null;
          cart = [];
          resetServiceSelection();
          resetPaymentMethodSelection();
          saveSession();
          renderCart();
          hideFlow();
          window.scrollTo({ top: 0, behavior: "smooth" });
        };
      }

      return;
    }

    if (order.status === "approved" || order.status === "awaiting_payment" || order.status === "awaiting_cash_payment") {
      const method = paymentMethodOf(order);
      const autoText = order.autoAccepted || order.restaurantResponse === "auto_accepted"
        ? `Restaurant did not reject within ${RESTAURANT_APPROVAL_SECONDS} seconds, so the order was accepted automatically.`
        : "Restaurant accepted your order.";

      if (method === "cash") {
        const pendingCash = order.status === "awaiting_cash_payment" || order.status === "awaiting_payment";
        elFlowPanel.innerHTML = `
        <div class="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div class="text-xs uppercase tracking-widest text-emerald-200">${pendingCash ? "Cash Payment" : "Accepted"}</div>
              <div class="text-xl font-semibold mt-1">${pendingCash ? "Waiting for Cash Confirmation" : "Restaurant Accepted Your Order"}</div>
              <div class="text-sm text-slate-300 mt-2">
                ${escapeHtml(autoText)}
              </div>
              <div class="text-sm text-slate-300 mt-3">
                Estimated prep: <span class="pill">${escapeHtml(r?.prepTimeMins || 15)} min</span>
                • <span class="pill">${escapeHtml(svcText)}</span>
                • <span class="pill">Cash Payment</span>
              </div>
              <div class="text-sm text-slate-400 mt-3">
                Print the cash slip and take payment at the counter. Staff must scan the cash confirmation QR and confirm payment before preparation starts.
              </div>
            </div>
            <div class="pill badge-yellow">${pendingCash ? "Cash Pending" : "Accepted"}</div>
          </div>
          <div class="mt-5 flex gap-2 flex-wrap">
            <button id="cashSlipBtn" class="btn-primary">${pendingCash ? "Reprint Cash Slip" : "Print Cash Slip"}</button>
            <button id="trackBtn" class="btn-ghost">Open Tracking Page</button>
          </div>
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
          }, 900);
        }

        return;
      }

      elFlowPanel.innerHTML = `
        <div class="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div class="text-xs uppercase tracking-widest text-emerald-200">Accepted</div>
              <div class="text-xl font-semibold mt-1">Restaurant accepted your order.</div>
              <div class="text-sm text-slate-300 mt-2">${escapeHtml(autoText)}</div>
              <div class="text-sm text-slate-300 mt-3">
                Estimated prep: <span class="pill">${escapeHtml(r?.prepTimeMins || 15)} min</span>
                • <span class="pill">${escapeHtml(svcText)}</span>
                • Priority: <span class="pill">${items.some((i) => i.fast) ? "Fast items" : "Standard"}</span>
              </div>
              <div class="text-sm text-slate-400 mt-3">
                Stripe payment QR will open automatically. Scan it to complete payment.
              </div>
            </div>
            <div class="pill badge-green">Accepted</div>
          </div>
        </div>
      `;

      if (autoStripeStartedForOrderId !== order.id) {
        autoStripeStartedForOrderId = order.id;
        setTimeout(async () => {
          await openPayment(order.id);
        }, 900);
      }

      return;
    }

    if (["paid", "preparing", "ready", "completed"].includes(order.status)) {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">In Queue</div>
            <div class="text-xl font-semibold mt-1">Order Confirmed</div>
            <div class="text-sm text-slate-300 mt-2">Order <span class="pill">${escapeHtml(order.id)}</span> is now in preparation queue. <span class="pill">${escapeHtml(svcText)}</span></div>
          </div>
          <div class="pill badge-green">${escapeHtml(String(order.status).toUpperCase())}</div>
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
    if (o) {
      if (o.status === "pending_approval") scheduleRestaurantAutoAccept(o);
      else clearRestaurantAutoAccept(o.id);
      renderFlow(o);
    } else {
      hideFlow();
    }
  }
async function browserPrintSlipOnly(orderId) {
  // Do NOT use Chromium/browser print preview here.
  // This sends the slip to the Raspberry Pi local print bridge instead.
  return await printReceiptOnly(orderId);
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
    cashConfirmPayload: cashQrPayloadForOrder(order),
    cashConfirmUrl: ""
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
    autoPrintReceiptOnce(orderId);

    await refreshFlowPanel();
  } catch (err) {
    console.error("kiosk.js: cash slip failed", err);
    alertSafe(`Cash slip failed: ${err.message || err}`);
  }
  }

  function prepareStripeCustomerPaymentUi() {
    if (!paymentModal) return;

    paymentModal.classList.remove("hidden");
    paymentModal.style.display = "";

    const outerWrap = paymentModal.firstElementChild;
    const card = paymentModal.querySelector(".rounded-3xl.bg-slate-950");
    const grid = paymentModal.querySelector(".grid");
    const rightPanel = paymentModal.querySelector(".space-y-3");
    const qrShell = qrBox?.parentElement || null;

    /* Important: the earlier test-card hiding logic could accidentally add
       fc-payment-hidden to the main wrapper. Remove it from the real Stripe
       layout parts first so the dark overlay never appears empty. */
    [outerWrap, card, grid, rightPanel, qrShell].forEach((node) => {
      if (!node) return;
      node.classList.remove("hidden", "fc-payment-hidden");
      node.style.display = "";
    });

    if (card) card.classList.add("fc-payment-card");
    if (grid) grid.classList.add("fc-payment-grid");
    if (qrShell) qrShell.classList.add("fc-qr-shell");

    if (simulatePayBtn) {
      simulatePayBtn.classList.add("hidden", "fc-payment-hidden");
      simulatePayBtn.style.display = "none";
      simulatePayBtn.disabled = true;
      simulatePayBtn.onclick = null;
      simulatePayBtn.textContent = "";
    }

    if (simulateFailBtn) {
      simulateFailBtn.classList.add("hidden", "fc-payment-hidden");
      simulateFailBtn.style.display = "none";
      simulateFailBtn.disabled = true;
      simulateFailBtn.onclick = null;
      simulateFailBtn.textContent = "";
    }

    /* Hide only the small test-card row. Never hide parents/wrappers whose text
       includes the QR/payment card content, otherwise the modal becomes a dark
       empty overlay. */
    const testCardCandidates = Array.from(paymentModal.querySelectorAll("div, span"));
    testCardCandidates.forEach((node) => {
      const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
      const hasTestCardText = /Test card/i.test(text) || /4242\s*4242/i.test(text);
      const isSmallTestNode = hasTestCardText && text.length <= 90 && node.children.length <= 2;

      if (!isSmallTestNode) return;
      if (node === outerWrap || node === card || node === grid || node === rightPanel || node === qrShell) return;
      if (node.querySelector("#qrBox") || node.closest("#qrBox")) return;

      let target = node;
      if (node.parentElement && node.parentElement !== paymentModal) {
        const parentText = String(node.parentElement.textContent || "").replace(/\s+/g, " ").trim();
        if (/Test card/i.test(parentText) && parentText.length <= 90) {
          target = node.parentElement;
        }
      }

      if (target !== outerWrap && target !== card && target !== grid && target !== rightPanel && target !== qrShell) {
        target.classList.add("fc-payment-hidden");
      }
    });
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
    prepareStripeCustomerPaymentUi();

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
      payCountdown.textContent = "Secure QR";
    }

    if (payStatus) {
      payStatus.textContent = "Creating secure payment QR...";
    }

    if (simulateFailBtn) {
      simulateFailBtn.classList.add("hidden", "fc-payment-hidden");
    }

    if (simulatePayBtn) {
      simulatePayBtn.classList.add("hidden", "fc-payment-hidden");
      simulatePayBtn.disabled = true;
      simulatePayBtn.onclick = null;
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

      if (payCountdown) {
        payCountdown.textContent = "Waiting for scan";
      }

      if (payStatus) {
        payStatus.textContent = "Scan this QR code with your phone to complete payment securely.";
      }

      if (simulatePayBtn) {
        simulatePayBtn.classList.add("hidden", "fc-payment-hidden");
        simulatePayBtn.disabled = true;
        simulatePayBtn.onclick = null;
      }

      startStripePolling(orderId, stripeSession.sessionId);
    } catch (err) {
      console.error("kiosk.js: Stripe checkout failed", err);

      if (payStatus) {
        payStatus.textContent = `Stripe checkout failed: ${err.message || err}`;
      }

      if (simulatePayBtn) {
        simulatePayBtn.classList.add("hidden", "fc-payment-hidden");
        simulatePayBtn.disabled = true;
        simulatePayBtn.onclick = null;
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
    simulatePayBtn.classList.add("hidden", "fc-payment-hidden");
    simulatePayBtn.disabled = true;
    simulatePayBtn.onclick = null;
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
    const cashConfirmPayload = cashQrPayloadForOrder(order);
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
        ${qrBlock("Staff Cash Confirmation", cashConfirmPayload)}
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
      cashConfirmPayload: cashQrPayloadForOrder(order),
      cashConfirmUrl: ""
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

    if (receiptHint) {
      receiptHint.textContent = `Printer bridge is not available. Order ID: ${order.id}`;
    }

    alertSafe("Automatic printer bridge is not available. Please make sure the Raspberry Pi print bridge is running.");
    return false;
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
    tableNumberInput.readOnly = true;
    tableNumberInput.addEventListener("keydown", (e) => {
      e.preventDefault();
    });
    tableNumberInput.addEventListener("paste", (e) => {
      e.preventDefault();
    });
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

      if (awaitingOrderId) {
        const existing = await getOrderSafe(awaitingOrderId);
        if (existing && !["rejected", "cancelled", "completed", "timed_out"].includes(String(existing.status || "").toLowerCase())) {
          renderFlow(existing);
          alertSafe("Please finish the current order request before creating a new order.");
          return;
        }
      }

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
        alertSafe("This restaurant is closed right now. Please choose another open restaurant.");
        return;
      }

      const missingItems = cart.filter((ci) => {
        const mi = safeArray(r.menu).find((x) => x.id === ci.itemId);
        return !mi || !mi.available;
      });

      if (missingItems.length) {
        alertSafe("One or more selected items are not available right now. Please update your cart.");
        return;
      }

      const totals = computeTotals(cart);
      const approvalRequestedAt = nowISO();

      try {
        if (elCheckout) {
          elCheckout.disabled = true;
          elCheckout.classList.add("opacity-50");
          elCheckout.textContent = "Sending Request...";
        }

        const order = await createOrderSafe({
          restaurantId: r.id,
          serviceType: serviceSelection.serviceType,
          tableNumber: serviceSelection.tableNumber,
          paymentMethod: paymentSelection.paymentMethod,
          approvalRequestedAt,
          autoApproveAfterSeconds: RESTAURANT_APPROVAL_SECONDS,
          restaurantResponseRequired: true,
          items: cart.map((x) => ({
            ...x,
            fast: !!safeArray(r.menu).find((m) => m.id === x.itemId)?.fast
          })),
          totals
        });

        const orderForFlow = {
          ...order,
          status: order.status || "pending_approval",
          approvalRequestedAt: order.approvalRequestedAt || approvalRequestedAt,
          autoApproveAfterSeconds: RESTAURANT_APPROVAL_SECONDS,
          restaurantResponseRequired: true,
          paymentMethod: paymentSelection.paymentMethod
        };

        try {
          await updateOrderSafe(order.id, {
            status: "pending_approval",
            approvalRequestedAt: orderForFlow.approvalRequestedAt,
            autoApproveAfterSeconds: RESTAURANT_APPROVAL_SECONDS,
            restaurantResponseRequired: true,
            paymentMethod: paymentSelection.paymentMethod,
            payment: {
              ...safeObject(order.payment),
              method: paymentSelection.paymentMethod,
              paymentMethod: paymentSelection.paymentMethod,
              success: false
            }
          });
        } catch (patchErr) {
          console.warn("kiosk.js: approval metadata update failed, using created order", patchErr);
        }

        awaitingOrderId = order.id;
        autoStripeStartedForOrderId = null;
        autoCashSlipStartedForOrderId = null;
        autoCashPaidReceiptOpenedForOrderId = null;
        saveSession();

        renderFlow(orderForFlow);
        scheduleRestaurantAutoAccept(orderForFlow);

        if (elFlowPanel) {
          setTimeout(() => {
            elFlowPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 80);
        }

        await refreshQueueCount();
      } catch (err) {
        console.error("Checkout failed:", err);
        alertSafe(`Checkout failed: ${err.message || err}`);
      } finally {
        if (elCheckout) {
          elCheckout.textContent = "Checkout";
          renderCart();
        }
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

    if (o.status === "pending_approval") {
      scheduleRestaurantAutoAccept(o);
    } else {
      clearRestaurantAutoAccept(o.id);
    }

    if (
      o.status === "paid" &&
      paymentMethodOf(o) === "cash" &&
      autoCashPaidReceiptOpenedForOrderId !== o.id &&
      (!receiptModal || receiptModal.classList.contains("hidden"))
    ) {
      autoCashPaidReceiptOpenedForOrderId = o.id;
      await openReceipt(o.id);
      autoPrintReceiptOnce(o.id);
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