
(async function () {
  await FC.seed();

  const elTabs = document.getElementById("restaurantTabs");
  const elMenu = document.getElementById("menuGrid");
  const elCart = document.getElementById("cartItems");
  const elSubtotal = document.getElementById("subtotal");
  const elTax = document.getElementById("tax");
  const elTotal = document.getElementById("total");
  const elCheckout = document.getElementById("checkoutBtn");
  const elClearCart = document.getElementById("clearCartBtn");
  const elReset = document.getElementById("resetBtn");

  const elActiveName = document.getElementById("activeRestaurantName");
  const elActiveTagline = document.getElementById("activeRestaurantTagline");
  const elTaxRateLabel = document.getElementById("taxRateLabel");
  const elQueueCount = document.getElementById("queueCount");

  const elSearch = document.getElementById("searchInput");
  const elCategory = document.getElementById("categorySelect");
  const elFlowPanel = document.getElementById("flowPanel");

  // payment + receipt
  const paymentModal = document.getElementById("paymentModal");
  const qrBox = document.getElementById("qrBox");
  const payAmount = document.getElementById("payAmount");
  const payCountdown = document.getElementById("payCountdown");
  const payStatus = document.getElementById("payStatus");
  const closePaymentBtn = document.getElementById("closePaymentBtn");
  const simulatePayBtn = document.getElementById("simulatePayBtn");
  const simulateFailBtn = document.getElementById("simulateFailBtn");

  const receiptModal = document.getElementById("receiptModal");
  const printArea = document.getElementById("printArea");
  const receiptHint = document.getElementById("receiptHint");
  const closeReceiptBtn = document.getElementById("closeReceiptBtn");
  const printBtn = document.getElementById("printBtn");
  const doneBtn = document.getElementById("doneBtn");

  // ads overlay
  const adsOverlay = document.getElementById("adsOverlay");
  const adTitle = document.getElementById("adTitle");
  const adSubtitle = document.getElementById("adSubtitle");

  // session state
  const sessionKey = "fc_session";
  const session = JSON.parse(localStorage.getItem(sessionKey) || "{}");
  let activeRestaurantId = session.activeRestaurantId || "r1";
  let cart = session.cart || []; // [{restaurantId, itemId, name, price, qty}]
  let awaitingOrderId = session.awaitingOrderId || null;

  const saveSession = () => {
    localStorage.setItem(sessionKey, JSON.stringify({ activeRestaurantId, cart, awaitingOrderId }));
  };

  // idle mode ads
  let idleSeconds = 0;
  let adsIdx = 0;
  let adTimer = null;

  const resetIdle = () => {
    idleSeconds = 0;
    if (!adsOverlay.classList.contains("hidden")) {
      hideAds();
    }
  };

  const showAds = () => {
    const s = FC.getState();
    const enabledAds = s.ads.filter(a => a.enabled);
    if (enabledAds.length === 0) return;

    adsOverlay.classList.remove("hidden");
    renderAd();
    if (adTimer) clearInterval(adTimer);
    adTimer = setInterval(() => {
      adsIdx = (adsIdx + 1) % enabledAds.length;
      renderAd();
    }, 5000);

    function renderAd() {
      const ad = enabledAds[adsIdx];
      adTitle.textContent = ad.title;
      adSubtitle.textContent = ad.subtitle;
      FC.trackAdImpression(ad.id);
    }
  };

  const hideAds = () => {
    adsOverlay.classList.add("hidden");
    if (adTimer) clearInterval(adTimer);
    adTimer = null;
  };

  // reset idle on any interaction
  ["mousemove", "mousedown", "touchstart", "keydown", "scroll"].forEach(evt => {
    window.addEventListener(evt, resetIdle, { passive: true });
  });
  adsOverlay.addEventListener("click", resetIdle);

  setInterval(() => {
    const s = FC.getState();
    idleSeconds += 1;
    if (idleSeconds >= (s.settings.idleAdsAfterSeconds || 240)) {
      showAds();
    }
  }, 1000);

  function getRestaurant() {
    const s = FC.getState();
    return s.restaurants.find(r => r.id === activeRestaurantId) || s.restaurants[0];
  }

  function renderTabs() {
    const s = FC.getState();
    elTabs.innerHTML = "";
    s.restaurants.forEach(r => {
      const btn = document.createElement("button");
      btn.className = "px-4 py-2 rounded-2xl border border-white/10 text-sm " + (r.id === activeRestaurantId ? "bg-white/10" : "bg-white/5 hover:bg-white/10");
      btn.innerHTML = `<div class="font-semibold">${r.name}</div><div class="text-xs text-slate-400">${r.online ? "Online" : "Offline"}</div>`;
      btn.onclick = () => {
        activeRestaurantId = r.id;
        saveSession();
        renderAll();
      };
      elTabs.appendChild(btn);
    });
  }

  function uniqueCategories(menu) {
    const cats = ["All"];
    for (const m of menu) {
      if (!cats.includes(m.category)) cats.push(m.category);
    }
    return cats;
  }

  function renderCategorySelect() {
    const r = getRestaurant();
    const cats = uniqueCategories(r.menu);
    const current = elCategory.value || "All";
    elCategory.innerHTML = "";
    cats.forEach(c => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      elCategory.appendChild(o);
    });
    elCategory.value = cats.includes(current) ? current : "All";
  }

  function renderMenu() {
    const s = FC.getState();
    const r = getRestaurant();
    elActiveName.textContent = r.name;
    elActiveTagline.textContent = r.tagline;

    const qCount = s.orders.filter(o => ["paid", "preparing", "ready"].includes(o.status)).length;
    elQueueCount.textContent = qCount;
    elTaxRateLabel.textContent = Math.round((s.settings.taxRate || 0.13) * 100) + "%";

    const search = (elSearch.value || "").toLowerCase().trim();
    const cat = elCategory.value || "All";

    const filtered = r.menu.filter(m => {
      if (cat !== "All" && m.category !== cat) return false;
      if (search && !m.name.toLowerCase().includes(search)) return false;
      return true;
    });

    elMenu.innerHTML = "";
    filtered.forEach(m => {
      const card = document.createElement("div");
      card.className = "card p-4";
      const available = r.online && m.available;
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold">${m.name}</div>
            <div class="text-xs text-slate-400 mt-1">${m.category} • ${m.fast ? "Fast item" : "Standard"}</div>
          </div>
          <div class="text-sm font-semibold">${FC.money(m.price)}</div>
        </div>
        <div class="mt-4 flex items-center justify-between">
          <div class="text-xs ${available ? "text-emerald-300" : "text-rose-300"}">${available ? "Available" : (r.online ? "Out of stock" : "Restaurant offline")}</div>
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

  function addToCart(restaurantId, menuItem) {
    // Enforce: cart holds items from one restaurant (simple kiosk flow)
    if (cart.length && cart[0].restaurantId !== restaurantId) {
      alert("Cart contains items from another restaurant. Clear cart to switch restaurants.");
      return;
    }
    const found = cart.find(x => x.itemId === menuItem.id);
    if (found) found.qty += 1;
    else cart.push({ restaurantId, itemId: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1 });
    saveSession();
    renderCart();
  }

  function updateQty(itemId, delta) {
    const it = cart.find(x => x.itemId === itemId);
    if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) cart = cart.filter(x => x.itemId !== itemId);
    saveSession();
    renderCart();
  }

  function renderCart() {
    elCart.innerHTML = "";
    if (cart.length === 0) {
      elCart.innerHTML = `<div class="text-sm text-slate-400">Cart is empty. Add items to proceed.</div>`;
    } else {
      cart.forEach(it => {
        const row = document.createElement("div");
        row.className = "flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10";
        row.innerHTML = `
          <div class="min-w-0">
            <div class="font-semibold truncate">${it.name}</div>
            <div class="text-xs text-slate-400 mt-1">${FC.money(it.price)} • Qty ${it.qty}</div>
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

    const totals = FC.computeTotals(cart);
    elSubtotal.textContent = FC.money(totals.subtotal);
    elTax.textContent = FC.money(totals.tax);
    elTotal.textContent = FC.money(totals.total);

    elCheckout.disabled = cart.length === 0;
    elCheckout.classList.toggle("opacity-50", cart.length === 0);
  }

  function renderFlow(order) {
    elFlowPanel.classList.remove("hidden");
    elFlowPanel.className = "mt-6 glass p-5 rounded-3xl";
    const r = getRestaurant();

    if (order.status === "pending_approval") {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">Order Sent</div>
            <div class="text-xl font-semibold mt-1">Waiting for Approval</div>
            <div class="text-sm text-slate-300 mt-2">Order <span class="pill">${order.id}</span> sent to <span class="pill">${r.name}</span></div>
          </div>
          <div class="pill badge-yellow">Pending</div>
        </div>
        <div class="mt-4 text-sm text-slate-400">Restaurant will approve/reject based on availability.</div>
      `;
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
      elFlowPanel.querySelector("#tryAgainBtn").onclick = () => {
        awaitingOrderId = null;
        saveSession();
        elFlowPanel.classList.add("hidden");
      };
      elFlowPanel.querySelector("#cancelBtn").onclick = () => {
        awaitingOrderId = null;
        saveSession();
        cart = [];
        saveSession();
        renderCart();
        elFlowPanel.classList.add("hidden");
      };
    }

    if (order.status === "approved" || order.status === "awaiting_payment") {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">Approved</div>
            <div class="text-xl font-semibold mt-1">Proceed to Payment</div>
            <div class="text-sm text-slate-300 mt-2">Estimated prep: <span class="pill">${r.prepTimeMins} min</span> • Priority: <span class="pill">${order.items.some(i => i.fast) ? "Fast items" : "Standard"}</span></div>
          </div>
          <div class="pill badge-green">Approved</div>
        </div>
        <button id="payBtn" class="btn-primary mt-5">Pay Now (QR)</button>
      `;
      elFlowPanel.querySelector("#payBtn").onclick = () => openPayment(order.id);
    }

    if (["paid", "preparing", "ready", "completed"].includes(order.status)) {
      elFlowPanel.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400">In Queue</div>
            <div class="text-xl font-semibold mt-1">Order Confirmed</div>
            <div class="text-sm text-slate-300 mt-2">Order <span class="pill">${order.id}</span> is now in preparation queue.</div>
          </div>
          <div class="pill badge-green">${order.status.toUpperCase()}</div>
        </div>
        <div class="mt-4 text-sm text-slate-400">You can show this screen as proof of payment.</div>
      `;
    }
  }

  let payInterval = null;
  let paySecondsLeft = 0;
  let currentPayOrderId = null;
  let currentReceiptOrderId = null;

  function openPayment(orderId) {
    const s = FC.getState();
    const order = FC.getOrder(orderId);
    if (!order) return;

    currentPayOrderId = orderId;

    // create QR payload
    const payload = `PAY|${order.id}|${order.total}|${order.currency}|${Date.now()}`;
    order.payment.attemptCount = (order.payment.attemptCount || 0) + 1;
    order.payment.method = "QR";
    order.payment.qrPayload = payload;

    // lock: awaiting payment
    FC.updateOrder(orderId, { status: "awaiting_payment", payment: order.payment });

    // UI
    paymentModal.classList.remove("hidden");
    qrBox.innerHTML = "";
    new QRCode(qrBox, { text: payload, width: 180, height: 180 });
    payAmount.textContent = `Amount: ${FC.money(order.total)} (${order.currency})`;
    payStatus.textContent = "Waiting for payment verification...";
    paySecondsLeft = s.settings.paymentTimeoutSeconds || 180;
    payCountdown.textContent = paySecondsLeft;

    if (payInterval) clearInterval(payInterval);
    payInterval = setInterval(() => {
      paySecondsLeft -= 1;
      payCountdown.textContent = paySecondsLeft;
      if (paySecondsLeft <= 0) {
        clearInterval(payInterval);
        payInterval = null;
        payStatus.textContent = "Payment timeout. Order cancelled.";
        FC.updateOrder(orderId, { status: "rejected", rejectReason: "Payment timeout" });
        setTimeout(() => closePayment(), 1200);
      }
    }, 1000);
  }

  function closePayment() {
    paymentModal.classList.add("hidden");
    if (payInterval) clearInterval(payInterval);
    payInterval = null;
    qrBox.innerHTML = "";
    currentPayOrderId = null;
    // refresh flow panel
    if (awaitingOrderId) {
      const o = FC.getOrder(awaitingOrderId);
      if (o) renderFlow(o);
    }
  }

  closePaymentBtn.onclick = closePayment;

  simulateFailBtn.onclick = () => {
    if (!currentPayOrderId) return;
    payStatus.textContent = "Payment failed (simulated). Please retry.";
  };

  simulatePayBtn.onclick = () => {
    if (!currentPayOrderId) return;
    const o = FC.getOrder(currentPayOrderId);
    if (!o) return;

    o.payment.success = true;
    FC.simulateGatewayVerify(true);
    FC.updateOrder(currentPayOrderId, { status: "paid", paidAt: FC.nowISO(), payment: o.payment });
    FC.log(`Payment verified for ${o.id}. Order placed.`);

    payStatus.textContent = "Payment verified ✅";
    setTimeout(() => {
      closePayment();
      openReceipt(o.id);
    }, 700);
  };

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
    const restaurant = FC.getState().restaurants.find(r => r.id === order.restaurantId);
    const receiptDate = order.paidAt || order.createdAt || FC.nowISO();

    const itemRows = (order.items || []).map(item => {
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.price || 0);
      const lineTotal = qty * unitPrice;

      return `
      <tr>
        <td class="item">${escapeHtml(item.name)}</td>
        <td class="qty">${qty}</td>
        <td class="amount">${escapeHtml(FC.money(lineTotal))}</td>
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
          <div class="value">${escapeHtml(FC.money(order.subtotal || 0))}</div>
        </div>
        <div class="row">
          <div class="label">Tax</div>
          <div class="value">${escapeHtml(FC.money(order.tax || 0))}</div>
        </div>
        <div class="row grand-total">
          <div>Total</div>
          <div>${escapeHtml(FC.money(order.total || 0))}</div>
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
    const restaurant = FC.getState().restaurants.find(r => r.id === order.restaurantId);
    const receiptDate = order.paidAt || order.createdAt || FC.nowISO();

    const itemRows = (order.items || []).map(item => {
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

  function renderReceiptPreview(orderId) {
    const order = FC.getOrder(orderId);
    if (!order) return;

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

  function openReceipt(orderId) {
    renderReceiptPreview(orderId);
  }

  function printReceiptOnly(orderId) {
    const order = FC.getOrder(orderId);
    if (!order) return;

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

    FC.simulatePrinterPaperUse();
  }

  function closeReceipt() {
    receiptModal.classList.add("hidden");
    printArea.scrollTop = 0;
    printArea.style.maxHeight = "";
    printArea.style.overflowY = "";
    printArea.style.overflowX = "";
    printArea.style.paddingRight = "";
    printArea.style.scrollBehavior = "";
    
    if (awaitingOrderId) {
      const o = FC.getOrder(awaitingOrderId);
      if (o && o.status === "paid") {
        FC.updateOrder(o.id, { status: "preparing" });
      }
    }

    awaitingOrderId = null;
    currentReceiptOrderId = null;
    cart = [];
    saveSession();
    renderCart();
    elFlowPanel.classList.add("hidden");
  }

  closeReceiptBtn.onclick = closeReceipt;
  doneBtn.onclick = closeReceipt;

  printBtn.onclick = () => {
    if (!currentReceiptOrderId) return;
    printReceiptOnly(currentReceiptOrderId);
  };
  // checkout
  elCheckout.onclick = () => {
    if (cart.length === 0) return;
    const r = getRestaurant();
    if (!r.online) {
      alert("Restaurant is offline right now.");
      return;
    }

    // auto-approval logic: if online and all items available -> auto approve after short delay
    const allAvailable = cart.every(ci => {
      const mi = r.menu.find(x => x.id === ci.itemId);
      return mi && mi.available;
    });

    const totals = FC.computeTotals(cart);
    const order = FC.createOrder({
      restaurantId: r.id,
      items: cart.map(x => ({ ...x, fast: !!r.menu.find(m => m.id === x.itemId)?.fast })),
      totals
    });

    awaitingOrderId = order.id;
    saveSession();
    renderFlow(order);

    if (allAvailable && r.online) {
      // simulate auto approval (efficiency improvement)
      setTimeout(() => {
        const o = FC.getOrder(order.id);
        if (o && o.status === "pending_approval") {
          FC.updateOrder(order.id, { status: "approved", approvedAt: FC.nowISO() });
          FC.log(`Order ${order.id} auto-approved (restaurant online + items available).`);
        }
      }, 900);
    }
  };

  elClearCart.onclick = () => {
    cart = [];
    saveSession();
    renderCart();
  };
  elClearCart.onclick = () => {
    cart = [];
    saveSession();
    renderCart();
  };

  elReset.onclick = async () => {
    if (confirm("Reset demo state? This clears all orders and settings.")) {
      await FC.reset();
      location.reload();
    }
  };

  // search + category
  elSearch.addEventListener("input", () => renderMenu());
  elCategory.addEventListener("change", () => renderMenu());

  // polling for order updates
  setInterval(() => {
    if (!awaitingOrderId) return;
    const o = FC.getOrder(awaitingOrderId);
    if (!o) return;
    renderFlow(o);
  }, 900);

  function renderAll() {
    renderTabs();
    renderCategorySelect();
    renderMenu();
    renderCart();

    if (awaitingOrderId) {
      const o = FC.getOrder(awaitingOrderId);
      if (o) renderFlow(o);
      else elFlowPanel.classList.add("hidden");
    }
  }

  renderAll();

  window.addEventListener("fc:state-changed", () => {
    renderAll();

    if (awaitingOrderId) {
      const o = FC.getOrder(awaitingOrderId);
      if (o) renderFlow(o);
    }
  });
})();