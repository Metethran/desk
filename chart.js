
/* Charts are drawn by hand on <canvas>. No chart library. */
(function (global) {
  function drawLine(canvas, points, color) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length < 2) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = color || "#00d35a";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.6);
      ctx.lineTo(w, h * 0.6);
      ctx.stroke();
      return;
    }
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (x) => ((x - minX) / (maxX - minX || 1)) * w;
    const sy = (y) => h - ((y - minY) / (maxY - minY || 1)) * h;
    ctx.strokeStyle = color || "#00d35a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => { i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1])); });
    ctx.stroke();
  }
  global.DeskChart = { drawLine };
})(window);
