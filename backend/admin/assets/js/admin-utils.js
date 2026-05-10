// Shared admin helpers used across all admin sections.
// Kept in a dedicated file so the main admin runtime can focus on feature logic.

function token() {
  return localStorage.getItem("admin_token");
}

async function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token(),
      ...(opts.headers || {}),
    },
  });
}

function v(id) {
  return (document.getElementById(id)?.value ?? "").trim();
}

function el(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s).replace(/[^a-zA-Z0-9]/g, "_");
}

function ss(id, ok, msg) {
  const e = el(id);
  if (!e) return;
  e.textContent = msg || (ok ? "Saved" : "Error");
  e.className = "ss " + (ok ? "ok" : "err");
  setTimeout(() => {
    e.textContent = "";
    e.className = "ss";
  }, 2500);
}

function tog(id) {
  const f = el(id);
  f.style.display = f.style.display === "flex" ? "none" : "flex";
}

function flash(input, ok) {
  input.style.outline = ok ? "1px solid #8fc050" : "1px solid #f87171";
  setTimeout(() => {
    input.style.outline = "";
  }, 1500);
}

// Escape helpers for safe HTML interpolation in template strings.
function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
