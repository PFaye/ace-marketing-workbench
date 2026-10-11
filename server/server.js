// ACE 营销工作台 · 后端：静态页面 + 数据存储 + 大模型代理 + 投放监测定时任务 + 群机器人推送
// 零依赖，Node 18+。环境变量见 docs/部署指南.md。
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Store } = require("./lib/store");
const llm = require("./lib/llm");
const monitor = require("./lib/monitor");
const { runConnector, maskConfig } = require("./lib/connectors");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const PORT = Number(process.env.PORT || 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const TZ = process.env.TZ_NAME || "Asia/Shanghai";
const PUBLIC_GENERATE = (process.env.PUBLIC_GENERATE || "true") !== "false";
const PUBLIC_DAILY_CAP = Number(process.env.PUBLIC_DAILY_CAP || 300);

const { materialize, stripDemo } = require("./lib/seed");
let seed = {}; try { seed = materialize(JSON.parse(fs.readFileSync(path.join(__dirname, "seed.json"), "utf8")), monitor.todayIn(TZ)); } catch (e) { console.warn("seed.json 未找到或无效，使用空数据启动"); }
const store = new Store(path.join(DATA_DIR, "data.json"), seed);
const db = store.load();
// 首次以示例数据启动：按规则算出示例告警与一份模板日报，让页面打开就是完整状态
if (db.meta && db.meta.seededAt && !db.meta.seedEvaluated) {
  try { if (db.metrics.length) { const d = monitor.latestDate(db.metrics); const ev = monitor.evaluateRules(db.rules, db.metrics, d); db.alerts = ev.alerts;
    db.briefs = [{ id: "brief-seed", date: d, text: monitor.templateBrief({ date: d, stats: ev.stats, prevStats: monitor.dayStats(db.metrics, monitor.addDays(d, -1)), alerts: ev.alerts, kolTodo: [], project: db.project }), source: "template", createdAt: new Date().toISOString(), pushed: false, alertCount: ev.alerts.length }]; } } catch (e) { console.warn("示例告警计算失败：", e.message); }
  db.meta.seedEvaluated = true; store.flush();
}

// v3.2 起不再预装示例：旧部署的数据文件第一次用新版本启动时，把示例标记的数据清掉（真实数据保留），之后示例只能在页面上手动载入
if (!db.meta || !db.meta.v2) { stripDemo(db); db.meta = { ...(db.meta || {}), v2: true }; store.flush(); console.log("已升级到空白起点：示例数据已清除（真实数据保留）"); }
const COLLECTIONS = ["kols", "metrics", "rules", "alerts", "briefs", "batches", "connectors", "plan", "project", "insights"];
const SECRET_SETTINGS = ["llmKey"];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".csv": "text/csv; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

const json = (res, status, data) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
const fail = (res, status, message) => json(res, status, { error: message });

const sha = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
function adminHash() { return ADMIN_TOKEN ? sha(ADMIN_TOKEN) : (db.settings && db.settings.adminHash) || ""; }
function setupNeeded() { return !adminHash(); }
function tokenOk(t) { const want = adminHash(); if (!want) return true; if (!t) return false; const got = sha(t); return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want)); }
function authed(req) { const h = req.headers["authorization"] || ""; return tokenOk(h.startsWith("Bearer ") ? h.slice(7) : ""); }
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > limit) { reject(new Error("body too large")); req.destroy(); } }); req.on("end", () => resolve(b)); req.on("error", reject); });
}
async function readJson(req) { const b = await readBody(req); if (!b) return {}; try { return JSON.parse(b); } catch (e) { throw new Error("请求体不是合法 JSON"); } }

function publicSettings() {
  const s = { ...db.settings }; for (const k of SECRET_SETTINGS) delete s[k]; delete s.adminHash;
  if (s.webhook && s.webhook.secret) s.webhook = { ...s.webhook, secret: "••••" };
  if (s.webhook && s.webhook.url) s.webhook = { ...s.webhook, url: s.webhook.url.replace(/(key=|token=|hook\/)([^&]{6})[^&]*/i, "$1$2••••") };
  return s;
}
function stateFor(req) {
  const cfg = llm.llmConfig(db.settings, process.env);
  return { mode: "server", auth: { required: !setupNeeded(), canWrite: authed(req), setupNeeded: setupNeeded() }, llm: { configured: cfg.configured, label: cfg.configured ? (cfg.kind === "anthropic" ? "Anthropic" : "API") + " · " + cfg.model : "", publicGenerate: PUBLIC_GENERATE },
    tz: TZ, now: monitor.todayIn(TZ), settings: publicSettings(), meta: db.meta || {},
    kols: db.kols, metrics: db.metrics, rules: db.rules, alerts: db.alerts, briefs: db.briefs, batches: db.batches, connectors: db.connectors.map(maskConfig), plan: db.plan || null, project: db.project || null, insights: db.insights || [] };
}

