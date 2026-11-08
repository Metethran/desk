/* Charts for Home (line), Coin (candles), Analyst (score ring). devicePixelRatio aware. */
const DeskChart = {
  _prep(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return { ctx, w: cssW, h: cssH };
  },

  drawLine(canvas, points, marks) {
    const { ctx, w, h } = this._prep(canvas);
    const pad = { l: 8, r: 8, t: 16, b: 16 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const data = Array.isArray(points) ? points.filter((p) => Array.isArray(p) && p.length >= 2) : [];

    if (data.length < 2) {
      ctx.strokeStyle = "rgba(235,235,245,0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(pad.l, h / 2);
      ctx.lineTo(w - pad.r, h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const xs = data.map((p) => Number(p[0]));
    const ys = data.map((p) => Number(p[1]));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const xOf = (x) => pad.l + ((x - minX) / spanX) * innerW;
    const yOf = (y) => pad.t + (1 - (y - minY) / spanY) * innerH;
    const up = ys[ys.length - 1] >= ys[0];
    const color = up ? "#00d35a" : "#ff453a";

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    data.forEach((p, i) => {
      const x = xOf(Number(p[0]));
      const y = yOf(Number(p[1]));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const lastX = xOf(xs[xs.length - 1]);
    const lastY = yOf(ys[ys.length - 1]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    (marks || []).forEach((mark) => {
      const ts = Date.parse(mark.ts);
      if (!Number.isFinite(ts)) return;
      const x = xOf(ts);
      let y = lastY;
      let best = Infinity;
      data.forEach((p) => {
        const d = Math.abs(Number(p[0]) - ts);
        if (d < best) {
          best = d;
          y = yOf(Number(p[1]));
        }
      });
      ctx.fillStyle = mark.kind === "sell" ? "#ff453a" : "#00d35a";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  },

  drawCandles(canvas, candles, exitLine) {
    const { ctx, w, h } = this._prep(canvas);
    const volH = Math.round(h * 0.18);
    const pad = { l: 8, r: 8, t: 12, b: 8 + volH };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const data = Array.isArray(candles) ? candles : [];
    if (!data.length) {
      ctx.strokeStyle = "rgba(235,235,245,0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(pad.l, (h - volH) / 2);
      ctx.lineTo(w - pad.r, (h - volH) / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const highs = data.map((c) => Number(c.h));
    const lows = data.map((c) => Number(c.l));
    let minY = Math.min(...lows);
    let maxY = Math.max(...highs);
    const exit = exitLine == null ? null : Number(exitLine);
    if (exit != null && Number.isFinite(exit)) {
      minY = Math.min(minY, exit);
      maxY = Math.max(maxY, exit);
    }
    const spanY = maxY - minY || 1;
    const yOf = (y) => pad.t + (1 - (y - minY) / spanY) * innerH;
    const slot = innerW / data.length;
    const bodyW = Math.max(2, Math.min(10, slot * 0.62));
    const vols = data.map((c) => Math.max(0, Number(c.v) || 0));
    const maxV = Math.max(1, ...vols);

    data.forEach((c, i) => {
      const x = pad.l + slot * i + slot / 2;
      const o = Number(c.o);
      const cl = Number(c.c);
      const up = cl >= o;
      const color = up ? "#00d35a" : "#ff453a";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yOf(Number(c.h)));
      ctx.lineTo(x, yOf(Number(c.l)));
      ctx.stroke();
      const top = yOf(Math.max(o, cl));
      const bot = yOf(Math.min(o, cl));
      ctx.fillRect(x - bodyW / 2, top - (bot === top ? 1.5 : 0), bodyW, Math.max(3, bot - top));
      const vh = (vols[i] / maxV) * (volH - 4);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x - bodyW / 2, h - 4 - vh, bodyW, vh);
      ctx.globalAlpha = 1;
    });

    if (exit != null && Number.isFinite(exit)) {
      const y = yOf(exit);
      ctx.strokeStyle = "#ff9f0a";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  },

  drawRing(canvas, score, minScore) {
    const { ctx, w, h } = this._prep(canvas);
    const value = Number(score);
    const gate = minScore == null ? 70 : Number(minScore);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.max(12, Math.min(w, h) / 2 - 6);
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(84,84,88,0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (Number.isFinite(value)) {
      const frac = Math.max(0, Math.min(100, value)) / 100;
      ctx.strokeStyle = value >= gate ? "#00d35a" : "#ffd60a";
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "600 18px -apple-system, 'SF Pro Display', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(value)), cx, cy);
    }
  },
};

window.DeskChart = DeskChart;
