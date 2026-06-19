/* ============================================================
   shared.js v3 — Gestão Financeira SL
   Compatível com ballet_token (patch4) e gf_token (novo)
   ============================================================ */

// ── TEMAS ─────────────────────────────────────────────────────
const THEMES = {
  teal:   { p:'#0F6E56', d:'#085041', l:'#E1F5EE', b:'#9FE1CB',  label:'Verde (padrão)' },
  blue:   { p:'#185FA5', d:'#0C447C', l:'#E6F1FB', b:'#B5D4F4',  label:'Azul' },
  purple: { p:'#534AB7', d:'#3C3489', l:'#EEEDFE', b:'#CECBF6',  label:'Roxo' },
  amber:  { p:'#854F0B', d:'#633806', l:'#FAEEDA', b:'#FAC775',  label:'Âmbar' },
  coral:  { p:'#993C1D', d:'#712B13', l:'#FAECE7', b:'#F5C4B3',  label:'Coral' },
  green:  { p:'#3B6D11', d:'#27500A', l:'#EAF3DE', b:'#C0DD97',  label:'Verde escuro' },
  slate:  { p:'#3D4B5C', d:'#2A3545', l:'#EDF0F3', b:'#B8C4D0',  label:'Ardósia' },
  black:  { p:'#1a1a18', d:'#0a0a09', l:'#f0f0ee', b:'#c8c8c4',  label:'Preto' },
};

function applyTheme(key) {
  const t = THEMES[key] || THEMES.teal;
  const r = document.documentElement.style;
  r.setProperty('--primary',   t.p);
  r.setProperty('--primary-d', t.d);
  r.setProperty('--primary-l', t.l);
  r.setProperty('--primary-b', t.b);
}

// ── AUTH ──────────────────────────────────────────────────────
const Auth = {
  token() {
    // suporta tanto gf_token (novo) quanto ballet_token (patch4)
    return localStorage.getItem('gf_token') || localStorage.getItem('ballet_token');
  },
  user() {
    try {
      return JSON.parse(localStorage.getItem('gf_user') || localStorage.getItem('ballet_user') || '{}');
    } catch { return {}; }
  },
  perms() {
    try {
      return JSON.parse(localStorage.getItem('gf_perms') || localStorage.getItem('ballet_perms') || '{}');
    } catch { return {}; }
  },
  theme() {
    return localStorage.getItem('gf_theme') || 'teal';
  },

  requireLogin() {
    if (!this.token()) { window.location.href = '/'; return false; }
    try {
      const p = JSON.parse(atob(this.token().split('.')[1]));
      if (p.exp * 1000 < Date.now()) { this.logout(); return false; }
    } catch { this.logout(); return false; }
    applyTheme(this.theme());
    return true;
  },

  hasPerm(module, action) {
    if (this.user().role === 'admin') return true;
    const p = this.perms();
    return !!(p[module] && p[module][action]);
  },

  logout() {
    ['gf_token','gf_user','gf_perms','gf_theme',
     'ballet_token','ballet_user','ballet_perms'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/';
  }
};

// ── API ───────────────────────────────────────────────────────
const API = {
  async req(method, path, body) {
    const r = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + Auth.token()
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 401) { Auth.logout(); return null; }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro desconhecido');
    return data;
  },
  get:    path       => API.req('GET',    path),
  post:   (path, b)  => API.req('POST',   path, b),
  put:    (path, b)  => API.req('PUT',    path, b),
  patch:  (path, b)  => API.req('PATCH',  path, b),
  delete: path       => API.req('DELETE', path),
};

// ── API com timeout (resiliência em rede lenta) ──
API.getT = async function(path, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch('/api' + path, {
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + Auth.token() },
      signal: ctrl.signal
    });
    if (r.status === 401) { Auth.logout(); return null; }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro');
    return data;
  } finally { clearTimeout(t); }
};

