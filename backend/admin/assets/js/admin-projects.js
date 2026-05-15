(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────────
  let state        = { projects: [], activeProjectId: null };
  let currentUser  = null;
  let editMode     = false;
  let saveTimer    = null;
  let initialized  = false;

  const STATUS_DOT = { Planning: '#555', Active: '#3dba6f', Paused: '#777', Done: '#333' };
  const STATUSES   = ['Planning', 'Active', 'Paused', 'Done'];

  // ── Entry point ───────────────────────────────────────────────────────────────
  window.loadProjects = async function () {
    if (initialized) return;
    initialized = true;
    injectCSS();
    buildDOM();

    try {
      const meRes = await api('/api/admin/me');
      if (meRes.ok) {
        const me = await meRes.json();
        currentUser = { displayName: me.username, role: me.role };
        const nameEl = document.getElementById('proj-username');
        if (nameEl) nameEl.textContent = me.username;
      }
    } catch {}

    try {
      const r = await api('/api/admin/projects');
      if (r.ok) {
        const d = await r.json();
        state.projects        = (d.projects || []).map(normalizeProject);
        state.activeProjectId = d.activeProjectId || null;
      }
    } catch {}

    render();
    setInterval(syncFromServer, 9000);
  };

  // ── Sync ──────────────────────────────────────────────────────────────────────
  async function syncFromServer() {
    if (saveTimer) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    try {
      const r = await api('/api/admin/projects');
      if (!r.ok) return;
      const d = await r.json();
      state.projects = (d.projects || []).map(normalizeProject);
      renderList();
      if (state.activeProjectId && !state.projects.find(p => p.id === state.activeProjectId)) {
        state.activeProjectId = null;
        showEmpty();
      }
    } catch {}
  }

  // ── Persistence ───────────────────────────────────────────────────────────────
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 600);
  }

  async function persist() {
    saveTimer = null;
    try {
      await api('/api/admin/projects', { method: 'PUT', body: JSON.stringify(state) });
    } catch {}
  }

  function normalizeProject(p) {
    return {
      ...p,
      links:    (p.links    || []).map(l => typeof l === 'string' ? { url: l }  : l),
      comments: (p.comments || []).map(c => typeof c === 'string' ? { text: c } : c),
      todos:    (p.todos    || []),
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function render() {
    renderList();
    const p = activeProject();
    if (p) renderDetail(p); else showEmpty();
  }

  function renderList() {
    const list = gid('proj-list');
    if (!list) return;
    list.innerHTML = '';
    state.projects.forEach(p => {
      const open = (p.todos || []).filter(t => !t.done).length;
      const item = list.appendChild(mk('div', 'proj-item' + (p.id === state.activeProjectId ? ' active' : '')));
      item.onclick = () => selectProject(p.id);

      if (p.icon) {
        const img = item.appendChild(document.createElement('img'));
        img.className = 'proj-pi-img'; img.src = p.icon;
      } else {
        const dot = item.appendChild(mk('div', 'proj-pi-dot'));
        dot.style.background = STATUS_DOT[p.status] || '#555';
      }

      const name = item.appendChild(mk('div', 'proj-pi-name'));
      name.textContent = p.name || 'Untitled';

      if (open > 0) {
        const cnt = item.appendChild(mk('div', 'proj-pi-count'));
        cnt.textContent = open;
      }
    });
  }

  function showEmpty() {
    const e = gid('proj-empty'), d = gid('proj-detail');
    if (e) e.style.display = 'flex';
    if (d) d.style.display = 'none';
  }

  function selectProject(id) {
    if (state.activeProjectId === id) return;
    state.activeProjectId = id;
    editMode = false;
    renderList();
    const p = activeProject();
    if (p) renderDetail(p);
  }

  function isOwner(p) {
    if (!currentUser) return true;
    if (!p.owner)     return true;
    return p.owner === currentUser.displayName;
  }

  function renderDetail(p) {
    const empty  = gid('proj-empty');
    const detail = gid('proj-detail');
    if (!detail) return;
    if (empty) empty.style.display = 'none';
    detail.style.display = 'block';
    detail.innerHTML = '';

    const owner = isOwner(p);

    // ── Header ──
    const hdr = detail.appendChild(mk('div', 'proj-detail-header'));

    if (owner && editMode) {
      const iconWrap = hdr.appendChild(mk('div', 'proj-icon-wrap'));
      const fileIn   = document.createElement('input');
      fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.style.display = 'none';
      fileIn.onchange = async () => {
        const file = fileIn.files[0]; if (!file) return;
        p.icon = await resizeImage(file, 64);
        renderList(); renderDetail(p); scheduleSave();
      };
      iconWrap.appendChild(fileIn);
      if (p.icon) {
        const img    = iconWrap.appendChild(document.createElement('img'));
        img.className = 'proj-detail-img'; img.src = p.icon; img.style.cursor = 'pointer';
        img.onclick  = () => fileIn.click();
        const rmBtn  = iconWrap.appendChild(document.createElement('button'));
        rmBtn.className = 'proj-icon-remove'; rmBtn.textContent = '×';
        rmBtn.onclick = e => { e.stopPropagation(); p.icon = ''; renderList(); renderDetail(p); scheduleSave(); };
      } else {
        const upBtn  = iconWrap.appendChild(document.createElement('button'));
        upBtn.className = 'proj-icon-upload-btn'; upBtn.textContent = '+'; upBtn.type = 'button';
        upBtn.onclick = () => fileIn.click();
      }
      const nameIn = hdr.appendChild(document.createElement('input'));
      nameIn.className = 'proj-detail-name'; nameIn.value = p.name || '';
      nameIn.placeholder = 'Project name';
      nameIn.oninput = () => { p.name = nameIn.value; renderList(); scheduleSave(); };
    } else {
      if (p.icon) {
        const img = hdr.appendChild(document.createElement('img'));
        img.className = 'proj-detail-img'; img.src = p.icon;
      }
      hdr.appendChild(mk('div', 'proj-view-name')).textContent = p.name || 'Untitled';
    }

    const hr = hdr.appendChild(mk('div', 'proj-header-right'));

    if (owner && editMode) {
      const sel = hr.appendChild(document.createElement('select'));
      sel.className = 'proj-status-sel';
      STATUSES.forEach(s => {
        const o = sel.appendChild(document.createElement('option'));
        o.value = s; o.textContent = s;
        if (s === p.status) o.selected = true;
      });
      sel.onchange = () => { p.status = sel.value; renderList(); scheduleSave(); };

      const delBtn = hr.appendChild(document.createElement('button'));
      delBtn.className = 'proj-btn-del'; delBtn.textContent = '×'; delBtn.title = 'Delete project';
      delBtn.onclick = () => { if (confirm(`Delete "${p.name || 'this project'}"?`)) deleteProject(p.id); };
    } else {
      hr.appendChild(mk('div', 'proj-status-pill')).textContent = p.status;
    }

    if (owner) {
      const editBtn = hr.appendChild(document.createElement('button'));
      editBtn.className = 'proj-btn-edit' + (editMode ? ' active' : '');
      editBtn.textContent = editMode ? 'Done' : 'Edit';
      editBtn.onclick = () => { editMode = !editMode; renderDetail(p); };
    }

    // ── Notes ──
    if ((owner && editMode) || p.note) {
      const nb = detail.appendChild(mk('div', 'proj-block'));
      nb.appendChild(blockLabel('Notes'));
      if (owner && editMode) {
        const nta = nb.appendChild(document.createElement('textarea'));
        nta.className = 'proj-notes-ta'; nta.value = p.note || ''; nta.placeholder = 'Notes…';
        nta.oninput = () => { p.note = nta.value; scheduleSave(); autoResize(nta); };
        autoResize(nta);
      } else {
        nb.appendChild(mk('div', 'proj-view-text')).textContent = p.note;
      }
      detail.appendChild(divider());
    }

    // ── Links ──
    if ((owner && editMode) || (p.links && p.links.length)) {
      const lb = detail.appendChild(mk('div', 'proj-block'));
      lb.appendChild(blockLabel('Links'));
      const linkWrap = lb.appendChild(mk('div'));
      (p.links || []).forEach((l, i) => linkWrap.appendChild(makeLinkRow(p, l, i, owner && editMode)));
      if (owner && editMode) {
        const linkIn = lb.appendChild(document.createElement('input'));
        linkIn.className = 'proj-add-input'; linkIn.placeholder = 'Add link and press Enter…';
        linkIn.onkeydown = e => {
          if (e.key !== 'Enter') return;
          const v = linkIn.value.trim(); if (!v) return;
          (p.links = p.links || []).push({ url: v, author: currentUser?.displayName });
          linkIn.value = ''; renderDetail(p); scheduleSave();
        };
      }
      detail.appendChild(divider());
    }

    // ── Todos ──
    {
      const tb = detail.appendChild(mk('div', 'proj-block'));
      tb.appendChild(blockLabel('Todos'));
      const todoWrap = tb.appendChild(mk('div'));
      (p.todos || []).forEach((t, i) => todoWrap.appendChild(makeTodoRow(p, t, i, owner && editMode)));
      const tadd = tb.appendChild(mk('div', 'proj-todo-add-row'));
      tadd.appendChild(mk('div', 'proj-todo-add-ghost'));
      const tIn = tadd.appendChild(document.createElement('input'));
      tIn.className = 'proj-add-input'; tIn.placeholder = 'Add todo and press Enter…';
      tIn.style.borderBottom = 'none';
      tIn.onkeydown = e => {
        if (e.key !== 'Enter') return;
        const v = tIn.value.trim(); if (!v) return;
        (p.todos = p.todos || []).push({ id: uid(), text: v, done: false, author: currentUser?.displayName });
        tIn.value = ''; renderDetail(p); scheduleSave();
      };
      detail.appendChild(divider());
    }

    // ── Comments ──
    {
      const cb = detail.appendChild(mk('div', 'proj-block'));
      cb.appendChild(blockLabel('Comments'));
      const cmtWrap = cb.appendChild(mk('div'));
      (p.comments || []).forEach((c, i) => cmtWrap.appendChild(makeCommentItem(p, c, i, owner && editMode)));
      const cta = cb.appendChild(document.createElement('textarea'));
      cta.className = 'proj-comment-add-ta'; cta.placeholder = 'Add comment and press Enter…';
      cta.onkeydown = e => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        const v = cta.value.trim(); if (!v) return;
        (p.comments = p.comments || []).push({ text: v, author: currentUser?.displayName });
        cta.value = ''; renderDetail(p); scheduleSave();
      };
    }
  }

  // ── Row builders ──────────────────────────────────────────────────────────────

  function makeLinkRow(p, link, i, ownerEdit) {
    const wrap = mk('div');
    const row  = wrap.appendChild(mk('div', 'proj-link-row'));
    const a    = row.appendChild(document.createElement('a'));
    a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = link.url;
    if (link.author) { const h = row.appendChild(mk('span', 'proj-author-hint')); h.textContent = link.author; }

    const ghRepo = parseGithubRepo(link.url);
    if (ghRepo) {
      if (!p.commits) p.commits = {};
      const commitLine = wrap.appendChild(mk('div', 'proj-commit-line'));
      renderCommitLine(commitLine, p, ghRepo);
      const rb = row.appendChild(document.createElement('button'));
      rb.className = 'proj-btn-refresh'; rb.textContent = '↻'; rb.title = 'Fetch latest commit';
      rb.onclick = async e => {
        e.preventDefault(); rb.textContent = '…';
        await fetchCommit(p, ghRepo);
        renderCommitLine(commitLine, p, ghRepo);
        rb.textContent = '↻'; scheduleSave();
      };
      if (!p.commits[ghRepo]) fetchCommit(p, ghRepo).then(() => { renderCommitLine(commitLine, p, ghRepo); scheduleSave(); });
    }

    if (ownerEdit) {
      const del = row.appendChild(rowDelBtn());
      del.onclick = () => { p.links.splice(i, 1); renderDetail(p); scheduleSave(); };
    }
    return wrap;
  }

  function makeTodoRow(p, t, i, ownerEdit) {
    const row = mk('div', 'proj-todo-row');
    const cb  = row.appendChild(document.createElement('input'));
    cb.type = 'checkbox'; cb.className = 'proj-todo-cb'; cb.checked = t.done;

    if (ownerEdit) {
      const txt = row.appendChild(document.createElement('input'));
      txt.type = 'text';
      txt.className = 'proj-todo-text' + (t.done ? ' done' : '');
      txt.value = t.text;
      txt.oninput = () => { t.text = txt.value; scheduleSave(); };
      cb.onchange  = () => { t.done = cb.checked; txt.className = 'proj-todo-text' + (t.done ? ' done' : ''); renderList(); scheduleSave(); };
    } else {
      const lbl_ = row.appendChild(mk('span', 'proj-todo-label' + (t.done ? ' done' : '')));
      lbl_.textContent = t.text;
      cb.onchange = () => { t.done = cb.checked; lbl_.className = 'proj-todo-label' + (t.done ? ' done' : ''); renderList(); scheduleSave(); };
      if (t.author) { const h = row.appendChild(mk('span', 'proj-author-hint')); h.textContent = t.author; }
    }

    const del = row.appendChild(rowDelBtn());
    del.onclick = () => { p.todos.splice(i, 1); renderDetail(p); scheduleSave(); };
    return row;
  }

  function makeCommentItem(p, comment, i, ownerEdit) {
    const item = mk('div', 'proj-comment-item');
    const ta   = item.appendChild(document.createElement('textarea'));
    ta.className = 'proj-comment-ta'; ta.value = comment.text || ''; autoResize(ta);
    if (ownerEdit) {
      ta.oninput = () => { comment.text = ta.value; scheduleSave(); autoResize(ta); };
    } else {
      ta.readOnly = true;
      if (comment.author) { const h = item.appendChild(mk('span', 'proj-author-hint')); h.textContent = comment.author; }
    }
    const del = item.appendChild(rowDelBtn());
    del.onclick = () => { p.comments.splice(i, 1); renderDetail(p); scheduleSave(); };
    return item;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  function newProject() {
    const p = { id: uid(), name: '', status: 'Planning', note: '', links: [], todos: [], comments: [], icon: '', owner: currentUser?.displayName || null };
    state.projects.unshift(p);
    state.activeProjectId = p.id;
    editMode = true;
    render();
    setTimeout(() => { const n = document.querySelector('.proj-detail-name'); if (n) n.focus(); }, 30);
    scheduleSave();
  }

  function deleteProject(id) {
    state.projects = state.projects.filter(p => p.id !== id);
    state.activeProjectId = null;
    render(); scheduleSave();
  }

  // ── GitHub ────────────────────────────────────────────────────────────────────

  function parseGithubRepo(url) {
    try {
      const u     = new URL(url);
      if (u.hostname !== 'github.com') return null;
      const parts = u.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
      if (parts.length < 2) return null;
      return `${parts[0]}/${parts[1]}`;
    } catch { return null; }
  }

  async function fetchCommit(p, repo) {
    try {
      const r = await api(`/api/github/latest?repo=${encodeURIComponent(repo)}`);
      if (!r.ok) return;
      p.commits[repo] = await r.json();
    } catch {}
  }

  function renderCommitLine(el_, p, repo) {
    el_.innerHTML = '';
    const c = p.commits?.[repo]; if (!c) return;
    const sha  = mk('span', 'proj-commit-sha');  sha.textContent  = c.sha;
    const msg  = mk('span', 'proj-commit-msg');  msg.textContent  = c.message;
    const auth = mk('span', 'proj-commit-auth'); auth.textContent = c.author;
    el_.appendChild(sha); el_.appendChild(msg); el_.appendChild(auth);
  }

  // ── DOM setup ─────────────────────────────────────────────────────────────────

  function buildDOM() {
    const panel = gid('panel-projects');
    if (!panel) return;
    panel.innerHTML = `
      <div class="proj-sidebar">
        <div class="proj-sidebar-top">
          <div class="proj-brand">Projects</div>
          <div class="proj-username-line" id="proj-username"></div>
        </div>
        <div class="proj-list" id="proj-list"></div>
        <div class="proj-sidebar-bottom">
          <button class="proj-btn-new" id="proj-new-btn">+ New project</button>
        </div>
      </div>
      <div class="proj-main">
        <div class="proj-empty" id="proj-empty">Select a project or create one</div>
        <div class="proj-detail" id="proj-detail" style="display:none"></div>
      </div>`;

    gid('proj-new-btn').onclick = newProject;

    // Make #main height-constrained so the flex layout fills correctly
    const main = gid('main');
    if (main) { main.style.height = '100vh'; main.style.overflow = 'hidden'; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function activeProject()   { return state.projects.find(p => p.id === state.activeProjectId) || null; }
  function gid(id)           { return document.getElementById(id); }
  function mk(tag, cls)      { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function blockLabel(text)  { const e = mk('div', 'proj-block-label'); e.textContent = text; return e; }
  function divider()         { return mk('hr', 'proj-divider'); }
  function rowDelBtn()       { const b = mk('button', 'proj-row-del'); b.textContent = '×'; return b; }
  function autoResize(el_)   { el_.style.height = 'auto'; el_.style.height = el_.scrollHeight + 'px'; }
  function uid()             { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function resizeImage(file, size) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          const s_  = Math.min(img.width, img.height);
          const ox  = (img.width  - s_) / 2;
          const oy  = (img.height - s_) / 2;
          ctx.drawImage(img, ox, oy, s_, s_, 0, 0, size, size);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── CSS injection ─────────────────────────────────────────────────────────────

  function injectCSS() {
    if (gid('proj-styles')) return;
    const style = document.createElement('style');
    style.id = 'proj-styles';
    style.textContent = `
      /* panel layout override */
      #panel-projects.active {
        display: flex !important;
        padding: 0 !important;
        overflow: hidden;
        flex: 1;
        min-height: 0;
      }

      /* sidebar */
      .proj-sidebar {
        width: 220px;
        min-width: 220px;
        background: #111318;
        border-right: 1px solid #2a2d3a;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .proj-sidebar-top {
        padding: 16px;
        border-bottom: 1px solid #2a2d3a;
        flex-shrink: 0;
      }
      .proj-brand {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .1em;
        text-transform: uppercase;
        color: #f0d080;
      }
      .proj-username-line {
        font-size: 11px;
        color: #555;
        margin-top: 2px;
      }
      .proj-list {
        flex: 1;
        overflow-y: auto;
        padding: 6px 0;
      }
      .proj-list::-webkit-scrollbar { width: 3px; }
      .proj-list::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 2px; }

      .proj-item {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 7px 16px;
        cursor: pointer;
        user-select: none;
        transition: background .1s;
      }
      .proj-item:hover  { background: #1a1c24; }
      .proj-item.active { background: #1e2130; }
      .proj-pi-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .proj-pi-img {
        width: 14px; height: 14px;
        border-radius: 3px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .proj-pi-name {
        flex: 1;
        font-size: 13px;
        color: #888;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .proj-item.active .proj-pi-name { color: #ccc; }
      .proj-pi-count { font-size: 11px; color: #555; }

      .proj-sidebar-bottom {
        padding: 12px 16px;
        border-top: 1px solid #2a2d3a;
        flex-shrink: 0;
      }
      .proj-btn-new {
        width: 100%;
        padding: 8px 12px;
        background: transparent;
        border: 1px solid #2a2d3a;
        border-radius: 4px;
        color: #888;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        text-align: left;
        transition: border-color .1s, color .1s, background .1s;
      }
      .proj-btn-new:hover { border-color: #3a3d4a; color: #ccc; background: #1a1c24; }

      /* main area */
      .proj-main {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .proj-empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #444;
        font-size: 13px;
      }
      .proj-detail {
        flex: 1;
        overflow-y: auto;
        padding: 32px 40px 60px;
      }
      .proj-detail::-webkit-scrollbar { width: 3px; }
      .proj-detail::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 2px; }

      /* detail header */
      .proj-detail-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 28px;
      }
      .proj-view-name {
        flex: 1;
        font-size: 20px;
        font-weight: 600;
        color: #ccc;
        line-height: 1.3;
      }
      .proj-detail-name {
        flex: 1;
        font-size: 20px;
        font-weight: 600;
        color: #ccc;
        background: transparent;
        border: none;
        outline: none;
        font-family: inherit;
        padding: 0;
        caret-color: #888;
      }
      .proj-detail-name::placeholder { color: #444; }

      .proj-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-top: 4px;
        flex-shrink: 0;
      }
      .proj-status-sel {
        background: #1a1c24;
        border: 1px solid #2a2d3a;
        border-radius: 4px;
        color: #888;
        font-size: 12px;
        padding: 4px 8px;
        cursor: pointer;
        outline: none;
        font-family: inherit;
        transition: border-color .1s;
      }
      .proj-status-sel:hover { border-color: #3a3d4a; }
      .proj-status-pill {
        font-size: 11px;
        color: #555;
        padding: 3px 8px;
        border: 1px solid #2a2d3a;
        border-radius: 4px;
      }
      .proj-btn-del {
        background: transparent;
        border: none;
        color: #555;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 3px;
        transition: color .1s;
      }
      .proj-btn-del:hover { color: #f87171; }
      .proj-btn-edit {
        background: transparent;
        border: 1px solid #2a2d3a;
        border-radius: 4px;
        color: #555;
        font-size: 12px;
        padding: 4px 10px;
        cursor: pointer;
        font-family: inherit;
        transition: border-color .1s, color .1s;
      }
      .proj-btn-edit:hover, .proj-btn-edit.active { border-color: #3a3d4a; color: #888; }

      /* icon */
      .proj-icon-wrap { position: relative; flex-shrink: 0; align-self: flex-start; }
      .proj-detail-img {
        width: 36px; height: 36px;
        border-radius: 4px;
        object-fit: cover;
        display: block;
        flex-shrink: 0;
      }
      .proj-icon-upload-btn {
        width: 36px; height: 36px;
        border: 1px dashed #3a3d4a;
        border-radius: 4px;
        background: transparent;
        color: #555;
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-color .1s, color .1s;
      }
      .proj-icon-upload-btn:hover { border-color: #4a4d5a; color: #888; }
      .proj-icon-remove {
        position: absolute; top: -5px; right: -5px;
        background: #1e2130;
        border: 1px solid #3a3d4a;
        border-radius: 50%;
        color: #888; font-size: 10px;
        width: 15px; height: 15px;
        cursor: pointer; display: none;
        align-items: center; justify-content: center;
        line-height: 1;
      }
      .proj-icon-wrap:hover .proj-icon-remove { display: flex; }

      /* blocks */
      .proj-block { margin-bottom: 24px; }
      .proj-block-label {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .09em;
        text-transform: uppercase;
        color: #444;
        margin-bottom: 8px;
      }
      .proj-divider {
        border: none;
        border-top: 1px solid #1e2130;
        margin: 0 0 24px;
      }

      /* notes */
      .proj-notes-ta {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        color: #888;
        font-size: 13px;
        font-family: inherit;
        line-height: 1.75;
        resize: none;
        min-height: 40px;
        caret-color: #ccc;
      }
      .proj-notes-ta::placeholder { color: #444; }
      .proj-notes-ta:focus { color: #ccc; }
      .proj-view-text { font-size: 13px; color: #888; line-height: 1.75; white-space: pre-wrap; }

      /* links */
      .proj-link-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
      }
      .proj-link-row a {
        flex: 1;
        color: #888;
        font-size: 13px;
        text-decoration: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: color .1s;
      }
      .proj-link-row a:hover { color: #ccc; }

      /* author hint */
      .proj-author-hint {
        font-size: 11px;
        color: transparent;
        flex-shrink: 0;
        transition: color .15s;
        pointer-events: none;
      }
      .proj-link-row:hover     .proj-author-hint,
      .proj-todo-row:hover     .proj-author-hint,
      .proj-comment-item:hover .proj-author-hint { color: #444; }

      /* row delete */
      .proj-row-del {
        background: transparent;
        border: none;
        color: transparent;
        cursor: pointer;
        font-size: 14px;
        padding: 0 2px;
        border-radius: 3px;
        transition: color .1s;
        line-height: 1;
      }
      .proj-link-row:hover     .proj-row-del,
      .proj-todo-row:hover     .proj-row-del,
      .proj-comment-item:hover .proj-row-del { color: #555; }
      .proj-row-del:hover { color: #f87171 !important; }

      /* add input */
      .proj-add-input {
        width: 100%;
        background: transparent;
        border: none;
        border-bottom: 1px solid transparent;
        outline: none;
        color: #555;
        font-size: 13px;
        font-family: inherit;
        padding: 4px 0;
        transition: border-color .1s, color .1s;
      }
      .proj-add-input:focus { color: #ccc; border-bottom-color: #3a3d4a; }
      .proj-add-input::placeholder { color: #444; }

      /* todos */
      .proj-todo-row {
        display: flex; align-items: center; gap: 10px; padding: 4px 0;
      }
      .proj-todo-cb {
        width: 14px; height: 14px;
        border: 1px solid #3a3d4a;
        border-radius: 3px;
        background: transparent;
        cursor: pointer;
        flex-shrink: 0;
        appearance: none;
        -webkit-appearance: none;
        position: relative;
        transition: background .1s, border-color .1s;
      }
      .proj-todo-cb:checked { background: #555; border-color: #555; }
      .proj-todo-cb:checked::after {
        content: '';
        position: absolute; left: 3px; top: 1px;
        width: 5px; height: 8px;
        border: 1.5px solid #0f1117;
        border-top: none; border-left: none;
        transform: rotate(45deg);
      }
      .proj-todo-text {
        flex: 1; background: transparent; border: none; outline: none;
        font-size: 13px; font-family: inherit; color: #ccc; padding: 0;
      }
      .proj-todo-text.done { color: #555; text-decoration: line-through; }
      .proj-todo-label     { flex: 1; font-size: 13px; color: #ccc; }
      .proj-todo-label.done { color: #555; text-decoration: line-through; }
      .proj-todo-add-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
      .proj-todo-add-ghost {
        width: 14px; height: 14px;
        border: 1px dashed #3a3d4a;
        border-radius: 3px; flex-shrink: 0;
      }

      /* comments */
      .proj-comment-item {
        display: flex; align-items: flex-start; gap: 8px;
        padding: 8px 12px;
        background: #1a1c24;
        border-radius: 4px;
        margin-bottom: 5px;
      }
      .proj-comment-ta {
        flex: 1; background: transparent; border: none; outline: none;
        font-size: 13px; font-family: inherit; color: #888;
        line-height: 1.6; resize: none; min-height: 18px; caret-color: #ccc;
      }
      .proj-comment-ta:focus { color: #ccc; }
      .proj-comment-add-ta {
        width: 100%;
        background: #1a1c24;
        border: 1px solid transparent;
        border-radius: 4px;
        color: #555; font-size: 13px; font-family: inherit;
        padding: 8px 12px; outline: none; resize: none;
        min-height: 36px; line-height: 1.6;
        transition: border-color .1s, color .1s;
      }
      .proj-comment-add-ta:focus { border-color: #3a3d4a; color: #ccc; }
      .proj-comment-add-ta::placeholder { color: #444; }

      /* commit preview */
      .proj-commit-line {
        font-size: 11px; color: #444; padding: 2px 0 4px;
        display: flex; align-items: center; gap: 6px;
        white-space: nowrap; overflow: hidden;
      }
      .proj-commit-sha  { font-family: monospace; flex-shrink: 0; }
      .proj-commit-msg  { overflow: hidden; text-overflow: ellipsis; flex: 1; }
      .proj-commit-auth { flex-shrink: 0; }
      .proj-btn-refresh {
        background: transparent; border: none; color: #444;
        cursor: pointer; font-size: 11px; padding: 0 2px; line-height: 1;
        transition: color .1s; flex-shrink: 0;
      }
      .proj-btn-refresh:hover { color: #888; }
    `;
    document.head.appendChild(style);
  }

})();
