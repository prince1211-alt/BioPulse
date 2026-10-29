export function cleanText(text) {
  return text.normalize('NFKC').replace(/μ/g, 'µ').replace(/[^\x20-\x7Eµ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeUnit(unit) {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (u.includes('mg'))                        return 'mg/dl';
  if (u.includes('mmol'))                      return 'mmol/l';
  if (u.includes('µmol') || u.includes('umol')) return 'µmol/l';
  if (u.includes('%'))                         return '%';
  return u;
}

function extractValue(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { value: parseFloat(match[1]), unit: normalizeUnit(match[2] || null) };
  }
  return null;
}

function convert(value, unit, type) {
  if (value == null) return null;
  switch (type) {
    case 'glucose':     return unit === 'mmol/l' ? value * 18.018 : value;
    case 'triglycerides': return unit === 'mmol/l' ? value * 88.57 : value;
    case 'cholesterol': return unit === 'mmol/l' ? value * 38.67  : value;
    case 'creatinine':  return unit === 'µmol/l' ? value / 88.4   : value;
    default:            return value;
  }
}

export function buildField(patterns, text, type = null) {
  const raw = extractValue(patterns, text);
  if (!raw) return null;
  return { original: raw, standard: type ? convert(raw.value, raw.unit, type) : raw.value };
}

export function countNonNull(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  if ('standard' in obj) return Number.isFinite(obj.standard) ? 1 : 0;
  return Object.values(obj).reduce((count, value) => count + countNonNull(value), 0);
}
