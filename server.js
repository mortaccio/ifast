const http = require("http");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const crypto = require("crypto");
const os = require("os");
const { execFile } = require("child_process");
const https = require("https");
const dns = require("dns");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function runCmd(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        output: (stdout || stderr || err?.message || "").toString(),
      });
    });
  });
}

async function getGateway() {
  const isWin = process.platform === "win32";
  if (isWin) {
    const { output } = await runCmd("ipconfig", ["/all"]);
    const lines = output.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/Default Gateway/i.test(line)) {
        const match = line.match(/:\s*([0-9.]+)/);
        if (match) return match[1];
        const next = lines[i + 1] || "";
        const matchNext = next.match(/([0-9.]+)/);
        if (matchNext) return matchNext[1];
      }
    }
    return null;
  }
  if (process.platform === "darwin") {
    const { output } = await runCmd("route", ["-n", "get", "default"]);
    const match = output.match(/gateway:\s*([0-9.]+)/);
    return match ? match[1] : null;
  }
  const { output } = await runCmd("ip", ["route", "show", "default"]);
  const match = output.match(/default via ([0-9.]+)/);
  return match ? match[1] : null;
}

function isPingBlocked(output = "") {
  return /Operation not permitted|SOCK_RAW|cap_net_raw/i.test(output);
}

async function checkNeighbor(gateway) {
  if (!gateway) return { ok: false, output: "" };
  if (process.platform === "darwin") {
    return runCmd("arp", ["-n", gateway], 8000);
  }
  if (process.platform === "win32") {
    return runCmd("arp", ["-a", gateway], 8000);
  }
  const ipNeigh = await runCmd("ip", ["neigh", "show", gateway], 8000);
  if (ipNeigh.ok && ipNeigh.output.trim()) return ipNeigh;
  return runCmd("arp", ["-n", gateway], 8000);
}

async function getDnsServers() {
  if (process.platform === "win32") {
    const { output } = await runCmd("ipconfig", ["/all"]);
    const servers = [];
    const lines = output.split(/\r?\n/);
    let inDnsBlock = false;
    for (const line of lines) {
      if (/DNS Servers/i.test(line)) {
        inDnsBlock = true;
        const match = line.match(/:\s*([0-9.]+)/);
        if (match) servers.push(match[1]);
        continue;
      }
      if (inDnsBlock) {
        const match = line.match(/^\s+([0-9.]+)\s*$/);
        if (match) {
          servers.push(match[1]);
        } else if (line.trim() === "") {
          inDnsBlock = false;
        }
      }
    }
    return [...new Set(servers)];
  }
  if (process.platform === "darwin") {
    const { output } = await runCmd("scutil", ["--dns"]);
    const servers = [];
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/nameserver\[\d+\]\s*:\s*([0-9.]+)/);
      if (match) servers.push(match[1]);
    }
    return [...new Set(servers)];
  }
  try {
    const data = fs.readFileSync("/etc/resolv.conf", "utf8");
    const servers = data
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("nameserver"))
      .map((line) => line.split(/\s+/)[1])
      .filter(Boolean);
    return [...new Set(servers)];
  } catch {
    return [];
  }
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body instanceof Buffer || typeof body === "string") {
    res.end(body);
  } else if (body) {
    body.pipe(res);
  } else {
    res.end();
  }
}

