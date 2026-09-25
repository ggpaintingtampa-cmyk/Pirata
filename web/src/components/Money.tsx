const formatter=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
export function formatMoney(cents:number|null|undefined):string {return cents===null||cents===undefined?'—':formatter.format(cents/100);}
/** Dollars from integer cents. Never render money without checking useCan('money.costs') or useCan('money.sales') first. */
export function Money({cents,className}:{cents:number|null|undefined;className?:string}) {return <span className={className}>{formatMoney(cents)}</span>;}
/** Parse "1,234.50" or "1234" into cents; null when not a valid non-negative amount. */
export function parseMoney(input:string):number|null {const clean=input.replace(/[$,\s]/g,'');if(!/^\d+(\.\d{1,2})?$/.test(clean))return null;const [whole,frac='']=clean.split('.');return Number(whole)*100+Number((frac+'00').slice(0,2));}
