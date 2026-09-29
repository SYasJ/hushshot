// Generates the FICTIONAL sample documents used by the demo, the README screenshots and the e2e test.
// Every name, number and address below is made up (card 4242… is Stripe's public test number).
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const portrait = 'data:image/jpeg;base64,' + readFileSync(join(root, 'scripts/assets/portrait.jpg')).toString('base64');
const qr = await QRCode.toDataURL('https://example.com/employee/JD-48213-PORTAL-ACCESS', { margin: 1, width: 220, errorCorrectionLevel: 'M' });
const jsBarcode = readFileSync(join(root, 'node_modules/jsbarcode/dist/JsBarcode.all.min.js'), 'utf8');

const html = `<!doctype html><meta charset=utf-8><style>
body{margin:0;background:#fff;font-family:Helvetica,Arial,sans-serif;color:#1c2333;width:1000px}
.wrap{padding:36px 44px}
.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #4f46e5;padding-bottom:14px}
.logo{font-size:26px;font-weight:800;color:#4f46e5}.sub{color:#667;font-size:13px}
.grid{display:grid;grid-template-columns:150px 1fr 220px;gap:24px;margin-top:22px;align-items:start}
.photo{width:150px;height:170px;object-fit:cover;border-radius:8px;border:1px solid #ccd}
h3{margin:0 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#778}
p{margin:3px 0;font-size:15px;line-height:1.35}
table{width:100%;border-collapse:collapse;margin-top:22px;font-size:14px}
th{text-align:left;background:#eef0ff;padding:8px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#445}
td{padding:8px 10px;border-bottom:1px solid #e6e8f2}td:last-child,th:last-child{text-align:right}
.foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;font-size:14px}
.box{background:#f7f8fc;border:1px solid #e3e6f3;border-radius:8px;padding:12px 14px;margin-top:14px;font-size:15px}
</style><div class=wrap>
<div class=head><div><div class=logo>Northwind Robotics</div><div class=sub>Earnings Statement · Pay period 09/01/2026 – 09/15/2026</div></div><div class=sub>Statement #2026-0915-004</div></div>
<div class=grid>
<img class=photo src="${portrait}">
<div><h3>Employee</h3><p><b>Jordan A. Doe</b></p><p>742 Evergreen Terrace, Apt 4B</p><p>Springfield, IL 62704</p>
<p>Email: jordan.doe@example.com</p><p>Phone: (415) 555-2671</p><p>SSN: 123-45-6789</p><p>DOB: 04/12/1988</p></div>
<div><h3>Portal access</h3><img src="${qr}" width=140 height=140></div></div>
<table><tr><th>Earnings</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>
<tr><td>Regular pay</td><td>80.00</td><td>$46.15</td><td>$3,692.00</td></tr><tr><td>Overtime</td><td>4.50</td><td>$69.23</td><td>$311.54</td></tr>
<tr><td>Federal tax</td><td></td><td></td><td>-$612.30</td></tr><tr><td><b>Net pay</b></td><td></td><td></td><td><b>$3,391.24</b></td></tr></table>
<div class=box>Direct deposit → Account No: 00123456789 · Routing # 021000021<br>Reimbursement card: 4242 4242 4242 4242</div>
<div class=foot><div class=sub>Questions? Call payroll at +1 415 555 0134</div><svg id=bc></svg></div>
</div><script>${jsBarcode}</script><script>JsBarcode('#bc','NW20260915004',{format:'CODE128',width:2,height:54,displayValue:true,fontSize:14,margin:0})</script>`;

mkdirSync(join(root, 'public/samples'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1.5 });
await page.setContent(html);
await page.waitForTimeout(400);
await page.screenshot({ path: join(root, 'public/samples/sample-paystub.png'), fullPage: true });

// A photo-like JPEG with real EXIF (GPS + camera serial) to demo the metadata stripper.
// Built by injecting a minimal EXIF APP1 segment into a JPEG screenshot.
const jpg = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true });
writeFileSync(join(root, 'public/samples/sample-with-gps.jpg'), injectExif(jpg));

