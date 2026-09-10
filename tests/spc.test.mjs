import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_ASSIGNMENTS, limitsFor, readingStatus, readingLimits, latestByFrame, machineStatus, withinWindow, validateAssignments, validateSample, calculateCpk, lowestFrameCpk, filterReadings, dateRangeError } from '../lib/spc.ts';

const sample = JSON.parse(readFileSync(new URL('../data/sample.json', import.meta.url), 'utf8'));
const assigned = { ...EMPTY_ASSIGNMENTS, L1:'72 HBD' };
const reading = { ...sample.readings.find(r => r.machineId === '101' && r.frame === 1) };

test('all supplied product and frame limits are exact', () => {
  const expected = {'72 HBD':[[111,116,121],[41,46,51],[41,46,51],[111,116,121]],'78 HBD':[[110,120,130],[41,46,51],[41,46,51],[110,120,130]]};
  for(const [product, frames] of Object.entries(expected)) frames.forEach(([lcl,cl,ucl],i) => assert.deepEqual(limitsFor(product,i+1),{lcl,cl,ucl}));
});
test('limits are inclusive and only beyond-limit readings are flagged', () => {
  for(const product of ['72 HBD','78 HBD']) for(const frame of [1,2,3,4]) {
    const {lcl,ucl}=limitsFor(product,frame); const assignments={...EMPTY_ASSIGNMENTS,L1:product};
    for(const [weight,status] of [[lcl,'within'],[ucl,'within'],[lcl-.01,'outside'],[ucl+.01,'outside']]) assert.equal(readingStatus({...reading,frame,weight},assignments),status);
  }
});
test('unassigned and empty machines never appear within limits', () => {
  assert.equal(readingStatus(reading,EMPTY_ASSIGNMENTS),'unassigned');
  assert.equal(machineStatus([reading],EMPTY_ASSIGNMENTS),'unassigned');
  assert.equal(machineStatus([],assigned),'empty');
  assert.equal(machineStatus([{...reading,weight:116}],assigned),'incomplete');
});
test('per-record product history takes precedence over sample assignments', () => {
  const historical={...reading,productType:'78 HBD',weight:125};
  assert.equal(readingStatus(historical,assigned),'within');
  assert.deepEqual(readingLimits(historical,assigned),{lcl:110,cl:120,ucl:130});
  assert.equal(readingStatus({...historical,productType:null},assigned),'outside');
});
test('latest frame values retain independent timestamps and missing channels', () => {
  const rows=[{...reading,id:'new',Time:'2026-09-07 08:00:00'}, {...reading,id:'old',Time:'2026-09-02 08:00:00'}, {...reading,id:'f2',frame:2,Time:'2026-09-06 09:00:00'}];
  const latest=latestByFrame(rows);
  assert.equal(latest[0].id,'new'); assert.equal(latest[1].Time,'2026-09-06 09:00:00'); assert.equal(latest[2],undefined); assert.equal(latest[3],undefined);
});

