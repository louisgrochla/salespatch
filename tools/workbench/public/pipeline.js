// Pipeline control page

let currentRunId = null;
let isRunning = false;

function getConfig() {
  return {
    location: document.getElementById("cfg-location").value.trim(),
    verticals: document.getElementById("cfg-verticals").value.split(",").map(v => v.trim()).filter(Boolean),
    maxPerVertical: parseInt(document.getElementById("cfg-max").value) || 3,
  };
}

function setStatus(msg, type) {
  const el = document.getElementById("pipeline-status");
  el.textContent = msg;
  el.className = "pipeline-status " + (type || "");
}

function setButtons(running) {
  isRunning = running;
  document.getElementById("btn-step").disabled = running;
  document.getElementById("btn-all").disabled = running;
  document.getElementById("btn-next").disabled = running;
}

// ---------------------------------------------------------------------------
// Stage UI updates
// ---------------------------------------------------------------------------

function updateStageNode(stageName, status, info) {
  const node = document.querySelector(`.stage-node[data-stage="${stageName}"]`);
  if (!node) return;
  node.className = `stage-node ${status}`;
  if (info) {
    let badge = node.querySelector(".stage-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "stage-badge";
      node.appendChild(badge);
    }
    badge.textContent = info;
  }
}

function updateAllStages(stages) {
  for (const s of stages) {
    const info = s.leadCount ? `${s.leadCount}` : "";
    updateStageNode(s.name, s.status, info);
  }
}

function resetStages() {
  document.querySelectorAll(".stage-node").forEach(n => {
    n.className = "stage-node";
    const badge = n.querySelector(".stage-badge");
    if (badge) badge.remove();
  });
}

// ---------------------------------------------------------------------------
// Output rendering
// ---------------------------------------------------------------------------

function renderStageOutput(stageName, formatted, raw) {
  const container = document.getElementById("stage-output");

  if (stageName === "qualify" && formatted && formatted.qualified) {
    container.innerHTML = `
      <div class="output-section">
        <h3>Qualified (${formatted.stats.qualified}) — avg score: ${formatted.stats.avg_score}</h3>
        <div class="card-grid">${formatted.qualified.map(q => `
          <div class="output-card qualified">
            <div class="card-title">${esc(q.name)}</div>
            <div class="card-type">${esc(q.type)}</div>
            <div class="card-score">Score: ${q.score}</div>
            <div class="card-reasons">${(q.reasons || []).map(r => `<div class="reason">+ ${esc(r)}</div>`).join("")}</div>
          </div>
        `).join("")}</div>
      </div>
      <div class="output-section">
        <h3>Rejected (${formatted.stats.rejected})</h3>
        <div class="card-grid">${formatted.rejected.map(r => `
          <div class="output-card rejected">
            <div class="card-title">${esc(r.name)}</div>
            <div class="card-type">${esc(r.type)}</div>
            <div class="card-reason">${esc(r.reason)}</div>
          </div>
        `).join("")}</div>
      </div>
      ${rawToggle(raw)}
    `;
    return;
  }

  if (Array.isArray(formatted)) {
    container.innerHTML = `
      <div class="output-section">
        <h3>${capitalize(stageName)} — ${formatted.length} items</h3>
        <div class="card-grid">${formatted.map(item => renderItemCard(stageName, item)).join("")}</div>
      </div>
      ${rawToggle(raw)}
    `;
    return;
  }

  container.innerHTML = `<pre class="raw-json">${esc(JSON.stringify(formatted, null, 2))}</pre>`;
}

function renderItemCard(stage, item) {
  switch (stage) {
    case "scout":
      return `<div class="output-card">
        <div class="card-title">${esc(item.name)}</div>
        <div class="card-type">${esc(item.type)}</div>
        <div class="card-meta">
          ${item.rating ? `<span>${item.rating}★ (${item.reviews})</span>` : ""}
          ${item.phone ? `<span>${esc(item.phone)}</span>` : ""}
          ${item.photos ? `<span>${item.photos} photos</span>` : ""}
        </div>
        ${item.address ? `<div class="card-addr">${esc(item.address)}</div>` : ""}
        ${item.website ? `<div class="card-web">${esc(item.website)}</div>` : '<div class="card-web none">No website</div>'}
      </div>`;

    case "profile":
      return `<div class="output-card">
        <div class="card-title">${esc(item.name)}</div>
        <div class="card-type">${esc(item.type)}</div>
        <div class="card-meta">
          ${item.rating ? `<span>${item.rating}★ (${item.reviews})</span>` : ""}
          <span>Web: ${item.has_website ? `${item.website_score}/100` : 'None'}</span>
          ${item.ig_handle ? `<span>@${esc(item.ig_handle)} (${(item.ig_followers || "?").toLocaleString()})</span>` : item.has_ig ? '<span>IG scraped</span>' : ''}
          ${item.services > 0 ? `<span>${item.services} services</span>` : ""}
          ${item.logo ? '<span>Logo found</span>' : ""}
        </div>
      </div>`;

    case "brand-analyse":
      return `<div class="output-card">
        <div class="card-title">Lead ${esc(String(item.lead_id).slice(-6))}</div>
        <div class="card-meta">
          <span>${item.photos} photos</span>
          <span>${item.services} services</span>
        </div>
        ${item.colours ? `<div class="card-colours">${renderColours(item.colours)}</div>` : ""}
        ${item.description ? `<div class="card-desc">${esc(item.description)}</div>` : ""}
      </div>`;

    case "brand-intelligence":
      return `<div class="output-card">
        <div class="card-title">Lead ${esc(String(item.lead_id).slice(-6))}</div>
        ${item.tone ? `<div class="card-meta"><span>Tone: ${esc(item.tone)}</span></div>` : ""}
        ${item.headline ? `<div class="card-headline">"${esc(item.headline)}"</div>` : ""}
        ${item.usps ? `<div class="card-usps">${item.usps.map(u => `<span class="usp">${esc(u)}</span>`).join("")}</div>` : ""}
      </div>`;

    case "brief":
      return `<div class="output-card">
        <div class="card-title">${esc(item.name)}</div>
        <div class="card-type">${esc(item.type)}</div>
        ${item.headline ? `<div class="card-headline">"${esc(item.headline)}"</div>` : ""}
        <div class="card-meta">
          <span>${item.services} services</span>
          <span>${item.reviews} reviews</span>
          <span>${(item.sections || []).length} sections</span>
        </div>
      </div>`;

    case "compose":
      return `<div class="output-card">
        <div class="card-title">${esc(item.name || item.lead_id)}</div>
        <div class="card-meta">
          <span>${(item.html_length / 1000).toFixed(1)}KB HTML</span>
          ${item.cost ? `<span>$${item.cost.toFixed(4)}</span>` : ""}
        </div>
      </div>`;

    default:
      return `<div class="output-card"><pre>${esc(JSON.stringify(item, null, 2))}</pre></div>`;
  }
}

