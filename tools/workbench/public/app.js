// Composer Workbench — client-side logic

let allLeads = [];
let currentLead = null;
let currentDetail = null;
let lastGeneratedHtml = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  try {
    const res = await fetch("/api/leads");
    allLeads = await res.json();
    renderLeadList(allLeads);
  } catch (err) {
    document.getElementById("lead-list").innerHTML =
      `<div class="loading" style="color:var(--red)">Failed to load leads: ${err.message}</div>`;
  }

  // Event listeners
  document.getElementById("filter-status").addEventListener("change", applyFilters);
  document.getElementById("filter-search").addEventListener("input", applyFilters);
  document.getElementById("setting-temp").addEventListener("input", (e) => {
    document.getElementById("temp-value").textContent = e.target.value;
  });
}

// ---------------------------------------------------------------------------
// Lead List
// ---------------------------------------------------------------------------

function applyFilters() {
  const status = document.getElementById("filter-status").value;
  const search = document.getElementById("filter-search").value.toLowerCase();

  let filtered = allLeads;

  if (status === "qualified") filtered = filtered.filter((l) => l.qualified);
  if (status === "rejected") filtered = filtered.filter((l) => !l.qualified);

  if (search) {
    filtered = filtered.filter((l) =>
      l.business_name.toLowerCase().includes(search) ||
      l.business_type.toLowerCase().includes(search) ||
      (l.address || "").toLowerCase().includes(search)
    );
  }

  renderLeadList(filtered);
}

function renderLeadList(leads) {
  const container = document.getElementById("lead-list");

  if (leads.length === 0) {
    container.innerHTML = '<div class="loading">No leads found</div>';
    return;
  }

  // Sort: qualified first, then by score
  leads.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return (b.qualification_score || 0) - (a.qualification_score || 0);
  });

  container.innerHTML = leads.map((lead) => `
    <div class="lead-card ${currentLead?.lead_id === lead.lead_id ? 'active' : ''}"
         onclick="selectLead('${lead.lead_id}')">
      <div class="name">${esc(lead.business_name)}</div>
      <div class="type">${esc(lead.business_type)}</div>
      <div class="meta">
        <span class="tag ${lead.qualified ? 'qualified' : 'rejected'}">
          ${lead.qualified ? 'Qualified' : 'Rejected'}
          ${lead.qualification_score ? ` (${lead.qualification_score})` : ''}
        </span>
        ${lead.google_rating ? `<span class="tag">${lead.google_rating}★ (${lead.google_review_count})</span>` : ''}
        ${lead.photo_count > 0 ? `<span class="tag photos">${lead.photo_count} photos</span>` : ''}
        ${lead.instagram_handle ? `<span class="tag">@${esc(lead.instagram_handle)}</span>` : ''}
      </div>
    </div>
  `).join("");
}

// ---------------------------------------------------------------------------
// Lead Detail
// ---------------------------------------------------------------------------

async function selectLead(leadId) {
  currentLead = allLeads.find((l) => l.lead_id === leadId);
  if (!currentLead) return;

  // Update sidebar selection
  renderLeadList(getFilteredLeads());

  // Show detail view
  document.getElementById("empty-state").style.display = "none";
  document.getElementById("detail-view").style.display = "flex";

  // Fetch full detail
  try {
    const res = await fetch(`/api/leads/${leadId}`);
    currentDetail = await res.json();
    renderBusinessInfo(currentDetail);
    renderPhotos(currentDetail);
    renderBrandData(currentDetail);
    renderPhotoSelection(currentDetail);
  } catch (err) {
    document.getElementById("business-info").innerHTML =
      `<p style="color:var(--red)">Error loading: ${err.message}</p>`;
  }

  // Reset preview
  lastGeneratedHtml = null;
  document.getElementById("preview-frame").srcdoc = "";
  setPreviewButtons(false);
  setStatus("");
}

function getFilteredLeads() {
  const status = document.getElementById("filter-status").value;
  const search = document.getElementById("filter-search").value.toLowerCase();
  let filtered = allLeads;
  if (status === "qualified") filtered = filtered.filter((l) => l.qualified);
  if (status === "rejected") filtered = filtered.filter((l) => !l.qualified);
  if (search) {
    filtered = filtered.filter((l) =>
      l.business_name.toLowerCase().includes(search) ||
      l.business_type.toLowerCase().includes(search)
    );
  }
  return filtered;
}

function renderBusinessInfo(detail) {
  const { lead, profile, brandIntelligence } = detail;
  const p = profile || {};

  let html = `
    <h2>${esc(lead.business_name)}</h2>
    <div class="subtitle">${esc(lead.business_type)} &middot; ${esc(lead.address || 'No address')}</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="label">Rating</div>
        ${lead.google_rating ? `${lead.google_rating}★ from ${lead.google_review_count} reviews` : 'No data'}
      </div>
      <div class="info-item">
        <div class="label">Phone</div>
        ${esc(lead.phone || 'None')}
      </div>
      <div class="info-item">
        <div class="label">Website</div>
        ${lead.has_website ? `Yes (quality: ${lead.website_quality_score || '?'}/100)` : 'No website'}
      </div>
      <div class="info-item">
        <div class="label">Instagram</div>
        ${lead.instagram_handle ? `@${esc(lead.instagram_handle)} (${(lead.instagram_followers || '?').toLocaleString()} followers)` : 'None'}
      </div>
      <div class="info-item">
        <div class="label">Photos</div>
        ${lead.photo_count} available
      </div>
      <div class="info-item">
        <div class="label">Qualification</div>
        ${lead.qualified ? `<span style="color:var(--green)">Qualified (${lead.qualification_score})</span>` : '<span style="color:var(--red)">Rejected</span>'}
      </div>
    </div>
  `;

  if (brandIntelligence) {
    html += `
      <div class="intelligence">
        <h4>Brand Intelligence</h4>
        ${brandIntelligence.tone ? `<p><strong>Tone:</strong> ${esc(brandIntelligence.tone)}</p>` : ''}
        ${brandIntelligence.personality ? `<p><strong>Personality:</strong> ${esc(brandIntelligence.personality)}</p>` : ''}
        ${brandIntelligence.unique_selling_points ? `<p><strong>USPs:</strong> ${brandIntelligence.unique_selling_points.map(esc).join(' &middot; ')}</p>` : ''}
        ${brandIntelligence.suggested_headline ? `<p><strong>AI Headline:</strong> "${esc(brandIntelligence.suggested_headline)}"</p>` : ''}
      </div>
    `;
  }

  document.getElementById("business-info").innerHTML = html;
}

