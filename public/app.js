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

let aborter = null;
let monitorTimer = null;
let monitorHistory = [];
let monitorTotal = 0;
let monitorLossCount = 0;

const MBITS = 1_000_000;
const REMOTE_TEST_BASE = "https://speed.cloudflare.com";
const PING_BYTES = 20000;
const DOWNLOAD_RUNS_MB = [10, 25, 50];
const UPLOAD_RUNS_MB = [5, 10];

function remoteUrl(path, params = {}) {
  const url = new URL(path, REMOTE_TEST_BASE);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("t", Date.now().toString());
  return url.toString();
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
    const res = await fetch(remoteUrl("/__down", { bytes: PING_BYTES, i }), {
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

  const bars = monitorHistory.slice(-24);
  monitorSpark.innerHTML = "";
  const max = Math.max(60, ...bars.map((b) => (b.ok ? b.ms : 0)));
  bars.forEach((sample) => {
    const bar = document.createElement("div");
    bar.className = "monitor-bar";
    if (!sample.ok) {
      bar.classList.add("bad");
      bar.style.height = "12%";
    } else if (sample.ms > 120) {
      bar.classList.add("warn");
      bar.style.height = `${Math.min(100, (sample.ms / max) * 100)}%`;
    } else {
      bar.style.height = `${Math.min(100, (sample.ms / max) * 100)}%`;
    }
    monitorSpark.append(bar);
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
    const res = await fetchWithTimeout(remoteUrl("/__down", { bytes: PING_BYTES }), 2500);
    await res.arrayBuffer();
    const ms = performance.now() - start;
    monitorHistory.push({ ok: true, ms });
    setMonitorStatus("Monitoring", "rgba(34, 197, 94, 0.7)");
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
  monitorTimer = setInterval(monitorTick, 1500);
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
    steps.push("Test another device on the same network to compare.");
    steps.push("Restart the network adapter or forget/rejoin Wi-Fi.");
  }
  if (!context.localOk) {
    steps.push("Check router power/cables or Wi-Fi link, then reconnect.");
    steps.push("Confirm the device has a valid IP (not 169.254.x.x).");
  } else if (context.internetOk === false) {
    steps.push("Reboot modem/router and check ISP outage status.");
    steps.push("Verify WAN/PPPoE credentials if your router uses them.");
  }
  if (context.dnsOk === false) {
    steps.push("Switch DNS to 1.1.1.1 or 8.8.8.8 temporarily.");
    steps.push("Flush DNS cache or restart the device.");
  }
  if (context.httpOk === false && context.internetOk !== false) {
    steps.push("Open a browser to test for captive portal or proxy.");
  }
  if (context.latencyWarn) {
    steps.push("Move closer to the router or use Ethernet for stability.");
  }
  if (context.symptom === "slow") {
    steps.push("Pause large downloads/updates and re-test.");
    steps.push("Try Ethernet to compare Wi-Fi vs wired speeds.");
  }
  if (context.symptom === "drops") {
    steps.push("Reduce Wi-Fi interference and check channel congestion.");
  }
  if (!steps.length) {
    steps.push("Everything looks healthy. If issues persist, try a router reboot.");
  }
  return steps;
}

async function runAssistant() {
  assistantRunBtn.disabled = true;
  assistantCopyBtn.disabled = true;
  assistantOutput.textContent = "Running assistant...";
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
      if (localOk === false) likely.push("Router unreachable from this device.");
      else if (internetOk === false) likely.push("ISP/WAN connectivity failure.");
      else if (httpOk === false) likely.push("Captive portal or blocked HTTP.");
    }
    if (symptom === "dns" && dnsOk === false) {
      likely.push("DNS resolution failing on this device.");
    }
    if (symptom === "slow" && latencyWarn) {
      likely.push("High latency detected; congestion or weak signal possible.");
    }
    if (symptom === "drops" && burst.loss > 0) {
      likely.push("Packet loss observed in quick ping burst.");
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
    assistantOutput.textContent = lines.join("\n");
    assistantCopyBtn.disabled = false;
  } catch (err) {
    assistantOutput.textContent = "Assistant failed to run.";
  } finally {
    assistantRunBtn.disabled = false;
  }
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
monitorStartBtn.addEventListener("click", startMonitor);
monitorStopBtn.addEventListener("click", stopMonitor);
assistantRunBtn.addEventListener("click", runAssistant);
assistantCopyBtn.addEventListener("click", () => {
  if (!assistantOutput.textContent || assistantOutput.textContent === "—") return;
  navigator.clipboard.writeText(assistantOutput.textContent).catch(() => {});
});
loadInfo();
loadPublicIp();
loadNetInfo();
loadSummary();
updateSummary();
setMonitorStatus("Idle", "rgba(148, 163, 184, 0.5)");