// ── TOASTS ────────────────────────────────────────────────────
function _toastWrap() {
  let el = document.getElementById('_toastWrap');
  if (!el) {
    el = document.createElement('div');
    el.id = '_toastWrap';
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

function showToast(msg, type = 'default') {
  const icons = { success: '✓', error: '✕', info: 'ℹ', default: '·' };
  const t = document.createElement('div');
  t.className = `toast${type !== 'default' ? ' toast-' + type : ''}`;
  t.innerHTML = `<span style="font-size:15px;flex-shrink:0">${icons[type] || icons.default}</span><span>${msg}</span>`;
  _toastWrap().appendChild(t);
  setTimeout(() => {
    t.classList.add('toast-hiding');
    setTimeout(() => t.remove(), 280);
  }, 3500);
}

// ── FORMATAÇÃO ────────────────────────────────────────────────
const Fmt = {
  brl: v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0),
  date: s => {
    if (!s) return '—';
    return new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR');
  },
  dateTime: s => s ? new Date(s).toLocaleString('pt-BR') : '—',
  month: s => {
    if (!s) return '—';
    const [y, m] = s.split('-');
    return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1] + '/' + y;
  },
  initials: name => (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
  avClass: name => {
    const n = (name || '').toLowerCase();
    if (n.includes('luana'))   return 'av-L';
    if (n.includes('silvio'))  return 'av-S';
    if (n.includes('isadora')) return 'av-I';
    return 'av-O';
  }
};

// ── MODAIS ────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function closeOnOverlay(e) { if (e.target.classList.contains('overlay')) e.target.classList.remove('open'); }
function confirmAction(msg) { return Promise.resolve(window.confirm(msg)); }

// ── DATAS ─────────────────────────────────────────────────────
function currentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}
function currentDate() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// ── SIDEBAR ───────────────────────────────────────────────────
function buildSidebar(activePage) {
  const user  = Auth.user();
  const perms = Auth.perms();
  const isAdmin  = user.role === 'admin';
  const isGestor = ['admin', 'gestor'].includes(user.role);

  function hasMod(mod) {
    if (isAdmin) return true;
    return perms[mod] && Object.values(perms[mod]).some(Boolean);
  }

  const nav = [
    { section: 'Principal' },
    { id: 'home',         icon: '🏠', label: 'Início',           href: '/home',         always: true },
    { id: 'checklist',    icon: '✅', label: 'Checklist',         href: '/app',          mod: 'checklist' },
    { section: 'Finanças' },
    { id: 'voz',    icon: '🎙️', label: 'Lançamento por Voz', href: '/voz', mod: 'finance' },
    { id: 'finance',      icon: '💰', label: 'Finanças',          href: '/finance',      mod: 'finance' },
    { id: 'contas',      icon: '💳', label: 'Contas',          href: '/contas',      mod: 'finance' },
    { id: 'relatorios',   icon: '📊', label: 'Relatórios',        href: '/relatorios',   mod: 'finance' },
    { id: 'planejamento', icon: '🧠', label: 'Planejamento', href: '/planejamento', mod: 'finance' },
    { id: 'compras',       icon: '🛒', label: 'Lista de Compras', href: '/compras',      mod: 'shopping' },
    { id: 'categorias',   icon: '🏷️', label: 'Categorias',        href: '/categorias',   mod: 'finance' },
    { id: 'invest',       icon: '📈', label: 'Investimentos',     href: '/invest',       mod: 'invest' },
    { section: 'Gestão' },
    { id: 'dashboard',    icon: '📊', label: 'Dashboard',         href: '/dashboard',    gestor: true },
    { id: 'admin',        icon: '⚙️', label: 'Administração',     href: '/admin',        admin: true },
    { id: 'backup',       icon: '💾', label: 'Backup',            href: '/backup',       admin: true },
    { id: 'perfil',       icon: '🎨', label: 'Meu Perfil',        href: '/perfil',       always: true },
  ];

  const sb = document.getElementById('sidebar');
  if (!sb) return;

  // Aplicar estado mini salvo
  const isMini = localStorage.getItem('sb_mini') === '1';
  if (isMini) sb.classList.add('mini');

  const roles = { admin: 'Administrador', gestor: 'Gestor', operacional: 'Operacional' };

  sb.innerHTML = `
    <div class="sidebar-toggle" id="sbToggle" title="Recolher menu">‹</div>
    <a href="/perfil" class="sidebar-logo" style="text-decoration:none">
      <div class="sidebar-logo-icon">💼</div>
      <div class="sidebar-logo-text">
        Gestão Financeira
        <div class="sidebar-logo-sub">SL · Sistema Interno</div>
      </div>
    </a>
    <a href="/perfil" class="sidebar-user" style="text-decoration:none" title="Meu perfil / tema">
      <div class="sidebar-avatar">${Fmt.initials(user.name)}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${user.name || 'Usuário'}</div>
        <div class="sidebar-user-role">${roles[user.role] || user.role}</div>
      </div>
    </a>
    <nav class="sidebar-nav" id="sbNav"></nav>
    <div class="sidebar-bottom">
      <button class="sidebar-logout" onclick="Auth.logout()">
        <span style="font-size:16px;flex-shrink:0">🚪</span>
        <span class="nav-label">Sair do sistema</span>
      </button>
    </div>
  `;

  // Toggle recolher
  document.getElementById('sbToggle').onclick = () => {
    const mini = sb.classList.toggle('mini');
    localStorage.setItem('sb_mini', mini ? '1' : '0');
  };

  // Overlay mobile
  let ov = document.getElementById('sbOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'sbOverlay'; ov.className = 'sidebar-overlay';
    ov.onclick = () => { sb.classList.remove('mobile-open'); ov.classList.remove('show'); };
    document.body.appendChild(ov);
  }

  // Botão hamburger mobile
  const ph = document.querySelector('.page-header');
  if (ph && !document.getElementById('menuToggleBtn')) {
    const mb = document.createElement('button');
    mb.id = 'menuToggleBtn'; mb.className = 'menu-toggle-btn'; mb.innerHTML = '☰';
    mb.onclick = () => { sb.classList.toggle('mobile-open'); ov.classList.toggle('show'); };
    ph.insertBefore(mb, ph.firstChild);
  }

  // Itens de navegação
  const navEl = document.getElementById('sbNav');
  nav.forEach(item => {
    if (item.section) {
      navEl.insertAdjacentHTML('beforeend',
        `<div class="nav-section-label">${item.section}</div>`);
      return;
    }
    if (item.admin  && !isAdmin)  return;
    if (item.gestor && !isGestor) return;
    if (item.mod    && !hasMod(item.mod) && !item.always) return;

    navEl.insertAdjacentHTML('beforeend', `
      <a href="${item.href}"
         class="nav-item ${activePage === item.id ? 'active' : ''}"
         data-tip="${item.label}">
        <span class="nav-icon">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
      </a>
    `);
  });
}


