# SURAKSHA — FINALFRONT

A React + Vite rebuild of the SURAKSHA cold-chain dashboard, matching the
reference design: sidebar navigation, live stats, a real interactive map
(Leaflet, dark tiles) with a planned/alternate route and truck marker,
a weather + forecast panel, and a predictive risk panel.

## Run it

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://127.0.0.1:5174`) in your browser.

To stop the server, press `Ctrl+C` in the terminal.

## Build a static production bundle

```bash
npm run build
npm run preview
```

`npm run build` writes optimized files to `dist/`. Because it uses ES module
`<script>` tags, `dist/index.html` needs to be served over `http://` (via
`npm run preview`, or any static file server) — opening it directly from disk
(`file://`) will not work in most browsers.

## Notes

- The map uses live CartoDB dark tiles over the open internet, so it needs
  an internet connection to load.
- All data on the dashboard (temperature, humidity, ETA, risk scores, etc.)
  is static mock data matching the reference screenshot — there's no backend
  wired up yet.
