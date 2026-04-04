/**
 * app.js
 * Shared helpers, analytics, and professional XLSX reports
 */
window.FC = window.FC || {};

(function () {
  const FALLBACK_SETTINGS = {
    currency: "PKR",
    taxRate: 0.13
  };

  const previousFetchAllOrders =
    typeof FC.fetchAllOrders === "function" ? FC.fetchAllOrders.bind(FC) : null;

  const previousFetchOrdersForRestaurant =
    typeof FC.fetchOrdersForRestaurant === "function"
      ? FC.fetchOrdersForRestaurant.bind(FC)
      : null;

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  function nowISO() {
    try {
      if (typeof FC.nowISO === "function") return FC.nowISO();
    } catch { }
    return new Date().toISOString();
  }

  function getStateSafe() {
    let state = {};
    try {
      state = typeof FC.getState === "function" ? (FC.getState() || {}) : {};
    } catch {
      state = {};
    }

    state.settings = {
      ...FALLBACK_SETTINGS,
      ...safeObject(state.settings)
    };

    state.orders = safeArray(state.orders);
    state.restaurants = safeArray(state.restaurants);
    state.logs = safeArray(state.logs);
    state.ads = safeArray(state.ads);
    state.adMetrics = {
      impressions: {},
      totalSeconds: 0,
      ...safeObject(state.adMetrics)
    };

    return state;
  }

  function normalizeOrder(order) {
    if (!order) return null;

    const payment = safeObject(order.payment);
    const timeline = safeObject(payment.timeline);

    // Supabase shape
    if ("restaurant_id" in order || "order_items" in order) {
      return {
        id: order.id,
        restaurantId: order.restaurant_id,
        items: safeArray(order.order_items).map((it) => ({
          itemId: it.menu_item_id ?? null,
          name: it.name || "",
          price: safeNumber(it.price),
          qty: safeNumber(it.qty),
          fast: !!it.fast
        })),
        subtotal: safeNumber(order.subtotal),
        tax: safeNumber(order.tax),
        total: safeNumber(order.total),
        currency: order.currency || "PKR",
        status: order.status || "pending_approval",
        rejectReason: order.reject_reason || null,
        createdAt: order.created_at || timeline.placedAt || null,
        approvedAt: order.approved_at || timeline.approvedAt || null,
        paidAt: order.paid_at || payment.paidAt || null,
        deliveredAt:
          order.delivered_at ||
          timeline.deliveredAt ||
          payment.deliveredAt ||
          null,
        payment
      };
    }

    // Local/demo shape
    return {
      id: order.id,
      restaurantId: order.restaurantId,
      items: safeArray(order.items).map((it) => ({
        itemId: it.itemId ?? null,
        name: it.name || "",
        price: safeNumber(it.price),
        qty: safeNumber(it.qty),
        fast: !!it.fast
      })),
      subtotal: safeNumber(order.subtotal),
      tax: safeNumber(order.tax),
      total: safeNumber(order.total),
      currency: order.currency || "PKR",
      status: order.status || "pending_approval",
      rejectReason: order.rejectReason || null,
      createdAt: order.createdAt || timeline.placedAt || null,
      approvedAt: order.approvedAt || timeline.approvedAt || null,
      paidAt: order.paidAt || payment.paidAt || null,
      deliveredAt:
        order.deliveredAt ||
        timeline.deliveredAt ||
        payment.deliveredAt ||
        null,
      payment
    };
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

  function monthKey(iso) {
    const d = parseISO(iso);
    if (!d) return null;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function currentMonthLabel() {
    const d = new Date();
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
  }

  function minutesBetween(startIso, endIso) {
    const start = parseISO(startIso);
    const end = parseISO(endIso);
    if (!start || !end) return null;
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    return mins >= 0 ? mins : null;
  }

  function restaurantNameFromId(restaurants, restaurantId) {
    return (
      safeArray(restaurants).find((r) => r.id === restaurantId)?.name ||
      restaurantId ||
      "Unknown"
    );
  }

  function itemsSummary(items) {
    return safeArray(items)
      .map((it) => `${it.name || "Item"} x${safeNumber(it.qty)}`)
      .join(" | ");
  }

  function totalDishQty(items) {
    return safeArray(items).reduce((sum, it) => sum + safeNumber(it.qty), 0);
  }

  function uniqueDishCount(items) {
    return safeArray(items).length;
  }

  function bestSellerFromOrders(orders) {
    const counts = {};
    for (const o of safeArray(orders)) {
      for (const it of safeArray(o.items)) {
        const name = it.name || "Unknown";
        counts[name] = (counts[name] || 0) + safeNumber(it.qty);
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  }

  function deliveredAtFor(order) {
    return (
      order?.deliveredAt ||
      safeObject(order?.payment).deliveredAt ||
      safeObject(safeObject(order?.payment).timeline).deliveredAt ||
      null
    );
  }

  function monthOrdersOnly(orders) {
    const key = currentMonthKey();
    return safeArray(orders).filter((o) => monthKey(o.createdAt) === key);
  }

  FC.getStateSafe = getStateSafe;
  FC.normalizeOrder = normalizeOrder;

  FC.money = function (amount, currencyOverride) {
    const s = getStateSafe();
    const currency = currencyOverride || s.settings.currency || "PKR";
    const value = safeNumber(amount);

    try {
      return new Intl.NumberFormat("en-PK", {
        style: "currency",
        currency,
        maximumFractionDigits: 0
      }).format(value);
    } catch {
      return `${currency} ${Math.round(value)}`;
    }
  };

  FC.computeTotals = function (items) {
    const s = getStateSafe();
    const taxRate = safeNumber(s.settings.taxRate, 0);

    const safeItems = safeArray(items);
    const subtotal = safeItems.reduce((sum, it) => {
      return sum + safeNumber(it.price) * safeNumber(it.qty);
    }, 0);

    const tax = Math.round(subtotal * taxRate);
    const total = subtotal + tax;

    return { subtotal, tax, total };
  };

  FC.groupBy = function (arr, keyFn) {
    const out = {};
    for (const item of safeArray(arr)) {
      const key = String(keyFn(item));
      if (!out[key]) out[key] = [];
      out[key].push(item);
    }
    return out;
  };

  FC.todayKey = function () {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  };

  FC.isToday = function (iso) {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;

    const n = new Date();
    return (
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate()
    );
  };

  FC.orderIsPaidLike = function (status) {
    return ["paid", "preparing", "ready", "completed"].includes(status);
  };

  FC.analyticsFromOrders = function (orders) {
    const normalized = safeArray(orders).map(normalizeOrder).filter(Boolean);

    const ordersToday = normalized.filter((o) => FC.isToday(o.createdAt));
    const paidToday = ordersToday.filter((o) => FC.orderIsPaidLike(o.status));

    const revenue = paidToday.reduce((sum, o) => sum + safeNumber(o.total), 0);

    const byHour = {};
    for (const o of paidToday) {
      const dt = new Date(o.paidAt || o.createdAt || Date.now());
      if (Number.isNaN(dt.getTime())) continue;
      const h = dt.getHours();
      byHour[h] = (byHour[h] || 0) + 1;
    }

    let peakHour = null;
    let peakCount = -1;
    Object.keys(byHour).forEach((h) => {
      if (byHour[h] > peakCount) {
        peakCount = byHour[h];
        peakHour = Number(h);
      }
    });

    const itemCounts = {};
    for (const o of paidToday) {
      for (const it of safeArray(o.items)) {
        const name = it.name || "Unknown";
        itemCounts[name] = (itemCounts[name] || 0) + safeNumber(it.qty);
      }
    }

    const bestSeller =
      Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    let attempts = 0;
    let successes = 0;

    for (const o of ordersToday) {
      attempts += safeNumber(o.payment?.attemptCount, 0);
      if (o.payment?.success) successes += 1;
    }

    const payRate = attempts > 0 ? Math.round((successes / attempts) * 100) : 0;

    return {
      ordersTodayCount: ordersToday.length,
      paidTodayCount: paidToday.length,
      revenue,
      peakHour: peakHour === null ? "—" : `${String(peakHour).padStart(2, "0")}:00`,
      bestSeller,
      payRate
    };
  };

  FC.analytics = function () {
    const s = getStateSafe();
    return FC.analyticsFromOrders(s.orders);
  };

  FC.restaurantAnalytics = function (restaurantId) {
    const s = getStateSafe();

    const orders = s.orders
      .map(normalizeOrder)
      .filter(Boolean)
      .filter((o) => o.restaurantId === restaurantId && FC.isToday(o.createdAt));

    const paid = orders.filter((o) => FC.orderIsPaidLike(o.status));

    const paidCount = paid.length;
    const revenue = paid.reduce((sum, o) => sum + safeNumber(o.total), 0);

    const itemCounts = {};
    for (const o of paid) {
      for (const it of safeArray(o.items)) {
        const name = it.name || "Unknown";
        itemCounts[name] = (itemCounts[name] || 0) + safeNumber(it.qty);
      }
    }

    const bestSeller =
      Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    return { paidCount, revenue, bestSeller };
  };

  FC.fetchAllOrders = async function () {
    if (previousFetchAllOrders) {
      const rows = await previousFetchAllOrders();
      return safeArray(rows).map(normalizeOrder).filter(Boolean);
    }

    if (FC.supabase && typeof FC.supabase.from === "function") {
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
      return safeArray(data).map(normalizeOrder).filter(Boolean);
    }

    return getStateSafe().orders.map(normalizeOrder).filter(Boolean);
  };

  FC.fetchOrdersForRestaurant = async function (restaurantId) {
    if (previousFetchOrdersForRestaurant) {
      const rows = await previousFetchOrdersForRestaurant(restaurantId);
      return safeArray(rows).map(normalizeOrder).filter(Boolean);
    }

    const all = await FC.fetchAllOrders();
    return all.filter((o) => o.restaurantId === restaurantId);
  };

  FC.downloadXLSX = function (filename, sheets) {
    if (typeof XLSX === "undefined") {
      console.error("XLSX library is not loaded.");
      return false;
    }

    const wb = XLSX.utils.book_new();

    for (const sh of safeArray(sheets)) {
      const name = String(sh.name || "Sheet1").slice(0, 31);
      const rows = safeArray(sh.rows);
      const ws =
        rows.length && Array.isArray(rows[0])
          ? XLSX.utils.aoa_to_sheet(rows)
          : XLSX.utils.json_to_sheet(rows);

      if (Array.isArray(sh.cols)) ws["!cols"] = sh.cols;
      if (Array.isArray(sh.merges)) ws["!merges"] = sh.merges;
      if (sh.filterRef) ws["!autofilter"] = { ref: sh.filterRef };

      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    XLSX.writeFile(wb, filename || "export.xlsx");
    return true;
  };

  FC.exportRestaurantSalesReport = async function (restaurantId) {
    if (typeof XLSX === "undefined") {
      console.error("XLSX library is not loaded.");
      return false;
    }

    const state = getStateSafe();
    const restaurants = state.restaurants;
    const allOrders = safeArray(await FC.fetchOrdersForRestaurant(restaurantId))
      .map(normalizeOrder)
      .filter(Boolean);

    const monthOrders = monthOrdersOnly(allOrders);
    const paidLikeOrders = monthOrders.filter((o) => FC.orderIsPaidLike(o.status));

    const restaurantName = restaurantNameFromId(restaurants, restaurantId);
    const monthRevenue = paidLikeOrders.reduce((sum, o) => sum + safeNumber(o.total), 0);

    const prepSamples = paidLikeOrders
      .map((o) => minutesBetween(o.approvedAt, deliveredAtFor(o)))
      .filter((v) => Number.isFinite(v));

    const avgPrepTime = prepSamples.length
      ? Math.round(prepSamples.reduce((a, b) => a + b, 0) / prepSamples.length)
      : "—";

    const bestSeller = bestSellerFromOrders(paidLikeOrders);

    const summaryRows = [
      [`${restaurantName} Monthly Sales Report`],
      [`Month: ${currentMonthLabel()} • Generated: ${formatDateOnly(nowISO())}`],
      [],
      ["Summary"],
      ["Restaurant Name", restaurantName],
      ["Total Revenue Up Till Now Of The Month", monthRevenue],
      ["Total Orders This Month", monthOrders.length],
      ["Paid / Active Orders", paidLikeOrders.length],
      ["Average Preparation Time (minutes)", avgPrepTime],
      ["Best Seller", bestSeller],
      [],
      ["Orders Overview"],
      [
        "Order ID",
        "Restaurant",
        "Order Date",
        "Order Placed",
        "Approved At",
        "Delivered At",
        "Prep Time (min)",
        "Status",
        "Subtotal",
        "Tax",
        "Total",
        "Items Summary",
        "Total Dish Qty",
        "Unique Dishes"
      ]
    ];

    for (const order of monthOrders) {
      const deliveredAt = deliveredAtFor(order);
      summaryRows.push([
        order.id,
        restaurantName,
        formatDateOnly(order.createdAt),
        formatTimeOnly(order.createdAt),
        formatTimeOnly(order.approvedAt),
        formatTimeOnly(deliveredAt),
        minutesBetween(order.approvedAt, deliveredAt) ?? "—",
        order.status || "—",
        safeNumber(order.subtotal),
        safeNumber(order.tax),
        safeNumber(order.total),
        itemsSummary(order.items),
        totalDishQty(order.items),
        uniqueDishCount(order.items)
      ]);
    }

    const lineRows = [
      [
        "Order ID",
        "Restaurant",
        "Order Date",
        "Placed At",
        "Approved At",
        "Delivered At",
        "Prep Time (min)",
        "Status",
        "Dish",
        "Qty",
        "Unit Price",
        "Line Total"
      ]
    ];

    for (const order of monthOrders) {
      const deliveredAt = deliveredAtFor(order);
      for (const item of safeArray(order.items)) {
        lineRows.push([
          order.id,
          restaurantName,
          formatDateOnly(order.createdAt),
          formatTimeOnly(order.createdAt),
          formatTimeOnly(order.approvedAt),
          formatTimeOnly(deliveredAt),
          minutesBetween(order.approvedAt, deliveredAt) ?? "—",
          order.status || "—",
          item.name || "Item",
          safeNumber(item.qty),
          safeNumber(item.price),
          safeNumber(item.qty) * safeNumber(item.price)
        ]);
      }
    }

    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary["!cols"] = [
      { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 42 },
      { wch: 14 }, { wch: 14 }
    ];
    wsSummary["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } },
      { s: { r: 11, c: 0 }, e: { r: 11, c: 13 } }
    ];
    const summaryLastRow = Math.max(13, summaryRows.length);
    wsSummary["!autofilter"] = { ref: `A13:N${summaryLastRow}` };

    const wsLines = XLSX.utils.aoa_to_sheet(lineRows);
    wsLines["!cols"] = [
      { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
    ];
    const lineLastRow = Math.max(1, lineRows.length);
    wsLines["!autofilter"] = { ref: `A1:L${lineLastRow}` };

    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
    XLSX.utils.book_append_sheet(wb, wsLines, "Order Lines");

    const safeName = String(restaurantName).replace(/[^a-z0-9]+/gi, "_");
    XLSX.writeFile(wb, `${safeName}_Monthly_Sales_Report.xlsx`);
    return true;
  };

  FC.exportAdminMonthlyReport = async function (input = {}) {
    if (typeof XLSX === "undefined") {
      console.error("XLSX library is not loaded.");
      return false;
    }

    const state = getStateSafe();
    const restaurants = safeArray(input.restaurants || state.restaurants);
    const sourceOrders =
      safeArray(input.orders).length > 0
        ? safeArray(input.orders)
        : await FC.fetchAllOrders();

    const allOrders = safeArray(sourceOrders).map(normalizeOrder).filter(Boolean);
    const monthOrders = monthOrdersOnly(allOrders);
    const paidLikeOrders = monthOrders.filter((o) => FC.orderIsPaidLike(o.status));

    const monthRevenue = paidLikeOrders.reduce((sum, o) => sum + safeNumber(o.total), 0);

    const prepSamples = paidLikeOrders
      .map((o) => minutesBetween(o.approvedAt, deliveredAtFor(o)))
      .filter((v) => Number.isFinite(v));

    const avgPrepTime = prepSamples.length
      ? Math.round(prepSamples.reduce((a, b) => a + b, 0) / prepSamples.length)
      : "—";

    const bestSeller = bestSellerFromOrders(paidLikeOrders);

    const overviewRows = [
      ["Food Court Kiosk Monthly Master Report"],
      [`Month: ${currentMonthLabel()} • Generated: ${formatDateOnly(nowISO())}`],
      [],
      ["Summary"],
      ["Total Revenue Up Till Now Of The Month", monthRevenue],
      ["Total Orders This Month", monthOrders.length],
      ["Paid / Active Orders", paidLikeOrders.length],
      ["Average Preparation Time (minutes)", avgPrepTime],
      ["Best Seller", bestSeller]
    ];

    const restaurantTotalsRows = [
      [
        "Restaurant Name",
        "Orders This Month",
        "Paid / Active Orders",
        "Revenue",
        "Average Prep Time (min)",
        "Best Seller"
      ]
    ];

    for (const r of restaurants) {
      const restOrders = monthOrders.filter((o) => o.restaurantId === r.id);
      const restPaid = restOrders.filter((o) => FC.orderIsPaidLike(o.status));

      const restRevenue = restPaid.reduce((sum, o) => sum + safeNumber(o.total), 0);

      const restPrepSamples = restPaid
        .map((o) => minutesBetween(o.approvedAt, deliveredAtFor(o)))
        .filter((v) => Number.isFinite(v));

      const restAvgPrep = restPrepSamples.length
        ? Math.round(restPrepSamples.reduce((a, b) => a + b, 0) / restPrepSamples.length)
        : "—";

      restaurantTotalsRows.push([
        r.name || r.id,
        restOrders.length,
        restPaid.length,
        restRevenue,
        restAvgPrep,
        bestSellerFromOrders(restPaid)
      ]);
    }

    const ordersRows = [
      [
        "Order ID",
        "Restaurant",
        "Order Date",
        "Order Placed",
        "Approved At",
        "Delivered At",
        "Prep Time (min)",
        "Status",
        "Subtotal",
        "Tax",
        "Total",
        "Items Summary",
        "Total Dish Qty",
        "Unique Dishes"
      ]
    ];

    for (const order of monthOrders) {
      const deliveredAt = deliveredAtFor(order);
      ordersRows.push([
        order.id,
        restaurantNameFromId(restaurants, order.restaurantId),
        formatDateOnly(order.createdAt),
        formatTimeOnly(order.createdAt),
        formatTimeOnly(order.approvedAt),
        formatTimeOnly(deliveredAt),
        minutesBetween(order.approvedAt, deliveredAt) ?? "—",
        order.status || "—",
        safeNumber(order.subtotal),
        safeNumber(order.tax),
        safeNumber(order.total),
        itemsSummary(order.items),
        totalDishQty(order.items),
        uniqueDishCount(order.items)
      ]);
    }

    const orderLinesRows = [
      [
        "Order ID",
        "Restaurant",
        "Order Date",
        "Placed At",
        "Approved At",
        "Delivered At",
        "Prep Time (min)",
        "Status",
        "Dish",
        "Qty",
        "Unit Price",
        "Line Total"
      ]
    ];

    for (const order of monthOrders) {
      const deliveredAt = deliveredAtFor(order);
      for (const item of safeArray(order.items)) {
        orderLinesRows.push([
          order.id,
          restaurantNameFromId(restaurants, order.restaurantId),
          formatDateOnly(order.createdAt),
          formatTimeOnly(order.createdAt),
          formatTimeOnly(order.approvedAt),
          formatTimeOnly(deliveredAt),
          minutesBetween(order.approvedAt, deliveredAt) ?? "—",
          order.status || "—",
          item.name || "Item",
          safeNumber(item.qty),
          safeNumber(item.price),
          safeNumber(item.qty) * safeNumber(item.price)
        ]);
      }
    }

    const wb = XLSX.utils.book_new();

    const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
    wsOverview["!cols"] = [{ wch: 36 }, { wch: 26 }];
    wsOverview["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } }
    ];

    const wsRest = XLSX.utils.aoa_to_sheet(restaurantTotalsRows);
    wsRest["!cols"] = [
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 22 },
      { wch: 24 }
    ];
    const restLastRow = Math.max(1, restaurantTotalsRows.length);
    wsRest["!autofilter"] = { ref: `A1:F${restLastRow}` };

    const wsOrders = XLSX.utils.aoa_to_sheet(ordersRows);
    wsOrders["!cols"] = [
      { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 42 },
      { wch: 14 }, { wch: 14 }
    ];
    const ordersLastRow = Math.max(1, ordersRows.length);
    wsOrders["!autofilter"] = { ref: `A1:N${ordersLastRow}` };

    const wsLines = XLSX.utils.aoa_to_sheet(orderLinesRows);
    wsLines["!cols"] = [
      { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
    ];
    const linesLastRow = Math.max(1, orderLinesRows.length);
    wsLines["!autofilter"] = { ref: `A1:L${linesLastRow}` };

    XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");
    XLSX.utils.book_append_sheet(wb, wsRest, "Restaurant Totals");
    XLSX.utils.book_append_sheet(wb, wsOrders, "Orders");
    XLSX.utils.book_append_sheet(wb, wsLines, "Order Lines");

    XLSX.writeFile(wb, "FoodCourt_Monthly_Master_Report.xlsx");
    return true;
  };
  FC.printReceiptSilently = async function (order) {
    const payload = safeObject(order);
    if (!payload.id) {
      throw new Error("Missing order id");
    }

    const res = await fetch("http://127.0.0.1:5001/api/print-receipt", {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      targetAddressSpace: "local",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ order: payload })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    return data;
  };
})();
