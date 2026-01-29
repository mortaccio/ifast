# IFAST

Local network diagnostics and speed test for quick troubleshooting.

## Run from source
Requires Node.js 18+.

```
npm install
npm start
```

Open: http://localhost:3000

## Run as a desktop app (Electron)
```
npm install
npm run desktop
```

## Build a Windows desktop app (portable .exe)
```
npm install
npm run desktop:dist
```

Output file (portable): `dist/IFAST Desktop.exe`

## Build .exe for Windows (to share)
1) Install Node.js 18+ (Windows x64).
2) In the project root:

```
npm install
npm run build:win
```

Output file: `dist/ifast.exe`

## How friends run it (Windows)
- They get `ifast.exe`
- Double-click to start
- Open `http://localhost:3000` in a browser

## Notes
- Speed test traffic goes to Cloudflare's public edge endpoints.
- Diagnostics and OS command output are collected locally by the host machine.
- Internet access is required for public IP, latency, and speed tests.
