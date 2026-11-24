// Token Radar, model "radar-5".
//
// One sealed snapshot in, one ranked board out. The board ranks pre-token protocols
// (the snapshot records no token for them) by the implied value a launch would carry
// if the protocol's record stayed as it is. It never predicts whether or when a token
// is issued, and an implied value is this entry's own claim, never make.fun's.
//
// radar-5 prices every protocol off the snapshot's own live market, then adjusts it
// with eleven factors the snapshot itself supplies:
//
//   base        = tvl_usd x category_multiple
//   momentum    = 1 + w x clamp(change_7d, -80, 200) / 100, w = 0.4 up, 0.7 down
//   relative    = 1 + 0.3 x (percentile(change_7d in its category) - 0.5) x 2
//   sector      = 1 + 0.25 x clamp(live_median_7d_of_category, -30, 30) / 100
//   stability   = 1 - 0.12 x clamp((|change_7d| - 30) / 70, 0, 1)
//   age         = 0.45 + 0.55 x (1 - exp(-age_days / 548)) x decay(age_days)
//   velocity    = 0.95 + 0.10 x clamp((log10(tvl_usd / max(age_days, 30)) - 3) / 3, 0, 1)
//   scale       = 0.92 + 0.08 x clamp(log10(tvl_usd / 5e6) / 4.3, 0, 1)
//   breadth     = 1 + 0.02 x min(chains - 1, 8)
//   chain       = 1 + 0.06 x (major chains / all chains)
//   focus       = 1 - 0.08 x min(tvl / category_total_tvl, 0.75)
//   deployment  = 0.70 when the name ends in a version marker, else 1
//   implied     = round(base x momentum x relative x sector x stability x age
//                       x velocity x scale x breadth x chain x focus x deployment)
//
// Why these factors, and what changed from radar-4 (v3):
//
// - category_multiple is now shrunk by sample size, not by a fixed half and a
//   cut-off: weight = n / (n + 6), where n is the count of live-token protocols in
//   the category. A category with twenty live protocols mostly sets its own price;
//   one with three mostly takes the global median, and fewer than three take it
//   outright. Every live ratio is winsorized into the 0.08-0.60 band before the
//   median, so one outlier never sets a price: Risk Curators has a single live
//   protocol at 2.98x TVL, and it prices at the global median, not at the cap.
// - relative momentum is now a percentile, not a raw gap. A protocol's week is
//   ranked against every other protocol in its own category, so one outlier's
//   +200% week can no longer stretch the factor for its neighbours, and a protocol
//   is credited for beating its peers however wild the week was.
// - stability is new. A protocol that swung 60% in either direction in a week is
//   a shakier launch than one that moved 5%, even if the signed move favours it:
//   wild weeks discount the value by up to 12%.
// - age rises faster and peaks earlier (about two and a half years), and a
//   protocol listed under three months starts lower: unproven launches are worth
//   less until they have run a while with no token.
// - velocity is new: TVL per day listed, on a log scale. A young protocol that
//   already holds hundreds of millions accumulated fast, which is a stronger
//   launch signal than the same TVL gathered over five quiet years.
// - chain quality is new: the share of the protocol's chains that are major
//   networks (Ethereum, Solana, Base, Arbitrum and the like). A launch on chains
//   where farmers already hold funds is worth more than one stranded on a chain
//   nobody uses.
// - the board now covers every farmable pre-token protocol the snapshot holds:
//   the 40 watchlist rows, every rankable pre-token protocol below the floor, and
//   the 11 versioned deployments (a V2 or V3 deployment of a pre-token protocol),
//   each deployment discounted by 0.70 and badged as one, because a deployment is
//   a slice of a protocol, not the whole of it. What stays out, and why: exchanges
//   (a CEX launch is not a farmable airdrop) and the wrapped, staked and bridged
//   products of tokens that already trade at or above the floor — ranking WBTC or
//   a staked-ETH wrapper first would be ranking Bitcoin and ETH, not a launch.
//   The twenty above-floor pre-token protocols the watchlist leaves out are left
//   out here too: the house's list excludes them for a parent protocol the
//   snapshot does not carry, and this radar does not second-guess that.
//
// No protocol name is ever special-cased: the same function scores every row.

