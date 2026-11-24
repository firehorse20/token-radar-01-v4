/* Token Radar v4 — dashboard logic. Reads window.RADAR (written by main.ts as
   data.js beside this page). No fetch, no network: everything renders locally. */
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.textContent = 'Radar data failed to load.'; return; }

  var rows = R.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });
  var maxImplied = rows.length ? rows[0].implied_value_usd : 1;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(v) {
    if (v == null) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '') + '">' + s + '</span>';
  }
  function ageText(days) {
    if (days == null) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }

  /* ---- header stats ---- */
  var top = rows[0];
  document.getElementById('stats').innerHTML =
    stat(R.board_size, 'protocols ranked') +
    stat(R.watchlist_size, 'on the watchlist') +
    stat(R.global_multiple.toFixed(3), 'global multiple') +
    stat(money(R.total_implied_usd), 'total implied value') +
    stat(top ? esc(top.name) : '—', 'rank 1');
  function stat(v, label) {
    return '<div class="stat"><b>' + v + '</b><span>' + label + '</span></div>';
  }

  /* ---- filter controls ---- */
  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort();
  chains.sort();
  var catSel = document.getElementById('cat');
  cats.forEach(function (c) { catSel.add(new Option(c, c)); });
  var chainSel = document.getElementById('chain');
  chains.forEach(function (c) { chainSel.add(new Option(c, c)); });

  var state = { scope: 'all', q: '', cat: '', chain: '', wl: false, sort: 'rank', dir: 1 };
  var tbody = document.getElementById('rows');
  var countEl = document.getElementById('count');

  function visible() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'top40' && r.rank > 40) return false;
      if (state.scope === 'early' && (r.watchlist || r.deployment)) return false;
      if (state.scope === 'deployments' && !r.deployment) return false;
      if (state.wl && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    chg: function (a, b) { return (b.change_7d == null ? -999 : b.change_7d) - (a.change_7d == null ? -999 : a.change_7d); },
    age: function (a, b) { return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days); },
    name: function (a, b) { return a.name < b.name ? -1 : 1; },
    cat: function (a, b) { return (a.category || '') < (b.category || '') ? -1 : 1; },
  };

  function renderBoard() {
    var list = visible();
    var fn = SORTS[state.sort] || SORTS.rank;
    list.sort(function (a, b) { return fn(a, b) * state.dir; });
    var html = list.map(function (r) {
      var w = Math.max(2, Math.round(90 * Math.sqrt(r.implied_value_usd / maxImplied)));
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (r.rank <= 3 ? 'top3' : '') + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' +
          (r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '') +
          (r.deployment ? '<span class="badge dep">DEPLOYMENT</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><span class="bar" style="width:' + w + 'px"><i style="width:100%"></i></span>' + money(r.implied_value_usd) + '</td>' +
        '</tr>';
    }).join('');
    tbody.innerHTML = html || '<tr><td colspan="8">No protocols match this filter.</td></tr>';
    countEl.textContent = list.length + ' of ' + rows.length + ' shown';
  }

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });

  document.querySelectorAll('#board th.sortable').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = 1; }
      document.getElementById('sort').value = k;
      renderBoard();
    });
  });

  document.querySelectorAll('.pill[data-scope]').forEach(function (p) {
    p.addEventListener('click', function () {
      document.querySelectorAll('.pill[data-scope]').forEach(function (x) { x.classList.remove('active'); });
      p.classList.add('active');
      state.scope = p.getAttribute('data-scope');
      renderBoard();
    });
  });
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  document.getElementById('wl').addEventListener('change', function (e) { state.wl = e.target.checked; renderBoard(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; state.dir = 1; renderBoard(); });

  /* ---- tabs ---- */
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      var view = t.getAttribute('data-view');
      document.getElementById('view-board').hidden = view !== 'board';
      document.getElementById('view-live').hidden = view !== 'live';
      document.getElementById('view-model').hidden = view !== 'model';
    });
  });

  /* ---- live tokens ---- */
  document.getElementById('liverows').innerHTML = R.live.map(function (p) {
    return '<tr><td><strong>' + esc(p.name) + '</strong></td><td>' + esc(p.category || '—') + '</td>' +
      '<td>' + esc(p.chains.slice(0, 3).join(', ')) + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + (p.mcap_tvl == null ? '—' : p.mcap_tvl.toFixed(3)) + '</td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  /* ---- model tab ---- */
  var FACTORS = [
    ['Base value', 'TVL × the category multiple, priced by live tokens', 'varies'],
    ['7-day momentum', 'Asymmetric: rises count 0.4, falls count 0.7', '0.44 – 1.80'],
    ['Relative momentum', 'The protocol’s week as a percentile of its category', '0.70 – 1.30'],
    ['Sector heat', 'Live tokens in the category, 7-day median', '0.93 – 1.08'],
    ['Weekly stability', 'Wild weekly swings in either direction discount value', '0.88 – 1.00'],
    ['Time without a token', 'Credibility to ~2.5 years, then a slow decay', '0.45 – 1.00'],
    ['TVL velocity', 'TVL per day listed, log scale: fast accumulators score more', '0.95 – 1.05'],
    ['Liquidity depth', 'Log TVL: deeper liquidity holds a launch price better', '0.92 – 1.00'],
    ['Chain breadth', 'More chains, more places to farm', '1.00 – 1.16'],
    ['Chain quality', 'Share of chains that are major networks', '1.00 – 1.06'],
    ['Category concentration', 'Owning most of a category leaves less headroom', '0.94 – 1.00'],
    ['Deployment discount', 'A versioned deployment is a slice, not the whole protocol', '0.70 or 1.00'],
  ];
  document.getElementById('factrows').innerHTML = FACTORS.map(function (f) {
    return '<tr><td><strong>' + f[0] + '</strong></td><td>' + f[1] + '</td><td class="num">' + f[2] + '</td></tr>';
  }).join('');
  document.getElementById('medchg').textContent = (R.median_change_7d == null ? 'n/a' : R.median_change_7d.toFixed(1) + '%');
  document.getElementById('gmult').textContent = R.global_multiple.toFixed(3);
  document.getElementById('catrows').innerHTML = R.category_multiples.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(3) + '</td>' +
      '<td class="num">' + c.live_count + '</td><td class="num">' + (c.live_median_7d == null ? '—' : c.live_median_7d.toFixed(1) + '%') + '</td></tr>';
  }).join('');
  document.getElementById('coverage').textContent =
    'The board holds ' + R.board_size + ' rows: the snapshot’s ' + R.watchlist_size +
    ' watchlist protocols, ' + R.early_size + ' further pre-token protocols below the $50M floor, and ' +
    R.deployment_size + ' versioned deployments at a 70% discount. ' + R.live_size +
    ' live-token protocols are set aside with their market caps shown, never mixed into the ranking.';

  /* ---- detail drawer ---- */
  var drawer = document.getElementById('drawer');
  var scrim = document.getElementById('scrim');
  var detail = document.getElementById('detail');
  function closeDetail() { drawer.hidden = true; scrim.hidden = true; }
  document.getElementById('close').addEventListener('click', closeDetail);
  scrim.addEventListener('click', closeDetail);

  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    var maxF = 0;
    r.breakdown.forEach(function (f) { if (f.key !== 'base' && f.value > maxF) maxF = f.value; });
    var factors = r.breakdown.map(function (f) {
      var w = f.key === 'base' ? 100 : Math.round(100 * (f.value / (maxF || 1)));
      var shown = f.key === 'base' ? moneyFull(f.value) : '×' + f.value.toFixed(3);
      return '<div class="frow"><div class="fl"><span>' + esc(f.label) + '</span><b>' + shown + '</b></div>' +
        '<div class="fbar"><i style="width:' + Math.max(2, Math.min(100, w)) + '%"></i></div>' +
        '<div class="fn">' + esc(f.note) + '</div></div>';
    }).join('');
    var steps = r.farm_steps.map(function (s, i) { return '<li>' + esc(s) + '</li>'; }).join('');
    detail.innerHTML =
      '<div class="detail"><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) +
      (r.watchlist ? ' · <span class="badge wl">WATCHLIST</span>' : '') +
      (r.deployment ? ' · <span class="badge dep">DEPLOYMENT</span>' : '') + '</p>' +
      '<div class="chips">' +
      '<span class="chip">Effort <b>' + r.effort + '</b></span>' +
      '<span class="chip">Est. cost <b>~$' + r.est_cost_usd + '</b></span>' +
      '<span class="chip">Multiple <b>' + r.multiple.toFixed(3) + '</b></span>' +
      '<span class="chip">Age <b>' + ageText(r.age_days) + '</b></span>' +
      '</div>' +
      '<div class="kv">' +
      '<div><span>Implied value</span><b>' + moneyFull(r.implied_value_usd) + '</b></div>' +
      '<div><span>TVL</span><b>' + moneyFull(r.tvl_usd) + '</b></div>' +
      '<div><span>7-day change</span><b>' + (r.change_7d == null ? 'not reported' : (r.change_7d > 0 ? '+' : '') + r.change_7d + '%') + '</b></div>' +
      '<div><span>Listed</span><b>' + (r.age_days == null ? 'not reported' : r.age_days + ' days ago') + '</b></div>' +
      '</div>' +
      '<h3>Value breakdown — radar-5</h3>' + factors +
      '<h3>How to farm it — 8 steps</h3><ol class="steps">' + steps + '</ol>' +
      '<p class="hint">Implied value is this radar’s own model, not a promise. This protocol records no token in the snapshot; the record is not proof it has none.</p></div>';
    drawer.hidden = false;
    scrim.hidden = false;
  }

  /* ---- deep links: #p=<slug> opens a detail, #category=<name> filters ---- */
  function applyHash() {
    var h = window.location.hash.slice(1);
    if (!h) return;
    var parts = h.split('&');
    parts.forEach(function (part) {
      var kv = part.split('=');
      if (kv[0] === 'p' && kv[1]) openDetail(decodeURIComponent(kv[1]));
      if (kv[0] === 'category' && kv[1]) {
        var c = decodeURIComponent(kv[1]);
        state.cat = c;
        catSel.value = c;
        renderBoard();
      }
    });
  }

  document.getElementById('src').textContent = R.source;
  document.getElementById('asof').textContent = R.as_of;
  renderBoard();
  applyHash();
})();