function renderPhotos(detail) {
  const container = document.getElementById("reference-photos");
  if (!detail.photos || detail.photos.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No photos available</p>';
    return;
  }

  container.innerHTML = detail.photos.slice(0, 12).map((photo) =>
    `<img src="/api/leads/${detail.lead.lead_id}/photos/${photo}"
          alt="${esc(photo)}"
          title="${esc(photo)}"
          onclick="window.open(this.src, '_blank')" />`
  ).join("");
}

function renderBrandData(detail) {
  const container = document.getElementById("brand-data");
  const ba = detail.brandAnalysis;
  if (!ba) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No brand analysis</p>';
    return;
  }

  let html = "";

  if (ba.colours) {
    html += '<h4>Colours</h4><div class="colour-swatches">';
    const cols = ba.colours;
    for (const [name, hex] of Object.entries(cols)) {
      if (name === "palette_source" || typeof hex !== "string" || !hex.startsWith("#")) continue;
      html += `<div class="colour-swatch" style="background:${hex}" title="${name}: ${hex}"></div>`;
    }
    html += `</div><p class="font-info">Source: ${esc(cols.palette_source || 'unknown')}</p>`;
  }

  if (ba.fonts) {
    html += `<h4>Fonts</h4>
      <p class="font-info">Heading: ${esc(ba.fonts.heading || 'default')}<br>
      Body: ${esc(ba.fonts.body || 'default')}<br>
      Source: ${esc(ba.fonts.source || 'unknown')}</p>`;
  }

  if (ba.description) {
    html += `<h4>Description</h4><p class="font-info">${esc(ba.description.slice(0, 300))}</p>`;
  }

  if (ba.services && ba.services.length > 0) {
    html += `<h4>Services Detected</h4><p class="font-info">${ba.services.map(esc).join(', ')}</p>`;
  }

  container.innerHTML = html;
}

function renderPhotoSelection(detail) {
  const container = document.getElementById("photo-selection");
  if (!detail.photos || detail.photos.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <h4>Photos to Include</h4>
    <div class="photo-checkboxes">
      ${detail.photos.map((p) => `
        <label>
          <input type="checkbox" value="${esc(p)}" checked />
          ${esc(p)}
        </label>
      `).join("")}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

async function generate() {
  if (!currentLead) return;

  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  btn.textContent = "Generating...";
  setStatus("Generating site... this takes ~30-60 seconds");

  const selectedPhotos = [];
  document.querySelectorAll("#photo-selection input[type=checkbox]:checked").forEach((cb) => {
    selectedPhotos.push(cb.value);
  });

  const body = {
    leadId: currentLead.lead_id,
    model: document.getElementById("setting-model").value,
    temperature: parseFloat(document.getElementById("setting-temp").value),
    maxTokens: parseInt(document.getElementById("setting-tokens").value),
    promptAddition: document.getElementById("setting-prompt").value || undefined,
    selectedPhotos: selectedPhotos.length > 0 ? selectedPhotos : undefined,
  };

  try {
    const t0 = Date.now();
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    lastGeneratedHtml = data.html;

    // Render preview
    document.getElementById("preview-frame").srcdoc = data.html;
    setPreviewButtons(true);
    setStatus(`Done in ${elapsed}s — ${data.tokens} tokens, $${data.cost.toFixed(4)}`, "success");
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate Site";
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function saveOutput() {
  if (!lastGeneratedHtml || !currentLead) return;
  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: currentLead.lead_id,
        html: lastGeneratedHtml,
        meta: {
          business_name: currentLead.business_name,
          model: document.getElementById("setting-model").value,
          temperature: document.getElementById("setting-temp").value,
          saved_at: new Date().toISOString(),
        },
      }),
    });
    const data = await res.json();
    setStatus(`Saved to ${data.path}`, "success");
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, "error");
  }
}

function openInNewTab() {
  if (!lastGeneratedHtml) return;
  const blob = new Blob([lastGeneratedHtml], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}

function copyHtml() {
  if (!lastGeneratedHtml) return;
  navigator.clipboard.writeText(lastGeneratedHtml).then(() => {
    setStatus("HTML copied to clipboard", "success");
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status " + type;
}

function setPreviewButtons(enabled) {
  document.getElementById("btn-save").disabled = !enabled;
  document.getElementById("btn-newtab").disabled = !enabled;
  document.getElementById("btn-copy").disabled = !enabled;
}

function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

// Start
init();
