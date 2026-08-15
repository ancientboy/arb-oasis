import { VENUES } from './config.js';

export const CAPITAL_POLICY={leverage:2,maintenanceBufferPct:.12,feeReserveRounds:2,minTransferUsdt:100};
export const DEFAULT_ALLOCATION={binance:40000,bitget:35000,gate:25000};

export function normalizeAllocations(input={}){
  return Object.fromEntries(VENUES.map(venue=>[venue,Math.max(0,Number(input[venue]??DEFAULT_ALLOCATION[venue])||0)]));
}

export function totalCapital(allocations){return Object.values(normalizeAllocations(allocations)).reduce((sum,value)=>sum+value,0);}

export function legRequirement({venue,notional,feesBps,policy=CAPITAL_POLICY}){
  const margin=notional/policy.leverage;
  const feeReserve=notional*(Number(feesBps[venue])||0)/10000*policy.feeReserveRounds;
  const maintenanceBuffer=margin*policy.maintenanceBufferPct;
  return {venue,margin,feeReserve,maintenanceBuffer,required:margin+feeReserve+maintenanceBuffer};
}

export function routeRequirements({route,notional,feesBps,policy=CAPITAL_POLICY}){
  const legs=[legRequirement({venue:route.longVenue,notional,feesBps,policy}),legRequirement({venue:route.shortVenue,notional,feesBps,policy})];
  return Object.fromEntries(legs.map(leg=>[leg.venue,leg]));
}

export function capitalSnapshot({allocations,positions=[]}){
  const normalized=normalizeAllocations(allocations);
  const used=Object.fromEntries(VENUES.map(venue=>[venue,0]));
  for(const position of positions)for(const [venue,lock] of Object.entries(position.capitalLocks||{}))if(venue in used)used[venue]+=Number(lock.required)||0;
  const venues=Object.fromEntries(VENUES.map(venue=>{
    const equity=normalized[venue],locked=used[venue],free=equity-locked;
    return [venue,{venue,equity,locked,free,usage:equity?locked/equity:0}];
  }));
  const total=Object.values(venues).reduce((sum,row)=>sum+row.equity,0),locked=Object.values(venues).reduce((sum,row)=>sum+row.locked,0);
  return {venues,total,locked,free:total-locked,usage:total?locked/total:0};
}

export function canOpenRoute({route,notional,allocations,positions,feesBps,policy=CAPITAL_POLICY}){
  const requirements=routeRequirements({route,notional,feesBps,policy});
  const snapshot=capitalSnapshot({allocations,positions});
  const shortages=[];
  for(const [venue,requirement] of Object.entries(requirements)){
    const available=snapshot.venues[venue]?.free||0,deficit=Math.max(0,requirement.required-available);
    if(deficit>.005)shortages.push({venue,required:requirement.required,available,deficit});
  }
  const reason=shortages.length?shortages.map(x=>`${x.venue} 可用保证金不足（缺 $${Math.ceil(x.deficit).toLocaleString()}）`).join('；'):'';
  return {ready:shortages.length===0,reason,shortages,requirements,snapshot};
}

export function recommendRebalance({check,allocations,positions=[]}){
  if(check.ready||!check.shortages.length)return null;
  const snapshot=capitalSnapshot({allocations,positions});
  const target=[...check.shortages].sort((a,b)=>b.deficit-a.deficit)[0];
  const donors=Object.values(snapshot.venues).filter(row=>row.venue!==target.venue&&row.free>=CAPITAL_POLICY.minTransferUsdt).sort((a,b)=>b.free-a.free);
  const donor=donors[0];
  if(!donor)return null;
  const amount=Math.floor(Math.min(target.deficit,donor.free)*100)/100;
  if(amount<CAPITAL_POLICY.minTransferUsdt)return null;
  return {from:donor.venue,to:target.venue,amount,reason:`补足 ${target.venue} 的双腿保证金缺口`,createdAt:Date.now(),status:'模拟完成'};
}

export function applyRebalance(allocations,transfer){
  if(!transfer||transfer.amount<=0)return normalizeAllocations(allocations);
  const next=normalizeAllocations(allocations),amount=Math.min(next[transfer.from]||0,Number(transfer.amount)||0);
  if(!amount||!next[transfer.to]&&next[transfer.to]!==0)return next;
  next[transfer.from]-=amount;next[transfer.to]+=amount;
  return next;
}
