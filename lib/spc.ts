export type Product = '72 HBD' | '78 HBD';
export type Assignment = Product | 'unassigned';
export type Assignments = Record<string, Assignment>;
export type Reading = {
  id: string; workshop: string; lineId: string; machineId: string;
  equipmentCode: string; frame: number; weight: number; Time: string;
  productType: Product | null;
};
export type Sample = {
  metadata: { mode: string; source: string; sheet: string; timestampField: string;
    timezone: string; from: string; to: string; recordCount: number; machineCount: number; units: string; productAssignment: string; };
  readings: Reading[];
};
export type Limits = { lcl: number; cl: number; ucl: number };
export const LINES = Array.from({ length: 8 }, (_, i) => ({
  id: `L${i + 1}`, machines: [`${i + 1}01`, `${i + 1}02`],
}));
export const EMPTY_ASSIGNMENTS: Assignments = Object.fromEntries(LINES.map(l => [l.id, 'unassigned']));
export const STORAGE_KEY = 'illuminate-frame-spc-sample-products-v1';
export const isProduct = (value: unknown): value is Product => value === '72 HBD' || value === '78 HBD';
export function validateAssignments(value: unknown): Assignments {
  const object = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return Object.fromEntries(LINES.map(l => [l.id, isProduct(object[l.id]) ? object[l.id] : 'unassigned'])) as Assignments;
}
export function limitsFor(product: Assignment | null | undefined, frame: number): Limits | null {
  if (!isProduct(product) || ![1, 2, 3, 4].includes(frame)) return null;
  if (frame === 2 || frame === 3) return { lcl: 41, cl: 46, ucl: 51 };
  return product === '72 HBD' ? { lcl: 111, cl: 116, ucl: 121 } : { lcl: 110, cl: 120, ucl: 130 };
}
export function readingLimits(reading: Reading, assignments: Assignments): Limits | null {
  // Product carried by an API record takes precedence over a sample assignment.
  return limitsFor(reading.productType ?? assignments[reading.lineId], reading.frame);
}
export function readingStatus(reading: Reading, assignments: Assignments): 'outside' | 'within' | 'unassigned' {
  const limits = readingLimits(reading, assignments);
  if (!limits) return 'unassigned';
  return reading.weight < limits.lcl || reading.weight > limits.ucl ? 'outside' : 'within';
}
export function latestByFrame(readings: Reading[]): (Reading | undefined)[] {
  return [1, 2, 3, 4].map(frame => readings.filter(r => r.frame === frame)
    .reduce<Reading | undefined>((latest, r) => !latest || r.Time > latest.Time || (r.Time === latest.Time && r.id > latest.id) ? r : latest, undefined));
}
export function machineStatus(readings: Reading[], assignments: Assignments): 'empty' | 'unassigned' | 'outside' | 'within' | 'incomplete' {
  if (!readings.length) return 'empty';
  const latest = latestByFrame(readings);
  if (latest.some(r => r && readingStatus(r, assignments) === 'outside')) return 'outside';
  if (latest.some(r => r && readingStatus(r, assignments) === 'unassigned')) return 'unassigned';
  if (latest.some(r => !r)) return 'incomplete';
  return 'within';
}
// Calendar coordinates only: preserve source-local Time without inventing a timezone.
export function timeCoordinate(time: string): number {
  return Date.parse(time.replace(' ', 'T') + 'Z');
}
export function timeLabel(value: number): string {
  const iso = new Date(value).toISOString();
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
}
export function withinWindow(readings: Reading[], hours: number | null, sampleEnd: string): Reading[] {
  if (hours === null) return readings;
  const cutoff = timeCoordinate(sampleEnd) - hours * 3600_000;
  return readings.filter(r => timeCoordinate(r.Time) >= cutoff && r.Time <= sampleEnd);
}