// A 2-page lease-style PDF with a *real text layer* and document metadata (to prove flattening + stripping).
const pdfPage = await browser.newPage();
await pdfPage.setContent(`<!doctype html><title>Lease Agreement – Jordan Doe</title><meta name=author content="Jordan Doe"><style>
body{font-family:Georgia,serif;font-size:15px;line-height:1.55;margin:0;color:#111}h1{font-size:26px}.pg{page-break-after:always}</style>
<div class=pg><h1>Residential Lease Agreement</h1>
<p>This lease is made between <b>Maple Court Holdings LLC</b> ("Landlord") and <b>Jordan A. Doe</b> ("Tenant") for the premises at 742 Evergreen Terrace, Apt 4B, Springfield, IL 62704.</p>
<p>Monthly rent is $2,150.00, due on the first day of each month. Tenant's contact: jordan.doe@example.com, (415) 555-2671.</p></div>
<div><h1>Tenant Screening</h1><p>Social Security Number: 123-45-6789<br>Date of Birth: 04/12/1988<br>Card on file: 4242 4242 4242 4242</p>
<p>Signed by both parties. Nothing else on this page is sensitive.</p></div>`);
await pdfPage.pdf({ path: join(root, 'public/samples/sample-lease.pdf'), format: 'Letter', margin: { top: '60px', left: '60px', right: '60px' } });
await browser.close();
console.log('samples written');

function injectExif(jpeg) {
  // Tiny big-endian TIFF: IFD0{Make, Model, GPSInfo ptr} + GPS IFD{lat,lon refs+values}
  const enc = new TextEncoder();
  const ascii = (s) => [...enc.encode(s + '\0')];
  const u16 = (n) => [(n >> 8) & 255, n & 255];
  const u32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const rat = (a, b = 1) => [...u32(a), ...u32(b)];
  const make = ascii('Apple'), model = ascii('iPhone 15 Pro');
  // layout offsets from TIFF start
  const ifd0Off = 8, ifd0Entries = 3;
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  let off = ifd0Off + ifd0Size;
  const makeOff = off; off += make.length;
  const modelOff = off; off += model.length;
  const gpsOff = off;
  const gpsEntries = 4;
  const gpsSize = 2 + gpsEntries * 12 + 4;
  off += gpsSize;
  const latOff = off; off += 24;
  const lonOff = off; off += 24;
  const entry = (tag, type, count, valueOrOff) => [...u16(tag), ...u16(type), ...u32(count), ...valueOrOff];
  const pad4 = (arr) => { while (arr.length < 4) arr.push(0); return arr; };
  const tiff = [
    0x4d, 0x4d, 0, 42, ...u32(8),
    ...u16(ifd0Entries),
    ...entry(0x010f, 2, make.length, u32(makeOff)),
    ...entry(0x0110, 2, model.length, u32(modelOff)),
    ...entry(0x8825, 4, 1, u32(gpsOff)),
    ...u32(0),
    ...make, ...model,
    ...u16(gpsEntries),
    ...entry(1, 2, 2, pad4(ascii('N').slice(0, 2)).map((v, i) => (i === 0 ? 78 : 0))),
    ...entry(2, 5, 3, u32(latOff)),
    ...entry(3, 2, 2, [87, 0, 0, 0]),
    ...entry(4, 5, 3, u32(lonOff)),
    ...u32(0),
    ...rat(34), ...rat(3), ...rat(5300, 100),        // 34°03'53" N  (Los Angeles-ish)
    ...rat(118), ...rat(14), ...rat(3700, 100),      // 118°14'37" W
  ];
  const header = [...enc.encode('Exif'), 0, 0];
  const body = [...header, ...tiff];
  const seg = [0xff, 0xe1, ...u16(body.length + 2), ...body];
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, 2), 0); out.set(seg, 2); out.set(jpeg.subarray(2), 2 + seg.length);
  return out;
}
