const speedValue = document.getElementById("speedValue");
const pingValue = document.getElementById("pingValue");
const downValue = document.getElementById("downValue");
const upValue = document.getElementById("upValue");
const speedArrow = document.getElementById("speedArrow");
const speedLabel = document.getElementById("speedLabel");
const phase = document.getElementById("phase");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const sessionValue = document.getElementById("sessionValue");
const jitterValue = document.getElementById("jitterValue");
const publicIpValue = document.getElementById("publicIpValue");
const summaryQuality = document.getElementById("summaryQuality");
const summaryPublicIp = document.getElementById("summaryPublicIp");
const summaryPing = document.getElementById("summaryPing");
const summarySpeed = document.getElementById("summarySpeed");
const summaryUpdated = document.getElementById("summaryUpdated");
const summaryLatencyTarget = document.getElementById("summaryLatencyTarget");
const monitorStatus = document.getElementById("monitorStatus");
const monitorStartBtn = document.getElementById("monitorStartBtn");
const monitorStopBtn = document.getElementById("monitorStopBtn");
const monitorCurrent = document.getElementById("monitorCurrent");
const monitorAvg = document.getElementById("monitorAvg");
const monitorLoss = document.getElementById("monitorLoss");
const monitorSamples = document.getElementById("monitorSamples");
const monitorSpark = document.getElementById("monitorSpark");
const speedRating = document.getElementById("speedRating");
const speedStars = document.getElementById("speedStars");
const speedAdvice = document.getElementById("speedAdvice");
const speedUse = document.getElementById("speedUse");
const historyGrid = document.getElementById("historyGrid");
const footerNote = document.getElementById("footerNote");

let aborter = null;
let monitorTimer = null;
let monitorHistory = [];
let monitorTotal = 0;
let monitorLossCount = 0;

const MBITS = 1_000_000;
const HISTORY_KEY = "ifastHistory";
const HISTORY_LIMIT = 14;
const REMOTE_TEST_BASE = "https://speed.cloudflare.com";
const DOWNLOAD_RUNS_MB = [10, 25, 50];
const UPLOAD_RUNS_MB = [5, 10];
const MONITOR_INTERVAL_MS = 300;
const LATENCY_FALLBACK_URL = "https://speed.cloudflare.com/__down?bytes=20000";
const PUBLIC_IP_ENDPOINTS = [
  { url: "https://api.ipify.org?format=json" },
  { url: "https://api64.ipify.org?format=json" },
  { url: "https://ifconfig.co/json", headers: { Accept: "application/json" } },
  { url: "https://ipapi.co/json/" },
];

let latencyProvider = {
  name: "Cloudflare speed",
  url: LATENCY_FALLBACK_URL,
};

function remoteUrl(path, params = {}) {
  const url = new URL(path, REMOTE_TEST_BASE);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("t", Date.now().toString());
  return url.toString();
}

function withNoCache(url) {
  try {
    const u = new URL(url);
    u.searchParams.set("t", Date.now().toString());
    return u.toString();
  } catch {
    return url;
  }
}

function getLatencyUrl() {
  return withNoCache(latencyProvider.url || LATENCY_FALLBACK_URL);
}