// 匿名调用日配额
const capCounter = { date: "", n: 0 };
function capOk() { const d = monitor.todayIn(TZ); if (capCounter.date !== d) { capCounter.date = d; capCounter.n = 0; } if (capCounter.n >= PUBLIC_DAILY_CAP) return false; capCounter.n++; return true; }

async function runMonitor({ date, push, useAi }) {
  const rows = db.metrics || [];
  if (!rows.length) throw new Error("还没有投放数据，请先在「数据接入」导入日报表");
  const d = date || monitor.latestDate(rows);
  const { alerts, stats } = monitor.evaluateRules(db.rules || [], rows, d);
  const prevDate = monitor.addDays(d, -1); const prevStats = rows.some((r) => r.date === prevDate) ? monitor.dayStats(rows, prevDate) : null;
  const kolTodo = (db.kols || []).filter((k) => k.nextFollowUp && k.nextFollowUp <= d && !/已交付|暂不合作/.test(k.status || "")).slice(0, 8).map((k) => ({ name: k.name, platform: k.platform, status: k.status || "待评估", nextFollowUp: k.nextFollowUp }));
  const ctx = { date: d, stats, prevStats, alerts, kolTodo, project: db.project };
  let text, source = "template";
  const cfg = llm.llmConfig(db.settings, process.env);
  if (useAi !== false && cfg.configured) { try { text = await llm.complete(cfg, monitor.aiBriefPrompt(ctx), { maxTokens: 2000 }); source = "ai"; } catch (e) { console.warn("AI 日报失败，回退模板：", e.message); } }
  if (!text) text = monitor.templateBrief(ctx);
  const brief = { id: "b" + Date.now().toString(36), date: d, text, source, createdAt: new Date().toISOString(), pushed: false, pushResult: null, alertCount: alerts.length };
  let pushResult = null;
  if (push && db.settings.webhook && db.settings.webhook.url) {
    try { pushResult = await monitor.pushWebhook(db.settings.webhook, text, "投放日报"); } catch (e) { pushResult = { ok: false, body: e.message }; }
    brief.pushed = !!pushResult.ok; brief.pushResult = pushResult;
  }
  store.update((data) => {
    const existing = new Set(data.alerts.map((a) => a.id));
    for (const a of alerts) if (!existing.has(a.id)) data.alerts.unshift(a);
    data.alerts = data.alerts.slice(0, 500);
    data.briefs.unshift(brief); data.briefs = data.briefs.slice(0, 120);
    data.meta = { ...(data.meta || {}), lastMonitorRun: new Date().toISOString(), lastMonitorDate: d };
  });
  return { date: d, alerts, stats, brief, pushResult };
}

// 定时：每分钟检查一次，到达设定小时且今天未跑过就跑
let lastAutoDate = "";
setInterval(async () => {
  try {
    const s = db.settings || {}; if (!s.autoRun) return;
    const hour = Number(s.dailyHour == null ? 9 : s.dailyHour);
    const now = new Date(); const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour").value), m = Number(parts.find((p) => p.type === "minute").value);
    const today = monitor.todayIn(TZ);
    if (h === hour && m < 2 && lastAutoDate !== today) { lastAutoDate = today; console.log("[cron] 自动运行监测", today); await runMonitor({ push: !!s.autoPush, useAi: true }); }
  } catch (e) { console.warn("[cron] 失败：", e.message); }
}, 60 * 1000);