/** One protocol entry of the sealed snapshot: exactly the ten fields it carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** radar-5's constants, as the dashboard states them. */
export interface ModelConstants {
  multiple_shrink_prior: number;
  multiple_floor: number;
  multiple_cap: number;
  min_live_for_category: number;
  growth_up_weight: number;
  growth_down_weight: number;
  growth_floor: number;
  growth_cap: number;
  relative_weight: number;
  sector_weight: number;
  sector_floor: number;
  sector_cap: number;
  stability_weight: number;
  stability_knee: number;
  stability_span: number;
  age_floor: number;
  age_range: number;
  age_halflife_days: number;
  age_peak_days: number;
  age_decay_days: number;
  unknown_age_days: number;
  velocity_floor: number;
  velocity_range: number;
  velocity_log_floor: number;
  velocity_log_span: number;
  velocity_min_days: number;
  scale_floor: number;
  scale_range: number;
  scale_base_tvl: number;
  scale_log_span: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  chain_quality_weight: number;
  concentration_weight: number;
  concentration_cap: number;
  deployment_discount: number;
}

export const MODEL: ModelConstants = {
  multiple_shrink_prior: 6,
  multiple_floor: 0.08,
  multiple_cap: 0.6,
  min_live_for_category: 3,
  growth_up_weight: 0.4,
  growth_down_weight: 0.7,
  growth_floor: -80,
  growth_cap: 200,
  relative_weight: 0.3,
  sector_weight: 0.25,
  sector_floor: -30,
  sector_cap: 30,
  stability_weight: 0.12,
  stability_knee: 30,
  stability_span: 70,
  age_floor: 0.45,
  age_range: 0.55,
  age_halflife_days: 548,
  age_peak_days: 912,
  age_decay_days: 3650,
  unknown_age_days: 365,
  velocity_floor: 0.95,
  velocity_range: 0.1,
  velocity_log_floor: 3,
  velocity_log_span: 3,
  velocity_min_days: 30,
  scale_floor: 0.92,
  scale_range: 0.08,
  scale_base_tvl: 5_000_000,
  scale_log_span: 4.3,
  breadth_per_chain: 0.02,
  breadth_max_chains: 8,
  chain_quality_weight: 0.06,
  concentration_weight: 0.08,
  concentration_cap: 0.75,
  deployment_discount: 0.7,
};

