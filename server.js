const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

const JWT_SECRET = process.env.JWT_SECRET || 'gf-sl-2025-secret';
const DB_PATH    = process.env.DB_PATH || path.join(__dirname, 'database.db');
const PORT       = process.env.PORT || 3000;

// ── BANCO ──────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operacional',
    active INTEGER NOT NULL DEFAULT 1,
    theme_color TEXT DEFAULT 'teal',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS module_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, module, action),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS task_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    period TEXT NOT NULL,
    period_key TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 1,
    done_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tp ON task_progress(task_id, period_key);

  CREATE TABLE IF NOT EXISTS task_owners (
    task_id TEXT PRIMARY KEY,
    owner_code TEXT DEFAULT 'LS',
    owner_label TEXT DEFAULT 'Ambos',
    owner_cls TEXT DEFAULT 'who-LS',
    updated_by INTEGER,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS period_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    period_key TEXT NOT NULL,
    reset_by INTEGER NOT NULL,
    reset_by_name TEXT NOT NULL,
    reset_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS checklist_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📋',
    color TEXT DEFAULT '#0F6E56',
    description TEXT,
    created_by INTEGER,
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS checklist_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📌',
    badge_text TEXT,
    why_text TEXT,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS checklist_tasks_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL,
    task_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    sub TEXT,
    owner_code TEXT DEFAULT 'LS',
    owner_label TEXT DEFAULT 'Ambos',
    owner_cls TEXT DEFAULT 'who-LS',
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at TEXT
  );

  -- ── FINANCEIRO (modelo novo) ──────────────────────────────
  CREATE TABLE IF NOT EXISTS fin_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    family INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    bank TEXT,
    balance REAL NOT NULL DEFAULT 0,
    owner_type TEXT DEFAULT 'pj',
    color TEXT DEFAULT '#0F6E56',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS fin_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT DEFAULT '📁',
    color TEXT DEFAULT '#0F6E56',
    user_id INTEGER,
    system INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS fin_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    category_id INTEGER,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    due_date TEXT NOT NULL,
    month TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at TEXT,
    paid_amount REAL,
    fine_amount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    paid_account_id INTEGER,
    installment_group TEXT,
    installment_num INTEGER DEFAULT 1,
    installment_total INTEGER DEFAULT 1,
    recurrent_id INTEGER,
    owner_type TEXT DEFAULT 'pj',
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(account_id) REFERENCES fin_accounts(id)
  );

  CREATE TABLE IF NOT EXISTS fin_recurrents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    category_id INTEGER,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    day_of_month INTEGER NOT NULL,
    start_month TEXT,
    end_month TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS fin_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    amount REAL NOT NULL,
    UNIQUE(user_id, category_id, month),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS fin_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    from_account INTEGER NOT NULL,
    to_account INTEGER NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS inv_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL NOT NULL DEFAULT 0,
    target_date TEXT,
    monthly_contribution REAL DEFAULT 0,
    category TEXT DEFAULT 'geral',
    notes TEXT,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS inv_portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    ticker TEXT,
    type TEXT NOT NULL,
    quantity REAL,
    avg_price REAL,
    current_price REAL,
    invested_amount REAL NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at TEXT,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS inv_asset_cache (
    ticker TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// ── SEED INICIAL ───────────────────────────────────────────────
const adminExists = db.prepare('SELECT id FROM users WHERE role=?').get('admin');
if (!adminExists) {
  const seed = [
    { name:'Admin', email: process.env.ADMIN_EMAIL||'admin@gestao.com', pwd: process.env.ADMIN_PASSWORD||'123456', role:'admin' },
    
  ];
  seed.forEach(u => {
    const id = db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
      .run(u.name, u.email, bcrypt.hashSync(u.pwd,10), u.role).lastInsertRowid;
    const perms = {
      admin:      ['checklist:view','checklist:mark','checklist:owner','checklist:reset','finance:view','finance:launch','finance:edit','finance:delete','finance:family','invest:view','invest:edit','dashboard:view','admin:users','admin:permissions'],
      gestor:     ['checklist:view','checklist:mark','checklist:owner','checklist:reset','finance:view','finance:launch','finance:edit','finance:family','invest:view','invest:edit','dashboard:view'],
      operacional:['checklist:view','checklist:mark'],
    };
    (perms[u.role]||[]).forEach(mp => {
      const [mod,action] = mp.split(':');
      db.prepare('INSERT OR IGNORE INTO module_permissions(user_id,module,action,enabled) VALUES(?,?,?,1)').run(id,mod,action);
    });
  });

  // Seed categorias
  const cats = [
    ['Moradia','expense','🏠','#185FA5'],['Alimentação','expense','🛒','#854F0B'],
    ['Transporte','expense','🚗','#534AB7'],['Saúde','expense','❤️','#993C1D'],
    ['Educação','expense','📚','#3B6D11'],['Lazer','expense','🎭','#C05C00'],
    ['Vestuário','expense','👕','#854F0B'],['Serviços','expense','💡','#534AB7'],
    ['Impostos','expense','📋','#A32D2D'],['Mensalidades','income','🩰','#0F6E56'],
    ['Salário','income','💼','#3B6D11'],['Outras despesas','expense','📦','#5a5a56'],
    ['Outras receitas','income','💰','#5a5a56'],['Uniformes','expense','👗','#534AB7'],
    ['Investimentos','income','📈','#185FA5'],['Empréstimos','expense','🏦','#A32D2D'],
    ['Freelance','income','💻','#0F6E56'],['Aluguel','expense','🏢','#534AB7'],
  ];
  cats.forEach(([name,type,icon,color]) =>
    db.prepare('INSERT OR IGNORE INTO fin_categories(name,type,icon,color,system) VALUES(?,?,?,?,1)').run(name,type,icon,color));

  console.log('✅ Dados iniciais criados.');
}

// Seed checklist Financeiro
(function seedChecklist() {
  const exists = db.prepare('SELECT id FROM checklist_lists WHERE id=1').get();
  if (exists) return;
  const now = new Date().toISOString().replace('T',' ').slice(0,19);
  db.prepare("INSERT INTO checklist_lists(id,name,icon,color,sort_order,created_at) VALUES(1,'Financeiro','💰','#0F6E56',0,?)").run(now);
  const ib = db.prepare('INSERT INTO checklist_blocks(list_id,period,name,icon,badge_text,why_text,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?)');
  const it = db.prepare('INSERT OR IGNORE INTO checklist_tasks_v2(block_id,task_key,label,sub,owner_code,owner_label,owner_cls,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const blocks = [
    {period:'daily',name:'Manhã — antes de abrir',icon:'🕗',badge:'Luana',why:'Saber o saldo antes de gastar qualquer coisa evita usar dinheiro que não é seu.',tasks:[
      {key:'d1-0',label:'Conferir saldo das contas',sub:'Se alguma estiver negativa, isso é prioridade do dia.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'d1-1',label:'Ver boletos com vencimento hoje',sub:'Confirme que há saldo suficiente antes de cada vencimento.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'d1-2',label:'Verificar recebimentos no NextFit',sub:'Pagamentos das últimas 24h.',oc:'I',ol:'Isadora',cls:'who-I'},
    ]},
    {period:'daily',name:'Fim do dia — ao fechar',icon:'🕔',badge:'Todos',why:'Registrar no mesmo dia é 10x mais fácil do que lembrar depois.',tasks:[
      {key:'d2-0',label:'Registrar toda saída de dinheiro do dia',sub:'Cada Pix enviado, boleto, compra.',oc:'LS',ol:'Ambos',cls:'who-LS'},
      {key:'d2-1',label:'Registrar toda entrada do dia',sub:'Mensalidades, loja, avulsos.',oc:'I',ol:'Isadora',cls:'who-I'},
      {key:'d2-2',label:'Separar despesas do ballet das pessoais',sub:'Gasto pessoal com conta do ballet = pro-labore.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'d2-3',label:'Conferir caixa físico',sub:'Valor em caixa deve bater com o registrado.',oc:'I',ol:'Isadora',cls:'who-I'},
    ]},
    {period:'weekly',name:'Balanço da semana',icon:'📊',badge:'Luana + Silvio',why:'Você precisa saber se a semana foi boa ou ruim pelos números.',tasks:[
      {key:'w1-0',label:'Somar todas as entradas da semana',sub:'NextFit + transferências recebidas.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'w1-1',label:'Somar todas as saídas da semana',sub:'Pix enviados + boletos + saques.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'w1-2',label:'Calcular resultado',sub:'Se negativo, anote o motivo.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'w1-3',label:'Conferir saldo vs semana anterior',sub:'Saldo caiu mas resultado foi positivo? Há erro.',oc:'LS',ol:'Ambos',cls:'who-LS'},
    ]},
    {period:'weekly',name:'Cobranças e inadimplência',icon:'👥',badge:'Isadora',why:'Mensalidade não cobrada é dinheiro perdido.',tasks:[
      {key:'w2-0',label:'Abrir NextFit e ver alunos em atraso',sub:'Filtrar por "em atraso".',oc:'I',ol:'Isadora',cls:'who-I'},
      {key:'w2-1',label:'Enviar mensagem 5 a 15 dias em atraso',sub:'Tom gentil.',oc:'I',ol:'Isadora',cls:'who-I'},
      {key:'w2-2',label:'Ligar para mais de 15 dias sem pagar',sub:'Ofereça parcelamento em 2x.',oc:'I',ol:'Isadora',cls:'who-I'},
      {key:'w2-3',label:'Reportar para Luana',sub:'Total em aberto e ações tomadas.',oc:'I',ol:'Isadora',cls:'who-I'},
      {key:'w2-4',label:'Registrar acordos no sistema',sub:'Acordo verbal não existe.',oc:'I',ol:'Isadora',cls:'who-I'},
    ]},
    {period:'monthly',name:'Passo 1 — Consolidar dados',icon:'🗂️',badge:'Luana + Isadora',why:'Você não pode analisar o que não está consolidado.',tasks:[
      {key:'m1-0',label:'Exportar relatório do NextFit',sub:'Mensalidades, matrículas, produtos.',oc:'I',ol:'Isadora',cls:'who-I'},
      {key:'m1-1',label:'Baixar extrato de todas as contas',sub:'SICOOB, Nubank e TON.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'m1-2',label:'Reunir comprovantes e notas do mês',sub:'Organize em pasta por mês.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'m1-3',label:'Separar gastos pessoais dos do ballet',sub:'Gasto pessoal = pro-labore.',oc:'L',ol:'Luana',cls:'who-L'},
    ]},
    {period:'monthly',name:'Passo 2 — Os 5 números que importam',icon:'🔢',badge:'Luana',why:'Estes 5 números dizem tudo sobre a saúde do negócio.',tasks:[
      {key:'m2-0',label:'Receita total do mês',sub:'Meta: acima de R$ 16.000.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'m2-1',label:'Despesa total do mês',sub:'Fixas + variáveis + parcelas + impostos.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'m2-2',label:'Resultado líquido',sub:'Meta: resultado positivo todos os meses.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'m2-3',label:'Taxa de inadimplência',sub:'Meta: abaixo de 5%.',oc:'I',ol:'Isadora',cls:'who-I'},
      {key:'m2-4',label:'Saldo consolidado no último dia',sub:'Deve crescer mês a mês.',oc:'L',ol:'Luana',cls:'who-L'},
    ]},
    {period:'quarterly',name:'Diagnóstico do trimestre',icon:'🔍',badge:'Luana + Silvio',why:'3 meses de dados revelam padrões que o mês a mês esconde.',tasks:[
      {key:'q1-0',label:'Somar receita dos 3 meses e calcular média',sub:'Comparar com trimestre anterior.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'q1-1',label:'Analisar 3 maiores categorias de despesa',sub:'Alguma cresceu mais que a receita?',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'q1-2',label:'Calcular alunos que entraram e saíram',sub:'Churn alto = problema de qualidade ou preço.',oc:'I',ol:'Isadora',cls:'who-I'},
      {key:'q1-3',label:'Verificar saldo devedor dos empréstimos',sub:'Pedir extrato no SICOOB.',oc:'L',ol:'Luana',cls:'who-L'},
      {key:'q1-4',label:'Avaliar crescimento da reserva de emergência',sub:'Meta: R$ 5.000.',oc:'L',ol:'Luana',cls:'who-L'},
    ]},
  ];
  blocks.forEach((b,bi) => {
    const bid = ib.run(1,b.period,b.name,b.icon,b.badge,b.why,bi,now).lastInsertRowid;
    b.tasks.forEach((t,ti) => it.run(bid,t.key,t.label,t.sub||null,t.oc,t.ol,t.cls,ti,now));
  });
  console.log('✅ Checklist Financeiro criado.');
})();

// ── HELPERS ────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function nowStr() { return new Date().toISOString().replace('T',' ').slice(0,19); }
function monthStr() {
  const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');
}
function getPeriodKey(period) {
  const now=new Date(), y=now.getFullYear(), m=String(now.getMonth()+1).padStart(2,'0'), d=String(now.getDate()).padStart(2,'0');
  const dt=new Date(Date.UTC(y,now.getMonth(),now.getDate())), dn=dt.getUTCDay()||7;
  dt.setUTCDate(dt.getUTCDate()+4-dn);
  const wk=Math.ceil((((dt-new Date(Date.UTC(dt.getUTCFullYear(),0,1)))/86400000)+1)/7);
  return {daily:y+'-'+m+'-'+d,weekly:y+'-W'+String(wk).padStart(2,'0'),monthly:y+'-'+m,quarterly:y+'-Q'+Math.ceil(parseInt(m)/3)}[period]||y+'-'+m+'-'+d;
}

function auth(req,res,next) {
  const h=req.headers.authorization;
  if (!h) return res.status(401).json({error:'Sem token'});
  try { req.user=jwt.verify(h.split(' ')[1],JWT_SECRET); next(); }
  catch { res.status(401).json({error:'Token inválido'}); }
}
function perm(module,action) {
  return (req,res,next) => {
    if (req.user.role==='admin') return next();
    const p=db.prepare('SELECT enabled FROM module_permissions WHERE user_id=? AND module=? AND action=?').get(req.user.id,module,action);
    if (p?.enabled) return next();
    res.status(403).json({error:'Sem permissão'});
  };
}
function adminOnly(req,res,next) {
  if (req.user.role!=='admin') return res.status(403).json({error:'Apenas admin'});
  next();
}

// Atualizar saldo da conta
function updateBalance(accountId, amount, type, direction) {
  // direction: 'apply' = aplica, 'reverse' = reverte
  const delta = (type==='income' ? amount : -amount) * (direction==='apply' ? 1 : -1);
  db.prepare('UPDATE fin_accounts SET balance=balance+? WHERE id=?').run(delta, accountId);
}

// ── WEBSOCKET ──────────────────────────────────────────────────
const clients = new Set();
wss.on('connection', (ws,req) => {
  const token = new URL(req.url,'http://x').searchParams.get('token');
  try { const u=jwt.verify(token,JWT_SECRET); ws.uid=u.id; ws.uname=u.name; clients.add(ws); ws.on('close',()=>clients.delete(ws)); }
  catch { ws.close(); }
});
function broadcast(data) { const m=JSON.stringify(data); clients.forEach(c=>{if(c.readyState===1)c.send(m);}); }


// ── RATE LIMITER — login (5 tentativas / 5 minutos) ───────────
const loginAttempts = new Map();

function checkRateLimit(ip) {
  const now   = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, firstAt: now, blockedUntil: 0 };
  if (entry.blockedUntil > now) {
    const secs = Math.ceil((entry.blockedUntil - now) / 1000);
    return { blocked: true, retryAfter: secs };
  }
  if (now - entry.firstAt > 5 * 60 * 1000) {
    loginAttempts.set(ip, { count: 0, firstAt: now, blockedUntil: 0 });
    return { blocked: false };
  }
  return { blocked: false };
}

function recordFailedLogin(ip) {
  const now   = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, firstAt: now, blockedUntil: 0 };
  if (now - entry.firstAt > 5 * 60 * 1000) {
    loginAttempts.set(ip, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  entry.count++;
  if (entry.count >= 5) entry.blockedUntil = now + 5 * 60 * 1000;
  loginAttempts.set(ip, entry);
}

function recordSuccessLogin(ip) {
  loginAttempts.delete(ip);
}

// Limpar entradas antigas a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of loginAttempts.entries()) {
    if (now - e.firstAt > 10 * 60 * 1000) loginAttempts.delete(ip);
  }
}, 10 * 60 * 1000);

// ── AUTH ───────────────────────────────────────────────────────
app.post('/api/auth/login', (req,res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const rl = checkRateLimit(ip);
  if (rl.blocked) {
    return res.status(429).json({
      error: `Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfter/60)} minuto(s).`
    });
  }
  const {email,password}=req.body;
  const u=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get((email||'').toLowerCase().trim());
  if (!u||!bcrypt.compareSync(password||'',u.password)) {
    recordFailedLogin(ip);
    const e2 = loginAttempts.get(ip);
    const remaining = e2 ? Math.max(0, 5 - e2.count) : 4;
    return res.status(401).json({
      error: 'E-mail ou senha incorretos' + (remaining <= 2 && remaining > 0 ? ` (${remaining} tentativa(s) restante(s))` : '')
    });
  }
  recordSuccessLogin(ip);
  const permsRows=db.prepare('SELECT module,action FROM module_permissions WHERE user_id=? AND enabled=1').all(u.id);
  const perms={};
  permsRows.forEach(({module,action})=>{if(!perms[module])perms[module]={};perms[module][action]=true;});
  const token=jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},JWT_SECRET,{expiresIn:'12h'});
  res.json({token,user:{id:u.id,name:u.name,role:u.role,theme_color:u.theme_color||'teal'},perms});
});

