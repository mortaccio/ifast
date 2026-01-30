const speedValue = document.getElementById("speedValue");
const pingValue = document.getElementById("pingValue");
const downValue = document.getElementById("downValue");
const upValue = document.getElementById("upValue");
const speedArrow = document.getElementById("speedArrow");
const phase = document.getElementById("phase");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const sessionValue = document.getElementById("sessionValue");
const jitterValue = document.getElementById("jitterValue");
const systemValue = document.getElementById("systemValue");
const ipValue = document.getElementById("ipValue");
const ispValue = document.getElementById("ispValue");
const publicIpValue = document.getElementById("publicIpValue");
const traceHost = document.getElementById("traceHost");
const traceHops = document.getElementById("traceHops");
const traceTimeout = document.getElementById("traceTimeout");
const traceBtn = document.getElementById("traceBtn");
const traceOutput = document.getElementById("traceOutput");
const netinfoOutput = document.getElementById("netinfoOutput");
const troubleshootBtn = document.getElementById("troubleshootBtn");
const troubleshootOutput = document.getElementById("troubleshootOutput");
const tsLocal = document.getElementById("tsLocal");
const tsInternet = document.getElementById("tsInternet");
const tsDns = document.getElementById("tsDns");
const tsHttp = document.getElementById("tsHttp");
const diagBtn = document.getElementById("diagBtn");
const diagStatus = document.getElementById("diagStatus");
const diagGateway = document.getElementById("diagGateway");
const diagDns = document.getElementById("diagDns");
const diagIfaces = document.getElementById("diagIfaces");
const diagOutputs = document.getElementById("diagOutputs");
const summaryQuality = document.getElementById("summaryQuality");
const summaryPublicIp = document.getElementById("summaryPublicIp");
const summaryGateway = document.getElementById("summaryGateway");
const summaryDns = document.getElementById("summaryDns");
const summaryPing = document.getElementById("summaryPing");
const summarySpeed = document.getElementById("summarySpeed");
const summaryUpdated = document.getElementById("summaryUpdated");
const summaryLatencyTarget = document.getElementById("summaryLatencyTarget");
const summaryIcmp = document.getElementById("summaryIcmp");
const monitorStatus = document.getElementById("monitorStatus");
const monitorStartBtn = document.getElementById("monitorStartBtn");
const monitorStopBtn = document.getElementById("monitorStopBtn");
const monitorCurrent = document.getElementById("monitorCurrent");
const monitorAvg = document.getElementById("monitorAvg");
const monitorLoss = document.getElementById("monitorLoss");
const monitorSamples = document.getElementById("monitorSamples");
const monitorSpark = document.getElementById("monitorSpark");
const assistantSymptom = document.getElementById("assistantSymptom");
const assistantHost = document.getElementById("assistantHost");
const assistantRunBtn = document.getElementById("assistantRunBtn");
const assistantCopyBtn = document.getElementById("assistantCopyBtn");
const assistantOutput = document.getElementById("assistantOutput");
const speedRating = document.getElementById("speedRating");
const speedStars = document.getElementById("speedStars");
const speedAdvice = document.getElementById("speedAdvice");
const speedUse = document.getElementById("speedUse");
const providerBtn = document.getElementById("providerBtn");
const providerOutput = document.getElementById("providerOutput");
const finderHost = document.getElementById("finderHost");
const finderRunBtn = document.getElementById("finderRunBtn");
const finderCopyBtn = document.getElementById("finderCopyBtn");
const finderOutput = document.getElementById("finderOutput");
const autoDiagStatus = document.getElementById("autoDiagStatus");
const autoDiagList = document.getElementById("autoDiagList");
const localStatus = document.getElementById("localStatus");
const ispStatus = document.getElementById("ispStatus");
const splitHint = document.getElementById("splitHint");
const historyGrid = document.getElementById("historyGrid");

let aborter = null;
let monitorTimer = null;
let monitorHistory = [];
let monitorTotal = 0;
let monitorLossCount = 0;

