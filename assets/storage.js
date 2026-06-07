window.FC = window.FC || {};

FC.KEY = "fc_state_v3";
FC._realtimeStarted = false;
FC._realtimeChannel = null;

// ---------- Helpers ----------
FC.nowISO = () => new Date().toISOString();

FC._safeArray = function (v) {
  return Array.isArray(v) ? v : [];
};

FC._safeObject = function (v) {
  return v && typeof v === "object" ? v : {};
};

FC._clone = function (v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
};

FC._db = function () {
  return FC.supabase || window.DB || null;
};

FC._hasDb = function () {
  const db = FC._db();
  return !!(db && typeof db.from === "function");
};

FC._emitStateChanged = function () {
  window.dispatchEvent(new CustomEvent("fc:state-changed"));
};

FC._normalizeServiceType = function (value) {
  const v = String(value || "").trim().toLowerCase();

  if (v === "dine_in" || v === "dine-in" || v === "dine in") return "dine_in";
  if (v === "takeaway" || v === "take_away" || v === "take-away" || v === "take away") return "takeaway";

  return "";
};

FC._normalizeTableNumber = function (serviceType, value) {
  const table = String(value || "").trim();
  return serviceType === "dine_in" ? table : "";
};

FC._normalizePaymentMethod = function (value) {
  const v = String(value || "").trim().toLowerCase();

  if (v === "cash" || v === "cod" || v === "counter") return "cash";
  if (v === "online" || v === "stripe" || v === "card" || v === "qr") return "online";

  return "online";
};

FC._normalizeItemAddons = function (addons) {
  return FC._safeArray(addons)
    .map((addon) => {
      const a = FC._safeObject(addon);
      const name = String(a.name || a.title || "").trim();

      if (!name) return null;

      return {
        id: String(a.id || a.addonId || a.key || name).trim(),
        name,
        price: Number(a.price || 0),
        qty: Math.max(1, Number(a.qty || a.quantity || 1))
      };
    })
    .filter(Boolean);
};

FC._addonsTotal = function (addons) {
  return FC._normalizeItemAddons(addons).reduce((sum, addon) => {
    return sum + Number(addon.price || 0) * Number(addon.qty || 1);
  }, 0);
};

FC._itemNameWithAddons = function (name, addons) {
  const baseName = String(name || "Item").trim();
  const normalizedAddons = FC._normalizeItemAddons(addons);

  if (!normalizedAddons.length) return baseName;

  const addonText = normalizedAddons
    .map((addon) => {
      const qty = Number(addon.qty || 1);
      return qty > 1 ? `${addon.name} x${qty}` : addon.name;
    })
    .join(", ");

  return `${baseName} (+ ${addonText})`;
};

FC._normalizeOrderItem = function (item) {
  const it = FC._safeObject(item);
  const addons = FC._normalizeItemAddons(it.addons || it.selectedAddons || it.options || []);
  const addonTotal = FC._addonsTotal(addons);
  const qty = Math.max(1, Number(it.qty || it.quantity || 1));

  const basePrice =
    "basePrice" in it
      ? Number(it.basePrice || 0)
      : "base_price" in it
        ? Number(it.base_price || 0)
        : Math.max(0, Number(it.price || 0) - addonTotal);

  const price =
    "price" in it
      ? Number(it.price || 0)
      : basePrice + addonTotal;

  const originalName = String(it.originalName || it.baseName || it.name || "Item").trim();
  const displayName = String(it.displayName || it.display_name || FC._itemNameWithAddons(originalName, addons)).trim();

  return {
    itemId: it.itemId ?? it.menu_item_id ?? it.id ?? null,
    name: displayName,
    originalName,
    price,
    basePrice,
    addonTotal,
    addons,
    qty,
    fast: !!it.fast,
    image: String(it.image || it.imageUrl || it.image_url || "").trim(),
    description: String(it.description || "").trim()
  };
};


