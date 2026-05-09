(function () {
  'use strict';

  var PAGE_SIZE = 15;
  var state = { cat: 'general', page: 1, total: 0, sort: 'new' };

  var CAT_META = {
    general:  { title: 'General Discussion',      desc: 'General chat about routes, strategies, and the game.' },
    feedback: { title: 'Feedback & Suggestions',  desc: 'Share ideas and suggestions for improving SilkRoadCalc.' },
    bugs:     { title: 'Bug Reports',             desc: 'Report issues or unexpected behaviour.' },
  };

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function relTime(iso) {
    var d = new Date(iso), now = Date.now(), diff = (now - d) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  var AVATAR_COLORS = ['#B8944A','#7ec8e3','#B4CC62','#DF4F4F','#9B7BE8','#E8A87C','#5BA89E'];
  function avatarColor(name) {
    var h = 0, s = String(name);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  /* ── fetch posts ──────────────────────────────────────────────────────── */
  async function loadPosts() {
    var container = document.getElementById('forumPosts');
    var pagEl     = document.getElementById('forumPagination');
    container.innerHTML = '<div class="fposts-loading">Loading posts…</div>';
    pagEl.innerHTML = '';

    try {
      var res  = await fetch('/api/forum/posts?category=' + state.cat + '&page=' + state.page + '&limit=' + PAGE_SIZE + '&sort=' + state.sort);
      if (!res.ok) throw new Error(res.status);
      var data = await res.json();
      state.total = data.total || 0;
      renderPosts(data.posts || [], container);
      renderPagination(pagEl);
    } catch (_) {
      container.innerHTML = '<div class="fposts-empty">Failed to load posts. Try again later.</div>';
    }
  }

  function renderPosts(posts, container) {
    if (!posts.length) {
      container.innerHTML = '<div class="fposts-empty">No posts yet. Be the first to post!</div>';
      return;
    }
    container.innerHTML = posts.map(function (p) {
      var score  = (p.upvotes || 0) - (p.downvotes || 0);
      var author = p.author || 'Anonymous';
      var initial = author.charAt(0).toUpperCase();
      var color  = avatarColor(author);
      var catBadge = (p.category !== state.cat)
        ? '<span class="fpost-cat-badge ' + esc(p.category) + '">' + esc(p.category) + '</span>'
        : '';
      return '<div class="fpost" data-id="' + esc(p.id) + '">' +
        '<div class="fpost-avatar" style="background:' + color + '">' + initial + '</div>' +
        '<div class="fpost-body">' +
          '<div class="fpost-title">' + esc(p.title) + '</div>' +
          '<div class="fpost-meta">' +
            '<span class="fpost-author">' + esc(author) + '</span>' +
            '<span class="fpost-sep">·</span>' +
            '<span class="fpost-time">' + relTime(p.createdAt) + '</span>' +
            catBadge +
          '</div>' +
        '</div>' +
        '<div class="fpost-stats">' +
          '<div class="fpost-vote">' +
            '<button class="fpost-vote-btn" data-vote="up" data-id="' + esc(p.id) + '" aria-label="Upvote">' +
              '<svg viewBox="0 0 12 8" width="9" height="7" fill="currentColor"><path d="M6 0L12 8H0z"/></svg>' +
            '</button>' +
            '<span class="fpost-score' + (score > 0 ? ' positive' : score < 0 ? ' negative' : '') + '">' + score + '</span>' +
            '<button class="fpost-vote-btn" data-vote="down" data-id="' + esc(p.id) + '" aria-label="Downvote">' +
              '<svg viewBox="0 0 12 8" width="9" height="7" fill="currentColor"><path d="M6 8L0 0H12z"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="fpost-replies">' +
            '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 8c0 3.3-2.7 6-6 6a5.9 5.9 0 0 1-3.6-1.2L1 14l1.2-3.4A5.9 5.9 0 0 1 2 8c0-3.3 2.7-6 6-6s6 2.7 6 6z"/></svg>' +
            (p.replies || 0) +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderPagination(el) {
    var pages = Math.ceil(state.total / PAGE_SIZE);
    if (pages <= 1) return;
    var html = '<button class="fpag-btn" id="fpagPrev" ' + (state.page === 1 ? 'disabled' : '') + '>‹</button>';
    for (var i = 1; i <= pages; i++) {
      html += '<button class="fpag-btn' + (i === state.page ? ' active' : '') + '" data-pg="' + i + '">' + i + '</button>';
    }
    html += '<button class="fpag-btn" id="fpagNext" ' + (state.page === pages ? 'disabled' : '') + '>›</button>';
    el.innerHTML = html;
  }

  /* ── category counts ──────────────────────────────────────────────────── */
  async function loadCounts() {
    try {
      var res  = await fetch('/api/forum/counts');
      if (!res.ok) return;
      var data = await res.json();
      ['general','feedback','bugs'].forEach(function (k) {
        var el = document.getElementById('catCount' + k.charAt(0).toUpperCase() + k.slice(1));
        if (el && data[k] != null) el.textContent = data[k];
      });
    } catch (_) {}
  }

  /* ── changelog ────────────────────────────────────────────────────────── */
  async function loadChangelog() {
    var el = document.getElementById('forumChangelog');
    if (!el) return;
    try {
      var res  = await fetch('/api/changelog');
      if (!res.ok) return;
      var data = await res.json();
      var entries = (data.entries || data).slice(0, 4);
      el.innerHTML = entries.map(function (e) {
        return '<div class="frc-entry">' +
          '<div class="frc-entry-ver">' + esc(e.version || e.ver || '') + '</div>' +
          '<div class="frc-entry-text">' + esc(e.title || e.text || '') + '</div>' +
        '</div>';
      }).join('');
    } catch (_) {
      el.innerHTML = '';
    }
  }

  /* ── new post modal ───────────────────────────────────────────────────── */
  var modal     = document.getElementById('newPostModal');
  var loginGate = document.getElementById('npmLoginGate');
  var formBody  = document.getElementById('npmFormBody');

  async function openModal() {
    modal.hidden = false;
    try {
      var res  = await fetch('/api/auth/me');
      var data = res.ok ? await res.json() : {};
      if (data.username) {
        loginGate.style.display = 'none';
        formBody.style.display  = '';
        var catSel = document.getElementById('npmCategory');
        if (catSel) catSel.value = state.cat;
      } else {
        loginGate.style.display = '';
        formBody.style.display  = 'none';
      }
    } catch (_) {
      loginGate.style.display = '';
      formBody.style.display  = 'none';
    }
  }

  function closeModal() { modal.hidden = true; }

  document.getElementById('newPostBtn').addEventListener('click', openModal);
  document.getElementById('newPostClose').addEventListener('click', closeModal);
  document.getElementById('newPostCancel').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  document.getElementById('newPostForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var cat   = document.getElementById('npmCategory').value;
    var title = document.getElementById('npmTitle2').value.trim();
    var body  = document.getElementById('npmBody').value.trim();
    if (!title || !body) return;
    var submitBtn = this.querySelector('[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';
    try {
      var res = await fetch('/api/forum/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, title: title, body: body }),
      });
      if (!res.ok) throw new Error(res.status);
      closeModal();
      e.target.reset();
      if (cat === state.cat) { state.page = 1; loadPosts(); }
      loadCounts();
    } catch (_) {
      submitBtn.textContent = 'Error, retry';
    } finally {
      submitBtn.disabled = false;
      if (submitBtn.textContent === 'Posting…') submitBtn.textContent = 'Post';
    }
  });

  /* ── vote ─────────────────────────────────────────────────────────────── */
  document.getElementById('forumPosts').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-vote]');
    if (!btn) return;
    var id   = btn.dataset.id;
    var dir  = btn.dataset.vote;
    try {
      await fetch('/api/forum/posts/' + id + '/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: dir }),
      });
      loadPosts();
    } catch (_) {}
  });

  /* ── category switching ───────────────────────────────────────────────── */
  document.querySelectorAll('.fcat').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var cat = this.dataset.cat;
      if (cat === state.cat) return;
      document.querySelectorAll('.fcat').forEach(function (l) { l.classList.remove('active'); });
      this.classList.add('active');
      state.cat  = cat;
      state.page = 1;
      var m = CAT_META[cat] || {};
      document.getElementById('forumCatTitle').textContent = m.title || cat;
      document.getElementById('forumCatDesc').textContent  = m.desc  || '';
      loadPosts();
    });
  });

  /* ── pagination events ────────────────────────────────────────────────── */
  document.getElementById('forumPagination').addEventListener('click', function (e) {
    var btn = e.target.closest('.fpag-btn');
    if (!btn || btn.disabled) return;
    if (btn.id === 'fpagPrev') { state.page--; loadPosts(); return; }
    if (btn.id === 'fpagNext') { state.page++; loadPosts(); return; }
    if (btn.dataset.pg) { state.page = +btn.dataset.pg; loadPosts(); }
  });

  /* ── sort ─────────────────────────────────────────────────────────────── */
  document.querySelectorAll('.fsort').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (this.dataset.sort === state.sort) return;
      document.querySelectorAll('.fsort').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      state.sort = this.dataset.sort;
      state.page = 1;
      loadPosts();
    });
  });

  /* ── init ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    loadPosts();
    loadCounts();
    loadChangelog();
  });
})();
