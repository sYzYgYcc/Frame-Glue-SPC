'use client';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { dateRangeError, type DateRange } from '@/lib/spc';

export default function DateRangeFilter({range,onChange,fullRange}:{range:DateRange;onChange:(range:DateRange)=>void;fullRange:DateRange}) {
  const id=useId();
  const error=dateRangeError(range);
  return <div className="date-range-filter">
    <label htmlFor={`${id}-from`}>Start date<Input id={`${id}-from`} type="date" value={range.from} onChange={e=>onChange({...range,from:e.target.value})} aria-invalid={Boolean(error)} aria-describedby={error?`${id}-error`:undefined} /></label>
    <label htmlFor={`${id}-to`}>End date<Input id={`${id}-to`} type="date" value={range.to} onChange={e=>onChange({...range,to:e.target.value})} aria-invalid={Boolean(error)} aria-describedby={error?`${id}-error`:undefined} /></label>
    <Button variant="outline" onClick={()=>onChange({...fullRange})}>Full date range</Button>
    {error&&<span id={`${id}-error`} className="outside-emphasis date-range-error" role="alert">{error}</span>}
  </div>;
}