// ── PERFIL ─────────────────────────────────────────────────────
app.get('/api/profile', auth, (req,res) => {
  res.json(db.prepare('SELECT id,name,email,role,theme_color FROM users WHERE id=?').get(req.user.id));
});
app.put('/api/profile', auth, (req,res) => {
  const {name,currentPassword,newPassword}=req.body;
  if (!name?.trim()) return res.status(400).json({error:'Nome obrigatório'});
  if (newPassword) {
    const u=db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword||'',u.password)) return res.status(400).json({error:'Senha atual incorreta'});
    if (newPassword.length<6) return res.status(400).json({error:'Mínimo 6 caracteres'});
    db.prepare('UPDATE users SET name=?,password=? WHERE id=?').run(name.trim(),bcrypt.hashSync(newPassword,10),req.user.id);
  } else { db.prepare('UPDATE users SET name=? WHERE id=?').run(name.trim(),req.user.id); }
  res.json({ok:true});
});
app.put('/api/profile/theme', auth, (req,res) => {
  const {theme_color}=req.body;
  if (!['teal','blue','purple','amber','coral','green','slate','black'].includes(theme_color)) return res.status(400).json({error:'Tema inválido'});
  db.prepare('UPDATE users SET theme_color=? WHERE id=?').run(theme_color,req.user.id);
  res.json({ok:true,theme_color});
});

// ── USUÁRIOS ───────────────────────────────────────────────────
app.get('/api/users', auth, (req,res) => res.json(db.prepare('SELECT id,name,email,role,active,created_at FROM users ORDER BY id').all()));
app.post('/api/users', auth, adminOnly, (req,res) => {
  const {name,email,password,role}=req.body;
  if (!name||!email||!password) return res.status(400).json({error:'Campos obrigatórios'});
  if (password.length<6) return res.status(400).json({error:'Mínimo 6 caracteres'});
  if (db.prepare('SELECT id FROM users WHERE email=?').get((email||'').toLowerCase())) return res.status(400).json({error:'E-mail já cadastrado'});
  const id=db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,email.toLowerCase().trim(),bcrypt.hashSync(password,10),role||'operacional').lastInsertRowid;
  res.json({id,name,email,role});
});
app.put('/api/users/:id', auth, adminOnly, (req,res) => {
  const {name,email,role,active,password}=req.body; const uid=parseInt(req.params.id);
  if (uid===req.user.id&&active===0) return res.status(400).json({error:'Não pode desativar a si mesmo'});
  let q='UPDATE users SET name=?,email=?,role=?,active=?',p=[name,(email||'').toLowerCase().trim(),role,active?1:0];
  if (password?.length>=6){q+=',password=?';p.push(bcrypt.hashSync(password,10));}
  db.prepare(q+' WHERE id=?').run(...p,uid); res.json({ok:true});
});
app.get('/api/permissions/:userId', auth, adminOnly, (req,res) => {
  const rows=db.prepare('SELECT module,action,enabled FROM module_permissions WHERE user_id=?').all(req.params.userId);
  const map={};rows.forEach(r=>{if(!map[r.module])map[r.module]={};map[r.module][r.action]=!!r.enabled;});res.json(map);
});
app.post('/api/permissions/:userId', auth, adminOnly, (req,res) => {
  const uid=parseInt(req.params.userId);
  Object.entries(req.body.permissions||{}).forEach(([mod,acts])=>Object.entries(acts).forEach(([action,enabled])=>
    db.prepare('INSERT INTO module_permissions(user_id,module,action,enabled) VALUES(?,?,?,?) ON CONFLICT(user_id,module,action) DO UPDATE SET enabled=excluded.enabled').run(uid,mod,action,enabled?1:0)));
  res.json({ok:true});
});

