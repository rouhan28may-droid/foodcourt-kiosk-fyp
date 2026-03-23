(async function () {
  window.FC = window.FC || {};

  const $ = (id) => document.getElementById(id);
  const devicesPanel = $("devicesPanel");
  const deviceLogs = $("deviceLogs");
  const healthLabel = $("healthLabel");
  const healthIssues = $("healthIssues");
  const queueCount = $("queueCount");

  const resetBtn = $("resetBtn");
  const clearLogsBtn = $("clearLogsBtn");

  const testPrintBtn = $("testPrintBtn");
  const consumePaperBtn = $("consumePaperBtn");
  const gatewaySuccessBtn = $("gatewaySuccessBtn");
  const gatewayFailBtn = $("gatewayFailBtn");

  const simulateLatencyBtn = $("simulateLatencyBtn");
  const lockKioskBtn = $("lockKioskBtn");
  const rebootBtn = $("rebootBtn");

  const queueFakeOrderBtn = $("queueFakeOrderBtn");
  const flushQueueBtn = $("flushQueueBtn");

  let renderBusy = false;
  let rerenderRequested = false;

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeObject(v) {
    return v && typeof v === "object" ? v : {};
  }

  function safeState() {
    try {
      return typeof FC.getState === "function" ? (FC.getState() || {}) : {};
    } catch {
      return {};
    }
  }

  function setStateSafe(state) {
    try {
      if (typeof FC.setState === "function") {
        FC.setState(state);
      }
    } catch (err) {
      console.error("hardware.js: setState failed", err);
    }
  }

  function logApp(message) {
    try {
      if (typeof FC.log === "function") FC.log(message);
    } catch (err) {
      console.error("hardware.js: app log failed", err);
    }
  }

  function deviceLog(message, level = "INFO") {
    try {
      if (typeof FC.deviceLog === "function") {
        FC.deviceLog(message, level);
        return;
      }
    } catch (err) {
      console.error("hardware.js: deviceLog failed", err);
    }

    const s = safeState();
    s.deviceLogs = safeArray(s.deviceLogs);
    s.deviceLogs.unshift({
      at: new Date().toISOString(),
      level,
      message
    });
    setStateSafe(s);
  }

  function defaultDevices() {
    return {
      network: { online: true, latencyMs: 42 },
      printer: { online: true, paper: 85, lastPrintAt: null },
      paymentGateway: { online: true, provider: "QR Aggregator", lastVerifyAt: null },
      kioskDisplay: { online: true, brightness: 75, locked: false },
      localCache: { enabled: true, queuedOrders: 0 }
    };
  }

  function getDevicesSafe() {
    try {
      if (typeof FC.getDevices === "function") {
        const d = FC.getDevices() || {};
        return {
          network: { online: true, latencyMs: 42, ...safeObject(d.network) },
          printer: { online: true, paper: 85, lastPrintAt: null, ...safeObject(d.printer) },
          paymentGateway: {
            online: true,
            provider: "QR Aggregator",
            lastVerifyAt: null,
            ...safeObject(d.paymentGateway)
          },
          kioskDisplay: {
            online: true,
            brightness: 75,
            locked: false,
            ...safeObject(d.kioskDisplay)
          },
          localCache: {
            enabled: true,
            queuedOrders: 0,
            ...safeObject(d.localCache)
          }
        };
      }
    } catch (err) {
      console.error("hardware.js: getDevices failed", err);
    }

    const s = safeState();
    const d = safeObject(s.devices);
    return {
      network: { online: true, latencyMs: 42, ...safeObject(d.network) },
      printer: { online: true, paper: 85, lastPrintAt: null, ...safeObject(d.printer) },
      paymentGateway: {
        online: true,
        provider: "QR Aggregator",
        lastVerifyAt: null,
        ...safeObject(d.paymentGateway)
      },
      kioskDisplay: {
        online: true,
        brightness: 75,
        locked: false,
        ...safeObject(d.kioskDisplay)
      },
      localCache: {
        enabled: true,
        queuedOrders: 0,
        ...safeObject(d.localCache)
      }
    };
  }

  function setDeviceSafe(key, patch) {
    try {
      if (typeof FC.setDevice === "function") {
        FC.setDevice(key, patch);
        return;
      }
    } catch (err) {
      console.error("hardware.js: setDevice failed", err);
    }

    const s = safeState();
    s.devices = safeObject(s.devices);
    s.devices[key] = {
      ...safeObject(s.devices[key]),
      ...safeObject(patch)
    };
    setStateSafe(s);
  }

  function toggleDeviceOnlineSafe(key) {
    try {
      if (typeof FC.toggleDeviceOnline === "function") {
        FC.toggleDeviceOnline(key);
        return;
      }
    } catch (err) {
      console.error("hardware.js: toggleDeviceOnline failed", err);
    }

    const d = getDevicesSafe();
    setDeviceSafe(key, { online: !d[key]?.online });
    deviceLog(`${key} online=${!d[key]?.online}`, "WARN");
  }

  function simulatePrinterPaperUseSafe() {
    try {
      if (typeof FC.simulatePrinterPaperUse === "function") {
        FC.simulatePrinterPaperUse();
        return;
      }
    } catch (err) {
      console.error("hardware.js: simulatePrinterPaperUse failed", err);
    }

    const d = getDevicesSafe();
    const current = Number(d.printer?.paper ?? 0);
    const next = Math.max(0, current - 5);
    setDeviceSafe("printer", {
      paper: next,
      lastPrintAt: new Date().toISOString()
    });

    if (next <= 10) deviceLog("Printer paper is low.", "WARN");
  }

  function simulateGatewayVerifySafe(success) {
    try {
      if (typeof FC.simulateGatewayVerify === "function") {
        FC.simulateGatewayVerify(success);
        return;
      }
    } catch (err) {
      console.error("hardware.js: simulateGatewayVerify failed", err);
    }

    setDeviceSafe("paymentGateway", {
      lastVerifyAt: new Date().toISOString()
    });

    deviceLog(
      success ? "Gateway verification success (simulated)." : "Gateway verification failed (simulated).",
      success ? "INFO" : "ERROR"
    );
  }

  function simulateLatencySafe() {
    try {
      if (typeof FC.simulateLatency === "function") {
        return FC.simulateLatency();
      }
    } catch (err) {
      console.error("hardware.js: simulateLatency failed", err);
    }

    const next = Math.floor(Math.random() * 300) + 20;
    setDeviceSafe("network", { latencyMs: next });
    return next;
  }

  function hardwareHealthSafe() {
    try {
      if (typeof FC.hardwareHealth === "function") {
        return FC.hardwareHealth();
      }
    } catch (err) {
      console.error("hardware.js: hardwareHealth failed", err);
    }

    const d = getDevicesSafe();
    const issues = [];

    if (!d.network.online) issues.push("Network offline");
    if (Number(d.network.latencyMs || 0) > 150) issues.push("High latency");
    if (!d.printer.online) issues.push("Printer offline");
    if (Number(d.printer.paper || 0) <= 10) issues.push("Printer paper low");
    if (!d.paymentGateway.online) issues.push("Payment gateway offline");
    if (!d.kioskDisplay.online) issues.push("Kiosk display offline");
    if (d.kioskDisplay.locked) issues.push("Kiosk locked");

    return {
      ok: issues.length === 0,
      issues
    };
  }

  function badge(ok) {
    return ok
      ? `<span class="pill badge-green">HEALTHY</span>`
      : `<span class="pill badge-red">DEGRADED</span>`;
  }

  function row(title, subtitle, rightHtml) {
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

  function renderHealth() {
    if (!healthLabel || !healthIssues) return;

    const h = hardwareHealthSafe();
    healthLabel.innerHTML = h.ok
      ? `All Systems Normal ${badge(true)}`
      : `Action Required ${badge(false)}`;

    if (h.ok) {
      healthIssues.textContent = "No active issues detected.";
      healthIssues.className = "text-sm text-emerald-300 mt-2";
    } else {
      healthIssues.textContent = "Issues: " + h.issues.join(" • ");
      healthIssues.className = "text-sm text-rose-300 mt-2";
    }
  }

  function renderDevices() {
    if (!devicesPanel) return;

    const d = getDevicesSafe();
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

    devicesPanel.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.onclick = async () => {
        const key = btn.getAttribute("data-toggle");
        toggleDeviceOnlineSafe(key);
        await renderAll();
      };
    });
  }

  function renderDeviceLogs() {
    if (!deviceLogs) return;

    const s = safeState();
    const logs = safeArray(s.deviceLogs);
    deviceLogs.innerHTML = "";

    if (!logs.length) {
      deviceLogs.innerHTML = `<div class="text-sm text-slate-400">No device events yet.</div>`;
      return;
    }

    for (const l of logs) {
      const levelClass =
        l.level === "ERROR"
          ? "text-rose-300"
          : l.level === "WARN"
            ? "text-yellow-300"
            : "text-slate-300";

      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-white/5 border border-white/10 text-xs";
      div.innerHTML = `
        <div class="text-slate-400">
          ${new Date(l.at || Date.now()).toLocaleTimeString()} •
          <span class="${levelClass}">${l.level || "INFO"}</span>
        </div>
        <div class="mt-1 text-slate-200">${l.message || ""}</div>
      `;
      deviceLogs.appendChild(div);
    }
  }

  function renderQueue() {
    if (!queueCount) return;
    const d = getDevicesSafe();
    queueCount.textContent = String(d.localCache?.queuedOrders || 0);
  }

  async function renderAll() {
    if (renderBusy) {
      rerenderRequested = true;
      return;
    }

    renderBusy = true;

    try {
      renderDevices();
      renderDeviceLogs();
      renderHealth();
      renderQueue();
    } catch (err) {
      console.error("hardware.js: renderAll failed", err);
    } finally {
      renderBusy = false;
      if (rerenderRequested) {
        rerenderRequested = false;
        renderAll();
      }
    }
  }

  try {
    if (typeof FC.seed === "function") {
      await FC.seed();
    }
  } catch (err) {
    console.error("hardware.js: seed failed", err);
  }

  if (simulateLatencyBtn) {
    simulateLatencyBtn.onclick = async () => {
      const ms = simulateLatencySafe();
      if (ms > 150) deviceLog("Latency spike detected.", "WARN");
      await renderAll();
    };
  }

  if (lockKioskBtn) {
    lockKioskBtn.onclick = async () => {
      const d = getDevicesSafe().kioskDisplay;
      setDeviceSafe("kioskDisplay", { locked: !d.locked });
      deviceLog(`Kiosk locked=${!d.locked}`, d.locked ? "INFO" : "WARN");
      await renderAll();
    };
  }

  if (rebootBtn) {
    rebootBtn.onclick = async () => {
      deviceLog("Kiosk reboot initiated (watchdog).", "WARN");
      setDeviceSafe("network", { latencyMs: 35, online: true });
      setDeviceSafe("kioskDisplay", { locked: false, online: true });

      setTimeout(async () => {
        deviceLog("Kiosk reboot completed.", "INFO");
        await renderAll();
      }, 700);

      await renderAll();
    };
  }

  if (testPrintBtn) {
    testPrintBtn.onclick = async () => {
      const d = getDevicesSafe();

      if (!d.printer.online) {
        deviceLog("Print failed: printer offline.", "ERROR");
        await renderAll();
        return;
      }

      if (Number(d.printer.paper ?? 0) <= 0) {
        deviceLog("Print failed: no paper.", "ERROR");
        await renderAll();
        return;
      }

      deviceLog("Test receipt sent to printer spool.", "INFO");
      simulatePrinterPaperUseSafe();
      await renderAll();

      try {
        window.print();
      } catch (err) {
        console.error("hardware.js: window.print failed", err);
      }
    };
  }

  if (consumePaperBtn) {
    consumePaperBtn.onclick = async () => {
      simulatePrinterPaperUseSafe();
      await renderAll();
    };
  }

  if (gatewaySuccessBtn) {
    gatewaySuccessBtn.onclick = async () => {
      const d = getDevicesSafe();
      if (!d.paymentGateway.online) {
        deviceLog("Gateway verify failed: gateway offline.", "ERROR");
        await renderAll();
        return;
      }

      simulateGatewayVerifySafe(true);
      await renderAll();
    };
  }

  if (gatewayFailBtn) {
    gatewayFailBtn.onclick = async () => {
      simulateGatewayVerifySafe(false);
      await renderAll();
    };
  }

  if (queueFakeOrderBtn) {
    queueFakeOrderBtn.onclick = async () => {
      const d = getDevicesSafe();
      const q = Number(d.localCache.queuedOrders || 0) + 1;
      setDeviceSafe("localCache", { queuedOrders: q });
      deviceLog("Order queued locally (offline mode).", "WARN");
      await renderAll();
    };
  }

  if (flushQueueBtn) {
    flushQueueBtn.onclick = async () => {
      const d = getDevicesSafe();

      if (!d.network.online) {
        deviceLog("Cannot flush queue: network offline.", "ERROR");
        await renderAll();
        return;
      }

      const count = Number(d.localCache.queuedOrders || 0);
      setDeviceSafe("localCache", { queuedOrders: 0 });
      deviceLog(`Flushed ${count} queued orders to cloud (simulated).`, "INFO");
      await renderAll();
    };
  }

  if (resetBtn) {
    resetBtn.onclick = async () => {
      const s = safeState();
      s.devices = defaultDevices();
      s.deviceLogs = [];
      setStateSafe(s);
      logApp("Hardware console reset.");
      await renderAll();
    };
  }

  if (clearLogsBtn) {
    clearLogsBtn.onclick = async () => {
      const s = safeState();
      s.deviceLogs = [];
      setStateSafe(s);
      await renderAll();
    };
  }

  await renderAll();

  setInterval(() => {
    renderAll();
  }, 1500);

  window.addEventListener("fc:state-changed", () => {
    renderAll();
  });

  window.addEventListener("focus", () => {
    renderAll();
  });
})();