function toCsv(rows, cols) { const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; return "﻿" + cols.map(esc).join(",") + "\n" + rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n"); }

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, ""); const m = req.method;
  if (p === "/health") return json(res, 200, { ok: true, time: new Date().toISOString() });
  if (p === "/state" && m === "GET") return json(res, 200, stateFor(req));
  if (p === "/auth" && m === "POST") { const b = await readJson(req); const ok = tokenOk(String(b.token || "")); return json(res, ok ? 200 : 401, { ok }); }
  if (p === "/setup" && m === "POST") { // 首次初始化：设管理员口令 + 模型接口（仅在尚未设置口令时允许）
    if (!setupNeeded()) return fail(res, 403, "已经初始化过了，请用口令登录后在「设置」里修改");
    const b = await readJson(req); const token = String(b.token || "").trim(); if (token.length < 4) return fail(res, 400, "口令至少 4 位");
    const next = { ...db.settings, adminHash: sha(token) }; if (b.llm && typeof b.llm === "object") next.llm = { kind: b.llm.kind === "anthropic" ? "anthropic" : "openai", base: String(b.llm.base || "").trim().replace(/\/+$/, ""), model: String(b.llm.model || "").trim() }; if (b.llmKey) next.llmKey = String(b.llmKey).trim();
    store.set("settings", next); store.flush(); return json(res, 200, { ok: true });
  }

  if (p === "/llm/v1/chat/completions" && m === "POST") {
    const cfg = llm.llmConfig(db.settings, process.env);
    if (!cfg.configured) return fail(res, 503, "服务端未配置大模型接口（设置 LLM_BASE / LLM_MODEL / LLM_KEY，或在「设置」里填写）");
    const isAdmin = authed(req);
    if (!isAdmin && !PUBLIC_GENERATE) return fail(res, 401, "需要登录后才能生成");
    if (!isAdmin && !capOk()) return fail(res, 429, "今日匿名生成次数已达上限，请明天再试或登录");
    const body = await readJson(req);
    if (!Array.isArray(body.messages) || !body.messages.length) return fail(res, 400, "messages 不能为空");
    try { if (body.stream) await llm.streamToClient(cfg, body, res); else await llm.completeToClient(cfg, body, res); } catch (e) { if (!res.headersSent) fail(res, 502, "上游接口调用失败：" + e.message); else res.end(); }
    return;
  }

  if (p.startsWith("/export/") && m === "GET") {
    const what = p.slice(8).replace(/\.csv$/, "");
    let text, name;
    if (what === "kols") { text = toCsv(db.kols, ["name", "platform", "category", "city", "followers", "avgViews", "avgEngagements", "engagementRate", "quote", "fitScore", "aiScore", "aiVerdict", "status", "nextFollowUp", "notes", "sourceUrl", "updatedAt"]); name = "达人库.csv"; }
    else if (what === "metrics") { text = toCsv(db.metrics, ["date", "platform", "campaign", "spend", "impressions", "clicks", "conversions", "engagements", "negatives"]); name = "投放数据.csv"; }
    else if (what === "alerts") { text = toCsv(db.alerts, ["date", "level", "scope", "name", "message", "acknowledged"]); name = "告警记录.csv"; }
    else return fail(res, 404, "unknown export");
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(name) }); return res.end(text);
  }

  // ---- 以下需要登录 ----
  if (!authed(req)) return fail(res, 401, "需要登录（管理员口令）才能修改数据");

  const col = p.match(/^\/collections\/([a-z]+)$/);
  if (col && m === "PUT") {
    const name = col[1]; if (!COLLECTIONS.includes(name)) return fail(res, 404, "未知集合 " + name);
    const b = await readJson(req);
    const value = b.rows !== undefined ? b.rows : b.value;
    if (name === "connectors" && Array.isArray(value)) { // 保留被遮罩的密钥
      const old = Object.fromEntries((db.connectors || []).map((c) => [c.id, c]));
      for (const c of value) { const o = old[c.id]; if (!o) continue; c.config = c.config || {}; for (const k of Object.keys(c.config)) if (typeof c.config[k] === "string" && c.config[k].startsWith("••••") && o.config && o.config[k]) c.config[k] = o.config[k]; }
    }
    store.set(name, value); return json(res, 200, { ok: true, count: Array.isArray(value) ? value.length : 1 });
  }
  if (p === "/settings" && m === "PUT") {
    const b = await readJson(req); const next = { ...db.settings };
    for (const [k, v] of Object.entries(b)) {
      if (k === "llmKey") { if (v && !String(v).startsWith("••••")) next.llmKey = v; if (v === "") delete next.llmKey; continue; }
      if (k === "webhook" && v && typeof v === "object") { const w = { ...(next.webhook || {}), ...v }; if (w.secret && String(w.secret).startsWith("••••")) w.secret = (next.webhook || {}).secret || ""; if (w.url && w.url.includes("••••")) w.url = (next.webhook || {}).url || ""; next.webhook = w; continue; }
      next[k] = v;
    }
    store.set("settings", next); return json(res, 200, { ok: true, settings: publicSettings() });
  }
  if (p === "/monitor/run" && m === "POST") { const b = await readJson(req); try { return json(res, 200, await runMonitor(b)); } catch (e) { return fail(res, 400, e.message); } }
  if (p === "/monitor/push" && m === "POST") {
    const b = await readJson(req); const text = b.text || ((db.briefs || []).find((x) => x.id === b.briefId) || {}).text;
    if (!text) return fail(res, 400, "没有可推送的内容");
    try { const r = await monitor.pushWebhook(db.settings.webhook, text); if (b.briefId) store.update((d) => { const x = d.briefs.find((y) => y.id === b.briefId); if (x) { x.pushed = r.ok; x.pushResult = r; } }); return json(res, r.ok ? 200 : 502, r); } catch (e) { return fail(res, 400, e.message); }
  }
  const cr = p.match(/^\/connectors\/([\w-]+)\/run$/);
  if (cr && m === "POST") {
    const conn = (db.connectors || []).find((c) => c.id === cr[1]); if (!conn) return fail(res, 404, "连接器不存在");
    try {
      const { rows, mapping } = await runConnector(conn);
      store.update((d) => {
        if (conn.target === "metrics") { const key = (r) => `${r.date}|${r.platform}|${r.campaign}`; const map = new Map(d.metrics.map((r) => [key(r), r])); for (const r of rows) map.set(key(r), { ...r, source: conn.name }); d.metrics = [...map.values()].sort((a, b) => a.date < b.date ? -1 : 1); }
        else { const key = (r) => `${r.name}|${r.platform}`; const map = new Map(d.kols.map((r) => [key(r), r])); for (const r of rows) { const o = map.get(key(r)); map.set(key(r), { ...(o || { id: "k" + crypto.randomBytes(4).toString("hex"), status: "待评估" }), ...r, source: conn.name }); } d.kols = [...map.values()]; }
        const c = d.connectors.find((x) => x.id === conn.id); if (c) { c.lastRun = new Date().toISOString(); c.lastStatus = `成功导入 ${rows.length} 条`; }
      });
      return json(res, 200, { ok: true, count: rows.length, mapping });
    } catch (e) { store.update((d) => { const c = d.connectors.find((x) => x.id === conn.id); if (c) { c.lastRun = new Date().toISOString(); c.lastStatus = "失败：" + e.message; } }); return fail(res, 400, e.message); }
  }
  if (p === "/webhook/test" && m === "POST") { try { const r = await monitor.pushWebhook(db.settings.webhook, "ACE 营销工作台：群机器人连接测试成功 ✅ " + new Date().toLocaleString("zh-CN", { timeZone: TZ, hour12: false })); return json(res, r.ok ? 200 : 502, r); } catch (e) { return fail(res, 400, e.message); } }
  return fail(res, 404, "未知接口 " + p);
}

