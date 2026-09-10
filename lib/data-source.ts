import { validateSample, type Sample } from './spc';

// Replace this same-origin adapter with your Oracle-backed endpoint when available.
export const MEASUREMENTS_ENDPOINT = '/api/measurements';
export async function fetchMeasurements(signal?: AbortSignal): Promise<Sample> {
  const response = await fetch(MEASUREMENTS_ENDPOINT, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load measurements (HTTP ${response.status}).`);
  return validateSample(await response.json());
}