// ── CHECKLIST ──────────────────────────────────────────────────
app.get('/api/tasks/state', auth, (req,res) => {
  const periods=['daily','weekly','monthly','quarterly'];
  const state={};
  periods.forEach(p=>db.prepare('SELECT task_id,user_id,user_name,done_at FROM task_progress WHERE period=? AND period_key=?').all(p,getPeriodKey(p)).forEach(r=>{state[r.task_id]={done:true,user_id:r.user_id,user_name:r.user_name,done_at:r.done_at};}));
  const owners={};
  db.prepare('SELECT * FROM task_owners').all().forEach(o=>{owners[o.task_id]=o;});
  res.json({state,owners});
});
app.post('/api/tasks/toggle', auth, (req,res) => {
  const {task_id,period,done}=req.body;
  const pk=getPeriodKey(period);
  if (done) db.prepare('INSERT OR IGNORE INTO task_progress(task_id,period,period_key,user_id,user_name) VALUES(?,?,?,?,?)').run(task_id,period,pk,req.user.id,req.user.name);
  else db.prepare('DELETE FROM task_progress WHERE task_id=? AND period_key=?').run(task_id,pk);
  const payload={type:'task_toggle',task_id,period,done,user_id:req.user.id,user_name:req.user.name,done_at:new Date().toLocaleString('pt-BR')};
  broadcast(payload); res.json({ok:true,...payload});
});
app.post('/api/tasks/owner', auth, (req,res) => {
  const {task_id,owner_code,owner_label,owner_cls}=req.body;
  db.prepare(`INSERT INTO task_owners(task_id,owner_code,owner_label,owner_cls,updated_by,updated_at) VALUES(?,?,?,?,?,datetime('now','localtime')) ON CONFLICT(task_id) DO UPDATE SET owner_code=excluded.owner_code,owner_label=excluded.owner_label,owner_cls=excluded.owner_cls,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(task_id,owner_code,owner_label,owner_cls,req.user.id);
  broadcast({type:'owner_change',task_id,owner_code,owner_label,owner_cls}); res.json({ok:true});
});
app.post('/api/tasks/reset', auth, (req,res) => {
  const {period}=req.body; const pk=getPeriodKey(period);
  db.prepare('DELETE FROM task_progress WHERE period=? AND period_key=?').run(period,pk);
  db.prepare('INSERT INTO period_resets(period,period_key,reset_by,reset_by_name) VALUES(?,?,?,?)').run(period,pk,req.user.id,req.user.name);
  broadcast({type:'period_reset',period,period_key:pk,by:req.user.name}); res.json({ok:true});
});
app.get('/api/dashboard', auth, (req,res) => {
  const {from='2024-01-01',to='2099-12-31'}=req.query;
  const f=from+' 00:00:00',t=to+' 23:59:59';
  const byUser=db.prepare('SELECT user_name,period,COUNT(*) as total FROM task_progress WHERE done_at>=? AND done_at<=? GROUP BY user_name,period ORDER BY user_name').all(f,t);
  const cur={};
  [{p:'daily',k:7},{p:'weekly',k:13},{p:'monthly',k:19},{p:'quarterly',k:23}].forEach(({p,k})=>{
    cur[p]={done:db.prepare('SELECT COUNT(*) as c FROM task_progress WHERE period=? AND period_key=?').get(p,getPeriodKey(p)).c,total:k};
  });
  res.json({byUser,current:cur});
});

// ── CHECKLIST MULTILISTAS ──────────────────────────────────────
app.get('/api/checklists', auth, (req,res) => res.json(db.prepare('SELECT * FROM checklist_lists WHERE active=1 ORDER BY sort_order,id').all()));
app.post('/api/checklists', auth, (req,res) => {
  if (!['admin','gestor'].includes(req.user.role)) return res.status(403).json({error:'Sem permissão'});
  const {name,icon='📋',color='#0F6E56',description}=req.body;
  if (!name) return res.status(400).json({error:'Nome obrigatório'});
  const maxOrder=db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM checklist_lists').get().m;
  const id=db.prepare('INSERT INTO checklist_lists(name,icon,color,description,created_by,sort_order,created_at) VALUES(?,?,?,?,?,?,?)').run(name,icon,color,description||null,req.user.id,maxOrder+1,nowStr()).lastInsertRowid;
  res.json({id,name,icon,color});
});
app.put('/api/checklists/:id', auth, (req,res) => {
  if (!['admin','gestor'].includes(req.user.role)) return res.status(403).json({error:'Sem permissão'});
  const {name,icon,color,description}=req.body;
  db.prepare('UPDATE checklist_lists SET name=?,icon=?,color=?,description=? WHERE id=?').run(name,icon||'📋',color||'#0F6E56',description||null,req.params.id);
  res.json({ok:true});
});
app.delete('/api/checklists/:id', auth, (req,res) => {
  if (req.user.role!=='admin') return res.status(403).json({error:'Apenas admin'});
  if (req.params.id==1) return res.status(400).json({error:'A lista Financeiro não pode ser excluída'});
  db.prepare('UPDATE checklist_lists SET active=0 WHERE id=?').run(req.params.id); res.json({ok:true});
});
app.get('/api/checklists/:listId/content', auth, (req,res) => {
  const {period}=req.query;
  let q='SELECT * FROM checklist_blocks WHERE list_id=? AND active=1';
  const p=[req.params.listId];
  if (period){q+=' AND period=?';p.push(period);}
  q+=' ORDER BY sort_order,id';
  const blocks=db.prepare(q).all(...p);
  blocks.forEach(b=>{b.tasks=db.prepare('SELECT * FROM checklist_tasks_v2 WHERE block_id=? AND active=1 ORDER BY sort_order,id').all(b.id);});
  res.json(blocks);
});
app.post('/api/checklists/:listId/blocks', auth, (req,res) => {
  if (!['admin','gestor'].includes(req.user.role)) return res.status(403).json({error:'Sem permissão'});
  const {period,name,icon='📌',badge_text,why_text}=req.body;
  if (!period||!name) return res.status(400).json({error:'period e name obrigatórios'});
  const maxOrder=db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM checklist_blocks WHERE list_id=? AND period=?').get(req.params.listId,period).m;
  const id=db.prepare('INSERT INTO checklist_blocks(list_id,period,name,icon,badge_text,why_text,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?)').run(req.params.listId,period,name,icon,badge_text||null,why_text||null,maxOrder+1,nowStr()).lastInsertRowid;
  res.json({id,name,period});
});
app.put('/api/checklists/blocks/:id', auth, (req,res) => {
  if (!['admin','gestor'].includes(req.user.role)) return res.status(403).json({error:'Sem permissão'});
  const {name,icon,badge_text,why_text}=req.body;
  db.prepare('UPDATE checklist_blocks SET name=?,icon=?,badge_text=?,why_text=? WHERE id=?').run(name,icon||'📌',badge_text||null,why_text||null,req.params.id);
  res.json({ok:true});
});
app.delete('/api/checklists/blocks/:id', auth, (req,res) => {
  if (!['admin','gestor'].includes(req.user.role)) return res.status(403).json({error:'Sem permissão'});
  db.prepare('UPDATE checklist_blocks SET active=0 WHERE id=?').run(req.params.id);
  db.prepare('UPDATE checklist_tasks_v2 SET active=0 WHERE block_id=?').run(req.params.id);
  res.json({ok:true});
});
app.post('/api/checklists/blocks/:blockId/tasks', auth, (req,res) => {
  if (!['admin','gestor'].includes(req.user.role)) return res.status(403).json({error:'Sem permissão'});
  const {label,sub,owner_code='LS',owner_label='Ambos',owner_cls='who-LS'}=req.body;
  if (!label) return res.status(400).json({error:'label obrigatório'});
  const maxOrder=db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM checklist_tasks_v2 WHERE block_id=?').get(req.params.blockId).m;
  const task_key='b'+req.params.blockId+'_t'+Date.now();
  const id=db.prepare('INSERT INTO checklist_tasks_v2(block_id,task_key,label,sub,owner_code,owner_label,owner_cls,sort_order,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(req.params.blockId,task_key,label,sub||null,owner_code,owner_label,owner_cls,maxOrder+1,req.user.id,nowStr()).lastInsertRowid;
  res.json({id,task_key,label});
});
app.put('/api/checklists/tasks/:id', auth, (req,res) => {
  if (!['admin','gestor'].includes(req.user.role)) return res.status(403).json({error:'Sem permissão'});
  const {label,sub,owner_code,owner_label,owner_cls}=req.body;
  db.prepare('UPDATE checklist_tasks_v2 SET label=?,sub=?,owner_code=?,owner_label=?,owner_cls=? WHERE id=?').run(label,sub||null,owner_code||'LS',owner_label||'Ambos',owner_cls||'who-LS',req.params.id);
  res.json({ok:true});
});
app.delete('/api/checklists/tasks/:id', auth, (req,res) => {
  if (!['admin','gestor'].includes(req.user.role)) return res.status(403).json({error:'Sem permissão'});
  db.prepare('UPDATE checklist_tasks_v2 SET active=0 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── FINANÇAS — CONTAS ──────────────────────────────────────────
// ── Conciliação de saldo (botão ⚖️ Conciliar) ───────────────
app.post('/api/finance/accounts/:id/reconcile', auth, perm('finance','launch'), (req,res) => {
  try {
    const acc = db.prepare('SELECT * FROM fin_accounts WHERE id=?').get(req.params.id);
    if (!acc) return res.status(404).json({error:'Conta não encontrada'});
    const real = parseFloat(req.body.real_balance);
    if (!isFinite(real)) return res.status(400).json({error:'Saldo inválido'});
    const diff = Math.round((real - (acc.balance||0))*100)/100;
    if (Math.abs(diff) < 0.005) return res.json({ok:true, diff:0, already:true, new_balance: acc.balance});
    const type = diff > 0 ? 'income' : 'expense';
    const amount = Math.abs(diff);
    const today = new Date().toISOString().slice(0,10);
    const desc = (req.body.description && String(req.body.description).trim())
              || ('Ajuste de conciliação ' + today.slice(0,7));
    const cols = db.prepare('PRAGMA table_info(fin_transactions)').all();
    const names = cols.map(c => c.name);
    const vals = {
      user_id: req.user.id,
      account_id: acc.id,
      type, amount,
      description: desc,
      status: type === 'income' ? 'received' : 'paid',
      paid_at: today, due_date: today, date: today,
      /* gfReconMonthFix */
      month: (function(){
        try {
          const smp = db.prepare('SELECT month FROM fin_transactions WHERE month IS NOT NULL LIMIT 1').get();
          if (smp && smp.month !== null && smp.month !== undefined && !String(smp.month).includes('-'))
            return parseInt(today.slice(5,7), 10); // banco usa mês numérico
        } catch(e) {}
        return today.slice(0,7); // padrão YYYY-MM
      })(),
      year: parseInt(today.slice(0,4), 10),
      owner_type: acc.owner_type || 'pf',
      family: acc.family || 0,
      notes: 'Gerado pelo botão Conciliar',
      created_at: (typeof nowStr === 'function' ? nowStr() : new Date().toISOString())
    };
    const catCol = cols.find(c => c.name === 'category_id');
    if (catCol && catCol.notnull && vals.category_id === undefined) {
      try { const cat = db.prepare('SELECT id FROM fin_categories LIMIT 1').get(); if (cat) vals.category_id = cat.id; } catch(e) {}
    }
    // qualquer outra coluna NOT NULL sem default ganha um valor neutro
    cols.forEach(c => {
      if (c.notnull && !c.pk && c.dflt_value === null && vals[c.name] === undefined)
        vals[c.name] = /INT|REAL|NUM|DEC|DOUB|FLOA/i.test(c.type || '') ? 0 : '';
    });
    const use = names.filter(n => vals[n] !== undefined);
    db.prepare('INSERT INTO fin_transactions('+use.join(',')+') VALUES('+use.map(()=>'?').join(',')+')')
      .run(...use.map(n => vals[n]));
    db.prepare('UPDATE fin_accounts SET balance=? WHERE id=?').run(real, acc.id);
    res.json({ok:true, diff, type, new_balance: real});
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/finance/accounts', auth, perm('finance','view'), (req,res) => {
  const family=req.query.family==='true';
  let q='SELECT a.*,u.name as owner_name FROM fin_accounts a JOIN users u ON a.user_id=u.id WHERE a.active=1';
  const p=[];
  if (family){q+=' AND (a.user_id=? OR a.family=1)';p.push(req.user.id);}
  else{q+=' AND a.user_id=?';p.push(req.user.id);}
  q+=' ORDER BY a.owner_type,a.name';
  res.json(db.prepare(q).all(...p));
});
app.post('/api/finance/accounts', auth, perm('finance','launch'), (req,res) => {
  const {name,type,bank,balance=0,color='#0F6E56',family=0,owner_type='pj'}=req.body;
  if (!name||!type) return res.status(400).json({error:'Nome e tipo obrigatórios'});
  const id=db.prepare('INSERT INTO fin_accounts(user_id,family,name,type,bank,balance,owner_type,color,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(req.user.id,family?1:0,name,type,bank||null,balance,owner_type,color,nowStr()).lastInsertRowid;
  res.json({id,ok:true});
});
app.put('/api/finance/accounts/:id', auth, perm('finance','edit'), (req,res) => {
  const {name,bank,balance,color,family,owner_type,active=1}=req.body;
  db.prepare('UPDATE fin_accounts SET name=?,bank=?,balance=?,color=?,family=?,owner_type=?,active=? WHERE id=?').run(name,bank||null,balance,color||'#0F6E56',family?1:0,owner_type||'pj',active?1:0,req.params.id);
  res.json({ok:true});
});
app.delete('/api/finance/accounts/:id', auth, perm('finance','delete'), (req,res) => {
  db.prepare('UPDATE fin_accounts SET active=0 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── FINANÇAS — CATEGORIAS ──────────────────────────────────────
app.get('/api/finance/categories', auth, (req,res) => {
  const {type}=req.query;
  let q='SELECT * FROM fin_categories WHERE (user_id IS NULL OR user_id=? OR system=1)';
  const p=[req.user.id];
  if (type){q+=' AND type=?';p.push(type);}
  res.json(db.prepare(q+' ORDER BY system DESC,name').all(...p));
});
app.get('/api/finance/categories/all', auth, (req,res) => {
  res.json(db.prepare('SELECT c.*,(SELECT COUNT(*) FROM fin_transactions t WHERE t.category_id=c.id) as usage_count FROM fin_categories c ORDER BY c.type,c.system DESC,c.name').all());
});
app.post('/api/finance/categories', auth, (req,res) => {
  const {name,type,icon='📁',color='#0F6E56'}=req.body;
  if (!name||!type) return res.status(400).json({error:'Nome e tipo obrigatórios'});
  const id=db.prepare('INSERT INTO fin_categories(name,type,icon,color,user_id) VALUES(?,?,?,?,?)').run(name,type,icon,color,req.user.id).lastInsertRowid;
  res.json({id,ok:true});
});
app.put('/api/finance/categories/:id', auth, (req,res) => {
  const {name,type,icon,color}=req.body;
  db.prepare('UPDATE fin_categories SET name=?,type=?,icon=?,color=? WHERE id=?').run(name,type,icon||'📁',color||'#5a5a56',req.params.id);
  res.json({ok:true});
});
app.delete('/api/finance/categories/:id', auth, (req,res) => {
  const cat=db.prepare('SELECT * FROM fin_categories WHERE id=?').get(req.params.id);
  if (!cat) return res.status(404).json({error:'Não encontrada'});
  if (cat.system) return res.status(403).json({error:'Categorias do sistema não podem ser excluídas'});
  const inUse=db.prepare('SELECT COUNT(*) as c FROM fin_transactions WHERE category_id=?').get(req.params.id);
  if (inUse.c>0) return res.status(400).json({error:'Em uso em '+inUse.c+' lançamento(s)'});
  db.prepare('DELETE FROM fin_categories WHERE id=? AND system=0').run(req.params.id);
  res.json({ok:true});
});

// ── FINANÇAS — TRANSAÇÕES (NOVO MODELO) ───────────────────────
app.get('/api/finance/transactions', auth, perm('finance','view'), (req,res) => {
  const {month,from,to,status,type,account_id,owner_type,family}=req.query;
  const isFamily=family==='true';
  let q='SELECT t.*,c.name as cat_name,c.icon as cat_icon,a.name as acc_name,a.owner_type as acc_owner_type,u.name as owner_name FROM fin_transactions t LEFT JOIN fin_categories c ON t.category_id=c.id LEFT JOIN fin_accounts a ON t.account_id=a.id LEFT JOIN users u ON t.user_id=u.id WHERE t.active=1';
  const p=[];
  if (isFamily){q+=' AND (t.user_id=? OR a.family=1)';p.push(req.user.id);}
  else{q+=' AND t.user_id=?';p.push(req.user.id);}
  if (month){q+=' AND t.month=?';p.push(month);}
  if (from){q+=' AND t.due_date>=?';p.push(from+'-01');}
  if (to){q+=' AND t.due_date<=?';p.push(to+'-31');}
  if (status){q+=' AND t.status=?';p.push(status);}
  if (type){q+=' AND t.type=?';p.push(type);}
  if (account_id){q+=' AND t.account_id=?';p.push(account_id);}
  if (owner_type==='pf'||owner_type==='pj'){q+=' AND a.owner_type=?';p.push(owner_type);}
  q+=' ORDER BY t.due_date DESC,t.id DESC';
  res.json(db.prepare(q).all(...p));
});

app.post('/api/finance/transactions', auth, perm('finance','launch'), (req,res) => {
  const {account_id,category_id,type,amount,description,due_date,status='pending',installment_total=1,owner_type,notes,recurrent_id}=req.body;
  if (!account_id||!type||!amount||!due_date) return res.status(400).json({error:'Campos obrigatórios: conta, tipo, valor, vencimento'});
  const total=Math.max(1,parseInt(installment_total)||1);
  const group=total>1?('grp_'+req.user.id+'_'+Date.now()):null;
  const ids=[];
  const ins=db.prepare('INSERT INTO fin_transactions(user_id,account_id,category_id,type,amount,description,due_date,month,status,installment_group,installment_num,installment_total,recurrent_id,owner_type,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (let i=0;i<total;i++) {
    const d=new Date(due_date+'T12:00:00'); d.setMonth(d.getMonth()+i);
    const dStr=d.toISOString().slice(0,10);
    const label=total>1?(description+' ('+( i+1)+'/'+total+')'):description;
    const id=ins.run(req.user.id,account_id,category_id||null,type,Math.abs(parseFloat(amount)),label,dStr,dStr.slice(0,7),status,group,i+1,total,recurrent_id||null,owner_type||'pj',notes||null,nowStr()).lastInsertRowid;
    ids.push(id);
    // Se já for lançado como pago, atualiza saldo imediatamente
    if (status==='paid'||status==='received') {
      updateBalance(account_id,Math.abs(parseFloat(amount)),type,'apply');
    }
  }
  res.json({ids,installment_total:total,ok:true});
});

app.put('/api/finance/transactions/:id', auth, perm('finance','edit'), (req,res) => {
  const old=db.prepare('SELECT * FROM fin_transactions WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if (!old) return res.status(404).json({error:'Não encontrado'});
  const {account_id,category_id,type,amount,description,due_date,owner_type,notes}=req.body;
  // Se estava pago, reverter saldo antigo e aplicar novo
  if (old.status==='paid'||old.status==='received') {
    updateBalance(old.paid_account_id||old.account_id, old.paid_amount||old.amount, old.type,'reverse');
    updateBalance(account_id||old.account_id, Math.abs(parseFloat(amount)), type,'apply');
  }
  db.prepare('UPDATE fin_transactions SET account_id=?,category_id=?,type=?,amount=?,description=?,due_date=?,month=?,owner_type=?,notes=? WHERE id=? AND user_id=?').run(account_id,category_id||null,type,Math.abs(parseFloat(amount)),description,due_date,due_date.slice(0,7),owner_type||'pj',notes||null,req.params.id,req.user.id);
  res.json({ok:true});
});

app.delete('/api/finance/transactions/:id', auth, perm('finance','delete'), (req,res) => {
  const {all_installments}=req.query;
  const t=db.prepare('SELECT * FROM fin_transactions WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if (!t) return res.status(404).json({error:'Não encontrado'});
  // Reverter saldo se estava pago
  if (t.status==='paid'||t.status==='received') updateBalance(t.paid_account_id||t.account_id,t.paid_amount||t.amount,t.type,'reverse');
  if (all_installments==='true'&&t.installment_group) {
    const rows=db.prepare(`SELECT * FROM fin_transactions WHERE installment_group=? AND user_id=? AND status='pending'`).all(t.installment_group,req.user.id);
    rows.forEach(r=>db.prepare('UPDATE fin_transactions SET active=0 WHERE id=?').run(r.id));
    db.prepare('UPDATE fin_transactions SET active=0 WHERE id=?').run(t.id);
    return res.json({ok:true,deleted:rows.length+1});
  }
  db.prepare('UPDATE fin_transactions SET active=0 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// PATCH dar baixa
app.patch('/api/finance/transactions/:id/pay', auth, perm('finance','launch'), (req,res) => {
  const t=db.prepare('SELECT * FROM fin_transactions WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if (!t) return res.status(404).json({error:'Não encontrado'});
  if (t.status==='paid'||t.status==='received') return res.status(400).json({error:'Já pago/recebido'});
  const {paid_at,fine_amount=0,discount_amount=0,paid_account_id}=req.body;
  let fineAmt=parseFloat(fine_amount)||0, discAmt=parseFloat(discount_amount)||0;
  const finePct=parseFloat(req.body.fine_pct)||0, discPct=parseFloat(req.body.discount_pct)||0;
  if (finePct>0) fineAmt=t.amount*finePct/100;
  if (discPct>0) discAmt=t.amount*discPct/100;
  const paid_amount=Math.max(0,t.amount+fineAmt-discAmt);
  const pDate=paid_at||nowStr().slice(0,10);
  const accId=paid_account_id||t.account_id;
  const newStatus=t.type==='income'?'received':'paid';
  db.prepare('UPDATE fin_transactions SET status=?,paid_at=?,paid_amount=?,fine_amount=?,discount_amount=?,paid_account_id=? WHERE id=?').run(newStatus,pDate,paid_amount,fineAmt,discAmt,accId,t.id);
  updateBalance(accId,paid_amount,t.type,'apply');
  res.json({ok:true,paid_amount,status:newStatus});
});

// PATCH estornar
app.patch('/api/finance/transactions/:id/unpay', auth, perm('finance','edit'), (req,res) => {
  const t=db.prepare('SELECT * FROM fin_transactions WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if (!t||(t.status!=='paid'&&t.status!=='received')) return res.status(400).json({error:'Transação não está paga'});
  updateBalance(t.paid_account_id||t.account_id,t.paid_amount||t.amount,t.type,'reverse');
  db.prepare(`UPDATE fin_transactions SET status='pending',paid_at=NULL,paid_amount=NULL,fine_amount=0,discount_amount=0,paid_account_id=NULL WHERE id=?`).run(t.id);
  res.json({ok:true});
});

// ── FINANÇAS — RECORRENTES ─────────────────────────────────────
app.get('/api/finance/recurrents', auth, perm('finance','view'), (req,res) => {
  res.json(db.prepare('SELECT r.*,c.name as cat_name,c.icon as cat_icon,a.name as acc_name FROM fin_recurrents r LEFT JOIN fin_categories c ON r.category_id=c.id LEFT JOIN fin_accounts a ON r.account_id=a.id WHERE r.user_id=? AND r.active=1 ORDER BY r.description').all(req.user.id));
});
app.post('/api/finance/recurrents', auth, perm('finance','launch'), (req,res) => {
  const {account_id,category_id,type,amount,description,day_of_month,start_month,end_month}=req.body;
  if (!account_id||!type||!amount||!description||!day_of_month) return res.status(400).json({error:'Campos obrigatórios'});
  const id=db.prepare('INSERT INTO fin_recurrents(user_id,account_id,category_id,type,amount,description,day_of_month,start_month,end_month,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(req.user.id,account_id,category_id||null,type,Math.abs(amount),description,day_of_month,start_month||null,end_month||null,nowStr()).lastInsertRowid;
  res.json({id,ok:true});
});
app.put('/api/finance/recurrents/:id', auth, perm('finance','edit'), (req,res) => {
  const {account_id,category_id,type,amount,description,day_of_month,start_month,end_month}=req.body;
  db.prepare('UPDATE fin_recurrents SET account_id=?,category_id=?,type=?,amount=?,description=?,day_of_month=?,start_month=?,end_month=? WHERE id=? AND user_id=?').run(account_id,category_id||null,type,Math.abs(amount),description,day_of_month,start_month||null,end_month||null,req.params.id,req.user.id);
  res.json({ok:true});
});
app.delete('/api/finance/recurrents/:id', auth, perm('finance','delete'), (req,res) => {
  db.prepare('DELETE FROM fin_recurrents WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  res.json({ok:true});
});

// Gerar lançamentos das recorrentes para um mês
app.post('/api/finance/recurrents/generate', auth, perm('finance','launch'), (req,res) => {
  const {month}=req.body;
  if (!month) return res.status(400).json({error:'month obrigatório'});
  const recs=db.prepare('SELECT * FROM fin_recurrents WHERE user_id=? AND active=1').all(req.user.id);
  let created=0,skipped=0;
  const ins=db.prepare('INSERT INTO fin_transactions(user_id,account_id,category_id,type,amount,description,due_date,month,status,recurrent_id,owner_type,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  recs.forEach(r => {
    if (r.start_month&&month<r.start_month){skipped++;return;}
    if (r.end_month&&month>r.end_month){skipped++;return;}
    const dup=db.prepare('SELECT id FROM fin_transactions WHERE month=? AND recurrent_id=? AND user_id=? AND active=1').get(month,r.id,req.user.id);
    if (dup){skipped++;return;}
    const acc=db.prepare('SELECT owner_type FROM fin_accounts WHERE id=?').get(r.account_id);
    const d=new Date(month+'-'+String(r.day_of_month).padStart(2,'0')+'T12:00:00');
    const dStr=d.toISOString().slice(0,10);
    ins.run(req.user.id,r.account_id,r.category_id,r.type,r.amount,r.description,dStr,month,'pending',r.id,acc?.owner_type||'pj',nowStr());
    created++;
  });
  res.json({created,skipped,message:created+' gerado(s), '+skipped+' ignorado(s)'});
});

// ── FINANÇAS — ORÇAMENTO ───────────────────────────────────────
app.get('/api/finance/budgets', auth, perm('finance','view'), (req,res) => {
  const month=req.query.month||monthStr();
  res.json(db.prepare(`SELECT b.*,c.name as cat_name,c.icon as cat_icon,COALESCE((SELECT SUM(t.paid_amount) FROM fin_transactions t WHERE t.category_id=b.category_id AND t.user_id=b.user_id AND t.month=b.month AND t.type='expense' AND t.status='paid'),0) as spent FROM fin_budgets b JOIN fin_categories c ON b.category_id=c.id WHERE b.user_id=? AND b.month=?`).all(req.user.id,month));
});
app.post('/api/finance/budgets', auth, perm('finance','launch'), (req,res) => {
  const {category_id,month,amount}=req.body;
  db.prepare('INSERT INTO fin_budgets(user_id,category_id,month,amount) VALUES(?,?,?,?) ON CONFLICT(user_id,category_id,month) DO UPDATE SET amount=excluded.amount').run(req.user.id,category_id,month,amount);
  res.json({ok:true});
});

// ── FINANÇAS — TRANSFERÊNCIAS ──────────────────────────────────
app.post('/api/finance/transfers', auth, perm('finance','launch'), (req,res) => {
  const {from_account,to_account,amount,date,description}=req.body;
  if (!from_account||!to_account||!amount||!date) return res.status(400).json({error:'Campos obrigatórios'});
  db.prepare('INSERT INTO fin_transfers(user_id,from_account,to_account,amount,date,description,created_at) VALUES(?,?,?,?,?,?,?)').run(req.user.id,from_account,to_account,amount,date,description||null,nowStr());
  db.prepare('UPDATE fin_accounts SET balance=balance-? WHERE id=?').run(amount,from_account);
  db.prepare('UPDATE fin_accounts SET balance=balance+? WHERE id=?').run(amount,to_account);
  res.json({ok:true});
});

// ── FINANÇAS — RESUMO ──────────────────────────────────────────
app.get('/api/finance/summary', auth, perm('finance','view'), (req,res) => {
  const month=req.query.month||monthStr();
  const family=req.query.family==='true';
  const uid=req.user.id;
  let filt=family?'(t.user_id=? OR a.family=1)':'t.user_id=?';
  const p=[month,uid];
  const income  =db.prepare(`SELECT COALESCE(SUM(COALESCE(t.paid_amount,t.amount)),0) as v FROM fin_transactions t JOIN fin_accounts a ON t.account_id=a.id WHERE t.month=? AND ${filt} AND t.type='income' AND t.status='received'`).get(...p);
  const expense =db.prepare(`SELECT COALESCE(SUM(COALESCE(t.paid_amount,t.amount)),0) as v FROM fin_transactions t JOIN fin_accounts a ON t.account_id=a.id WHERE t.month=? AND ${filt} AND t.type='expense' AND t.status='paid'`).get(...p);
  const pending =db.prepare(`SELECT COALESCE(SUM(t.amount),0) as v FROM fin_transactions t JOIN fin_accounts a ON t.account_id=a.id WHERE t.month=? AND ${filt} AND t.type='expense' AND t.status='pending'`).get(...p);
  const balance =db.prepare('SELECT COALESCE(SUM(a.balance),0) as v FROM fin_accounts a WHERE (a.user_id=? OR a.family=1) AND a.active=1').get(uid);
  const byCategory=db.prepare(`SELECT c.name,c.icon,c.color,SUM(COALESCE(t.paid_amount,t.amount)) as total FROM fin_transactions t LEFT JOIN fin_categories c ON t.category_id=c.id JOIN fin_accounts a ON t.account_id=a.id WHERE t.month=? AND ${filt} AND t.type='expense' AND t.status='paid' GROUP BY c.id ORDER BY total DESC LIMIT 8`).all(...p);
  res.json({month,income:income.v,expense:expense.v,pending:pending.v,balance:balance.v,byCategory});
});

// ── RELATÓRIOS ─────────────────────────────────────────────────
app.get('/api/reports/dre', auth, perm('finance','view'), (req,res) => {
  const {from,to,owner_type,family}=req.query;
  const fromM=from||'2024-01', toM=to||'2099-12';
  const uid=req.user.id;
  const isFamily=family==='true';
  let join='JOIN fin_accounts a ON t.account_id=a.id';
  let where=isFamily?'(t.user_id=? OR a.family=1)':'t.user_id=?';
  const p=[uid];
  if (owner_type==='pf'||owner_type==='pj'){where+=' AND a.owner_type=?';p.push(owner_type);}

  // Por mês
  const monthly=db.prepare('SELECT t.month, t.type, SUM(COALESCE(t.paid_amount,t.amount)) as total FROM fin_transactions t '+join+' WHERE t.month>=? AND t.month<=? AND '+where+" AND (t.status='paid' OR t.status='received') AND t.active=1 GROUP BY t.month,t.type ORDER BY t.month").all(fromM,toM,...p);

  // Projeção (pending)
  const projection=db.prepare('SELECT t.month, SUM(t.amount) as total FROM fin_transactions t '+join+' WHERE t.month>=? AND t.month<=? AND '+where+" AND t.status='pending' AND t.type='expense' AND t.active=1 GROUP BY t.month ORDER BY t.month").all(fromM,toM,...p);

  // Por categoria
  const byCategory=db.prepare('SELECT c.name,c.icon,c.color,t.type,SUM(COALESCE(t.paid_amount,t.amount)) as total,COUNT(*) as count FROM fin_transactions t LEFT JOIN fin_categories c ON t.category_id=c.id '+join+' WHERE t.month>=? AND t.month<=? AND '+where+" AND (t.status='paid' OR t.status='received') AND t.active=1 GROUP BY c.id,t.type ORDER BY t.type,total DESC").all(fromM,toM,...p);

  // Totais
  const income =db.prepare('SELECT COALESCE(SUM(COALESCE(t.paid_amount,t.amount)),0) as v FROM fin_transactions t '+join+' WHERE t.month>=? AND t.month<=? AND '+where+" AND t.type='income' AND t.status='received' AND t.active=1").get(fromM,toM,...p);
  const expense=db.prepare('SELECT COALESCE(SUM(COALESCE(t.paid_amount,t.amount)),0) as v FROM fin_transactions t '+join+' WHERE t.month>=? AND t.month<=? AND '+where+" AND t.type='expense' AND t.status='paid' AND t.active=1").get(fromM,toM,...p);
  const balance=db.prepare('SELECT COALESCE(SUM(a.balance),0) as v FROM fin_accounts a WHERE (a.user_id=? OR a.family=1) AND a.active=1'+(owner_type==='pf'||owner_type==='pj'?' AND a.owner_type=?':'')).get(uid,...(owner_type==='pf'||owner_type==='pj'?[owner_type]:[]));

  res.json({monthly,projection,byCategory,totals:{income:income.v,expense:expense.v,result:income.v-expense.v,balance:balance.v},period:{from:fromM,to:toM}});
});

app.get('/api/reports/transactions', auth, perm('finance','view'), (req,res) => {
  const {from,to,owner_type,family,type,status,category_id,account_id}=req.query;
  const fromM=from||'2024-01', toM=to||'2099-12';
  const uid=req.user.id; const isFamily=family==='true';
  let q='SELECT t.*,c.name as cat_name,c.icon as cat_icon,a.name as acc_name,a.owner_type as acc_type,u.name as owner_name FROM fin_transactions t LEFT JOIN fin_categories c ON t.category_id=c.id JOIN fin_accounts a ON t.account_id=a.id JOIN users u ON t.user_id=u.id WHERE t.active=1';
  const p=[];
  if (isFamily){q+=' AND (t.user_id=? OR a.family=1)';p.push(uid);}
  else{q+=' AND t.user_id=?';p.push(uid);}
  if (from){q+=' AND t.month>=?';p.push(fromM);}
  if (to){q+=' AND t.month<=?';p.push(toM);}
  if (type){q+=' AND t.type=?';p.push(type);}
  if (status){q+=' AND t.status=?';p.push(status);}
  if (category_id){q+=' AND t.category_id=?';p.push(category_id);}
  if (account_id){q+=' AND t.account_id=?';p.push(account_id);}
  if (owner_type==='pf'||owner_type==='pj'){q+=' AND a.owner_type=?';p.push(owner_type);}
  q+=' ORDER BY t.due_date DESC,t.id DESC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/reports/risks', auth, perm('finance','view'), (req,res) => {
  const uid=req.user.id; const month=monthStr(); const risks=[];
  const negAccs=db.prepare('SELECT name,balance FROM fin_accounts WHERE (user_id=? OR family=1) AND active=1 AND balance<0').all(uid);
  if (negAccs.length>0) risks.push({level:'critical',icon:'🔴',title:'Contas com saldo negativo',detail:negAccs.map(a=>a.name+': '+a.balance.toFixed(2)).join(', ')});
  const income=db.prepare(`SELECT COALESCE(SUM(COALESCE(paid_amount,amount)),0) as v FROM fin_transactions WHERE user_id=? AND month=? AND type='income' AND status='received'`).get(uid,month);
  const expense=db.prepare(`SELECT COALESCE(SUM(COALESCE(paid_amount,amount)),0) as v FROM fin_transactions WHERE user_id=? AND month=? AND type='expense' AND status='paid'`).get(uid,month);
  if (income.v>0){
    const pct=expense.v/income.v*100;
    if (pct>100) risks.push({level:'critical',icon:'🔴',title:'Despesas excedem receitas',detail:'Comprometimento: '+pct.toFixed(0)+'%'});
    else if (pct>85) risks.push({level:'warning',icon:'🟡',title:'Despesas altas',detail:'Comprometimento: '+pct.toFixed(0)+'%'});
    else risks.push({level:'ok',icon:'🟢',title:'Despesas controladas',detail:'Comprometimento: '+pct.toFixed(0)+'%'});
  }
  const overdue=db.prepare(`SELECT COUNT(*) as v,COALESCE(SUM(amount),0) as total FROM fin_transactions WHERE user_id=? AND status='pending' AND due_date<date('now') AND type='expense'`).get(uid);
  if (overdue.v>0) risks.push({level:'warning',icon:'🟡',title:overdue.v+' despesa(s) vencida(s) não paga(s)',detail:'Total: R$ '+overdue.total.toFixed(2)});
  const totalBal=db.prepare('SELECT COALESCE(SUM(balance),0) as v FROM fin_accounts WHERE (user_id=? OR family=1) AND active=1').get(uid);
  const avgExp=db.prepare(`SELECT COALESCE(AVG(total),0) as v FROM (SELECT month,SUM(COALESCE(paid_amount,amount)) as total FROM fin_transactions WHERE user_id=? AND type='expense' AND status='paid' GROUP BY month ORDER BY month DESC LIMIT 3)`).get(uid);
  const months=avgExp.v>0?totalBal.v/avgExp.v:0;
  if (months<1) risks.push({level:'critical',icon:'🔴',title:'Reserva de emergência insuficiente',detail:'Saldo cobre '+months.toFixed(1)+' mês de despesas'});
  else if (months<3) risks.push({level:'warning',icon:'🟡',title:'Reserva de emergência baixa',detail:'Saldo cobre '+months.toFixed(1)+' meses (meta: 6)'});
  else risks.push({level:'ok',icon:'🟢',title:'Reserva de emergência',detail:'Saldo cobre '+months.toFixed(1)+' meses'});
  res.json(risks);
});

// ── INVESTIMENTOS ──────────────────────────────────────────────
app.get('/api/invest/goals', auth, perm('invest','view'), (req,res) => res.json(db.prepare('SELECT * FROM inv_goals WHERE user_id=? ORDER BY created_at DESC').all(req.user.id)));
app.post('/api/invest/goals', auth, perm('invest','edit'), (req,res) => {
  const {name,target_amount,current_amount=0,target_date,monthly_contribution=0,category='geral',notes}=req.body;
  if (!name||!target_amount) return res.status(400).json({error:'Nome e valor alvo obrigatórios'});
  const id=db.prepare('INSERT INTO inv_goals(user_id,name,target_amount,current_amount,target_date,monthly_contribution,category,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(req.user.id,name,target_amount,current_amount,target_date||null,monthly_contribution,category,notes||null,nowStr()).lastInsertRowid;
  res.json({id,ok:true});
});
app.put('/api/invest/goals/:id', auth, perm('invest','edit'), (req,res) => {
  const {name,target_amount,current_amount,target_date,monthly_contribution,category,notes}=req.body;
  db.prepare('UPDATE inv_goals SET name=?,target_amount=?,current_amount=?,target_date=?,monthly_contribution=?,category=?,notes=? WHERE id=? AND user_id=?').run(name,target_amount,current_amount,target_date||null,monthly_contribution,category,notes||null,req.params.id,req.user.id);
  res.json({ok:true});
});
app.delete('/api/invest/goals/:id', auth, perm('invest','edit'), (req,res) => {
  db.prepare('DELETE FROM inv_goals WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  res.json({ok:true});
});
app.get('/api/invest/portfolio', auth, perm('invest','view'), (req,res) => res.json(db.prepare('SELECT * FROM inv_portfolio WHERE user_id=? ORDER BY type,name').all(req.user.id)));
app.post('/api/invest/portfolio', auth, perm('invest','edit'), (req,res) => {
  const {name,ticker,type,quantity,avg_price,current_price,invested_amount,notes}=req.body;
  if (!name||!type) return res.status(400).json({error:'Nome e tipo obrigatórios'});
  const id=db.prepare('INSERT INTO inv_portfolio(user_id,name,ticker,type,quantity,avg_price,current_price,invested_amount,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id,name,ticker||null,type,quantity||null,avg_price||null,current_price||null,invested_amount||0,notes||null,nowStr(),nowStr()).lastInsertRowid;
  res.json({id,ok:true});
});
app.put('/api/invest/portfolio/:id', auth, perm('invest','edit'), (req,res) => {
  const {name,ticker,type,quantity,avg_price,current_price,invested_amount,notes}=req.body;
  db.prepare('UPDATE inv_portfolio SET name=?,ticker=?,type=?,quantity=?,avg_price=?,current_price=?,invested_amount=?,notes=?,updated_at=? WHERE id=? AND user_id=?').run(name,ticker||null,type,quantity||null,avg_price||null,current_price||null,invested_amount||0,notes||null,nowStr(),req.params.id,req.user.id);
  res.json({ok:true});
});
app.delete('/api/invest/portfolio/:id', auth, perm('invest','edit'), (req,res) => {
  db.prepare('DELETE FROM inv_portfolio WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  res.json({ok:true});
});
app.post('/api/invest/simulate', auth, (req,res) => {
  const {initial=0,monthly=0,rate_annual,months=12}=req.body;
  const rate=Math.pow(1+rate_annual/100,1/12)-1;
  let balance=parseFloat(initial); const series=[];
  for (let i=1;i<=months;i++){balance=balance*(1+rate)+parseFloat(monthly);if(i%Math.max(1,Math.floor(months/12))===0||i===months)series.push({month:i,balance:Math.round(balance*100)/100});}
  const invested=parseFloat(initial)+parseFloat(monthly)*months;
  res.json({final:Math.round(balance*100)/100,total_invested:invested,earnings:Math.round((balance-invested)*100)/100,series});
});

// ── BACKUP ─────────────────────────────────────────────────────
app.get('/api/admin/backup/info', auth, adminOnly, (req,res) => {
  const stat=fs.statSync(DB_PATH);
  const users=db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const txs=db.prepare('SELECT COUNT(*) as c FROM fin_transactions').get().c;
  const tasks=db.prepare('SELECT COUNT(*) as c FROM task_progress').get().c;
  res.json({size_kb:Math.round(stat.size/1024),modified:stat.mtime,records:{users,transactions:txs,task_progress:tasks}});
});
app.get('/api/admin/backup/download', auth, adminOnly, (req,res) => {
  try{db.pragma('wal_checkpoint(FULL)');}catch{}
  const os=require('os'), now=new Date();
  const stamp=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'_'+String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0');
  const tmp=path.join(os.tmpdir(),'ballet_backup_'+stamp+'.db');
  fs.copyFileSync(DB_PATH,tmp);
  res.setHeader('Content-Disposition','attachment; filename="ballet_backup_'+stamp+'.db"');
  res.setHeader('Content-Type','application/octet-stream');
  res.sendFile(tmp,err=>{try{fs.unlinkSync(tmp);}catch{}});
});

// ── PÁGINAS ────────────────────────────────────────────────────
const pages = {
  '/':'/index.html', '/home':'/home.html', '/app':'/app.html',
  '/finance':'/finance.html', '/invest':'/invest.html',
  '/dashboard':'/dashboard.html', '/admin':'/admin.html',
  '/categorias':'/categorias.html', '/backup':'/backup.html',
  '/perfil':'/perfil.html', '/relatorios':'/relatorios.html',
  '/voz':'/voz.html',
  '/contas':'/contas.html',
};
Object.entries(pages).forEach(([route,file]) =>
  app.get(route,(req,res)=>res.sendFile(path.join(__dirname,'public',file))));


db.exec(`
  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS fin_debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    initial_amount REAL NOT NULL DEFAULT 0,
    current_balance REAL NOT NULL,
    monthly_payment REAL NOT NULL,
    interest_rate REAL DEFAULT 0,
    bank TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS fin_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    monthly_target REAL NOT NULL,
    target_date TEXT,
    owner_type TEXT DEFAULT 'pj',
    icon TEXT DEFAULT '🪣',
    color TEXT DEFAULT '#0F6E56',
    active INTEGER DEFAULT 1,
    created_at TEXT
  );
`);

(function seedPlanningData() {
  const now = new Date().toISOString().replace('T',' ').slice(0,19);
  const gCount = db.prepare('SELECT COUNT(*) as c FROM fin_goals WHERE user_id=1').get();
  if (gCount.c === 0) {
    db.prepare("INSERT INTO fin_goals(user_id,name,target_amount,monthly_target,target_date,owner_type,icon,color,created_at) VALUES(1,'Reserva Emergência PF',15000,312.50,'2030-06-01','pf','🛡️','#185FA5',?)").run(now);
    db.prepare("INSERT INTO fin_goals(user_id,name,target_amount,monthly_target,target_date,owner_type,icon,color,created_at) VALUES(1,'Reserva Studio',20000,833.33,'2028-06-01','pj','🏫','#0F6E56',?)").run(now);
  }
  const dCount = db.prepare('SELECT COUNT(*) as c FROM fin_debts WHERE user_id=1').get();
  if (dCount.c === 0) {
    db.prepare("INSERT INTO fin_debts(user_id,name,initial_amount,current_balance,monthly_payment,interest_rate,bank,created_at) VALUES(1,'Empréstimo SICOOB',15000,15000,833,1.8,'SICOOB',?)").run(now);
    db.prepare("INSERT INTO fin_debts(user_id,name,initial_amount,current_balance,monthly_payment,interest_rate,bank,created_at) VALUES(1,'Fundo SP',8000,8000,491,1.5,'Fundo SP',?)").run(now);
  }
})();

app.get('/api/admin/settings', auth, (req,res) => {
  if (req.user.role !== 'admin') return res.status(403).json({error:'Apenas admin'});
  const rows = db.prepare('SELECT key,value FROM admin_settings').all();
  const s = {}; rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});
app.post('/api/admin/settings', auth, (req,res) => {
  if (req.user.role !== 'admin') return res.status(403).json({error:'Apenas admin'});
  const {key, value} = req.body;
  db.prepare("INSERT INTO admin_settings(key,value,updated_at) VALUES(?,?,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key, value);
  res.json({ok:true});
});

app.get('/api/planning/debts', auth, (req,res) => res.json(db.prepare('SELECT * FROM fin_debts WHERE user_id=? AND active=1 ORDER BY current_balance DESC').all(req.user.id)));
app.post('/api/planning/debts', auth, (req,res) => {
  const {name,initial_amount,current_balance,monthly_payment,interest_rate=0,bank,notes} = req.body;
  if (!name||!monthly_payment) return res.status(400).json({error:'Campos obrigatórios'});
  const id = db.prepare("INSERT INTO fin_debts(user_id,name,initial_amount,current_balance,monthly_payment,interest_rate,bank,notes,created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now','localtime'))").run(req.user.id,name,initial_amount||current_balance,current_balance||initial_amount,monthly_payment,interest_rate,bank||null,notes||null).lastInsertRowid;
  res.json({id,ok:true});
});
app.put('/api/planning/debts/:id', auth, (req,res) => {
  const {name,current_balance,monthly_payment,interest_rate,bank,notes} = req.body;
  db.prepare('UPDATE fin_debts SET name=?,current_balance=?,monthly_payment=?,interest_rate=?,bank=?,notes=? WHERE id=? AND user_id=?').run(name,current_balance,monthly_payment,interest_rate||0,bank||null,notes||null,req.params.id,req.user.id);
  res.json({ok:true});
});
app.delete('/api/planning/debts/:id', auth, (req,res) => {
  db.prepare('UPDATE fin_debts SET active=0 WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  res.json({ok:true});
});

app.get('/api/planning/goals', auth, (req,res) => res.json(db.prepare('SELECT * FROM fin_goals WHERE user_id=? AND active=1 ORDER BY target_date').all(req.user.id)));
app.post('/api/planning/goals', auth, (req,res) => {
  const {name,target_amount,current_amount=0,monthly_target,target_date,owner_type='pj',icon='🪣',color='#0F6E56'} = req.body;
  if (!name||!target_amount||!monthly_target) return res.status(400).json({error:'Campos obrigatórios'});
  const id = db.prepare("INSERT INTO fin_goals(user_id,name,target_amount,current_amount,monthly_target,target_date,owner_type,icon,color,created_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now','localtime'))").run(req.user.id,name,target_amount,current_amount,monthly_target,target_date||null,owner_type,icon,color).lastInsertRowid;
  res.json({id,ok:true});
});
app.put('/api/planning/goals/:id', auth, (req,res) => {
  const {name,target_amount,current_amount,monthly_target,target_date,owner_type,icon,color} = req.body;
  db.prepare('UPDATE fin_goals SET name=?,target_amount=?,current_amount=?,monthly_target=?,target_date=?,owner_type=?,icon=?,color=? WHERE id=? AND user_id=?').run(name,target_amount,current_amount,monthly_target,target_date||null,owner_type||'pj',icon||'🪣',color||'#0F6E56',req.params.id,req.user.id);
  res.json({ok:true});
});
app.delete('/api/planning/goals/:id', auth, (req,res) => {
  db.prepare('UPDATE fin_goals SET active=0 WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  res.json({ok:true});
});

app.get('/api/planning/score', auth, (req,res) => {
  const uid = req.user.id;
  const m3ago = new Date(); m3ago.setMonth(m3ago.getMonth()-3);
  const m3str = m3ago.toISOString().slice(0,7);
  const income3  = db.prepare(`SELECT COALESCE(AVG(t),0) as v FROM (SELECT SUM(COALESCE(paid_amount,amount)) as t FROM fin_transactions WHERE user_id=? AND type='income' AND status='received' AND month>=? GROUP BY month)`).get(uid,m3str);
  const expense3 = db.prepare(`SELECT COALESCE(AVG(t),0) as v FROM (SELECT SUM(COALESCE(paid_amount,amount)) as t FROM fin_transactions WHERE user_id=? AND type='expense' AND status='paid' AND month>=? GROUP BY month)`).get(uid,m3str);
  const debts    = db.prepare('SELECT SUM(current_balance) as total, SUM(monthly_payment) as monthly FROM fin_debts WHERE user_id=? AND active=1').get(uid);
  const goals2   = db.prepare('SELECT SUM(current_amount) as saved, SUM(target_amount) as target FROM fin_goals WHERE user_id=? AND active=1').get(uid);
  const balance  = db.prepare('SELECT COALESCE(SUM(balance),0) as v FROM fin_accounts WHERE (user_id=? OR family=1) AND active=1').get(uid);
  const avgInc=income3.v||0, avgExp=expense3.v||0, debtTotal=debts?.total||0, debtMon=debts?.monthly||0, goalSaved=goals2?.saved||0, goalTarget=goals2?.target||1, bal=balance.v||0;
  let score=50; const items=[];
  const commitment=avgInc>0?(avgExp+debtMon)/avgInc:1;
  if(commitment<0.5){score+=25;items.push({icon:'🟢',label:'Despesas bem controladas',detail:`${(commitment*100).toFixed(0)}% da renda comprometida`,pts:25});}
  else if(commitment<0.7){score+=15;items.push({icon:'🟡',label:'Despesas moderadas',detail:`${(commitment*100).toFixed(0)}% comprometido`,pts:15});}
  else if(commitment<0.9){score+=5;items.push({icon:'🟠',label:'Despesas altas',detail:`${(commitment*100).toFixed(0)}% comprometido`,pts:5});}
  else{score-=10;items.push({icon:'🔴',label:'Despesas excedem renda',detail:`${(commitment*100).toFixed(0)}% comprometido`,pts:-10});}
  const months=avgExp>0?bal/avgExp:0;
  if(months>=6){score+=25;items.push({icon:'🟢',label:'Reserva excelente',detail:`Cobre ${months.toFixed(1)} meses`,pts:25});}
  else if(months>=3){score+=15;items.push({icon:'🟡',label:'Reserva adequada',detail:`Cobre ${months.toFixed(1)} meses`,pts:15});}
  else if(months>=1){score+=5;items.push({icon:'🟠',label:'Reserva insuficiente',detail:`Cobre ${months.toFixed(1)} mês`,pts:5});}
  else{score-=5;items.push({icon:'🔴',label:'Sem reserva',detail:'Risco em imprevistos',pts:-5});}
  const gPct=goalTarget>0?goalSaved/goalTarget:0;
  if(gPct>0.5){score+=20;items.push({icon:'🟢',label:'Metas avançando bem',detail:`${(gPct*100).toFixed(0)}% atingido`,pts:20});}
  else if(gPct>0.2){score+=10;items.push({icon:'🟡',label:'Metas em progresso',detail:`${(gPct*100).toFixed(0)}% atingido`,pts:10});}
  else{score+=2;items.push({icon:'🟠',label:'Metas iniciais',detail:`${(gPct*100).toFixed(0)}% atingido`,pts:2});}
  if(debtTotal===0){score+=15;items.push({icon:'🟢',label:'Sem dívidas',detail:'Excelente!',pts:15});}
  else if(avgInc>0&&debtMon/avgInc<0.3){score+=10;items.push({icon:'🟡',label:'Dívidas controladas',detail:`${(debtMon/avgInc*100).toFixed(0)}% da renda`,pts:10});}
  else{score+=3;items.push({icon:'🔴',label:'Dívidas altas',detail:avgInc>0?`${(debtMon/avgInc*100).toFixed(0)}% da renda`:'',pts:3});}
  score=Math.max(0,Math.min(100,score));
  const label=score>=80?'Excelente':score>=60?'Bom':score>=40?'Regular':'Atenção';
  const color=score>=80?'#3B6D11':score>=60?'#185FA5':score>=40?'#C05C00':'#A32D2D';
  res.json({score,label,color,items,avgInc,avgExp,debtTotal,debtMon,bal,commitment,months,goalPct:gPct,goalSaved,goalTarget});
});

app.get('/api/planning/cashflow', auth, (req,res) => {
  const uid = req.user.id;
  const now = new Date();
  const months = [];
  for(let i=-2;i<=11;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1);months.push(d.toISOString().slice(0,7));}
  const result = months.map(m => {
    const inc  = db.prepare(`SELECT COALESCE(SUM(COALESCE(paid_amount,amount)),0) as v FROM fin_transactions WHERE user_id=? AND month=? AND type='income' AND status='received'`).get(uid,m);
    const exp  = db.prepare(`SELECT COALESCE(SUM(COALESCE(paid_amount,amount)),0) as v FROM fin_transactions WHERE user_id=? AND month=? AND type='expense' AND status='paid'`).get(uid,m);
    const pend = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM fin_transactions WHERE user_id=? AND month=? AND status='pending'`).get(uid,m);
    return {month:m,income:inc.v,expense:exp.v,pending:pend.v,result:inc.v-exp.v};
  });
  res.json(result);
});

