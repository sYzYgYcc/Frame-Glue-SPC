'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Activity, LayoutGrid, Settings2, Database, CalendarDays, ArrowUpRight, Factory, CircleHelp, Save, Check, AlertCircle, Monitor, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { fetchMeasurements } from '@/lib/data-source';
import { EMPTY_ASSIGNMENTS, LINES, STORAGE_KEY, validateAssignments, machineStatus, latestByFrame, readingStatus, filterReadings, dateRangeError, type DateRange, type Sample, type Assignments, type Assignment, type Reading } from '@/lib/spc';
import DateRangeFilter from '@/components/date-range-filter';
import MachineDetail from '@/components/machine-detail';
import { registerSpcTools, type SpcContext } from '@/lib/spc-tools';

function Choice({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: { value: string; label: string }[] }) {
  return <Select value={value} onValueChange={v => { if (v !== null) onChange(v); }}>
    <SelectTrigger className="filter-select" aria-label={label}><SelectValue>{options.find(o => o.value === value)?.label}</SelectValue></SelectTrigger>
    <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
  </Select>;
}
export { Choice };

const STATE_LABEL = { empty: 'No readings in range', unassigned: 'Product not assigned', outside: 'Outside limits', within: 'Latest within limits', incomplete: 'Incomplete data' };

