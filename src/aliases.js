// Explicit equivalence only. Related wrappers and share classes stay distinct unless
// their economic exposure and contract specification have been verified.
export const TRADFI_ALIASES = new Map([
  ['GOOGL', { canonical:'GOOGL', kind:'exact', note:'Alphabet Class A' }],
  ['GOOG', { canonical:'GOOG', kind:'exact', note:'Alphabet Class C; not equivalent to GOOGL' }],
  ['XAU', { canonical:'XAU', kind:'exact', note:'Spot-gold reference family' }],
  ['GOLD', { canonical:'XAU', kind:'review', note:'Verify multiplier and reference index before equivalence' }],
]);

export function resolveTradFiAlias(base){
  const normalized=String(base||'').toUpperCase();
  return TRADFI_ALIASES.get(normalized)||{canonical:normalized,kind:'unmapped',note:'No explicit equivalence mapping'};
}