app.post('/api/planning/chat', auth, async (req,res) => {
  const {messages} = req.body;
  if(!messages?.length) return res.status(400).json({error:'Mensagens obrigatórias'});
  const setting = db.prepare("SELECT value FROM admin_settings WHERE key='groq_api_key'").get();
  if(!setting?.value) return res.status(400).json({error:'Configure a chave Groq em Administração → aba IA'});
  const uid = req.user.id;
  const debts2 = db.prepare('SELECT name,current_balance,monthly_payment FROM fin_debts WHERE user_id=? AND active=1').all(uid);
  const goals3 = db.prepare('SELECT name,target_amount,current_amount,monthly_target FROM fin_goals WHERE user_id=? AND active=1').all(uid);
  const bal2   = db.prepare('SELECT COALESCE(SUM(balance),0) as v FROM fin_accounts WHERE (user_id=? OR family=1) AND active=1').get(uid);
  const mn     = new Date().toISOString().slice(0,7);
  const inc2   = db.prepare(`SELECT COALESCE(SUM(COALESCE(paid_amount,amount)),0) as v FROM fin_transactions WHERE user_id=? AND month=? AND type='income' AND status='received'`).get(uid,mn);
  const exp2   = db.prepare(`SELECT COALESCE(SUM(COALESCE(paid_amount,amount)),0) as v FROM fin_transactions WHERE user_id=? AND month=? AND type='expense' AND status='paid'`).get(uid,mn);
  const context = `Você é assistente financeiro do Ballet Luana Dias / Gestão Financeira SL. Dados reais (${new Date().toLocaleDateString('pt-BR')}): Saldo total: R$${bal2.v.toFixed(2)}. Receitas em ${mn}: R$${inc2.v.toFixed(2)}. Despesas em ${mn}: R$${exp2.v.toFixed(2)}. Dívidas: ${debts2.map(d=>d.name+' saldo R$'+d.current_balance+' parcela R$'+d.monthly_payment+'/mês').join('; ')||'nenhuma'}. Metas: ${goals3.map(g=>g.name+' meta R$'+g.target_amount+' atual R$'+g.current_amount+' R$'+g.monthly_target+'/mês').join('; ')||'nenhuma'}. Meta receita ballet: R$16.000/mês. Responda em português, seja direto e prático.`;
  try {
    const body2 = JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:context},...messages],max_tokens:1024,temperature:0.7});
    const response = await new Promise((resolve,reject) => {
      const opts = {hostname:'api.groq.com',path:'/openai/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+setting.value,'Content-Length':Buffer.byteLength(body2)}};
      const r2 = require('https').request(opts,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{resolve(JSON.parse(d));}catch{reject(new Error('Parse'));}});});
      r2.on('error',reject);r2.write(body2);r2.end();
    });
    if(response.error) return res.status(400).json({error:response.error.message||'Erro Groq'});
    res.json({reply:response.choices?.[0]?.message?.content||'Sem resposta.'});
  } catch(e){res.status(500).json({error:'Erro IA: '+e.message});}
});