function renderColours(colours) {
  if (!colours) return "";
  return Object.entries(colours)
    .filter(([k, v]) => k !== "palette_source" && typeof v === "string" && v.startsWith("#"))
    .map(([k, v]) => `<span class="mini-swatch" style="background:${v}" title="${k}: ${v}"></span>`)
    .join("");
}

function rawToggle(raw) {
  if (!raw) return "";
  const jsonStr = JSON.stringify(raw, null, 2);
  if (jsonStr.length > 500000) return '<div class="raw-note">Raw JSON too large to display</div>';
  return `
    <details class="raw-toggle">
      <summary>Show raw JSON</summary>
      <pre class="raw-json">${esc(jsonStr)}</pre>
    </details>
  `;
}

// ---------------------------------------------------------------------------
// Pipeline control
// ---------------------------------------------------------------------------

async function startPipeline() {
  const config = getConfig();
  if (!config.location) { setStatus("Enter a location", "error"); return null; }
  if (config.verticals.length === 0) { setStatus("Enter at least one vertical", "error"); return null; }

  resetStages();
  document.getElementById("stage-output").innerHTML = '<div class="output-placeholder">Starting pipeline...</div>';

  try {
    const res = await fetch("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    currentRunId = data.runId;
    setStatus(`Run started: ${currentRunId}`, "info");
    return currentRunId;
  } catch (err) {
    setStatus("Start failed: " + err.message, "error");
    return null;
  }
}

async function runStep(runId) {
  setButtons(true);
  try {
    const res = await fetch("/api/pipeline/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    updateAllStages(data.allStages);
    renderStageOutput(data.stage.name, data.formatted, null);

    const nextIdx = data.currentStage + 1;
    const stages = ["scout", "profile", "brand-analyse", "brand-intelligence", "qualify", "brief", "compose"];
    if (nextIdx < stages.length) {
      document.getElementById("stage-actions").style.display = "flex";
      document.getElementById("stage-info").textContent = `Next: ${stages[nextIdx]}`;
    } else {
      document.getElementById("stage-actions").style.display = "none";
      setStatus("Pipeline complete!", "success");
    }

    if (data.stage.status === "error") {
      setStatus(`Stage failed: ${data.stage.error}`, "error");
    } else {
      const ms = data.allStages[data.currentStage]?.ms;
      const cost = data.allStages[data.currentStage]?.costUsd;
      let msg = `${data.stage.name}: ${data.stage.summary}`;
      if (ms) msg += ` (${(ms/1000).toFixed(1)}s)`;
      if (cost) msg += ` ($${cost.toFixed(4)})`;
      setStatus(msg, "success");
    }

    return data;
  } catch (err) {
    setStatus("Step failed: " + err.message, "error");
    return null;
  } finally {
    setButtons(false);
  }
}

async function startAndStep() {
  const runId = await startPipeline();
  if (!runId) return;
  await runStep(runId);
}

async function runNextStep() {
  if (!currentRunId) return;
  await runStep(currentRunId);
}

async function startAndRunAll() {
  const runId = await startPipeline();
  if (!runId) return;

  setButtons(true);
  setStatus("Running all stages...", "info");

  try {
    const res = await fetch("/api/pipeline/run-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    updateAllStages(data.stages);

    // Show the last stage's output
    const lastDone = [...data.stages].reverse().find(s => s.status === "done");
    if (lastDone) {
      const outputRes = await fetch(`/api/pipeline/output/${runId}/${lastDone.name}`);
      const outputData = await outputRes.json();
      renderStageOutput(lastDone.name, outputData.formatted, outputData.raw);
    }

    document.getElementById("stage-actions").style.display = "none";
    setStatus(data.complete ? "Pipeline complete!" : "Pipeline stopped (error in a stage)", data.complete ? "success" : "error");
  } catch (err) {
    setStatus("Run failed: " + err.message, "error");
  } finally {
    setButtons(false);
  }
}

// Allow clicking stage nodes to view their output
document.querySelectorAll(".stage-node").forEach(node => {
  node.addEventListener("click", async () => {
    if (!currentRunId) return;
    const stage = node.dataset.stage;
    try {
      const res = await fetch(`/api/pipeline/output/${currentRunId}/${stage}`);
      const data = await res.json();
      if (data.error) return;
      if (data.stage.status === "done") {
        renderStageOutput(stage, data.formatted, data.raw);
      }
    } catch { /* ignore */ }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
}