/** The model's version label: the dashboard names it and the README quotes it. */
export const MODEL_VERSION = 'radar-5';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One factor of a row's implied value, for the detail view's breakdown. */
export interface ValueFactor {
  key: string;
  label: string;
  value: number;
  note: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  is_deployment: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    momentum: number;
    relative_momentum: number;
    sector_heat: number;
    stability: number;
    age_multiplier: number;
    velocity_multiplier: number;
    scale_multiplier: number;
    breadth_multiplier: number;
    chain_quality: number;
    concentration_multiplier: number;
    deployment_multiplier: number;
    age_days: number | null;
    category_share: number;
    category_median_7d: number | null;
    sector_median_7d: number | null;
    change_percentile: number | null;
  };
  value_breakdown: ValueFactor[];
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  deployment: boolean;
  effort: 'Low' | 'Medium' | 'High';
  est_cost_usd: number;
  multiple: number;
  momentum: number;
  relative: number;
  sector: number;
  stability: number;
  age_mult: number;
  velocity_mult: number;
  scale_mult: number;
  breadth_mult: number;
  chain_mult: number;
  concentration_mult: number;
  share: number;
  breakdown: ValueFactor[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** One category's multiple, for the model page's table. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  live_count: number;
  live_median_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  deployment_size: number;
  live_size: number;
  global_multiple: number;
  median_change_7d: number | null;
  total_implied_usd: number;
  category_multiples: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The middle value of a sorted list, or null when it is empty. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is one deployment of a protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board ranks at full value: pre-token, not an exchange, not a versioned deployment. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Whether a protocol is a versioned deployment of a pre-token protocol: rankable, at a discount, and badged as one. */
export function isDeployment(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && VERSIONED.test(p.name);
}

/** The chains where farmers already hold funds: a launch there is worth more than one stranded elsewhere. */
const MAJOR_CHAINS = new Set([
  'ethereum', 'solana', 'base', 'arbitrum', 'optimism', 'binance', 'bnb',
  'polygon', 'avalanche', 'sui', 'aptos', 'linea', 'scroll', 'zksync era',
  'tron', 'near', 'ton', 'berachain', 'hyperliquid', 'ink',
]);

/** The live market's price per category: median mcap/TVL, shrunk toward the global median by sample size.
 *  Each live ratio is winsorized into the [floor, cap] band before the median, so one
 *  outlier (a single live protocol at 3x TVL) can never set a category's price; and a
 *  category with fewer than three live protocols takes the global median outright. */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants): { global: number; byCategory: Map<string, number>; counts: Map<string, number> } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && (p.mcap_usd ?? 0) > 0);
  const ratios = live.map((p) => clamp(p.mcap_usd! / p.tvl_usd, model.multiple_floor, model.multiple_cap)).sort((a, b) => a - b);
  const global = median(ratios) ?? 0.25;
  const perCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = perCat.get(key) ?? [];
    list.push(clamp(p.mcap_usd! / p.tvl_usd, model.multiple_floor, model.multiple_cap));
    perCat.set(key, list);
  }
  const byCategory = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const [cat, list] of perCat) {
    const sorted = list.sort((a, b) => a - b);
    const catMed = median(sorted) ?? global;
    // Sample-size shrinkage: weight n / (n + prior). Twenty live protocols
    // mostly set their own price; two mostly take the global median; fewer
    // than three take it outright, so one outlier never sets a price.
    const priced = list.length >= model.min_live_for_category
      ? (list.length / (list.length + model.multiple_shrink_prior)) * catMed + (1 - list.length / (list.length + model.multiple_shrink_prior)) * global
      : global;
    byCategory.set(cat, clamp(priced, model.multiple_floor, model.multiple_cap));
    counts.set(cat, list.length);
  }
  return { global: clamp(global, model.multiple_floor, model.multiple_cap), byCategory, counts };
}

/** Median 7-day change per category, over all protocols and over live ones only, plus the sorted changes for percentiles. */
export function categoryMedians(snapshot: Snapshot): {
  all: Map<string, number>;
  live: Map<string, number>;
  sortedAll: Map<string, number[]>;
} {
  const allLists = new Map<string, number[]>();
  const liveLists = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.change_7d === null || !Number.isFinite(p.change_7d)) continue;
    const key = p.category ?? 'Uncategorised';
    const a = allLists.get(key) ?? [];
    a.push(p.change_7d);
    allLists.set(key, a);
    if (!isPreToken(p)) {
      const l = liveLists.get(key) ?? [];
      l.push(p.change_7d);
      liveLists.set(key, l);
    }
  }
  const toMedian = (lists: Map<string, number[]>): Map<string, number> => {
    const out = new Map<string, number>();
    for (const [k, v] of lists) {
      const m = median(v.sort((a, b) => a - b));
      if (m !== null) out.set(k, m);
    }
    return out;
  };
  const sortedAll = new Map<string, number[]>();
  for (const [k, v] of allLists) sortedAll.set(k, [...v].sort((a, b) => a - b));
  return { all: toMedian(allLists), live: toMedian(liveLists), sortedAll };
}

