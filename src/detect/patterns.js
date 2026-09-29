/**
 * Pure text pattern detection. No DOM, no dependencies – runs in Node for tests.
 *
 * `findSensitive(text, enabledTypes)` returns [{ type, start, end, confidence }]
 * where start/end are character offsets into `text` (end exclusive).
 */

export const CATEGORIES = {
  card:    { label: 'Credit cards',      icon: '💳' },
  ssn:     { label: 'SSN / national ID', icon: '🪪' },
  email:   { label: 'Emails',            icon: '✉️' },
  phone:   { label: 'Phone numbers',     icon: '📞' },
  address: { label: 'Home addresses',    icon: '🏠' },
  account: { label: 'Account numbers',   icon: '🏦' },
  dob:     { label: 'Dates of birth',    icon: '🎂' },
  secret:  { label: 'API keys & tokens', icon: '🔑' },
  face:    { label: 'Faces',             icon: '🙂' },
  barcode: { label: 'Barcodes & QR',     icon: '▦' },
};

export const TEXT_TYPES = ['card', 'ssn', 'email', 'phone', 'address', 'account', 'dob', 'secret'];

/** Luhn checksum – used to tell real card numbers from random digit runs. */
export function luhn(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return digits.length > 0 && sum % 10 === 0;
}

const STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const PROVINCES = 'AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT';
const STREET_SUFFIX_BASE = 'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Terrace|Ter|Parkway|Pkwy|Circle|Cir|Highway|Hwy|Trail|Trl|Square|Sq|Loop|Alley|Row';
// Capitalised ("Street") or ALL CAPS ("STREET") – never lowercase, which avoids matching prose like "3 items to the way".
const STREET_SUFFIX = `${STREET_SUFFIX_BASE}|${STREET_SUFFIX_BASE.toUpperCase()}`;

const DATE = String.raw`(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:\d{4}|\d{2})|\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4})`;

