window.FC = window.FC || {};

FC.KEY = "fc_state_v2";
FC.REMOTE_STAMP_KEY = "fc_remote_stamp_v1";
FC.CLOUD_ROW_ID = "main";
FC.POLL_MS = 2000;
FC._cloudSyncStarted = false;

FC.defaultState = function(){
  return {
    seededAt: null,
    restaurants: [],
    settings: { currency:"PKR", taxRate:0.13, idleAdsAfterSeconds:240, paymentTimeoutSeconds:180 },
    ads: [],
    orders: [],
    adMetrics: { impressions: {}, totalSeconds: 0 },
    devices: {
      network: { online: true, latencyMs: 42 },
      printer: { online: true, paper: 85, lastPrintAt: null },
      paymentGateway: { online: true, provider: "QR Aggregator", lastVerifyAt: null },
      kioskDisplay: { online: true, brightness: 75, locked: false },
      localCache: { enabled: true, queuedOrders: 0 }
    },
    deviceLogs: [],
    logs: []
  };
};

FC.nowISO = () => new Date().toISOString();

FC.readLocalState = function(){
  const raw = localStorage.getItem(FC.KEY);
  if(!raw) return FC.defaultState();
  try { return JSON.parse(raw); }
  catch(e) { return FC.defaultState(); }
};

FC.writeLocalState = function(state, remoteStamp){
  localStorage.setItem(FC.KEY, JSON.stringify(state));
  if(remoteStamp) {
    localStorage.setItem(FC.REMOTE_STAMP_KEY, remoteStamp);
  }
};

FC.getRemoteStamp = function(){
  return localStorage.getItem(FC.REMOTE_STAMP_KEY) || "";
};

FC.log = function(message){
  const s = FC.getState();
  s.logs.unshift({ at: FC.nowISO(), message });
  s.logs = s.logs.slice(0, 12);
  FC.setState(s);
};

FC.getState = function(){
  return FC.readLocalState();
};

FC.applyRemoteState = function(state, remoteStamp, dispatch = true){
  const oldJson = localStorage.getItem(FC.KEY) || "";
  const newJson = JSON.stringify(state);
  const oldStamp = FC.getRemoteStamp();

  FC.writeLocalState(state, remoteStamp || FC.nowISO());

  if(dispatch && (oldJson !== newJson || oldStamp !== remoteStamp)) {
    window.dispatchEvent(new CustomEvent("fc:state-changed"));
  }
};

FC.pullRemoteState = async function(){
  if(!window.DB) return null;

  const { data, error } = await window.DB
    .from("app_state")
    .select("id, data, updated_at")
    .eq("id", FC.CLOUD_ROW_ID)
    .maybeSingle();

  if(error) {
    console.error("Supabase pull error:", error);
    return null;
  }

  return data || null;
};

FC.pushRemoteState = async function(state){
  if(!window.DB) return;

  const stamp = FC.nowISO();

  const { error } = await window.DB
    .from("app_state")
    .upsert(
      {
        id: FC.CLOUD_ROW_ID,
        data: state,
        updated_at: stamp
      },
      { onConflict: "id" }
    );

  if(error) {
    console.error("Supabase push error:", error);
    return;
  }

  localStorage.setItem(FC.REMOTE_STAMP_KEY, stamp);
};

FC.setState = function(state, options = {}){
  const stamp = options.remoteStamp || FC.getRemoteStamp() || FC.nowISO();
  FC.writeLocalState(state, stamp);

  if(!options.skipRemote) {
    FC.pushRemoteState(state).catch(console.error);
  }

  return state;
};

FC.buildSeedState = async function(){
  const [r, a] = await Promise.all([
    fetch("data/restaurants.json").then(x => x.json()),
    fetch("data/ads.json").then(x => x.json())
  ]);

  const s = FC.defaultState();
  s.seededAt = FC.nowISO();
  s.restaurants = r.restaurants;
  s.settings = r.settings;
  s.ads = a.ads;
  return s;
};

FC.reset = async function(){
  localStorage.removeItem("fc_session");
  localStorage.removeItem("fc_restaurant_session");
  localStorage.removeItem("fc_admin_session");
  localStorage.removeItem(FC.KEY);
  localStorage.removeItem(FC.REMOTE_STAMP_KEY);

  const s = await FC.buildSeedState();
  FC.setState(s);
  FC.log("System reset from JSON files.");
};

FC.seed = async function(){
  const remote = await FC.pullRemoteState();

  if(remote && remote.data) {
    FC.applyRemoteState(remote.data, remote.updated_at, false);
    FC.startCloudSync();
    return;
  }

  const local = FC.readLocalState();
  if(local && local.seededAt) {
    await FC.pushRemoteState(local);
    FC.startCloudSync();
    return;
  }

  const seeded = await FC.buildSeedState();
  FC.setState(seeded);
  FC.log("System seeded from JSON files.");
  FC.startCloudSync();
};

FC.uid = function(prefix="ORD"){
  return prefix + "-" + Math.random().toString(16).slice(2, 8).toUpperCase() + "-" + Date.now().toString().slice(-5);
};

