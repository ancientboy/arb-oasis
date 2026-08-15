export const PAPER_POLICY={maxPositions:3,minNetEdgeBps:3,minScore:62,capacityMultiple:1.5,takeProfitPct:.003,stopLossPct:.006,maxHoldMinutes:360,minHoldMinutes:3,evaluationMs:5000,actionCooldownMs:10000};

export function evaluatePaperStrategy({enabled,opportunities,positions,pnlById,notional,now=Date.now(),policy=PAPER_POLICY}){
  if(!enabled)return {open:null,closes:[],decisions:[]};
  const decisions=[],closes=[];
  for(const position of positions){
    const pnl=pnlById.get(position.id),route=opportunities.find(x=>x.id===position.routeId||x.id===`${position.symbol}:${position.longVenue}:${position.shortVenue}`);
    const heldMinutes=(now-position.openedAt)/60000;
    let reason='';
    if(!pnl&&heldMinutes>=policy.minHoldMinutes)reason='行情中断，保护性退出';
    else if(pnl?.net<=-position.notional*policy.stopLossPct)reason='触发模拟止损';
    else if(pnl?.net>=position.notional*policy.takeProfitPct)reason='价差收敛止盈';
    else if(heldMinutes>=policy.maxHoldMinutes)reason='达到最长持仓时间';
    else if(heldMinutes>=policy.minHoldMinutes&&route&&route.netEdgeBps<=0)reason='净 Edge 已消失';
    else if(heldMinutes>=15&&position.entryFundingHourlyBps>0&&route?.fundingHourlyBps<=0)reason='Funding 方向反转';
    if(reason){closes.push({position,reason,pnl});decisions.push({level:'close',text:`平仓 ${position.symbol}：${reason}`});}
  }
  const remaining=positions.filter(p=>!closes.some(x=>x.position.id===p.id));
  if(remaining.length>=policy.maxPositions)return {open:null,closes,decisions};
  const symbols=new Set(remaining.map(p=>p.symbol));
  const candidate=opportunities.find(x=>x.eligible&&!symbols.has(x.symbol)&&x.netEdgeBps>=policy.minNetEdgeBps&&x.score>=policy.minScore&&x.capacity>=notional*policy.capacityMultiple);
  if(candidate){decisions.push({level:'open',text:`开仓 ${candidate.symbol}：净 Edge ${candidate.netEdgeBps.toFixed(2)} bp，评分 ${candidate.score}`});return {open:candidate,closes,decisions};}
  const best=opportunities.find(x=>x.eligible&&!symbols.has(x.symbol));
  if(best){const reason=best.netEdgeBps<policy.minNetEdgeBps?'净 Edge 未达阈值':best.score<policy.minScore?'评分不足':'容量不足';decisions.push({level:'skip',text:`跳过 ${best.symbol}：${reason}`});}
  return {open:null,closes,decisions};
}

export function performanceSnapshot({closedTrades=[],openPnls=[],initialEquity=100000}){
  const realized=closedTrades.reduce((sum,x)=>sum+(Number(x.net)||0),0),unrealized=openPnls.reduce((sum,x)=>sum+(Number(x?.net)||0),0);
  const todayStart=new Date();todayStart.setHours(0,0,0,0);
  const todayPnl=closedTrades.filter(x=>(x.closedAt||0)>=todayStart.getTime()).reduce((sum,x)=>sum+(Number(x.net)||0),0)+unrealized;
  let running=initialEquity,peak=initialEquity,maxDrawdown=0;for(const trade of [...closedTrades].reverse()){running+=Number(trade.net)||0;peak=Math.max(peak,running);maxDrawdown=Math.max(maxDrawdown,peak?((peak-running)/peak)*100:0);}
  const gross=closedTrades.reduce((sum,x)=>sum+(Number(x.gross)||0),0),funding=closedTrades.reduce((sum,x)=>sum+(Number(x.carryEstimate)||0),0),fees=closedTrades.reduce((sum,x)=>sum+(Number(x.entryFees)||0)+(Number(x.exitFees)||0),0);
  return {initialEquity,equity:initialEquity+realized+unrealized,realized,unrealized,todayPnl,totalPnl:realized+unrealized,maxDrawdown,gross,funding,fees};
}
