// Composes docs/before-after.png for the README from the sample and the e2e export.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const b64 = (p) => 'data:image/png;base64,' + readFileSync(root + p).toString('base64');
const html = `<body style="margin:0;background:#0a0c11;font-family:system-ui;color:#eceff7">
<div style="display:flex;gap:28px;padding:32px;width:1500px;box-sizing:border-box;align-items:flex-start">
${[['BEFORE', 'public/samples/sample-paystub.png', '#f87171'], ['AFTER', 'e2e/out/paystub-redacted.png', '#34d399']].map(([t, p, c]) => `
<div style="flex:1"><div style="font-weight:800;letter-spacing:.12em;font-size:15px;color:${c};margin-bottom:12px">${t}</div>
<img src="${b64(p)}" style="width:100%;border-radius:12px;box-shadow:0 20px 50px -20px #000;clip-path:inset(0 0 26% 0)"></div>`).join('')}
</div></body>`;
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1500, height: 720 } });
await pg.setContent(html);
await pg.waitForTimeout(300);
await pg.screenshot({ path: root + 'docs/before-after.png', fullPage: true });
await br.close();