/** Where `value` sits in a sorted list, as a percentile from 0 to 1; null when the list is empty. */
export function percentile(sorted: number[], value: number): number | null {
  if (sorted.length === 0) return null;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

/** The share of its category's TVL one protocol holds, and that category's total TVL. */
function categoryShare(snapshot: Snapshot, p: SnapshotProtocol): { share: number; total: number } {
  let total = 0;
  for (const q of snapshot.protocols) if ((q.category ?? 'Uncategorised') === (p.category ?? 'Uncategorised')) total += q.tvl_usd;
  return { share: total > 0 ? p.tvl_usd / total : 0, total };
}

/** The hump-shaped age factor: credibility grows to about two and a half years, then decays slowly. */
export function ageMultiplier(age: number | null, model: ModelConstants): number {
  const days = age ?? model.unknown_age_days;
  const rise = 1 - Math.exp(-Math.max(days, 0) / model.age_halflife_days);
  const decay = days <= model.age_peak_days ? 1 : Math.exp(-(days - model.age_peak_days) / model.age_decay_days);
  return model.age_floor + model.age_range * rise * decay;
}

/** The eleven factors and the implied value one protocol gets under radar-5. */
export function scoreProtocol(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  multiples: { global: number; byCategory: Map<string, number> },
  medians: { all: Map<string, number>; live: Map<string, number>; sortedAll: Map<string, number[]> },
  model: ModelConstants,
): {
  implied: number;
  factors: ValueFactor[];
  age: number | null;
  multiple: number;
  growthPct: number;
  share: number;
  momentum: number;
  relative: number;
  sector: number;
  stability: number;
  ageMult: number;
  velocityMult: number;
  scaleMult: number;
  breadthMult: number;
  chainMult: number;
  concentrationMult: number;
  deploymentMult: number;
  catMedian7d: number | null;
  sectorMedian7d: number | null;
  changePercentile: number | null;
} {
  const catKey = p.category ?? 'Uncategorised';
  const multiple = multiples.byCategory.get(catKey) ?? multiples.global;
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const weight = growthPct >= 0 ? model.growth_up_weight : model.growth_down_weight;
  const momentum = 1 + (growthPct / 100) * weight;
  const catMedian7d = medians.all.get(catKey) ?? null;
  const sortedChanges = medians.sortedAll.get(catKey) ?? [];
  const changePercentile = p.change_7d === null ? null : percentile(sortedChanges, p.change_7d);
  const relative = 1 + model.relative_weight * ((changePercentile ?? 0.5) - 0.5) * 2;
  const sectorMedian7d = medians.live.get(catKey) ?? null;
  const sectorPct = clamp(sectorMedian7d ?? 0, model.sector_floor, model.sector_cap);
  const sector = 1 + (sectorPct / 100) * model.sector_weight;
  const stability = 1 - model.stability_weight * clamp((Math.abs(rawGrowth) - model.stability_knee) / model.stability_span, 0, 1);
  const age = ageDays(snapshot.as_of, p.listed_at);
  const ageMult = ageMultiplier(age, model);
  const ageForVelocity = age ?? model.unknown_age_days;
  const tvlPerDay = p.tvl_usd / Math.max(ageForVelocity, model.velocity_min_days);
  const velocityMult = model.velocity_floor + model.velocity_range * clamp((Math.log10(Math.max(tvlPerDay, 1)) - model.velocity_log_floor) / model.velocity_log_span, 0, 1);
  const scaleMult = model.scale_floor + model.scale_range * clamp(Math.log10(Math.max(p.tvl_usd, 1) / model.scale_base_tvl) / model.scale_log_span, 0, 1);
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  const majorCount = p.chains.filter((c) => MAJOR_CHAINS.has(c.toLowerCase())).length;
  const chainMult = 1 + model.chain_quality_weight * (p.chains.length > 0 ? majorCount / p.chains.length : 0);
  const { share } = categoryShare(snapshot, p);
  const concentrationMult = 1 - model.concentration_weight * Math.min(share, model.concentration_cap);
  const deploymentMult = VERSIONED.test(p.name) ? model.deployment_discount : 1;
  const base = p.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * momentum * relative * sector * stability * ageMult * velocityMult * scaleMult * breadthMult * chainMult * concentrationMult * deploymentMult));
  const factors: ValueFactor[] = [
    { key: 'base', label: 'Base value (TVL x category multiple)', value: Math.round(base), note: `TVL $${p.tvl_usd.toLocaleString('en-US')} x ${multiple.toFixed(3)}` },
    { key: 'momentum', label: '7-day momentum (asymmetric)', value: Math.round(momentum * 10000) / 10000, note: `change_7d ${p.change_7d === null ? 'not reported (0%)' : `${p.change_7d}%`} clamped to ${growthPct}%, ${growthPct >= 0 ? 'up weight 0.4' : 'down weight 0.7'}` },
    { key: 'relative', label: 'Momentum vs its category (percentile)', value: Math.round(relative * 10000) / 10000, note: changePercentile === null ? 'no 7-day change reported, counted at the category median' : `its ${p.change_7d}% week ranks at the ${(changePercentile * 100).toFixed(0)}th percentile of its category (median ${catMedian7d === null ? 'n/a' : `${catMedian7d.toFixed(2)}%`})` },
    { key: 'sector', label: 'Sector heat (live tokens)', value: Math.round(sector * 10000) / 10000, note: sectorMedian7d === null ? 'no live-token median in this category' : `live tokens in this category moved ${sectorMedian7d.toFixed(2)}% in 7 days` },
    { key: 'stability', label: 'Weekly stability', value: Math.round(stability * 10000) / 10000, note: `a ${Math.abs(rawGrowth).toFixed(1)}% weekly move in either direction is ${Math.abs(rawGrowth) <= model.stability_knee ? 'steady, no discount' : 'wild, discounted for it'}` },
    { key: 'age', label: 'Time without a token', value: Math.round(ageMult * 10000) / 10000, note: age === null ? 'listed date not reported, counted as 365 days' : `${age} days listed, no token on record; credibility peaks near 2.5 years, then decays` },
    { key: 'velocity', label: 'TVL velocity (TVL per day listed)', value: Math.round(velocityMult * 10000) / 10000, note: `$${Math.round(tvlPerDay).toLocaleString('en-US')} of TVL per day listed` },
    { key: 'scale', label: 'Liquidity depth (log TVL)', value: Math.round(scaleMult * 10000) / 10000, note: `TVL $${p.tvl_usd.toLocaleString('en-US')} on a log scale from $5M` },
    { key: 'breadth', label: 'Chain breadth', value: Math.round(breadthMult * 10000) / 10000, note: `${p.chains.length} chain${p.chains.length === 1 ? '' : 's'} counted` },
    { key: 'chain', label: 'Chain quality (major chains)', value: Math.round(chainMult * 10000) / 10000, note: `${majorCount} of ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'} are major networks farmers already use` },
    { key: 'concentration', label: 'Category concentration', value: Math.round(concentrationMult * 10000) / 10000, note: `${(share * 100).toFixed(1)}% of its category's TVL` },
  ];
  if (deploymentMult !== 1) {
    factors.push({ key: 'deployment', label: 'Deployment discount', value: deploymentMult, note: `${p.name} is one versioned deployment of its protocol, not the whole protocol, so its value is discounted to 70%` });
  }
  return { implied, factors, age, multiple, growthPct, share, momentum, relative, sector, stability, ageMult, velocityMult, scaleMult, breadthMult, chainMult, concentrationMult, deploymentMult, catMedian7d, sectorMedian7d, changePercentile };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = categoryMultiples(snapshot, model);
  const medians = categoryMedians(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor,
  // by TVL, strongest first. Never a replacement for a watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);
  // Versioned deployments: one V2 or V3 of a pre-token protocol, discounted and
  // badged, so a reader can farm the deployment itself. Exchanges stay out.
  const deployments = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isDeployment(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of deployments) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = scoreProtocol(p, snapshot, multiples, medians, model);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    is_deployment: s.deploymentMult !== 1,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.multiple),
      growth_pct: s.growthPct,
      momentum: round4(s.momentum),
      relative_momentum: round4(s.relative),
      sector_heat: round4(s.sector),
      stability: round4(s.stability),
      age_multiplier: round4(s.ageMult),
      velocity_multiplier: round4(s.velocityMult),
      scale_multiplier: round4(s.scaleMult),
      breadth_multiplier: round4(s.breadthMult),
      chain_quality: round4(s.chainMult),
      concentration_multiplier: round4(s.concentrationMult),
      deployment_multiplier: s.deploymentMult,
      age_days: s.age,
      category_share: round4(s.share),
      category_median_7d: s.catMedian7d === null ? null : round4(s.catMedian7d),
      sector_median_7d: s.sectorMedian7d === null ? null : round4(s.sectorMedian7d),
      change_percentile: s.changePercentile === null ? null : round4(s.changePercentile),
    },
    value_breakdown: s.factors,
    farm_steps: farmSteps(s.p, s.age).map((step) => stepText(step)),
  }));
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A chain's fee family, for gas estimates: mainnet, a cheap L2, a cheap L1, or other. */
function feeFamily(chain: string): 'mainnet' | 'l2' | 'fast' | 'other' {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'mainnet';
  if (['base', 'arbitrum', 'optimism', 'zksync era', 'zksync', 'polygon', 'linea', 'scroll', 'blast', 'mode', 'mantle', 'taiko', 'opbnb', 'bnb', 'avalanche'].includes(c)) return 'l2';
  if (['solana', 'sui', 'aptos', 'near', 'tron', 'ton'].includes(c)) return 'fast';
  return 'other';
}

