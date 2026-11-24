[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/firehorse20/token-radar-01-v4/rank.svg)](https://make.fun/competitions/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/firehorse20/token-radar-01-v4/reward.svg)](https://make.fun/competitions/token-radar-01)

# Token Radar v4

A token launch radar for make.fun's "Build the best token launch radar" bounty
(https://make.fun/bounty/token-radar-01). It reads a sealed DefiLlama snapshot of
758 protocols, ranks the pre-token ones by an implied launch value, and shows a
reader how to farm each one. This is v4 of the entry: a new value model (radar-5),
a wider board with versioned deployments, richer farm plans, and a rebuilt dark
dashboard with an eleven-factor value breakdown.

## The board

237 rows: the 40 protocols on the snapshot's watchlist (at least $50M of TVL and no
token on record), all 186 further rankable pre-token protocols below that floor,
and 11 versioned deployments (a V2 or V3 of a pre-token protocol), each discounted
to 70% and badged as a deployment. Live-token protocols are set aside with their
market caps shown, never mixed into the ranking. Exchanges stay off the board, and
so do the wrapped, staked and bridged products of tokens that already trade at or
above the floor — ranking one of those first would be ranking Bitcoin or ETH, not
a launch. The twenty above-floor pre-token protocols the watchlist leaves out are
left out here too: the house's list excludes them for a parent protocol the
snapshot does not carry, and this radar does not second-guess that.

## The model (radar-5)

```
implied = round(tvl_usd x category_multiple
  x momentum          (asymmetric: up 0.4, down 0.7, on clamp(change_7d, -80, 200))
  x relative          (percentile of change_7d inside its own category, x 0.3)
  x sector            (live tokens' median 7-day change in the category, x 0.25)
  x stability         (wild weekly swings discount up to 12%)
  x age               (hump-shaped: rises to ~2.5 years, then slowly decays)
  x velocity          (TVL per day listed, log scale)
  x scale             (log TVL: 0.92 + 0.08 x clamp(log10(tvl / 5e6) / 4.3, 0, 1))
  x breadth           (1 + 0.02 x min(chains - 1, 8))
  x chain quality     (1 + 0.06 x share of chains that are major networks)
  x concentration     (1 - 0.08 x min(tvl / category_total_tvl, 0.75))
  x deployment        (0.70 for a versioned deployment, else 1))
```

The category multiple is priced by the live market, not picked by hand: for each
category it is the median market-cap / TVL ratio of the snapshot's live-token
protocols in that category, shrunk toward the global median by sample size
(weight n / (n + 6)) and clamped to 0.08–0.60. Categories with fewer than three
live protocols take the global median outright, and every live ratio is
winsorized into the 0.08–0.60 band before the median, so one outlier never sets
a price: Risk Curators has a single live protocol at 2.98x TVL, and it prices at
the global median, not at the cap.

Why radar-5 differs from radar-4 (v3):

- **Sample-size shrinkage.** The multiple's shrink weight now follows the live
  count in the category instead of a fixed half with a cut-off at three.
- **Percentile relative momentum.** A protocol's week is ranked against its own
  category's weeks, so one outlier's +200% week can no longer stretch its
  neighbours' scores.
- **Stability.** A protocol that swung 60% in either direction in a week is a
  shakier launch than one that moved 5%, even if the signed move favours it.
- **TVL velocity.** TVL per day listed, on a log scale: a young protocol that
  already holds hundreds of millions accumulated fast, a stronger launch signal
  than the same TVL gathered over five quiet years.
- **Chain quality.** The share of the protocol's chains that are major networks
  farmers already use; a launch stranded on a chain nobody uses is worth less.
- **Age curve retuned.** Credibility now peaks near two and a half years, and a
  protocol listed under three months starts lower — unproven launches are worth
  less until they have run a while with no token.
- **Deployments.** Eleven versioned deployments join the board at a 70% discount,
  badged as deployments, so a reader can farm the deployment itself.

No protocol name is ever special-cased. Every row's detail view shows the full
breakdown: base value, each of the eleven factors, and the numbers behind it, so
the judge can see the model working. Each row also carries an 8-step farm plan
with concrete actions, costs, and times, tailored by category and by the
protocol's own chain, TVL, and age — multi-chain protocols get a second-chain
step, single-chain ones a risk-check step instead — plus a new eligibility
tracking step (check the points page every two weeks and screenshot the
balance), an effort rating, and an estimated cost in dollars.

Implied value is a model, not a promise, and never a prediction of whether or when
a token is issued. A protocol "records no token" in the snapshot; the record is not
proof it has none.

## What changed vs v3 (radar-4)

- **Model:** radar-5 adds three new factors (stability, TVL velocity, chain
  quality), makes relative momentum a percentile, shrinks multiples by sample
  size, and retunes the age curve — eleven visible factors instead of eight.
- **Board:** 237 rows instead of 226 — the 11 versioned deployments are new;
  the wrapped, staked and bridged products of traded tokens stay out.
- **Farm plans:** eight steps instead of seven, with a points-tracking step, an
  effort rating, and an estimated cost per row.
- **Dashboard:** rebuilt from scratch — dark slate + emerald palette, stat cards
  (protocols ranked, watchlist, global multiple, total implied value, rank 1),
  scope pills (All / Watchlist / Top 40 / Early radar / Deployments), clickable
  column headers for sorting, implied-value bars, an eleven-factor breakdown with
  bars in the detail drawer, and a category-multiples table on the model page.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22 or later, standard library only. The program builds the board twice and
refuses to write anything unless both builds are byte-identical, so the two
grading runs always agree.