// ── BOTÃO FLUTUANTE DE VOZ ─────────────────────────────────────
function injectVoiceFAB() { return; // movido para o menu lateral
  // Não mostrar na própria página de voz
  if (window.location.pathname === '/voz') return;

  const fab = document.createElement('div');
  fab.id = 'voiceFAB';
  fab.innerHTML = '🎙️';
  fab.title = 'Lançamento por Voz';
  fab.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:999;
    width:56px; height:56px; border-radius:50%;
    background:var(--primary,#0F6E56); color:#fff;
    font-size:24px; display:flex; align-items:center; justify-content:center;
    cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.25);
    transition:all .2s; user-select:none;
    border:2px solid rgba(255,255,255,.15);
  `;
  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.12)';
    fab.style.boxShadow = '0 6px 24px rgba(0,0,0,.35)';
  });
  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1)';
    fab.style.boxShadow = '0 4px 16px rgba(0,0,0,.25)';
  });
  fab.addEventListener('click', () => {
    window.location.href = '/voz';
  });

  // Tooltip
  const tip = document.createElement('div');
  tip.style.cssText = `
    position:fixed; bottom:90px; right:24px; z-index:999;
    background:#1a1a18; color:#fff; font-size:12px; font-weight:500;
    padding:6px 12px; border-radius:8px; white-space:nowrap;
    box-shadow:0 2px 8px rgba(0,0,0,.3); pointer-events:none;
    opacity:0; transition:opacity .2s;
  `;
  tip.textContent = 'Lançamento por Voz';
  document.body.appendChild(tip);

  fab.addEventListener('mouseenter', () => tip.style.opacity = '1');
  fab.addEventListener('mouseleave', () => tip.style.opacity = '0');

  document.body.appendChild(fab);
}

// Injetar após o DOM carregar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectVoiceFAB);
} else {
  injectVoiceFAB();
}

// ── ESC fecha modais ──────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
});


// ── Esconder saldos (privacidade) ────────────────────────────
if (typeof window !== 'undefined' && !window.__gfBalanceToggle) {
  window.__gfBalanceToggle = true;
  const Money = {
    get hidden(){ return localStorage.getItem('gf_hide_balances') === '1'; },
    set hidden(v){ v ? localStorage.setItem('gf_hide_balances','1') : localStorage.removeItem('gf_hide_balances'); }
  };
  window.Money = Money;
  if (typeof Fmt !== 'undefined' && typeof Fmt.brl === 'function') {
    const _brl = Fmt.brl;
    Fmt.brl = function(v){ return Money.hidden ? 'R$ ••••' : _brl.call(Fmt, v); };
  }
  function injectBalanceToggle(){ return; // movido para o menu lateral
    if (document.getElementById('gfEyeBtn')) return;
    const b = document.createElement('button');
    b.id = 'gfEyeBtn';
    b.type = 'button';
    b.title = 'Esconder / mostrar saldos';
    b.setAttribute('aria-label', 'Esconder ou mostrar saldos');
    b.textContent = Money.hidden ? '🙈' : '👁';
    b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:9998;width:44px;height:44px;border-radius:50%;border:1px solid var(--border,#2a3441);background:var(--surface,#1b2430);color:var(--text,#e8eef5);font-size:18px;line-height:1;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0;opacity:.85';
    b.addEventListener('click', function(){ Money.hidden = !Money.hidden; location.reload(); });
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBalanceToggle);
  else injectBalanceToggle();
}


// ── Conciliação de saldos (botão ⚖️) ────────────────────────
if (typeof window !== 'undefined' && !window.__gfReconcile) {
  window.__gfReconcile = true;
  function gfRcTok(){
    try { if (window.Auth && typeof Auth.token === 'function') { const t = Auth.token(); if (t) return t; } } catch(e){}
    return localStorage.getItem('token') || localStorage.getItem('gf_token') || localStorage.getItem('jwt') || '';
  }
  function gfRcBrl(v){
    try { if (window.Fmt && typeof Fmt.brl === 'function') return Fmt.brl(v); } catch(e){}
    return 'R$ ' + Number(v||0).toFixed(2).replace('.', ',');
  }
  async function gfRcApi(method, path, body){
    try {
      if (window.API) {
        if (method === 'GET'  && typeof API.get  === 'function') return await API.get(path);
        if (method === 'POST' && typeof API.post === 'function') return await API.post(path, body);
      }
    } catch(e) { /* cai no fetch */ }
    const r = await fetch('/api' + path, {
      method,
      headers: {'Content-Type':'application/json','Authorization':'Bearer ' + gfRcTok()},
      body: body ? JSON.stringify(body) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('Erro HTTP ' + r.status));
    return d;
  }
  function gfRcToast(msg){
    try { if (typeof showToast === 'function') return showToast(msg); } catch(e){}
    alert(msg);
  }
  function gfRcClose(){ const m = document.getElementById('gfRcModal'); if (m) m.remove(); }
  async function gfRcOpen(){
    gfRcClose();
    const ov = document.createElement('div');
    ov.id = 'gfRcModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;padding:0';
    ov.addEventListener('click', function(ev){ if (ev.target === ov) gfRcClose(); });
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface,#1b2430);color:var(--text,#e8eef5);width:100%;max-width:560px;max-height:86vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:18px 16px 26px;box-shadow:0 -4px 30px rgba(0,0,0,.5);font-family:inherit';
    card.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
      + '<strong style="font-size:16px">⚖️ Conciliar saldos</strong>'
      + '<button id="gfRcX" style="background:none;border:none;color:inherit;font-size:20px;cursor:pointer;padding:4px 8px">✕</button></div>'
      + '<p style="font-size:12.5px;opacity:.75;margin:0 0 14px">Abra o app do banco, digite o <b>saldo real</b> de cada conta e toque em OK. O sistema cria o lançamento de ajuste sozinho.</p>'
      + '<div id="gfRcList" style="display:flex;flex-direction:column;gap:10px"><div style="opacity:.7;font-size:13px">Carregando contas...</div></div>';
    ov.appendChild(card);
    document.body.appendChild(ov);
    card.querySelector('#gfRcX').addEventListener('click', gfRcClose);
    let accs;
    try { accs = await gfRcApi('GET', '/finance/accounts'); }
    catch(e){ card.querySelector('#gfRcList').innerHTML = '<div style="color:#f87171;font-size:13px">Erro ao carregar contas: ' + e.message + '</div>'; return; }
    if (!Array.isArray(accs)) accs = accs.accounts || accs.data || [];
    accs = accs.filter(a => a.active === undefined || a.active == 1);
    const list = card.querySelector('#gfRcList');
    list.innerHTML = '';
    if (!accs.length) { list.innerHTML = '<div style="opacity:.7;font-size:13px">Nenhuma conta ativa encontrada.</div>'; return; }
    accs.forEach(function(a){
      const row = document.createElement('div');
      row.style.cssText = 'border:1px solid var(--border,#2a3441);border-radius:12px;padding:10px 12px';
      row.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:8px">'
        + '<span style="font-weight:600;font-size:13.5px">' + (a.name||'Conta') + '</span>'
        + '<span style="font-size:12px;opacity:.7;white-space:nowrap">sistema: ' + gfRcBrl(a.balance) + '</span></div>'
        + '<div style="display:flex;gap:8px">'
        + '<input type="number" step="0.01" inputmode="decimal" placeholder="Saldo real (ex: 1234.56)" '
        + 'style="flex:1;min-width:0;padding:9px 10px;border-radius:9px;border:1px solid var(--border,#2a3441);background:var(--bg,#0f141b);color:inherit;font-size:14px;font-family:inherit">'
        + '<button style="padding:9px 16px;border:none;border-radius:9px;background:var(--primary,#0F6E56);color:#fff;font-weight:700;cursor:pointer;font-family:inherit">OK</button></div>'
        + '<div class="gfRcMsg" style="font-size:12px;margin-top:6px;display:none"></div>';
      const inp = row.querySelector('input');
      const btn = row.querySelector('button');
      const msg = row.querySelector('.gfRcMsg');
      async function go(){
        const v = parseFloat(String(inp.value).replace(',', '.'));
        if (!isFinite(v)) { msg.style.display='block'; msg.style.color='#fbbf24'; msg.textContent='Digite o saldo real.'; return; }
        btn.disabled = true; btn.textContent = '...';
        try {
          const r = await gfRcApi('POST', '/finance/accounts/' + a.id + '/reconcile', { real_balance: v });
          msg.style.display = 'block'; msg.style.color = '#34d399';
          if (r.already || r.diff === 0) msg.textContent = '✓ Já estava conciliada.';
          else msg.textContent = '✓ Ajuste de ' + (r.diff > 0 ? '+' : '−') + gfRcBrl(Math.abs(r.diff)) + ' lançado. Novo saldo: ' + gfRcBrl(r.new_balance);
          row.style.borderColor = '#34d399';
          inp.disabled = true; btn.textContent = '✓';
        } catch(e) {
          btn.disabled = false; btn.textContent = 'OK';
          msg.style.display = 'block'; msg.style.color = '#f87171';
          msg.textContent = 'Erro: ' + e.message;
        }
      }
      btn.addEventListener('click', go);
      inp.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') go(); });
      list.appendChild(row);
    });
  }
  window.gfRcOpen = gfRcOpen;
  function injectReconcileBtn(){ return; // movido para o menu lateral
    if (document.getElementById('gfRcBtn')) return;
    const b = document.createElement('button');
    b.id = 'gfRcBtn';
    b.type = 'button';
    b.title = 'Conciliar saldos';
    b.setAttribute('aria-label', 'Conciliar saldos das contas');
    b.textContent = '⚖️';
    b.style.cssText = 'position:fixed;left:16px;bottom:68px;z-index:9998;width:44px;height:44px;border-radius:50%;border:1px solid var(--border,#2a3441);background:var(--surface,#1b2430);color:var(--text,#e8eef5);font-size:18px;line-height:1;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0;opacity:.85';
    b.addEventListener('click', gfRcOpen);
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectReconcileBtn);
  else injectReconcileBtn();
}


// ── Ações no menu lateral (Esconder saldos / Conciliar) ──────
if (typeof window !== 'undefined' && !window.__gfMenuActions) {
  window.__gfMenuActions = true;
  function gfRemoveFABs(){
    ['voiceFAB','gfEyeBtn','gfRcBtn'].forEach(function(id){
      var el = document.getElementById(id); if (el) el.remove();
    });
  }
  function gfCloseSidebarMobile(){
    try { var ov = document.getElementById('sbOverlay'); if (ov && getComputedStyle(ov).display !== 'none') ov.click(); } catch(e){}
  }
  function gfInjectMenuActions(){
    var nav = document.getElementById('sbNav');
    if (!nav || !nav.children.length || document.getElementById('gfNavRecon')) return;

    var sec = document.createElement('div');
    sec.className = 'nav-section-label';
    sec.textContent = 'Ferramentas';
    nav.appendChild(sec);

    // 👁 Esconder / mostrar saldos
    var hidden = !!(window.Money && Money.hidden);
    var eye = document.createElement('a');
    eye.href = 'javascript:void(0)';
    eye.id = 'gfNavEye';
    eye.className = 'nav-item';
    eye.innerHTML = '<span class="nav-icon">' + (hidden ? '🙈' : '👁') + '</span>'
                  + '<span class="nav-label">' + (hidden ? 'Mostrar saldos' : 'Esconder saldos') + '</span>';
    eye.addEventListener('click', function(){
      if (window.Money) { Money.hidden = !Money.hidden; location.reload(); }
    });
    nav.appendChild(eye);

    // ⚖️ Conciliar saldos
    var rc = document.createElement('a');
    rc.href = 'javascript:void(0)';
    rc.id = 'gfNavRecon';
    rc.className = 'nav-item';
    rc.innerHTML = '<span class="nav-icon">⚖️</span><span class="nav-label">Conciliar saldos</span>';
    rc.addEventListener('click', function(){
      gfCloseSidebarMobile();
      if (typeof window.gfRcOpen === 'function') window.gfRcOpen();
    });
    nav.appendChild(rc);
  }
  function gfMenuTick(){ gfRemoveFABs(); gfInjectMenuActions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', gfMenuTick);
  else gfMenuTick();
  // garante a injeção mesmo se o sidebar for (re)montado depois, e varre FABs de versões em cache
  setInterval(gfMenuTick, 800);
}
