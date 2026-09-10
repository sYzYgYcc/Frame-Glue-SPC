'use client';
import { useMemo, useState } from 'react';
import { ArrowLeft, CircleHelp, Database, Settings2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { LINES, limitsFor, readingLimits, readingStatus, timeCoordinate, timeLabel, filterReadings, dateRangeError, calculateCpk, type DateRange, type Assignments, type Reading, type Sample } from '@/lib/spc';
import DateRangeFilter from '@/components/date-range-filter';

export default function MachineDetail({ machineId, sample, assignments, dateRange, onDateRangeChange }: { machineId: string; sample: Sample; assignments: Assignments; dateRange:DateRange; onDateRangeChange:(range:DateRange)=>void }) {
  const [tableFrame, setTableFrame] = useState('all');
  const [tablePage, setTablePage] = useState(0);
  const line = LINES.find(l => l.machines.includes(machineId))!;
  const product = assignments[line.id];
  const allReadings = useMemo(() => sample.readings.filter(r => r.machineId === machineId), [sample, machineId]);
  const readings = useMemo(() => filterReadings(allReadings, dateRange), [allReadings, dateRange]);
  const capabilities = useMemo(() => [1,2,3,4].map(frame => calculateCpk(readings.filter(r => r.frame === frame), assignments)), [readings, assignments]);
  const visibleReadings = [...readings].filter(r => tableFrame === 'all' || r.frame === Number(tableFrame)).reverse();
  const pageCount = Math.max(1, Math.ceil(visibleReadings.length / 12));
  const currentPage = Math.min(tablePage, pageCount - 1);
  return <>
    <a className="back-link" href="#overview"><ArrowLeft size={15} />All production lines</a>
    <div className="page-heading"><div><p className="eyebrow">{line.id} / {Number(line.id.slice(1)) <= 4 ? 'WS1' : 'No sample'} / Frame gluing</p><h1>Machine {machineId}</h1><p className="subtitle">Individual weight charts · Four frame positions · Grams</p></div><div className="detail-controls">
      <Select value={machineId} onValueChange={v => { if (v) { location.hash = `machine/${v}`; setTablePage(0); } }}><SelectTrigger className="filter-select" aria-label="Select machine"><SelectValue>Machine {machineId}</SelectValue></SelectTrigger><SelectContent>{LINES.flatMap(l=>l.machines).map(id => <SelectItem key={id} value={id}>Machine {id}</SelectItem>)}</SelectContent></Select>
    </div></div>
    <div className="filter-toolbar"><DateRangeFilter range={dateRange} onChange={range=>{onDateRangeChange(range);setTablePage(0);}} fullRange={{from:sample.metadata.from.slice(0,10),to:sample.metadata.to.slice(0,10)}} /></div>
    <div className="notice"><CircleHelp size={18} /><p>{product === 'unassigned' ? 'Product not assigned. Weight trends are available; choose a line product in Admin to display control limits.' : `${product} · Established control limits · Product assigned for this sample period.`} Time is shown exactly as supplied.</p><a href="#admin"><Settings2 size={14} style={{display:'inline',marginRight:5}} />Edit {line.id} product</a></div>
    <section aria-label="Process capability" className="capability-section">
      <div className="sectionbar"><h2>Process capability <span>Selected Time window</span></h2><span className="tag">Specification limits = LCL / UCL</span></div>
      <div className="capability-grid">
        {capabilities.map((c,index) => <div className="panel capability-card" key={index}><span className="capability-label">F{index+1} · {index===0||index===3?'Long frame':'Short frame'}</span><div className="capability-metrics"><div><span>Cp</span><strong>{c.cp === null ? '—' : c.cp.toFixed(2)}</strong></div><div><span>Cpk</span><strong>{c.cpk === null ? '—' : c.cpk.toFixed(2)}</strong></div></div><span className="capability-note">{dateRangeError(dateRange) ? 'Check date range' : c.reason ?? `n = ${c.n} · ${c.n < 50 ? 'Small sample estimate' : 'Sample estimate'}`}</span>{c.cpk !== null && <span className="capability-details">Mean {c.mean!.toFixed(2)} g · σ {c.sigmaWithin!.toFixed(3)} g</span>}</div>)}
      </div>
      <details className="capability-method"><summary>Calculation method and interpretation</summary><p>Cp = (USL − LSL) / (6σ). Cpk = min[(USL − mean) / (3σ), (mean − LSL) / (3σ)]. σ is estimated from successive readings in Time order using average moving range / 1.128. LSL = LCL and USL = UCL, as configured for this dashboard. All readings in the selected date range, including those outside limits, are included.</p><p>Each frame is calculated separately. Estimates assume a stable process and approximately normal measurements; stability and normality have not been verified. Samples below 50 readings are labeled small samples. Mixed products, missing data, and zero observed variation do not produce numeric Cp or Cpk.</p><p><a href="https://www.itl.nist.gov/div898/handbook/pmc/section1/pmc16.htm" target="_blank" rel="noreferrer">NIST: process capability</a> · <a href="https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc322.htm" target="_blank" rel="noreferrer">NIST: individuals variation estimate</a></p></details>
    </section>
    <div className="sectionbar"><h2>Frame weight trends <span>{readings.length} readings</span></h2><div className="legend"><span><i className="line" />Weight</span><span><i className="line center" />Center line</span><span><i className="line limit" />LCL / UCL</span><span className="outside-emphasis"><i className="dot" />Outside limits</span></div></div>
    <div className="chart-grid">{[1,2,3,4].map(frame => <FrameChart key={`${machineId}-${frame}`} frame={frame} readings={readings.filter(r => r.frame === frame)} assignments={assignments} lineId={line.id} />)}</div>
    <section className="panel readings-panel"><div className="sectionbar" style={{marginTop:0}}><h2>Measurement history <span>Newest first</span></h2><Select value={tableFrame} onValueChange={v => {if(v) {setTableFrame(v); setTablePage(0);} }}><SelectTrigger className="filter-select" aria-label="History frame"><SelectValue>{tableFrame === 'all' ? 'All frames' : `Frame ${tableFrame}`}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All frames</SelectItem>{[1,2,3,4].map(f => <SelectItem key={f} value={String(f)}>Frame {f}</SelectItem>)}</SelectContent></Select></div>
      <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Frame</TableHead><TableHead>Weight (g)</TableHead><TableHead>LCL (g)</TableHead><TableHead>CL (g)</TableHead><TableHead>UCL (g)</TableHead><TableHead>Result</TableHead></TableRow></TableHeader><TableBody>{visibleReadings.slice(currentPage * 12,(currentPage+1)*12).map(r => { const limits = readingLimits(r,assignments); const status=readingStatus(r,assignments); return <TableRow key={r.id}><TableCell style={{fontVariantNumeric:'tabular-nums'}}>{r.Time}</TableCell><TableCell>F{r.frame} · {r.frame === 1 || r.frame === 4 ? 'Long' : 'Short'}</TableCell><TableCell style={{fontWeight:status==='outside'?850:600,color:status==='outside'?'var(--alert)':undefined}}>{r.weight.toFixed(2)}</TableCell><TableCell>{limits?.lcl ?? '—'}</TableCell><TableCell>{limits?.cl ?? '—'}</TableCell><TableCell>{limits?.ucl ?? '—'}</TableCell><TableCell><span className={`tag ${status==='outside'?'red':status==='within'?'teal':''}`}>{status==='outside'?'Outside limits':status==='within'?'Within limits':'Product not assigned'}</span></TableCell></TableRow>; })}</TableBody></Table>
      {!visibleReadings.length && <div className="empty-results">No readings in this Time window.</div>}
      <div className="sectionbar"><span className="muted" style={{fontSize:13}}>{visibleReadings.length ? `${currentPage*12+1}–${Math.min((currentPage+1)*12,visibleReadings.length)} of ${visibleReadings.length} readings` : '0 readings'}</span><div className="filters"><Button variant="outline" disabled={currentPage===0} onClick={() => setTablePage(currentPage-1)}>Previous</Button><span className="muted" style={{fontSize:13}}>Page {currentPage+1} / {pageCount}</span><Button variant="outline" disabled={currentPage+1>=pageCount} onClick={() => setTablePage(currentPage+1)}>Next</Button></div></div>
    </section>
  </>;
}

type ChartPoint = Reading & { x: number; lcl: number | null; cl: number | null; ucl: number | null; outside: boolean; };
function FrameChart({frame,readings,assignments,lineId}:{frame:number;readings:Reading[];assignments:Assignments;lineId:string}) {
  const points: ChartPoint[] = readings.map(r => {const l=readingLimits(r,assignments); return {...r,x:timeCoordinate(r.Time),lcl:l?.lcl??null,cl:l?.cl??null,ucl:l?.ucl??null,outside:readingStatus(r,assignments)==='outside'};});
  const last = readings.at(-1);
  const limit = last ? readingLimits(last,assignments) : limitsFor(assignments[lineId],frame);
  const evaluated = points.filter(p => p.lcl !== null).length;
  const outside = points.filter(p => p.outside).length;
  const values = points.flatMap(p => [p.weight,...(p.lcl===null?[]:[p.lcl,p.cl!,p.ucl!])]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 10;
  const pad = Math.max((max-min)*.18,2);
  return <section className="panel chart-panel"><div className="chart-header"><div className="chart-title"><span className="frame-box">F{frame}</span><div><h2>{frame===1||frame===4?'Long frame':'Short frame'}</h2><p>{last ? `Latest Time · ${last.Time.slice(5)}` : 'No measurement available'}</p></div></div><div className={"chart-value" + (last && readingStatus(last,assignments) === "outside" ? " outside-emphasis" : "")} style={{color:last&&readingStatus(last,assignments)==='outside'?'var(--alert)':undefined}}>{last?last.weight.toFixed(2):'—'} <small>{last?'g':''}</small></div></div>
    {points.length ? <div style={{width:'100%',height:255,minWidth:0}}><ResponsiveContainer width="100%" height={255} minWidth={0} initialDimension={{width:600,height:255}}><LineChart data={points} margin={{top:12,right:15,left:0,bottom:14}} accessibilityLayer>
      <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 4" />
      {/* Fit the filtered measurements; center a lone timestamp with a one-minute window. */}
      <XAxis dataKey="x" type="number" domain={([min,max]) => min === max ? [min-30_000,max+30_000] : [min,max]} padding={{left:6,right:6}} scale="time" tickFormatter={timeLabel} tick={{fontSize:12,fill:'var(--chart-text)'}} axisLine={{stroke:'var(--chart-axis)'}} tickLine={false} minTickGap={40} tickCount={4} label={{value:'Time',position:'insideBottom',offset:-10,fontSize:12,fill:'var(--chart-text)'}} />
      <YAxis domain={[Math.floor(min-pad),Math.ceil(max+pad)]} width={43} tick={{fontSize:12,fill:'var(--chart-text)'}} axisLine={false} tickLine={false} tickCount={5} />
      <Tooltip content={<WeightTooltip />} />
      <Line dataKey="ucl" type="stepAfter" stroke="var(--chart-limit)" strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} strokeWidth={1.2} name="UCL" />
      <Line dataKey="cl" type="stepAfter" stroke="var(--chart-center)" strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} strokeWidth={1} name="CL" />
      <Line dataKey="lcl" type="stepAfter" stroke="var(--chart-limit)" strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} strokeWidth={1.2} name="LCL" />
      <Line dataKey="weight" type="linear" stroke="var(--chart-weight)" strokeWidth={1.7} isAnimationActive={false} activeDot={{r:5,stroke:'var(--card)',strokeWidth:2}} dot={(props: {cx?:number;cy?:number;payload?:ChartPoint;index?:number}) => <circle key={props.payload?.id ?? props.index} cx={props.cx} cy={props.cy} r={props.payload?.outside?5:2.7} fill={props.payload?.outside?'var(--alert)':'var(--chart-weight)'} stroke="var(--card)" strokeWidth={1} />} name="Weight" />
    </LineChart></ResponsiveContainer></div> : <div className="chart-empty"><div style={{textAlign:'center'}}><Database size={26} style={{margin:'0 auto 10px',color:'var(--muted-foreground)'}} />No readings in this Time window</div></div>}
    <div className="chart-summary"><span>LCL <b>{limit?.lcl??'—'}</b></span><span>CL <b>{limit?.cl??'—'}</b></span><span>UCL <b>{limit?.ucl??'—'}</b></span><span>Readings <b>{readings.length}</b></span><span>Outside <b style={{fontWeight:outside?850:600,color:outside?'var(--alert)':undefined}}>{evaluated?outside:'—'}</b></span></div>
  </section>;
}
function WeightTooltip({active,payload}:{active?:boolean;payload?:ReadonlyArray<{payload?:ChartPoint}>}) {
  const point=payload?.find(p=>p.payload)?.payload;
  if(!active||!point) return null;
  return <div className="chart-tooltip"><p className="muted">Time · {point.Time}</p><p className={point.outside ? "outside-emphasis" : undefined}><strong>Frame {point.frame} · {point.weight.toFixed(2)} g</strong></p><p>{point.lcl===null?'Product not assigned':`LCL ${point.lcl} · CL ${point.cl} · UCL ${point.ucl} g`}</p>{point.outside&&<p className="outside-emphasis" style={{color:'var(--alert)'}}>Outside control limits</p>}</div>;
}
