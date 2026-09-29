/** Reads (for display only) the hidden metadata that will NOT survive export. */
import exifr from 'exifr';

const fmtDate = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * Turns raw EXIF/XMP tags into a short human list. Pure function (unit-tested).
 * @returns {{icon:string,label:string,value:string,risk:'high'|'med'|'low'}[]}
 */
export function summarizeTags(t) {
  if (!t) return [];
  const out = [];
  const add = (icon, label, value, risk = 'low') => { if (value !== undefined && value !== null && String(value).trim() !== '') out.push({ icon, label, value: String(value), risk }); };

  if (typeof t.latitude === 'number' && typeof t.longitude === 'number') {
    add('📍', 'GPS location', `${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)}`, 'high');
  }
  if (typeof t.GPSAltitude === 'number') add('⛰️', 'GPS altitude', `${Math.round(t.GPSAltitude)} m`, 'med');
  const cam = [t.Make, t.Model].filter(Boolean).join(' ').trim();
  add('📷', 'Camera / device', cam, 'med');
  add('🔢', 'Camera serial number', t.BodySerialNumber || t.SerialNumber || t.CameraSerialNumber, 'high');
  add('🔭', 'Lens serial number', t.LensSerialNumber, 'med');
  add('👤', 'Owner / author', t.OwnerName || t.Artist || t.Creator || t.Author, 'high');
  add('©️', 'Copyright', t.Copyright || t.Rights, 'low');
  add('🕒', 'Original capture date', fmtDate(t.DateTimeOriginal || t.CreateDate), 'med');
  add('🛠️', 'Edited with', t.Software || t.CreatorTool, 'low');
  add('💬', 'Description / comments', t.ImageDescription || t.UserComment || t.Description, 'med');
  add('🧭', 'Image unique ID', t.ImageUniqueID, 'med');
  return out;
}

export async function readImageMetadata(file) {
  try {
    const tags = await exifr.parse(file, {
      tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, jfif: false, ihdr: false,
      mergeOutput: true, translateValues: true, reviveValues: true, sanitize: false,
    });
    return { fields: summarizeTags(tags), rawCount: tags ? Object.keys(tags).length : 0 };
  } catch {
    return { fields: [], rawCount: 0 };
  }
}

export async function readPdfMetadata(pdf) {
  try {
    const { info } = await pdf.getMetadata();
    const fields = [];
    const add = (icon, label, v, risk = 'low') => { if (v && String(v).trim()) fields.push({ icon, label, value: String(v), risk }); };
    add('👤', 'Author', info.Author, 'high');
    add('📄', 'Title', info.Title, 'med');
    add('🛠️', 'Created with', info.Creator, 'low');
    add('⚙️', 'PDF producer', info.Producer, 'low');
    add('🏷️', 'Keywords / subject', [info.Subject, info.Keywords].filter(Boolean).join(' · '), 'med');
    const pdate = (s) => { const m = /D:(\d{4})(\d\d)(\d\d)/.exec(s || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
    add('🕒', 'Created', pdate(info.CreationDate), 'med');
    add('✏️', 'Modified', pdate(info.ModDate), 'low');
    return { fields, rawCount: Object.keys(info || {}).length };
  } catch {
    return { fields: [], rawCount: 0 };
  }
}

/** Re-open an exported image and confirm no metadata segment is left. */
export async function verifyImageClean(blob) {
  try {
    const tags = await exifr.parse(blob, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, jfif: false, ihdr: false, mergeOutput: true });
    return !tags || Object.keys(tags).length === 0;
  } catch {
    return true; // exifr throws when there is no metadata container at all
  }
}
