import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePaperStrategy, performanceSnapshot } from '../src/paper-strategy.js';

const opportunity={id:'BTCUSDT:binance:bitget',symbol:'BTCUSDT',longVenue:'binance',shortVenue:'bitget',eligible:true,netEdgeBps:8,score:80,capacity:100000};

test('auto paper strategy opens only a qualified route',()=>{
  const result=evaluatePaperStrategy({enabled:true,opportunities:[opportunity],positions:[],pnlById:new Map(),notional:10000,now:100000});
  assert.equal(result.open?.symbol,'BTCUSDT');assert.equal(result.closes.length,0);
});

test('auto paper strategy closes at its simulated stop loss',()=>{
  const position={id:'p1',routeId:opportunity.id,symbol:'BTCUSDT',longVenue:'binance',shortVenue:'bitget',notional:10000,openedAt:0,entryFundingHourlyBps:1};
  const result=evaluatePaperStrategy({enabled:true,opportunities:[opportunity],positions:[position],pnlById:new Map([['p1',{net:-70}]]),notional:10000,now:600000});
  assert.match(result.closes[0].reason,/止损/);
});

test('auto paper strategy skips a qualified signal when venue capital is unavailable',()=>{
  const result=evaluatePaperStrategy({enabled:true,opportunities:[opportunity],positions:[],pnlById:new Map(),notional:10000,canOpen:()=>({ready:false,reason:'bitget 可用保证金不足'}),now:100000});
  assert.equal(result.open,null);assert.match(result.decisions[0].text,/可用保证金不足/);
});

test('performance snapshot separates gross funding and fees',()=>{
  const result=performanceSnapshot({closedTrades:[{net:90,gross:100,carryEstimate:10,entryFees:8,exitFees:12,closedAt:Date.now()}],openPnls:[{net:5}]});
  assert.equal(result.equity,100095);assert.equal(result.gross,100);assert.equal(result.funding,10);assert.equal(result.fees,20);
});