export default function Dashboard() {
  const [sample, setSample] = useState<Sample | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [assignments, setAssignments] = useState<Assignments>(EMPTY_ASSIGNMENTS);
  const [draft, setDraft] = useState<Assignments>(EMPTY_ASSIGNMENTS);
  const [page, setPage] = useState('overview');
  const [selectedMachine, setSelectedMachine] = useState('101');
  const [machineFilter, setMachineFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>({from:'',to:''});
  const [stateFilter, setStateFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [storageError, setStorageError] = useState('');
  const [theme, setTheme] = useState('dark');
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('theme');
    let saved: string | null = null;
    try { saved = localStorage.getItem('illuminate-frame-spc-theme'); } catch { /* Theme switching still works without storage. */ }
    const initial = requested === 'light' || requested === 'dark' ? requested : saved === 'light' ? 'light' : 'dark';
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    try { localStorage.setItem('illuminate-frame-spc-theme', initial); } catch { /* Keep this session's theme. */ }
  }, []);
  function changeTheme(value: string) {
    if (value !== 'light' && value !== 'dark') return;
    setTheme(value);
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('illuminate-frame-spc-theme', value); } catch { /* Keep this session's theme. */ }
    const url = new URL(location.href);
    url.searchParams.set('theme', value);
    history.replaceState(history.state, '', url);
  }
  const current = useRef({ assignments, sample });
  current.current = { assignments, sample };
  const commitProducts = (products: Assignments) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    setAssignments({ ...products }); setDraft({ ...products });
    setMessage('Saved. Sample control limits updated.'); setStorageError('');
  };
  const commitRef = useRef(commitProducts);
  commitRef.current = commitProducts;
  useEffect(() => registerSpcTools((document as Document & { modelContext?: SpcContext }).modelContext, {
    read: () => ({ assignments: { ...current.current.assignments }, recordCount: current.current.sample?.readings.length ?? 0 }),
    save: products => {
      const next = { ...current.current.assignments, ...products };
      flushSync(() => commitRef.current(next));
      return { ...next };
    },
  }), []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetchMeasurements(controller.signal).then(data => {setSample(data);setDateRange({from:data.metadata.from.slice(0,10),to:data.metadata.to.slice(0,10)});}).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    try { const saved = validateAssignments(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); setAssignments(saved); setDraft(saved); }
    catch { setStorageError('Saved settings could not be read. You can assign products again in Admin.'); }
    const navigate = () => {
      const hash = location.hash.slice(1);
      if (hash.startsWith('machine/')) {
        const machine = hash.slice(8);
        if (LINES.some(l => l.machines.includes(machine))) { setSelectedMachine(machine); setPage('machine'); }
        else setPage('overview');
      } else setPage(hash === 'admin' ? 'admin' : 'overview');
      window.scrollTo(0, 0);
    };
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      try { const saved = validateAssignments(JSON.parse(event.newValue || '{}')); setAssignments(saved); setDraft(saved); } catch { /* Keep current valid settings. */ }
    };
    navigate(); window.addEventListener('hashchange', navigate); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('hashchange', navigate); window.removeEventListener('storage', sync); };
  }, []);
  const filteredReadings = useMemo(() => filterReadings(sample?.readings ?? [],dateRange).filter(r=>machineFilter==='all'||r.machineId===machineFilter),[sample,dateRange,machineFilter]);
  const invalidDateRange = dateRangeError(dateRange);
  const machines = useMemo(() => LINES.flatMap(line => line.machines.filter(id=>machineFilter==='all'||id===machineFilter).map(id => {
    const readings = filteredReadings.filter(r => r.machineId === id);
    return { id, lineId: line.id, readings, status: machineStatus(readings, assignments) };
  })), [filteredReadings, assignments, machineFilter]);
  const evaluated = filteredReadings.filter(r => readingStatus(r, assignments) !== 'unassigned');
  const outsideMachines = machines.filter(m => m.status === 'outside');
  const withData = machines.filter(m => m.readings.length);
  const unassigned = withData.filter(m => m.status === 'unassigned').length;
  const visibleLines = LINES.filter(line => machines.some(m => m.lineId === line.id && (stateFilter === 'all' || m.status === stateFilter)));
  const dirty = JSON.stringify(draft) !== JSON.stringify(assignments);
  function saveProducts() {
    try { commitProducts(draft); }
    catch { setMessage(''); setStorageError('Settings could not be saved. Please allow browser storage and try again.'); }
  }

  return <>
    <header className="topbar">
      <a href="#overview" className="brand" aria-label="Frame glue dashboard home"><span className="brand-mark"><Activity size={23} strokeWidth={1.8} /></span><div><strong>ILLUMINATE</strong><small>PROCESS QUALITY</small></div></a>
      <nav className="nav" aria-label="Main navigation"><a href="#overview" className={page !== 'admin' ? 'active' : ''}><LayoutGrid size={16} />Overview</a><a href="#admin" className={page === 'admin' ? 'active' : ''}><Settings2 size={16} />Admin{dirty && <span className="dot" title="Unsaved changes" />}</a><Choice label="Color theme" value={theme} onChange={changeTheme} options={[{value:'light',label:'Original white'},{value:'dark',label:'Dark blue'}]} /></nav>
      <div className="top-right"><span className="local-label">Frame gluing</span><span className="tag teal"><Database size={12} />WS1 sample</span></div>
    </header>
    <main className="main">
      {storageError && <div className="notice" role="alert"><AlertCircle size={17} /><p>{storageError}</p></div>}
      {page === 'admin' ? <>
        <div className="page-heading"><div><p className="eyebrow">Configuration</p><h1>Line product settings</h1><p className="subtitle">Assign a product to each line. Both machines use the same established control limits.</p></div><span className="tag"><Monitor size={13} />Local sample settings</span></div>
        <div className="notice"><CircleHelp size={18} /><p>Assignments apply to the full imported sample period. They are saved in this browser; they do not change machine recipes.</p></div>
        <div className="admin-grid"><section className="panel admin-panel"><h2>Product assignment</h2><p>Select the product that was running during this sample.</p>
          {LINES.map(line => <div className="admin-row" key={line.id}><strong>{line.id}</strong><span className="machine-names">Machines {line.machines.join(' & ')}</span><Choice label={`${line.id} product`} value={draft[line.id]} onChange={value => { setDraft(prev => ({ ...prev, [line.id]: value as Assignment })); setMessage(''); }} options={[{value:'unassigned',label:'Product not assigned'},{value:'72 HBD',label:'72 HBD'},{value:'78 HBD',label:'78 HBD'}]} /></div>)}
          <div className="admin-actions"><span className="save-message" role="status">{message || (dirty ? 'Unsaved changes' : 'No unsaved changes')}</span><div className="filters"><Button variant="outline" disabled={!dirty} onClick={() => { setDraft({ ...assignments }); setMessage(''); }}>Discard changes</Button><Button onClick={saveProducts} disabled={!dirty}><Save size={15} />Save settings</Button></div></div>
        </section><aside className="references">
          {(['72 HBD','78 HBD'] as const).map(product => <section className="panel reference-card" key={product}><h3>{product}<span className="tag teal" style={{float:'right'}}>g</span></h3><Table className="limits-table"><TableHeader><TableRow><TableHead>Frame</TableHead><TableHead>LCL</TableHead><TableHead>CL</TableHead><TableHead>UCL</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>1 & 4 · Long</TableCell><TableCell>{product === '72 HBD' ? 111 : 110}</TableCell><TableCell>{product === '72 HBD' ? 116 : 120}</TableCell><TableCell>{product === '72 HBD' ? 121 : 130}</TableCell></TableRow><TableRow><TableCell>2 & 3 · Short</TableCell><TableCell>41</TableCell><TableCell>46</TableCell><TableCell>51</TableCell></TableRow></TableBody></Table></section>)}
          <p className="admin-note">These established SPC control limits also serve as specification limits for Cpk: LSL = LCL, USL = UCL. They are fixed by product and are not recalculated from the sample. A reading equal to a limit is within limits.<br /><br />Product history is absent from this export. Use these assignments to evaluate a sample you know belongs to the selected product.</p>
        </aside></div>
      </> : error ? <div className="panel error-panel" role="alert"><AlertCircle size={30} style={{margin:'0 auto 12px'}} /><h1>Data could not load</h1><p>{error}</p><Button onClick={() => setAttempt(a => a + 1)}><RefreshCw size={15} />Try again</Button></div> : !sample ? <div className="panel loading-panel" role="status"><Database size={28} style={{margin:'0 auto 14px'}} />Loading WS1 measurements…</div> : page === 'machine' ? <MachineDetail key={selectedMachine} machineId={selectedMachine} sample={sample} assignments={assignments} dateRange={dateRange} onDateRangeChange={setDateRange} /> : <>
        <div className="page-heading"><div><p className="eyebrow">Frame glue / SPC dashboard</p><h1>Process overview</h1><p className="subtitle">Eight lines. Sixteen machines. Every frame in view.</p></div><div className="date-box"><CalendarDays size={16} /><span>{sample.metadata.from.slice(0,10)} — {sample.metadata.to.slice(0,10)}</span><span className="tag">Historical sample</span></div></div>
        <div className="filter-toolbar"><div className="machine-filter"><span>Machine</span><Choice label="Filter machine" value={machineFilter} onChange={setMachineFilter} options={[{value:'all',label:'All machines'},...LINES.flatMap(l=>l.machines).map(id => ({value:id,label:`Machine ${id}`}))]} /></div><DateRangeFilter range={dateRange} onChange={setDateRange} fullRange={{from:sample.metadata.from.slice(0,10),to:sample.metadata.to.slice(0,10)}} /></div>
        <div className="stats">
          <Stat label="Machines with data" value={invalidDateRange ? '—' : String(withData.length)} suffix={`/ ${machines.length}`} foot="Selected machines and date range" icon={<Factory size={19} />} />
          <Stat label="Machines outside control limits" value={evaluated.length ? String(outsideMachines.length) : '—'} suffix={evaluated.length ? 'machines' : undefined} foot={evaluated.length ? 'Any latest frame outside limits · Each machine counted once' : 'No evaluated readings in range'} icon={<AlertCircle size={19} />} alert={outsideMachines.length > 0} />
          <Stat label="Outside-limit machine numbers" value={outsideMachines.length ? outsideMachines.map(machine => <a key={machine.id} href={`#machine/${machine.id}`} className="stat-machine-link" aria-label={`View outside-limit machine ${machine.id}`}>{machine.id}</a>) : evaluated.length ? 'None' : '—'} foot={evaluated.length ? 'Based on each frame’s latest Time' : 'No evaluated readings in range'} icon={<Factory size={19} />} alert={outsideMachines.length > 0} compact />
          <Stat label="Latest readings within limits" value={evaluated.length ? String(machines.filter(m => m.status === 'within').length) : '—'} suffix={evaluated.length ? 'machines' : undefined} foot={`${unassigned} machines need product assignment`} icon={<Check size={19} />} />
        </div>
        {unassigned > 0 && <div className="notice"><CircleHelp size={18} /><p>Assign line products in Admin to display control limits and identify out-of-control readings.</p><a href="#admin">Manage products <span aria-hidden="true">→</span></a></div>}
        {!invalidDateRange && !filteredReadings.length && <p className="subtitle">No readings for the selected machines and date range.</p>}
        <div className="sectionbar"><h2>Production lines <span>{visibleLines.length} of 8 lines</span></h2><div className="filters"><Choice label="Filter machine status" value={stateFilter} onChange={setStateFilter} options={[{value:'all',label:'All statuses'},{value:'outside',label:'Outside limits'},{value:'within',label:'Latest within limits'},{value:'unassigned',label:'Product needed'},{value:'empty',label:'No readings in range'}]} /></div></div>
        <div className="line-grid">{visibleLines.map(line => <section className="line-panel" key={line.id}><header className="line-heading"><div className="line-name"><span className="line-number">{line.id}</span><small>{Number(line.id.slice(1)) <= 4 ? 'WS1' : 'No sample'}</small></div><a href="#admin" title={`Change ${line.id} product in Admin`} className={`tag ${assignments[line.id] === 'unassigned' ? '' : 'teal'}`}>{assignments[line.id] === 'unassigned' ? 'Set product' : assignments[line.id]}<Settings2 size={11} /></a></header><div className="machine-pair">{machines.filter(m => m.lineId === line.id && (stateFilter === 'all' || m.status === stateFilter)).map(machine => <MachineCard key={machine.id} {...machine} assignments={assignments} />)}</div></section>)}</div>
        {!visibleLines.length && <div className="panel empty-results">No machines match these filters.</div>}
      </>}
      <footer className="footer"><span>FRAME GLUE SPC</span><span>Source: Frame Glue machine, Designed by: Bryan Yu; Weight: g</span></footer>
    </main>
  </>;
}

