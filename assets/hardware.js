
(async function(){
  await FC.seed();

  const devicesPanel = document.getElementById("devicesPanel");
  const deviceLogs = document.getElementById("deviceLogs");
  const healthLabel = document.getElementById("healthLabel");
  const healthIssues = document.getElementById("healthIssues");
  const queueCount = document.getElementById("queueCount");

  const resetBtn = document.getElementById("resetBtn");
  const clearLogsBtn = document.getElementById("clearLogsBtn");

  const testPrintBtn = document.getElementById("testPrintBtn");
  const consumePaperBtn = document.getElementById("consumePaperBtn");
  const gatewaySuccessBtn = document.getElementById("gatewaySuccessBtn");
  const gatewayFailBtn = document.getElementById("gatewayFailBtn");

  const simulateLatencyBtn = document.getElementById("simulateLatencyBtn");
  const lockKioskBtn = document.getElementById("lockKioskBtn");
  const rebootBtn = document.getElementById("rebootBtn");

  const queueFakeOrderBtn = document.getElementById("queueFakeOrderBtn");
  const flushQueueBtn = document.getElementById("flushQueueBtn");

  function badge(ok){
    return ok ? `<span class="pill badge-green">HEALTHY</span>` : `<span class="pill badge-red">DEGRADED</span>`;
  }

  function renderHealth(){
    const h = FC.hardwareHealth();
    healthLabel.innerHTML = h.ok ? `All Systems Normal ${badge(true)}` : `Action Required ${badge(false)}`;
    if(h.ok){
      healthIssues.textContent = "No active issues detected.";
      healthIssues.className = "text-sm text-emerald-300 mt-2";
    }else{
      healthIssues.textContent = "Issues: " + h.issues.join(" • ");
      healthIssues.className = "text-sm text-rose-300 mt-2";
    }
  }

  function row(title, subtitle, rightHtml){
    return `
      <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="font-semibold">${title}</div>
            <div class="text-xs text-slate-400 mt-1">${subtitle}</div>
          </div>
          <div class="flex items-center gap-2">${rightHtml}</div>
        </div>
      </div>
    `;
  }

  function renderDevices(){
    const d = FC.getDevices();
    devicesPanel.innerHTML = "";

    devicesPanel.innerHTML += row(
      "Network",
      `online=${d.network.online} • latency=${d.network.latencyMs}ms`,
      `<span class="pill ${d.network.online ? "badge-green" : "badge-red"}">${d.network.online ? "ONLINE" : "OFFLINE"}</span>
       <button class="btn-ghost text-sm" data-toggle="network">Toggle</button>`
    );

    devicesPanel.innerHTML += row(
      "Printer",
      `online=${d.printer.online} • paper=${d.printer.paper}%`,
      `<span class="pill ${d.printer.online ? "badge-green" : "badge-red"}">${d.printer.online ? "ONLINE" : "OFFLINE"}</span>
       <button class="btn-ghost text-sm" data-toggle="printer">Toggle</button>`
    );

    devicesPanel.innerHTML += row(
      "Payment Gateway",
      `provider=${d.paymentGateway.provider} • online=${d.paymentGateway.online}`,
      `<span class="pill ${d.paymentGateway.online ? "badge-green" : "badge-red"}">${d.paymentGateway.online ? "ONLINE" : "OFFLINE"}</span>
       <button class="btn-ghost text-sm" data-toggle="paymentGateway">Toggle</button>`
    );

    devicesPanel.innerHTML += row(
      "Kiosk Display",
      `online=${d.kioskDisplay.online} • brightness=${d.kioskDisplay.brightness}% • locked=${d.kioskDisplay.locked}`,
      `<span class="pill ${d.kioskDisplay.online ? "badge-green" : "badge-red"}">${d.kioskDisplay.online ? "ONLINE" : "OFFLINE"}</span>
       <button class="btn-ghost text-sm" data-toggle="kioskDisplay">Toggle</button>`
    );

    devicesPanel.innerHTML += row(
      "Local Cache",
      `enabled=${d.localCache.enabled} • queuedOrders=${d.localCache.queuedOrders}`,
      `<span class="pill badge-yellow">OFFLINE SUPPORT</span>`
    );

    devicesPanel.querySelectorAll("[data-toggle]").forEach(btn=>{
      btn.onclick = ()=>{
        const key = btn.getAttribute("data-toggle");
        FC.toggleDeviceOnline(key);
        renderAll();
      };
    });
  }

  function renderDeviceLogs(){
    const s = FC.getState();
    const logs = (s.deviceLogs || []);
    deviceLogs.innerHTML = "";
    if(!logs.length){
      deviceLogs.innerHTML = `<div class="text-sm text-slate-400">No device events yet.</div>`;
      return;
    }
    for(const l of logs){
      const levelClass = l.level==="ERROR" ? "text-rose-300" : (l.level==="WARN" ? "text-yellow-300" : "text-slate-300");
      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-white/5 border border-white/10 text-xs";
      div.innerHTML = `<div class="text-slate-400">${new Date(l.at).toLocaleTimeString()} • <span class="${levelClass}">${l.level}</span></div>
                       <div class="mt-1 text-slate-200">${l.message}</div>`;
      deviceLogs.appendChild(div);
    }
  }

  function renderQueue(){
    const d = FC.getDevices();
    queueCount.textContent = d.localCache?.queuedOrders || 0;
  }

  // actions
  simulateLatencyBtn.onclick = ()=>{
    const ms = FC.simulateLatency();
    if(ms > 150) FC.deviceLog("Latency spike detected.", "WARN");
    renderAll();
  };

  lockKioskBtn.onclick = ()=>{
    const d = FC.getDevices().kioskDisplay;
    FC.setDevice("kioskDisplay", { locked: !d.locked });
    renderAll();
  };

  rebootBtn.onclick = ()=>{
    FC.deviceLog("Kiosk reboot initiated (watchdog).", "WARN");
    FC.setDevice("network", { latencyMs: 35 });
    FC.setDevice("kioskDisplay", { locked: false, online: true });
    setTimeout(()=>{
      FC.deviceLog("Kiosk reboot completed.", "INFO");
      renderAll();
    }, 700);
  };

  testPrintBtn.onclick = ()=>{
    const d = FC.getDevices();
    if(!d.printer.online){
      FC.deviceLog("Print failed: printer offline.", "ERROR");
      renderAll();
      return;
    }
    if((d.printer.paper ?? 0) <= 0){
      FC.deviceLog("Print failed: no paper.", "ERROR");
      renderAll();
      return;
    }
    FC.deviceLog("Test receipt sent to printer spool.", "INFO");
    FC.simulatePrinterPaperUse();
    renderAll();
    window.print();
  };

  consumePaperBtn.onclick = ()=>{
    FC.simulatePrinterPaperUse();
    renderAll();
  };

  gatewaySuccessBtn.onclick = ()=>{
    const d = FC.getDevices();
    if(!d.paymentGateway.online){
      FC.deviceLog("Gateway verify failed: gateway offline.", "ERROR");
      renderAll();
      return;
    }
    FC.simulateGatewayVerify(true);
    renderAll();
  };

  gatewayFailBtn.onclick = ()=>{
    FC.simulateGatewayVerify(false);
    renderAll();
  };

  queueFakeOrderBtn.onclick = ()=>{
    const d = FC.getDevices();
    const q = (d.localCache.queuedOrders || 0) + 1;
    FC.setDevice("localCache", { queuedOrders: q });
    FC.deviceLog("Order queued locally (offline mode).", "WARN");
    renderAll();
  };

  flushQueueBtn.onclick = ()=>{
    const d = FC.getDevices();
    if(!d.network.online){
      FC.deviceLog("Cannot flush queue: network offline.", "ERROR");
      renderAll();
      return;
    }
    const count = d.localCache.queuedOrders || 0;
    FC.setDevice("localCache", { queuedOrders: 0 });
    FC.deviceLog(`Flushed ${count} queued orders to cloud (simulated).`, "INFO");
    renderAll();
  };

  resetBtn.onclick = ()=>{
    const s = FC.getState();
    s.devices = {
      network: { online: true, latencyMs: 42 },
      printer: { online: true, paper: 85, lastPrintAt: null },
      paymentGateway: { online: true, provider: 'QR Aggregator', lastVerifyAt: null },
      kioskDisplay: { online: true, brightness: 75, locked: false },
      localCache: { enabled: true, queuedOrders: 0 }
    };
    s.deviceLogs = [];
    FC.setState(s);
    FC.log("Hardware console reset.");
    renderAll();
  };

  clearLogsBtn.onclick = ()=>{
    const s = FC.getState();
    s.deviceLogs = [];
    FC.setState(s);
    renderAll();
  };

  function renderAll(){
    renderDevices();
    renderDeviceLogs();
    renderHealth();
    renderQueue();
  }

  renderAll();
  setInterval(renderAll, 1500);
 window.addEventListener("fc:state-changed", () => {
  renderAll();
});
})();