test('latest machine status clears old OOT readings after all four frames recover', () => {
  const latest=[1,2,3,4].map(frame=>({...reading,id:`latest-${frame}`,frame,weight:frame===1||frame===4?116:46,Time:`2026-09-07 08:00:0${frame}`}));
  const oldOutliers=[{...reading,id:'old-long',frame:1,weight:130,Time:'2026-09-06 08:00:00'},{...reading,id:'old-short',frame:2,weight:60,Time:'2026-09-06 08:00:00'}];
  assert.equal(machineStatus([...latest,...oldOutliers],assigned),'within');
  assert.equal(machineStatus(latest.map(r=>r.frame===4?{...r,weight:122}:r),assigned),'outside');
  assert.equal(machineStatus(latest.map(r=>r.frame===1||r.frame===4?{...r,weight:122}:r),assigned),'outside');
});
test('import reconciles all 979 source readings and Time values', () => {
  assert.equal(validateSample(sample),sample);
  assert.equal(sample.readings.length,979); assert.equal(new Set(sample.readings.map(r=>r.machineId)).size,8);
  assert.equal(sample.metadata.from,'2026-09-02 14:42:03'); assert.equal(sample.metadata.to,'2026-09-07 08:54:17');
  for(const [frame,count] of [[1,276],[2,214],[3,213],[4,276]]) assert.equal(sample.readings.filter(r=>r.frame===frame).length,count);
  assert.ok(sample.readings.every(r=>r.productType===null));
});
test('Time windows are anchored to the sample end, independent of current date', () => {
  const rows=withinWindow(sample.readings,24,sample.metadata.to);
  assert.ok(rows.length>0); assert.ok(rows.length<sample.readings.length);
  assert.ok(rows.every(r=>r.Time>='2026-09-06 08:54:17' && r.Time<='2026-09-07 08:54:17'));
  assert.equal(withinWindow(sample.readings,null,sample.metadata.to),sample.readings);
});
test('invalid saved settings and malformed readings cannot become false passes', () => {
  assert.deepEqual(validateAssignments(null),EMPTY_ASSIGNMENTS);
  assert.equal(validateAssignments({L1:'unknown',L2:'78 HBD'}).L1,'unassigned');
  assert.equal(validateAssignments({L2:'78 HBD'}).L2,'78 HBD');
  assert.throws(()=>validateSample({...sample,readings:[{...reading,weight:null}]}));
  assert.throws(()=>validateSample({...sample,readings:[reading,reading]}));
  assert.throws(()=>validateSample({...sample,readings:[{...reading,Time:'bad'}]}));
});

const series = weights => weights.map((weight,i)=>({...reading,id:`cpk-${i}`,weight,Time:`2026-09-07 08:00:${String(i).padStart(2,'0')}`}));
test('Cpk uses observed mean and moving-range sigma, with limits as specifications', () => {
  const result=calculateCpk(series([114,116,118]).reverse(),assigned);
  assert.equal(result.n,3); assert.equal(result.mean,116);
  assert.equal(result.lsl,111); assert.equal(result.usl,121);
  assert.ok(Math.abs(result.sigmaWithin-2/1.128)<1e-12);
  assert.ok(Math.abs(result.cpk-.94)<1e-12);
  assert.ok(Math.abs(result.cp-.94)<1e-12);
  assert.equal(result.reason,null);
});
test('Cpk updates with product and preserves negative capability outside specifications', () => {
  const rows=series([121,123,125]);
  assert.ok(Math.abs(calculateCpk(rows,assigned).cpk-(-.376))<1e-12);
  assert.ok(Math.abs(calculateCpk(rows,{...assigned,L1:'78 HBD'}).cpk-1.316)<1e-12);
  const historical=rows.map(r=>({...r,productType:'78 HBD'}));
  assert.ok(Math.abs(calculateCpk(historical,assigned).cpk-1.316)<1e-12);
  assert.ok(Math.abs(calculateCpk(rows,assigned).cp-.94)<1e-12);
  assert.ok(Math.abs(calculateCpk(rows,{...assigned,L1:'78 HBD'}).cp-1.88)<1e-12);
});
test('Cpk keeps time order and includes outside-limit observations', () => {
  const rows=series([110,120,111]);
  const expectedSigma=9.5/1.128;
  const expectedCpk=((341/3)-111)/(3*expectedSigma);
  assert.ok(Math.abs(calculateCpk([rows[2],rows[0],rows[1]],assigned).cpk-expectedCpk)<1e-12);
});
test('Cpk does not pool machines, frames or products', () => {
  const rows=series([114,116,118]);
  assert.equal(calculateCpk([rows[0],{...rows[1],frame:2}],assigned).cpk,null);
  assert.equal(calculateCpk([rows[0],{...rows[1],machineId:'102'}],assigned).cpk,null);
  assert.equal(calculateCpk([rows[0],{...rows[1],productType:'78 HBD'}],assigned).reason,'Mixed products in Time window');
});
test('undefined Cpk states remain unavailable instead of infinite or passing', () => {
  assert.equal(calculateCpk([],assigned).reason,'No readings');
  assert.equal(calculateCpk(series([116]),assigned).reason,'At least 2 readings needed');
  assert.equal(calculateCpk(series([116,116,116]),assigned).reason,'No observed variation');
  assert.equal(calculateCpk(series([114,116]),EMPTY_ASSIGNMENTS).reason,'Product not assigned');
  const rows=series([114,116]); rows[1].Time=rows[0].Time;
  assert.equal(calculateCpk(rows,assigned).reason,'Duplicate Time; sequence needed');
  assert.equal(calculateCpk(series([NaN,116]),assigned).cpk,null);
  assert.equal(calculateCpk(series([116,116]),assigned).cp,null);
});

