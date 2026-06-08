(async function () {
  window.FC = window.FC || {};

  const safeArr = (v) => Array.isArray(v) ? v : [];
  const safeObj = (v) => (v && typeof v === "object" ? v : {});
  const setText = (el, value) => { if (el) el.textContent = String(value ?? ""); };

  try {
    if (typeof FC.seed === "function") {
      await FC.seed();
    }
  } catch (err) {
    console.error("admin.js: seed failed", err);
  }

  const loginBox = document.getElementById("loginBox");
  const appBox = document.getElementById("appBox");
  const logoutBtn = document.getElementById("logoutBtn");

  const userInput = document.getElementById("userInput");
  const passInput = document.getElementById("passInput");
  const loginBtn = document.getElementById("loginBtn");
  const loginErr = document.getElementById("loginErr");

  const mRevenue = document.getElementById("mRevenue");
  const mOrders = document.getElementById("mOrders");
  const mPeak = document.getElementById("mPeak");
  const mPayRate = document.getElementById("mPayRate");

  const restaurantsPanel = document.getElementById("restaurantsPanel");
  const analyticsPanel = document.getElementById("analyticsPanel");
  const adsPanel = document.getElementById("adsPanel");
  const logPanel = document.getElementById("logPanel");

  const exportAllBtn = document.getElementById("exportAllBtn");
  const resetAdsBtn = document.getElementById("resetAdsBtn");

  const sessKey = "fc_admin_session";
  let loggedIn = false;
  let isRendering = false;
  let rerenderRequested = false;

  try {
    const sess = JSON.parse(localStorage.getItem(sessKey) || "{}");
    loggedIn = !!sess.loggedIn;
  } catch {
    loggedIn = false;
  }

  function getStateSafe() {
    try {
      return typeof FC.getState === "function" ? (FC.getState() || {}) : {};
    } catch {
      return {};
    }
  }

  function saveStateSafe(state) {
    try {
      if (typeof FC.setState === "function") {
        FC.setState(state);
      } else if (FC.KEY) {
        localStorage.setItem(FC.KEY, JSON.stringify(state));
      }
    } catch (err) {
      console.error("admin.js: failed to save state", err);
    }
  }

  function money(amount) {
    const n = Number(amount || 0);
    try {
      if (typeof FC.money === "function") return FC.money(n);
    } catch {}
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 0
    }).format(n);
  }

  function isToday(iso) {
    try {
      if (typeof FC.isToday === "function") return FC.isToday(iso);
    } catch {}
    if (!iso) return false;
    const d = new Date(iso);
    const n = new Date();
    return (
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate()
    );
  }

  function nowISO() {
    try {
      if (typeof FC.nowISO === "function") return FC.nowISO();
    } catch {}
    return new Date().toISOString();
  }

  function logSafe(message) {
    try {
      if (typeof FC.log === "function") FC.log(message);
    } catch (err) {
      console.error("admin.js log failed:", err);
    }
  }

  function normalizeServiceType(value) {
    const v = String(value || "").trim().toLowerCase();

    if (v === "dine_in" || v === "dine-in" || v === "dine in") return "dine_in";
    if (v === "takeaway" || v === "take_away" || v === "take-away" || v === "take away") return "takeaway";

    return "";
  }

  function normalizeTableNumber(serviceType, value) {
    const table = String(value || "").trim();
    return serviceType === "dine_in" ? table : "";
  }

  function serviceTypeLabel(order) {
    const type = normalizeServiceType(
      order?.serviceType ||
      order?.service_type ||
      order?.orderType ||
      order?.order_type ||
      ""
    );

    if (type === "dine_in") return "Dine In";
    if (type === "takeaway") return "Takeaway";

    return "Not selected";
  }

  function tableNumberOf(order) {
    const type = normalizeServiceType(
      order?.serviceType ||
      order?.service_type ||
      order?.orderType ||
      order?.order_type ||
      ""
    );

    return normalizeTableNumber(
      type,
      order?.tableNumber ||
      order?.table_number ||
      order?.tableNo ||
      order?.table_no ||
      ""
    );
  }

  function serviceSummary(order) {
    const type = normalizeServiceType(
      order?.serviceType ||
      order?.service_type ||
      order?.orderType ||
      order?.order_type ||
      ""
    );

    const table = tableNumberOf(order);

    if (type === "dine_in") {
      return table ? `Dine In • Table ${table}` : "Dine In";
    }

    if (type === "takeaway") return "Takeaway";

    return "Not selected";
  }

  function normalizeOrder(order) {
    if (!order) return null;

    // Supabase row shape
    if ("restaurant_id" in order || "order_items" in order) {
      const serviceType = normalizeServiceType(order.service_type || order.serviceType || "");
      const tableNumber = normalizeTableNumber(serviceType, order.table_number || order.tableNumber || "");

      return {
        id: order.id,
        restaurantId: order.restaurant_id,
        serviceType,
        tableNumber,
        items: safeArr(order.order_items).map((it) => ({
          itemId: it.menu_item_id ?? null,
          name: it.name,
          price: Number(it.price || 0),
          qty: Number(it.qty || 0),
          fast: !!it.fast
        })),
        subtotal: Number(order.subtotal || 0),
        tax: Number(order.tax || 0),
        total: Number(order.total || 0),
        currency: order.currency || "PKR",
        status: order.status || "pending_approval",
        rejectReason: order.reject_reason || null,
        createdAt: order.created_at || null,
        approvedAt: order.approved_at || null,
        paidAt: order.paid_at || null,
        payment: safeObj(order.payment)
      };
    }

    // Local/demo shape
    const serviceType = normalizeServiceType(order.serviceType || order.service_type || order.orderType || "");
    const tableNumber = normalizeTableNumber(serviceType, order.tableNumber || order.table_number || order.tableNo || "");

    return {
      id: order.id,
      restaurantId: order.restaurantId,
      serviceType,
      tableNumber,
      items: safeArr(order.items),
      subtotal: Number(order.subtotal || 0),
      tax: Number(order.tax || 0),
      total: Number(order.total || 0),
      currency: order.currency || "PKR",
      status: order.status || "pending_approval",
      rejectReason: order.rejectReason || null,
      createdAt: order.createdAt || null,
      approvedAt: order.approvedAt || null,
      paidAt: order.paidAt || null,
      payment: safeObj(order.payment)
    };
  }

  async function fetchOrdersFromSupabase() {
    if (!FC.supabase || typeof FC.supabase.from !== "function") {
      return null;
    }

    try {
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

      return safeArr(data).map(normalizeOrder).filter(Boolean);
    } catch (err) {
      console.warn("admin.js: Supabase orders fetch failed, falling back to local state.", err);
      return null;
    }
  }

  async function getDashboardData() {
    const state = getStateSafe();

    let orders = await fetchOrdersFromSupabase();
    if (!orders) {
      orders = safeArr(state.orders).map(normalizeOrder).filter(Boolean);
    }

    return {
      state,
      restaurants: safeArr(state.restaurants),
      ads: safeArr(state.ads),
      logs: safeArr(state.logs),
      adMetrics: safeObj(state.adMetrics),
      orders
    };
  }

  function computeMetrics(data) {
    const ordersToday = safeArr(data.orders).filter((o) => isToday(o.createdAt));
    const paidStatuses = new Set(["paid", "preparing", "ready", "completed"]);
    const paidToday = ordersToday.filter((o) => paidStatuses.has(o.status));

    const revenue = paidToday.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const byHour = {};
    for (const o of paidToday) {
      const dt = new Date(o.paidAt || o.createdAt || Date.now());
      const h = dt.getHours();
      byHour[h] = (byHour[h] || 0) + 1;
    }

    let peakHour = "—";
    let peakCount = -1;
    Object.keys(byHour).forEach((h) => {
      if (byHour[h] > peakCount) {
        peakCount = byHour[h];
        peakHour = `${String(h).padStart(2, "0")}:00`;
      }
    });

    let attempts = 0;
    let successes = 0;
    for (const o of ordersToday) {
      attempts += Number(o.payment?.attemptCount || 0);
      if (o.payment?.success) successes += 1;
    }

    const payRate = attempts > 0 ? Math.round((successes / attempts) * 100) : 0;

    const dineInCount = paidToday.filter((o) => o.serviceType === "dine_in").length;
    const takeawayCount = paidToday.filter((o) => o.serviceType === "takeaway").length;

    return {
      revenue,
      ordersTodayCount: ordersToday.length,
      peakHour,
      payRate,
      dineInCount,
      takeawayCount
    };
  }

  async function loadUsers() {
    try {
      const res = await fetch("data/users.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error("admin.js: users.json load failed", err);
      return { admins: [] };
    }
  }

  async function showApp() {
    loginBox?.classList.add("hidden");
    appBox?.classList.remove("hidden");
    logoutBtn?.classList.remove("hidden");
    await renderAll();
  }

  function showLogin() {
    loginBox?.classList.remove("hidden");
    appBox?.classList.add("hidden");
    logoutBtn?.classList.add("hidden");
  }

  function renderMetrics(data) {
    const a = computeMetrics(data);
    setText(mRevenue, money(a.revenue));
    setText(mOrders, a.ordersTodayCount);
    setText(mPeak, a.peakHour);
    setText(mPayRate, `${a.payRate}%`);
  }

  async function renderRestaurants(data) {
    if (!restaurantsPanel) return;

    restaurantsPanel.innerHTML = "";

    if (!data.restaurants.length) {
      restaurantsPanel.innerHTML = `<div class="text-sm text-slate-400">No restaurants loaded.</div>`;
      return;
    }

    for (const r of data.restaurants) {
      const restOrdersToday = data.orders.filter((o) =>
        o.restaurantId === r.id &&
        isToday(o.createdAt) &&
        !["pending_approval", "rejected", "awaiting_payment"].includes(o.status)
      );

      const sold = restOrdersToday.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const dineInCount = restOrdersToday.filter((o) => o.serviceType === "dine_in").length;
      const takeawayCount = restOrdersToday.filter((o) => o.serviceType === "takeaway").length;

      const menu = safeArr(r.menu);

      const div = document.createElement("div");
      div.className = "p-4 rounded-2xl bg-white/5 border border-white/10";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="font-semibold">${r.name || "Restaurant"}</div>
            <div class="text-xs text-slate-400 mt-1">${r.tagline || ""}</div>
            <div class="text-sm text-slate-300 mt-2">
              Sales today: <span class="pill">${money(sold)}</span>
            </div>
            <div class="text-xs text-slate-400 mt-2">
              Dine In: <span class="text-slate-200">${dineInCount}</span>
              • Takeaway: <span class="text-slate-200">${takeawayCount}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="pill ${r.online ? "badge-green" : "badge-red"}">
              ${r.online ? "ONLINE" : "OFFLINE"}
            </span>
            <button class="btn-ghost text-sm" data-toggle>Toggle</button>
          </div>
        </div>

        <div class="mt-4">
          <div class="text-xs text-slate-400 uppercase tracking-widest">Availability</div>
          <div class="mt-2 grid sm:grid-cols-2 gap-2">
            ${menu.slice(0, 6).map((m) => `
              <div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
                <div class="text-xs min-w-0 truncate">${m.name}</div>
                <button class="${m.available ? "btn-ghost" : "btn-primary"} text-xs px-3 py-1.5" data-item="${m.id}">
                  ${m.available ? "Disable" : "Enable"}
                </button>
              </div>
            `).join("")}
          </div>
          <div class="text-xs text-slate-400 mt-2">Showing 6 items for demo.</div>
        </div>
      `;

      const toggleBtn = div.querySelector("[data-toggle]");
      if (toggleBtn) {
        toggleBtn.onclick = async () => {
          try {
            if (typeof FC.toggleRestaurantOnline === "function") {
              await Promise.resolve(FC.toggleRestaurantOnline(r.id));
            }
          } catch (err) {
            console.error("admin.js: toggle restaurant failed", err);
          }
          await renderAll();
        };
      }

      div.querySelectorAll("[data-item]").forEach((btn) => {
        btn.onclick = async () => {
          try {
            if (typeof FC.toggleMenuItem === "function") {
              await Promise.resolve(FC.toggleMenuItem(r.id, btn.getAttribute("data-item")));
            }
          } catch (err) {
            console.error("admin.js: toggle menu item failed", err);
          }
          await renderAll();
        };
      });

      restaurantsPanel.appendChild(div);
    }
  }

  function renderAnalytics(data) {
    if (!analyticsPanel) return;

    const paidToday = data.orders.filter((o) =>
      isToday(o.createdAt) &&
      !["pending_approval", "rejected", "awaiting_payment"].includes(o.status)
    );

    const dineInCount = paidToday.filter((o) => o.serviceType === "dine_in").length;
    const takeawayCount = paidToday.filter((o) => o.serviceType === "takeaway").length;
    const unknownTypeCount = paidToday.filter((o) => !o.serviceType).length;

    const byRest = {};
    paidToday.forEach((o) => {
      byRest[o.restaurantId] = (byRest[o.restaurantId] || 0) + Number(o.total || 0);
    });

    const ranking = Object.entries(byRest)
      .sort((a, b) => b[1] - a[1])
      .map(([rid, rev]) => {
        const rn = data.restaurants.find((r) => r.id === rid)?.name || rid;
        return { restaurant: rn, revenue: rev };
      });

    const itemCounts = {};
    paidToday.forEach((o) => {
      safeArr(o.items).forEach((it) => {
        itemCounts[it.name] = (itemCounts[it.name] || 0) + Number(it.qty || 0);
      });
    });

    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, qty]) => ({ item: name, qty }));

    const impressions = safeObj(data.adMetrics.impressions);
    const adImpressions = Object.entries(impressions)
      .map(([adId, count]) => {
        const ad = data.ads.find((x) => x.id === adId);
        return { ad: ad?.title || adId, impressions: count };
      })
      .sort((a, b) => b.impressions - a.impressions);

    analyticsPanel.innerHTML = `
      <div class="grid sm:grid-cols-2 gap-4">
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-sm font-semibold">Restaurant Ranking (Revenue)</div>
          <div class="mt-3 space-y-2 text-sm">
            ${
              ranking.length
                ? ranking.map((x) => `
                    <div class="flex justify-between text-slate-300">
                      <span>${x.restaurant}</span>
                      <span>${money(x.revenue)}</span>
                    </div>
                  `).join("")
                : `<div class="text-slate-400 text-sm">No paid orders today.</div>`
            }
          </div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-sm font-semibold">Top Items (Qty)</div>
          <div class="mt-3 space-y-2 text-sm">
            ${
              topItems.length
                ? topItems.map((x) => `
                    <div class="flex justify-between text-slate-300">
                      <span>${x.item}</span>
                      <span>${x.qty}</span>
                    </div>
                  `).join("")
                : `<div class="text-slate-400 text-sm">No sales yet.</div>`
            }
          </div>
        </div>
      </div>

      <div class="mt-4 grid sm:grid-cols-3 gap-4">
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Dine In</div>
          <div class="text-2xl font-semibold mt-2">${dineInCount}</div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Takeaway</div>
          <div class="text-2xl font-semibold mt-2">${takeawayCount}</div>
        </div>

        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-xs uppercase tracking-widest text-slate-400">Not Marked</div>
          <div class="text-2xl font-semibold mt-2">${unknownTypeCount}</div>
        </div>
      </div>

      <div class="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10">
        <div class="text-sm font-semibold">Ad Impressions</div>
        <div class="mt-3 space-y-2 text-sm">
          ${
            adImpressions.length
              ? adImpressions.map((x) => `
                  <div class="flex justify-between text-slate-300">
                    <span>${x.ad}</span>
                    <span>${x.impressions}</span>
                  </div>
                `).join("")
              : `<div class="text-slate-400 text-sm">No impressions tracked yet.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderAds(data) {
    if (!adsPanel) return;

    adsPanel.innerHTML = "";

    if (!data.ads.length) {
      adsPanel.innerHTML = `<div class="text-sm text-slate-400">No ads loaded.</div>`;
      return;
    }

    for (const ad of data.ads) {
      const count = Number(data.adMetrics?.impressions?.[ad.id] || 0);
      const rest = ad.restaurantId
        ? (data.restaurants.find((r) => r.id === ad.restaurantId)?.name || ad.restaurantId)
        : "All";

      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-white/5 border border-white/10";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold truncate">${ad.title || "Ad"}</div>
            <div class="text-xs text-slate-400 mt-1">${rest} • ${ad.enabled ? "Enabled" : "Disabled"}</div>
            <div class="text-xs text-slate-300 mt-2">Impressions: <span class="pill">${count}</span></div>
          </div>
          <button class="${ad.enabled ? "btn-ghost" : "btn-primary"} text-xs px-3 py-2" data-toggle>
            ${ad.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      `;

      const btn = div.querySelector("[data-toggle]");
      if (btn) {
        btn.onclick = async () => {
          const st = getStateSafe();
          st.ads = safeArr(st.ads);

          const i = st.ads.findIndex((x) => x.id === ad.id);
          if (i === -1) return;

          st.ads[i].enabled = !st.ads[i].enabled;
          saveStateSafe(st);
          logSafe(`Ad ${ad.id} enabled=${st.ads[i].enabled}`);
          await renderAll();
        };
      }

      adsPanel.appendChild(div);
    }
  }

  function renderLogs(data) {
    if (!logPanel) return;

    logPanel.innerHTML = "";

    const logs = safeArr(data.logs);
    if (!logs.length) {
      logPanel.innerHTML = `<div class="text-sm text-slate-400">No log entries yet.</div>`;
      return;
    }

    logs.forEach((l) => {
      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300";
      div.innerHTML = `
        <div class="text-slate-400">${new Date(l.at || Date.now()).toLocaleTimeString()}</div>
        <div class="mt-1">${l.message || ""}</div>
      `;
      logPanel.appendChild(div);
    });
  }

  // ---------- Professional Admin Excel Report ----------
  function validDate(value) {
    const d = new Date(value || "");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dateOnly(value) {
    const d = validDate(value);
    if (!d) return "";
    return d.toISOString().slice(0, 10);
  }

  function timeOnly(value) {
    const d = validDate(value);
    if (!d) return "";
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function monthTitle(value) {
    const d = validDate(value) || new Date();
    return d.toLocaleString("en-US", {
      month: "long",
      year: "numeric"
    });
  }

  function isSameMonth(value, baseDate) {
    const d = validDate(value);
    if (!d) return false;

    return (
      d.getFullYear() === baseDate.getFullYear() &&
      d.getMonth() === baseDate.getMonth()
    );
  }

  function reportNumber(value) {
    return Number(value || 0);
  }

  function paidReportStatus(status) {
    return ["paid", "preparing", "ready", "completed"].includes(status);
  }

  function prepMinutes(order) {
    const start = validDate(order.approvedAt || order.createdAt);
    const end = validDate(order.readyAt || order.completedAt || order.paidAt);

    if (!start || !end) return "";

    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return minutes >= 0 ? minutes : "";
  }

  function itemsSummary(order) {
    return safeArr(order.items)
      .map((it) => `${it.name || "Item"} x${Number(it.qty || 0)}`)
      .join(" | ");
  }

  function totalDishQty(order) {
    return safeArr(order.items).reduce((sum, it) => sum + Number(it.qty || 0), 0);
  }

  function uniqueDishCount(order) {
    return new Set(safeArr(order.items).map((it) => it.name || it.itemId || "Item")).size;
  }

  function safeSheetName(name) {
    return String(name || "Sheet")
      .replace(/[\\/?*\[\]:]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Sheet";
  }

  function createSheet(rows, widths, autoFilterRef) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map((wch) => ({ wch }));

    if (autoFilterRef) {
      ws["!autofilter"] = { ref: autoFilterRef };
    }

    return ws;
  }

  function addMerge(ws, startRow, startCol, endRow, endCol) {
    ws["!merges"] = ws["!merges"] || [];
    ws["!merges"].push({
      s: { r: startRow, c: startCol },
      e: { r: endRow, c: endCol }
    });
  }

  function restaurantNameById(restaurants, restaurantId) {
    return safeArr(restaurants).find((r) => r.id === restaurantId)?.name || restaurantId || "Unknown";
  }

  function buildRestaurantReportRows(restaurants, orders) {
    const rows = [
      [
        "Restaurant",
        "Online",
        "Total Orders",
        "Paid / Active Orders",
        "Dine In",
        "Takeaway",
        "Not Marked",
        "Subtotal",
        "Tax",
        "Revenue",
        "Best Seller"
      ]
    ];

    safeArr(restaurants).forEach((r) => {
      const restOrders = safeArr(orders).filter((o) => o.restaurantId === r.id);
      const paid = restOrders.filter((o) => paidReportStatus(o.status));

      const itemCounts = {};
      paid.forEach((o) => {
        safeArr(o.items).forEach((it) => {
          const name = it.name || "Unknown";
          itemCounts[name] = (itemCounts[name] || 0) + Number(it.qty || 0);
        });
      });

      const bestSeller =
        Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      rows.push([
        r.name || r.id,
        r.online ? "Online" : "Offline",
        restOrders.length,
        paid.length,
        paid.filter((o) => o.serviceType === "dine_in").length,
        paid.filter((o) => o.serviceType === "takeaway").length,
        paid.filter((o) => !o.serviceType).length,
        reportNumber(paid.reduce((sum, o) => sum + Number(o.subtotal || 0), 0)),
        reportNumber(paid.reduce((sum, o) => sum + Number(o.tax || 0), 0)),
        reportNumber(paid.reduce((sum, o) => sum + Number(o.total || 0), 0)),
        bestSeller
      ]);
    });

    return rows;
  }

  function buildItemSummaryRows(restaurants, orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      safeArr(order.items).forEach((item) => {
        const name = item.name || "Unknown";
        const restaurantName = restaurantNameById(restaurants, order.restaurantId);
        const key = `${restaurantName}__${name}`;
        const qty = Number(item.qty || 0);
        const unitPrice = Number(item.price || 0);
        const lineTotal = qty * unitPrice;

        if (!stats[key]) {
          stats[key] = {
            restaurant: restaurantName,
            item: name,
            total_qty: 0,
            total_sales: 0,
            order_lines: 0
          };
        }

        stats[key].total_qty += qty;
        stats[key].total_sales += lineTotal;
        stats[key].order_lines += 1;
      });
    });

    const rows = [
      ["Restaurant", "Item", "Total Qty Sold", "Total Sales", "Order Lines"]
    ];

    Object.values(stats)
      .sort((a, b) => b.total_sales - a.total_sales)
      .forEach((it) => {
        rows.push([
          it.restaurant,
          it.item,
          it.total_qty,
          reportNumber(it.total_sales),
          it.order_lines
        ]);
      });

    return rows;
  }

  function buildOrderRows(restaurants, orders) {
    const rows = [
      [
        "Order ID",
        "Restaurant",
        "Status",
        "Service Type",
        "Table Number",
        "Order Type",
        "Order Date",
        "Order Placed",
        "Approved At",
        "Paid At",
        "Prep Time (min)",
        "Subtotal",
        "Tax",
        "Total",
        "Items Summary",
        "Total Dish Qty",
        "Unique Dishes"
      ]
    ];

    safeArr(orders).forEach((o) => {
      rows.push([
        o.id,
        restaurantNameById(restaurants, o.restaurantId),
        o.status || "",
        serviceTypeLabel(o),
        tableNumberOf(o),
        serviceSummary(o),
        dateOnly(o.createdAt),
        timeOnly(o.createdAt),
        timeOnly(o.approvedAt),
        timeOnly(o.paidAt),
        prepMinutes(o),
        reportNumber(o.subtotal),
        reportNumber(o.tax),
        reportNumber(o.total),
        itemsSummary(o),
        totalDishQty(o),
        uniqueDishCount(o)
      ]);
    });

    return rows;
  }

  function buildOrderLineRows(restaurants, orders) {
    const rows = [
      [
        "Order ID",
        "Restaurant",
        "Status",
        "Service Type",
        "Table Number",
        "Order Type",
        "Order Date",
        "Placed At",
        "Paid At",
        "Dish",
        "Qty",
        "Unit Price",
        "Line Total"
      ]
    ];

    safeArr(orders).forEach((o) => {
      safeArr(o.items).forEach((it) => {
        const qty = Number(it.qty || 0);
        const unitPrice = Number(it.price || 0);

        rows.push([
          o.id,
          restaurantNameById(restaurants, o.restaurantId),
          o.status || "",
          serviceTypeLabel(o),
          tableNumberOf(o),
          serviceSummary(o),
          dateOnly(o.createdAt),
          timeOnly(o.createdAt),
          timeOnly(o.paidAt),
          it.name || "Item",
          qty,
          reportNumber(unitPrice),
          reportNumber(qty * unitPrice)
        ]);
      });
    });

    return rows;
  }

  function buildAdRows(data) {
    const rows = [
      ["Ad ID", "Title", "Restaurant", "Enabled", "Impressions"]
    ];

    const impressions = safeObj(data.adMetrics?.impressions);

    safeArr(data.ads).forEach((ad) => {
      rows.push([
        ad.id || "",
        ad.title || "",
        ad.restaurantId
          ? restaurantNameById(data.restaurants, ad.restaurantId)
          : "All Restaurants",
        ad.enabled ? "Yes" : "No",
        Number(impressions[ad.id] || 0)
      ]);
    });

    return rows;
  }

  function buildLogRows(data) {
    const rows = [
      ["Time", "Message"]
    ];

    safeArr(data.logs).forEach((log) => {
      rows.push([
        log.at ? new Date(log.at).toLocaleString() : "",
        log.message || ""
      ]);
    });

    return rows;
  }

  function exportAdminReport(data) {
    if (typeof XLSX === "undefined") {
      alert("XLSX library is not loaded.");
      return false;
    }

    const now = new Date();
    const monthOrders = safeArr(data.orders).filter((o) => isSameMonth(o.createdAt, now));
    const paidOrders = monthOrders.filter((o) => paidReportStatus(o.status));

    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalSubtotal = paidOrders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
    const totalTax = paidOrders.reduce((sum, o) => sum + Number(o.tax || 0), 0);

    const dineInCount = paidOrders.filter((o) => o.serviceType === "dine_in").length;
    const takeawayCount = paidOrders.filter((o) => o.serviceType === "takeaway").length;
    const notMarkedCount = paidOrders.filter((o) => !o.serviceType).length;

    const itemSummaryRows = buildItemSummaryRows(data.restaurants, paidOrders);
    const bestSeller = itemSummaryRows[1]?.[1] || "—";

    const summaryRows = [
      ["Food Court Admin Monthly Report"],
      [`Month: ${monthTitle(now)}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ["Executive Summary"],
      ["Total Restaurants", safeArr(data.restaurants).length],
      ["Total Orders This Month", monthOrders.length],
      ["Paid / Active Orders", paidOrders.length],
      ["Total Subtotal", reportNumber(totalSubtotal)],
      ["Total Tax", reportNumber(totalTax)],
      ["Total Revenue", reportNumber(totalRevenue)],
      ["Dine In Orders", dineInCount],
      ["Takeaway Orders", takeawayCount],
      ["Not Marked Orders", notMarkedCount],
      ["Best Seller", bestSeller],
      [],
      ["Restaurant Ranking"],
      ["Restaurant", "Revenue", "Paid Orders", "Dine In", "Takeaway"]
    ];

    const ranking = safeArr(data.restaurants).map((r) => {
      const restPaid = paidOrders.filter((o) => o.restaurantId === r.id);
      return {
        restaurant: r.name || r.id,
        revenue: restPaid.reduce((sum, o) => sum + Number(o.total || 0), 0),
        orders: restPaid.length,
        dine_in: restPaid.filter((o) => o.serviceType === "dine_in").length,
        takeaway: restPaid.filter((o) => o.serviceType === "takeaway").length
      };
    }).sort((a, b) => b.revenue - a.revenue);

    ranking.forEach((r) => {
      summaryRows.push([
        r.restaurant,
        reportNumber(r.revenue),
        r.orders,
        r.dine_in,
        r.takeaway
      ]);
    });

    const restaurantRows = buildRestaurantReportRows(data.restaurants, monthOrders);
    const orderRows = buildOrderRows(data.restaurants, monthOrders);
    const orderLineRows = buildOrderLineRows(data.restaurants, monthOrders);
    const adRows = buildAdRows(data);
    const logRows = buildLogRows(data);

    const wb = XLSX.utils.book_new();

    const summarySheet = createSheet(
      summaryRows,
      [28, 18, 18, 16, 16, 16, 16, 16, 16, 16],
      ranking.length ? `A18:E${17 + ranking.length}` : undefined
    );
    addMerge(summarySheet, 0, 0, 0, 9);
    addMerge(summarySheet, 1, 0, 1, 9);
    addMerge(summarySheet, 2, 0, 2, 9);

    const restaurantSheet = createSheet(
      restaurantRows,
      [22, 12, 14, 18, 12, 12, 12, 14, 14, 14, 28],
      `A1:K${restaurantRows.length}`
    );

    const ordersSheet = createSheet(
      orderRows,
      [22, 20, 16, 15, 14, 22, 14, 14, 14, 14, 16, 12, 12, 12, 50, 14, 14],
      `A1:Q${orderRows.length}`
    );

    const orderLinesSheet = createSheet(
      orderLineRows,
      [22, 20, 16, 15, 14, 22, 14, 14, 14, 28, 8, 12, 12],
      `A1:M${orderLineRows.length}`
    );

    const itemSheet = createSheet(
      itemSummaryRows,
      [20, 28, 14, 14, 14],
      `A1:E${itemSummaryRows.length}`
    );

    const adSheet = createSheet(
      adRows,
      [16, 30, 22, 12, 14],
      `A1:E${adRows.length}`
    );

    const logSheet = createSheet(
      logRows,
      [24, 80],
      `A1:B${logRows.length}`
    );

    XLSX.utils.book_append_sheet(wb, summarySheet, "Executive Summary");
    XLSX.utils.book_append_sheet(wb, restaurantSheet, "Restaurant Summary");
    XLSX.utils.book_append_sheet(wb, ordersSheet, "All Orders");
    XLSX.utils.book_append_sheet(wb, orderLinesSheet, "Order Lines");
    XLSX.utils.book_append_sheet(wb, itemSheet, "Item Summary");
    XLSX.utils.book_append_sheet(wb, adSheet, "Ad Metrics");
    XLSX.utils.book_append_sheet(wb, logSheet, "System Logs");

    XLSX.writeFile(wb, `FoodCourt_Admin_Monthly_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    return true;
  }

  // ---------- Upgraded Admin Excel Report v2: payment, cash/online, dine-in/takeaway, add-ons ----------
  function advNormalizePaymentMethod(value) {
    const v = String(value || "").trim().toLowerCase();

    if (v === "cash" || v === "cod" || v === "counter" || v.includes("cash")) return "cash";
    if (v === "online" || v === "stripe" || v === "card" || v === "qr" || v.includes("stripe")) return "online";

    return "online";
  }

  function advPaymentMethodOf(order) {
    const payment = safeObj(order?.payment);
    return advNormalizePaymentMethod(
      order?.paymentMethod ||
      order?.payment_method ||
      payment.paymentMethod ||
      payment.method ||
      payment.provider ||
      "online"
    );
  }

  function advPaymentMethodLabel(order) {
    const method = advPaymentMethodOf(order);
    if (method === "cash") return "Cash";
    if (method === "online") return "Online / Stripe";
    return "Not selected";
  }

  function advPaymentStatusLabel(order) {
    const status = String(order?.status || "").toLowerCase();
    const payment = safeObj(order?.payment);
    const method = advPaymentMethodOf(order);

    if (payment.success || paidReportStatus(status)) return "Paid";
    if (status === "awaiting_payment") return method === "cash" ? "Cash Pending" : "Online Pending";
    if (status === "pending_approval") return "Pending Approval";
    if (status === "approved") return "Approved - Payment Pending";
    if (status === "rejected") return "Rejected";

    return status || "Unknown";
  }

  function advItemBaseName(item) {
    const raw = String(item?.originalName || item?.baseName || item?.name || "Item").trim();
    return raw.replace(/\s*\(\+\s*[^)]+\)\s*$/i, "").trim() || raw;
  }

  function advAddonListFromItem(item) {
    const explicit = safeArr(item?.addons || item?.selectedAddons || item?.selected_addons || item?.options)
      .map((addon) => {
        const a = safeObj(addon);
        const name = String(a.name || a.title || a.label || "").trim();
        if (!name) return null;
        return {
          name,
          price: Number(a.price || 0),
          qty: Math.max(1, Number(a.qty || a.quantity || 1))
        };
      })
      .filter(Boolean);

    if (explicit.length) return explicit;

    const name = String(item?.name || "");
    const match = name.match(/\(\+\s*([^)]+)\)/i);
    if (!match) return [];

    return match[1]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((name) => ({ name, price: 0, qty: 1 }));
  }

  function advItemAddonSummary(item) {
    const addons = advAddonListFromItem(item);
    if (!addons.length) return "";

    return addons
      .map((addon) => {
        const qty = Number(addon.qty || 1);
        const price = Number(addon.price || 0);
        const qtyText = qty > 1 ? ` x${qty}` : "";
        const priceText = price > 0 ? ` (${reportNumber(price)})` : "";
        return `${addon.name}${qtyText}${priceText}`;
      })
      .join(", ");
  }

  function advOrderAddonSummary(order) {
    const rows = [];

    safeArr(order?.items).forEach((item) => {
      const addText = advItemAddonSummary(item);
      if (addText) rows.push(`${advItemBaseName(item)}: ${addText}`);
    });

    return rows.join(" | ");
  }

  function advItemsSummary(order) {
    return safeArr(order?.items)
      .map((it) => {
        const qty = Number(it.qty || 0);
        const addText = advItemAddonSummary(it);
        return `${advItemBaseName(it)}${addText ? ` (+ ${addText})` : ""} x${qty}`;
      })
      .join(" | ");
  }

  function advBuildPaymentSummaryRows(orders) {
    const groups = {
      cash: { method: "Cash", orders: 0, subtotal: 0, tax: 0, revenue: 0 },
      online: { method: "Online / Stripe", orders: 0, subtotal: 0, tax: 0, revenue: 0 }
    };

    safeArr(orders).forEach((order) => {
      const key = advPaymentMethodOf(order) === "cash" ? "cash" : "online";
      groups[key].orders += 1;
      groups[key].subtotal += Number(order.subtotal || 0);
      groups[key].tax += Number(order.tax || 0);
      groups[key].revenue += Number(order.total || 0);
    });

    const rows = [["Payment Method", "Orders", "Subtotal", "Tax", "Revenue"]];
    Object.values(groups).forEach((g) => {
      rows.push([g.method, g.orders, reportNumber(g.subtotal), reportNumber(g.tax), reportNumber(g.revenue)]);
    });

    return rows;
  }

  function advBuildStatusSummaryRows(orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      const status = String(order.status || "unknown");
      if (!stats[status]) {
        stats[status] = { status, orders: 0, revenue: 0 };
      }

      stats[status].orders += 1;
      stats[status].revenue += Number(order.total || 0);
    });

    const rows = [["Status", "Orders", "Total Amount"]];
    Object.values(stats)
      .sort((a, b) => b.orders - a.orders)
      .forEach((s) => rows.push([s.status, s.orders, reportNumber(s.revenue)]));

    return rows;
  }

  function advBuildDailyRows(orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      const day = dateOnly(order.createdAt);
      if (!day) return;

      if (!stats[day]) {
        stats[day] = {
          date: day,
          orders: 0,
          paid: 0,
          cash: 0,
          online: 0,
          dine_in: 0,
          takeaway: 0,
          tax: 0,
          revenue: 0
        };
      }

      const s = stats[day];
      s.orders += 1;
      if (paidReportStatus(order.status)) s.paid += 1;
      if (advPaymentMethodOf(order) === "cash") s.cash += 1;
      else s.online += 1;
      if (order.serviceType === "dine_in") s.dine_in += 1;
      if (order.serviceType === "takeaway") s.takeaway += 1;
      s.tax += Number(order.tax || 0);
      s.revenue += Number(order.total || 0);
    });

    const rows = [["Date", "Orders", "Paid / Active", "Cash", "Online", "Dine In", "Takeaway", "Tax", "Revenue"]];
    Object.values(stats)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach((d) => {
        rows.push([
          d.date,
          d.orders,
          d.paid,
          d.cash,
          d.online,
          d.dine_in,
          d.takeaway,
          reportNumber(d.tax),
          reportNumber(d.revenue)
        ]);
      });

    return rows;
  }

  function advBuildAddonRows(restaurants, orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      const restaurant = restaurantNameById(restaurants, order.restaurantId);

      safeArr(order.items).forEach((item) => {
        const addons = advAddonListFromItem(item);
        if (!addons.length) return;

        addons.forEach((addon) => {
          const key = `${restaurant}__${addon.name}`;
          const itemQty = Number(item.qty || 0);
          const addonQty = Number(addon.qty || 1) * itemQty;
          const relatedSales = Number(item.price || 0) * itemQty;

          if (!stats[key]) {
            stats[key] = {
              restaurant,
              addon: addon.name,
              addon_qty: 0,
              order_lines: 0,
              related_sales: 0
            };
          }

          stats[key].addon_qty += addonQty;
          stats[key].order_lines += 1;
          stats[key].related_sales += relatedSales;
        });
      });
    });

    const rows = [["Restaurant", "Add-on", "Addon Qty", "Order Lines", "Related Item Sales"]];
    Object.values(stats)
      .sort((a, b) => b.addon_qty - a.addon_qty)
      .forEach((x) => {
        rows.push([
          x.restaurant,
          x.addon,
          x.addon_qty,
          x.order_lines,
          reportNumber(x.related_sales)
        ]);
      });

    return rows;
  }

  function advBuildRestaurantRows(restaurants, orders) {
    const rows = [[
      "Restaurant",
      "Online",
      "Total Orders",
      "Paid / Active Orders",
      "Cash Orders",
      "Online Orders",
      "Dine In",
      "Takeaway",
      "Not Marked",
      "Subtotal",
      "Tax",
      "Revenue",
      "Best Seller"
    ]];

    safeArr(restaurants).forEach((r) => {
      const restOrders = safeArr(orders).filter((o) => o.restaurantId === r.id);
      const paid = restOrders.filter((o) => paidReportStatus(o.status));

      const itemCounts = {};
      paid.forEach((o) => {
        safeArr(o.items).forEach((it) => {
          const name = advItemBaseName(it) || "Unknown";
          itemCounts[name] = (itemCounts[name] || 0) + Number(it.qty || 0);
        });
      });

      const bestSeller = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      rows.push([
        r.name || r.id,
        r.online ? "Online" : "Offline",
        restOrders.length,
        paid.length,
        paid.filter((o) => advPaymentMethodOf(o) === "cash").length,
        paid.filter((o) => advPaymentMethodOf(o) !== "cash").length,
        paid.filter((o) => o.serviceType === "dine_in").length,
        paid.filter((o) => o.serviceType === "takeaway").length,
        paid.filter((o) => !o.serviceType).length,
        reportNumber(paid.reduce((sum, o) => sum + Number(o.subtotal || 0), 0)),
        reportNumber(paid.reduce((sum, o) => sum + Number(o.tax || 0), 0)),
        reportNumber(paid.reduce((sum, o) => sum + Number(o.total || 0), 0)),
        bestSeller
      ]);
    });

    return rows;
  }

  function advBuildItemRows(restaurants, orders) {
    const stats = {};

    safeArr(orders).forEach((order) => {
      safeArr(order.items).forEach((item) => {
        const restaurant = restaurantNameById(restaurants, order.restaurantId);
        const itemName = advItemBaseName(item);
        const key = `${restaurant}__${itemName}`;
        const qty = Number(item.qty || 0);
        const unitPrice = Number(item.price || 0);
        const lineTotal = qty * unitPrice;

        if (!stats[key]) {
          stats[key] = {
            restaurant,
            item: itemName,
            total_qty: 0,
            total_sales: 0,
            order_lines: 0
          };
        }

        stats[key].total_qty += qty;
        stats[key].total_sales += lineTotal;
        stats[key].order_lines += 1;
      });
    });

    const rows = [["Restaurant", "Item", "Total Qty Sold", "Total Sales", "Order Lines"]];
    Object.values(stats)
      .sort((a, b) => b.total_sales - a.total_sales)
      .forEach((it) => rows.push([it.restaurant, it.item, it.total_qty, reportNumber(it.total_sales), it.order_lines]));

    return rows;
  }

  function advBuildOrderRows(restaurants, orders) {
    const rows = [[
      "Order ID",
      "Restaurant",
      "Status",
      "Payment Method",
      "Payment Status",
      "Service Type",
      "Table Number",
      "Order Type",
      "Order Date",
      "Order Placed",
      "Approved At",
      "Paid At",
      "Prep Time (min)",
      "Subtotal",
      "Tax",
      "Total",
      "Items Summary",
      "Add-ons Summary",
      "Total Dish Qty",
      "Unique Dishes"
    ]];

    safeArr(orders).forEach((o) => {
      rows.push([
        o.id,
        restaurantNameById(restaurants, o.restaurantId),
        o.status || "",
        advPaymentMethodLabel(o),
        advPaymentStatusLabel(o),
        serviceTypeLabel(o),
        tableNumberOf(o),
        serviceSummary(o),
        dateOnly(o.createdAt),
        timeOnly(o.createdAt),
        timeOnly(o.approvedAt),
        timeOnly(o.paidAt),
        prepMinutes(o),
        reportNumber(o.subtotal),
        reportNumber(o.tax),
        reportNumber(o.total),
        advItemsSummary(o),
        advOrderAddonSummary(o),
        totalDishQty(o),
        uniqueDishCount(o)
      ]);
    });

    return rows;
  }

  function advBuildOrderLineRows(restaurants, orders) {
    const rows = [[
      "Order ID",
      "Restaurant",
      "Status",
      "Payment Method",
      "Payment Status",
      "Service Type",
      "Table Number",
      "Order Type",
      "Order Date",
      "Placed At",
      "Paid At",
      "Base Dish",
      "Dish Display Name",
      "Add-ons",
      "Qty",
      "Unit Price",
      "Line Total"
    ]];

    safeArr(orders).forEach((o) => {
      safeArr(o.items).forEach((it) => {
        const qty = Number(it.qty || 0);
        const unitPrice = Number(it.price || 0);

        rows.push([
          o.id,
          restaurantNameById(restaurants, o.restaurantId),
          o.status || "",
          advPaymentMethodLabel(o),
          advPaymentStatusLabel(o),
          serviceTypeLabel(o),
          tableNumberOf(o),
          serviceSummary(o),
          dateOnly(o.createdAt),
          timeOnly(o.createdAt),
          timeOnly(o.paidAt),
          advItemBaseName(it),
          it.name || "Item",
          advItemAddonSummary(it),
          qty,
          reportNumber(unitPrice),
          reportNumber(qty * unitPrice)
        ]);
      });
    });

    return rows;
  }

  function exportAdminReport(data) {
    if (typeof XLSX === "undefined") {
      alert("XLSX library is not loaded.");
      return false;
    }

    const now = new Date();
    const monthOrders = safeArr(data.orders).filter((o) => isSameMonth(o.createdAt, now));
    const paidOrders = monthOrders.filter((o) => paidReportStatus(o.status));

    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalSubtotal = paidOrders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
    const totalTax = paidOrders.reduce((sum, o) => sum + Number(o.tax || 0), 0);

    const cashOrders = paidOrders.filter((o) => advPaymentMethodOf(o) === "cash");
    const onlineOrders = paidOrders.filter((o) => advPaymentMethodOf(o) !== "cash");
    const dineInCount = paidOrders.filter((o) => o.serviceType === "dine_in").length;
    const takeawayCount = paidOrders.filter((o) => o.serviceType === "takeaway").length;
    const notMarkedCount = paidOrders.filter((o) => !o.serviceType).length;

    const itemRowsForBest = advBuildItemRows(data.restaurants, paidOrders);
    const bestSeller = itemRowsForBest[1]?.[1] || "—";

    const summaryRows = [
      ["Food Court Admin Monthly Report"],
      [`Month: ${monthTitle(now)}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ["Executive Summary"],
      ["Total Restaurants", safeArr(data.restaurants).length],
      ["Total Orders This Month", monthOrders.length],
      ["Paid / Active Orders", paidOrders.length],
      ["Cash Orders", cashOrders.length],
      ["Online Orders", onlineOrders.length],
      ["Total Subtotal", reportNumber(totalSubtotal)],
      ["Total Tax", reportNumber(totalTax)],
      ["Total Revenue", reportNumber(totalRevenue)],
      ["Cash Revenue", reportNumber(cashOrders.reduce((sum, o) => sum + Number(o.total || 0), 0))],
      ["Online Revenue", reportNumber(onlineOrders.reduce((sum, o) => sum + Number(o.total || 0), 0))],
      ["Dine In Orders", dineInCount],
      ["Takeaway Orders", takeawayCount],
      ["Not Marked Orders", notMarkedCount],
      ["Best Seller", bestSeller],
      [],
      ["Restaurant Ranking"],
      ["Restaurant", "Revenue", "Paid Orders", "Cash", "Online", "Dine In", "Takeaway"]
    ];

    const ranking = safeArr(data.restaurants).map((r) => {
      const restPaid = paidOrders.filter((o) => o.restaurantId === r.id);
      return {
        restaurant: r.name || r.id,
        revenue: restPaid.reduce((sum, o) => sum + Number(o.total || 0), 0),
        orders: restPaid.length,
        cash: restPaid.filter((o) => advPaymentMethodOf(o) === "cash").length,
        online: restPaid.filter((o) => advPaymentMethodOf(o) !== "cash").length,
        dine_in: restPaid.filter((o) => o.serviceType === "dine_in").length,
        takeaway: restPaid.filter((o) => o.serviceType === "takeaway").length
      };
    }).sort((a, b) => b.revenue - a.revenue);

    ranking.forEach((r) => {
      summaryRows.push([
        r.restaurant,
        reportNumber(r.revenue),
        r.orders,
        r.cash,
        r.online,
        r.dine_in,
        r.takeaway
      ]);
    });

    const wb = XLSX.utils.book_new();

    const summarySheet = createSheet(summaryRows, [28, 18, 18, 14, 14, 14, 14, 14, 14, 14], ranking.length ? `A22:G${21 + ranking.length}` : undefined);
    addMerge(summarySheet, 0, 0, 0, 9);
    addMerge(summarySheet, 1, 0, 1, 9);
    addMerge(summarySheet, 2, 0, 2, 9);

    const dailyRows = advBuildDailyRows(monthOrders);
    const restaurantRows = advBuildRestaurantRows(data.restaurants, monthOrders);
    const orderRows = advBuildOrderRows(data.restaurants, monthOrders);
    const orderLineRows = advBuildOrderLineRows(data.restaurants, monthOrders);
    const itemRows = advBuildItemRows(data.restaurants, paidOrders);
    const addonRows = advBuildAddonRows(data.restaurants, paidOrders);
    const paymentRows = advBuildPaymentSummaryRows(paidOrders);
    const statusRows = advBuildStatusSummaryRows(monthOrders);
    const adRows = buildAdRows(data);
    const logRows = buildLogRows(data);

    XLSX.utils.book_append_sheet(wb, summarySheet, "Executive Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(dailyRows, [14, 10, 14, 10, 10, 10, 10, 12, 14], `A1:I${dailyRows.length}`), "Daily Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(restaurantRows, [24, 12, 14, 18, 12, 12, 10, 10, 12, 14, 14, 14, 30], `A1:M${restaurantRows.length}`), "Restaurant Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(orderRows, [22, 20, 16, 16, 18, 15, 14, 22, 14, 14, 14, 14, 16, 12, 12, 12, 55, 45, 14, 14], `A1:T${orderRows.length}`), "All Orders");
    XLSX.utils.book_append_sheet(wb, createSheet(orderLineRows, [22, 20, 16, 16, 18, 15, 14, 22, 14, 14, 14, 28, 34, 35, 8, 12, 12], `A1:Q${orderLineRows.length}`), "Order Lines");
    XLSX.utils.book_append_sheet(wb, createSheet(itemRows, [20, 30, 14, 14, 14], `A1:E${itemRows.length}`), "Item Sales");
    XLSX.utils.book_append_sheet(wb, createSheet(addonRows, [20, 28, 14, 14, 18], `A1:E${addonRows.length}`), "Add-ons Sales");
    XLSX.utils.book_append_sheet(wb, createSheet(paymentRows, [20, 12, 14, 14, 14], `A1:E${paymentRows.length}`), "Payment Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(statusRows, [20, 12, 14], `A1:C${statusRows.length}`), "Status Summary");
    XLSX.utils.book_append_sheet(wb, createSheet(adRows, [16, 30, 22, 12, 14], `A1:E${adRows.length}`), "Ad Metrics");
    XLSX.utils.book_append_sheet(wb, createSheet(logRows, [24, 80], `A1:B${logRows.length}`), "System Logs");

    XLSX.writeFile(wb, `FoodCourt_Admin_Monthly_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    return true;
  }

  async function exportAll() {
    const data = await getDashboardData();

    try {
      exportAdminReport(data);
      logSafe("Admin monthly report exported (XLSX download).");
    } catch (err) {
      console.error("admin.js: export failed", err);
      logSafe("Admin XLSX export failed. Check console.");
      alert("Export failed. Check console for details.");
    }
  }

  async function renderAll() {
    if (!loggedIn) return;

    if (isRendering) {
      rerenderRequested = true;
      return;
    }

    isRendering = true;

    try {
      const data = await getDashboardData();
      renderMetrics(data);
      await renderRestaurants(data);
      renderAnalytics(data);
      renderAds(data);
      renderLogs(data);
    } catch (err) {
      console.error("admin.js renderAll failed", err);
      if (logPanel) {
        logPanel.innerHTML = `
          <div class="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-200">
            Admin panel render failed. Check console for details.
          </div>
        `;
      }
    } finally {
      isRendering = false;

      if (rerenderRequested) {
        rerenderRequested = false;
        renderAll();
      }
    }
  }

  if (exportAllBtn) {
    exportAllBtn.onclick = async () => {
      await exportAll();
    };
  }

  if (resetAdsBtn) {
    resetAdsBtn.onclick = async () => {
      try {
        if (typeof FC.resetAdMetrics === "function") {
          FC.resetAdMetrics();
        } else {
          const st = getStateSafe();
          st.adMetrics = { impressions: {}, totalSeconds: 0 };
          saveStateSafe(st);
          logSafe("Ad metrics reset.");
        }
      } catch (err) {
        console.error("admin.js: reset ads failed", err);
      }

      await renderAll();
    };
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem(sessKey);
      loggedIn = false;
      showLogin();
    };
  }

  if (loginBtn) {
    loginBtn.onclick = async () => {
      if (loginErr) loginErr.textContent = "";

      const u = (userInput?.value || "").trim();
      const p = (passInput?.value || "").trim();

      if (!u || !p) {
        if (loginErr) loginErr.textContent = "Enter username and password.";
        return;
      }

      const users = await loadUsers();
      const ok = safeArr(users.admins).find((x) => x.username === u && x.password === p);

      if (!ok) {
        if (loginErr) loginErr.textContent = "Invalid credentials.";
        return;
      }

      loggedIn = true;
      localStorage.setItem(sessKey, JSON.stringify({ loggedIn: true, at: nowISO() }));
      await showApp();
    };
  }

  [userInput, passInput].forEach((input) => {
    input?.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && loginBtn) {
        e.preventDefault();
        await loginBtn.onclick();
      }
    });
  });

  if (loggedIn) {
    await showApp();
  } else {
    showLogin();
  }

  setInterval(() => {
    if (loggedIn) renderAll();
  }, 1400);

  window.addEventListener("focus", () => {
    if (loggedIn) renderAll();
  });

  window.addEventListener("fc:state-changed", () => {
    if (loggedIn) renderAll();
  });
})();