function Stat({ label, value, suffix, foot, icon, alert = false, compact = false }: { label: string; value: React.ReactNode; suffix?: string; foot: string; icon: React.ReactNode; alert?: boolean; compact?: boolean }) {
  return <div className="stat"><span className="stat-icon">{icon}</span><div className={alert ? 'stat-label outside-emphasis' : 'stat-label'}>{label}</div><div className={`stat-value${alert ? ' outside-emphasis' : ''}${compact ? ' stat-machine-list' : ''}`}>{value}{suffix && <small>{suffix}</small>}</div><div className="stat-foot">{foot}</div></div>;
}
function MachineCard({id, readings, status, assignments}: { id: string; readings: Reading[]; status: keyof typeof STATE_LABEL; assignments: Assignments }) {
  const latest = latestByFrame(readings);
  const lastTime = latest.filter((r): r is Reading => Boolean(r)).map(r => r.Time).sort().at(-1);
  return <a className="machine-card" href={`#machine/${id}`} aria-label={`View machine ${id} SPC charts`}><div className="machine-title"><strong>{id}</strong><ArrowUpRight size={16} /></div>{readings.length ? <><div className={`machine-state ${status === 'outside' ? 'bad' : status === 'within' ? 'good' : ''}`}><span className="dot" />{STATE_LABEL[status]}</div><div className="weights">{latest.map((r,index) => <div key={index} className={`frame-reading ${r && readingStatus(r,assignments) === 'outside' ? 'bad' : ''}`} title={r ? `Frame ${index+1} · Time: ${r.Time} · ${readingStatus(r,assignments) === 'outside' ? 'Outside limits' : readingStatus(r,assignments) === 'within' ? 'Within limits' : 'Product not assigned'}` : 'No reading'}><small>F{index+1} · {index === 0 || index === 3 ? 'Long' : 'Short'}</small><strong>{r ? r.weight.toFixed(2) : '—'}</strong>{r && <span className="unit">g</span>}</div>)}</div><div className="machine-foot">Latest Time · {lastTime?.slice(5)}</div></> : <div className="empty-machine"><Database size={23} strokeWidth={1.3} /><span>No readings in range</span></div>}</a>;
}
