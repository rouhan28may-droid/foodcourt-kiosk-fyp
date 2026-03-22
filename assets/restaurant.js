
(async function(){
  await FC.seed();

  const loginBox = document.getElementById("loginBox");
  const appBox = document.getElementById("appBox");
  const logoutBtn = document.getElementById("logoutBtn");

  const userInput = document.getElementById("userInput");
  const passInput = document.getElementById("passInput");
  const loginBtn = document.getElementById("loginBtn");
  const loginErr = document.getElementById("loginErr");

  const restName = document.getElementById("restName");
  const pendingList = document.getElementById("pendingList");
  const activeList = document.getElementById("activeList");
  const menuList = document.getElementById("menuList");
  const onlineLabel = document.getElementById("onlineLabel");
  const toggleOnlineBtn = document.getElementById("toggleOnlineBtn");
  const exportBtn = document.getElementById("exportBtn");
  const paidCount = document.getElementById("paidCount");
  const revenue = document.getElementById("revenue");
  const bestSeller = document.getElementById("bestSeller");

  // session
  const sessKey = "fc_restaurant_session";
  const sess = JSON.parse(localStorage.getItem(sessKey) || "{}");
  let restaurantId = sess.restaurantId || null;

  const saveSess = ()=>localStorage.setItem(sessKey, JSON.stringify({ restaurantId }));

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

  function getRestaurant(){
    const s = FC.getState();
    return s.restaurants.find(r => r.id === restaurantId);
  }

  function statusBadge(status){
    if(status==="pending_approval") return `<span class="pill badge-yellow">PENDING</span>`;
    if(status==="rejected") return `<span class="pill badge-red">REJECTED</span>`;
    if(status==="awaiting_payment") return `<span class="pill badge-yellow">AWAIT PAY</span>`;
    if(status==="paid" || status==="preparing" || status==="ready" || status==="completed") return `<span class="pill badge-green">${status.toUpperCase()}</span>`;
    return `<span class="pill">${status}</span>`;
  }

  function renderPending(){
    const orders = FC.ordersForRestaurant(restaurantId).filter(o => o.status==="pending_approval");
    pendingList.innerHTML = "";
    if(orders.length===0){
      pendingList.innerHTML = `<div class="text-sm text-slate-400">No pending approvals.</div>`;
      return;
    }

    for(const o of orders){
      const items = o.items.map(it=>`${it.name}×${it.qty}`).join(", ");
      const div = document.createElement("div");
      div.className = "p-4 rounded-2xl bg-white/5 border border-white/10";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="font-semibold">${o.id}</div>
            <div class="text-xs text-slate-400 mt-1">${new Date(o.createdAt).toLocaleTimeString()} • ${items}</div>
            <div class="text-sm text-slate-200 mt-2">Total: <span class="pill">${FC.money(o.total)}</span></div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button class="btn-primary text-sm" data-act="approve">Approve</button>
            <button class="btn-ghost text-sm" data-act="reject">Reject</button>
          </div>
        </div>
        <div class="mt-3 hidden" data-reject-box>
          <select class="tws-select" data-reason>
            <option value="Out of stock">Out of stock</option>
            <option value="Kitchen busy">Kitchen busy</option>
            <option value="Item unavailable">Item unavailable</option>
          </select>
          <button class="btn-primary mt-2 text-sm" data-act="confirm-reject">Confirm Reject</button>
        </div>
      `;
      const approveBtn = div.querySelector('[data-act="approve"]');
      const rejectBtn = div.querySelector('[data-act="reject"]');
      const rejBox = div.querySelector("[data-reject-box]");
      const reasonSel = div.querySelector("[data-reason]");
      const confirmReject = div.querySelector('[data-act="confirm-reject"]');

      approveBtn.onclick = ()=>{
        // manual approval
        FC.updateOrder(o.id, { status:"approved", approvedAt: FC.nowISO() });
        FC.log(`Order ${o.id} approved by restaurant.`);
        renderAll();
      };
      rejectBtn.onclick = ()=>{
        rejBox.classList.toggle("hidden");
      };
      confirmReject.onclick = ()=>{
        FC.updateOrder(o.id, { status:"rejected", rejectReason: reasonSel.value });
        FC.log(`Order ${o.id} rejected (${reasonSel.value}).`);
        renderAll();
      };

      pendingList.appendChild(div);
    }
  }

  function renderActive(){
    const orders = FC.ordersForRestaurant(restaurantId).filter(o => ["approved","awaiting_payment","paid","preparing","ready"].includes(o.status));
    activeList.innerHTML = "";
    if(orders.length===0){
      activeList.innerHTML = `<div class="text-sm text-slate-400">No active orders.</div>`;
      return;
    }

    for(const o of orders){
      const items = o.items.map(it=>`${it.name}×${it.qty}`).join(", ");
      const div = document.createElement("div");
      div.className = "p-4 rounded-2xl bg-white/5 border border-white/10";
      div.innerHTML = `
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="font-semibold">${o.id}</div>
              ${statusBadge(o.status)}
            </div>
            <div class="text-xs text-slate-400 mt-1">${items}</div>
            <div class="text-sm text-slate-200 mt-2">Total: <span class="pill">${FC.money(o.total)}</span></div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button class="btn-ghost text-sm" data-act="prep" ${o.status==="paid" ? "" : "disabled"}>Preparing</button>
            <button class="btn-ghost text-sm" data-act="ready" ${o.status==="preparing" ? "" : "disabled"}>Ready</button>
            <button class="btn-primary text-sm" data-act="done" ${o.status==="ready" ? "" : "disabled"}>Complete</button>
          </div>
        </div>
      `;

      const prep = div.querySelector('[data-act="prep"]');
      const ready = div.querySelector('[data-act="ready"]');
      const done = div.querySelector('[data-act="done"]');

      prep.onclick = ()=>{ FC.updateOrder(o.id, { status:"preparing" }); FC.log(`Order ${o.id} → preparing.`); renderAll(); };
      ready.onclick = ()=>{ FC.updateOrder(o.id, { status:"ready" }); FC.log(`Order ${o.id} → ready.`); renderAll(); };
      done.onclick = ()=>{ FC.updateOrder(o.id, { status:"completed" }); FC.log(`Order ${o.id} → completed.`); renderAll(); };

      activeList.appendChild(div);
    }
  }

  function renderMenu(){
    const r = getRestaurant();
    menuList.innerHTML = "";
    for(const m of r.menu){
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10";
      row.innerHTML = `
        <div class="min-w-0">
          <div class="font-semibold truncate">${m.name}</div>
          <div class="text-xs text-slate-400 mt-1">${m.category} • ${FC.money(m.price)}</div>
        </div>
        <button class="${m.available ? "btn-ghost" : "btn-primary"} text-xs px-3 py-2">
          ${m.available ? "Disable" : "Enable"}
        </button>
      `;
      row.querySelector("button").onclick = ()=>{
        FC.toggleMenuItem(r.id, m.id);
        renderAll();
      };
      menuList.appendChild(row);
    }
  }

  function renderSummary(){
    const r = getRestaurant();
    restName.textContent = r.name;
    onlineLabel.textContent = r.online ? "Yes" : "No";
    const a = FC.restaurantAnalytics(restaurantId);
    paidCount.textContent = a.paidCount;
    revenue.textContent = FC.money(a.revenue);
    bestSeller.textContent = a.bestSeller;
  }

  toggleOnlineBtn.onclick = ()=>{
    FC.toggleRestaurantOnline(restaurantId);
    renderAll();
  };

  exportBtn.onclick = ()=>{
    const s = FC.getState();
    const r = getRestaurant();
    const orders = s.orders.filter(o => o.restaurantId===restaurantId && FC.isToday(o.createdAt));
    const paid = orders.filter(o => !["pending_approval","rejected","awaiting_payment"].includes(o.status));

    const rows = paid.map(o => ({
      order_id: o.id,
      status: o.status,
      subtotal: o.subtotal,
      tax: o.tax,
      total: o.total,
      created_at: o.createdAt,
      paid_at: o.paidAt || ""
    }));

    const itemRows = [];
    paid.forEach(o=>{
      o.items.forEach(it=>{
        itemRows.push({
          order_id: o.id,
          item: it.name,
          qty: it.qty,
          unit_price: it.price,
          restaurant: r.name
        });
      });
    });

    FC.downloadXLSX(`${r.name.replace(/\s+/g,"_")}_Sales_Today.xlsx`, [
      { name: "Orders", rows },
      { name: "Items", rows: itemRows }
    ]);

    FC.log(`Sales report exported for ${r.name} (XLSX download).`);
  };

  function renderAll(){
    const r = getRestaurant();
    if(!r) return;
    renderSummary();
    renderPending();
    renderActive();
    renderMenu();
  }

  logoutBtn.onclick = ()=>{
    localStorage.removeItem(sessKey);
    restaurantId = null;
    showLogin();
  };

  loginBtn.onclick = async ()=>{
    loginErr.textContent = "";
    const u = userInput.value.trim();
    const p = passInput.value.trim();
    if(!u || !p){
      loginErr.textContent = "Enter username and password.";
      return;
    }
    const users = await loadUsers();
    const match = users.restaurants.find(x => x.username===u && x.password===p);
    if(!match){
      loginErr.textContent = "Invalid credentials.";
      return;
    }
    restaurantId = match.restaurantId;
    saveSess();
    showApp();
  };

  // existing session
  if(restaurantId){
    showApp();
  }else{
    showLogin();
  }

  // auto refresh
  setInterval(()=>{
    if(!restaurantId) return;
    renderAll();
  }, 1200);
window.addEventListener("fc:state-changed", () => {
  if (restaurantId) renderAll();
});
})();