function serveStatic(req, res) {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, { "Content-Type": "text/plain" }, "Forbidden");
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return send(res, 404, { "Content-Type": "text/plain" }, "Not Found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function makeRandomStream(totalBytes) {
  let remaining = totalBytes;
  return new Readable({
    read(size) {
      if (remaining <= 0) {
        this.push(null);
        return;
      }
      const chunkSize = Math.min(remaining, Math.max(16384, size || 65536));
      remaining -= chunkSize;
      this.push(crypto.randomBytes(chunkSize));
    },
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/ping") {
    return send(
      res,
      200,
      { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      JSON.stringify({ ok: true, ts: Date.now() })
    );
  }

  if (url.pathname === "/download") {
    const bytes = Math.max(0, Math.min(Number(url.searchParams.get("bytes")) || 0, 200 * 1024 * 1024));
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes,
      "Cache-Control": "no-store",
    });
    return makeRandomStream(bytes).pipe(res);
  }

  if (url.pathname === "/upload" && req.method === "POST") {
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
    });
    req.on("end", () => {
      send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        JSON.stringify({ ok: true, bytes })
      );
    });
    return;
  }

  if (url.pathname === "/info") {
    const interfaces = os.networkInterfaces();
    const addrs = [];
    for (const [name, entries] of Object.entries(interfaces)) {
      for (const entry of entries || []) {
        if (entry.family === "IPv4" && !entry.internal) {
          addrs.push({ name, address: entry.address });
        }
      }
    }
    const payload = {
      hostname: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
      uptimeSec: os.uptime(),
      localIPs: addrs,
      interfaces,
      ispName: process.env.ISP_NAME || null,
      now: Date.now(),
    };
    return send(
      res,
      200,
      { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      JSON.stringify(payload)
    );
  }

  if (url.pathname === "/summary") {
    (async () => {
      const interfaces = os.networkInterfaces();
      const addrs = [];
      for (const [name, entries] of Object.entries(interfaces)) {
        for (const entry of entries || []) {
          if (entry.family === "IPv4" && !entry.internal) {
            addrs.push({ name, address: entry.address });
          }
        }
      }
      const gateway = await getGateway();
      const dnsServers = await getDnsServers();
      const payload = {
        gateway,
        dnsServers,
        localIPs: addrs,
        ispName: process.env.ISP_NAME || null,
        now: Date.now(),
      };
      send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        JSON.stringify(payload)
      );
    })();
    return;
  }

  if (url.pathname === "/public-ip") {
    const reqIp = https.get("https://api.ipify.org?format=json", (resp) => {
      let data = "";
      resp.on("data", (chunk) => (data += chunk));
      resp.on("end", () => {
        send(
          res,
          200,
          { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
          data
        );
      });
    });
    reqIp.on("error", (err) => {
      send(
        res,
        500,
        { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        JSON.stringify({ error: err.message })
      );
    });
    return;
  }

  if (url.pathname === "/netinfo") {
    const isWin = process.platform === "win32";
    const commands = isWin
      ? [
          { name: "ipconfig", cmd: "ipconfig", args: ["/all"] },
          { name: "route", cmd: "route", args: ["print"] },
          { name: "wifi", cmd: "netsh", args: ["wlan", "show", "interfaces"] },
        ]
      : process.platform === "darwin"
        ? [
            { name: "ifconfig", cmd: "ifconfig", args: [] },
            { name: "route", cmd: "netstat", args: ["-rn"] },
            { name: "wifi", cmd: "networksetup", args: ["-getinfo", "Wi-Fi"] },
          ]
        : [
            { name: "ip", cmd: "ip", args: ["addr"] },
            { name: "route", cmd: "ip", args: ["route"] },
            { name: "dns", cmd: "cat", args: ["/etc/resolv.conf"] },
          ];

    const results = {};
    let pending = commands.length;

    commands.forEach(({ name, cmd, args }) => {
      execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
        results[name] = (stdout || stderr || err?.message || "").toString();
        pending -= 1;
        if (pending === 0) {
          send(
            res,
            200,
            { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
            JSON.stringify(results)
          );
        }
      });
    });
    return;
  }

  if (url.pathname === "/diag") {
    (async () => {
      const isWin = process.platform === "win32";
      const gateway = await getGateway();
      const dnsServers = await getDnsServers();
      const interfaces = os.networkInterfaces();
      const ifaceSummary = [];
      for (const [name, entries] of Object.entries(interfaces)) {
        for (const entry of entries || []) {
          if (!entry.internal) {
            ifaceSummary.push({
              name,
              address: entry.address,
              family: entry.family,
              mac: entry.mac,
            });
          }
        }
      }

      const commands = isWin
        ? [
            { name: "ipconfig_all", label: "ipconfig /all", cmd: "ipconfig", args: ["/all"] },
            { name: "routes", label: "route print", cmd: "route", args: ["print"] },
            { name: "arp", label: "arp -a", cmd: "arp", args: ["-a"] },
            {
              name: "ipv4_cfg",
              label: "netsh interface ipv4 show config",
              cmd: "netsh",
              args: ["interface", "ipv4", "show", "config"],
            },
            {
              name: "ipv6_cfg",
              label: "netsh interface ipv6 show config",
              cmd: "netsh",
              args: ["interface", "ipv6", "show", "config"],
            },
            {
              name: "wifi",
              label: "netsh wlan show interfaces",
              cmd: "netsh",
              args: ["wlan", "show", "interfaces"],
            },
            {
              name: "proxy",
              label: "netsh winhttp show proxy",
              cmd: "netsh",
              args: ["winhttp", "show", "proxy"],
            },
            { name: "netstat", label: "netstat -an", cmd: "netstat", args: ["-an"] },
          ]
        : process.platform === "darwin"
          ? [
              { name: "ifconfig", label: "ifconfig", cmd: "ifconfig", args: [] },
              { name: "routes", label: "netstat -rn", cmd: "netstat", args: ["-rn"] },
              { name: "arp", label: "arp -a", cmd: "arp", args: ["-a"] },
              { name: "dns", label: "scutil --dns", cmd: "scutil", args: ["--dns"] },
              {
                name: "wifi",
                label: "networksetup -getinfo Wi-Fi",
                cmd: "networksetup",
                args: ["-getinfo", "Wi-Fi"],
              },
              {
                name: "ports",
                label: "networksetup -listallhardwareports",
                cmd: "networksetup",
                args: ["-listallhardwareports"],
              },
              {
                name: "proxy",
                label: "networksetup -getwebproxy Wi-Fi",
                cmd: "networksetup",
                args: ["-getwebproxy", "Wi-Fi"],
              },
              { name: "netstat", label: "netstat -an", cmd: "netstat", args: ["-an"] },
            ]
          : [
              { name: "ip_addr", label: "ip addr", cmd: "ip", args: ["addr"] },
              { name: "ip_link", label: "ip link", cmd: "ip", args: ["link"] },
              { name: "ip_route", label: "ip route", cmd: "ip", args: ["route"] },
              { name: "arp", label: "ip neigh", cmd: "ip", args: ["neigh"] },
              { name: "dns", label: "cat /etc/resolv.conf", cmd: "cat", args: ["/etc/resolv.conf"] },
              { name: "netstat", label: "ss -tuna", cmd: "ss", args: ["-tuna"] },
              { name: "proxy", label: "env | grep -i proxy", cmd: "sh", args: ["-lc", "env | grep -i proxy"] },
            ];

      const outputs = {};
      for (const item of commands) {
        // Avoid huge delays: each command individually times out.
        // eslint-disable-next-line no-await-in-loop
        const result = await runCmd(item.cmd, item.args, 15000);
        outputs[item.name] = {
          label: item.label,
          ok: result.ok,
          output: result.output,
        };
      }

      const payload = {
        summary: {
          hostname: os.hostname(),
          platform: `${os.platform()} ${os.release()}`,
          uptimeSec: os.uptime(),
          gateway,
          dnsServers,
          interfaces: ifaceSummary,
        },
        outputs,
        now: Date.now(),
      };

      send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        JSON.stringify(payload)
      );
    })();
    return;
  }

  if (url.pathname === "/troubleshoot") {
    (async () => {
      const isWin = process.platform === "win32";
      const gateway = await getGateway();
      let local = { ok: false, label: "Gateway not found", output: "" };
      if (gateway) {
        const pingArgs = isWin ? ["-n", "2", "-w", "2000", gateway] : ["-c", "2", gateway];
        const localPing = await runCmd("ping", pingArgs, 15000);
        if (!localPing.ok && isPingBlocked(localPing.output)) {
          const neigh = await checkNeighbor(gateway);
          local = {
            ok: neigh.ok ? true : null,
            label: neigh.ok ? "Reachable (ARP)" : "Ping blocked",
            output: `${localPing.output}\n${neigh.output}`.trim(),
          };
        } else {
          local = {
            ok: localPing.ok,
            label: localPing.ok ? "OK" : "No response",
            output: localPing.output,
          };
        }
      }

      const internetPing = await runCmd(
        "ping",
        isWin ? ["-n", "2", "-w", "2000", "1.1.1.1"] : ["-c", "2", "1.1.1.1"],
        15000
      );
      const internetPingBlocked = !internetPing.ok && isPingBlocked(internetPing.output);

      let dns = await runCmd("nslookup", ["cloudflare.com"], 15000);
      if (!dns.ok && !isWin) {
        dns = await runCmd("getent", ["hosts", "cloudflare.com"], 15000);
      }

      const httpCheck = await new Promise((resolve) => {
        const req = https.get("https://www.gstatic.com/generate_204", (resp) => {
          resolve({ ok: resp.statusCode === 204, output: `HTTP ${resp.statusCode}` });
        });
        req.on("error", (err) => resolve({ ok: false, output: err.message }));
        req.setTimeout(6000, () => {
          req.destroy();
          resolve({ ok: false, output: "HTTP timeout" });
        });
      });

      const payload = {
        gateway,
        local: {
          ok: local.ok,
          label: local.label,
          output: local.output,
        },
        internet: {
          ok: internetPing.ok ? true : internetPingBlocked ? null : false,
          label: internetPing.ok ? "OK" : internetPingBlocked ? "Ping blocked" : "No response",
          output: internetPing.output,
        },
        dns: {
          ok: dns.ok,
          label: dns.ok ? "OK" : "Error",
          output: dns.output,
        },
        http: {
          ok: httpCheck.ok,
          label: httpCheck.ok ? "OK" : "Error",
          output: httpCheck.output,
        },
        now: Date.now(),
      };

      send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        JSON.stringify(payload)
      );
    })();
    return;
  }

  if (url.pathname === "/trace") {
    const host = (url.searchParams.get("host") || "").trim();
    if (!host || host.length > 128 || !/^[a-zA-Z0-9.\-:]+$/.test(host)) {
      return send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad host");
    }
    const isWin = process.platform === "win32";
    const hops = Math.max(5, Math.min(Number(url.searchParams.get("hops")) || 20, 40));
    const timeoutMs = Math.max(500, Math.min(Number(url.searchParams.get("timeout")) || 2000, 5000));
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const args = isWin
      ? ["-d", "-h", String(hops), "-w", String(timeoutMs), host]
      : ["-n", "-m", String(hops), "-w", String(timeoutSec), host];
    const cmd = isWin ? "tracert" : "traceroute";

    execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        // Fallback for systems without traceroute.
        if (!isWin) {
          execFile("tracepath", ["-n", host], { timeout: 15000 }, (err2, out2, err2out) => {
            if (err2 && !out2) {
              return send(
                res,
                500,
                { "Content-Type": "text/plain; charset=utf-8" },
                (err2out || err2.message || "Trace failed").toString()
              );
            }
            return send(
              res,
              200,
              { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
              out2.toString()
            );
          });
          return;
        }
        return send(
          res,
          500,
          { "Content-Type": "text/plain; charset=utf-8" },
          (stderr || err.message || "Trace failed").toString()
        );
      }
      return send(
        res,
        200,
        { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        (stdout || stderr || "").toString()
      );
    });
    return;
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Speed test running at http://localhost:${PORT}`);
});