app.get('/planejamento',(req,res)=>res.sendFile(require('path').join(__dirname,'public','planejamento.html')));


// ── MODULO COMPRAS (shopping) ────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS shop_markets(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, city TEXT,
  active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS shop_products(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, unit TEXT DEFAULT 'un',
  category TEXT, photo TEXT, active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS shop_lists(
  id INTEGER PRIMARY KEY AUTOINCREMENT, market_id INTEGER, user_id INTEGER,
  status TEXT DEFAULT 'open', date TEXT, total REAL DEFAULT 0, discount REAL DEFAULT 0,
  fin_transaction_id INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS shop_list_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER, product_id INTEGER,
  qty REAL DEFAULT 1, price REAL, in_cart INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS shop_price_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, market_id INTEGER,
  price REAL, date TEXT, list_id INTEGER);
`);

// Catálogo real (semeado só na 1a vez)
if (db.prepare('SELECT COUNT(*) c FROM shop_products').get().c === 0) {
  const CAT = [
    ['Arroz branco','kg','Mercearia'],['Arroz integral','kg','Mercearia'],['Feijão carioca','kg','Mercearia'],
    ['Feijão preto','kg','Mercearia'],['Açúcar refinado','kg','Mercearia'],['Café torrado','pacote','Mercearia'],
    ['Farinha de trigo','kg','Mercearia'],['Farinha de mandioca','kg','Mercearia'],['Macarrão espaguete','pacote','Mercearia'],
    ['Macarrão parafuso','pacote','Mercearia'],['Óleo de soja','un','Mercearia'],['Azeite','un','Mercearia'],
    ['Sal','kg','Mercearia'],['Molho de tomate','un','Mercearia'],['Extrato de tomate','un','Mercearia'],
    ['Milho em conserva','un','Mercearia'],['Ervilha em conserva','un','Mercearia'],['Atum em lata','un','Mercearia'],
    ['Sardinha em lata','un','Mercearia'],['Aveia','pacote','Mercearia'],['Achocolatado em pó','un','Mercearia'],
    ['Biscoito recheado','pacote','Mercearia'],['Bolacha água e sal','pacote','Mercearia'],['Vinagre','un','Mercearia'],
    ['Banana','kg','Hortifruti'],['Maçã','kg','Hortifruti'],['Laranja','kg','Hortifruti'],
    ['Tomate','kg','Hortifruti'],['Batata','kg','Hortifruti'],['Cebola','kg','Hortifruti'],
    ['Alho','kg','Hortifruti'],['Cenoura','kg','Hortifruti'],['Alface','un','Hortifruti'],
    ['Limão','kg','Hortifruti'],['Mamão','kg','Hortifruti'],['Batata-doce','kg','Hortifruti'],
    ['Patinho','kg','Carnes e Aves'],['Coxão mole','kg','Carnes e Aves'],['Acém','kg','Carnes e Aves'],
    ['Carne moída','kg','Carnes e Aves'],['Peito de frango','kg','Carnes e Aves'],['Coxa de frango','kg','Carnes e Aves'],
    ['Linguiça toscana','kg','Carnes e Aves'],['Bacon','kg','Carnes e Aves'],['Costela suína','kg','Carnes e Aves'],
    ['Peixe (filé tilápia)','kg','Carnes e Aves'],
    ['Leite integral','un','Frios e Laticínios'],['Leite desnatado','un','Frios e Laticínios'],['Queijo mussarela','kg','Frios e Laticínios'],
    ['Queijo prato','kg','Frios e Laticínios'],['Presunto','kg','Frios e Laticínios'],['Manteiga','un','Frios e Laticínios'],
    ['Margarina','un','Frios e Laticínios'],['Requeijão','un','Frios e Laticínios'],['Iogurte','un','Frios e Laticínios'],
    ['Ovos','dúzia','Frios e Laticínios'],['Creme de leite','un','Frios e Laticínios'],['Leite condensado','un','Frios e Laticínios'],
    ['Pão de forma','un','Padaria'],['Pão francês','kg','Padaria'],['Pão de queijo','kg','Padaria'],['Bolo','un','Padaria'],
    ['Refrigerante','un','Bebidas'],['Suco de caixa','un','Bebidas'],['Água mineral','un','Bebidas'],
    ['Cerveja','un','Bebidas'],['Suco em pó','un','Bebidas'],['Chá','un','Bebidas'],
    ['Detergente','un','Limpeza'],['Sabão em pó','kg','Limpeza'],['Sabão em barra','un','Limpeza'],
    ['Amaciante','un','Limpeza'],['Desinfetante','un','Limpeza'],['Água sanitária','un','Limpeza'],
    ['Esponja de aço','pacote','Limpeza'],['Saco de lixo','pacote','Limpeza'],['Papel toalha','un','Limpeza'],
    ['Papel higiênico','pacote','Higiene'],['Sabonete','un','Higiene'],['Shampoo','un','Higiene'],
    ['Condicionador','un','Higiene'],['Creme dental','un','Higiene'],['Desodorante','un','Higiene'],
    ['Hambúrguer congelado','pacote','Congelados'],['Batata congelada','pacote','Congelados'],['Pizza congelada','un','Congelados'],
    ['Ração','kg','Pet/Outros'],['Carvão','pacote','Pet/Outros']
  ];
  const ins = db.prepare('INSERT INTO shop_products(name,unit,category) VALUES(?,?,?)');
  const tx = db.transaction(rows => rows.forEach(r => ins.run(r[0],r[1],r[2])));
  tx(CAT);
  console.log('✅ Catálogo de compras semeado: ' + CAT.length + ' produtos.');
}

// Conceder permissão shopping a todos os usuários (admin já passa por tudo)
try {
  const users = db.prepare('SELECT id FROM users').all();
  const insP = db.prepare("INSERT INTO module_permissions(user_id,module,action,enabled) VALUES(?,?,?,1)");
  const hasP = db.prepare("SELECT 1 FROM module_permissions WHERE user_id=? AND module=? AND action=?");
  for (const u of users) {
    if(!hasP.get(u.id,'shopping','view'))   insP.run(u.id,'shopping','view');
    if(!hasP.get(u.id,'shopping','manage')) insP.run(u.id,'shopping','manage');
  }
} catch(e){ console.log('shopping perms:', e.message); }

const _today = () => db.prepare("SELECT date('now','localtime') d").get().d;

// Mercados
app.get('/api/shop/markets', auth, perm('shopping','view'), (req,res) =>
  res.json(db.prepare('SELECT * FROM shop_markets WHERE active=1 ORDER BY name').all()));
app.post('/api/shop/markets', auth, perm('shopping','manage'), (req,res) => {
  const {name,city} = req.body; if(!name) return res.status(400).json({error:'Nome obrigatório'});
  const id = db.prepare('INSERT INTO shop_markets(name,city) VALUES(?,?)').run(name,city||null).lastInsertRowid;
  res.json({id});
});
app.put('/api/shop/markets/:id', auth, perm('shopping','manage'), (req,res) => {
  const {name,city,active=1} = req.body;
  db.prepare('UPDATE shop_markets SET name=?,city=?,active=? WHERE id=?').run(name,city||null,active?1:0,req.params.id);
  res.json({ok:1});
});
app.delete('/api/shop/markets/:id', auth, perm('shopping','manage'), (req,res) => {
  db.prepare('UPDATE shop_markets SET active=0 WHERE id=?').run(req.params.id); res.json({ok:1}); });

// Produtos (catálogo)
app.get('/api/shop/products', auth, perm('shopping','view'), (req,res) =>
  res.json(db.prepare('SELECT * FROM shop_products WHERE active=1 ORDER BY category,name').all()));
app.post('/api/shop/products', auth, perm('shopping','manage'), (req,res) => {
  const {name,unit='un',category} = req.body; if(!name) return res.status(400).json({error:'Nome obrigatório'});
  const id = db.prepare('INSERT INTO shop_products(name,unit,category) VALUES(?,?,?)').run(name,unit||'un',category||null).lastInsertRowid;
  res.json({id});
});
app.put('/api/shop/products/:id', auth, perm('shopping','manage'), (req,res) => {
  const {name,unit,category,active=1} = req.body;
  db.prepare('UPDATE shop_products SET name=?,unit=?,category=?,active=? WHERE id=?').run(name,unit||'un',category||null,active?1:0,req.params.id);
  res.json({ok:1});
});
app.delete('/api/shop/products/:id', auth, perm('shopping','manage'), (req,res) => {
  db.prepare('UPDATE shop_products SET active=0 WHERE id=?').run(req.params.id); res.json({ok:1}); });
// Foto (cliente envia JPEG já redimensionado ~400px em base64)
app.post('/api/shop/products/:id/photo', auth, perm('shopping','manage'), (req,res) => {
  const {photo} = req.body;
  if(!photo || !/^data:image\//.test(photo)) return res.status(400).json({error:'Imagem inválida'});
  const dir = path.join(__dirname,'public','uploads','produtos');
  try { require('fs').mkdirSync(dir,{recursive:true}); } catch{}
  const b64 = photo.replace(/^data:image\/\w+;base64,/,'');
  const rel = '/uploads/produtos/'+req.params.id+'.jpg';
  require('fs').writeFileSync(path.join(__dirname,'public',rel.slice(1)), Buffer.from(b64,'base64'));
  db.prepare('UPDATE shop_products SET photo=? WHERE id=?').run(rel,req.params.id);
  res.json({photo:rel});
});

// Listas
app.get('/api/shop/lists', auth, perm('shopping','view'), (req,res) => {
  const st = req.query.status;
  const rows = db.prepare('SELECT l.*, m.name as market_name FROM shop_lists l LEFT JOIN shop_markets m ON m.id=l.market_id'
    + (st?' WHERE l.status=?':'') + ' ORDER BY l.id DESC LIMIT 50').all(...(st?[st]:[]));
  res.json(rows);
});
app.post('/api/shop/lists', auth, perm('shopping','manage'), (req,res) => {
  const {market_id} = req.body; if(!market_id) return res.status(400).json({error:'Mercado obrigatório'});
  const id = db.prepare("INSERT INTO shop_lists(market_id,user_id,status,date) VALUES(?,?,'open',?)").run(market_id,req.user.id,_today()).lastInsertRowid;
  res.json({id});
});
app.get('/api/shop/lists/:id', auth, perm('shopping','view'), (req,res) => {
  const list = db.prepare('SELECT l.*, m.name as market_name FROM shop_lists l LEFT JOIN shop_markets m ON m.id=l.market_id WHERE l.id=?').get(req.params.id);
  if(!list) return res.status(404).json({error:'Lista não encontrada'});
  const items = db.prepare('SELECT i.*, p.name, p.unit, p.category, p.photo FROM shop_list_items i JOIN shop_products p ON p.id=i.product_id WHERE i.list_id=? ORDER BY p.category,p.name').all(list.id);
  res.json({list,items});
});
app.delete('/api/shop/lists/:id', auth, perm('shopping','manage'), (req,res) => {
  db.prepare('DELETE FROM shop_list_items WHERE list_id=?').run(req.params.id);
  db.prepare("DELETE FROM shop_lists WHERE id=?").run(req.params.id);
  res.json({ok:1});
});
app.post('/api/shop/lists/:id/items', auth, perm('shopping','manage'), (req,res) => {
  const {product_id,qty=1} = req.body; if(!product_id) return res.status(400).json({error:'Produto obrigatório'});
  const ex = db.prepare('SELECT id FROM shop_list_items WHERE list_id=? AND product_id=?').get(req.params.id,product_id);
  if(ex) return res.json({id:ex.id,dup:1});
  const id = db.prepare('INSERT INTO shop_list_items(list_id,product_id,qty) VALUES(?,?,?)').run(req.params.id,product_id,qty).lastInsertRowid;
  res.json({id});
});
app.put('/api/shop/list-items/:id', auth, perm('shopping','manage'), (req,res) => {
  const cur = db.prepare('SELECT * FROM shop_list_items WHERE id=?').get(req.params.id);
  if(!cur) return res.status(404).json({error:'Item não encontrado'});
  const qty = req.body.qty!=null?req.body.qty:cur.qty;
  const price = req.body.price!=null?req.body.price:cur.price;
  const in_cart = req.body.in_cart!=null?(req.body.in_cart?1:0):cur.in_cart;
  db.prepare('UPDATE shop_list_items SET qty=?,price=?,in_cart=? WHERE id=?').run(qty,price,in_cart,req.params.id);
  res.json({ok:1});
});
app.delete('/api/shop/list-items/:id', auth, perm('shopping','manage'), (req,res) => {
  db.prepare('DELETE FROM shop_list_items WHERE id=?').run(req.params.id); res.json({ok:1}); });

// Pagar (finaliza → despesa paga + débito de saldo + histórico)
app.post('/api/shop/lists/:id/pay', auth, perm('shopping','manage'), (req,res) => {
  const {account_id,category_id,discount=0} = req.body;
  if(!account_id) return res.status(400).json({error:'Conta obrigatória'});
  const list = db.prepare('SELECT * FROM shop_lists WHERE id=?').get(req.params.id);
  if(!list) return res.status(404).json({error:'Lista não encontrada'});
  if(list.status==='paid') return res.status(400).json({error:'Lista já paga'});
  const items = db.prepare('SELECT * FROM shop_list_items WHERE list_id=? AND in_cart=1').all(list.id);
  if(!items.length) return res.status(400).json({error:'Nenhum item no carrinho'});
  const subtotal = items.reduce((s,it)=> s + (it.price||0)*(it.qty||1), 0);
  const disc = parseFloat(discount)||0;
  const total = Math.round((subtotal-disc)*100)/100;
  const acc = db.prepare('SELECT owner_type FROM fin_accounts WHERE id=?').get(account_id);
  const mkt = db.prepare('SELECT name FROM shop_markets WHERE id=?').get(list.market_id);
  const today = _today(); const month = today.slice(0,7);
  const tx = db.prepare(`INSERT INTO fin_transactions(user_id,account_id,category_id,type,amount,description,due_date,month,status,paid_at,paid_amount,discount_amount,owner_type,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id,account_id,category_id||null,'expense',total,'Compra'+(mkt?' — '+mkt.name:''),today,month,'paid',today,total,disc,acc?.owner_type||'pj',items.length+' itens',today).lastInsertRowid;
  updateBalance(account_id,total,'expense','apply');
  const hist = db.prepare('INSERT INTO shop_price_history(product_id,market_id,price,date,list_id) VALUES(?,?,?,?,?)');
  for(const it of items){ if(it.price>0) hist.run(it.product_id,list.market_id,it.price,today,list.id); }
  db.prepare("UPDATE shop_lists SET status='paid',total=?,discount=?,fin_transaction_id=? WHERE id=?").run(total,disc,tx,list.id);
  res.json({total,transaction_id:tx});
});

