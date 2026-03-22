
/**
 * app.js
 * Shared helpers: formatting, totals, analytics
 */
window.FC = window.FC || {};

FC.money = function(amount){
  const s = FC.getState();
  return new Intl.NumberFormat("en-PK", { style:"currency", currency: s.settings.currency, maximumFractionDigits: 0 }).format(amount);
};

FC.computeTotals = function(items){
  const s = FC.getState();
  const subtotal = items.reduce((sum, it) => sum + (it.price * it.qty), 0);
  const tax = Math.round(subtotal * (s.settings.taxRate || 0));
  const total = subtotal + tax;
  return { subtotal, tax, total };
};

FC.groupBy = function(arr, keyFn){
  return arr.reduce((acc, x) => {
    const k = keyFn(x);
    acc[k] = acc[k] || [];
    acc[k].push(x);
    return acc;
  }, {});
};

FC.todayKey = function(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
};

FC.isToday = function(iso){
  if(!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
};

FC.analytics = function(){
  const s = FC.getState();
  const ordersToday = s.orders.filter(o => FC.isToday(o.createdAt));
  const paidToday = ordersToday.filter(o => o.status === "paid" || o.status==="preparing" || o.status==="ready" || o.status==="completed");
  const revenue = paidToday.reduce((sum, o) => sum + o.total, 0);

  // peak hour on paidAt
  const byHour = {};
  for(const o of paidToday){
    const dt = new Date(o.paidAt || o.createdAt);
    const h = dt.getHours();
    byHour[h] = (byHour[h] || 0) + 1;
  }
  let peakHour = null, peakCount = -1;
  Object.keys(byHour).forEach(h => {
    if(byHour[h] > peakCount){ peakCount = byHour[h]; peakHour = Number(h); }
  });

  // best sellers
  const itemCounts = {};
  for(const o of paidToday){
    for(const it of o.items){
      itemCounts[it.name] = (itemCounts[it.name] || 0) + it.qty;
    }
  }
  const bestSeller = Object.entries(itemCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";

  // payment stats
  let attempts = 0, successes = 0;
  for(const o of ordersToday){
    attempts += (o.payment?.attemptCount || 0);
    if(o.payment?.success) successes += 1;
  }
  const payRate = attempts ? Math.round((successes / ordersToday.length) * 100) : 0;

  return {
    ordersTodayCount: ordersToday.length,
    paidTodayCount: paidToday.length,
    revenue,
    peakHour: peakHour===null ? "—" : `${String(peakHour).padStart(2,"0")}:00`,
    bestSeller,
    payRate,
  };
};

FC.restaurantAnalytics = function(restaurantId){
  const s = FC.getState();
  const orders = s.orders.filter(o => o.restaurantId === restaurantId && FC.isToday(o.createdAt));
  const paid = orders.filter(o => o.status !== "pending_approval" && o.status !== "rejected" && o.status !== "awaiting_payment");

  const paidCount = paid.length;
  const revenue = paid.reduce((sum,o)=>sum+o.total,0);

  const itemCounts = {};
  for(const o of paid){
    for(const it of o.items){
      itemCounts[it.name] = (itemCounts[it.name] || 0) + it.qty;
    }
  }
  const bestSeller = Object.entries(itemCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";

  return { paidCount, revenue, bestSeller };
};

FC.downloadXLSX = function(filename, sheets){
  // sheets: [{name, rows}]
  const wb = XLSX.utils.book_new();
  for(const sh of sheets){
    const ws = XLSX.utils.json_to_sheet(sh.rows);
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0,31));
  }
  XLSX.writeFile(wb, filename);
};
