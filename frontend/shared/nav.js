(function () {
  'use strict';

  /* ── Active link ──────────────────────────────────────────────────────── */
  function setActiveLink() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const links = document.querySelectorAll('.nav-link[data-page]');
    const map = {
      updates: ['/frontend/updates/updates.html', '/updates'],
      routes:  ['/frontend/routes/routes.html', '/index.html', '/', '/routes'],
      planner: ['/frontend/planner/planner.html', '/planner'],
      setup:   ['/frontend/setup/setup.html', '/setup'],
      settings:['/frontend/settings/settings.html', '/settings'],
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

  /* ── Init ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    setActiveLink();
    initMobileMenu();
    initScrollShadow();
  });
})();
