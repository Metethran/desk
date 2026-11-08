/* Plan B desk UI. Polls d/{path}/*.json. Never logs or paints the data path. Never builds FOMO URLs. */
(function () {
  const POLL_MS = 15000;
  const RANGES = ["LIVE", "1H", "4H", "1D", "1W", "ALL"];
  const AGENT_ORDER = ["scanner", "auditor", "analyst", "executor", "risk"];
  const MIN_SCORE = 70;
  const KEY = "desk_data_path";

  const store = {
    path: null,
    tab: "home",
    overlay: null,
    range: "LIVE",
    searchOpen: false,
    error: null,
    ready: false,
    state: null,
    chart: null,
    activity: null,
    account: null,
    settings: null,
    coin: null,
    audit: null,
    decisions: null,
    beam: { mint: null, step: 0, done: false, timer: null },
  };

  function readPath() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const fromHash = hash.get("d");
    if (fromHash) {
      try { localStorage.setItem(KEY, fromHash); } catch (_) {}
      history.replaceState(null, "", location.pathname + location.search);
      return fromHash;
    }
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }

  function dataUrl(rel) {
    return "d/" + store.path + "/" + rel;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function money(n, digits) {
    if (n == null || n === "" || Number.isNaN(Number(n))) return "n/a";
    const d = digits == null ? 2 : digits;
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function compact(n) {
    if (n == null || n === "" || Number.isNaN(Number(n))) return "n/a";
    const v = Number(n);
    const sign = v < 0 ? "-" : "";
    const a = Math.abs(v);
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(1) + "K";
    return money(v);
  }

  function pct(n) {
    if (n == null || Number.isNaN(Number(n))) return "n/a";
    const v = Number(n);
    const arrow = v > 0 ? "▲ " : v < 0 ? "▼ " : "";
    return arrow + Math.abs(v).toFixed(2) + "%";
  }

  function clsPct(n) {
    if (n == null || Number.isNaN(Number(n))) return "";
    return Number(n) >= 0 ? "up" : "down";
  }

  function relTime(ts) {
    if (!ts) return "";
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 10) return "just now";
    if (s < 60) return Math.floor(s) + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function ageLabel(min) {
    if (min == null || Number.isNaN(Number(min))) return "";
    const n = Number(min);
    if (n < 60) return n + "m old";
    const h = Math.floor(n / 60);
    const m = n % 60;
    return m ? h + "h " + m + "m old" : h + "h old";
  }

  function titleCase(name) {
    return String(name || "").replace(/^\w/, (c) => c.toUpperCase());
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 1800);
  }

  async function loadJson(rel) {
    const res = await fetch(dataUrl(rel), { cache: "no-store" });
    if (!res.ok) throw new Error("fetch " + res.status);
    return res.json();
  }

  function paintOdometer(el, value) {
    const text = money(value == null ? 0 : value);
    const prev = el.getAttribute("data-text") || text;
    el.setAttribute("data-text", text);
    const max = Math.max(prev.length, text.length);
    const a = prev.padStart(max, " ");
    const b = text.padStart(max, " ");
    el.innerHTML = "";
    for (let i = 0; i < max; i += 1) {
      const ch = b[i];
      if (ch >= "0" && ch <= "9") {
        const wrap = document.createElement("span");
        wrap.className = "odo-digit";
        const reel = document.createElement("span");
        reel.className = "odo-reel";
        for (let d = 0; d <= 9; d += 1) {
          const s = document.createElement("span");
          s.textContent = String(d);
          reel.appendChild(s);
        }
        const from = a[i] >= "0" && a[i] <= "9" ? Number(a[i]) : 0;
        const to = Number(ch);
        wrap.appendChild(reel);
        el.appendChild(wrap);
        const step = wrap.getBoundingClientRect().height || 66;
        reel.style.transition = "none";
        reel.style.transform = "translateY(" + (-from * step) + "px)";
        const delay = (max - 1 - i) * 30;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            reel.style.transition = "transform 600ms ease-out";
            reel.style.transitionDelay = delay + "ms";
            reel.style.transform = "translateY(" + (-to * step) + "px)";
          });
        });
      } else {
        const span = document.createElement("span");
        span.className = "odo-ch";
        span.textContent = ch === " " ? "" : ch;
        el.appendChild(span);
      }
    }
  }

  function banner() {
    if (!store.path) {
      return '<div class="banner empty">Open the desk from the private link I sent you. After that, it remembers this device.</div>';
    }
    if (store.error) {
      return '<div class="banner error">Can\'t reach the desk right now. Pull to refresh, or open it again from the private link.</div>';
    }
    return "";
  }

  function renderHome() {
    const st = store.state || { balance: 0, today_pct: 0, multiplier: 1, mode: "PAPER", positions: [], agents: [] };
    const empty = !store.error && store.ready && !(st.positions && st.positions.length) && !(store.activity && store.activity.rows && store.activity.rows.length);
    const positions = (st.positions || []).map((p) => `
      <button type="button" class="pos" data-open="coin" data-mint="${esc(p.mint)}">
        <div>
          <div class="pos-name">${esc(p.name || p.symbol || "Coin")}</div>
          <div class="pos-sub">${esc(money(p.size_usd))} in</div>
        </div>
        <div class="pos-right">
          <div class="pos-pnl ${clsPct(p.pnl_pct)}">${esc(pct(p.pnl_pct))}</div>
          <div class="pos-sub">${esc(money(p.price, 6))}</div>
        </div>
      </button>`).join("");
    return `
      <section class="page home">
        ${banner()}
        <div class="home-head">
          <div class="odometer" id="odo"></div>
          <div class="meta-row">
            <span class="pill ${String(st.mode).toUpperCase() === "LIVE" ? "live" : ""}">${esc(st.mode || "PAPER")}</span>
            <span class="today ${clsPct(st.today_pct)}">${esc(pct(st.today_pct))} today</span>
            <span class="mult">×${esc(Number(st.multiplier || 1).toFixed(2))}</span>
          </div>
        </div>
        <div class="chart-wrap"><canvas id="home-chart"></canvas></div>
        <div class="ranges">
          ${RANGES.map((r) => `<button type="button" class="range ${store.range === r ? "on" : ""}" data-range="${r}">${r}</button>`).join("")}
        </div>
        ${empty ? '<div class="banner empty">Waiting for the first trade</div>' : ""}
        <h2 class="section">Positions</h2>
        <div class="pos-list">${positions || '<div class="banner empty">No open positions</div>'}</div>
      </section>`;
  }

  function agentBlurb(name, rec) {
    const status = rec && rec.status ? rec.status : "idle";
    if (status === "paused") return "Paused";
    if (status === "stale") return "Heartbeat is stale";
    if (name === "scanner") return "Watching new pools";
    if (name === "auditor") return "Taking coins apart";
    if (name === "analyst") return "Scoring cleared coins";
    if (name === "executor") return "Sizing tickets";
    if (name === "risk") return "Watching exits";
    return "Idle";
  }

  function renderAgents() {
    const cards = ((store.state && store.state.agents) || AGENT_ORDER.map((name) => ({ name, status: "idle" })));
    const byName = {};
    cards.forEach((a) => { byName[a.name] = a; });
    const html = AGENT_ORDER.map((name) => {
      const rec = byName[name] || { name, status: "idle" };
      const ring = name === "analyst" ? '<div class="ring"><canvas id="score-ring"></canvas></div>' : "";
      return `
        <button type="button" class="agent-card" data-open="agent" data-name="${esc(name)}">
          <div class="agent-top">
            <div class="agent-name ${esc(name)}">${esc(titleCase(name))}</div>
            <div class="status ${esc(rec.status || "idle")}">${esc(rec.status || "idle")}</div>
          </div>
          <div class="agent-body">${esc(agentBlurb(name, rec))}${ring}</div>
          <div class="agent-foot">${rec.heartbeat ? "Last beat " + esc(relTime(rec.heartbeat)) : "No heartbeat yet"}</div>
        </button>`;
    }).join("");
    return `<section class="page agents">${banner()}<div class="agent-stack">${html}</div></section>`;
  }

  function renderActivity() {
    const rows = (store.activity && store.activity.rows) || [];
    const list = rows.map((row) => `
      <button type="button" class="row" data-open="${row.kind && String(row.kind).toLowerCase().includes("reject") ? "auditor" : "coin"}" data-mint="${esc(row.mint || "")}">
        <div>
          <div class="kind ${esc(row.kind || "")}">${esc(row.kind || row.agent || "")}</div>
          <div class="row-title">${esc(row.title || "")}</div>
          <div class="row-sub">${esc(row.subtitle || "")}</div>
        </div>
        <div class="row-right">
          <div class="pos-pnl">${esc(row.value || "")}</div>
          <div class="row-sub">${esc(relTime(row.ts))}</div>
        </div>
      </button>`).join("");
    return `
      <section class="page activity">
        ${banner()}
        <h2 class="section">Activity</h2>
        <div class="rows">${list || '<div class="banner empty">No activity yet</div>'}</div>
      </section>`;
  }

  function renderAccount() {
    const ac = store.account || {};
    const grouped = (store.settings && store.settings.grouped) || {};
    const mode = String(ac.mode || "PAPER").toUpperCase();
    const groups = Object.keys(grouped).map((group) => {
      const rows = Object.keys(grouped[group]).map((key) => `
        <div class="setting ro">
          <div class="setting-k">${esc(key.replace(/_/g, " "))}</div>
          <div class="setting-v">${esc(grouped[group][key])}</div>
        </div>`).join("");
      return `<div class="group">${esc(group)}</div>${rows}`;
    }).join("");
    const profile = ac.profile_url
      ? `<a class="btn secondary" href="${esc(ac.profile_url)}" target="_blank" rel="noopener">Your FOMO profile</a>`
      : "";
    const invite = ac.signup_url
      ? `<button type="button" class="btn share" data-invite="1">Invite a friend</button>`
      : "";
    const enabled = store.settings && store.settings.settings && store.settings.settings["auditor.enabled"];
    const auditorOn = enabled === true || enabled === "true" || enabled === 1 || enabled === "1";
    return `
      <section class="page account">
        ${banner()}
        <h2 class="section">Account</h2>
        <div class="mode-row">
          <button type="button" class="mode-btn ${mode === "PAPER" ? "on" : ""}" disabled>PAPER</button>
          <button type="button" class="mode-btn ${mode === "LIVE" ? "on" : ""}" disabled>LIVE</button>
        </div>
        <div class="setting ro">
          <div class="setting-k">Stack</div>
          <div class="setting-v">${esc(money(ac.stack))}</div>
        </div>
        <p class="muted">Mode and settings are read-only here. Change them in this Grok Bot chat.</p>
        ${profile}${invite}
        <div class="group">Auditor</div>
        <div class="toggle-row" disabled>
          <div>
            <div class="setting-k">Take apart before buying</div>
            <div class="muted">On by default</div>
          </div>
          <div class="switch ${auditorOn ? "on" : ""}" aria-hidden="true"></div>
        </div>
        <div class="group">Notifications</div>
        <div class="setting ro">
          <div class="setting-k">Alerts</div>
          <div class="setting-v">${esc(ac.notifier || "grokbot")}</div>
        </div>
        <div class="setting ro">
          <div class="setting-k">Web push</div>
          <div class="setting-v">${ac.web_push ? "On" : "Unavailable on this setup"}</div>
        </div>
        ${groups}
      </section>`;
  }

  function renderCoin() {
    const c = store.coin;
    if (!c) {
      return `<section class="page overlay">${banner() || '<div class="banner empty">No coin selected</div>'}</section>`;
    }
    const pos = c.position;
    const exit = c.exit_lines || {};
    const name = c.name || c.symbol || "Coin";
    const bits = [c.symbol || "", "Solana", ageLabel(c.age_min)].filter(Boolean).join(" · ");
    const btnLabel = pos ? "Sell on FOMO" : "Buy on FOMO";
    const fomo = c.coin_url
      ? `<a class="btn-fomo" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${esc(btnLabel)}</a>`
      : "";
    const timeoutLeft = remaining(exit.timeout_at);
    return `
      <section class="page overlay coin">
        ${banner()}
        <h2 class="section">${esc(name)}${c.shield ? `<span class="shield">${esc(c.shield)}</span>` : ""}</h2>
        <div class="coin-kicker">${esc(bits)}</div>
        <div class="price">${esc(c.price == null ? "n/a" : money(c.price, 6))}</div>
        <div class="since ${clsPct(c.since_entry_pct)}">${c.since_entry_pct == null ? "" : esc(pct(c.since_entry_pct)) + " since entry"}</div>
        <div class="candle-wrap"><canvas id="coin-chart"></canvas></div>
        ${exit.exit_line != null ? '<div class="exit-note">Risk trailing stop</div>' : ""}
        <div class="stats">
          <div class="stat"><div class="k">Market cap</div><div class="v">${esc(compact(c.stats && c.stats.market_cap))}</div></div>
          <div class="stat"><div class="k">Liquidity</div><div class="v">${esc(compact(c.stats && c.stats.liquidity))}</div></div>
          <div class="stat"><div class="k">24h volume</div><div class="v">${esc(compact(c.stats && c.stats.volume_h24))}</div></div>
          <div class="stat"><div class="k">Holders</div><div class="v">${esc(c.stats && c.stats.holders != null ? c.stats.holders : "n/a")}</div></div>
        </div>
        ${pos ? `<button type="button" class="pos" data-open="auditor" data-mint="${esc(c.mint)}">
          <div>
            <div class="pos-name">Your position · ${esc(money(pos.size_usd))} in</div>
            <div class="pos-sub">Executor</div>
          </div>
          <div class="pos-pnl ${clsPct(c.since_entry_pct)}">${esc(pct(c.since_entry_pct))}</div>
        </button>` : ""}
        ${pos ? `<div class="exit">
          <h3>Exit</h3>
          <div class="exit-row">Stop <b>${esc(money(exit.stop_line, 6))}</b></div>
          <div class="exit-row">Trail <b>${esc(exit.trail_line == null ? "not armed" : money(exit.trail_line, 6))}</b></div>
          <div class="exit-row">Time left <b>${esc(timeoutLeft)}</b></div>
        </div>` : ""}
        ${fomo}
      </section>`;
  }

  function remaining(iso) {
    if (!iso) return "n/a";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "n/a";
    const ms = t - Date.now();
    if (ms <= 0) return "due";
    const m = Math.round(ms / 60000);
    if (m < 60) return m + "m";
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }

  function renderAuditor() {
    const a = store.audit;
    if (!a) {
      return `<section class="page overlay">${banner() || '<div class="banner empty">No audit yet</div>'}</section>`;
    }
    const layers = a.layers || [];
    const failed = layers.find((layer) => !layer.pass);
    const complete = layers.length === 8;
    let headline = "Taking this coin apart";
    let sub = "";
    if (store.beam.done || !layers.length) {
      if (!layers.length) {
        headline = "No audit yet";
      } else if (a.passed) {
        headline = "Cleared · 8/8 parts";
        sub = "Sent to Executor";
      } else if (failed) {
        headline = "Rejected · " + (failed.value || failed.name);
        sub = "Grok Bot won't buy " + (a.name || "this coin");
      }
    }
    const items = layers.map((layer, i) => {
      let klass = "pending";
      if (store.beam.done) klass = layer.pass ? "pass" : "fail";
      else if (i < store.beam.step) klass = layer.pass ? "pass" : "fail";
      else if (i === store.beam.step) klass = "beam";
      return `<div class="layer ${klass}">
        <div><div class="ln">${esc(layer.name)}</div><div class="lv">${esc(layer.value)}</div></div>
        <div class="dot"></div>
      </div>`;
    }).join("");
    const enabled = store.settings && store.settings.settings && store.settings.settings["auditor.enabled"];
    const auditorOn = enabled === false || enabled === "false" || enabled === 0 || enabled === "0" ? false : true;
    const fomo = a.coin_url
      ? `<a class="btn-fomo" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`
      : "";
    return `
      <section class="page overlay auditor">
        ${banner()}
        <div class="verdict">${esc(headline)}</div>
        <div class="verdict-sub">${esc(sub)}</div>
        <div class="layers">${items || '<div class="banner empty">No audit yet</div>'}</div>
        <div class="toggle-row" disabled>
          <div>
            <div class="setting-k">Take apart before buying</div>
            <div class="muted">${complete ? esc(a.shield || "") : "On by default"}</div>
          </div>
          <div class="switch ${auditorOn ? "on" : ""}"></div>
        </div>
        ${fomo}
      </section>`;
  }

  function decisionLine(name, row) {
    if (name === "scanner") return (row.verdict || "") + (row.reason ? " · " + row.reason : "");
    if (name === "auditor") return (row.name || "Layer") + " · " + (row.value_text || row.value || "");
    if (name === "analyst") return (row.pass ? "Buy" : "Skip") + (row.score != null ? " · " + row.score : "") + (row.reason ? " · " + row.reason : "");
    if (name === "executor") return (row.status || "ticket") + (row.size_usd != null ? " · " + money(row.size_usd) : "");
    if (name === "risk") return (row.exit_reason || "closed") + (row.pnl_usd != null ? " · " + money(row.pnl_usd) : "");
    return JSON.stringify(row).slice(0, 120);
  }

  function renderAgentDetail() {
    const pack = store.decisions || { name: store.overlay && store.overlay.name, decisions: [] };
    const rows = (pack.decisions || []).map((row) => `
      <button type="button" class="row" data-open="${pack.name === "auditor" ? "auditor" : "coin"}" data-mint="${esc(row.mint || "")}">
        <div>
          <div class="row-title">${esc(decisionLine(pack.name, row))}</div>
          <div class="row-sub">${esc(row.mint || "")}</div>
        </div>
        <div class="row-sub">${esc(relTime(row.ts || row.opened_at || row.closed_at))}</div>
      </button>`).join("");
    return `
      <section class="page overlay">
        ${banner()}
        <h2 class="section">${esc(titleCase(pack.name))} · last 20</h2>
        <div class="rows">${rows || '<div class="banner empty">No decisions yet</div>'}</div>
      </section>`;
  }

  function renderSearch() {
    return `
      <section class="page overlay">
        <div class="search-box">
          <input id="mint-search" placeholder="Mint address" autocomplete="off" spellcheck="false">
          <button type="button" id="mint-go">Open</button>
        </div>
        <p class="muted">Opens a coin the desk already knows. It never builds a FOMO link itself.</p>
      </section>`;
  }

  function paintCharts() {
    const odo = document.getElementById("odo");
    if (odo && odo.getAttribute("data-text") == null) {
      paintOdometer(odo, store.state ? store.state.balance : 0);
    } else if (odo && store.state) {
      const next = money(store.state.balance);
      if (odo.getAttribute("data-text") !== next) paintOdometer(odo, store.state.balance);
    }
    const line = document.getElementById("home-chart");
    if (line && window.DeskChart) {
      DeskChart.drawLine(line, (store.chart && store.chart.points) || [], (store.chart && store.chart.marks) || []);
    }
    const candles = document.getElementById("coin-chart");
    if (candles && window.DeskChart) {
      const exit = store.coin && store.coin.exit_lines ? store.coin.exit_lines.exit_line : null;
      DeskChart.drawCandles(candles, (store.coin && store.coin.candles) || [], exit);
    }
    const ring = document.getElementById("score-ring");
    if (ring && window.DeskChart) {
      let score = null;
      const dec = store.decisions && store.decisions.name === "analyst" ? store.decisions.decisions : null;
      if (dec && dec[0] && dec[0].score != null) score = dec[0].score;
      DeskChart.drawRing(ring, score, MIN_SCORE);
    }
  }

  function afterPaint() {
    const odo = document.getElementById("odo");
    if (odo && !odo.getAttribute("data-text")) {
      paintOdometer(odo, store.state ? store.state.balance : 0);
    }
    requestAnimationFrame(() => requestAnimationFrame(paintCharts));
  }

  function navForOverlay() {
    const navTitle = document.getElementById("nav-title");
    const back = document.getElementById("nav-account");
    const tabbar = document.getElementById("tabbar");
    if (store.overlay) {
      const title = store.overlay.kind === "coin" ? "Coin"
        : store.overlay.kind === "auditor" ? "Auditor"
        : store.overlay.kind === "search" ? "Search"
        : titleCase(store.overlay.name);
      navTitle.innerHTML = esc(title);
      back.className = "nav-btn back";
      back.textContent = "‹ Back";
      back.setAttribute("aria-label", "Back");
      tabbar.classList.add("hidden");
      document.body.style.paddingBottom = "16px";
    } else {
      navTitle.innerHTML = 'Grok Bot <span class="chev">›</span>';
      back.className = "nav-btn avatar";
      back.textContent = "";
      back.setAttribute("aria-label", "Account");
      tabbar.classList.remove("hidden");
      document.body.style.paddingBottom = "";
    }
  }

  function render() {
    const screen = document.getElementById("screen");
    let html;
    if (store.overlay && store.overlay.kind === "coin") html = renderCoin();
    else if (store.overlay && store.overlay.kind === "auditor") html = renderAuditor();
    else if (store.overlay && store.overlay.kind === "agent") html = renderAgentDetail();
    else if (store.overlay && store.overlay.kind === "search") html = renderSearch();
    else if (store.tab === "agents") html = renderAgents();
    else if (store.tab === "activity") html = renderActivity();
    else if (store.tab === "account") html = renderAccount();
    else html = renderHome();
    screen.innerHTML = html;
    navForOverlay();
    document.querySelectorAll(".tab").forEach((el) => {
      el.classList.toggle("on", el.getAttribute("data-tab") === store.tab);
    });
    afterPaint();
  }

  function stopBeam() {
    if (store.beam.timer) {
      clearTimeout(store.beam.timer);
      store.beam.timer = null;
    }
  }

  function startBeam(mint, layers) {
    stopBeam();
    if (store.beam.mint === mint && store.beam.done) return;
    store.beam = { mint, step: 0, done: false, timer: null };
    const play = () => {
      const list = (store.audit && store.audit.layers) || layers || [];
      if (store.beam.step >= list.length) {
        store.beam.timer = setTimeout(() => {
          store.beam.done = true;
          if (store.overlay && store.overlay.kind === "auditor") render();
        }, 150);
        return;
      }
      render();
      const layer = list[store.beam.step];
      const wait = layer ? 350 : 350;
      store.beam.timer = setTimeout(() => {
        store.beam.step += 1;
        play();
      }, wait);
    };
    play();
  }

  async function refreshCore() {
    if (!store.path) {
      store.ready = true;
      store.error = null;
      render();
      return;
    }
    try {
      const jobs = [
        loadJson("state.json"),
        loadJson("chart/" + store.range + ".json").catch(() => loadJson("chart.json")),
        loadJson("activity.json"),
        loadJson("account.json"),
        loadJson("settings.json"),
      ];
      if (store.tab === "agents" && !(store.overlay && store.overlay.kind === "agent")) {
        jobs.push(loadJson("agents/analyst.json"));
      }
      const results = await Promise.all(jobs);
      store.state = results[0];
      store.chart = results[1];
      store.activity = results[2];
      store.account = results[3];
      store.settings = results[4];
      if (results[5]) store.decisions = results[5];
      store.error = null;
      store.ready = true;
    } catch (_) {
      store.error = "unreachable";
      store.ready = true;
    }
  }

  async function refreshOverlay() {
    if (!store.path || !store.overlay) return;
    try {
      if (store.overlay.kind === "coin" && store.overlay.mint) {
        store.coin = await loadJson("coin/" + store.overlay.mint + ".json");
      } else if (store.overlay.kind === "auditor" && store.overlay.mint) {
        store.audit = await loadJson("audit/" + store.overlay.mint + ".json");
        startBeam(store.overlay.mint, store.audit.layers || []);
      } else if (store.overlay.kind === "agent" && store.overlay.name) {
        store.decisions = await loadJson("agents/" + store.overlay.name + ".json");
      }
    } catch (_) {
      if (store.overlay.kind === "coin") store.coin = null;
      if (store.overlay.kind === "auditor") store.audit = null;
      if (store.overlay.kind === "agent") store.decisions = { name: store.overlay.name, decisions: [] };
      store.error = store.error || "unreachable";
    }
  }

  async function refresh() {
    await refreshCore();
    await refreshOverlay();
    render();
  }

  async function openOverlay(kind, extra) {
    store.overlay = Object.assign({ kind }, extra || {});
    store.error = null;
    if (kind === "auditor") {
      store.beam = { mint: extra && extra.mint, step: 0, done: false, timer: null };
    }
    await refreshOverlay();
    render();
  }

  function closeOverlay() {
    stopBeam();
    store.overlay = null;
    store.coin = null;
    store.audit = null;
    render();
  }

  async function shareInvite() {
    const url = store.account && store.account.signup_url;
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "FOMO", url });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch (_) {
      toast("Couldn't copy the link");
    }
  }

  document.getElementById("tabbar").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-tab]");
    if (!btn) return;
    store.tab = btn.getAttribute("data-tab");
    store.overlay = null;
    refresh();
  });

  document.getElementById("nav-account").addEventListener("click", () => {
    if (store.overlay) {
      closeOverlay();
      return;
    }
    store.tab = "account";
    refresh();
  });

  document.getElementById("nav-bell").addEventListener("click", () => {
    store.overlay = null;
    store.tab = "activity";
    refresh();
  });

  document.getElementById("nav-search").addEventListener("click", () => {
    openOverlay("search");
  });

  document.getElementById("screen").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target && ev.target.id === "mint-search") {
      const mint = ev.target.value.trim();
      if (mint) openOverlay("coin", { mint });
    }
  });

  document.getElementById("screen").addEventListener("click", (ev) => {
    const range = ev.target.closest("[data-range]");
    if (range) {
      store.range = range.getAttribute("data-range");
      refresh();
      return;
    }
    if (ev.target.closest("[data-invite]")) {
      shareInvite();
      return;
    }
    if (ev.target.id === "mint-go" || ev.target.closest("#mint-go")) {
      const input = document.getElementById("mint-search");
      const mint = input && input.value.trim();
      if (mint) openOverlay("coin", { mint });
      return;
    }
    const open = ev.target.closest("[data-open]");
    if (!open) return;
    const kind = open.getAttribute("data-open");
    const mint = open.getAttribute("data-mint");
    const name = open.getAttribute("data-name");
    if ((kind === "coin" || kind === "auditor") && mint) openOverlay(kind, { mint });
    if (kind === "agent" && name) openOverlay("agent", { name });
  });

  store.path = readPath();
  refresh();
  setInterval(refresh, POLL_MS);
  window.addEventListener("resize", () => afterPaint());
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
