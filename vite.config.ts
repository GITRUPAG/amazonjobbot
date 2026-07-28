// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // The Lovable config defaults to Nitro's "cloudflare-module" preset. That's
  // wrong for this app: Cloudflare Workers has no filesystem access and can't
  // spawn child processes, so it cannot run Playwright/Chromium at all.
  // We're deploying to a persistent Node host (Railway), so target a plain
  // Node server build instead.
  nitro: {
    preset: "node-server",
  },
  vite: {
    server: {
      // Dev-only: allow tunneled hosts (localtunnel, ngrok, etc.) to reach this server
      // so Telegram webhook registration/testing works against a public HTTPS URL.
      allowedHosts: true,
    },
  },
});