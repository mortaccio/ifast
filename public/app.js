const speedValue = document.getElementById("speedValue");
const pingValue = document.getElementById("pingValue");
const downValue = document.getElementById("downValue");
const upValue = document.getElementById("upValue");
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

let aborter = null;

const MBITS = 1_000_000;

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

function setPhase(text) {
  phase.textContent = text;
}

function setSpeed(value) {
  speedValue.textContent = formatMbps(value);
  updateSummary();
}

function resetValues() {
  setSpeed(NaN);
  pingValue.textContent = "—";
  jitterValue.textContent = "—";
  downValue.textContent = "—";
  upValue.textContent = "—";
  sessionValue.textContent = "—";
  updateSummary();
}

async function runPing(signal) {
  setPhase("Ping check");
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const start = performance.now();
    await fetch(`/ping?i=${i}&t=${Date.now()}`, { signal, cache: "no-store" });
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
  const runs = [16, 24, 32].map((mb) => mb * 1024 * 1024);
  let totalBytes = 0;
  let totalTime = 0;

  for (const bytes of runs) {
    const start = performance.now();
    const res = await fetch(`/download?bytes=${bytes}&t=${Date.now()}`, {
      signal,
      cache: "no-store",
    });
    const reader = res.body.getReader();
    let received = 0;
    // Stream the response to avoid buffering everything.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
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
  const runs = [8, 12].map((mb) => mb * 1024 * 1024);
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
    await fetch(`/upload?t=${Date.now()}`, {
      method: "POST",
      body: payload,
      signal,
      cache: "no-store",
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

  const sessionStart = new Date();
  sessionValue.textContent = sessionStart.toLocaleTimeString("en-US");

  try {
    await runPing(aborter.signal);
    const down = await runDownload(aborter.signal);
    setSpeed(down);
    const up = await runUpload(aborter.signal);
    setSpeed(up);
    setPhase("Done");
  } catch (err) {
    if (err.name !== "AbortError") {
      setPhase("Test error");
    } else {
      setPhase("Stopped");
    }
  } finally {
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

async function runTroubleshoot() {
  troubleshootBtn.disabled = true;
  troubleshootOutput.textContent = "Running checks...";
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
    troubleshootOutput.textContent = blocks.join("\n");
  } catch (err) {
    troubleshootOutput.textContent = "Checks failed";
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
    pre.textContent = item.output || "—";
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
loadInfo();
loadPublicIp();
loadNetInfo();
loadSummary();
updateSummary();