/** A gas estimate in words for one transaction on this protocol's chain. */
function gasFor(chain: string): string {
  const f = feeFamily(chain);
  if (f === 'mainnet') return 'about $5 to $20 of gas on Ethereum mainnet';
  if (f === 'l2') return 'under $1 of gas on a cheap chain';
  if (f === 'fast') return 'a few cents of gas';
  return 'about $1 to $3 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 120;
  return 75;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The effort a farm takes: capital plus gas on its chain. */
export function effortFor(p: SnapshotProtocol): { effort: 'Low' | 'Medium' | 'High'; estCostUsd: number } {
  const capital = capitalFor(p);
  const gas = feeFamily(chainOf(p)) === 'mainnet' ? 40 : feeFamily(chainOf(p)) === 'other' ? 10 : 3;
  const estCostUsd = capital + gas * 4;
  if (capital <= 75 && gas <= 3) return { effort: 'Low', estCostUsd };
  if (capital <= 120) return { effort: 'Medium', estCostUsd };
  return { effort: 'High', estCostUsd };
}

/** The category's core farming action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it and repay it once, so the wallet shows both sides of the market.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Add $${capital} of liquidity to ${name}'s largest pool on ${chain} in a balanced pair, and leave the position in range.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('vault') || c.includes('allocator') || c.includes('curator')) {
    return `Deposit $${capital} of USDC into the highest-TVL ${name} vault on ${chain} and keep the vault shares in the wallet.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds in one app on the destination chain instead of bridging straight back.`;
  }
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restak') || c.includes('staking')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the liquid receipt token for the full period.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, open one small long position, and close it after a day so the account shows real trading volume.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} on ${chain} and take one position in a market that settles in the next two weeks.`;
  }
  if (c.includes('rwa') || c.includes('stablecoin') || c.includes('basis')) {
    return `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  }
  if (c.includes('payment') || c.includes('privacy')) {
    return `Send two payments of about $${Math.round(capital / 2)} each through ${name} on ${chain} to two different addresses you control.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} for a position you already hold, and keep the policy active.`;
  }
  if (c.includes('launchpad') || c.includes('governance')) {
    return `Join ${name}'s next sale or vote on ${chain} with $${capital}, following the steps on its own announcement page.`;
  }
  if (c.includes('nft')) {
    return `Buy one listed item or mint from ${name} on ${chain} for about $${capital}, and hold it in the farming wallet.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of USDC onto ${name}'s chain and use it in two different apps built on it.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, category-specific recurring action for the weekly step. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a supply top-up, a small borrow and repay, or a vote in its governance forum';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'a swap through its router, a range adjustment, or a fee claim';
  if (c.includes('bridge')) return 'a bridge of a small amount to a different chain it supports';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'one small trade, or a deposit and withdrawal of margin';
  if (c.includes('prediction')) return 'one new market position, or a claim on a settled market';
  if (c.includes('rwa') || c.includes('stablecoin')) return 'a mint, a redeem, or a transfer of the asset to a second wallet';
  return 'a deposit, a swap, a vote, or a claim on its rewards page';
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The
 * plan is derived from the protocol's own record (category, chains, TVL, age), never
 * from a hand-written list of names. Multi-chain protocols get a second-chain step;
 * single-chain ones get a risk-check step instead. The new seventh step tracks
 * eligibility: points pages and snapshots decide most airdrops, so the plan says
 * how to watch them, and the eighth step keeps the log that proves the work.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm with, write its seed phrase on paper, and never paste the phrase into any site.`,
      cost: 'nothing but the wallet itself',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus ${gas}`,
      time: '20 minutes to set up',
    },
  ];
  if (secondChain !== null) {
    steps.push({
      text: `Repeat the core action on ${secondChain} with about $${Math.round(capital / 2)}, so the wallet is active on two of ${p.name}'s ${p.chains.length} chains instead of one.`,
      cost: `$${Math.round(capital / 2)} of capital plus ${gasFor(secondChain)}`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Before adding more, check ${p.name}'s own docs for an audit and watch its TVL for a week: if the 7-day change turns sharply negative, wait before topping up.`,
      cost: 'free to check',
      time: '10 minutes, then a week of watching',
    });
  }
  steps.push(
    {
      text: `Once a week, do one more qualifying action on ${p.name}: ${weeklyFor(p)}. Vary the day and the amount slightly so the activity reads as real use.`,
      cost: `${gas} each week`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days, so the activity spans more than one snapshot and looks like a real user rather than a one-day visitor.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Every two weeks, open ${p.name}'s own points or rewards page from its official site or docs, check the wallet is listed and screenshot the points balance, so a missing snapshot is caught early.`,
      cost: 'free to check',
      time: '10 minutes every two weeks',
    },
    {
      text: `Before any claim, check the claim page's address against ${p.name}'s official docs or announcement channel; never connect to a link from a direct message, and never pay a fee to claim.`,
      cost: 'free to check, and never pay a fee to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm log, so you can repeat the position on a second wallet or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.tvl_usd > 0 && p.mcap_usd !== null ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  const { effort, estCostUsd } = effortFor({
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    gecko_id: row.gecko_id,
    symbol: row.symbol,
  });
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: watchlist.has(row.slug),
    deployment: row.is_deployment,
    effort,
    est_cost_usd: estCostUsd,
    multiple: row.model.category_multiple,
    momentum: row.model.momentum,
    relative: row.model.relative_momentum,
    sector: row.model.sector_heat,
    stability: row.model.stability,
    age_mult: row.model.age_multiplier,
    velocity_mult: row.model.velocity_multiplier,
    scale_mult: row.model.scale_multiplier,
    breadth_mult: row.model.breadth_multiplier,
    chain_mult: row.model.chain_quality,
    concentration_mult: row.model.concentration_multiplier,
    share: row.model.category_share,
    breakdown: row.value_breakdown,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const wl = new Set(snapshot.watchlist);
  const early = board.filter((r) => !wl.has(r.slug) && !r.is_deployment).length;
  const deployments = board.filter((r) => r.is_deployment).length;
  const multiples = categoryMultiples(snapshot, model);
  const medians = categoryMedians(snapshot);
  const allChanges = snapshot.protocols.map((p) => p.change_7d).filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  const categoryMultiplesTable: CategoryMultiple[] = [...multiples.byCategory.entries()]
    .map(([category, multiple]) => ({
      category,
      multiple: round4(multiple),
      live_count: multiples.counts.get(category) ?? 0,
      live_median_7d: medians.live.get(category) === undefined ? null : round4(medians.live.get(category)!),
    }))
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    deployment_size: deployments,
    live_size: live.length,
    global_multiple: multiples.global,
    median_change_7d: median(allChanges),
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    category_multiples: categoryMultiplesTable,
    rows: board.map((r) => radarRow(r, wl)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
