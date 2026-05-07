// Shared navigation bar — injected into all pages
(function() {
  const currentPage = location.pathname === "/" || location.pathname === "/index.html"
    ? "composer"
    : location.pathname.replace(/^\/|\.html$/g, "");

  const nav = document.createElement("nav");
  nav.className = "top-nav";
  nav.innerHTML = `
    <div class="nav-brand">Workbench</div>
    <div class="nav-links">
      <a href="/" class="${currentPage === 'composer' ? 'active' : ''}">Composer</a>
      <a href="/pipeline.html" class="${currentPage === 'pipeline' ? 'active' : ''}">Pipeline</a>
      <a href="/settings.html" class="${currentPage === 'settings' ? 'active' : ''}">Settings</a>
    </div>
    <div class="nav-keys" id="nav-keys"></div>
  `;
  document.body.prepend(nav);

  // Show key status in nav
  fetch("/api/keys").then(r => r.json()).then(keys => {
    const el = document.getElementById("nav-keys");
    const allSet = Object.values(keys).every(v => v.length > 0);
    el.innerHTML = allSet
      ? '<span class="key-status ok">Keys configured</span>'
      : '<a href="/settings.html" class="key-status warn">Set API keys</a>';
  }).catch(() => {});
})();
