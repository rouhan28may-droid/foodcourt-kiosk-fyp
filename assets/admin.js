
(async function(){
  await FC.seed();

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

  // session
  const sessKey = "fc_admin_session";
  const sess = JSON.parse(localStorage.getItem(sessKey) || "{}");
  let loggedIn = !!sess.loggedIn;

  async function loadUsers(){
    return fetch("data/users.json").then(r=>r.json());
  }

  function showApp(){
    loginBox.classList.add("hidden");
    appBox.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    renderAll();
  }
  function showLogin(){
    loginBox.classList.remove("hidden");
    appBox.classList.add("hidden");
    logoutBtn.classList.add("hidden");
  }

  function renderMetrics(){
    const a = FC.analytics();
    mRevenue.textContent = FC.money(a.revenue);
    mOrders.textContent = a.ordersTodayCount;
    mPeak.textContent = a.peakHour;
    mPayRate.textContent = a.payRate + "%";
  }

  function renderRestaurants(){
    const s = FC.getState();
    restaurantsPanel.innerHTML = "";
    for(const r of s.restaurants){
      const div = document.createElement("div");
      div.className = "p-4 rounded-2xl bg-white/5 border border-white/10";
      const sold = s.orders
        .filter(o => o.restaurantId===r.id && FC.isToday(o.createdAt) && !["pending_approval","rejected","awaiting_payment"].includes(o.status))
        .reduce((sum,o)=>sum+o.total,0);

      div.innerHTML = `
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="font-semibold">${r.name}</div>
            <div class="text-xs text-slate-400 mt-1">${r.tagline}</div>
            <div class="text-sm text-slate-300 mt-2">Sales today: <span class="pill">${FC.money(sold)}</span></div>
          </div>
          <div class="flex items-center gap-2">
            <span class="pill ${r.online ? "badge-green" : "badge-red"}">${r.online ? "ONLINE" : "OFFLINE"}</span>
            <button class="btn-ghost text-sm" data-toggle>Toggle</button>
          </div>
        </div>
        <div class="mt-4">
          <div class="text-xs text-slate-400 uppercase tracking-widest">Availability</div>
          <div class="mt-2 grid sm:grid-cols-2 gap-2">
            ${r.menu.slice(0,6).map(m=>`
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
      div.querySelector("[data-toggle]").onclick = ()=>{
        FC.toggleRestaurantOnline(r.id);
        renderAll();
      };
      div.querySelectorAll("[data-item]").forEach(btn=>{
        btn.onclick = ()=>{
          FC.toggleMenuItem(r.id, btn.getAttribute("data-item"));
          renderAll();
        };
      });

      restaurantsPanel.appendChild(div);
    }
  }

  function renderAnalytics(){
    const s = FC.getState();
    const paidToday = s.orders.filter(o => FC.isToday(o.createdAt) && !["pending_approval","rejected","awaiting_payment"].includes(o.status));

    // restaurant ranking
    const byRest = {};
    paidToday.forEach(o => {
      byRest[o.restaurantId] = (byRest[o.restaurantId] || 0) + o.total;
    });
    const ranking = Object.entries(byRest).sort((a,b)=>b[1]-a[1]).map(([rid, rev])=>{
      const rn = s.restaurants.find(r=>r.id===rid)?.name || rid;
      return { restaurant: rn, revenue: rev };
    });

    // item popularity
    const itemCounts = {};
    paidToday.forEach(o=>{
      o.items.forEach(it=>{
        itemCounts[it.name] = (itemCounts[it.name] || 0) + it.qty;
      });
    });
    const topItems = Object.entries(itemCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name, qty])=>({ item:name, qty }));

    // idle ads revenue analysis (simulated)
    const adImpressions = Object.entries(s.adMetrics.impressions || {}).map(([adId, count])=>{
      const ad = s.ads.find(x=>x.id===adId);
      return { ad: ad?.title || adId, impressions: count };
    }).sort((a,b)=>b.impressions-a.impressions);

    analyticsPanel.innerHTML = `
      <div class="grid sm:grid-cols-2 gap-4">
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-sm font-semibold">Restaurant Ranking (Revenue)</div>
          <div class="mt-3 space-y-2 text-sm">
            ${ranking.length? ranking.map(x=>`<div class="flex justify-between text-slate-300"><span>${x.restaurant}</span><span>${FC.money(x.revenue)}</span></div>`).join("") : `<div class="text-slate-400 text-sm">No paid orders today.</div>`}
          </div>
        </div>
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-sm font-semibold">Top Items (Qty)</div>
          <div class="mt-3 space-y-2 text-sm">
            ${topItems.length? topItems.map(x=>`<div class="flex justify-between text-slate-300"><span>${x.item}</span><span>${x.qty}</span></div>`).join("") : `<div class="text-slate-400 text-sm">No sales yet.</div>`}
          </div>
        </div>
      </div>

      <div class="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10">
        <div class="text-sm font-semibold">Ad Impressions</div>
        <div class="mt-3 space-y-2 text-sm">
          ${adImpressions.length? adImpressions.map(x=>`<div class="flex justify-between text-slate-300"><span>${x.ad}</span><span>${x.impressions}</span></div>`).join("") : `<div class="text-slate-400 text-sm">No impressions tracked yet.</div>`}
        </div>
      </div>
    `;
  }

  function renderAds(){
    const s = FC.getState();
    adsPanel.innerHTML = "";
    for(const ad of s.ads){
      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-white/5 border border-white/10";
      const count = s.adMetrics.impressions?.[ad.id] || 0;
      const rest = ad.restaurantId ? (s.restaurants.find(r=>r.id===ad.restaurantId)?.name || ad.restaurantId) : "All";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold truncate">${ad.title}</div>
            <div class="text-xs text-slate-400 mt-1">${rest} • ${ad.enabled ? "Enabled" : "Disabled"}</div>
            <div class="text-xs text-slate-300 mt-2">Impressions: <span class="pill">${count}</span></div>
          </div>
          <button class="${ad.enabled ? "btn-ghost" : "btn-primary"} text-xs px-3 py-2" data-toggle>
            ${ad.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      `;
      div.querySelector("[data-toggle]").onclick = ()=>{
        const st = FC.getState();
        const i = st.ads.findIndex(x=>x.id===ad.id);
        st.ads[i].enabled = !st.ads[i].enabled;
        FC.setState(st);
        FC.log(`Ad ${ad.id} enabled=${st.ads[i].enabled}`);
        renderAll();
      };
      adsPanel.appendChild(div);
    }
  }

  function renderLogs(){
    const s = FC.getState();
    logPanel.innerHTML = "";
    (s.logs || []).forEach(l=>{
      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300";
      div.innerHTML = `<div class="text-slate-400">${new Date(l.at).toLocaleTimeString()}</div><div class="mt-1">${l.message}</div>`;
      logPanel.appendChild(div);
    });
    if(!(s.logs||[]).length){
      logPanel.innerHTML = `<div class="text-sm text-slate-400">No log entries yet.</div>`;
    }
  }

  exportAllBtn.onclick = ()=>{
    const s = FC.getState();
    const sheets = [];
    // Overall orders today
    const ordersToday = s.orders.filter(o => FC.isToday(o.createdAt));
    sheets.push({ name:"All_Orders_Today", rows: ordersToday.map(o=>({
      order_id: o.id,
      restaurant: s.restaurants.find(r=>r.id===o.restaurantId)?.name || o.restaurantId,
      status: o.status,
      total: o.total,
      created_at: o.createdAt,
      paid_at: o.paidAt || ""
    }))});

    // Each restaurant
    s.restaurants.forEach(r=>{
      const rows = ordersToday.filter(o=>o.restaurantId===r.id).map(o=>({
        order_id: o.id, status: o.status, total: o.total, created_at: o.createdAt, paid_at: o.paidAt || ""
      }));
      sheets.push({ name: r.name.replace(/\s+/g,"_").slice(0,31), rows });
    });

    FC.downloadXLSX("FoodCourt_AllReports_Today.xlsx", sheets);
    FC.log("All reports exported (XLSX download).");
  };

  resetAdsBtn.onclick = ()=>{
    FC.resetAdMetrics();
    renderAll();
  };

  logoutBtn.onclick = ()=>{
    localStorage.removeItem(sessKey);
    loggedIn = false;
    showLogin();
  };

  loginBtn.onclick = async ()=>{
    loginErr.textContent = "";
    const u = userInput.value.trim();
    const p = passInput.value.trim();
    const users = await loadUsers();
    const ok = users.admins.find(x=>x.username===u && x.password===p);
    if(!ok){
      loginErr.textContent = "Invalid credentials.";
      return;
    }
    loggedIn = true;
    localStorage.setItem(sessKey, JSON.stringify({ loggedIn:true }));
    showApp();
  };

  function renderAll(){
    renderMetrics();
    renderRestaurants();
    renderAnalytics();
    renderAds();
    renderLogs();
  }

  if(loggedIn) showApp();
  else showLogin();

  setInterval(()=>{
    if(!loggedIn) return;
    renderAll();
  }, 1400);
 window.addEventListener("fc:state-changed", () => {
  if (loggedIn) renderAll();
});
})();