export type DateRange = { from: string; to: string };
export function dateRangeError(range: DateRange): string | null {
  for (const date of [range.from, range.to]) {
    if (!date) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choose a valid date.';
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) return 'Choose a valid date.';
  }
  return range.from && range.to && range.from > range.to ? 'Start date must be on or before end date.' : null;
}
export function filterReadings(readings: Reading[], range: DateRange, lineId = 'all'): Reading[] {
  if (dateRangeError(range)) return [];
  return readings.filter(r => (lineId === 'all' || r.lineId === lineId) &&
    (!range.from || r.Time.slice(0,10) >= range.from) && (!range.to || r.Time.slice(0,10) <= range.to));
}

export type Capability = {
  n: number; mean: number | null; sigmaWithin: number | null;
  lsl: number | null; usl: number | null; cp: number | null; cpk: number | null;
  reason: string | null;
};
export function calculateCpk(readings: Reading[], assignments: Assignments): Capability {
  const result: Capability = { n: readings.length, mean: null, sigmaWithin: null, lsl: null, usl: null, cp: null, cpk: null, reason: null };
  if (!readings.length) return { ...result, reason: 'No readings' };
  if (readings.some(r => !Number.isFinite(r.weight) || !Number.isFinite(timeCoordinate(r.Time)))) return { ...result, reason: 'Invalid readings' };
  const ordered = [...readings].sort((a, b) => a.Time.localeCompare(b.Time));
  const first = ordered[0];
  if (ordered.some(r => r.machineId !== first.machineId || r.frame !== first.frame || r.lineId !== first.lineId)) return { ...result, reason: 'Select one machine and frame' };
  const products = ordered.map(r => r.productType ?? assignments[r.lineId]);
  if (products.some(p => !isProduct(p))) return { ...result, reason: 'Product not assigned' };
  if (new Set(products).size !== 1) return { ...result, reason: 'Mixed products in Time window' };
  const limits = limitsFor(products[0], first.frame);
  if (!limits) return { ...result, reason: 'Limits unavailable' };
  result.lsl = limits.lcl; result.usl = limits.ucl;
  result.mean = ordered.reduce((sum, r) => sum + r.weight, 0) / ordered.length;
  if (ordered.length < 2) return { ...result, reason: 'At least 2 readings needed' };
  if (ordered.some((r, i) => i > 0 && r.Time === ordered[i - 1].Time)) return { ...result, reason: 'Duplicate Time; sequence needed' };
  // User-selected convention: fixed LCL/UCL also act as LSL/USL.
  // Individuals method: within sigma = mean moving range / d2, d2 = 1.128 for pairs.
  const meanMovingRange = ordered.slice(1).reduce((sum, r, i) => sum + Math.abs(r.weight - ordered[i].weight), 0) / (ordered.length - 1);
  result.sigmaWithin = meanMovingRange / 1.128;
  if (result.sigmaWithin === 0) return { ...result, reason: 'No observed variation' };
  result.cp = (result.usl - result.lsl) / (6 * result.sigmaWithin);
  result.cpk = Math.min((result.usl - result.mean) / (3 * result.sigmaWithin), (result.mean - result.lsl) / (3 * result.sigmaWithin));
  return result;
}

export function lowestFrameCpk(capabilities: Capability[]): { cpk: number; frame: number } | null {
  if (capabilities.length !== 4 || capabilities.some(c => c.cpk === null)) return null;
  return capabilities.reduce<{ cpk: number; frame: number } | null>((lowest, c, i) => !lowest || c.cpk! < lowest.cpk ? { cpk: c.cpk!, frame: i + 1 } : lowest, null);
}
export function validateSample(payload: unknown): Sample {
  const sample = payload as Sample;
  if (!sample?.metadata || !Array.isArray(sample.readings) || sample.metadata.timestampField !== 'Time') throw new Error('The data response must contain metadata and readings using Time.');
  const ids = new Set<string>();
  for (const r of sample.readings) {
    if (!r || typeof r.id !== 'string' || ids.has(r.id) || !Number.isFinite(r.weight) || ![1,2,3,4].includes(r.frame) || typeof r.Time !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.Time) || !Number.isFinite(timeCoordinate(r.Time)) || !LINES.some(l => l.id === r.lineId && l.machines.includes(r.machineId)) || (r.productType !== null && !isProduct(r.productType))) throw new Error('The data response contains an invalid or duplicate frame reading.');
    ids.add(r.id);
  }
  return sample;
}
