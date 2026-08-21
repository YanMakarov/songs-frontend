import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = (env.VITE_API_BASE_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );

  return defineConfig({
    plugins: [
      react(),
      VitePWA({
        // 'prompt', not 'autoUpdate': a new build must never reload the tab on
        // its own. On stage that would wipe the screen mid-song; while editing
        // it would race the write queue. The banner lets the user pick the
        // moment, and until they do the old shell keeps working.
        registerType: "prompt",
        // Registration lives in components/PwaUpdateBanner.jsx, which also
        // owns the UI for it. No `includeAssets`: the icons sit in public/ and
        // the glob below already precaches them — listing them twice puts
        // duplicate entries in the precache manifest.
        injectRegister: null,
        manifest: {
          id: "/",
          name: "Chords",
          short_name: "Chords",
          description:
            "Аккорды и тексты песен группы: сетлист, транспонирование, работа офлайн.",
          lang: "ru",
          dir: "ltr",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "any",
          background_color: "#F2F2F7",
          theme_color: "#F2F2F7",
          categories: ["music", "productivity"],
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
            // Separate file, not `purpose: 'any maskable'` on the one above:
            // a launcher crops maskable icons to ~80% and the shared file
            // would lose its edges.
            {
              src: "pwa-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          shortcuts: [
            {
              name: "Библиотека аккордов",
              short_name: "Аккорды",
              url: "/chords-library",
              icons: [
                { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
              ],
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
          // Any in-app route must resolve to the shell offline, the same way
          // nginx rewrites unknown paths to index.html when online.
          navigateFallback: "index.html",
          // The dev proxy puts the API on this origin too; without the denylist
          // a request to /setlists would be answered with the HTML shell.
          // Every router prefix the backend registers has to be listed —
          // /auth most of all, since a login answered with the shell fails in
          // a way that looks like a broken password.
          navigateFallbackDenylist: [
            /^\/setlists\//,
            /^\/auth\//,
            /^\/movable-shapes/,
            /^\/pdf\//,
            /^\/health$/,
          ],
          cleanupOutdatedCaches: true,
          // No runtime caching for the API — deliberately. Song data is already
          // offline through the persisted React Query cache, and it is the
          // layer that knows about `rev`, ETags and the write queue. A second
          // cache in the service worker could hand the app a stale body that
          // silently loses a conditional write.
          navigationPreload: false,
        },
        devOptions: {
          // Off by default: a service worker in dev caches modules and turns
          // "why is my edit not showing" into a half-hour. Enable per-run with
          // VITE_PWA_DEV=true npm run dev to test install/update flows.
          enabled: env.VITE_PWA_DEV === "true",
          type: "module",
          navigateFallback: "index.html",
        },
      }),
    ],
    server: {
      // Mirrors the backend's router prefixes. `changeOrigin` rewrites the
      // Host header but leaves cookies alone, so the session cookie the API
      // sets arrives on this origin and the browser keeps it.
      proxy: Object.fromEntries(
        ["/setlists", "/auth", "/movable-shapes", "/pdf", "/health"].map(
          (path) => [path, { target: apiTarget, changeOrigin: true }],
        ),
      ),
    },
  });
};