FC._absoluteUrl = function (path, params = {}) {
  const url = new URL(path, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

FC.getStaffPin = function () {
  const s = FC.getState();

  const candidates = [
    s.settings?.staffPin,
    s.settings?.cashierPin,
    s.settings?.adminPin,
    localStorage.getItem("fc_staff_pin"),
    localStorage.getItem("staffPin"),
    localStorage.getItem("cashierPin")
  ];

  const found = candidates.find((x) => String(x || "").trim());
  return String(found || "1234").trim();
};

FC.verifyStaffPin = function (pin) {
  return String(pin || "").trim() === FC.getStaffPin();
};

FC.orderTrackingUrl = function (orderId) {
  return FC._absoluteUrl("/order-track.html", {
    order_id: orderId
  });
};

FC.cashConfirmUrl = function (orderId, cashToken) {
  return FC._absoluteUrl("/cash-confirm.html", {
    order_id: orderId,
    cash_token: cashToken || ""
  });
};

// ---------- Default State ----------
FC.defaultState = function () {
  return {
    seededAt: null,
    restaurants: [],
    settings: {
      currency: "PKR",
      taxRate: 0.13,
      idleAdsAfterSeconds: 240,
      paymentTimeoutSeconds: 180,
      kioskPin: "1234",
      staffPin: "1234"
    },
    ads: [],
    orders: [],
    adMetrics: { impressions: {}, totalSeconds: 0 },
    devices: {
      network: { online: true, latencyMs: 42 },
      printer: { online: true, paper: 85, lastPrintAt: null },
      paymentGateway: { online: true, provider: "Stripe / Cash Counter", lastVerifyAt: null },
      kioskDisplay: { online: true, brightness: 75, locked: false },
      localCache: { enabled: true, queuedOrders: 0 }
    },
    deviceLogs: [],
    logs: []
  };
};

FC._normalizeState = function (raw) {
  const base = FC.defaultState();
  const s = FC._safeObject(raw);

  return {
    ...base,
    ...s,
    settings: {
      ...base.settings,
      ...FC._safeObject(s.settings)
    },
    adMetrics: {
      ...base.adMetrics,
      ...FC._safeObject(s.adMetrics),
      impressions: {
        ...base.adMetrics.impressions,
        ...FC._safeObject(s.adMetrics?.impressions)
      }
    },
    devices: {
      ...base.devices,
      ...FC._safeObject(s.devices),
      network: {
        ...base.devices.network,
        ...FC._safeObject(s.devices?.network)
      },
      printer: {
        ...base.devices.printer,
        ...FC._safeObject(s.devices?.printer)
      },
      paymentGateway: {
        ...base.devices.paymentGateway,
        ...FC._safeObject(s.devices?.paymentGateway)
      },
      kioskDisplay: {
        ...base.devices.kioskDisplay,
        ...FC._safeObject(s.devices?.kioskDisplay)
      },
      localCache: {
        ...base.devices.localCache,
        ...FC._safeObject(s.devices?.localCache)
      }
    },
    restaurants: FC._safeArray(s.restaurants),
    ads: FC._safeArray(s.ads),
    orders: FC._safeArray(s.orders).map(FC._normalizeOrder).filter(Boolean),
    deviceLogs: FC._safeArray(s.deviceLogs),
    logs: FC._safeArray(s.logs)
  };
};

// ---------- Local State ----------
FC.readLocalState = function () {
  const raw = localStorage.getItem(FC.KEY);
  if (!raw) return FC.defaultState();

  try {
    return FC._normalizeState(JSON.parse(raw));
  } catch {
    return FC.defaultState();
  }
};

FC.writeLocalState = function (state) {
  localStorage.setItem(FC.KEY, JSON.stringify(FC._normalizeState(state)));
};

FC.getState = function () {
  return FC.readLocalState();
};

FC.setState = function (state, options = {}) {
  const prevJson = localStorage.getItem(FC.KEY) || "";
  const nextState = FC._normalizeState(state);
  const nextJson = JSON.stringify(nextState);

  FC.writeLocalState(nextState);

  if (!options.silent && prevJson !== nextJson) {
    FC._emitStateChanged();
  }

  return nextState;
};

// ---------- Logs ----------
FC.log = function (message) {
  const s = FC.getState();
  s.logs.unshift({ at: FC.nowISO(), message });
  s.logs = s.logs.slice(0, 30);
  FC.setState(s);
};

// ---------- Seed / Reset ----------
FC.buildSeedState = async function () {
  const state = FC.defaultState();

  try {
    const [rRes, aRes] = await Promise.all([
      fetch("data/restaurants.json", { cache: "no-store" }),
      fetch("data/ads.json", { cache: "no-store" })
    ]);

    if (!rRes.ok) throw new Error(`restaurants.json HTTP ${rRes.status}`);
    if (!aRes.ok) throw new Error(`ads.json HTTP ${aRes.status}`);

    const r = await rRes.json();
    const a = await aRes.json();

    state.seededAt = FC.nowISO();
    state.restaurants = FC._safeArray(r.restaurants);
    state.settings = {
      ...state.settings,
      ...FC._safeObject(r.settings)
    };
    state.ads = FC._safeArray(a.ads);
  } catch (err) {
    console.error("FC.buildSeedState failed:", err);
    state.seededAt = FC.nowISO();
  }

  return FC._normalizeState(state);
};

FC._clearSessions = function () {
  localStorage.removeItem("fc_session");
  localStorage.removeItem("fc_restaurant_session");
  localStorage.removeItem("fc_admin_session");
};

FC.reset = async function () {
  FC._clearSessions();
  localStorage.removeItem(FC.KEY);

  const db = FC._db();
  if (db) {
    try {
      await db.from("orders").delete().not("id", "is", null);
    } catch (err) {
      console.warn("Cloud order reset skipped/failed:", err);
    }
  }

  const seeded = await FC.buildSeedState();
  FC.setState(seeded);
  FC.log("System reset.");
};

FC.seed = async function () {
  let state = FC.readLocalState();

  if (!state.seededAt || !state.restaurants.length) {
    state = await FC.buildSeedState();
    FC.setState(state, { silent: true });
  }

  try {
    const db = FC._db();

    if (db) {
      const [{ count: restCount, error: restErr }, { count: itemCount, error: itemErr }] =
        await Promise.all([
          db.from("restaurants").select("*", { count: "exact", head: true }),
          db.from("menu_items").select("*", { count: "exact", head: true })
        ]);

      if (!restErr && !itemErr && restCount > 0 && itemCount > 0) {
        await FC.refreshCatalogFromSupabase({ silent: true });
      } else {
        console.warn("Supabase catalog is empty. Using local JSON seed.");
      }
    }
  } catch (err) {
    console.warn("Supabase catalog check failed. Using local JSON seed.", err);
  }

  await FC.fetchAllOrders().catch(() => {});

  FC.startRealtimeSync();
  FC._emitStateChanged();
};

// ---------- IDs ----------
FC.uid = function (prefix = "ORD") {
  return (
    prefix +
    "-" +
    Math.random().toString(16).slice(2, 8).toUpperCase() +
    "-" +
    Date.now().toString().slice(-5)
  );
};

// ---------- Order Normalization ----------
FC._normalizeOrder = function (order) {
  if (!order) return null;

  if ("restaurant_id" in order || "order_items" in order) {
    const serviceType = FC._normalizeServiceType(order.service_type || order.serviceType || "");
    const tableNumber = FC._normalizeTableNumber(serviceType, order.table_number || order.tableNumber || "");
    const payment = FC._safeObject(order.payment);

    return {
      id: order.id,
      restaurantId: order.restaurant_id,
      status: order.status || "pending_approval",
      serviceType,
      tableNumber,
      subtotal: Number(order.subtotal || 0),
      tax: Number(order.tax || 0),
      total: Number(order.total || 0),
      currency: order.currency || "PKR",
      rejectReason: order.reject_reason || null,
      createdAt: order.created_at || null,
      approvedAt: order.approved_at || null,
      paidAt: order.paid_at || null,
      payment,
      paymentMethod: FC._normalizePaymentMethod(payment.paymentMethod || payment.method || order.payment_method || "online"),
      trackingUrl: FC.orderTrackingUrl(order.id),
      cashConfirmUrl: payment.cashToken ? FC.cashConfirmUrl(order.id, payment.cashToken) : "",
      items: FC._safeArray(order.order_items).map((it) =>
        FC._normalizeOrderItem({
          itemId: it.menu_item_id ?? null,
          name: it.name || "",
          price: Number(it.price || 0),
          qty: Number(it.qty || 0),
          fast: !!it.fast,
          addons: it.addons || it.selected_addons || [],
          image: it.image || it.image_url || "",
          description: it.description || ""
        })
      )
    };
  }

  const serviceType = FC._normalizeServiceType(order.serviceType || order.service_type || order.orderType || "");
  const tableNumber = FC._normalizeTableNumber(serviceType, order.tableNumber || order.table_number || order.tableNo || "");
  const payment = FC._safeObject(order.payment);

  return {
    id: order.id,
    restaurantId: order.restaurantId,
    status: order.status || "pending_approval",
    serviceType,
    tableNumber,
    subtotal: Number(order.subtotal || 0),
    tax: Number(order.tax || 0),
    total: Number(order.total || 0),
    currency: order.currency || "PKR",
    rejectReason: order.rejectReason || null,
    createdAt: order.createdAt || null,
    approvedAt: order.approvedAt || null,
    paidAt: order.paidAt || null,
    payment,
    paymentMethod: FC._normalizePaymentMethod(payment.paymentMethod || payment.method || order.paymentMethod || "online"),
    trackingUrl: FC.orderTrackingUrl(order.id),
    cashConfirmUrl: payment.cashToken ? FC.cashConfirmUrl(order.id, payment.cashToken) : "",
    items: FC._safeArray(order.items).map((it) => FC._normalizeOrderItem(it))
  };
};

FC._cacheOrders = function (orders, silent = true) {
  const s = FC.getState();
  s.orders = FC._safeArray(orders).map(FC._normalizeOrder).filter(Boolean);
  FC.setState(s, { silent });
};

// ---------- Orders ----------
FC.fetchAllOrders = async function () {
  const db = FC._db();

  if (db) {
    const { data, error } = await db
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

    const orders = FC._safeArray(data).map(FC._normalizeOrder).filter(Boolean);
    FC._cacheOrders(orders, true);
    return orders;
  }

  const s = FC.getState();
  return FC._safeArray(s.orders).map(FC._normalizeOrder).filter(Boolean);
};

FC.fetchOrdersForRestaurant = async function (restaurantId) {
  const db = FC._db();

  if (db) {
    const { data, error } = await db
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
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const orders = FC._safeArray(data).map(FC._normalizeOrder).filter(Boolean);
    return orders;
  }

  const s = FC.getState();
  return FC._safeArray(s.orders)
    .map(FC._normalizeOrder)
    .filter((o) => o && o.restaurantId === restaurantId);
};

FC.ordersForRestaurant = async function (restaurantId) {
  return await FC.fetchOrdersForRestaurant(restaurantId);
};

FC.getOrder = async function (orderId) {
  const db = FC._db();

  if (db) {
    const { data, error } = await db
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
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const order = FC._normalizeOrder(data);

    const s = FC.getState();
    const idx = s.orders.findIndex((x) => x.id === order.id);
    if (idx === -1) s.orders.unshift(order);
    else s.orders[idx] = order;
    FC.setState(s, { silent: true });

    return order;
  }

  const s = FC.getState();
  const found = FC._safeArray(s.orders).find((o) => o.id === orderId);
  return found ? FC._normalizeOrder(found) : null;
};

FC.createOrder = async function ({
  restaurantId,
  items,
  totals,
  serviceType,
  tableNumber,
  paymentMethod = "online"
}) {
  const normalizedServiceType = FC._normalizeServiceType(serviceType);
  const normalizedTableNumber = FC._normalizeTableNumber(normalizedServiceType, tableNumber);
  const normalizedPaymentMethod = FC._normalizePaymentMethod(paymentMethod);

  const orderId = FC.uid("ORD");
  const trackingToken = FC.uid("TRK");
  const cashToken = normalizedPaymentMethod === "cash" ? FC.uid("CASH") : null;

  const payment = {
    attemptCount: 0,
    success: false,
    method: normalizedPaymentMethod,
    paymentMethod: normalizedPaymentMethod,
    provider: normalizedPaymentMethod === "cash" ? "Cash Counter" : "Stripe",
    qrPayload: null,
    trackingToken,
    trackingUrl: FC.orderTrackingUrl(orderId),
    cashToken,
    cashConfirmUrl: cashToken ? FC.cashConfirmUrl(orderId, cashToken) : "",
    cashConfirmedAt: null,
    cashConfirmedBy: null
  };

  const order = {
    id: orderId,
    restaurantId,
    status: "pending_approval",
    serviceType: normalizedServiceType,
    tableNumber: normalizedTableNumber,
    subtotal: Number(totals?.subtotal || 0),
    tax: Number(totals?.tax || 0),
    total: Number(totals?.total || 0),
    currency: "PKR",
    rejectReason: null,
    createdAt: FC.nowISO(),
    approvedAt: null,
    paidAt: null,
    payment,
    paymentMethod: normalizedPaymentMethod,
    trackingUrl: payment.trackingUrl,
    cashConfirmUrl: payment.cashConfirmUrl,
    items: FC._safeArray(items).map((it) => FC._normalizeOrderItem(it))
  };

  const db = FC._db();

  if (db) {
    const { error: orderError } = await db.from("orders").insert({
      id: order.id,
      restaurant_id: order.restaurantId,
      status: order.status,
      service_type: order.serviceType,
      table_number: order.tableNumber,
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      currency: order.currency,
      reject_reason: order.rejectReason,
      created_at: order.createdAt,
      approved_at: order.approvedAt,
      paid_at: order.paidAt,
      payment: order.payment
    });

    if (orderError) throw orderError;

    const itemRows = order.items.map((it) => ({
      order_id: order.id,
      menu_item_id: it.itemId,
      name: it.name,
      price: it.price,
      qty: it.qty,
      fast: it.fast
    }));

    const { error: itemError } = await db.from("order_items").insert(itemRows);

    if (itemError) {
      try {
        await db.from("orders").delete().eq("id", order.id);
      } catch {}
      throw itemError;
    }

    const full = await FC.getOrder(order.id);
    await FC.fetchAllOrders().catch(() => {});
    FC._emitStateChanged();
    return full;
  }

  const s = FC.getState();
  s.orders.unshift(order);
  FC.setState(s);
  return order;
};

FC.updateOrder = async function (orderId, patch) {
  const db = FC._db();

  if (db) {
    const dbPatch = {};

    if ("status" in patch) dbPatch.status = patch.status;
    if ("rejectReason" in patch) dbPatch.reject_reason = patch.rejectReason;
    if ("approvedAt" in patch) dbPatch.approved_at = patch.approvedAt;
    if ("paidAt" in patch) dbPatch.paid_at = patch.paidAt;
    if ("payment" in patch) dbPatch.payment = patch.payment;

    if ("serviceType" in patch) {
      dbPatch.service_type = FC._normalizeServiceType(patch.serviceType);
    }

    if ("tableNumber" in patch) {
      const serviceForTable = FC._normalizeServiceType(patch.serviceType || patch.service_type || "");
      dbPatch.table_number = FC._normalizeTableNumber(serviceForTable || "dine_in", patch.tableNumber);
    }

    const { error } = await db
      .from("orders")
      .update(dbPatch)
      .eq("id", orderId);

    if (error) throw error;

    const full = await FC.getOrder(orderId);
    await FC.fetchAllOrders().catch(() => {});
    FC._emitStateChanged();
    return full;
  }

  const s = FC.getState();
  const idx = s.orders.findIndex((o) => o.id === orderId);
  if (idx === -1) return null;

  const current = FC._normalizeOrder(s.orders[idx]);
  const nextServiceType = FC._normalizeServiceType(
    patch.serviceType ?? patch.service_type ?? current.serviceType
  );
  const nextTableNumber = FC._normalizeTableNumber(
    nextServiceType,
    patch.tableNumber ?? patch.table_number ?? current.tableNumber
  );

  const next = {
    ...current,
    ...patch,
    serviceType: nextServiceType,
    tableNumber: nextTableNumber,
    payment: {
      ...FC._safeObject(current.payment),
      ...FC._safeObject(patch.payment)
    }
  };

  s.orders[idx] = next;
  FC.setState(s);
  return next;
};

FC.confirmCashPayment = async function (orderId, options = {}) {
  const order = await FC.getOrder(orderId);

  if (!order) {
    throw new Error("Order not found.");
  }

  const enteredPin = String(options.staffPin || "").trim();
  if (!FC.verifyStaffPin(enteredPin)) {
    throw new Error("Invalid staff PIN.");
  }

  const expectedToken = String(order.payment?.cashToken || "").trim();
  const providedToken = String(options.cashToken || "").trim();

  if (expectedToken && providedToken && expectedToken !== providedToken) {
    throw new Error("Invalid cash confirmation token.");
  }

  const payment = {
    ...FC._safeObject(order.payment),
    success: true,
    method: "cash",
    paymentMethod: "cash",
    provider: "Cash Counter",
    cashConfirmedAt: FC.nowISO(),
    cashConfirmedBy: String(options.staffName || "Staff").trim() || "Staff",
    verifiedAt: FC.nowISO()
  };

  const updated = await FC.updateOrder(order.id, {
    status: "paid",
    paidAt: FC.nowISO(),
    payment
  });

  FC.simulateGatewayVerify(true);
  FC.log(`Cash payment confirmed for ${order.id}.`);

  return updated;
};

// ---------- Catalog Sync (restaurants + menu_items) ----------
FC.refreshCatalogFromSupabase = async function (options = {}) {
  const db = FC._db();
  if (!db) return null;

  try {
    const [{ data: restaurants, error: restError }, { data: items, error: itemsError }] =
      await Promise.all([
        db.from("restaurants").select("*").order("name", { ascending: true }),
        db.from("menu_items").select("*").order("name", { ascending: true })
      ]);

    if (restError || itemsError) {
      throw restError || itemsError;
    }

    const grouped = {};
    FC._safeArray(restaurants).forEach((r) => {
      grouped[r.id] = {
        id: r.id,
        name: r.name,
        tagline: r.tagline || "",
        online: !!r.online,
        prepTimeMins: Number(r.prep_time_mins || 15),
        menu: []
      };
    });

    FC._safeArray(items).forEach((m) => {
      const r = grouped[m.restaurant_id];
      if (!r) return;

      r.menu.push({
        id: m.id,
        name: m.name,
        price: Number(m.price || 0),
        category: m.category || "General",
        available: !!m.available,
        fast: !!m.fast,
        image: m.image || m.image_url || "",
        description: m.description || "",
        addons: FC._normalizeItemAddons(m.addons || m.options || [])
      });
    });

    const s = FC.getState();
    s.restaurants = Object.values(grouped);
    FC.setState(s, { silent: !!options.silent });
    return s.restaurants;
  } catch (err) {
    console.warn("Catalog sync skipped/failed:", err);
    return null;
  }
};

// ---------- Restaurant Settings ----------
FC.toggleRestaurantOnline = async function (restaurantId) {
  const s = FC.getState();
  const i = s.restaurants.findIndex((r) => r.id === restaurantId);
  if (i === -1) return null;

  const nextOnline = !s.restaurants[i].online;
  const db = FC._db();

  if (db) {
    try {
      const { error } = await db
        .from("restaurants")
        .update({ online: nextOnline })
        .eq("id", restaurantId);

      if (error) throw error;
    } catch (err) {
      console.warn("Restaurant cloud update failed, local only:", err);
    }
  }

  s.restaurants[i].online = nextOnline;
  FC.setState(s);
  FC.log(`Restaurant ${s.restaurants[i].name} online=${s.restaurants[i].online}`);
  return s.restaurants[i];
};

FC.toggleMenuItem = async function (restaurantId, menuItemId) {
  const s = FC.getState();
  const r = s.restaurants.find((x) => x.id === restaurantId);
  if (!r) return null;

  const m = FC._safeArray(r.menu).find((x) => x.id === menuItemId);
  if (!m) return null;

  const nextAvailable = !m.available;
  const db = FC._db();

  if (db) {
    try {
      const { error } = await db
        .from("menu_items")
        .update({ available: nextAvailable })
        .eq("id", menuItemId);

      if (error) throw error;
    } catch (err) {
      console.warn("Menu item cloud update failed, local only:", err);
    }
  }

  m.available = nextAvailable;
  FC.setState(s);
  FC.log(`Menu item ${m.name} available=${m.available}`);
  return m;
};

// ---------- Ads ----------
FC.trackAdImpression = function (adId) {
  const s = FC.getState();
  s.adMetrics.impressions[adId] = (s.adMetrics.impressions[adId] || 0) + 1;
  FC.setState(s);
};

FC.resetAdMetrics = function () {
  const s = FC.getState();
  s.adMetrics = { impressions: {}, totalSeconds: 0 };
  FC.setState(s);
  FC.log("Ad metrics reset.");
};

// ---------- Hardware Layer (Simulated) ----------
FC.getDevices = function () {
  const s = FC.getState();
  return s.devices || {};
};

FC.deviceLog = function (message, level = "INFO") {
  const s = FC.getState();
  s.deviceLogs = s.deviceLogs || [];
  s.deviceLogs.unshift({ at: FC.nowISO(), level, message });
  s.deviceLogs = s.deviceLogs.slice(0, 50);
  FC.setState(s);
};

FC.setDevice = function (deviceKey, patch) {
  const s = FC.getState();
  s.devices = s.devices || {};
  s.devices[deviceKey] = { ...(s.devices[deviceKey] || {}), ...patch };
  FC.setState(s);
  FC.deviceLog(`${deviceKey} updated: ${JSON.stringify(patch)}`);
  return s.devices[deviceKey];
};

FC.toggleDeviceOnline = function (deviceKey) {
  const d = FC.getDevices()[deviceKey];
  if (!d) return null;
  return FC.setDevice(deviceKey, { online: !d.online });
};

FC.simulateLatency = function () {
  const ms = 20 + Math.floor(Math.random() * 180);
  FC.setDevice("network", { latencyMs: ms });
  return ms;
};

FC.simulatePrinterPaperUse = function () {
  const d = FC.getDevices().printer || { paper: 100 };
  const next = Math.max(0, (d.paper || 0) - (2 + Math.floor(Math.random() * 6)));
  FC.setDevice("printer", { paper: next, lastPrintAt: FC.nowISO() });
  if (next <= 10) FC.deviceLog("Printer paper low.", "WARN");
  if (next === 0) FC.deviceLog("Printer out of paper.", "ERROR");
};

FC.simulateGatewayVerify = function (success = true) {
  FC.setDevice("paymentGateway", { lastVerifyAt: FC.nowISO() });
  FC.deviceLog(
    success ? "Payment verified by gateway." : "Payment failed at gateway.",
    success ? "INFO" : "ERROR"
  );
};

FC.hardwareHealth = function () {
  const d = FC.getDevices();
  const issues = [];

  if (!d.network?.online) issues.push("Network offline");
  if ((d.network?.latencyMs || 0) > 150) issues.push("High network latency");
  if (!d.printer?.online) issues.push("Printer offline");
  if ((d.printer?.paper ?? 100) <= 10) issues.push("Printer paper low");
  if (!d.paymentGateway?.online) issues.push("Payment gateway offline");
  if (!d.kioskDisplay?.online) issues.push("Kiosk display offline");
  if (d.kioskDisplay?.locked) issues.push("Kiosk is locked");

  return { ok: issues.length === 0, issues };
};

// ---------- Realtime ----------
FC.startRealtimeSync = function () {
  if (FC._realtimeStarted) return;
  const db = FC._db();
  if (!db || typeof db.channel !== "function") return;

  FC._realtimeStarted = true;

  try {
    FC._realtimeChannel = db
      .channel("fc-live-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        async () => {
          try {
            await FC.fetchAllOrders();
          } catch (err) {
            console.warn("Realtime orders refresh failed:", err);
          }
          FC._emitStateChanged();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurants" },
        async () => {
          try {
            await FC.refreshCatalogFromSupabase({ silent: true });
          } catch (err) {
            console.warn("Realtime restaurants refresh failed:", err);
          }
          FC._emitStateChanged();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items" },
        async () => {
          try {
            await FC.refreshCatalogFromSupabase({ silent: true });
          } catch (err) {
            console.warn("Realtime menu refresh failed:", err);
          }
          FC._emitStateChanged();
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });
  } catch (err) {
    console.warn("Realtime sync could not start:", err);
  }
};