/** Each rule: regex with /g, optional `group` (capture group to redact), optional `validate`. */
const RULES = [
  {
    type: 'email',
    re: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g,
    confidence: 0.98,
  },
  {
    type: 'card',
    re: /(?<![\d])(?:\d[ \-]?){12,18}\d(?![\d])/g,
    validate(m) {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) return 0;
      if (luhn(digits)) return 0.97;
      // OCR often misreads a digit; keep well-formed 4-4-4-4 / Amex 4-6-5 groupings.
      if (/^\d{4}[ \-]\d{4}[ \-]\d{4}[ \-]\d{4}$/.test(m.trim())) return 0.75;
      if (/^\d{4}[ \-]\d{6}[ \-]\d{5}$/.test(m.trim())) return 0.75;
      return 0;
    },
  },
  {
    // Masked cards: "**** **** **** 1234", "XXXX-XXXX-XXXX-1234", "•••• 1234"
    type: 'card',
    re: /(?:[*xX•●·]{4}[ \-]?){1,3}\d{4}\b/g,
    confidence: 0.8,
  },
  {
    type: 'ssn',
    re: /(?<![\d\-])(?!000|666|9\d\d)\d{3}[\- ](?!00)\d{2}[\- ](?!0000)\d{4}(?![\d\-])/g,
    confidence: 0.95,
  },
  {
    // "SSN: 123456789" / "Social Security No. 123 45 6789"
    type: 'ssn',
    re: /\b(?:SSN|SS#|Social\s+Security(?:\s+(?:No|Number|#))?\.?|SIN|Tax\s*ID|TIN|EIN)\s*[:#\-]?\s*([\dXx*\- ]{9,12})\b/gi,
    group: 1,
    confidence: 0.9,
  },
  {
    type: 'phone',
    re: /(?<![\w@.\-\/])(?:\+?1[\s.\-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.\-])\d{3}[\s.\-]\d{4}(?![\d\-])/g,
    confidence: 0.9,
  },
  {
    // International: +44 20 7946 0958, +33 1 23 45 67 89
    type: 'phone',
    re: /(?<![\w@.\-\/])\+\d{1,3}[\s.\-]?(?:\(?\d{1,4}\)?[\s.\-]?){2,5}\d{2,4}(?![\d\-])/g,
    validate(m) {
      const n = m.replace(/\D/g, '').length;
      return n >= 8 && n <= 15 ? 0.85 : 0;
    },
  },
  {
    // 123 Main Street, Apt 4B
    type: 'address',
    re: new RegExp(String.raw`\b\d{1,6}[A-Za-z]?\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West|NORTH|SOUTH|EAST|WEST)\.?\s+)?(?:[A-Z0-9][A-Za-z0-9.'\-]*\s+){0,3}?(?:${STREET_SUFFIX})\b\.?(?:\s+(?:NW|NE|SW|SE|N|S|E|W)\b\.?)?(?:,?\s*(?:Apt|Apartment|Suite|Ste|Unit|Fl|Floor|APT|SUITE|STE|UNIT|#)\.?\s*[\w\-]+)?`, 'g'),
    validate: (m) => (/^\d/.test(m) ? 0.85 : 0),
  },
  {
    // Springfield, IL 62704   |   Toronto ON M5V 2T6
    type: 'address',
    re: new RegExp(String.raw`\b[A-Z][A-Za-z.'\-]+(?:\s[A-Z][A-Za-z.'\-]+){0,3},?\s+(?:${STATES})\.?\s+\d{5}(?:-\d{4})?\b`, 'g'),
    confidence: 0.9,
  },
  {
    type: 'address',
    re: new RegExp(String.raw`\b[A-Z][A-Za-z.'\-]+(?:\s[A-Z][A-Za-z.'\-]+){0,3},?\s+(?:${PROVINCES})\s+[A-Z]\d[A-Z][ \-]?\d[A-Z]\d\b`, 'g'),
    confidence: 0.9,
  },
  {
    type: 'address',
    re: /\bP\.?\s?O\.?\s+Box\s+\d+\b/gi,
    confidence: 0.9,
  },
  {
    // UK postcode: SW1A 1AA
    type: 'address',
    re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g,
    confidence: 0.6,
  },
  {
    // Labelled values: "Account No: 00123456", "Routing # 021000021", "IBAN GB29 NWBK ..."
    type: 'account',
    re: /\b(?:Acct|Account|Routing|ABA|Member|Policy|Patient|MRN|Claim|Customer|License|Licence|Passport|Employee|Driver'?s?\s+Lic(?:ense)?)\.?\s*(?:ID|No|Number|Num|#)?\.?\s*[:#\-]?\s*((?=[A-Z\-]*\d)[A-Z0-9][A-Z0-9\-]{5,})/gi,
    group: 1,
    confidence: 0.85,
  },
  {
    type: 'account',
    re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
    validate: (m) => (m.replace(/\s/g, '').length >= 15 && /\d/.test(m) ? 0.8 : 0),
  },
  {
    type: 'dob',
    re: new RegExp(String.raw`\b(?:DOB|D\.O\.B\.?|Date\s+of\s+Birth|Birth\s*date|Birthday|Born)\s*[:\-]?\s*(${DATE})`, 'gi'),
    group: 1,
    confidence: 0.92,
  },
  {
    type: 'secret',
    re: /\b(?:sk-[A-Za-z0-9_\-]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|pk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9\-]{10,}|AIza[0-9A-Za-z_\-]{30,}|eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,})\b/g,
    confidence: 0.97,
  },
  {
    // Stripe-style keys after OCR turned the underscores into spaces: "sk live 4eC39Hq…"
    type: 'secret',
    re: /\b(?:sk|pk|rk)[_\- ](?:live|test)[_\- ][A-Za-z0-9]{16,}/g,
    confidence: 0.9,
  },
  {
    type: 'secret',
    re: /\b(?:password|passwd|pwd|passcode|secret|token|api[_\- ]?key)\s*[:=]\s*(\S{4,})/gi,
    group: 1,
    confidence: 0.85,
  },
];

/**
 * @param {string} text
 * @param {Iterable<string>} [enabled] category ids to look for (default: all text types)
 * @returns {{type:string,start:number,end:number,confidence:number}[]}
 */
export function findSensitive(text, enabled = TEXT_TYPES) {
  const on = new Set(enabled);
  const out = [];
  for (const rule of RULES) {
    if (!on.has(rule.type)) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      if (m[0].length === 0) { rule.re.lastIndex++; continue; }
      const conf = rule.validate ? rule.validate(m[0]) : rule.confidence;
      if (!conf) continue;
      let start = m.index;
      let end = m.index + m[0].length;
      if (rule.group) {
        const g = m[rule.group];
        if (!g) continue;
        start = m.index + m[0].lastIndexOf(g);
        end = start + g.length;
      }
      // trim trailing punctuation / whitespace
      while (end > start && /[\s.,;:)]/.test(text[end - 1]) && !(text[end - 1] === ')' && text.slice(start, end).includes('('))) end--;
      while (start < end && /\s/.test(text[start])) start++;
      if (end > start) out.push({ type: rule.type, start, end, confidence: conf });
    }
  }
  return dedupe(out);
}

/** Merge overlapping hits, preferring the higher-confidence / more specific one. */
function dedupe(hits) {
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const res = [];
  for (const h of hits) {
    const last = res[res.length - 1];
    if (last && h.start < last.end) {
      // overlap: keep the union if same type, else keep the better one
      if (h.type === last.type) { last.end = Math.max(last.end, h.end); last.confidence = Math.max(last.confidence, h.confidence); }
      else if (h.confidence > last.confidence && h.end - h.start >= (last.end - last.start) * 0.6) res[res.length - 1] = h;
      continue;
    }
    res.push({ ...h });
  }
  return res;
}
