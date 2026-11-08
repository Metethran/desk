
(function () {
  const params = new URLSearchParams((location.hash || "").replace(/^#/, "").replace(/&/g, "&"));
  // Plan B: {URL}#d={DATA_PATH}  (never logged)
  const hash = location.hash.slice(1);
  const parts = Object.fromEntries(hash.split("&").filter(Boolean).map((p) => {
    const i = p.indexOf("="); return i === -1 ? [p, ""] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
  }));
  if (parts.d) {
    try { localStorage.setItem("desk_data_path", parts.d); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
  }
  const dataPath = (function () { try { return localStorage.getItem("desk_data_path"); } catch (e) { return null; } })();

  async function loadState() {
    if (!dataPath) return null;
    const res = await fetch("d/" + dataPath + "/state.json", { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  }

  const screen = document.getElementById("screen");
  function renderHome(state) {
    const mode = (state && state.mode) || "PAPER";
    const bal = state && typeof state.balance === "number" ? state.balance : null;
    screen.innerHTML = `
      <div class="balance">${bal === null ? "—" : "$" + bal.toFixed(2)}
        ${mode === "PAPER" ? '<span class="paper">PAPER</span>' : ""}
      </div>
      <canvas id="homeChart" style="width:100%;height:180px"></canvas>
      <p class="empty">${bal === null ? "Waiting for the first trade" : ""}</p>
    `;
    const c = document.getElementById("homeChart");
    if (window.DeskChart) DeskChart.drawLine(c, (state && state.points) || [], "#00d35a");
  }

  loadState().then(renderHome).catch(function () { renderHome(null); });
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "home") loadState().then(renderHome).catch(() => renderHome(null));
    });
  });
})();
