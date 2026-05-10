async function doLogin() {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: v('user'), password: el('pw').value }),
  });
  if (res.ok) {
    const data = await res.json();
    localStorage.setItem('admin_token', data.token);
    showMain();
  } else {
    el('loginErr').style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('admin_token');
  location.reload();
}

const TAB_LOADERS = { analytics: loadAnalytics, site: loadSite, data: loadData };
const loadedTabs = new Set();

function loadTabOnce(name) {
  if (loadedTabs.has(name)) return;
  loadedTabs.add(name);
  TAB_LOADERS[name]?.();
}

function showMain() {
  el('login').style.display = 'none';
  el('main').style.display = 'flex';
  loadTabOnce('analytics');
  setInterval(loadAnalytics, 30000);
}

Array.from(document.querySelectorAll('.tab')).forEach(tab => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    el('panel-' + name).classList.add('active');
    loadTabOnce(name);
  });
});

if (token()) showMain();
else el('login').style.display = 'flex';
