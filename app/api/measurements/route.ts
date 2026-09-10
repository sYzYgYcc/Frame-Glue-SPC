import sample from '@/data/sample.json';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const readings = sample.readings.filter(r =>
    (!params.get('lineId') || r.lineId === params.get('lineId')) &&
    (!params.get('machineId') || r.machineId === params.get('machineId')) &&
    (!params.get('frame') || r.frame === Number(params.get('frame'))) &&
    (!params.get('from') || r.Time >= params.get('from')!) &&
    (!params.get('to') || r.Time <= params.get('to')!));
  return Response.json({ metadata: { ...sample.metadata, recordCount: readings.length,
    machineCount: new Set(readings.map(r => r.machineId)).size,
    from: readings[0]?.Time ?? null, to: readings.at(-1)?.Time ?? null }, readings },
    { headers: { 'Cache-Control': 'no-store' } });
}
