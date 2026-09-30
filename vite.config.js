import { defineConfig } from 'vite';

// Strict Content-Security-Policy, injected into production builds only (Vite's dev server needs inline HMR scripts).
// `connect-src 'self'` means the built app is technically unable to send your files anywhere.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const cspPlugin = () => ({
  name: 'hushshot-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`),
});

export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [cspPlugin()],
  build: { target: 'esnext', chunkSizeWarningLimit: 2500 },
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
});