// ---- Orders ----
FC.createOrder = function({ restaurantId, items, totals }){
  const s = FC.getState();
  const id = FC.uid("ORD");
  const order = {
    id,
    restaurantId,
    items,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    currency: s.settings.currency,
    status: "pending_approval",
    rejectReason: null,
    createdAt: FC.nowISO(),
    approvedAt: null,
    paidAt: null,
    payment: { attemptCount: 0, success: false, method: null, qrPayload: null }
  };
  s.orders.unshift(order);
  FC.setState(s);
  FC.log(`New order ${id} created → pending approval.`);
  return order;
};

FC.updateOrder = function(orderId, patch){
  const s = FC.getState();
  const idx = s.orders.findIndex(o => o.id === orderId);
  if(idx === -1) return null;
  s.orders[idx] = { ...s.orders[idx], ...patch };
  FC.setState(s);
  return s.orders[idx];
};

FC.getOrder = function(orderId){
  const s = FC.getState();
  return s.orders.find(o => o.id === orderId) || null;
};

FC.ordersForRestaurant = function(restaurantId){
  const s = FC.getState();
  return s.orders.filter(o => o.restaurantId === restaurantId);
};

// ---- Restaurant settings ----
FC.toggleRestaurantOnline = function(restaurantId){
  const s = FC.getState();
  const i = s.restaurants.findIndex(r => r.id === restaurantId);
  if(i === -1) return null;
  s.restaurants[i].online = !s.restaurants[i].online;
  FC.setState(s);
  FC.log(`Restaurant ${s.restaurants[i].name} online=${s.restaurants[i].online}`);
  return s.restaurants[i];
};

FC.toggleMenuItem = function(restaurantId, menuItemId){
  const s = FC.getState();
  const r = s.restaurants.find(x => x.id === restaurantId);
  if(!r) return null;
  const m = r.menu.find(x => x.id === menuItemId);
  if(!m) return null;
  m.available = !m.available;
  FC.setState(s);
  FC.log(`Menu item ${m.name} available=${m.available}`);
  return m;
};

// ---- Ads ----
FC.trackAdImpression = function(adId){
  const s = FC.getState();
  s.adMetrics.impressions[adId] = (s.adMetrics.impressions[adId] || 0) + 1;
  FC.setState(s);
};

FC.resetAdMetrics = function(){
  const s = FC.getState();
  s.adMetrics = { impressions: {}, totalSeconds: 0 };
  FC.setState(s);
  FC.log("Ad metrics reset.");
};


// ---- Hardware Layer (Simulated) ----
FC.getDevices = function(){
  const s = FC.getState();
  return s.devices || {};
};

FC.deviceLog = function(message, level="INFO"){
  const s = FC.getState();
  s.deviceLogs = s.deviceLogs || [];
  s.deviceLogs.unshift({ at: FC.nowISO(), level, message });
  s.deviceLogs = s.deviceLogs.slice(0, 30);
  FC.setState(s);
};

FC.setDevice = function(deviceKey, patch){
  const s = FC.getState();
  s.devices = s.devices || {};
  s.devices[deviceKey] = { ...(s.devices[deviceKey]||{}), ...patch };
  FC.setState(s);
  FC.deviceLog(`${deviceKey} updated: ${JSON.stringify(patch)}`);
  return s.devices[deviceKey];
};

FC.toggleDeviceOnline = function(deviceKey){
  const d = FC.getDevices()[deviceKey];
  if(!d) return null;
  return FC.setDevice(deviceKey, { online: !d.online });
};

FC.simulateLatency = function(){
  const ms = 20 + Math.floor(Math.random() * 180);
  FC.setDevice("network", { latencyMs: ms });
  return ms;
};

FC.simulatePrinterPaperUse = function(){
  const d = FC.getDevices().printer || { paper: 100 };
  const next = Math.max(0, (d.paper || 0) - (2 + Math.floor(Math.random()*6)));
  FC.setDevice("printer", { paper: next, lastPrintAt: FC.nowISO() });
  if(next <= 10) FC.deviceLog("Printer paper low.", "WARN");
  if(next === 0) FC.deviceLog("Printer out of paper.", "ERROR");
};

FC.simulateGatewayVerify = function(success=true){
  FC.setDevice("paymentGateway", { lastVerifyAt: FC.nowISO() });
  FC.deviceLog(success ? "Payment verified by gateway." : "Payment failed at gateway.", success ? "INFO" : "ERROR");
};

FC.hardwareHealth = function(){
  const d = FC.getDevices();
  const issues = [];
  if(!d.network?.online) issues.push("Network offline");
  if((d.network?.latencyMs || 0) > 150) issues.push("High network latency");
  if(!d.printer?.online) issues.push("Printer offline");
  if((d.printer?.paper ?? 100) <= 10) issues.push("Printer paper low");
  if(!d.paymentGateway?.online) issues.push("Payment gateway offline");
  if(!d.kioskDisplay?.online) issues.push("Kiosk display offline");
  if(d.kioskDisplay?.locked) issues.push("Kiosk is locked");
  return { ok: issues.length === 0, issues };
};
