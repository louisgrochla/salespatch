// SalesFlow shared top nav + footer
function renderShell({currentPath}) {
  const topEl = document.getElementById('shell-top');
  const footEl = document.getElementById('shell-footer');
  const navLinks = [
    { key: 'product', href: 'product.html', label: 'How it works' },
    { key: 'contractors', href: 'contractors.html', label: 'For contractors' },
    { key: 'pricing', href: 'pricing.html', label: 'Earnings' },
    { key: 'resources', href: 'blog.html', label: 'Resources' },
    { key: 'company', href: 'company.html', label: 'Company' },
  ];
  if (topEl) {
    topEl.innerHTML = `<nav class="top-nav"><div class="inner">
      <a href="/" class="brand-mark">SalesFlow<span class="dot"></span></a>
      <div class="nav-links">${navLinks.map(l => `<a href="${l.href}" class="${l.key === currentPath ? 'is-current' : ''}">${l.label}</a>`).join('')}</div>
      <div class="nav-right">
        <a href="login.html" class="btn btn-ghost">Log in</a>
        <a href="apply.html" class="btn btn-primary">Apply</a>
      </div>
    </div></nav>`;
  }
  if (footEl) {
    footEl.innerHTML = `<footer class="footer"><div class="container-xl">
      <div class="footer-grid">
        <div>
          <a href="/" class="brand-mark" style="font-size:22px;">SalesFlow<span class="dot"></span></a>
          <p style="max-width:280px;font-size:13px;color:rgb(210 200 185);line-height:1.55;margin:16px 0 0;">Claim a lead. Walk in. Show the demo. Close. Paid on signature.</p>
        </div>
        <div><h4>Platform</h4><ul>
          <li><a href="product.html">How it works</a></li>
          <li><a href="contractors.html">For contractors</a></li>
          <li><a href="pricing.html">Earnings</a></li>
          <li><a href="apply.html">Apply</a></li>
        </ul></div>
        <div><h4>Resources</h4><ul>
          <li><a href="blog.html">Field reports</a></li>
          <li><a href="guides.html">Guides</a></li>
          <li><a href="case-studies.html">Contractor stories</a></li>
          <li><a href="help.html">Help centre</a></li>
          <li><a href="changelog.html">Changelog</a></li>
        </ul></div>
        <div><h4>Company</h4><ul>
          <li><a href="company.html">About</a></li>
          <li><a href="careers.html">Careers</a></li>
          <li><a href="contact.html">Contact</a></li>
          <li><a href="security.html">Security</a></li>
          <li><a href="status.html">Status</a></li>
        </ul></div>
        <div><h4>Legal</h4><ul>
          <li><a href="legal-terms.html">Terms</a></li>
          <li><a href="legal-privacy.html">Privacy</a></li>
          <li><a href="legal-contractor-agreement.html">Contractor</a></li>
          <li><a href="legal-cookies.html">Cookies</a></li>
          <li><a href="legal-accessibility.html">Accessibility</a></li>
        </ul></div>
      </div>
      <div class="footer-bottom"><div>/ SalesFlow · [TBD]</div><div>Made in the UK</div></div>
    </div></footer>`;
  }
}
