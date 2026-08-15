import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRebalance, canOpenRoute, capitalSnapshot, recommendRebalance } from '../src/capital-account.js';

const fees={binance:5,bitget:6,gate:7.5};
const route={symbol:'BTCUSDT',longVenue:'binance',shortVenue:'bitget'};

test('locks margin, fee reserve and maintenance buffer on both legs',()=>{
  const check=canOpenRoute({route,notional:10000,allocations:{binance:40000,bitget:35000,gate:25000},positions:[],feesBps:fees});
  assert.equal(check.ready,true);
  assert.ok(check.requirements.binance.required>5000);
  assert.ok(check.requirements.bitget.required>5000);
});

test('rejects a cross-venue route when one venue has insufficient free margin',()=>{
  const check=canOpenRoute({route,notional:10000,allocations:{binance:40000,bitget:1000,gate:59000},positions:[],feesBps:fees});
  assert.equal(check.ready,false);
  assert.match(check.reason,/bitget 可用保证金不足/);
});

test('derives free capital from open position locks and proposes a simulated transfer',()=>{
  const check=canOpenRoute({route,notional:10000,allocations:{binance:40000,bitget:1000,gate:59000},positions:[],feesBps:fees});
  const transfer=recommendRebalance({check,allocations:{binance:40000,bitget:1000,gate:59000}});
  assert.equal(transfer.to,'bitget');assert.ok(transfer.amount>=100);
  const next=applyRebalance({binance:40000,bitget:1000,gate:59000},transfer);
  assert.equal(next.binance+next.bitget+next.gate,100000);
  const snapshot=capitalSnapshot({allocations:{binance:40000,bitget:35000,gate:25000},positions:[{capitalLocks:check.requirements}]});
  assert.ok(snapshot.venues.binance.locked>0);
});