// Inteligência de preço
app.get('/api/shop/price-check', auth, perm('shopping','view'), (req,res) => {
  const {product_id,market_id,price} = req.query;
  const row = db.prepare(`SELECT m.name, MIN(h.price) min_price, MAX(h.date) last_date
    FROM shop_price_history h JOIN shop_markets m ON m.id=h.market_id
    WHERE h.product_id=? AND h.market_id<>? GROUP BY h.market_id ORDER BY min_price ASC LIMIT 1`).get(product_id,market_id);
  if(row && price && row.min_price < parseFloat(price))
    return res.json({cheaper:true,market:row.name,price:row.min_price,date:row.last_date,save:Math.round((parseFloat(price)-row.min_price)*100)/100});
  res.json({cheaper:false});
});
app.get('/api/shop/product-prices/:id', auth, perm('shopping','view'), (req,res) =>
  res.json(db.prepare(`SELECT m.name market, h.price, h.date FROM shop_price_history h JOIN shop_markets m ON m.id=h.market_id WHERE h.product_id=? ORDER BY h.date DESC LIMIT 20`).all(req.params.id)));

// Página
app.get('/compras',(req,res)=>res.sendFile(path.join(__dirname,'public','compras.html')));
// ── FIM MODULO COMPRAS ───────────────────────────────────────

server.listen(PORT,'0.0.0.0',()=>console.log('✅ Gestão Financeira SL v2.0 — porta '+PORT));
