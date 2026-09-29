// Generates extra FICTIONAL documents used for the before/after gallery (docs/EXAMPLES.md).
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { readFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const img = (f) => 'data:image/jpeg;base64,' + readFileSync(join(root, 'scripts/assets', f)).toString('base64');
const jsBarcode = readFileSync(join(root, 'node_modules/jsbarcode/dist/JsBarcode.all.min.js'), 'utf8');
const out = (f) => join(root, 'public/samples', f);

const docs = {};

docs['sample-chat-dark.png'] = { w: 900, html: `<style>
body{margin:0;background:#1a1d21;color:#d1d2d3;font-family:Helvetica,Arial,sans-serif;width:900px}
.top{padding:14px 24px;border-bottom:1px solid #35373b;font-weight:800;font-size:18px;color:#fff}
.msg{display:flex;gap:12px;padding:12px 24px}.av{width:40px;height:40px;border-radius:8px;flex:none}
.n{font-weight:800;color:#fff;font-size:15px}.t{color:#8b8d91;font-size:12px;margin-left:8px;font-weight:400}
.b{font-size:15px;line-height:1.5;margin-top:2px}code{background:#2b2d31;border:1px solid #3d3f44;border-radius:4px;padding:1px 6px;color:#e8912d;font-size:14px}
</style><div class=top># staging-access</div>
<div class=msg><div class=av style="background:#e01e5a"></div><div><div class=n>Priya Nair<span class=t>10:42 AM</span></div><div class=b>ok the staging login is <code>admin</code> / password: Tr0ub4dor&3x — please don't share it around</div></div></div>
<div class=msg><div class=av style="background:#2eb67d"></div><div><div class=n>Sam Ortiz<span class=t>10:44 AM</span></div><div class=b>thanks! also here is the Stripe key I was using: <code>sk_${"live"}_4eC39HqLyjWDarjtT1zdp7dc</code></div></div></div>
<div class=msg><div class=av style="background:#ecb22e"></div><div><div class=n>Priya Nair<span class=t>10:45 AM</span></div><div class=b>and the AWS one: <code>AKIAIOSFODNN7EXAMPLE</code> (rotate after the demo)</div></div></div>
<div class=msg><div class=av style="background:#36c5f0"></div><div><div class=n>Sam Ortiz<span class=t>10:51 AM</span></div><div class=b>can you send the laptop to 221B Baker Street, Springfield, IL 62704?<br>call me on (415) 555-0198 if the courier gets lost, or mail priya.nair@example.com</div></div></div>
<div class=msg><div class=av style="background:#e01e5a"></div><div><div class=n>Priya Nair<span class=t>10:52 AM</span></div><div class=b>on it 👍</div></div></div>` };

docs['sample-id-card.png'] = { w: 860, html: `<style>
body{margin:0;background:#dfe6ee;font-family:Helvetica,Arial,sans-serif;width:860px;padding:30px;box-sizing:border-box}
.card{background:linear-gradient(135deg,#f5f7ff,#dbe7ff);border:2px solid #7a8fc4;border-radius:22px;padding:22px 26px;position:relative;overflow:hidden}
.hd{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #2b3f8c;padding-bottom:8px}
.hd b{font-size:26px;color:#2b3f8c;letter-spacing:.04em}.hd span{color:#2b3f8c;font-weight:700}
.row{display:flex;gap:26px;margin-top:16px}.ph{width:200px;height:250px;object-fit:cover;border-radius:10px;border:2px solid #7a8fc4}
p{margin:6px 0;font-size:18px;color:#16204a}small{display:block;color:#5b6aa0;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.bc{margin-top:10px}
</style><div class=card><div class=hd><b>DRIVER LICENSE</b><span>STATE OF COLORADO</span></div>
<div class=row><img class=ph src="${img('portrait2.jpg')}"><div>
<p><small>Name</small><b>MARCUS T. LEE</b></p>
<p><small>License No</small>License No: D1234567</p>
<p><small>Address</small>1187 Maple Ridge Drive<br>Denver, CO 80203</p>
<p><small>Date of birth</small>DOB: 07/19/1991</p></div></div>
<div class=bc><svg id=bc></svg></div></div>
<script>${jsBarcode}</script><script>JsBarcode('#bc','D1234567199107',{format:'CODE128',width:2.4,height:60,displayValue:false,margin:0})</script>` };

docs['sample-medical-form.png'] = { w: 900, html: `<style>
body{margin:0;background:#fff;font-family:Georgia,serif;color:#1b2b34;width:900px}.w{padding:40px 50px}
h1{margin:0;font-size:28px;color:#0b6e6e}.sub{color:#557;font-size:13px;margin-bottom:18px;border-bottom:3px solid #0b6e6e;padding-bottom:10px}
.g{display:grid;grid-template-columns:1fr 1fr;gap:6px 30px}.f{font-size:16px;padding:7px 0;border-bottom:1px solid #d5dde0}
.f small{display:block;color:#7a8a90;font-family:Helvetica,Arial,sans-serif;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}
.n{margin-top:20px;background:#f2f8f8;border:1px solid #cfe3e3;border-radius:8px;padding:14px;font-size:15px;line-height:1.5}
</style><div class=w><h1>Riverside Family Clinic</h1><div class=sub>Patient Intake Form · Confidential</div>
<div class=g>
<div class=f><small>Patient</small>Elena M. Ruiz</div><div class=f><small>Medical record</small>MRN: 00482913</div>
<div class=f><small>Date of birth</small>Date of Birth: March 3, 1990</div><div class=f><small>Phone</small>(303) 555-0147</div>
<div class=f><small>Address</small>45 Willow Street, Apt 12<br>Boulder, CO 80302</div><div class=f><small>Email</small>elena.ruiz@example.com</div>
<div class=f><small>Insurance</small>Policy #: ZQX449810023</div><div class=f><small>Social Security</small>SSN: 987-65-4321</div>
</div>
<div class=n><b>Reason for visit:</b> annual physical, seasonal allergies. No known drug allergies. Emergency contact: Diego Ruiz, +1 303 555 0166.</div></div>` };

const qr = await QRCode.toDataURL('https://pay.example.com/checkout/session/cs_test_a1B2c3D4e5', { margin: 1, width: 200 });
docs['sample-checkout.png'] = { w: 820, html: `<style>
body{margin:0;background:#f6f8fb;font-family:Helvetica,Arial,sans-serif;color:#1a2233;width:820px}.w{padding:36px}
.c{background:#fff;border:1px solid #e1e6ef;border-radius:14px;padding:26px;box-shadow:0 8px 24px -12px #0002}
h2{margin:0 0 4px;font-size:22px}.s{color:#6b7690;font-size:14px;margin-bottom:18px}
.in{border:1px solid #cdd5e4;border-radius:8px;padding:11px 14px;font-size:17px;margin-bottom:12px;background:#fbfcff}
.in small{display:block;color:#7c88a3;font-size:11px;margin-bottom:2px}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.top{display:flex;justify-content:space-between;align-items:flex-start}.pay{background:#5b5bd6;color:#fff;text-align:center;padding:14px;border-radius:10px;font-weight:700;margin-top:6px}
</style><div class=w><div class=c><div class=top><div><h2>Payment details</h2><div class=s>Order #88213 · Aurora Gear Co.</div></div><img src="${qr}" width=90 height=90></div>
<div class=in><small>Card number</small>4111 1111 1111 1111</div>
<div class=two><div class=in><small>Expiry</small>09 / 29</div><div class=in><small>Name on card</small>Alex Morgan</div></div>
<div class=in><small>Billing address</small>1600 Pennsylvania Ave NW, Washington, DC 20500</div>
<div class=two><div class=in><small>Email</small>alex.morgan@example.com</div><div class=in><small>Phone</small>+1 (202) 555-0111</div></div>
<div class=pay>Pay $128.40</div></div></div>` };

const br = await chromium.launch();
for (const [file, d] of Object.entries(docs)) {
  const pg = await br.newPage({ viewport: { width: d.w, height: 400 }, deviceScaleFactor: 1.5 });
  await pg.setContent(d.html);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: out(file), fullPage: true });
  await pg.close();
}
// group photo: plain JPEG (as you'd get from a phone), resized to 1400px wide
const pg = await br.newPage({ viewport: { width: 1400, height: 900 } });
await pg.setContent(`<body style="margin:0"><img id=i src="${img('group.jpg')}" style="width:1400px;display:block">`);
await pg.waitForSelector('#i');
await pg.waitForTimeout(300);
await pg.screenshot({ path: out('sample-group-photo.jpg'), type: 'jpeg', quality: 92, fullPage: true });
await br.close();
console.log('example inputs written');