test('date range includes both complete endpoint days and filters the line', () => {
  const rows=[
    {...reading,id:'before',Time:'2026-09-05 23:59:59'},
    {...reading,id:'start',Time:'2026-09-06 00:00:00'},
    {...reading,id:'end',Time:'2026-09-07 23:59:59'},
    {...reading,id:'after',Time:'2026-09-08 00:00:00'},
    {...reading,id:'other-line',lineId:'L2',machineId:'201',Time:'2026-09-07 12:00:00'}
  ];
  assert.deepEqual(filterReadings(rows,{from:'2026-09-06',to:'2026-09-07'},'L1').map(r=>r.id),['start','end']);
  assert.equal(filterReadings(rows,{from:'2026-09-06',to:'2026-09-07'}).length,3);
  assert.equal(filterReadings(rows,{from:'',to:''}).length,5);
});
test('invalid dates and reversed ranges never silently include all records', () => {
  for(const range of [{from:'2026-09-08',to:'2026-09-07'},{from:'2026-02-30',to:''},{from:'bad',to:''}]) {
    assert.ok(dateRangeError(range)); assert.equal(filterReadings(sample.readings,range).length,0);
  }
  assert.equal(dateRangeError({from:'2026-09-07',to:'2026-09-07'}),null);
});
test('latest OOT status uses the selected date range and never falls back to old readings', () => {
  const old=series([125,126]).map(r=>({...r,Time:r.Time.replace('2026-09-07','2026-09-06')}));
  const current=[1,2,3,4].map(frame=>({...reading,id:`current-${frame}`,frame,weight:frame===1||frame===4?116:46,Time:`2026-09-07 08:00:0${frame}`}));
  const rows=[...old,...current];
  assert.equal(machineStatus(filterReadings(rows,{from:'2026-09-06',to:'2026-09-06'}),assigned),'outside');
  assert.equal(machineStatus(filterReadings(rows,{from:'2026-09-07',to:'2026-09-07'}),assigned),'within');
  assert.equal(machineStatus(filterReadings(rows,{from:'2026-09-08',to:'2026-09-08'}),assigned),'empty');
});
test('Cp and Cpk recalculate solely from readings in the chosen date range', () => {
  const old=series([140,150,160]).map(r=>({...r,id:`old-${r.id}`,Time:r.Time.replace('2026-09-07','2026-09-06')}));
  const rows=[...old,...series([114,116,118])];
  const result=calculateCpk(filterReadings(rows,{from:'2026-09-07',to:'2026-09-07'},'L1'),assigned);
  assert.equal(result.n,3); assert.ok(Math.abs(result.cp-.94)<1e-12); assert.ok(Math.abs(result.cpk-.94)<1e-12);
});
test('machine Cpk summary is minimum of four valid frame estimates only', () => {
  const result=calculateCpk(series([114,116,118]),assigned);
  assert.deepEqual(lowestFrameCpk([result,{...result,cpk:.5},result,result]),{cpk:.5,frame:2});
  assert.equal(lowestFrameCpk([result,result,result,{...result,cpk:null}]),null);
  assert.equal(lowestFrameCpk([result]),null);
});
