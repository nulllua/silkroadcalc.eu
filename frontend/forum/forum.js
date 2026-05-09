(function () {
  'use strict';

  var API = 'https://admin.silkroadcalc.eu';
  var PAGE_SIZE = 15;
  var state = { cat: 'general', page: 1, total: 0, sort: 'new', user: null };

  var CAT_META = {
    general:  { title: 'General Discussion',      desc: 'General chat about routes, strategies, and the game.' },
    feedback: { title: 'Feedback & Suggestions',  desc: 'Share ideas and suggestions for improving SilkRoadCalc.' },
    bugs:     { title: 'Bug Reports',             desc: 'Report issues or unexpected behaviour.' },
  };

  var PINNED_POST = {
    id: 'pinned',
    title: 'Forum Rules & Guidelines',
    author_name: 'SilkRoadCalc',
    created_at: '2025-01-01T00:00:00Z',
    body: 'Welcome to the SilkRoadCalc community forum.\n\nWHAT THIS FORUM IS FOR\n\nGeneral Discussion: Routes, trading strategies, game tips, and anything related to Silk Road Trading Simulator.\nFeedback & Suggestions: Ideas for new features, improvements to the calculator, or changes to the website.\nBug Reports: Issues, broken features, or unexpected behavior. Include steps to reproduce.\n\nRULES\n\n1. Be respectful. No harassment or hostility toward other users.\n2. Post in the correct category. Off-topic posts may be removed.\n3. Search before posting to avoid duplicate threads.\n4. For bug reports: describe the steps to reproduce the issue, what you expected, and what actually happened.\n5. No spam, self-promotion, or unrelated content.\n6. Keep posts in English so the whole community can participate.\n\nFor real-time discussion and direct access to the team, join the Discord server linked in the sidebar.',
    upvotes: 0, downvotes: 0, reply_count: 0, pinned: true,
  };

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function relTime(iso) {
    var d = new Date(iso), now = Date.now(), diff = (now - d) / 1000;
    if (isNaN(diff) || diff < 0) return '';
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
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

  function avatar(name, size) {
    size = size || 36;
    var fs = Math.round(size * 0.4);
    return '<div class="fpost-avatar" style="background:' + avatarColor(name) + ';width:' + size + 'px;height:' + size + 'px;font-size:' + fs + 'px;flex-shrink:0">' + esc(name.charAt(0).toUpperCase()) + '</div>';
  }

  /* ── user ─────────────────────────────────────────────────────────────── */
  async function loadUser() {
    try {
      var res  = await fetch(API + '/api/auth/me', { credentials: 'include' });
      var data = res.ok ? await res.json() : {};
      state.user = data.username ? data : null;
    } catch (_) {}
    applyUserUI();
  }

  function applyUserUI() {
    var isAdmin = state.user && state.user.isAdmin;
    document.querySelectorAll('.fcat[data-cat="feedback"], .fcat[data-cat="bugs"]').forEach(function (el) {
      el.style.display = isAdmin ? '' : 'none';
    });
  }

  /* ── post list ────────────────────────────────────────────────────────── */
  async function loadPosts() {
    var container = document.getElementById('forumPosts');
    var pagEl     = document.getElementById('forumPagination');
    container.innerHTML = '<div class="fposts-loading">Loading posts…</div>';
    pagEl.innerHTML = '';
    try {
      var res = await fetch(
        API + '/api/forum/posts?category=' + state.cat + '&page=' + state.page + '&limit=' + PAGE_SIZE + '&sort=' + state.sort,
        { credentials: 'include' }
      );
      if (res.status === 403) { container.innerHTML = '<div class="fposts-empty">This category is private.</div>'; return; }
      if (!res.ok) throw new Error(res.status);
      var data = await res.json();
      state.total = data.total || 0;
      renderPosts(data.posts || [], container);
      renderPagination(pagEl);
    } catch (_) {
      container.innerHTML = '<div class="fposts-empty">Failed to load posts. Try again later.</div>';
    }
  }

  function renderPinnedRow() {
    return '<div class="fpost fpost-pinned fpost-clickable" data-id="pinned">' +
      avatar('SilkRoadCalc', 36) +
      '<div class="fpost-body">' +
        '<div class="fpost-title"><span class="fpost-pin-badge">PINNED</span>' + esc('Forum Rules & Guidelines') + '</div>' +
        '<div class="fpost-meta"><span class="fpost-author">SilkRoadCalc</span><span class="fpost-sep">·</span><span class="fpost-time">Always here</span></div>' +
      '</div>' +
      '<div class="fpost-stats"></div>' +
    '</div>';
  }

  function renderPosts(posts, container) {
    var pinned = state.cat === 'general' ? renderPinnedRow() : '';
    if (!posts.length) { container.innerHTML = pinned + '<div class="fposts-empty">No posts yet. Be the first to post!</div>'; return; }
    container.innerHTML = pinned + posts.map(function (p) {
      var score  = (p.upvotes || 0) - (p.downvotes || 0);
      var author = p.author_name || 'Anonymous';
      return '<div class="fpost fpost-clickable" data-id="' + esc(p.id) + '">' +
        avatar(author, 36) +
        '<div class="fpost-body">' +
          '<div class="fpost-title">' + esc(p.title) + '</div>' +
          '<div class="fpost-meta">' +
            '<span class="fpost-author">' + esc(author) + '</span>' +
            '<span class="fpost-sep">·</span>' +
            '<span class="fpost-time">' + relTime(p.created_at) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="fpost-stats">' +
          '<div class="fpost-vote">' +
            '<button class="fpost-vote-btn" data-vote="up" data-id="' + esc(p.id) + '" aria-label="Upvote"><svg viewBox="0 0 12 8" width="9" height="7" fill="currentColor"><path d="M6 0L12 8H0z"/></svg></button>' +
            '<span class="fpost-score' + (score > 0 ? ' positive' : score < 0 ? ' negative' : '') + '">' + score + '</span>' +
            '<button class="fpost-vote-btn" data-vote="down" data-id="' + esc(p.id) + '" aria-label="Downvote"><svg viewBox="0 0 12 8" width="9" height="7" fill="currentColor"><path d="M6 8L0 0H12z"/></svg></button>' +
          '</div>' +
          '<div class="fpost-replies"><svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 8c0 3.3-2.7 6-6 6a5.9 5.9 0 0 1-3.6-1.2L1 14l1.2-3.4A5.9 5.9 0 0 1 2 8c0-3.3 2.7-6 6-6s6 2.7 6 6z"/></svg>' + (p.reply_count || 0) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderPagination(el) {
    var pages = Math.ceil(state.total / PAGE_SIZE);
    if (pages <= 1) return;
    var html = '<button class="fpag-btn" id="fpagPrev"' + (state.page === 1 ? ' disabled' : '') + '>‹</button>';
    for (var i = 1; i <= pages; i++)
      html += '<button class="fpag-btn' + (i === state.page ? ' active' : '') + '" data-pg="' + i + '">' + i + '</button>';
    html += '<button class="fpag-btn" id="fpagNext"' + (state.page === pages ? ' disabled' : '') + '>›</button>';
    el.innerHTML = html;
  }

  /* ── post detail ──────────────────────────────────────────────────────── */
  function showPostList() {
    document.getElementById('forumPostList').hidden = false;
    document.getElementById('postDetailPanel').hidden = true;
    document.querySelector('.forum-layout').classList.remove('pdp-open');
  }

  async function showPost(id) {
    if (id === 'pinned') {
      document.getElementById('forumPostList').hidden = true;
      document.querySelector('.forum-layout').classList.add('pdp-open');
      var panel = document.getElementById('postDetailPanel');
      panel.hidden = false;
      renderPostDetail(panel, PINNED_POST, []);
      return;
    }
    document.getElementById('forumPostList').hidden = true;
    document.querySelector('.forum-layout').classList.add('pdp-open');
    var panel = document.getElementById('postDetailPanel');
    panel.hidden = false;
    panel.innerHTML = '<div class="fposts-loading">Loading…</div>';
    try {
      var [postRes, commRes] = await Promise.all([
        fetch(API + '/api/forum/posts/' + id, { credentials: 'include' }),
        fetch(API + '/api/forum/posts/' + id + '/comments', { credentials: 'include' }),
      ]);
      if (!postRes.ok) throw new Error();
      var post     = await postRes.json();
      var comments = commRes.ok ? await commRes.json() : [];
      renderPostDetail(panel, post, comments);
    } catch (_) {
      panel.innerHTML = '<div class="fposts-empty">Failed to load post.</div><button class="btn btn-ghost pdp-back" id="pdpBack">← Back</button>';
      document.getElementById('pdpBack').addEventListener('click', function () { showPostList(); });
    }
  }

  function renderPostDetail(panel, post, comments) {
    var author   = post.author_name || 'SilkRoadCalc';
    var canDel   = !post.pinned && state.user && (String(state.user.id) === String(post.author_id) || state.user.isAdmin);
    panel.innerHTML =
      '<div class="pdp-content-wrap">' +
      '<div class="pdp-back-row">' +
        '<button class="btn btn-ghost pdp-back" id="pdpBack">← Back</button>' +
        (canDel ? '<button class="btn pdp-del-btn" id="pdpDeletePost">Delete Post</button>' : '') +
      '</div>' +
      '<div class="pdp-post card">' +
        '<div class="pdp-author-row">' + avatar(author, 30) +
          '<span class="fpost-author">' + esc(author) + '</span>' +
          '<span class="fpost-sep">·</span>' +
          '<span class="fpost-time">' + relTime(post.created_at) + '</span>' +
        '</div>' +
        '<h2 class="pdp-title">' + esc(post.title) + '</h2>' +
        '<div class="pdp-body">' + esc(post.body).replace(/\n/g,'<br>') + '</div>' +
      '</div>' +
      '<div class="pdp-comments-section">' +
        (post.pinned
          ? '<div class="pdp-comments-disabled">Comments are disabled for this post.</div>'
          : '<div class="pdp-comments-title">Comments (<span id="pdpCommentCount">' + comments.length + '</span>)</div>' +
            '<div id="pdpCommentsList">' + renderComments(comments) + '</div>' +
            renderCommentForm(post.id)
        ) +
      '</div>' +
      '</div>';

    document.getElementById('pdpBack').addEventListener('click', function () { showPostList(); loadPosts(); });

    if (canDel) {
      document.getElementById('pdpDeletePost').addEventListener('click', async function () {
        if (!confirm('Delete this post and all its comments?')) return;
        try {
          await fetch(API + '/api/forum/posts/' + post.id, { method: 'DELETE', credentials: 'include' });
          showPostList(); loadPosts(); loadCounts();
        } catch (_) {}
      });
    }

    var commentForm = document.getElementById('pdpCommentForm');
    if (commentForm) {
      commentForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var ta  = document.getElementById('pdpCommentText');
        var btn = document.getElementById('pdpCommentSubmit');
        var body = ta.value.trim();
        if (!body) return;
        btn.disabled = true; btn.textContent = 'Posting…';
        try {
          var res = await fetch(API + '/api/forum/posts/' + post.id + '/comments', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: body }),
          });
          if (!res.ok) throw new Error();
          ta.value = '';
          var cr = await fetch(API + '/api/forum/posts/' + post.id + '/comments', { credentials: 'include' });
          var updated = cr.ok ? await cr.json() : [];
          document.getElementById('pdpCommentsList').innerHTML = renderComments(updated, post.id);
          document.getElementById('pdpCommentCount').textContent = updated.length;
          btn.textContent = 'Post';
        } catch (_) {
          btn.textContent = 'Error';
          setTimeout(function () { btn.textContent = 'Post'; btn.disabled = false; }, 2000);
          return;
        }
        btn.disabled = false;
      });
    }

    panel.addEventListener('click', async function (e) {
      var delBtn = e.target.closest('[data-del-comment]');
      if (!delBtn) return;
      if (!confirm('Delete this comment?')) return;
      try {
        await fetch(API + '/api/forum/comments/' + delBtn.dataset.delComment, { method: 'DELETE', credentials: 'include' });
        var cr = await fetch(API + '/api/forum/posts/' + post.id + '/comments', { credentials: 'include' });
        var updated = cr.ok ? await cr.json() : [];
        document.getElementById('pdpCommentsList').innerHTML = renderComments(updated, post.id);
        document.getElementById('pdpCommentCount').textContent = updated.length;
      } catch (_) {}
    });
  }

  function renderComments(comments) {
    if (!comments.length) return '<div class="pdp-no-comments">No comments yet.</div>';
    return comments.map(function (c) {
      var author = c.author_name || 'Anonymous';
      var canDel = state.user && (String(state.user.id) === String(c.author_id) || state.user.isAdmin);
      return '<div class="pdp-comment">' +
        '<div class="pdp-comment-header">' + avatar(author, 24) +
          '<span class="fpost-author">' + esc(author) + '</span>' +
          '<span class="fpost-time">' + relTime(c.created_at) + '</span>' +
          (canDel ? '<button class="pdp-comment-del" data-del-comment="' + esc(c.id) + '" title="Delete">✕</button>' : '') +
        '</div>' +
        '<div class="pdp-comment-body">' + esc(c.body).replace(/\n/g,'<br>') + '</div>' +
      '</div>';
    }).join('');
  }

  function renderCommentForm() {
    if (!state.user) return '<div class="pdp-comment-login"><a href="https://admin.silkroadcalc.eu/api/auth/discord" class="btn btn-primary">Login with Discord to comment</a></div>';
    return '<form id="pdpCommentForm" class="pdp-comment-form">' +
      '<textarea id="pdpCommentText" placeholder="Write a comment…" rows="3" required></textarea>' +
      '<button type="submit" id="pdpCommentSubmit" class="btn btn-primary">Post</button>' +
    '</form>';
  }

  /* ── category counts ──────────────────────────────────────────────────── */
  async function loadCounts() {
    try {
      var res  = await fetch(API + '/api/forum/counts', { credentials: 'include' });
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
      var res  = await fetch(API + '/api/changelog');
      if (!res.ok) return;
      var data = await res.json();
      var entries = (data.entries || data).slice(0, 4);
      el.innerHTML = entries.map(function (e) {
        return '<div class="frc-entry"><div class="frc-entry-ver">' + esc(e.version || '') + '</div><div class="frc-entry-text">' + esc(e.title || e.text || '') + '</div></div>';
      }).join('');
    } catch (_) { el.innerHTML = ''; }
  }

  /* ── new post modal ───────────────────────────────────────────────────── */
  var modal     = document.getElementById('newPostModal');
  var loginGate = document.getElementById('npmLoginGate');
  var formBody  = document.getElementById('npmFormBody');

  async function openModal() {
    modal.hidden = false;
    if (state.user) {
      loginGate.style.display = 'none';
      formBody.style.display  = '';
      var catSel = document.getElementById('npmCategory');
      if (catSel) catSel.value = state.cat;
    } else {
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
    submitBtn.disabled = true; submitBtn.textContent = 'Posting…';
    try {
      var res = await fetch(API + '/api/forum/posts', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, title: title, body: body }),
      });
      if (!res.ok) throw new Error(res.status);
      closeModal(); e.target.reset();
      if (cat === state.cat) { state.page = 1; loadPosts(); }
      loadCounts();
    } catch (_) { submitBtn.textContent = 'Error, retry'; }
    finally {
      submitBtn.disabled = false;
      if (submitBtn.textContent === 'Posting…') submitBtn.textContent = 'Post';
    }
  });

  /* ── votes + post click ───────────────────────────────────────────────── */
  document.getElementById('forumPosts').addEventListener('click', async function (e) {
    var voteBtn = e.target.closest('[data-vote]');
    if (voteBtn) {
      e.stopPropagation();
      try {
        await fetch(API + '/api/forum/posts/' + voteBtn.dataset.id + '/vote', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: voteBtn.dataset.vote }),
        });
        loadPosts();
      } catch (_) {}
      return;
    }
    var postEl = e.target.closest('.fpost[data-id]');
    if (postEl) showPost(postEl.dataset.id);
  });

  /* ── category switching ───────────────────────────────────────────────── */
  document.querySelectorAll('.fcat').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var cat = this.dataset.cat;
      if (cat === state.cat) return;
      document.querySelectorAll('.fcat').forEach(function (l) { l.classList.remove('active'); });
      this.classList.add('active');
      state.cat = cat; state.page = 1;
      var m = CAT_META[cat] || {};
      document.getElementById('forumCatTitle').textContent = m.title || cat;
      document.getElementById('forumCatDesc').textContent  = m.desc  || '';
      showPostList(); loadPosts();
    });
  });

  /* ── pagination ───────────────────────────────────────────────────────── */
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
      state.sort = this.dataset.sort; state.page = 1; loadPosts();
    });
  });

  /* ── init ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    loadUser().then(function () { loadPosts(); loadCounts(); loadChangelog(); });
  });
})();
