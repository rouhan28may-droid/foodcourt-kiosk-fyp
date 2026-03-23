/**
 * app.js
 * Shared helpers: formatting, totals, analytics, exports
 */
window.FC = window.FC || {};

(function () {
  const FALLBACK_SETTINGS = {
    currency: "PKR",
    taxRate: 0.13
  };

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
        createdAt: order.created_at || null,
        approvedAt: order.approved_at || null,
        paidAt: order.paid_at || null,
        payment: safeObject(order.payment)
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
      createdAt: order.createdAt || null,
      approvedAt: order.approvedAt || null,
      paidAt: order.paidAt || null,
      payment: safeObject(order.payment)
    };
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
      const rows = safeArray(sh.rows);
      const name = String(sh.name || "Sheet1").slice(0, 31);
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    XLSX.writeFile(wb, filename || "export.xlsx");
    return true;
  };
})();