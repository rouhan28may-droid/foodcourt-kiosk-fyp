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

  function normalizeOrder(order) {
    if (!order) return null;

    // Supabase row shape
    if ("restaurant_id" in order || "order_items" in order) {
      return {
        id: order.id,
        restaurantId: order.restaurant_id,
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
    return {
      id: order.id,
      restaurantId: order.restaurantId,
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

    return {
      revenue,
      ordersTodayCount: ordersToday.length,
      peakHour,
      payRate
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
      const sold = data.orders
        .filter((o) =>
          o.restaurantId === r.id &&
          isToday(o.createdAt) &&
          !["pending_approval", "rejected", "awaiting_payment"].includes(o.status)
        )
        .reduce((sum, o) => sum + Number(o.total || 0), 0);

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

  async function exportAll() {
    const data = await getDashboardData();

    if (typeof FC.downloadXLSX !== "function") {
      console.error("admin.js: FC.downloadXLSX is missing.");
      logSafe("XLSX export failed: download helper not loaded.");
      return;
    }

    const ordersToday = data.orders.filter((o) => isToday(o.createdAt));
    const sheets = [];

    sheets.push({
      name: "All_Orders_Today",
      rows: ordersToday.map((o) => ({
        order_id: o.id,
        restaurant: data.restaurants.find((r) => r.id === o.restaurantId)?.name || o.restaurantId,
        status: o.status,
        subtotal: o.subtotal,
        tax: o.tax,
        total: o.total,
        created_at: o.createdAt || "",
        approved_at: o.approvedAt || "",
        paid_at: o.paidAt || ""
      }))
    });

    data.restaurants.forEach((r) => {
      const rows = ordersToday
        .filter((o) => o.restaurantId === r.id)
        .map((o) => ({
          order_id: o.id,
          status: o.status,
          subtotal: o.subtotal,
          tax: o.tax,
          total: o.total,
          created_at: o.createdAt || "",
          approved_at: o.approvedAt || "",
          paid_at: o.paidAt || ""
        }));

      sheets.push({
        name: String(r.name || r.id || "Restaurant").replace(/\s+/g, "_").slice(0, 31),
        rows
      });
    });

    FC.downloadXLSX("FoodCourt_AllReports_Today.xlsx", sheets);
    logSafe("All reports exported (XLSX download).");
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