function formatMbps(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatMs(value) {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toString();
}

function setStatus(el, text, level) {
  el.textContent = text;
  el.classList.remove("out-ok", "out-warn", "out-bad");
  if (level) el.classList.add(level);
}

function setPhase(text) {
  phase.textContent = text;
}

function setArrow(direction) {
  if (!speedArrow) return;
  speedArrow.classList.remove("down", "up");
  if (direction === "down") {
    speedArrow.textContent = "↓";
    speedArrow.classList.add("down");
  } else if (direction === "up") {
    speedArrow.textContent = "↑";
    speedArrow.classList.add("up");
  } else {
    speedArrow.textContent = "⇅";
  }
}

function setSpeed(value) {
  speedValue.textContent = formatMbps(value);
  updateSummary();
}

function setSpeedLabel(text) {
  if (speedLabel) speedLabel.textContent = text;
}

function toNumber(text) {
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

function renderStars(score) {
  speedStars.innerHTML = "";
  for (let i = 1; i <= 5; i += 1) {
    const star = document.createElement("span");
    star.className = `star${i <= score ? " filled" : ""}`;
    star.textContent = "★";
    speedStars.append(star);
  }
}

function updateSpeedInsights() {
  const ping = toNumber(pingValue.textContent);
  const down = toNumber(downValue.textContent);
  const up = toNumber(upValue.textContent);
  if (!Number.isFinite(ping) || !Number.isFinite(down) || !Number.isFinite(up)) {
    speedRating.textContent = "—";
    speedAdvice.textContent = "Run a speed test to rate the connection.";
    speedUse.innerHTML = "";
    speedStars.innerHTML = "";
    return;
  }

  let score = 1;
  if (down >= 100 && up >= 20 && ping <= 40) score = 5;
  else if (down >= 50 && up >= 10 && ping <= 60) score = 4;
  else if (down >= 25 && up >= 5 && ping <= 80) score = 3;
  else if (down >= 10 && up >= 2 && ping <= 120) score = 2;

  speedRating.textContent = `${score} / 5`;
  renderStars(score);

  const useCases = [];
  if (score >= 5) {
    speedAdvice.textContent = "Excellent for multi-device and latency-sensitive use.";
    useCases.push("4K streaming on multiple screens");
    useCases.push("Competitive gaming and voice chat");
    useCases.push("Large uploads and cloud backups");
  } else if (score === 4) {
    speedAdvice.textContent = "Very good for most home and office workloads.";
    useCases.push("4K streaming on one screen");
    useCases.push("Stable video calls and gaming");
    useCases.push("Fast downloads and uploads");
  } else if (score === 3) {
    speedAdvice.textContent = "Good for everyday use with some limits.";
    useCases.push("HD streaming and standard video calls");
    useCases.push("Casual gaming");
    useCases.push("Moderate downloads");
  } else if (score === 2) {
    speedAdvice.textContent = "Basic use only; expect delays under load.";
    useCases.push("Web browsing and email");
    useCases.push("Single HD stream at best");
    useCases.push("Light downloads");
  } else {
    speedAdvice.textContent = "Limited connectivity; expect buffering.";
    useCases.push("Web browsing only");
    useCases.push("Messaging and low-bandwidth tasks");
  }

  speedUse.innerHTML = useCases.map((item) => `<div>${item}</div>`).join("");
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, HISTORY_LIMIT);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  renderHistory(trimmed);
}

function renderHistory(history = loadHistory()) {
  historyGrid.innerHTML = "";
  if (!history.length) {
    historyGrid.innerHTML = "<div class=\"mini\">No results yet.</div>";
    return;
  }
  history.forEach((item) => {
    const card = document.createElement("div");
    card.className = "history-item";
    const head = document.createElement("div");
    head.className = "history-head";
    const time = new Date(item.ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    head.innerHTML = `<span>${time}</span><span>${item.quality || "—"}</span>`;
    const metrics = document.createElement("div");
    metrics.className = "history-metrics";
    metrics.innerHTML = `
      <div>Ping: ${item.ping ?? "—"} ms</div>
      <div>Jitter: ${item.jitter ?? "—"} ms</div>
      <div>Down: ${item.down ?? "—"} Mbps</div>
      <div>Up: ${item.up ?? "—"} Mbps</div>
    `;
    card.append(head, metrics);
    historyGrid.append(card);
  });
}

function resetValues() {
  setSpeed(NaN);
  pingValue.textContent = "—";
  jitterValue.textContent = "—";
  downValue.textContent = "—";
  upValue.textContent = "—";
  sessionValue.textContent = "—";
  updateSummary();
  updateSpeedInsights();
}

async function runPing(signal) {
  setPhase("Ping check");
  setArrow("down");
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const start = performance.now();
    const res = await fetch(getLatencyUrl(), {
      signal,
      cache: "no-store",
      mode: "cors",
    });
    await res.arrayBuffer();
    const end = performance.now();
    samples.push(end - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  pingValue.textContent = formatMs(median);
  const jitter = samples.reduce((acc, v, idx) => {
    if (idx === 0) return 0;
    return acc + Math.abs(v - samples[idx - 1]);
  }, 0) / Math.max(1, samples.length - 1);
  jitterValue.textContent = formatMs(jitter);
  updateSummary();
  return median;
}

async function runDownload(signal) {
  setPhase("Download test");
  setArrow("down");
  const runs = DOWNLOAD_RUNS_MB.map((mb) => mb * 1024 * 1024);
  let totalBytes = 0;
  let totalTime = 0;

  for (const bytes of runs) {
    const start = performance.now();
    const res = await fetch(remoteUrl("/__down", { bytes }), {
      signal,
      cache: "no-store",
      mode: "cors",
    });
    if (!res.body) throw new Error("Download stream unavailable");
    const reader = res.body.getReader();
    let received = 0;
    // Stream the response to avoid buffering everything.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      const now = performance.now();
      const speed = ((received * 8) / MBITS) / ((now - start) / 1000);
      setSpeed(speed);
    }
    const end = performance.now();
    totalBytes += received;
    totalTime += (end - start) / 1000;
  }

  const avg = ((totalBytes * 8) / MBITS) / totalTime;
  downValue.textContent = formatMbps(avg);
  updateSummary();
  return avg;
}

async function runUpload(signal) {
  setPhase("Upload test");
  setArrow("up");
  const runs = UPLOAD_RUNS_MB.map((mb) => mb * 1024 * 1024);
  let totalBytes = 0;
  let totalTime = 0;

  for (const bytes of runs) {
    const payload = new Uint8Array(bytes);
    // getRandomValues has a per-call size limit, fill in chunks.
    const chunkSize = 65536;
    for (let offset = 0; offset < payload.length; offset += chunkSize) {
      crypto.getRandomValues(payload.subarray(offset, offset + chunkSize));
    }
    const start = performance.now();
    await fetch(remoteUrl("/__up"), {
      method: "POST",
      body: payload,
      signal,
      cache: "no-store",
      mode: "cors",
    });
    const end = performance.now();
    totalBytes += bytes;
    totalTime += (end - start) / 1000;
    const speed = ((bytes * 8) / MBITS) / ((end - start) / 1000);
    setSpeed(speed);
  }

  const avg = ((totalBytes * 8) / MBITS) / totalTime;
  upValue.textContent = formatMbps(avg);
  updateSummary();
  return avg;
}

async function runTest() {
  resetValues();
  aborter = new AbortController();
  startBtn.disabled = true;
  stopBtn.disabled = false;
  setArrow("down");

  const sessionStart = new Date();
  sessionValue.textContent = sessionStart.toLocaleTimeString("en-US");

  try {
    setSpeedLabel("LIVE");
    await runPing(aborter.signal);
    const down = await runDownload(aborter.signal);
    setSpeed(down);
    const up = await runUpload(aborter.signal);
    setSpeed(up);
    if (Number.isFinite(down) && Number.isFinite(up)) {
      const avg = (down + up) / 2;
      setSpeed(avg);
      setSpeedLabel("AVG");
    }
    setPhase("Done");
    setArrow(null);
    updateSpeedInsights();
    saveHistory({
      ts: Date.now(),
      ping: toNumber(pingValue.textContent),
      jitter: toNumber(jitterValue.textContent),
      down: toNumber(downValue.textContent),
      up: toNumber(upValue.textContent),
      quality: summaryQuality.querySelector(".summary-text")?.textContent || "",
    });
  } catch (err) {
    if (err.name !== "AbortError") {
      setPhase("Test error");
    } else {
      setPhase("Stopped");
    }
  } finally {
    setArrow(null);
    startBtn.disabled = false;
    stopBtn.disabled = true;
    aborter = null;
  }
}

async function loadPublicIp() {
  try {
    const data = await fetchPublicIp();
    publicIpValue.textContent = data.ip || "—";
    summaryPublicIp.textContent = data.ip || "—";
  } catch (err) {
    publicIpValue.textContent = "—";
    summaryPublicIp.textContent = "—";
  }
}

async function fetchPublicIp() {
  for (const endpoint of PUBLIC_IP_ENDPOINTS) {
    try {
      const res = await fetch(endpoint.url, {
        cache: "no-store",
        headers: endpoint.headers || undefined,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const ip = data.ip || data.IP || data.address;
      if (ip) return { ip };
    } catch {
      continue;
    }
  }
  throw new Error("Public IP unavailable");
}

function updateSummary() {
  const ping = Number(pingValue.textContent);
  const down = Number(downValue.textContent);
  const up = Number(upValue.textContent);
  summaryPing.textContent = Number.isFinite(ping) ? `${ping} ms` : "—";
  if (Number.isFinite(down) || Number.isFinite(up)) {
    const d = Number.isFinite(down) ? `${down}↓` : "—";
    const u = Number.isFinite(up) ? `${up}↑` : "—";
    summarySpeed.textContent = `${d} / ${u} Mbps`;
  } else {
    summarySpeed.textContent = "—";
  }
  summaryLatencyTarget.textContent = latencyProvider?.name || "—";
  summaryUpdated.textContent = new Date().toLocaleTimeString("en-US");

  const dot = summaryQuality.querySelector(".summary-dot");
  const text = summaryQuality.querySelector(".summary-text");
  let label = "Quality: —";
  let color = "rgba(148, 163, 184, 0.5)";
  if (Number.isFinite(ping) || Number.isFinite(down)) {
    const goodPing = Number.isFinite(ping) && ping <= 40;
    const okPing = Number.isFinite(ping) && ping <= 90;
    const goodDown = Number.isFinite(down) && down >= 50;
    const okDown = Number.isFinite(down) && down >= 15;
    if (goodPing && goodDown) {
      label = "Quality: Excellent";
      color = "rgba(34, 197, 94, 0.7)";
    } else if (okPing || okDown) {
      label = "Quality: Good";
      color = "rgba(250, 204, 21, 0.7)";
    } else {
      label = "Quality: Poor";
      color = "rgba(248, 113, 113, 0.7)";
    }
  }
  text.textContent = label;
  dot.style.background = color;
  dot.style.boxShadow = `0 0 12px ${color}`;
}

function setMonitorStatus(text, color) {
  const dot = monitorStatus.querySelector(".summary-dot");
  const label = monitorStatus.querySelector(".summary-text");
  label.textContent = text;
  dot.style.background = color;
  dot.style.boxShadow = `0 0 12px ${color}`;
}

function updateMonitorUI() {
  const okSamples = monitorHistory.filter((s) => s.ok);
  const last = monitorHistory[monitorHistory.length - 1];
  const avg =
    okSamples.length > 0
      ? okSamples.reduce((acc, s) => acc + s.ms, 0) / okSamples.length
      : NaN;
  monitorCurrent.textContent = last && last.ok ? `${formatMs(last.ms)} ms` : "—";
  monitorAvg.textContent = Number.isFinite(avg) ? `${formatMs(avg)} ms` : "—";
  const lossPct = monitorTotal ? ((monitorLossCount / monitorTotal) * 100).toFixed(1) : "—";
  monitorLoss.textContent = monitorTotal ? `${lossPct}%` : "—";
  monitorSamples.textContent = monitorTotal ? `${monitorTotal}` : "—";

  drawMonitorSpark();
}

function drawMonitorSpark() {
  if (!(monitorSpark instanceof HTMLCanvasElement)) return;
  const canvas = monitorSpark;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (!cssWidth || !cssHeight) return;
  canvas.width = Math.round(cssWidth * devicePixelRatio);
  canvas.height = Math.round(cssHeight * devicePixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const samples = monitorHistory.slice(-60);
  if (!samples.length) return;
  const values = samples.map((s) => (s.ok ? s.ms : null));
  const max = Math.max(120, ...values.filter((v) => Number.isFinite(v)));
  const min = 0;
  const stepX = cssWidth / Math.max(1, samples.length - 1);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(46, 229, 106, 0.85)";
  ctx.beginPath();
  let started = false;
  samples.forEach((sample, i) => {
    const x = i * stepX;
    if (!sample.ok) {
      started = false;
      return;
    }
    const y =
      cssHeight - ((sample.ms - min) / Math.max(1, max - min)) * (cssHeight - 8) - 4;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(248, 113, 113, 0.8)";
  samples.forEach((sample, i) => {
    if (sample.ok) return;
    const x = i * stepX;
    const y = cssHeight / 2;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { cache: "no-store", signal: controller.signal })
    .then((res) => {
      clearTimeout(timeout);
      return res;
    })
    .catch((err) => {
      clearTimeout(timeout);
      throw err;
    });
}

async function monitorTick() {
  monitorTotal += 1;
  const start = performance.now();
  try {
    const res = await fetchWithTimeout(getLatencyUrl(), 1200);
    await res.arrayBuffer();
    const ms = performance.now() - start;
    const ok = ms < 1000;
    if (!ok) monitorLossCount += 1;
    monitorHistory.push({ ok, ms });
    setMonitorStatus(ok ? "Monitoring" : "Unstable", ok ? "rgba(34, 197, 94, 0.7)" : "rgba(248, 113, 113, 0.7)");
  } catch (err) {
    monitorLossCount += 1;
    monitorHistory.push({ ok: false, ms: 0 });
    setMonitorStatus("Unstable", "rgba(248, 113, 113, 0.7)");
  }
  updateMonitorUI();
}

function startMonitor() {
  if (monitorTimer) return;
  monitorHistory = [];
  monitorTotal = 0;
  monitorLossCount = 0;
  monitorStartBtn.disabled = true;
  monitorStopBtn.disabled = false;
  setMonitorStatus("Monitoring", "rgba(34, 197, 94, 0.7)");
  monitorTick();
  monitorTimer = setInterval(monitorTick, MONITOR_INTERVAL_MS);
}

function stopMonitor() {
  if (!monitorTimer) return;
  clearInterval(monitorTimer);
  monitorTimer = null;
  monitorStartBtn.disabled = false;
  monitorStopBtn.disabled = true;
  setMonitorStatus("Stopped", "rgba(148, 163, 184, 0.5)");
}

startBtn.addEventListener("click", runTest);
stopBtn.addEventListener("click", () => {
  if (aborter) aborter.abort();
});
monitorStartBtn.addEventListener("click", startMonitor);
monitorStopBtn.addEventListener("click", stopMonitor);
loadPublicIp();
updateSummary();
setMonitorStatus("Idle", "rgba(148, 163, 184, 0.5)");
renderHistory();

if (footerNote) {
  footerNote.textContent = "PWA mode: speed test uses Cloudflare edge.";
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
