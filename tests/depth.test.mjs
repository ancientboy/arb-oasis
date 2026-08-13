import assert from "node:assert/strict";
import test from "node:test";
import { capacityCurve, normalizeBook, vwap } from "../src/depth.js";

test("normalizes exchange depth and validates a sequence", () => {
  const book=normalizeBook("binance",{lastUpdateId:10,bids:[["99","2"]],asks:[["101","3"]]});
  assert.equal(book.valid,true);assert.equal(book.bids[0].price,99);assert.equal(book.asks[0].qty,3);
});

test("computes partial fills and dual-leg capacity curves", () => {
  const fill=vwap([{price:100,qty:1}],200);assert.equal(fill.fillRate,.5);
  const opportunity={longVenue:"binance",shortVenue:"bitget",fundingHorizonBps:2,totalCostBps:1};
  const depth={books:{binance:{valid:true,asks:[{price:100,qty:20}]},bitget:{valid:true,bids:[{price:101,qty:20}]}}};
  const [point]=capacityCurve(opportunity,depth,[1000]);assert.equal(point.executable,true);assert.ok(point.netEdgeBps>99);
});

test("rejects a crossed order book", () => {
  const book=normalizeBook("binance",{lastUpdateId:1,bids:[[101,"1"]],asks:[[100,"1"]]});
  assert.equal(book.valid,false);assert.equal(book.integrityError,"crossed-book");
});

test("uses Bitget snapshot timestamp as its version marker", () => {
  const book=normalizeBook("bitget",{data:{ts:"1786635833109",bids:[[100,2]],asks:[[101,2]]}});
  assert.equal(book.valid,true);assert.equal(book.sequence,"1786635833109");
});
