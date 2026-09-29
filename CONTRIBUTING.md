# Contributing to RedactIt

Thanks for helping make sharing screenshots safer! 🛡️

## Setup

```bash
git clone https://github.com/your-name/redactit && cd redactit
npm install        # also vendors OCR/face/PDF assets into public/vendor (postinstall)
npm run dev        # http://localhost:5173
npm test           # fast unit tests (detection rules, rect mapping, metadata summary)
npm run build && npx vite preview --port 4173 &
npm run e2e        # headless-Chromium end-to-end test against the production build
npm run examples   # regenerate the before/after gallery in docs/examples/
```

## Where things live

| You want to…                          | Look at                          |
| ------------------------------------- | -------------------------------- |
| Add / tune a detection rule           | `src/detect/patterns.js` + `tests/patterns.test.js` |
| Change how a redaction looks          | `src/render/effects.js`          |
| Change the UI                         | `index.html`, `src/style.css`, `src/main.js` |
| Change export / metadata verification | `src/io/exporter.js`, `src/io/metadata.js` |

## Adding a detection rule

1. Add a rule object to `RULES` in `src/detect/patterns.js` (`type`, `re`, optional `group` to redact only a capture group, optional `validate()` returning a confidence 0–1).
2. If it's a new category, add it to `CATEGORIES`/`TEXT_TYPES` and to `TAGS`/`CAT_ORDER` in `src/main.js`.
3. Add **positive and negative** test cases – false positives that hide harmless text are bugs too.

## Ground rules

- **No network calls. Ever.** The production build ships a CSP with `connect-src 'self'`, and the e2e test fails on any external request. Vendor assets instead of using a CDN.
- **Never keep original pixels or metadata in the output.** Export must re-encode from a canvas.
- Only fictional data in tests and samples (`npm run samples` regenerates them).
- Keep PRs focused; run `npm test` and `npm run e2e` before opening one.

## Reporting a privacy bug

If RedactIt ever leaves sensitive data readable or metadata intact in an exported file, please open an issue with a **fictional** reproduction (never post real documents).
