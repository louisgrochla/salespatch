// Settings page — key management

async function loadCurrentKeys() {
  try {
    const res = await fetch("/api/keys");
    const keys = await res.json();
    for (const [key, masked] of Object.entries(keys)) {
      const el = document.getElementById(`current-${key}`);
      if (el) {
        el.textContent = masked || "Not set";
        el.className = "key-current " + (masked ? "set" : "unset");
      }
    }
  } catch (err) {
    document.getElementById("key-status").textContent = "Failed to load keys: " + err.message;
  }
}

async function saveAllKeys() {
  const keys = {};
  let hasAny = false;

  for (const keyName of ["OPENROUTER_API_KEY", "GOOGLE_PLACES_API_KEY", "APIFY_API_TOKEN"]) {
    const input = document.getElementById(`input-${keyName}`);
    if (input.value.trim()) {
      keys[keyName] = input.value.trim();
      hasAny = true;
    }
  }

  if (!hasAny) {
    document.getElementById("key-status").textContent = "Enter at least one key to save.";
    return;
  }

  try {
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keys),
    });
    const masked = await res.json();

    // Update displayed masked values
    for (const [key, val] of Object.entries(masked)) {
      const el = document.getElementById(`current-${key}`);
      if (el) {
        el.textContent = val || "Not set";
        el.className = "key-current " + (val ? "set" : "unset");
      }
    }

    // Clear inputs
    for (const keyName of Object.keys(keys)) {
      document.getElementById(`input-${keyName}`).value = "";
    }

    const statusEl = document.getElementById("key-status");
    statusEl.textContent = "Keys saved successfully.";
    statusEl.className = "key-status-msg success";
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  } catch (err) {
    const statusEl = document.getElementById("key-status");
    statusEl.textContent = "Save failed: " + err.message;
    statusEl.className = "key-status-msg error";
  }
}

loadCurrentKeys();
