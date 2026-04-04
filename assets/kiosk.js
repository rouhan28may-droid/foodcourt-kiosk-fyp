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
    } catch { }
    return new Date().toISOString();
  }

  function money(value) {
    try {
      if (typeof FC.money === "function") return FC.money(value);
    } catch { }
    return String(value ?? 0);
  }

  function computeTotals(items) {
    try {
      if (typeof FC.computeTotals === "function") return FC.computeTotals(items);
    } catch { }
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

  const APPROVAL_TIMEOUT_MS = 15000;

  const elTabs = $("restaurantTabs");
  const elMenu = $("menuGrid");
  const elCart = $("cartItems");
  const elSubtotal = $("subtotal");
  const elTax = $("tax");
  const elTotal = $("total");
  const elCheckout = $("checkoutBtn");
  const elClearCart = $("clearCartBtn");
  const elReset = $("resetBtn");

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
  const kioskLockOverlay = $("kioskLockOverlay");
  const kioskUnlockTitle = $("kioskUnlockTitle");
  const kioskUnlockMessage = $("kioskUnlockMessage");
  const kioskPinInput = $("kioskPinInput");
  const kioskPinError = $("kioskPinError");
  const kioskUnlockBtn = $("kioskUnlockBtn");

  const sessionKey = "fc_session";
  const session = safeSessionRead(sessionKey, {});
  let activeRestaurantId = session.activeRestaurantId || "r1";
  let cart = safeArray(session.cart);
  let awaitingOrderId = session.awaitingOrderId || null;

  let payInterval = null;
  let paySecondsLeft = 0;
  let currentPayOrderId = null;
  let currentReceiptOrderId = null;

  let idleSeconds = 0;
  let adsIdx = 0;
  let adTimer = null;

  let renderBusy = false;
  let rerenderRequested = false;

  let kioskPassword = "2468";
  let kioskLocallyLocked = true;
  let fullscreenPreviouslyActive = false;

  function saveSession() {
    localStorage.setItem(
      sessionKey,
      JSON.stringify({
        activeRestaurantId,
        cart,
        awaitingOrderId
      })
    );
  }

  async function loadKioskCredentials() {
    try {
      const res = await fetch("data/users.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      kioskPassword = data?.kiosk?.password || "2468";
    } catch (err) {
      console.warn("kiosk.js: kiosk password load failed, using fallback", err);
      kioskPassword = "2468";
    }
  }

  function isAdminLocked() {
    return !!safeState().devices?.kioskDisplay?.locked;
  }

  function isKioskLocked() {
    return kioskLocallyLocked || isAdminLocked();
  }

  function showKioskLock(title, message, allowPin = true) {
    if (!kioskLockOverlay) return;

    kioskLockOverlay.classList.remove("hidden");

    if (kioskUnlockTitle) kioskUnlockTitle.textContent = title || "Kiosk Locked";
    if (kioskUnlockMessage) kioskUnlockMessage.textContent = message || "Enter kiosk password to continue.";

    if (kioskPinInput) {
      kioskPinInput.value = "";
      kioskPinInput.disabled = !allowPin;
    }

    if (kioskUnlockBtn) {
      kioskUnlockBtn.disabled = !allowPin;
      kioskUnlockBtn.classList.toggle("opacity-50", !allowPin);
    }

    if (kioskPinError) {
      kioskPinError.classList.add("hidden");
      kioskPinError.textContent = "Incorrect password.";
    }

    setTimeout(() => {
      if (allowPin && kioskPinInput) kioskPinInput.focus();
    }, 30);
  }

  function hideKioskLock() {
    if (!kioskLockOverlay) return;
    if (isAdminLocked()) return;
    kioskLockOverlay.classList.add("hidden");
  }

  function syncKioskLockState() {
    if (isAdminLocked()) {
      kioskLocallyLocked = true;
      showKioskLock(
        "Kiosk Locked by Admin",
        "This kiosk was locked from the control panel. Unlock it there first.",
        false
      );
      return;
    }

    if (kioskLocallyLocked) {
      showKioskLock(
        "Kiosk Locked",
        "Enter kiosk password to continue using this customer dashboard.",
        true
      );
    } else {
      hideKioskLock();
    }
  }

  async function unlockKioskWithPassword() {
    if (isAdminLocked()) {
      showKioskLock(
        "Kiosk Locked by Admin",
        "This kiosk was locked from the control panel. Unlock it there first.",
        false
      );
      return false;
    }

    const entered = (kioskPinInput?.value || "").trim();

    if (!entered || entered !== kioskPassword) {
      if (kioskPinError) {
        kioskPinError.textContent = "Incorrect password.";
        kioskPinError.classList.remove("hidden");
      }
      if (kioskPinInput) kioskPinInput.focus();
      return false;
    }

    kioskLocallyLocked = false;
    hideKioskLock();
    return true;
  }

  function ensureUnlockedOrBlock(message) {
    if (!isKioskLocked()) return true;

    showKioskLock(
      "Kiosk Locked",
      message || "Enter kiosk password to continue using this customer dashboard.",
      !isAdminLocked()
    );
    return false;
  }

  async function enterFullscreenSafe() {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.error("Fullscreen request failed:", err);
      alertSafe("Fullscreen failed. Browser may have blocked it.");
    }
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
    if (!ensureUnlockedOrBlock("Enter kiosk password before adding items.")) return;
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
    if (!ensureUnlockedOrBlock("Enter kiosk password before editing the cart.")) return;
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
    if (!ensureUnlockedOrBlock("Enter kiosk password before clearing the cart.")) return;
    cart = [];
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
            <div class="text-xs text-slate-400 mt-1">${m.category || "General"} • ${m.fast ? "Fast item" : "Standard"}</div>
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
            <div class="text-xs text-slate-400 mt-1">${money(Number(it.price || 0))} • Qty ${Number(it.qty || 0)}</div>
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

    elCheckout.disabled = cart.length === 0;
    elCheckout.classList.toggle("opacity-50", cart.length === 0);
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

    if (order.status === "pending_approval") {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">Order Sent</div>
            <div class="text-xl font-semibold mt-1">Waiting for Approval</div>
            <div class="text-sm text-slate-300 mt-2">Order <span class="pill">${order.id}</span> sent to <span class="pill">${r?.name || "Restaurant"}</span></div>
          </div>
          <div class="pill badge-yellow">Pending</div>
        </div>
        <div class="mt-4 text-sm text-slate-400">Restaurant must approve manually within 15 seconds, otherwise the request will be cancelled.</div>
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

    if (order.status === "approved" || order.status === "awaiting_payment") {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">Approved</div>
            <div class="text-xl font-semibold mt-1">Proceed to Payment</div>
            <div class="text-sm text-slate-300 mt-2">Estimated prep: <span class="pill">${r?.prepTimeMins || 15} min</span> • Priority: <span class="pill">${items.some((i) => i.fast) ? "Fast items" : "Standard"}</span></div>
          </div>
          <div class="pill badge-green">Approved</div>
        </div>
        <button id="payBtn" class="btn-primary mt-5">Pay Now (QR)</button>
      `;

      const payBtn = elFlowPanel.querySelector("#payBtn");
      if (payBtn) {
        payBtn.onclick = async () => {
          await openPayment(order.id);
        };
      }
      return;
    }

    if (["paid", "preparing", "ready", "completed"].includes(order.status)) {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">In Queue</div>
            <div class="text-xl font-semibold mt-1">Order Confirmed</div>
            <div class="text-sm text-slate-300 mt-2">Order <span class="pill">${order.id}</span> is now in preparation queue.</div>
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

  async function openPayment(orderId) {
    if (!ensureUnlockedOrBlock("Enter kiosk password before opening payment.")) return;
    const s = safeState();
    const order = await getOrderSafe(orderId);
    if (!order) return;

    currentPayOrderId = orderId;

    const payment = {
      ...safeObject(order.payment),
      attemptCount: Number(order.payment?.attemptCount || 0) + 1,
      success: false,
      method: "QR",
      qrPayload: `PAY|${order.id}|${order.total}|${order.currency}|${Date.now()}`
    };

    await updateOrderSafe(orderId, {
      status: "awaiting_payment",
      payment
    });

    if (paymentModal) paymentModal.classList.remove("hidden");

    if (qrBox) {
      qrBox.innerHTML = "";
      try {
        new QRCode(qrBox, {
          text: payment.qrPayload,
          width: 180,
          height: 180
        });
      } catch (err) {
        console.error("kiosk.js: QRCode render failed", err);
        qrBox.textContent = payment.qrPayload;
      }
    }

    if (payAmount) payAmount.textContent = `Amount: ${money(order.total)} (${order.currency || "PKR"})`;
    if (payStatus) payStatus.textContent = "Waiting for payment verification...";

    paySecondsLeft = Number(s.settings?.paymentTimeoutSeconds || 180);
    if (payCountdown) payCountdown.textContent = String(paySecondsLeft);

    if (payInterval) clearInterval(payInterval);

    payInterval = setInterval(async () => {
      paySecondsLeft -= 1;
      if (payCountdown) payCountdown.textContent = String(Math.max(paySecondsLeft, 0));

      if (paySecondsLeft <= 0) {
        clearInterval(payInterval);
        payInterval = null;

        if (payStatus) payStatus.textContent = "Payment timeout. Order cancelled.";
        await updateOrderSafe(orderId, {
          status: "rejected",
          rejectReason: "Payment timeout"
        });

        setTimeout(() => {
          closePayment();
        }, 1200);
      }
    }, 1000);

    await refreshFlowPanel();
  }

  async function closePayment() {
    if (paymentModal) paymentModal.classList.add("hidden");
    if (payInterval) clearInterval(payInterval);
    payInterval = null;
    if (qrBox) qrBox.innerHTML = "";
    currentPayOrderId = null;
    await refreshFlowPanel();
  }

  if (closePaymentBtn) {
    closePaymentBtn.onclick = async () => {
      await closePayment();
    };
  }

  if (simulateFailBtn) {
    simulateFailBtn.onclick = () => {
      if (!currentPayOrderId) return;
      if (payStatus) payStatus.textContent = "Payment failed (simulated). Please retry.";
    };
  }

  if (simulatePayBtn) {
    simulatePayBtn.onclick = async () => {
      if (!currentPayOrderId) return;

      const o = await getOrderSafe(currentPayOrderId);
      if (!o) return;

      const payment = {
        ...safeObject(o.payment),
        success: true
      };

      simulateGatewayVerifySafe(true);

      await updateOrderSafe(currentPayOrderId, {
        status: "paid",
        paidAt: nowISO(),
        payment
      });

      logSafe(`Payment verified for ${o.id}. Order placed.`);

      if (payStatus) payStatus.textContent = "Payment verified ✅";

      setTimeout(async () => {
        await closePayment();
        await openReceipt(o.id);

        const printed = await printReceiptOnly(o.id);

        if (printed) {
          setTimeout(async () => {
            await closeReceipt();
          }, 1200);
        }
      }, 700);
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

  function buildCustomerSlip(order) {
    const restaurant = getRestaurantById(order.restaurantId);
    const receiptDate = order.paidAt || order.createdAt || nowISO();

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
      <div class="copy-badge">CUSTOMER COPY</div>
      <div class="title">Food Court Kiosk</div>
      <div class="sub-title">${escapeHtml(restaurant?.name || "")}</div>
      <div class="meta">Receipt • ${escapeHtml(new Date(receiptDate).toLocaleString())}</div>

      <hr class="divider" />

      <div class="row">
        <div class="label">Order ID</div>
        <div class="value"><b>${escapeHtml(order.id)}</b></div>
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

      <div class="footer">
        Thank you<br>
        Please wait for your order
      </div>
    </section>
  `;
  }

  function buildRestaurantSlip(order) {
    const restaurant = getRestaurantById(order.restaurantId);
    const receiptDate = order.paidAt || order.createdAt || nowISO();

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
      <div class="meta">${escapeHtml(new Date(receiptDate).toLocaleString())}</div>

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

      <div class="kitchen-note">PAID ORDER • START PREPARATION</div>
      <div class="prep-note">Give this slip to the waiter / restaurant</div>
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
    receiptHint.textContent = `Show/print this receipt. Order ID: ${order.id}`;

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
    if (!ensureUnlockedOrBlock("Enter kiosk password before printing.")) return false;

    const order = await getOrderSafe(orderId);
    if (!order) return false;

    const restaurant = getRestaurantById(order.restaurantId);

    const payload = {
      ...order,
      restaurantName: restaurant?.name || "Restaurant"
    };

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
    }

    awaitingOrderId = null;
    currentReceiptOrderId = null;
    cart = [];
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

  if (elCheckout) {
    elCheckout.onclick = async () => {
      if (!ensureUnlockedOrBlock("Enter kiosk password before checkout.")) return;
      if (!cart.length) return;

      const r = getRestaurant();
      if (!r) {
        alertSafe("No restaurant loaded.");
        return;
      }

      if (!r.online) {
        alertSafe("Restaurant is offline right now.");
        return;
      }

      const totals = computeTotals(cart);

      try {
        const order = await createOrderSafe({
          restaurantId: r.id,
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

        setTimeout(async () => {
          const o = await getOrderSafe(order.id);
          if (o && o.status === "pending_approval") {
            await updateOrderSafe(order.id, {
              status: "rejected",
              rejectReason: "Food not available or restaurant did not respond in time"
            });
            logSafe(`Order ${order.id} auto-rejected after approval timeout.`);
          }
        }, APPROVAL_TIMEOUT_MS);
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

  if (fullscreenBtn) {
    fullscreenBtn.onclick = async () => {
      if (!ensureUnlockedOrBlock("Enter kiosk password before entering fullscreen.")) return;
      await enterFullscreenSafe();
    };
  }

  if (kioskUnlockBtn) {
    kioskUnlockBtn.onclick = async () => {
      await unlockKioskWithPassword();
    };
  }

  if (kioskPinInput) {
    kioskPinInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await unlockKioskWithPassword();
      }
    });
  }

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      fullscreenPreviouslyActive = true;
      return;
    }

    if (fullscreenPreviouslyActive) {
      fullscreenPreviouslyActive = false;
      kioskLocallyLocked = true;
      showKioskLock(
        "Fullscreen Exited",
        "Enter kiosk password to continue after exiting fullscreen.",
        true
      );
    }
  });

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
  await loadKioskCredentials();
  kioskLocallyLocked = true;
  syncKioskLockState();
  await renderAll();

  window.addEventListener("fc:state-changed", async () => {
    syncKioskLockState();
    await renderAll();
    if (awaitingOrderId) {
      const o = await getOrderSafe(awaitingOrderId);
      if (o) renderFlow(o);
    }
  });

  window.addEventListener("focus", () => {
    syncKioskLockState();
    renderAll();
  });
})();