function serveStatic(req, res, url) {
  let fp = decodeURIComponent(url.pathname); if (fp === "/" || fp === "") fp = "/index.html";
  const abs = path.normalize(path.join(PUBLIC_DIR, fp));
  if (!abs.startsWith(PUBLIC_DIR)) return fail(res, 403, "forbidden");
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { if (fp !== "/index.html" && !path.extname(fp)) { fp = "/index.html"; return fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e2, d) => { if (e2) return fail(res, 404, "not found"); res.writeHead(200, { "Content-Type": MIME[".html"] }); res.end(d); }); } return fail(res, 404, "not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream", "Cache-Control": fp === "/index.html" ? "no-cache" : "public, max-age=3600" });
    fs.createReadStream(abs).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url); else serveStatic(req, res, url);
  } catch (e) { console.error(e); if (!res.headersSent) fail(res, 500, e.message); else res.end(); }
});
server.listen(PORT, () => {
  console.log(`ACE 营销工作台已启动：http://localhost:${PORT}`);
  console.log(`数据目录 ${DATA_DIR}｜管理员口令 ${adminHash() ? "已设置" : "未设置（打开页面会出现初始化向导）"}｜大模型 ${llm.llmConfig(db.settings, process.env).configured ? "已配置" : "未配置（可在向导或「设置」里填）"}`);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { store.flush(); process.exit(0); });