const MBITS = 1_000_000;
const HISTORY_KEY = "ifastHistory";
const HISTORY_LIMIT = 14;
const REMOTE_TEST_BASE = "https://speed.cloudflare.com";
const PING_BYTES = 20000;
const DOWNLOAD_RUNS_MB = [10, 25, 50];
const UPLOAD_RUNS_MB = [5, 10];
const MONITOR_BYTES = 8000;
const MONITOR_INTERVAL_MS = 300;
const LATENCY_FALLBACK_URL = "https://speed.cloudflare.com/__down?bytes=20000";

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

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function classifyLine(line) {
  const lower = line.toLowerCase();
  if (
    lower.includes("error") ||
    lower.includes("fail") ||
    lower.includes("timeout") ||
    lower.includes("no response") ||
    lower.includes("unreachable") ||
    lower.includes("packet loss") ||
    lower.includes("issue detected") ||
    lower.includes("blocked")
  ) {
    return "out-bad";
  }
  if (
    lower.includes("warn") ||
    lower.includes("unstable") ||
    lower.includes("high") ||
    lower.includes("slow") ||
    lower.includes("loss")
  ) {
    return "out-warn";
  }
  if (lower.includes("ok") || lower.includes("ready")) {
    return "out-ok";
  }
  return "";
}

