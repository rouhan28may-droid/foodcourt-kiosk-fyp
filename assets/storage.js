window.FC = window.FC || {};

FC.KEY = "fc_state_v3";
FC._realtimeStarted = false;
FC._realtimeChannel = null;

// Shared hardware state is stored in Supabase so Admin and Kiosk
// work across different laptops, browsers and Raspberry Pi devices.
FC.HARDWARE_DEVICE_TABLE = "hardware_devices";
FC._hardwareRefreshTimer = null;
FC._hardwareCloudReady = false;
FC._hardwareCloudWarned = false;

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
  const addons = FC._normalizeItemAddons(it.addons || it.selectedAddons || it.selected_addons || it.options || []);
  const addonTotalFromAddons = FC._addonsTotal(addons);
  const addonTotal = addonTotalFromAddons || Number(it.addonTotal || it.addon_total || 0);
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
      approvalWindowSeconds: 20,
      tableReservationMinutes: 20,
      kioskPin: "1234",
      staffPin: "1234"
    },
    ads: [],
    orders: [],
    adMetrics: { impressions: {}, totalSeconds: 0 },
    devices: {
      network: {
        online: true,
        latencyMs: 42,
        manuallyControlled: false,
        lastHeartbeatAt: null,
        lastSeenAt: null,
        lastManualCheckAt: null,
        lastNetworkCheckAt: null,
        lastError: ""
      },
      printer: {
        online: true,
        manuallyControlled: false,
        paper: 100,
        paperPercent: 100,
        paperRollMeters: 80,
        paperUsedMeters: 0,
        paperRemainingMeters: 80,
        receiptAverageMeters: 0.35,
        lowPaperThreshold: 15,
        lowPaper: false,
        lastPrintAt: null,
        lastPaperUpdateAt: null
      },
      paymentGateway: {
        online: true,
        manuallyControlled: false,
        provider: "Stripe / Cash Counter",
        lastVerifyAt: null,
        lastResult: "ready",
        unavailableMessage: "Online payment is temporarily unavailable. Please choose cash payment or contact staff."
      },
      kioskDisplay: {
        enabled: true,
        online: true,
        manuallyControlled: false,
        brightness: 75,
        locked: false,
        maintenanceMode: false,
        outOfOrder: false,
        lastHeartbeatAt: null,
        lastSeenAt: null,
        unavailableMessage: "Maintenance Break / Out of Order"
      },
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

  // Load the shared Admin/Kiosk hardware controls from Supabase.
  // Local state remains available as an offline fallback.
  if (typeof FC.refreshHardwareDevicesFromSupabase === "function") {
    await FC.refreshHardwareDevicesFromSupabase({
      seedMissing: true,
      silent: true
    }).catch(() => {});
  }

  FC.startRealtimeSync();

  if (typeof FC.startHardwareCloudSync === "function") {
    FC.startHardwareCloudSync();
  }

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

// ---------- Approval Helpers ----------
FC.approvalWindowSeconds = function () {
  const s = FC.getState();
  const n = Number(s.settings?.approvalWindowSeconds || 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
};

FC.approvalWindowMs = function () {
  return FC.approvalWindowSeconds() * 1000;
};

FC.orderApprovalStartTime = function (order = {}) {
  const payment = FC._safeObject(order.payment);
  const raw =
    order.approvalRequestedAt ||
    order.approval_requested_at ||
    payment.approvalRequestedAt ||
    order.createdAt ||
    order.created_at ||
    "";

  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
};

FC.orderApprovalSecondsLeft = function (order = {}) {
  const elapsed = Date.now() - FC.orderApprovalStartTime(order);
  const left = Math.max(0, FC.approvalWindowMs() - elapsed);
  return Math.ceil(left / 1000);
};

FC.shouldAutoApproveOrder = function (order = {}) {
  return (
    String(order.status || "").toLowerCase() === "pending_approval" &&
    FC.orderApprovalSecondsLeft(order) <= 0
  );
};


// ---------- Dine-In Table Reservation (20 minutes) ----------
FC.TABLE_RESERVATION_MINUTES = 20;

FC.tableReservationMinutes = function () {
  const s = FC.getState();
  const n = Number(s.settings?.tableReservationMinutes || FC.TABLE_RESERVATION_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : FC.TABLE_RESERVATION_MINUTES;
};

FC.tableReservationMs = function () {
  return FC.tableReservationMinutes() * 60 * 1000;
};

FC._dateMs = function (value) {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

FC._tableReservationStatusReleasesTable = function (status) {
  return ["rejected", "cancelled", "timed_out"].includes(String(status || "").toLowerCase());
};

FC.tableReservationInfoFromOrder = function (order = {}, nowMs = Date.now()) {
  const serviceType = FC._normalizeServiceType(
    order.serviceType ||
    order.service_type ||
    order.orderType ||
    order.order_type ||
    ""
  );

  const tableNumber = FC._normalizeTableNumber(
    serviceType,
    order.tableNumber ||
    order.table_number ||
    order.tableNo ||
    order.table_no ||
    ""
  ).toUpperCase();

  if (serviceType !== "dine_in" || !tableNumber) return null;
  if (FC._tableReservationStatusReleasesTable(order.status)) return null;

  const payment = FC._safeObject(order.payment);
  const reservedAtRaw =
    order.tableReservedAt ||
    order.table_reserved_at ||
    payment.tableReservedAt ||
    payment.table_reserved_at ||
    order.createdAt ||
    order.created_at ||
    "";

  const reservedAtMs = FC._dateMs(reservedAtRaw);
  if (!Number.isFinite(reservedAtMs)) return null;

  const minutes = Number(
    order.tableReservationMinutes ||
    order.table_reservation_minutes ||
    payment.tableReservationMinutes ||
    payment.table_reservation_minutes ||
    FC.tableReservationMinutes()
  );

  const safeMinutes = Number.isFinite(minutes) && minutes > 0
    ? minutes
    : FC.tableReservationMinutes();

  const explicitExpiresRaw =
    order.tableReservationExpiresAt ||
    order.table_reservation_expires_at ||
    payment.tableReservationExpiresAt ||
    payment.table_reservation_expires_at ||
    "";

  const explicitExpiresMs = FC._dateMs(explicitExpiresRaw);
  const expiresAtMs = Number.isFinite(explicitExpiresMs)
    ? explicitExpiresMs
    : reservedAtMs + safeMinutes * 60 * 1000;

  if (expiresAtMs <= Number(nowMs || Date.now())) return null;

  return {
    tableNumber,
    orderId: String(order.id || ""),
    restaurantId: String(order.restaurantId || order.restaurant_id || ""),
    status: String(order.status || ""),
    reservedAt: new Date(reservedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    reservedAtMs,
    expiresAtMs,
    minutes: safeMinutes,
    minutesLeft: Math.max(1, Math.ceil((expiresAtMs - Number(nowMs || Date.now())) / 60000))
  };
};

FC.getActiveTableReservations = function (orders, nowMs = Date.now()) {
  const sourceOrders = Array.isArray(orders)
    ? orders
    : FC._safeArray(FC.getState().orders);

  const reservations = {};

  sourceOrders.forEach((order) => {
    const info = FC.tableReservationInfoFromOrder(order, nowMs);
    if (!info) return;

    const current = reservations[info.tableNumber];

    // Keep the newest active reservation if duplicate data appears.
    if (!current || info.reservedAtMs > current.reservedAtMs) {
      reservations[info.tableNumber] = info;
    }
  });

  return reservations;
};

FC.getTableReservation = function (tableNumber, orders, nowMs = Date.now()) {
  const table = String(tableNumber || "").trim().toUpperCase();
  if (!table) return null;
  return FC.getActiveTableReservations(orders, nowMs)[table] || null;
};

FC.isTableReserved = function (tableNumber, orders, excludeOrderId = "") {
  const reservation = FC.getTableReservation(tableNumber, orders);
  if (!reservation) return false;

  if (excludeOrderId && String(reservation.orderId) === String(excludeOrderId)) {
    return false;
  }

  return true;
};

FC.assertTableAvailable = function (tableNumber, orders, excludeOrderId = "") {
  const table = String(tableNumber || "").trim().toUpperCase();

  if (!table) {
    throw new Error("Please select a table number for Dine In.");
  }

  const reservation = FC.getTableReservation(table, orders);

  if (
    reservation &&
    (!excludeOrderId || String(reservation.orderId) !== String(excludeOrderId))
  ) {
    throw new Error(
      `Table ${table} is reserved for approximately ${reservation.minutesLeft} more minute${reservation.minutesLeft === 1 ? "" : "s"}. Please select another table.`
    );
  }

  return true;
};

FC.fetchActiveTableReservations = async function () {
  let orders;

  try {
    orders = await FC.fetchAllOrders();
  } catch {
    orders = FC._safeArray(FC.getState().orders);
  }

  return FC.getActiveTableReservations(orders);
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
      rejectReason: order.reject_reason || payment.rejectReason || payment.rejectionReason || null,
      createdAt: order.created_at || null,
      approvalRequestedAt: order.approval_requested_at || order.approvalRequestedAt || payment.approvalRequestedAt || order.created_at || null,
      approvalRespondedAt: order.approval_responded_at || order.approvalRespondedAt || payment.approvalRespondedAt || null,
      approvalMode: order.approval_mode || order.approvalMode || payment.approvalMode || "",
      rejectedAt: order.rejected_at || order.rejectedAt || payment.rejectedAt || null,
      rejectedByRestaurantId: order.rejected_by_restaurant_id || order.rejectedByRestaurantId || payment.rejectedByRestaurantId || null,
      approvedAt: order.approved_at || payment.approvedAt || null,
      paidAt: order.paid_at || null,
      tableReservedAt: order.table_reserved_at || order.tableReservedAt || payment.tableReservedAt || payment.table_reserved_at || null,
      tableReservationExpiresAt: order.table_reservation_expires_at || order.tableReservationExpiresAt || payment.tableReservationExpiresAt || payment.table_reservation_expires_at || null,
      tableReservationMinutes: Number(order.table_reservation_minutes || order.tableReservationMinutes || payment.tableReservationMinutes || payment.table_reservation_minutes || 20),
      payment,
      paymentMethod: FC._normalizePaymentMethod(payment.paymentMethod || payment.method || order.payment_method || "online"),
      trackingUrl: FC.orderTrackingUrl(order.id),
      cashConfirmUrl: payment.cashToken ? FC.cashConfirmUrl(order.id, payment.cashToken) : "",
      items: FC._safeArray(order.order_items).map((it) =>
        FC._normalizeOrderItem({
          itemId: it.menu_item_id ?? null,
          name: it.name || "",
          originalName: it.original_name || it.originalName || it.base_name || "",
          price: Number(it.price || 0),
          basePrice: Number(it.base_price || it.basePrice || it.price || 0),
          addonTotal: Number(it.addon_total || it.addonTotal || 0),
          qty: Number(it.qty || 0),
          fast: !!it.fast,
          addons: it.addons || it.selected_addons || it.options || [],
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
    rejectReason: order.rejectReason || payment.rejectReason || payment.rejectionReason || null,
    createdAt: order.createdAt || null,
    approvalRequestedAt: order.approvalRequestedAt || payment.approvalRequestedAt || order.createdAt || null,
    approvalRespondedAt: order.approvalRespondedAt || payment.approvalRespondedAt || null,
    approvalMode: order.approvalMode || payment.approvalMode || "",
    rejectedAt: order.rejectedAt || payment.rejectedAt || null,
    rejectedByRestaurantId: order.rejectedByRestaurantId || payment.rejectedByRestaurantId || null,
    approvedAt: order.approvedAt || payment.approvedAt || null,
    paidAt: order.paidAt || null,
    tableReservedAt: order.tableReservedAt || order.table_reserved_at || payment.tableReservedAt || payment.table_reserved_at || null,
    tableReservationExpiresAt: order.tableReservationExpiresAt || order.table_reservation_expires_at || payment.tableReservationExpiresAt || payment.table_reservation_expires_at || null,
    tableReservationMinutes: Number(order.tableReservationMinutes || order.table_reservation_minutes || payment.tableReservationMinutes || payment.table_reservation_minutes || 20),
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
        order_items (*)
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
        order_items (*)
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
        order_items (*)
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

  let latestOrders = FC._safeArray(FC.getState().orders);

  if (normalizedServiceType === "dine_in") {
    if (!normalizedTableNumber) {
      throw new Error("Please select a table number for Dine In.");
    }

    try {
      latestOrders = await FC.fetchAllOrders();
    } catch (err) {
      console.warn("Table reservation check is using cached orders:", err);
    }

    FC.assertTableAvailable(normalizedTableNumber, latestOrders);
  }

  const orderId = FC.uid("ORD");
  const trackingToken = FC.uid("TRK");
  const cashToken = normalizedPaymentMethod === "cash" ? FC.uid("CASH") : null;
  const createdAt = FC.nowISO();
  const tableReservedAt = normalizedServiceType === "dine_in" ? createdAt : null;
  const tableReservationMinutes = FC.tableReservationMinutes();
  const tableReservationExpiresAt = tableReservedAt
    ? new Date(new Date(tableReservedAt).getTime() + tableReservationMinutes * 60 * 1000).toISOString()
    : null;

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
    cashConfirmedBy: null,
    approvalRequestedAt: createdAt,
    approvalRespondedAt: null,
    approvalMode: "pending_restaurant",
    approvalWindowSeconds: FC.approvalWindowSeconds(),
    tableReservedAt,
    tableReservationExpiresAt,
    tableReservationMinutes
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
    createdAt,
    approvalRequestedAt: createdAt,
    approvalRespondedAt: null,
    approvalMode: "pending_restaurant",
    rejectedAt: null,
    rejectedByRestaurantId: null,
    approvedAt: null,
    paidAt: null,
    tableReservedAt,
    tableReservationExpiresAt,
    tableReservationMinutes,
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
      original_name: it.originalName || it.name,
      price: it.price,
      base_price: it.basePrice,
      addon_total: it.addonTotal,
      qty: it.qty,
      fast: it.fast,
      addons: FC._normalizeItemAddons(it.addons),
      image: it.image || "",
      description: it.description || ""
    }));

    const fallbackItemRows = order.items.map((it) => ({
      order_id: order.id,
      menu_item_id: it.itemId,
      name: it.name,
      price: it.price,
      qty: it.qty,
      fast: it.fast
    }));

    let { error: itemError } = await db.from("order_items").insert(itemRows);

    if (itemError) {
      const msg = String(itemError.message || "").toLowerCase();
      const canRetryWithoutAddonColumns =
        msg.includes("column") ||
        msg.includes("schema") ||
        msg.includes("base_price") ||
        msg.includes("addon_total") ||
        msg.includes("addons") ||
        msg.includes("original_name");

      if (canRetryWithoutAddonColumns) {
        console.warn("order_items add-on columns missing. Retrying base insert only:", itemError.message);
        const retry = await db.from("order_items").insert(fallbackItemRows);
        itemError = retry.error;
      }
    }

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
    const approvalMeta = {};
    const approvalMetaKeys = [
      "approvalRequestedAt",
      "approvalRespondedAt",
      "approvalMode",
      "rejectedAt",
      "rejectedByRestaurantId"
    ];

    approvalMetaKeys.forEach((key) => {
      if (key in patch) approvalMeta[key] = patch[key];
    });

    if ("rejectReason" in patch) approvalMeta.rejectReason = patch.rejectReason;
    if ("approvedAt" in patch) approvalMeta.approvedAt = patch.approvedAt;

    if ("payment" in patch || Object.keys(approvalMeta).length) {
      let previousPayment = {};

      try {
        const { data: existingPaymentRow, error: paymentFetchError } = await db
          .from("orders")
          .select("payment")
          .eq("id", orderId)
          .maybeSingle();

        if (!paymentFetchError) {
          previousPayment = FC._safeObject(existingPaymentRow?.payment);
        }
      } catch (err) {
        console.warn("Previous payment metadata fetch skipped:", err);
      }

      dbPatch.payment = {
        ...previousPayment,
        ...FC._safeObject(patch.payment),
        ...approvalMeta
      };
    }

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


FC.approveOrder = async function (orderId, mode = "restaurant_manual") {
  const respondedAt = FC.nowISO();

  return await FC.updateOrder(orderId, {
    status: "approved",
    approvedAt: respondedAt,
    approvalRespondedAt: respondedAt,
    approvalMode: mode,
    rejectReason: ""
  });
};

FC.rejectOrder = async function (orderId, reason, restaurantId = "") {
  const cleanReason = String(reason || "").trim();

  if (cleanReason.length < 5) {
    throw new Error("A valid rejection reason is required.");
  }

  const respondedAt = FC.nowISO();

  return await FC.updateOrder(orderId, {
    status: "rejected",
    rejectReason: cleanReason,
    rejectedAt: respondedAt,
    approvalRespondedAt: respondedAt,
    approvalMode: "restaurant_rejected",
    rejectedByRestaurantId: restaurantId || ""
  });
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

  const totalDue = Number(order.total || 0);
  const amountReceivedRaw = Number(options.amountReceived ?? options.cashReceived ?? totalDue);
  const amountReceived = Number.isFinite(amountReceivedRaw) ? amountReceivedRaw : totalDue;

  if (amountReceived < totalDue) {
    throw new Error("Amount received is less than order total.");
  }

  const changeGivenRaw = Number(options.changeGiven ?? options.cashChange ?? (amountReceived - totalDue));
  const changeGiven = Math.max(0, Number.isFinite(changeGivenRaw) ? changeGivenRaw : amountReceived - totalDue);
  const staffName = String(options.staffName || "Staff").trim() || "Staff";
  const confirmedAt = FC.nowISO();

  const payment = {
    ...FC._safeObject(order.payment),
    success: true,
    method: "cash",
    paymentMethod: "cash",
    provider: "Cash Counter",
    cashAmountDue: totalDue,
    cashReceived: amountReceived,
    cashChange: changeGiven,
    amountReceived,
    changeGiven,
    cashConfirmedAt: confirmedAt,
    cashConfirmedBy: staffName,
    paymentReceivedAt: confirmedAt,
    paymentReceivedBy: staffName,
    verifiedAt: confirmedAt
  };

  const updated = await FC.updateOrder(order.id, {
    status: "paid",
    paidAt: confirmedAt,
    payment
  });

  FC.simulateGatewayVerify(true);
  FC.log(`Cash payment confirmed for ${order.id}. Received ${amountReceived}, change ${changeGiven}.`);

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

// ---------- Hardware Console / Device Control Layer ----------
FC.HARDWARE_LOW_PAPER_PERCENT = 15;
FC.HARDWARE_PAPER_ROLL_METERS = 80;
FC.HARDWARE_RECEIPT_AVERAGE_METERS = 0.35;
FC.HARDWARE_HEARTBEAT_STALE_MS = 30000;

FC._clampPercent = function (value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
};

FC._roundMeters = function (value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
};

FC._normalizePrinterDevice = function (printer = {}) {
  const p = FC._safeObject(printer);
  const rollMeters = Number(p.paperRollMeters || FC.HARDWARE_PAPER_ROLL_METERS);
  const safeRollMeters = Number.isFinite(rollMeters) && rollMeters > 0 ? rollMeters : FC.HARDWARE_PAPER_ROLL_METERS;

  let paperPercent = FC._clampPercent(
    p.paperPercent ??
    p.paper ??
    100
  );

  let usedMeters = Number(p.paperUsedMeters || 0);
  if (!Number.isFinite(usedMeters) || usedMeters < 0) usedMeters = 0;

  // If a percentage was manually set, keep meters consistent with the 80m roll.
  const remainingMetersFromPercent = safeRollMeters * (paperPercent / 100);
  const remainingMeters = FC._roundMeters(
    p.paperRemainingMeters ??
    remainingMetersFromPercent
  );

  if ("paperPercent" in p || "paper" in p) {
    usedMeters = FC._roundMeters(safeRollMeters - remainingMetersFromPercent);
  } else if ("paperUsedMeters" in p) {
    paperPercent = FC._clampPercent(((safeRollMeters - usedMeters) / safeRollMeters) * 100);
  }

  return {
    online: p.online !== false,
    manuallyControlled: !!p.manuallyControlled,
    paper: paperPercent,
    paperPercent,
    paperRollMeters: safeRollMeters,
    paperUsedMeters: FC._roundMeters(usedMeters),
    paperRemainingMeters: FC._roundMeters(safeRollMeters - usedMeters),
    receiptAverageMeters: Number(p.receiptAverageMeters || FC.HARDWARE_RECEIPT_AVERAGE_METERS),
    lowPaperThreshold: Number(p.lowPaperThreshold || FC.HARDWARE_LOW_PAPER_PERCENT),
    lowPaper: paperPercent <= Number(p.lowPaperThreshold || FC.HARDWARE_LOW_PAPER_PERCENT),
    lastPrintAt: p.lastPrintAt || null,
    lastPaperUpdateAt: p.lastPaperUpdateAt || null,
    updatedAt: p.updatedAt || null,
    lastError: String(p.lastError || "")
  };
};


FC._normalizeKioskDisplayDevice = function (device = {}) {
  const k = FC._safeObject(device);

  /*
    Migration rule:
    Older code used kioskDisplay.online as both heartbeat and manual ON/OFF.
    If the old state was manually turned OFF, migrate that state to enabled=false.
  */
  const hasExplicitEnabled = Object.prototype.hasOwnProperty.call(k, "enabled");
  const migratedEnabled = hasExplicitEnabled
    ? k.enabled !== false
    : !(
        (k.manuallyControlled && k.online === false) ||
        k.maintenanceMode === true ||
        k.outOfOrder === true
      );

  return {
    enabled: migratedEnabled,
    online: k.online !== false,
    manuallyControlled: !!k.manuallyControlled,
    brightness: Number(k.brightness ?? 75),
    locked: !!k.locked,
    maintenanceMode: migratedEnabled ? !!k.maintenanceMode : true,
    outOfOrder: migratedEnabled ? !!k.outOfOrder : true,
    lastHeartbeatAt: k.lastHeartbeatAt || null,
    lastSeenAt: k.lastSeenAt || null,
    unavailableMessage: String(k.unavailableMessage || "Maintenance Break / Out of Order"),
    updatedAt: k.updatedAt || null,
    lastError: String(k.lastError || "")
  };
};

FC._normalizeDevices = function (devices = {}) {
  const base = FC.defaultState().devices;
  const d = FC._safeObject(devices);

  return {
    network: {
      ...base.network,
      ...FC._safeObject(d.network)
    },
    printer: FC._normalizePrinterDevice({
      ...base.printer,
      ...FC._safeObject(d.printer)
    }),
    paymentGateway: {
      ...base.paymentGateway,
      ...FC._safeObject(d.paymentGateway)
    },
    kioskDisplay: FC._normalizeKioskDisplayDevice({
      ...base.kioskDisplay,
      ...FC._safeObject(d.kioskDisplay)
    }),
    localCache: {
      ...base.localCache,
      ...FC._safeObject(d.localCache)
    }
  };
};

// ---------- Supabase Hardware State Sync ----------
FC._hardwareCloudDb = function () {
  const db = FC._db();
  return db && typeof db.from === "function" ? db : null;
};

FC._normalizeHardwareCloudRow = function (row = {}) {
  const r = FC._safeObject(row);
  const key = String(r.device_key || r.deviceKey || "").trim();
  const state = FC._safeObject(r.state);

  if (!key) return null;

  return {
    deviceKey: key,
    state: {
      ...state,
      updatedAt: state.updatedAt || r.updated_at || r.updatedAt || null
    }
  };
};

FC._applyHardwareCloudRow = function (row, options = {}) {
  const normalizedRow = FC._normalizeHardwareCloudRow(row);
  if (!normalizedRow) return false;

  const s = FC.getState();
  s.devices = FC._normalizeDevices(s.devices || {});

  const key = normalizedRow.deviceKey;
  const previous = FC._safeObject(s.devices[key]);
  let next = {
    ...previous,
    ...normalizedRow.state
  };

  if (key === "printer") {
    next = FC._normalizePrinterDevice(next);
  }

  if (key === "kioskDisplay") {
    next = FC._normalizeKioskDisplayDevice(next);
  }

  const changed = JSON.stringify(previous) !== JSON.stringify(next);
  if (!changed) return false;

  s.devices[key] = next;
  FC.setState(s, { silent: true });

  if (!options.silent) {
    FC._emitStateChanged();
  }

  return true;
};

FC._seedMissingHardwareRows = async function (existingKeys = []) {
  const db = FC._hardwareCloudDb();
  if (!db) return false;

  const existing = new Set(FC._safeArray(existingKeys).map((x) => String(x || "")));
  const devices = FC.getDevices();
  const rows = Object.entries(devices)
    .filter(([key]) => !existing.has(key))
    .map(([deviceKey, state]) => ({
      device_key: deviceKey,
      state: FC._clone(state),
      updated_at: FC.nowISO()
    }));

  if (!rows.length) return true;

  const { error } = await db
    .from(FC.HARDWARE_DEVICE_TABLE)
    .upsert(rows, { onConflict: "device_key", ignoreDuplicates: true });

  if (error) throw error;
  return true;
};

FC.refreshHardwareDevicesFromSupabase = async function (options = {}) {
  const db = FC._hardwareCloudDb();
  if (!db) return null;

  try {
    const { data, error } = await db
      .from(FC.HARDWARE_DEVICE_TABLE)
      .select("device_key,state,updated_at")
      .order("device_key", { ascending: true });

    if (error) throw error;

    const rows = FC._safeArray(data);

    if (options.seedMissing !== false) {
      await FC._seedMissingHardwareRows(rows.map((row) => row.device_key));
    }

    let changed = false;
    rows.forEach((row) => {
      changed = FC._applyHardwareCloudRow(row, { silent: true }) || changed;
    });

    FC._hardwareCloudReady = true;
    FC._hardwareCloudWarned = false;

    if (changed && !options.silent) {
      FC._emitStateChanged();
    }

    return FC.getDevices();
  } catch (err) {
    FC._hardwareCloudReady = false;

    if (!FC._hardwareCloudWarned) {
      FC._hardwareCloudWarned = true;
      console.warn(
        "Hardware cloud sync is unavailable. Run the supplied Supabase hardware_devices SQL once. Local browser state will continue working.",
        err
      );
    }

    return null;
  }
};

FC._syncHardwareDevicePatchToSupabase = async function (deviceKey, patch = {}) {
  const db = FC._hardwareCloudDb();
  const key = String(deviceKey || "").trim();
  if (!db || !key) return null;

  const cleanPatch = {
    ...FC._safeObject(patch),
    updatedAt: FC._safeObject(patch).updatedAt || FC.nowISO()
  };

  try {
    // The SQL function performs an atomic JSON merge. A heartbeat therefore
    // cannot overwrite Admin fields such as kioskDisplay.enabled.
    const rpcResult = await db.rpc("merge_hardware_device", {
      p_device_key: key,
      p_patch: cleanPatch
    });

    if (!rpcResult.error) {
      const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      if (row) FC._applyHardwareCloudRow(row, { silent: false });
      FC._hardwareCloudReady = true;
      FC._hardwareCloudWarned = false;
      return row || true;
    }

    // Fallback for projects where the merge function was not created yet.
    const { data: existing, error: readError } = await db
      .from(FC.HARDWARE_DEVICE_TABLE)
      .select("device_key,state,updated_at")
      .eq("device_key", key)
      .maybeSingle();

    if (readError) throw rpcResult.error || readError;

    const mergedState = {
      ...FC._safeObject(existing?.state),
      ...cleanPatch
    };

    const { data: saved, error: saveError } = await db
      .from(FC.HARDWARE_DEVICE_TABLE)
      .upsert({
        device_key: key,
        state: mergedState,
        updated_at: FC.nowISO()
      }, { onConflict: "device_key" })
      .select("device_key,state,updated_at")
      .single();

    if (saveError) throw saveError;

    FC._applyHardwareCloudRow(saved, { silent: false });
    FC._hardwareCloudReady = true;
    FC._hardwareCloudWarned = false;
    return saved;
  } catch (err) {
    FC._hardwareCloudReady = false;

    if (!FC._hardwareCloudWarned) {
      FC._hardwareCloudWarned = true;
      console.warn(
        `Hardware ${key} cloud update failed. The local browser value was retained.`,
        err
      );
    }

    return null;
  }
};

FC.startHardwareCloudSync = function () {
  const db = FC._hardwareCloudDb();
  if (!db || FC._hardwareRefreshTimer) return;

  // Realtime normally updates instantly. Polling is retained as a reliable
  // fallback when Realtime publication is disabled or briefly disconnected.
  FC._hardwareRefreshTimer = setInterval(() => {
    FC.refreshHardwareDevicesFromSupabase({
      seedMissing: true,
      silent: false
    }).catch(() => {});
  }, 5000);
};

FC.getDevices = function () {
  const s = FC.getState();
  return FC._normalizeDevices(s.devices || {});
};

FC.getDevice = function (deviceKey) {
  return FC.getDevices()[deviceKey] || null;
};

FC.deviceLog = function (message, level = "INFO") {
  const s = FC.getState();
  s.deviceLogs = FC._safeArray(s.deviceLogs);
  s.deviceLogs.unshift({ at: FC.nowISO(), level: String(level || "INFO"), message: String(message || "") });
  s.deviceLogs = s.deviceLogs.slice(0, 50);
  FC.setState(s);
};

FC.setDevice = function (deviceKey, patch) {
  const key = String(deviceKey || "").trim();
  if (!key) return null;

  const s = FC.getState();
  s.devices = FC._normalizeDevices(s.devices || {});
  const current = FC._safeObject(s.devices[key]);
  const cleanPatch = FC._safeObject(patch);

  let next = {
    ...current,
    ...cleanPatch,
    updatedAt: cleanPatch.updatedAt || FC.nowISO()
  };

  if (key === "printer") {
    next = FC._normalizePrinterDevice(next);
  }

  if (key === "kioskDisplay") {
    /*
      enabled = manual admin control
      online  = heartbeat / kiosk browser alive status

      A heartbeat is never allowed to change enabled, maintenanceMode,
      or outOfOrder. This prevents a manually disabled kiosk from turning
      itself back ON after a few seconds.
    */
    const hasEnabledPatch = Object.prototype.hasOwnProperty.call(cleanPatch, "enabled");

    next = FC._normalizeKioskDisplayDevice(next);

    if (hasEnabledPatch) {
      next.enabled = cleanPatch.enabled !== false;
      next.manuallyControlled = true;
      next.maintenanceMode = !next.enabled;
      next.outOfOrder = !next.enabled;
    }
  }

  if (key === "paymentGateway") {
    next.unavailableMessage = next.unavailableMessage || "Online payment is temporarily unavailable. Please choose cash payment or contact staff.";
  }

  s.devices[key] = next;
  FC.setState(s);

  const cloudPatch = {
    ...cleanPatch,
    updatedAt: next.updatedAt || cleanPatch.updatedAt || FC.nowISO()
  };

  if (key === "printer") {
    const paperFieldsChanged = [
      "paper",
      "paperPercent",
      "paperRollMeters",
      "paperUsedMeters",
      "paperRemainingMeters",
      "lowPaper",
      "lastPrintAt",
      "lastPaperUpdateAt"
    ].some((field) => Object.prototype.hasOwnProperty.call(cleanPatch, field));

    if (paperFieldsChanged) {
      Object.assign(cloudPatch, {
        paper: next.paper,
        paperPercent: next.paperPercent,
        paperRollMeters: next.paperRollMeters,
        paperUsedMeters: next.paperUsedMeters,
        paperRemainingMeters: next.paperRemainingMeters,
        lowPaper: next.lowPaper,
        lastPrintAt: next.lastPrintAt,
        lastPaperUpdateAt: next.lastPaperUpdateAt
      });
    }
  }

  if (key === "kioskDisplay" && Object.prototype.hasOwnProperty.call(cleanPatch, "enabled")) {
    Object.assign(cloudPatch, {
      enabled: next.enabled,
      manuallyControlled: true,
      maintenanceMode: next.maintenanceMode,
      outOfOrder: next.outOfOrder
    });
  }

  if (key === "paymentGateway") {
    cloudPatch.unavailableMessage = next.unavailableMessage;
  }

  // Immediate local update keeps the current browser responsive.
  // Supabase then distributes the same patch to every other device.
  void FC._syncHardwareDevicePatchToSupabase(key, cloudPatch);

  return next;
};

FC.setKioskDisplayEnabled = function (enabled) {
  const isEnabled = !!enabled;

  const updated = FC.setDevice("kioskDisplay", {
    enabled: isEnabled,
    manuallyControlled: true,
    maintenanceMode: !isEnabled,
    outOfOrder: !isEnabled,
    updatedAt: FC.nowISO()
  });

  FC.deviceLog(
    isEnabled
      ? "Customer kiosk display enabled from admin console."
      : "Customer kiosk display disabled. Maintenance / Out of Order mode enabled.",
    isEnabled ? "INFO" : "WARN"
  );

  return updated;
};

FC.setDeviceOnline = function (deviceKey, online) {
  const label = String(deviceKey || "device");

  if (label === "kioskDisplay") {
    return FC.setKioskDisplayEnabled(online);
  }

  const updated = FC.setDevice(label, {
    online: !!online,
    manuallyControlled: true,
    updatedAt: FC.nowISO()
  });

  FC.deviceLog(`${label} turned ${online ? "ON" : "OFF"}.`, online ? "INFO" : "WARN");
  return updated;
};

FC.toggleDeviceOnline = function (deviceKey) {
  const d = FC.getDevices()[deviceKey];
  if (!d) return null;

  if (deviceKey === "kioskDisplay") {
    return FC.setKioskDisplayEnabled(d.enabled === false);
  }

  return FC.setDeviceOnline(deviceKey, !d.online);
};

FC.setPrinterPaperPercent = function (percent, reason = "Printer paper percentage updated") {
  const nextPercent = FC._clampPercent(percent);
  const rollMeters = FC.HARDWARE_PAPER_ROLL_METERS;
  const usedMeters = FC._roundMeters(rollMeters * (1 - nextPercent / 100));

  const updated = FC.setDevice("printer", {
    paper: nextPercent,
    paperPercent: nextPercent,
    paperRollMeters: rollMeters,
    paperUsedMeters: usedMeters,
    paperRemainingMeters: FC._roundMeters(rollMeters - usedMeters),
    lowPaper: nextPercent <= FC.HARDWARE_LOW_PAPER_PERCENT,
    lastPaperUpdateAt: FC.nowISO()
  });

  FC.deviceLog(`${reason}: ${nextPercent}% remaining.`, nextPercent <= FC.HARDWARE_LOW_PAPER_PERCENT ? "WARN" : "INFO");
  return updated;
};

FC.adjustPrinterPaperPercent = function (deltaPercent, reason = "Printer paper adjusted manually") {
  const p = FC.getDevices().printer || {};
  const current = FC._clampPercent(p.paperPercent ?? p.paper ?? 100);
  return FC.setPrinterPaperPercent(current + Number(deltaPercent || 0), reason);
};

FC.resetPrinterPaper = function () {
  return FC.setPrinterPaperPercent(100, "New 80m thermal paper roll installed/reset");
};

FC.consumePrinterPaperMeters = function (meters, reason = "Receipt printed") {
  const p = FC.getDevices().printer || {};
  const rollMeters = Number(p.paperRollMeters || FC.HARDWARE_PAPER_ROLL_METERS);
  const safeRollMeters = Number.isFinite(rollMeters) && rollMeters > 0 ? rollMeters : FC.HARDWARE_PAPER_ROLL_METERS;
  const usedBefore = Number(p.paperUsedMeters || 0);
  const useMeters = Math.max(0, Number(meters || p.receiptAverageMeters || FC.HARDWARE_RECEIPT_AVERAGE_METERS));
  const usedAfter = Math.min(safeRollMeters, usedBefore + useMeters);
  const remainingMeters = Math.max(0, safeRollMeters - usedAfter);
  const nextPercent = FC._clampPercent((remainingMeters / safeRollMeters) * 100);

  const updated = FC.setDevice("printer", {
    paper: nextPercent,
    paperPercent: nextPercent,
    paperRollMeters: safeRollMeters,
    paperUsedMeters: FC._roundMeters(usedAfter),
    paperRemainingMeters: FC._roundMeters(remainingMeters),
    lowPaper: nextPercent <= FC.HARDWARE_LOW_PAPER_PERCENT,
    lastPrintAt: FC.nowISO(),
    lastPaperUpdateAt: FC.nowISO()
  });

  FC.deviceLog(
    `${reason}: used ${FC._roundMeters(useMeters)}m, ${nextPercent}% paper remaining.`,
    nextPercent <= FC.HARDWARE_LOW_PAPER_PERCENT ? "WARN" : "INFO"
  );

  if (nextPercent <= FC.HARDWARE_LOW_PAPER_PERCENT && nextPercent > 0) {
    FC.deviceLog(`LOW PAPER: printer paper is ${nextPercent}%. Replace the 80m roll soon.`, "WARN");
  }

  if (nextPercent <= 0) {
    FC.deviceLog("PRINTER OUT OF PAPER: printing should be stopped until a new roll is installed.", "ERROR");
  }

  return updated;
};

FC.simulatePrinterPaperUse = function () {
  const p = FC.getDevices().printer || {};
  const receiptMeters = Number(p.receiptAverageMeters || FC.HARDWARE_RECEIPT_AVERAGE_METERS);
  return FC.consumePrinterPaperMeters(receiptMeters, "Receipt/test print paper consumed");
};

FC.canPrintReceipt = function () {
  const p = FC.getDevices().printer || {};
  const paper = FC._clampPercent(p.paperPercent ?? p.paper ?? 100);

  if (!p.online) {
    return { ok: false, reason: "Printer is turned OFF from admin hardware console." };
  }

  if (paper <= 0) {
    return { ok: false, reason: "Printer is out of paper." };
  }

  return { ok: true, reason: "Printer ready." };
};

FC.canUseOnlinePayment = function () {
  const g = FC.getDevices().paymentGateway || {};
  if (!g.online) {
    return {
      ok: false,
      reason: g.unavailableMessage || "Online payment is temporarily unavailable. Please choose cash payment or contact staff."
    };
  }

  return { ok: true, reason: "Payment gateway online." };
};

FC.isKioskDisplayAvailable = function () {
  const k = FC.getDevices().kioskDisplay || {};

  if (k.enabled === false || k.maintenanceMode || k.outOfOrder || k.locked) {
    return {
      ok: false,
      reason: k.unavailableMessage || "Maintenance Break / Out of Order"
    };
  }

  return {
    ok: true,
    reason: "Kiosk display active.",
    heartbeatOnline: k.online !== false
  };
};

FC.updateDeviceHeartbeat = function (deviceKey = "kioskDisplay", patch = {}) {
  const now = FC.nowISO();
  const key = String(deviceKey || "kioskDisplay");
  const cleanPatch = { ...FC._safeObject(patch) };

  // Heartbeat must never override manual kiosk availability fields.
  if (key === "kioskDisplay") {
    delete cleanPatch.enabled;
    delete cleanPatch.maintenanceMode;
    delete cleanPatch.outOfOrder;
    delete cleanPatch.manuallyControlled;
  }

  return FC.setDevice(key, {
    ...cleanPatch,
    online: cleanPatch.online !== false,
    lastHeartbeatAt: now,
    lastSeenAt: now,
    updatedAt: now
  });
};

FC.updateKioskHeartbeat = function (patch = {}) {
  const now = FC.nowISO();
  const cleanPatch = FC._safeObject(patch);
  const devices = FC.getDevices();

  const networkManualOff =
    devices.network?.manuallyControlled &&
    devices.network?.online === false &&
    cleanPatch.force !== true;

  FC.setDevice("network", {
    online: networkManualOff ? false : cleanPatch.networkOnline !== false,
    lastHeartbeatAt: now,
    lastSeenAt: now,
    lastNetworkCheckAt: now,
    latencyMs: Number(cleanPatch.latencyMs || devices.network?.latencyMs || 42),
    lastError: String(cleanPatch.lastError || "")
  });

  /*
    Only update heartbeat status here.
    Do not update enabled / maintenanceMode / outOfOrder.
  */
  return FC.setDevice("kioskDisplay", {
    online: cleanPatch.displayOnline !== false,
    lastHeartbeatAt: now,
    lastSeenAt: now,
    lastError: String(cleanPatch.displayError || ""),
    updatedAt: now
  });
};

FC.isHeartbeatStale = function (deviceKey = "network", maxAgeMs = FC.HARDWARE_HEARTBEAT_STALE_MS) {
  const d = FC.getDevices()[deviceKey] || {};
  const raw = d.lastHeartbeatAt || d.lastSeenAt || d.updatedAt || "";
  if (!raw) return false;

  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return false;

  return Date.now() - t > Number(maxAgeMs || FC.HARDWARE_HEARTBEAT_STALE_MS);
};

FC.simulateLatency = function () {
  const ms = 20 + Math.floor(Math.random() * 220);
  FC.setDevice("network", {
    latencyMs: ms,
    online: true,
    lastManualCheckAt: FC.nowISO()
  });

  if (ms > 150) FC.deviceLog(`High network latency simulated: ${ms}ms.`, "WARN");
  else FC.deviceLog(`Network latency simulated: ${ms}ms.`, "INFO");

  return ms;
};

FC.simulateGatewayVerify = function (success = true) {
  FC.setDevice("paymentGateway", {
    online: !!success,
    lastVerifyAt: FC.nowISO(),
    lastResult: success ? "success" : "failure"
  });

  FC.deviceLog(
    success ? "Payment gateway verified successfully." : "Payment gateway failure simulated. Online payment is unavailable.",
    success ? "INFO" : "ERROR"
  );
};

FC.hardwareHealth = function () {
  const d = FC.getDevices();
  const issues = [];
  const paper = FC._clampPercent(d.printer?.paperPercent ?? d.printer?.paper ?? 100);
  const heartbeatStale = FC.isHeartbeatStale("network") || FC.isHeartbeatStale("kioskDisplay");

  if (!d.network?.online || heartbeatStale) issues.push("Network offline");
  if (Number(d.network?.latencyMs || 0) > 150) issues.push("High network latency");
  if (!d.printer?.online) issues.push("Printer offline");
  if (paper <= FC.HARDWARE_LOW_PAPER_PERCENT && paper > 0) issues.push("Printer paper low");
  if (paper <= 0) issues.push("Printer out of paper");
  if (!d.paymentGateway?.online) issues.push("Payment gateway offline");
  if (d.kioskDisplay?.enabled === false || d.kioskDisplay?.maintenanceMode || d.kioskDisplay?.outOfOrder) {
    issues.push("Kiosk display in maintenance mode");
  }
  if (d.kioskDisplay?.locked) issues.push("Kiosk is locked");

  return { ok: issues.length === 0, issues, paper, heartbeatStale };
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: FC.HARDWARE_DEVICE_TABLE },
        (payload) => {
          if (payload?.eventType === "DELETE") {
            FC.refreshHardwareDevicesFromSupabase({ seedMissing: true, silent: false }).catch(() => {});
            return;
          }

          if (payload?.new) {
            FC._applyHardwareCloudRow(payload.new, { silent: false });
          }
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });
  } catch (err) {
    console.warn("Realtime sync could not start:", err);
  }
};