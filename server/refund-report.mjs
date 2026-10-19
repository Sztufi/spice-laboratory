import {dayKey,shiftDay} from './analytics-core.mjs';
export function attachRefundReport(report,rows){
 const opt=report.filters,group=day=>opt.group==='month'?day.slice(0,7):opt.group==='week'?shiftDay(day,-((new Date(day+'T12:00Z').getUTCDay()+6)%7)):day;
 const totals=new Map();let sum=0;
 for(const row of rows){
  const key=group(dayKey(row.created_at,opt.tz));sum+=row.amount_minor;totals.set(key,(totals.get(key)||0)+row.amount_minor);
 }
 report.refunds=rows;report.totals.refundedMinor=sum;report.totals.retainedMinor=report.totals.paidMinor-sum;
 for(const row of report.timeline){row.refundedMinor=totals.get(row.period)||0;row.retainedMinor=row.paidMinor-row.refundedMinor;}
 report.coverage.refundsAvailable=true;
 report.definitions.refunds='Csak sikeres Stripe-visszatérítések, a visszatérítés Stripe szerinti létrehozási napjára könyvelt riportkorrekcióval. Későbbi sikeres állapot korábbi időszakot módosíthat. A korábban rendelt, most visszatérített összegek is megjelennek. A megtartott pénz az időszaki fizetett összeg mínusz az időszaki visszatérítés; lehet negatív. Nem áfa nélküli nettó, profit vagy banki elszámolás. Nincs automatikus termékenkénti felosztás vagy készlet-visszavételezés.';
 return report;
}