function renderLines(preEl, lines) {
  preEl.innerHTML = lines
    .map((line) => {
      const cls = classifyLine(line);
      const safe = escapeHtml(line);
      return cls
        ? `<span class="out-line ${cls}">${safe}</span>`
        : `<span class="out-line">${safe}</span>`;
    })
    .join("\n");
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
    await runPing(aborter.signal);
    const down = await runDownload(aborter.signal);
    setSpeed(down);
    const up = await runUpload(aborter.signal);
    setSpeed(up);
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
    runAutoDiagnosis();
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

async function loadInfo() {
  try {
    const res = await fetch("/info", { cache: "no-store" });
    const data = await res.json();
    systemValue.textContent = `${data.hostname} • ${data.platform}`;
    ipValue.textContent =
      data.localIPs && data.localIPs.length
        ? data.localIPs.map((ip) => `${ip.name}: ${ip.address}`).join(", ")
        : "—";
    ispValue.textContent = data.ispName || "Unavailable locally";
  } catch (err) {
    systemValue.textContent = "—";
    ipValue.textContent = "—";
    ispValue.textContent = "—";
  }
}

async function loadPublicIp() {
  try {
    const res = await fetch("/public-ip", { cache: "no-store" });
    const data = await res.json();
    publicIpValue.textContent = data.ip || "—";
    summaryPublicIp.textContent = data.ip || "—";
  } catch (err) {
    publicIpValue.textContent = "—";
    summaryPublicIp.textContent = "—";
  }
}

async function loadNetInfo() {
  try {
    const res = await fetch("/netinfo", { cache: "no-store" });
    const data = await res.json();
    const sections = [];
    for (const [name, text] of Object.entries(data)) {
      if (!text) continue;
      sections.push(`[${name}]`);
      sections.push(text.trim());
      sections.push("");
    }
    netinfoOutput.textContent = sections.join("\n");
  } catch (err) {
    netinfoOutput.textContent = "Unavailable";
  }
}

async function runTrace() {
  const host = traceHost.value.trim();
  if (!host) return;
  traceBtn.disabled = true;
  traceOutput.textContent = "Running...";
  try {
    const hops = Math.max(5, Math.min(Number(traceHops.value) || 20, 40));
    const timeout = Math.max(500, Math.min(Number(traceTimeout.value) || 2000, 5000));
    const res = await fetch(
      `/trace?host=${encodeURIComponent(host)}&hops=${hops}&timeout=${timeout}`,
      { cache: "no-store" }
    );
    const text = await res.text();
    traceOutput.textContent = text || "—";
  } catch (err) {
    traceOutput.textContent = "Traceroute error";
  } finally {
    traceBtn.disabled = false;
  }
}

function setTsStatus(el, ok, text) {
  const status = el.querySelector(".ts-status");
  status.textContent = text;
  if (ok === null) {
    el.style.borderColor = "rgba(250, 204, 21, 0.5)";
  } else {
    el.style.borderColor = ok ? "rgba(34, 197, 94, 0.45)" : "rgba(248, 113, 113, 0.45)";
  }
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

async function runAutoDiagnosis() {
  setStatus(autoDiagStatus, "Analyzing...", "out-warn");
  autoDiagList.innerHTML = "";
  const ping = toNumber(pingValue.textContent);
  const jitter = toNumber(jitterValue.textContent);
  const down = toNumber(downValue.textContent);
  const up = toNumber(upValue.textContent);

  const [burst, troubleshoot, latency] = await Promise.all([
    quickPingBurst(6).catch(() => null),
    fetch("/troubleshoot", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    fetch("/latency", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
  ]);

  const findings = [];
  const hints = [];
  const localOk = troubleshoot?.local?.ok;
  const internetOk = troubleshoot?.internet?.ok;
  const dnsOk = troubleshoot?.dns?.ok;

  if (localOk === false) {
    findings.push("Local gateway connectivity is unstable.");
    hints.push("Verify Wi‑Fi signal or Ethernet link, then reconnect.");
  }
  if (internetOk === false) {
    findings.push("ISP/WAN connectivity appears unavailable.");
    hints.push("Restart modem/router and check ISP outage status.");
  }
  if (dnsOk === false) {
    findings.push("DNS resolution is failing.");
    hints.push("Switch DNS to 1.1.1.1 or 8.8.8.8 and re-test.");
  }
  if (burst && burst.loss > 0) {
    findings.push("Packet loss detected during burst checks.");
    hints.push("Use Ethernet or reduce Wi‑Fi interference.");
  }
  if (Number.isFinite(ping) && ping > 80) {
    findings.push("Elevated latency detected.");
    hints.push("Use Ethernet or move closer to the router.");
  }
  if (Number.isFinite(jitter) && jitter > 25) {
    findings.push("Jitter is elevated (latency instability).");
    hints.push("Reduce background traffic and improve Wi‑Fi signal quality.");
  }
  if (Number.isFinite(down) && down < 10) {
    findings.push("Download throughput is low.");
    hints.push("Pause heavy traffic and re-test on Ethernet.");
  }
  if (Number.isFinite(up) && up < 3) {
    findings.push("Upload throughput is low.");
    hints.push("Re-test during off‑peak hours or on Ethernet.");
  }
  if (latency?.targets?.length) {
    const slow = latency.targets.find((t) => t.ok && t.ms > 200);
    if (slow) {
      findings.push(`High HTTP latency to ${slow.name}.`);
      hints.push("Possible congestion or ISP routing inefficiency.");
    }
  }

  if (!findings.length) {
    findings.push("No obvious issues detected.");
    hints.push("If issues persist, re-test on Ethernet.");
  }

  const localLabel =
    localOk === false ? "Issue detected" : localOk === true ? "OK" : "Unknown";
  const ispLabel =
    internetOk === false ? "Issue detected" : internetOk === true ? "OK" : "Unknown";
  setStatus(
    localStatus,
    localLabel,
    localOk === false ? "out-bad" : localOk === true ? "out-ok" : "out-warn"
  );
  setStatus(
    ispStatus,
    ispLabel,
    internetOk === false ? "out-bad" : internetOk === true ? "out-ok" : "out-warn"
  );
  splitHint.textContent =
    localOk === false
      ? "Local network is the bottleneck."
      : internetOk === false
        ? "ISP/WAN is the likely bottleneck."
        : "No clear bottleneck detected.";

  const level = findings[0] === "No obvious issues detected." ? "out-ok" : "out-bad";
  setStatus(autoDiagStatus, findings[0], level);
  hints.forEach((text) => {
    const item = document.createElement("div");
    item.className = "diag-list-item";
    item.textContent = text;
    autoDiagList.append(item);
  });
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

async function quickPingBurst(samples = 6) {
  let loss = 0;
  let total = 0;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    total += 1;
    const start = performance.now();
    try {
      const res = await fetchWithTimeout(remoteUrl("/__down", { bytes: PING_BYTES, i }), 2500);
      await res.arrayBuffer();
      sum += performance.now() - start;
    } catch {
      loss += 1;
    }
  }
  const okCount = total - loss;
  return {
    loss,
    total,
    avg: okCount ? sum / okCount : NaN,
  };
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

function pickSuggestions(context) {
  const steps = [];
  if (context.symptom === "single-device") {
    steps.push("Compare with another device on the same network.");
    steps.push("Reset the network adapter or reconnect to Wi‑Fi.");
  }
  if (!context.localOk) {
    steps.push("Verify router power/cabling or Wi‑Fi link, then reconnect.");
    steps.push("Confirm the device has a valid IP address.");
  } else if (context.internetOk === false) {
    steps.push("Restart modem/router and check ISP outage status.");
    steps.push("Verify WAN/PPPoE credentials if applicable.");
  }
  if (context.dnsOk === false) {
    steps.push("Switch DNS to a public resolver (1.1.1.1 or 8.8.8.8).");
    steps.push("Flush DNS cache or restart the device.");
  }
  if (context.httpOk === false && context.internetOk !== false) {
    steps.push("Check for a captive portal or proxy requirements.");
  }
  if (context.latencyWarn) {
    steps.push("Prefer Ethernet or reduce Wi‑Fi interference.");
  }
  if (context.symptom === "slow") {
    steps.push("Pause large transfers and re-test.");
    steps.push("Compare Wi‑Fi vs wired performance.");
  }
  if (context.symptom === "drops") {
    steps.push("Reduce Wi‑Fi interference and check channel congestion.");
  }
  if (!steps.length) {
    steps.push("No actionable issue detected; re-test at a different time.");
  }
  return steps;
}

async function runAssistant() {
  assistantRunBtn.disabled = true;
  assistantCopyBtn.disabled = true;
  renderLines(assistantOutput, ["Running assistant..."]);
  try {
    const host = assistantHost.value.trim() || "cloudflare.com";
    const burst = await quickPingBurst();
    const [troubleshoot, summary, publicIp, dnsTest, latency] = await Promise.all([
      fetch("/troubleshoot", { cache: "no-store" }).then((r) => r.json()),
      fetch("/summary", { cache: "no-store" }).then((r) => r.json()),
      fetch("/public-ip", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch(`/dns-test?host=${encodeURIComponent(host)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/latency", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);

    const localOk = troubleshoot?.local?.ok;
    const internetOk = troubleshoot?.internet?.ok;
    const dnsOk = troubleshoot?.dns?.ok;
    const httpOk = troubleshoot?.http?.ok;
    const latencyWarn =
      latency &&
      Array.isArray(latency.targets) &&
      latency.targets.some((t) => t.ok && t.ms > 180);

    const symptom = assistantSymptom.value;
    const likely = [];
    if (symptom === "no-internet") {
      if (localOk === false) likely.push("Local gateway unreachable from this device.");
      else if (internetOk === false) likely.push("ISP/WAN connectivity failure.");
      else if (httpOk === false) likely.push("HTTP blocked or captive portal detected.");
    }
    if (symptom === "dns" && dnsOk === false) {
      likely.push("DNS resolution failing on this device.");
    }
    if (symptom === "slow" && latencyWarn) {
      likely.push("Elevated latency detected; possible congestion or weak Wi‑Fi.");
    }
    if (symptom === "drops" && burst.loss > 0) {
      likely.push("Packet loss observed in quick burst checks.");
    }
    if (!likely.length) {
      likely.push("No clear fault detected from automated checks.");
    }

    const steps = pickSuggestions({
      localOk,
      internetOk,
      dnsOk,
      httpOk,
      latencyWarn,
      symptom,
    });

    const lines = [];
    lines.push(`Symptom: ${assistantSymptom.options[assistantSymptom.selectedIndex].text}`);
    lines.push(`Gateway: ${summary.gateway || troubleshoot.gateway || "—"}`);
    lines.push(`Public IP: ${publicIp.ip || "—"}`);
    lines.push(`DNS servers: ${
      summary.dnsServers && summary.dnsServers.length ? summary.dnsServers.join(", ") : "—"
    }`);
    lines.push(
      `Quick ping: ${Number.isFinite(burst.avg) ? `${formatMs(burst.avg)} ms avg` : "—"} • loss ${
        burst.total ? `${Math.round((burst.loss / burst.total) * 100)}%` : "—"
      }`
    );
    if (dnsTest) {
      lines.push(`DNS test (${dnsTest.host}): ${
        dnsTest.v4.ok || dnsTest.v6.ok ? "OK" : "Error"
      }`);
      if (dnsTest.v4.addresses?.length) lines.push(`- A: ${dnsTest.v4.addresses.join(", ")}`);
      if (dnsTest.v6.addresses?.length) lines.push(`- AAAA: ${dnsTest.v6.addresses.join(", ")}`);
      if (dnsTest.v4.error) lines.push(`- A error: ${dnsTest.v4.error}`);
      if (dnsTest.v6.error) lines.push(`- AAAA error: ${dnsTest.v6.error}`);
    }
    lines.push("");
    lines.push("Likely causes:");
    likely.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
    lines.push("Recommended actions:");
    steps.forEach((item, idx) => lines.push(`${idx + 1}. ${item}`));
    if (latency && latency.targets?.length) {
      lines.push("");
      lines.push("Latency probes:");
      latency.targets.forEach((t) => {
        lines.push(`- ${t.name}: ${t.ok ? `${t.ms} ms` : `error (${t.error || "fail"})`}`);
      });
    }
    renderLines(assistantOutput, lines);
    assistantCopyBtn.disabled = false;
  } catch (err) {
    renderLines(assistantOutput, ["Assistant failed to run."]);
  } finally {
    assistantRunBtn.disabled = false;
  }
}

function formatLoss(loss, total) {
  if (!total) return "—";
  return `${Math.round((loss / total) * 100)}%`;
}

async function runIssueFinder() {
  finderRunBtn.disabled = true;
  finderCopyBtn.disabled = true;
  renderLines(finderOutput, ["Running universal checks..."]);
  try {
    const host = finderHost.value.trim() || "cloudflare.com";
    const [summary, troubleshoot, publicIp, dnsTest, latency, burst, icmp] = await Promise.all([
      fetch("/summary", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/troubleshoot", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/public-ip", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch(`/dns-test?host=${encodeURIComponent(host)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/latency", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      quickPingBurst(8).catch(() => null),
      fetch(`/icmp?host=${encodeURIComponent(host)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ]);

    const localOk = troubleshoot?.local?.ok;
    const internetOk = troubleshoot?.internet?.ok;
    const dnsOk = troubleshoot?.dns?.ok;
    const httpOk = troubleshoot?.http?.ok;
    const issues = [];
    const actions = [];

    if (localOk === false) {
      issues.push("Local gateway unreachable (Wi‑Fi or cable issue).");
      actions.push("Verify Wi‑Fi signal or Ethernet link, then reconnect.");
    }
    if (internetOk === false) {
      issues.push("ISP/WAN connectivity failure.");
      actions.push("Restart modem/router and check ISP outages.");
    }
    if (dnsOk === false) {
      issues.push("DNS resolution failing.");
      actions.push("Switch DNS to 1.1.1.1 or 8.8.8.8 and retry.");
    }
    if (httpOk === false && internetOk !== false) {
      issues.push("HTTP access blocked or captive portal.");
      actions.push("Check captive portal or proxy/VPN configuration.");
    }
    if (burst && burst.loss > 0) {
      issues.push(`Packet loss detected (${formatLoss(burst.loss, burst.total)}).`);
      actions.push("Use Ethernet or reduce Wi‑Fi interference.");
    }
    if (burst && Number.isFinite(burst.avg) && burst.avg > 120) {
      issues.push("Elevated latency to the edge detected.");
      actions.push("Use a wired connection or improve Wi‑Fi signal quality.");
    }
    if (latency?.targets?.length) {
      const slow = latency.targets.find((t) => t.ok && t.ms > 220);
      if (slow) {
        issues.push(`High HTTP latency to ${slow.name}.`);
        actions.push("Possible ISP routing or congestion issue.");
      }
    }

    if (!issues.length) {
      issues.push("No obvious issues detected.");
      actions.push("If issues persist, test on Ethernet or re-run later.");
    }

    const lines = [];
    lines.push("Issue Finder Report");
    lines.push("===================");
    lines.push(`Host: ${host}`);
    lines.push(`Public IP: ${publicIp.ip || "—"}`);
    lines.push(`Gateway: ${summary.gateway || troubleshoot.gateway || "—"}`);
    lines.push(`DNS servers: ${
      summary.dnsServers && summary.dnsServers.length ? summary.dnsServers.join(", ") : "—"
    }`);
    if (burst) {
      lines.push(
        `Burst ping: ${
          Number.isFinite(burst.avg) ? `${formatMs(burst.avg)} ms avg` : "—"
        } • loss ${formatLoss(burst.loss, burst.total)}`
      );
    }
    if (dnsTest) {
      lines.push(`DNS test (${dnsTest.host}): ${
        dnsTest.v4.ok || dnsTest.v6.ok ? "OK" : "Error"
      }`);
    }
    if (icmp && Number.isFinite(icmp.avgMs)) {
      lines.push(`ICMP avg: ${Math.round(icmp.avgMs)} ms`);
      summaryIcmp.textContent = `${Math.round(icmp.avgMs)} ms`;
    } else if (icmp && icmp.error) {
      lines.push(`ICMP: ${icmp.error}`);
      summaryIcmp.textContent = "Unavailable";
    }
    if (latency?.targets?.length) {
      lines.push("HTTP latency:");
      latency.targets.forEach((t) => {
        lines.push(`- ${t.name}: ${t.ok ? `${t.ms} ms` : `error (${t.error || "fail"})`}`);
      });
    }
    lines.push("");
    lines.push("Likely issues:");
    issues.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
    lines.push("Recommended actions:");
    actions.forEach((item, idx) => lines.push(`${idx + 1}. ${item}`));

    renderLines(finderOutput, lines);
    finderCopyBtn.disabled = false;
  } catch (err) {
    renderLines(finderOutput, ["Issue Finder failed to run."]);
  } finally {
    finderRunBtn.disabled = false;
  }
}

async function runProviderCheck() {
  providerBtn.disabled = true;
  providerOutput.textContent = "Checking providers...";
  try {
    const res = await fetch("/provider-check", { cache: "no-store" });
    const data = await res.json();
    if (!Array.isArray(data.providers) || !data.providers.length) {
      providerOutput.textContent = "No provider data available.";
      return;
    }
    const best = data.providers.find((p) => p.ok && p.cors) || data.providers[0];
    if (best?.ok && best?.cors) {
      latencyProvider = { name: best.name, url: best.url };
    } else {
      latencyProvider = { name: "Cloudflare speed (default)", url: LATENCY_FALLBACK_URL };
      updateSummary();
    }
    const lines = data.providers.map((p, idx) => {
      const label = `${p.name}: ${p.ok ? `${p.ms} ms` : "error"}${p.cors ? "" : " (no CORS)"}`;
      return p === best ? `Best: ${label}` : `- ${label}`;
    });
    providerOutput.textContent = lines.join("\n");
  } catch (err) {
    providerOutput.textContent = "Provider check failed.";
  } finally {
    providerBtn.disabled = false;
  }
}

async function runTroubleshoot() {
  troubleshootBtn.disabled = true;
  renderLines(troubleshootOutput, ["Running checks..."]);
  setTsStatus(tsLocal, true, "Checking...");
  setTsStatus(tsInternet, true, "Checking...");
  setTsStatus(tsDns, true, "Checking...");
  setTsStatus(tsHttp, true, "Checking...");
  try {
    const res = await fetch("/troubleshoot", { cache: "no-store" });
    const data = await res.json();
    setTsStatus(tsLocal, data.local.ok, data.local.label);
    setTsStatus(tsInternet, data.internet.ok, data.internet.label);
    setTsStatus(tsDns, data.dns.ok, data.dns.label);
    setTsStatus(tsHttp, data.http.ok, data.http.label);
    const blocks = [];
    blocks.push(`[gateway] ${data.gateway || "—"}`);
    blocks.push("");
    blocks.push("[local]");
    blocks.push((data.local.output || "").trim());
    blocks.push("");
    blocks.push("[internet]");
    blocks.push((data.internet.output || "").trim());
    blocks.push("");
    blocks.push("[dns]");
    blocks.push((data.dns.output || "").trim());
    blocks.push("");
    blocks.push("[http]");
    blocks.push((data.http.output || "").trim());
    renderLines(troubleshootOutput, blocks);
  } catch (err) {
    renderLines(troubleshootOutput, ["Checks failed"]);
    setTsStatus(tsLocal, false, "Error");
    setTsStatus(tsInternet, false, "Error");
    setTsStatus(tsDns, false, "Error");
    setTsStatus(tsHttp, false, "Error");
  } finally {
    troubleshootBtn.disabled = false;
  }
}

function renderDiagOutputs(outputs) {
  diagOutputs.innerHTML = "";
  const entries = Object.values(outputs || {});
  entries.forEach((item) => {
    const block = document.createElement("div");
    block.className = "diag-block";
    const title = document.createElement("div");
    title.className = "diag-title";
    title.textContent = item.label || "Output";
    const pre = document.createElement("pre");
    pre.className = "diag-pre";
    const lines = (item.output || "—").split(/\r?\n/);
    renderLines(pre, lines);
    block.append(title, pre);
    diagOutputs.append(block);
  });
}

async function runDiag() {
  diagBtn.disabled = true;
  diagStatus.textContent = "Collecting...";
  try {
    const res = await fetch("/diag", { cache: "no-store" });
    const data = await res.json();
    diagGateway.textContent = data.summary.gateway || "—";
    diagDns.textContent =
      data.summary.dnsServers && data.summary.dnsServers.length
        ? data.summary.dnsServers.join(", ")
        : "—";
    diagIfaces.textContent =
      data.summary.interfaces && data.summary.interfaces.length
        ? data.summary.interfaces
            .map((i) => `${i.name} ${i.address} ${i.family} ${i.mac}`)
            .join(" | ")
        : "—";
    renderDiagOutputs(data.outputs);
    diagStatus.textContent = "Done";
  } catch (err) {
    diagStatus.textContent = "Error";
  } finally {
    diagBtn.disabled = false;
  }
}

async function loadSummary() {
  try {
    const res = await fetch("/summary", { cache: "no-store" });
    const data = await res.json();
    summaryGateway.textContent = data.gateway || "—";
    summaryDns.textContent =
      data.dnsServers && data.dnsServers.length ? data.dnsServers.join(", ") : "—";
  } catch {
    summaryGateway.textContent = "—";
    summaryDns.textContent = "—";
  }
}

startBtn.addEventListener("click", runTest);
stopBtn.addEventListener("click", () => {
  if (aborter) aborter.abort();
});
traceBtn.addEventListener("click", runTrace);
troubleshootBtn.addEventListener("click", runTroubleshoot);
diagBtn.addEventListener("click", runDiag);
monitorStartBtn.addEventListener("click", startMonitor);
monitorStopBtn.addEventListener("click", stopMonitor);
assistantRunBtn.addEventListener("click", runAssistant);
assistantCopyBtn.addEventListener("click", () => {
  if (!assistantOutput.textContent || assistantOutput.textContent === "—") return;
  navigator.clipboard.writeText(assistantOutput.textContent).catch(() => {});
});
finderRunBtn.addEventListener("click", runIssueFinder);
finderCopyBtn.addEventListener("click", () => {
  if (!finderOutput.textContent || finderOutput.textContent === "—") return;
  navigator.clipboard.writeText(finderOutput.textContent).catch(() => {});
});
providerBtn.addEventListener("click", runProviderCheck);
loadInfo();
loadPublicIp();
loadNetInfo();
loadSummary();
updateSummary();
setMonitorStatus("Idle", "rgba(148, 163, 184, 0.5)");
renderHistory();
runProviderCheck();
