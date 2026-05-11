(function () {
  'use strict';

  var API = 'https://admin.silkroadcalc.eu';
  var PAGE_SIZE = 15;
  var state = { cat: 'general', page: 1, total: 0, sort: 'new', search: '', activitySort: 'new', user: null };

  var CAT_META = {
    general:  { title: 'General Discussion',      desc: 'General chat about routes, strategies, and the game.' },
    feedback: { title: 'Feedback & Suggestions',  desc: 'Share ideas and suggestions for improving SilkRoadCalc.' },
    bugs:     { title: 'Bug Reports',             desc: 'Report issues or unexpected behaviour.' },
  };

  var PINNED_POST = {
    id: 'pinned',
    title: 'Forum Rules & Guidelines',
    author_name: 'silkroadcalc.eu',
    author_id: 'site',
    created_at: '2025-01-01T00:00:00Z',
    body: 'Welcome to the SilkRoadCalc community forum.\n\nWHAT THIS FORUM IS FOR\n\nGeneral Discussion: Routes, trading strategies, game tips, and anything related to Silk Road Trading Simulator.\nFeedback & Suggestions: Ideas for new features, improvements to the calculator, or changes to the website.\nBug Reports: Issues, broken features, or unexpected behavior. Include steps to reproduce.\n\nRULES\n\n1. Be respectful. No harassment or hostility toward other users.\n2. Post in the correct category. Off-topic posts may be removed.\n3. Search before posting to avoid duplicate threads.\n4. For bug reports: describe the steps to reproduce the issue, what you expected, and what actually happened.\n5. No spam, self-promotion, or unrelated content.\n6. Keep posts in English so the whole community can participate.\n\nFor real-time discussion and direct access to the team, join the Discord server linked in the sidebar.',
    upvotes: 0, downvotes: 0, reply_count: 0, pinned: true,
  };

  var MUTED_KEY      = 'srtc-forum-muted';
  var FOLLOWED_KEY   = 'srtc-forum-followed';
  var LAST_SEEN_KEY  = 'srtc-forum-last-seen';
  var LAST_CMT_KEY   = 'srtc-forum-last-comment';
  var LAST_SCORE_KEY = 'srtc-forum-last-score';
  var _pollTimer     = null;
  var NOTIF_ICON     = '/frontend/assets/images/favicon-32.png';

  function getMuted()    { try { return JSON.parse(localStorage.getItem(MUTED_KEY)    || '[]'); } catch(_) { return []; } }
  function getFollowed() { try { return JSON.parse(localStorage.getItem(FOLLOWED_KEY) || '[]'); } catch(_) { return []; } }
  function getLastCmt()  { try { return JSON.parse(localStorage.getItem(LAST_CMT_KEY) || '{}'); } catch(_) { return {}; } }
  function getLastScore(){ try { return JSON.parse(localStorage.getItem(LAST_SCORE_KEY)|| '{}'); } catch(_) { return {}; } }

  function isMuted(id)    { return getMuted().some(function(x)    { return x === String(id); }); }
  function isFollowed(id) { return getFollowed().some(function(x) { return x.id === String(id); }); }

  function toggleMuted(id) {
    var m = getMuted(), s = String(id), idx = m.indexOf(s);
    if (idx >= 0) m.splice(idx, 1); else m.push(s);
    localStorage.setItem(MUTED_KEY, JSON.stringify(m));
  }

  function toggleFollowed(id, title) {
    var list = getFollowed(), s = String(id);
    var idx = list.findIndex(function(x) { return x.id === s; });
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push({ id: s, title: title });
      var lc = getLastCmt();
      if (!lc[s]) { lc[s] = new Date().toISOString(); localStorage.setItem(LAST_CMT_KEY, JSON.stringify(lc)); }
    }
    localStorage.setItem(FOLLOWED_KEY, JSON.stringify(list));
  }

  async function pollNewPosts() {
    if (localStorage.getItem('silkroad_notif_forum') !== '1') return;
    if (Notification.permission !== 'granted') return;
    var lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeen) { localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString()); return; }
    var newest = lastSeen;
    try {
      var cats = ['general', 'feedback', 'bugs'];
      for (var ci = 0; ci < cats.length; ci++) {
        var res = await fetch(API + '/api/forum/posts?category=' + cats[ci] + '&page=1&limit=10&sort=new', { credentials: 'include' });
        if (!res.ok) continue;
        var posts = (await res.json()).posts || [];
        for (var i = 0; i < posts.length; i++) {
          var p = posts[i];
          if (p.created_at <= lastSeen) break;
          if (state.user && String(p.author_id) === String(state.user.id)) continue;
          new Notification('New forum post', { body: p.title, icon: NOTIF_ICON });
          if (p.created_at > newest) newest = p.created_at;
        }
      }
      if (newest !== lastSeen) localStorage.setItem(LAST_SEEN_KEY, newest);
    } catch(_) {}
  }

  async function pollFollowedPosts() {
    if (Notification.permission !== 'granted') return;
    var followed = getFollowed();
    if (!followed.length) return;
    var muted = getMuted();
    var lastCmt   = getLastCmt();
    var lastScore = getLastScore();
    var cmtChanged = false, scoreChanged = false;
    for (var i = 0; i < followed.length; i++) {
      var item = followed[i], pid = item.id;
      if (!muted.includes(pid)) {
        try {
          var cr = await fetch(API + '/api/forum/posts/' + pid + '/comments', { credentials: 'include' });
          if (cr.ok) {
            var comments = await cr.json();
            var lastSeen = lastCmt[pid] || '';
            var newOnes  = comments.filter(function(c) {
              return c.created_at > lastSeen && (!state.user || String(c.author_id) !== String(state.user.id));
            });
            if (newOnes.length) {
              var preview = newOnes[newOnes.length - 1].body.replace(/\n/g, ' ').substring(0, 100);
              new Notification('New comment on "' + item.title + '"', { body: preview, icon: NOTIF_ICON });
            }
            if (comments.length) {
              lastCmt[pid] = comments.reduce(function(mx, c) { return c.created_at > mx ? c.created_at : mx; }, '');
              cmtChanged = true;
            }
          }
        } catch(_) {}
      }
      try {
        var pr = await fetch(API + '/api/forum/posts/' + pid, { credentials: 'include' });
        if (pr.ok) {
          var post  = await pr.json();
          var score = (post.upvotes || 0) - (post.downvotes || 0);
          if (lastScore[pid] != null && score !== lastScore[pid])
            new Notification('Vote update on "' + item.title + '"', { body: 'Score: ' + (score >= 0 ? '+' : '') + score, icon: NOTIF_ICON });
          lastScore[pid] = score;
          scoreChanged = true;
        }
      } catch(_) {}
    }
    if (cmtChanged)   localStorage.setItem(LAST_CMT_KEY,    JSON.stringify(lastCmt));
    if (scoreChanged) localStorage.setItem(LAST_SCORE_KEY,  JSON.stringify(lastScore));
  }

  async function pollNotifications() {
    if (localStorage.getItem('silkroad_notif_replies') === '0') return;
    if (!state.user) return;
    if (Notification.permission !== 'granted') return;
    try {
      var res = await fetch(API + '/api/user/notifications', { credentials: 'include' });
      if (!res.ok) return;
      var notifs = await res.json();
      if (!notifs.length) return;
      notifs.forEach(function (n) {
        new Notification(n.title, { body: n.body || '', icon: NOTIF_ICON });
      });
      fetch(API + '/api/user/notifications/read', { method: 'POST', credentials: 'include' });
    } catch(_) {}
  }

  function startPoll() {
    if (_pollTimer) return;
    pollNewPosts(); pollFollowedPosts(); pollNotifications();
    _pollTimer = setInterval(function() { pollNewPosts(); pollFollowedPosts(); pollNotifications(); }, 60000);
  }

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

  function discordAvatarUrl(userId, hash, size) {
    if (String(userId) === '1468949205153480725' || String(userId) === 'site') return '/frontend/assets/images/icon.png';
    if (!userId || !hash) return null;
    return 'https://cdn.discordapp.com/avatars/' + userId + '/' + hash + '.png?size=' + (size || 64);
  }

  function avatar(name, size, userId, avatarHash) {
    size = size || 36;
    var url = discordAvatarUrl(userId, avatarHash, size * 2);
    if (url)
      return '<img class="fpost-avatar fpost-avatar-img" src="' + url + '" width="' + size + '" height="' + size + '" alt="' + esc(name) + '" style="width:' + size + 'px;height:' + size + 'px" onerror="this.outerHTML=this.dataset.fb" data-fb=\'<div class=&quot;fpost-avatar&quot; style=&quot;background:' + avatarColor(name) + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size*0.4) + 'px;flex-shrink:0&quot;>' + esc(name.charAt(0).toUpperCase()) + '</div>\'>';
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
    var loggedIn = !!state.user;
    document.querySelectorAll('.fcat[data-cat="feedback"], .fcat[data-cat="bugs"]').forEach(function (el) {
      el.style.display = loggedIn ? '' : 'none';
    });
  }

  /* ── post list ────────────────────────────────────────────────────────── */
  async function loadPosts() {
    var container = document.getElementById('forumPosts');
    var pagEl     = document.getElementById('forumPagination');
    container.innerHTML = '<div class="fposts-loading">Loading posts…</div>';
    pagEl.innerHTML = '';
    try {
      var url = API + '/api/forum/posts?category=' + state.cat + '&page=' + state.page + '&limit=' + PAGE_SIZE + '&sort=' + state.sort;
      if (state.search) url += '&q=' + encodeURIComponent(state.search);
      var res = await fetch(url, { credentials: 'include' });
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
      avatar('silkroadcalc.eu', 36, 'site', null) +
      '<div class="fpost-body">' +
        '<div class="fpost-title"><span class="fpost-pin-badge">PINNED</span>' + esc('Forum Rules & Guidelines') + '</div>' +
        '<div class="fpost-meta"><span class="fpost-author">silkroadcalc.eu</span><span class="fpost-sep">·</span><span class="fpost-time">Always here</span></div>' +
      '</div>' +
      '<div class="fpost-stats"></div>' +
    '</div>';
  }

  function renderPosts(posts, container) {
    var pinned = state.cat === 'general' && !state.search ? renderPinnedRow() : '';
    if (!posts.length) {
      var msg = state.search
        ? 'No posts found for <b>' + esc(state.search) + '</b>.'
        : 'No posts yet. Be the first to post!';
      container.innerHTML = pinned + '<div class="fposts-empty">' + msg + '</div>';
      return;
    }
    var muted = getMuted();
    container.innerHTML = pinned + posts.map(function (p) {
      var score      = (p.upvotes || 0) - (p.downvotes || 0);
      var author     = p.author_name || 'Anonymous';
      var pid        = esc(p.id);
      var mutedNow   = isMuted(p.id);
      var followedNow= isFollowed(p.id);
      return '<div class="fpost fpost-clickable" data-id="' + pid + '">' +
        avatar(author, 36, p.author_id, p.author_avatar) +
        '<div class="fpost-body">' +
          '<div class="fpost-title">' + esc(p.title) + '</div>' +
          '<div class="fpost-meta">' +
            '<span class="fpost-author">' + esc(author) + '</span>' +
            '<span class="fpost-sep">·</span>' +
            '<span class="fpost-time">' + relTime(p.created_at) + '</span>' +
            (followedNow ? '<span class="fpost-followed-badge">Following</span>' : '') +
            (mutedNow   ? '<span class="fpost-muted-badge">Muted</span>'     : '') +
          '</div>' +
        '</div>' +
        '<div class="fpost-stats">' +
          '<div class="fpost-vote">' +
            '<button class="fpost-vote-btn" data-vote="up" data-id="' + pid + '" aria-label="Upvote"><svg viewBox="0 0 12 8" width="9" height="7" fill="currentColor"><path d="M6 0L12 8H0z"/></svg></button>' +
            '<span class="fpost-score' + (score > 0 ? ' positive' : score < 0 ? ' negative' : '') + '">' + score + '</span>' +
            '<button class="fpost-vote-btn" data-vote="down" data-id="' + pid + '" aria-label="Downvote"><svg viewBox="0 0 12 8" width="9" height="7" fill="currentColor"><path d="M6 8L0 0H12z"/></svg></button>' +
          '</div>' +
          '<div class="fpost-replies"><svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 8c0 3.3-2.7 6-6 6a5.9 5.9 0 0 1-3.6-1.2L1 14l1.2-3.4A5.9 5.9 0 0 1 2 8c0-3.3 2.7-6 6-6s6 2.7 6 6z"/></svg>' + (p.reply_count || 0) + '</div>' +
          '<div class="fpost-menu-wrap">' +
            '<button class="fpost-menu-btn" data-menu-id="' + pid + '" aria-label="Post options">⋮</button>' +
            '<div class="fpost-menu-dd" hidden>' +
              '<button class="fpost-menu-item" data-follow-id="' + pid + '" data-follow-title="' + esc(p.title) + '">' + (followedNow ? 'Unfollow post' : 'Follow post') + '</button>' +
              '<button class="fpost-menu-item" data-mute-id="' + pid + '">' + (mutedNow ? 'Unmute' : 'Mute') + ' notifications</button>' +
            '</div>' +
          '</div>' +
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
    var author   = post.author_name || 'silkroadcalc.eu';
    var canDel   = !post.pinned && state.user && (String(state.user.id) === String(post.author_id) || state.user.isAdmin);
    panel.innerHTML =
      '<div class="pdp-content-wrap">' +
      '<div class="pdp-back-row">' +
        '<button class="btn btn-ghost pdp-back" id="pdpBack">← Back</button>' +
        (canDel ? '<button class="btn pdp-del-btn" id="pdpDeletePost">Delete Post</button>' : '') +
      '</div>' +
      '<div class="pdp-post card">' +
        '<div class="pdp-author-row">' + avatar(author, 30, post.author_id, post.author_avatar) +
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
      var replyBtn = e.target.closest('[data-reply-name]');
      if (replyBtn) {
        var ta = document.getElementById('pdpCommentText');
        if (!ta) return;
        ta.value = '@' + replyBtn.dataset.replyName + ' ';
        ta.focus();
        ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
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
        '<div class="pdp-comment-header">' + avatar(author, 24, c.author_id, c.author_avatar) +
          '<span class="fpost-author">' + esc(author) + '</span>' +
          '<span class="fpost-time">' + relTime(c.created_at) + '</span>' +
          '<div class="pdp-comment-actions">' +
            (state.user ? '<button class="pdp-comment-reply" data-reply-name="' + esc(author) + '">Reply</button>' : '') +
            (canDel ? '<button class="pdp-comment-del" data-del-comment="' + esc(c.id) + '" title="Delete">✕</button>' : '') +
          '</div>' +
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

  /* ── recent activity sidebar ─────────────────────────────────────────── */
  async function loadRecentActivity() {
    var el = document.getElementById('forumActivity');
    if (!el) return;
    el.innerHTML = '<div class="frc-loading">Loading…</div>';
    try {
      var res  = await fetch(API + '/api/forum/posts?category=general&page=1&limit=6&sort=' + state.activitySort);
      if (!res.ok) return;
      var posts = (await res.json()).posts || [];
      if (!posts.length) { el.innerHTML = '<div class="fra-empty">No posts yet.</div>'; return; }
      el.innerHTML = posts.map(function (p) {
        return '<div class="fra-item" data-id="' + esc(p.id) + '">' +
          '<div class="fra-item-title">' + esc(p.title) + '</div>' +
          '<div class="fra-item-meta">' +
            '<span class="fpost-author">' + esc(p.author_name || 'Anonymous') + '</span>' +
            '<span class="fpost-sep">·</span>' +
            '<span class="fpost-time">' + relTime(p.created_at) + '</span>' +
          '</div>' +
        '</div>';
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
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.fpost-menu-wrap'))
      document.querySelectorAll('.fpost-menu-dd:not([hidden])').forEach(function (d) { d.hidden = true; });
  });

  document.getElementById('forumPosts').addEventListener('click', async function (e) {
    var menuBtn = e.target.closest('[data-menu-id]');
    if (menuBtn) {
      e.stopPropagation();
      var dd = menuBtn.nextElementSibling;
      document.querySelectorAll('.fpost-menu-dd:not([hidden])').forEach(function (d) { if (d !== dd) d.hidden = true; });
      dd.hidden = !dd.hidden;
      return;
    }
    var followBtn = e.target.closest('[data-follow-id]');
    if (followBtn) {
      e.stopPropagation();
      toggleFollowed(followBtn.dataset.followId, followBtn.dataset.followTitle);
      followBtn.textContent = isFollowed(followBtn.dataset.followId) ? 'Unfollow post' : 'Follow post';
      followBtn.closest('.fpost-menu-dd').hidden = true;
      var postEl2 = document.querySelector('.fpost[data-id="' + followBtn.dataset.followId + '"]');
      var badge = postEl2 && postEl2.querySelector('.fpost-followed-badge');
      if (isFollowed(followBtn.dataset.followId)) {
        if (!badge && postEl2) {
          var meta = postEl2.querySelector('.fpost-meta');
          if (meta) { var b = document.createElement('span'); b.className = 'fpost-followed-badge'; b.textContent = 'Following'; meta.appendChild(b); }
        }
      } else if (badge) { badge.remove(); }
      return;
    }
    var muteBtn = e.target.closest('[data-mute-id]');
    if (muteBtn) {
      e.stopPropagation();
      toggleMuted(muteBtn.dataset.muteId);
      var nowMuted = isMuted(muteBtn.dataset.muteId);
      muteBtn.textContent = nowMuted ? 'Unmute notifications' : 'Mute notifications';
      muteBtn.closest('.fpost-menu-dd').hidden = true;
      var postEl3 = document.querySelector('.fpost[data-id="' + muteBtn.dataset.muteId + '"]');
      var mutedBadge = postEl3 && postEl3.querySelector('.fpost-muted-badge');
      if (nowMuted) {
        if (!mutedBadge && postEl3) {
          var meta2 = postEl3.querySelector('.fpost-meta');
          if (meta2) { var b2 = document.createElement('span'); b2.className = 'fpost-muted-badge'; b2.textContent = 'Muted'; meta2.appendChild(b2); }
        }
      } else if (mutedBadge) { mutedBadge.remove(); }
      return;
    }
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
      state.cat = cat; state.page = 1; state.search = '';
      var searchEl = document.getElementById('forumSearch');
      if (searchEl) searchEl.value = '';
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
  var _searchTimer = null;
  document.getElementById('forumSearch').addEventListener('input', function () {
    clearTimeout(_searchTimer);
    var val = this.value.trim();
    _searchTimer = setTimeout(function () {
      state.search = val; state.page = 1; loadPosts();
    }, 400);
  });

  document.querySelectorAll('.fra-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.fra-tab').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      state.activitySort = this.dataset.activity;
      loadRecentActivity();
    });
  });

  document.getElementById('forumActivity').addEventListener('click', function (e) {
    var item = e.target.closest('.fra-item[data-id]');
    if (item) showPost(item.dataset.id);
  });

  document.addEventListener('DOMContentLoaded', function () {
    loadUser().then(function () { loadPosts(); loadCounts(); loadRecentActivity(); startPoll(); });
  });
})();
