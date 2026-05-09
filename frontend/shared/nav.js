(function () {
  'use strict';

  /* ── Active link ──────────────────────────────────────────────────────── */
  function setActiveLink() {
    const path = window.location.pathname.replace(/\/$/, '') || '/index.html';
    const links = document.querySelectorAll('.nav-link[data-page]');
    const map = {
      home:    ['/index.html', '/'],
      routes:  ['/frontend/routes/routes.html'],
      planner: ['/frontend/planner/planner.html'],
      forum:   ['/frontend/forum/forum.html'],
      setup:   ['/frontend/setup/setup.html'],
      settings:['/frontend/settings/settings.html'],
    };
    links.forEach(function (a) {
      const page = a.getAttribute('data-page');
      const matches = map[page] || [];
      const active = matches.some(function (m) { return path.endsWith(m); });
      a.classList.toggle('active', active);
    });
  }

  /* ── Hamburger / mobile panel ─────────────────────────────────────────── */
  function initMobileMenu() {
    const btn   = document.getElementById('navHamburger');
    const panel = document.getElementById('navMobilePanel');
    if (!btn || !panel) return;

    btn.addEventListener('click', function () {
      const open = panel.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });

    /* Close on outside click */
    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    /* Close on nav-link click */
    panel.querySelectorAll('.nav-link').forEach(function (a) {
      a.addEventListener('click', function () {
        panel.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ── Nav scroll shadow ────────────────────────────────────────────────── */
  function initScrollShadow() {
    const nav = document.getElementById('topnav');
    if (!nav) return;
    var ticking = false;
    function update() {
      nav.classList.toggle('scrolled', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  }

  /* ── Auth button ──────────────────────────────────────────────────────── */
  async function initAuthBtn() {
    var btns = [
      document.querySelector('.nav-actions .nav-discord'),
      document.querySelector('.nav-mobile-panel .nav-discord'),
    ].filter(Boolean);
    if (!btns.length) return;
    try {
      var res  = await fetch('https://admin.silkroadcalc.eu/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      var data = await res.json();
      if (!data.username) return;
      var name = data.username.length > 16 ? data.username.slice(0, 15) + '…' : data.username;
      btns.forEach(function (btn) {
        btn.href = 'https://admin.silkroadcalc.eu/api/auth/logout';
        var lbl = btn.querySelector('.nav-auth-label');
        if (lbl) lbl.textContent = name;
      });
    } catch (_) {}
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    setActiveLink();
    initMobileMenu();
    initScrollShadow();
    initAuthBtn();
  });
})();
