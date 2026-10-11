<script>
// ===================== 基础工具 =====================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
const str = (v, fb = "") => (v == null ? fb : typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v));
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const num = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[,，\s]/g, "")); return isFinite(n) ? n : null; };
const uid = (p = "x") => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const todayStr = () => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
const fmtN = (v, d) => { if (v == null || !isFinite(v)) return "-"; const a = Math.abs(v); if (a >= 1e8) return (Math.round(v / 1e6) / 100) + " 亿"; if (a >= 1e4) return (Math.round(v / 1e3) / 10) + " 万"; if (d != null) return v.toFixed(d); return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); };
const fmtMoney = (v) => (v == null || !isFinite(v) ? "-" : "¥" + Math.round(v).toLocaleString("zh-CN"));
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400); }
async function copyText(text, okMsg = "已复制") {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) { const ta = h("textarea", { style: "position:fixed;left:-9999px;top:0" }, text); document.body.append(ta); ta.select(); try { document.execCommand("copy"); toast(okMsg); } catch (e2) { toast("复制失败，请手动选择文本"); } ta.remove(); }
}
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const IN_ARTIFACT = !!(window.claude && typeof window.claude.use === "function");
const useCap = (name) => (IN_ARTIFACT ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
function chipGroup(wrap, items, selected, { single = false, onChange } = {}) {
  const render = () => { wrap.replaceChildren(...items.map((p) => h("button", { type: "button", class: "chip" + (selected.has(p) ? " on" : ""), "aria-pressed": selected.has(p) ? "true" : "false",
    onclick: () => { if (single) { selected.clear(); selected.add(p); } else if (selected.has(p)) selected.delete(p); else selected.add(p); render(); onChange && onChange(); } }, p))); };
  render(); return render;
}
function segInit(wrap, onChange) { $$("button", wrap).forEach((b) => b.addEventListener("click", () => { $$("button", wrap).forEach((x) => x.classList.toggle("on", x === b)); onChange && onChange(b.dataset.v || b.dataset.m, b); })); }
function segVal(wrap) { const b = $("button.on", wrap); return b ? (b.dataset.v || b.dataset.m) : null; }
function segSet(wrap, v) { $$("button", wrap).forEach((x) => x.classList.toggle("on", (x.dataset.v || x.dataset.m) === v)); }
function genNode(label) {
  const pre = h("pre"); const st = h("span", null, label);
  const n = h("div", { class: "gen" }, h("div", { class: "st" }, h("span", { class: "pill accent live" }, "生成中"), st), h("div", { class: "skel" }, h("i"), h("i"), h("i"), h("i")), h("details", null, h("summary", null, "查看 AI 实时输出"), pre));
  n._pre = pre; n._st = st; return n;
}
function feed(n, text) { n._pre.textContent = text.length > 1200 ? "…" + text.slice(-1200) : text; }
function emptyNode(title, sub) { return h("div", { class: "empty" }, h("b", null, title), sub && h("span", null, sub)); }
function tile(title, meta, ...kids) { return h("div", { class: "tile" }, title && h("h4", null, title), meta && h("div", { class: "meta" }, meta), ...kids); }
function ul(items) { return h("ul", null, arr(items).map((x) => h("li", null, str(x)))); }
function blk(title, ...kids) { return h("div", { class: "blk" }, h("h4", null, title), ...kids); }
function table(cols, rows) { return h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("thead", null, h("tr", null, cols.map((c) => h("th", null, c)))), h("tbody", null, rows))); }
function arrowIcon(dir) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", dir === "up" ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7"); s.append(p); return s; }
const NO_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function countUp(el, text) { const m = String(text).match(/^(-?[\d,.]+)(.*)$/); if (!m || NO_MOTION) { el.textContent = text; return; } const target = parseFloat(m[1].replace(/,/g, "")); const dec = (m[1].split(".")[1] || "").length; const suffix = m[2]; const useComma = m[1].includes(","); if (!isFinite(target)) { el.textContent = text; return; } const t0 = performance.now(); const dur = 650;
  const step = (now) => { const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 3); const v = target * e; const str = useComma ? Math.round(v).toLocaleString("zh-CN") : v.toFixed(dec); el.textContent = str + suffix; if (k < 1) requestAnimationFrame(step); else el.textContent = text; }; requestAnimationFrame(step); }
function statTile(m, v, d, cls) { const delta = d != null ? h("div", { class: "d " + (cls || "flat") }, cls === "up" ? arrowIcon("up") : cls === "down" ? arrowIcon("down") : null, d) : null; const val = h("div", { class: "v" }); countUp(val, String(v)); return h("div", { class: "stat" }, h("div", { class: "m" }, m), val, delta); }
function applyTheme(t) { const root = document.documentElement; if (t === "dark" || t === "light") root.setAttribute("data-theme", t); else root.removeAttribute("data-theme"); store.set("ace.theme", t || ""); const b = $("#themeBtn"); if (b) b.textContent = t === "dark" ? "浅色模式" : "深色模式"; }
// 简单 Markdown 渲染（标题 / 列表 / 粗体 / 段落），全部走 textContent，不注入 HTML
function renderMd(text) {
  const root = h("div", { class: "md" }); let list = null;
  const inline = (s) => { const out = []; const re = /\*\*(.+?)\*\*|`(.+?)`/g; let last = 0, m; while ((m = re.exec(s))) { if (m.index > last) out.push(s.slice(last, m.index)); out.push(m[1] != null ? h("b", null, m[1]) : h("code", { class: "code" }, m[2])); last = m.index + m[0].length; } if (last < s.length) out.push(s.slice(last)); return out; };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trimEnd(); const hm = line.match(/^(#{1,3})\s+(.*)/); const lm = line.match(/^\s*[-*•]\s+(.*)/); const om = line.match(/^\s*\d+[.、)]\s+(.*)/);
    if (lm || om) { if (!list) { list = h("ul"); root.append(list); } list.append(h("li", null, ...inline((lm || om)[1]))); continue; }
    list = null; if (!line.trim()) continue;
    if (hm) root.append(h(hm[1].length === 1 ? "h1" : hm[1].length === 2 ? "h2" : "h3", null, ...inline(hm[2])));
    else if (/^_.*_$/.test(line)) root.append(h("em", null, line.slice(1, -1)));
    else root.append(h("p", null, ...inline(line)));
  }
  return root;
}
// 广告法 / 平台规范敏感词本地检查（只是提醒）
const FLAG_WORDS = [
  ["最好", "bad"], ["最佳", "bad"], ["最高", "bad"], ["最低价", "bad"], ["最大", "bad"], ["最强", "bad"], ["最新", "warn"], ["最先进", "bad"], ["最便宜", "bad"], ["最快", "bad"], ["最优", "bad"], ["第一", "bad"], ["唯一", "bad"], ["首选", "bad"], ["顶级", "bad"], ["极致", "warn"], ["国家级", "bad"], ["世界级", "bad"], ["全球", "warn"], ["全国", "warn"], ["全网", "warn"], ["100%", "bad"], ["百分百", "bad"], ["永久", "bad"], ["根治", "bad"], ["治愈", "bad"], ["特效", "bad"], ["万能", "bad"], ["史上", "bad"], ["空前", "bad"], ["绝无仅有", "bad"], ["顶尖", "bad"], ["王牌", "bad"], ["领先", "warn"], ["独家", "warn"], ["绝对", "warn"], ["零风险", "bad"], ["无副作用", "bad"], ["包治", "bad"], ["减肥", "warn"], ["瘦身", "warn"], ["降血糖", "bad"], ["抗癌", "bad"], ["美白", "warn"], ["祛斑", "warn"], ["抗衰", "warn"], ["医疗级", "bad"], ["药用", "bad"], ["保证", "warn"], ["承诺", "warn"]
];
function checkFlags(text) { const s = String(text || ""); const out = []; for (const [w, lv] of FLAG_WORDS) if (s.includes(w)) out.push({ word: w, level: lv }); return out; }

// ===================== 数据仓库：本地 / 服务端 =====================
const COLS = ["settings", "project", "plan", "kols", "metrics", "rules", "alerts", "briefs", "batches", "connectors", "insights"];
const DB = { settings: {}, project: null, plan: null, kols: [], metrics: [], rules: [], alerts: [], briefs: [], batches: [], connectors: [], insights: [] };
const repo = {
  mode: "local", canWrite: true, authRequired: false, llmServer: null, meta: {}, now: "",
  token() { try { return sessionStorage.getItem("ace.token") || ""; } catch (e) { return ""; } },
  setToken(t) { try { t ? sessionStorage.setItem("ace.token", t) : sessionStorage.removeItem("ace.token"); } catch (e) {} },
  headers(json = true) { const hd = {}; if (json) hd["Content-Type"] = "application/json"; const t = this.token(); if (t) hd["Authorization"] = "Bearer " + t; return hd; },
  applyState(s) { for (const c of COLS) if (s[c] !== undefined) DB[c] = s[c]; this.canWrite = !!(s.auth && s.auth.canWrite); this.authRequired = !!(s.auth && s.auth.required); this.llmServer = s.llm || null; this.meta = s.meta || {}; this.now = s.now || todayStr(); this.setupNeeded = !!(s.auth && s.auth.setupNeeded); },
  async detect() {
    if (IN_ARTIFACT || location.protocol === "file:") return false;
    try { const r = await fetch("/api/state", { headers: this.headers(false), signal: AbortSignal.timeout(5000) }); if (!r.ok) return false; const s = await r.json(); if (s.mode !== "server") return false; this.applyState(s); this.mode = "server"; return true; } catch (e) { return false; }
  },
  loadLocal() { const saved = store.get("ace.db");
    if (saved && Array.isArray(saved.kols)) { for (const c of COLS) if (saved[c] !== undefined) DB[c] = saved[c];
      // 旧版本会预装示例：第一次升级到空白起点时，把示例标记的数据清掉，用户自己生成或导入的内容保留
      if (!(saved.meta && saved.meta.v >= 3)) { stripDemo(DB); DB.meta = { ...(saved.meta || {}), v: 3 }; store.set("ace.db", DB); } else DB.meta = saved.meta; }
    else this.resetLocal(false);
    if (!Array.isArray(DB.rules) || !DB.rules.length) DB.rules = JSON.parse(JSON.stringify(DEFAULT_RULES)); if (!Array.isArray(DB.connectors) || !DB.connectors.length) DB.connectors = JSON.parse(JSON.stringify(DEFAULT_CONNECTORS));
    this.mode = this.mode === "server" ? "server" : "local"; this.canWrite = true; this.now = todayStr(); },
  // withDemo=true 载入示例数据；false 回到空白起点（规则、连接器、设置保留）
  resetLocal(withDemo) { const seed = materializeSeed(withDemo ? SEED_TEMPLATE : EMPTY_TEMPLATE, todayStr()); for (const c of COLS) DB[c] = seed[c] !== undefined ? seed[c] : (Array.isArray(DB[c]) ? [] : null); DB.meta = { v: 3 };
    if (withDemo) { const ev = evaluateRules(DB.rules, DB.metrics, latestDate(DB.metrics)); DB.alerts = ev.alerts; DB.briefs = [{ id: "brief-demo", date: ev.date, text: templateBrief({ date: ev.date, stats: ev.stats, prevStats: dayStats(DB.metrics, addDaysStr(ev.date, -1)), alerts: ev.alerts, kolTodo: [], project: DB.project }), source: "template", createdAt: new Date().toISOString(), pushed: false, alertCount: ev.alerts.length }]; }
    store.set("ace.db", DB); },
  async reload() { if (this.mode !== "server") return; const r = await fetch("/api/state", { headers: this.headers(false) }); if (r.ok) this.applyState(await r.json()); },
  async put(name) {
    if (this.mode === "server") {
      const r = await fetch("/api/collections/" + name, { method: "PUT", headers: this.headers(), body: JSON.stringify({ rows: DB[name] }) });
      if (r.status === 401) { this.canWrite = false; refreshAuthUi(); throw { code: "auth", message: "需要登录" }; }
      if (!r.ok) throw { code: "server", message: ((await r.json().catch(() => ({}))).error || "保存失败") };
    } else store.set("ace.db", DB);
  },
  async putSettings(partial) {
    if (this.mode === "server") { const r = await fetch("/api/settings", { method: "PUT", headers: this.headers(), body: JSON.stringify(partial) }); if (r.status === 401) { this.canWrite = false; refreshAuthUi(); throw { code: "auth", message: "需要登录" }; } const j = await r.json().catch(() => ({})); if (!r.ok) throw { code: "server", message: j.error || "保存失败" }; DB.settings = j.settings || { ...DB.settings, ...partial }; }
    else { DB.settings = { ...DB.settings, ...partial }; store.set("ace.db", DB); }
  },
  async call(path, body) {
    if (this.mode !== "server") throw { code: "local", message: "此功能需要部署后端" };
    const r = await fetch("/api" + path, { method: "POST", headers: this.headers(), body: JSON.stringify(body || {}) });
    if (r.status === 401) { this.canWrite = false; refreshAuthUi(); throw { code: "auth", message: "需要登录" }; }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw { code: "server", message: j.error || j.body || ("HTTP " + r.status) }; return j;
  }
};
// 去掉带「示例」标记的数据（本地升级、清空示例共用）
const DEMO_METRIC_KEYS = new Set(["抖音|达人短剧 + 挑战赛", "小红书|KOC 铺量 + 搜索", "程序化广告|信息流 oCPM"]); // 旧版本示例投放数据没有 source 标记，按指纹识别
function stripDemo(db) { db.kols = arr(db.kols).filter((x) => x.source !== "示例数据"); db.metrics = arr(db.metrics).filter((r) => r.source !== "示例" && !(!r.source && DEMO_METRIC_KEYS.has(`${r.platform}|${r.campaign}`))); db.batches = arr(db.batches).filter((x) => x.source !== "示例"); db.insights = arr(db.insights).filter((x) => x.source !== "示例");
  if (obj(db.plan).mode === "demo") { db.plan = null; if (obj(db.project).brand === (typeof DEMO_BRAND === "string" ? DEMO_BRAND : "泡研社")) db.project = null; }
  db.briefs = arr(db.briefs).filter((b) => b.id !== "brief-demo" && b.id !== "brief-seed"); if (!db.metrics.length) db.alerts = []; }
// 实时输出总线：任何一次 AI 流式输出都会广播到这里（开始页的「AI 正在写」用）
const aiLive = { text: "", subs: new Set(), pub(text) { this.text = text; for (const f of this.subs) try { f(text); } catch (e) {} } };
function requireWrite() { if (repo.canWrite) return true; openAuth(); toast("需要登录后才能修改"); return false; }
async function save(name, okMsg) { try { await repo.put(name); if (okMsg) toast(okMsg); return true; } catch (e) { toast(e.message || "保存失败"); return false; } }

// ===================== AI 层 =====================
const ERR_COPY = {
  not_granted: "你未授权本页调用 Claude，已切换为示例模式。", sampling_disabled: "当前账号无法调用 Claude。", capability_disabled: "当前环境无法调用 Claude。",
  rate_limited: "调用过于频繁或已达今日上限，请稍后再试。", invalid_json: "AI 返回的格式不完整，请重试一次。", refused: "AI 拒绝了这次请求，请调整表述后重试。",
  upstream_error: "服务暂时不稳定，请稍后重试。", prompt_too_large: "输入内容过长，请精简后重试。", session_expired: "登录已过期，请重新登录 Claude 后重试。",
  empty_completion: "AI 没有返回内容，请重试。", cancelled: "已停止。", auth: "API Key 无效或没有权限。", bad_request: "接口拒绝了请求（参数或模型名有误）。",
  network: "无法连接接口：可能是网络问题，或该接口不允许浏览器直接调用（CORS）。", not_configured: "尚未接入 AI：在「设置」里配置模型接口。", need_login: "需要登录后才能生成。"
};
const errCopy = (e) => ERR_COPY[(e && e.code) || ""] || ("生成失败" + (e && e.message ? "：" + e.message : "") + "，请重试。");
function fatalCode(e) { if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) { state.sample = null; ai.mode = "none"; refreshAvailability(); } }
const state = { sample: undefined, downloads: null };
function apiConfigLocal() { const saved = store.get("ace.api"); const d = typeof API_DEFAULTS === "object" ? API_DEFAULTS : {}; const c = saved && saved.base ? saved : (d.base ? d : null); if (!c) return null;
  return { provider: c.provider || "custom", kind: c.kind === "anthropic" ? "anthropic" : "openai", base: String(c.base || "").trim().replace(/\/+$/, ""), key: String(c.key || "").trim(), model: String(c.model || "").trim() }; }
function parseJsonLoose(text) { let s = String(text || "").trim(); const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) s = f[1].trim();
  try { return JSON.parse(s); } catch (e) {}
  const a = Math.min(...[s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0)); const b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (!isFinite(a) || b < a) return undefined; try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return undefined; } }
async function readSSE(res, onData) { const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  while (true) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split(/\r?\n/); buf = lines.pop(); for (const line of lines) if (line.startsWith("data:")) onData(line.slice(5).trim()); }
  if (buf.startsWith("data:")) onData(buf.slice(5).trim()); }
async function httpError(res) { let msg = ""; try { const j = await res.json(); msg = (j.error && (j.error.message || j.error.type || j.error)) || j.message || JSON.stringify(j).slice(0, 200); } catch (e) {}
  const code = res.status === 401 || res.status === 403 ? (repo.mode === "server" ? "need_login" : "auth") : res.status === 429 ? "rate_limited" : res.status === 503 ? "not_configured" : res.status === 400 || res.status === 404 || res.status === 422 ? "bad_request" : "upstream_error";
  return { code, message: `HTTP ${res.status} ${msg}` }; }
async function apiStream(cfg, prompt, o, onDelta) {
  const isAnth = cfg.kind === "anthropic"; const url = cfg.base + (isAnth ? "/v1/messages" : "/chat/completions");
  const headers = { "Content-Type": "application/json", ...(cfg.headers || {}) }; let body;
  if (isAnth) { headers["anthropic-version"] = "2023-06-01"; headers["anthropic-dangerous-direct-browser-access"] = "true"; if (cfg.key) headers["x-api-key"] = cfg.key;
    body = { model: cfg.model, max_tokens: 16000, stream: true, messages: [{ role: "user", content: prompt }] };
    if (!/-4-5/.test(cfg.model)) body.output_config = { effort: o.tier === "quick" ? "low" : "medium" };
    if (/claude-(opus-5|sonnet-5-5|fable)/.test(cfg.model)) { body.fallbacks = "default"; headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; } }
  else { if (cfg.key) headers["Authorization"] = "Bearer " + cfg.key; body = { model: cfg.model, stream: true, temperature: 0.8, max_tokens: 8000, effort: o.tier === "quick" ? "low" : "medium", messages: [{ role: "user", content: prompt }] }; }
  let res; try { res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: o.signal }); }
  catch (e) { if (e && e.name === "AbortError") throw { code: "cancelled", message: "aborted" }; throw { code: "network", message: String(e && e.message || e) }; }
  if (!res.ok) throw await httpError(res);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) { const j = await res.json(); const t = isAnth ? arr(j.content).filter((c) => c.type === "text").map((c) => c.text).join("") : str(obj(obj(arr(j.choices)[0]).message).content); if (t) onDelta(t); return; }
  try { await readSSE(res, (data) => { if (!data || data === "[DONE]") return; let j; try { j = JSON.parse(data); } catch (e) { return; }
    if (isAnth) { if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta" && j.delta.text) onDelta(j.delta.text); if (j.type === "error") throw { code: "upstream_error", message: str(obj(j.error).message) }; }
    else { const d = obj(obj(arr(j.choices)[0]).delta).content; if (d) onDelta(d); if (j.error) throw { code: "upstream_error", message: str(obj(j.error).message) }; } }); }
  catch (e) { if (e && e.name === "AbortError") throw { code: "cancelled", message: "aborted" }; throw e; }
}
const ai = {
  mode: "none", label: "",
  ready() { return this.mode === "artifact" ? !!state.sample : this.mode === "server" || this.mode === "api"; },
  cfg() { if (this.mode === "server") return { kind: "openai", base: "/api/llm/v1", key: "", model: "server", headers: repo.headers(false) }; return apiConfigLocal(); },
  async text(prompt, o = {}) {
    const onText = (p) => { aiLive.pub(p.text); if (o.onText) o.onText(p); };
    if (this.mode === "artifact") return state.sample(prompt, { modelTier: o.tier, signal: o.signal, cache: o.cache, onText });
    const cfg = this.cfg(); if (!cfg) throw { code: "not_configured", message: "no api config" };
    let text = ""; await apiStream(cfg, prompt, o, (d) => { text += d; onText({ text, delta: d }); });
    if (!text.trim()) throw { code: "empty_completion", message: "empty" }; return { text };
  },
  async json(prompt, o = {}) {
    if (this.mode === "artifact") return state.sample.json(prompt, { modelTier: o.tier, signal: o.signal, cache: o.cache, onText: (p) => { aiLive.pub(p.text); if (o.onText) o.onText(p); } });
    const { text } = await this.text(prompt, o); const v = parseJsonLoose(text); if (v === undefined) throw { code: "invalid_json", message: "no json", text }; return v;
  }
};
function decideAiMode() {
  if (IN_ARTIFACT) { ai.mode = state.sample ? "artifact" : (state.sample === undefined ? "artifact" : "none"); ai.label = "Claude"; return; }
  if (repo.mode === "server" && repo.llmServer && repo.llmServer.configured) { ai.mode = "server"; ai.label = "服务端 · " + (repo.llmServer.label || "").replace(/^API · /, ""); return; }
  const cfg = apiConfigLocal(); if (cfg && cfg.model) { ai.mode = "api"; ai.label = ((API_PRESETS[cfg.provider] || {}).label || "自定义") + " · " + cfg.model; return; }
  ai.mode = "none"; ai.label = "";
}
const GEN_BUTTONS = ["#runBtn", "#fcRun", "#ksRun", "#klAiScore", "#klBrief", "#inRun", "#oneRun"]; // 一键推荐在无 AI 时仍可按匹配分工作，不在此列
function refreshAvailability() {
  const s = $("#aiStatus"); const btns = GEN_BUTTONS.map((x) => $(x)).filter(Boolean);
  const setHints = (t) => { for (const id of ["#runHint", "#fcHint", "#ksHint", "#klHint", "#inHint"]) { const el = $(id); if (el) { el.className = "hint"; el.textContent = t; } } };
  if (IN_ARTIFACT && state.sample === undefined) { s.className = "status"; s.innerHTML = "<i></i>检测 AI 可用性…"; btns.forEach((b) => { b.disabled = true; }); return; }
  if (ai.ready()) { s.className = "status ok"; s.textContent = ""; s.append(h("i"), "AI 可用 · " + ai.label); btns.forEach((b) => { b.disabled = false; });
    setHints(ai.mode === "artifact" ? "首次会请求授权。" : ""); }
  else { s.className = "status warn"; btns.forEach((b) => { b.disabled = true; });
    if (IN_ARTIFACT) { s.innerHTML = "<i></i>AI 不可用"; setHints("登录 Claude 后可生成。"); }
    else if (repo.mode === "server") { s.innerHTML = "<i></i>AI 未配置"; setHints("在「设置」填模型 Key 后可生成。"); }
    else { s.innerHTML = "<i></i>AI 未接入"; setHints("在「设置」接入模型后可生成。"); } }
  const mt = $("#modeText"); mt.textContent = IN_ARTIFACT ? "Claude 环境" : repo.mode === "server" ? (repo.canWrite ? "服务端 · 已登录" : repo.authRequired ? "服务端 · 只读访客" : "服务端") : "本地模式 · 数据存于浏览器";
  $("#apiBtn").hidden = IN_ARTIFACT;
  if (typeof renderStartStatus === "function") try { renderStartStatus(); } catch (e) {}
}

// ===================== 登录 =====================
function refreshAuthUi() { const b = $("#authBtn"); b.hidden = !(repo.mode === "server" && repo.authRequired); b.textContent = repo.canWrite ? "已登录 · 退出" : "登录以编辑"; $("#authLogout").hidden = !repo.canWrite; refreshAvailability(); }
function openAuth() { $("#authModal").hidden = false; $("#authHint").textContent = ""; setTimeout(() => $("#authToken").focus(), 50); }
function initAuth() {
  $("#authBtn").addEventListener("click", () => { if (repo.canWrite) { repo.setToken(""); repo.canWrite = false; refreshAuthUi(); toast("已退出登录"); } else openAuth(); });
  $("#authClose").addEventListener("click", () => { $("#authModal").hidden = true; });
  $("#authModal").addEventListener("click", (e) => { if (e.target === $("#authModal")) $("#authModal").hidden = true; });
  $("#authLogout").addEventListener("click", () => { repo.setToken(""); repo.canWrite = false; refreshAuthUi(); $("#authModal").hidden = true; });
  const login = async () => { const t = $("#authToken").value.trim(); if (!t) return; $("#authHint").textContent = "验证中…";
    try { const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }) }); if (!r.ok) { $("#authHint").textContent = "口令不正确"; return; }
      repo.setToken(t); repo.canWrite = true; $("#authToken").value = ""; $("#authModal").hidden = true; refreshAuthUi(); toast("已登录，可以编辑数据"); await repo.reload(); renderAll(); } catch (e) { $("#authHint").textContent = "无法连接服务端"; } };
  $("#authLogin").addEventListener("click", login); $("#authToken").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
}

// ===================== 浏览器本地 API 设置 =====================
const apiUi = { provider: "deepseek", kind: "openai" };
function apiFillPreset(id, keepValues) { const p = API_PRESETS[id] || API_PRESETS.custom; apiUi.provider = id;
  $$("#apiProvider button").forEach((b) => b.classList.toggle("on", b.dataset.v === id)); $("#apiKindField").hidden = id !== "custom";
  if (!keepValues) { $("#apiBase").value = p.base; $("#apiModel").value = p.model; apiUi.kind = p.kind; }
  $$("#apiKind button").forEach((b) => b.classList.toggle("on", b.dataset.v === apiUi.kind)); $("#apiHelp").textContent = p.help; }
function initApiModal() {
  $("#apiProvider").replaceChildren(...Object.entries(API_PRESETS).map(([id, p]) => h("button", { type: "button", "data-v": id, onclick: () => apiFillPreset(id) }, p.label)));
  $$("#apiKind button").forEach((b) => b.addEventListener("click", () => { apiUi.kind = b.dataset.v; $$("#apiKind button").forEach((x) => x.classList.toggle("on", x === b)); }));
  const saved = store.get("ace.api") || (API_DEFAULTS.base ? API_DEFAULTS : null);
  if (saved && saved.base) { apiUi.kind = saved.kind === "anthropic" ? "anthropic" : "openai"; apiFillPreset(saved.provider || "custom", true); $("#apiBase").value = saved.base; $("#apiKey").value = saved.key || ""; $("#apiModel").value = saved.model || ""; }
  else apiFillPreset("deepseek");
  const modal = $("#apiModal"); const open = () => { modal.hidden = false; $("#apiStatusText").textContent = ""; };
  $("#apiBtn").addEventListener("click", open); $("#stApiLocal").addEventListener("click", open);
  $("#apiClose").addEventListener("click", () => { modal.hidden = true; }); modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
  $("#apiClear").addEventListener("click", () => { store.del("ace.api"); $("#apiKey").value = ""; apiFillPreset("deepseek"); decideAiMode(); refreshAvailability(); $("#apiStatusText").textContent = "已清除"; });
  $("#apiSave").addEventListener("click", async () => {
    const cfg = { provider: apiUi.provider, kind: apiUi.kind, base: $("#apiBase").value.trim().replace(/\/+$/, ""), key: $("#apiKey").value.trim(), model: $("#apiModel").value.trim() };
    const st = $("#apiStatusText"); if (!cfg.base || !cfg.model) { st.textContent = "请填写接口地址和模型名。"; return; }
    store.set("ace.api", cfg); const prevMode = ai.mode; ai.mode = "api"; ai.label = ((API_PRESETS[cfg.provider] || {}).label || "自定义") + " · " + cfg.model; st.textContent = "正在测试连接…"; $("#apiSave").disabled = true; const t0 = Date.now();
    try { const { text } = await ai.text("请只回复两个字：连接成功", { tier: "quick" }); st.textContent = `连接成功（${Math.round((Date.now() - t0) / 100) / 10} 秒）：${text.trim().slice(0, 30)}`; toast("API 已接入"); refreshAvailability(); setTimeout(() => { modal.hidden = true; }, 900); }
    catch (e) { st.textContent = errCopy(e) + (e && e.message ? "（" + String(e.message).slice(0, 120) + "）" : ""); ai.mode = prevMode === "api" ? "api" : prevMode; decideAiMode(); refreshAvailability(); }
    $("#apiSave").disabled = false; });
}

// ===================== 导航 =====================
const TOOLS = ["start", "plan", "factory", "insights", "kol", "monitor", "import", "settings"];
const TOOL_RENDER = {};
function showTool(id) {
  if (!TOOLS.includes(id)) id = "start";
  TOOLS.forEach((t) => { $("#tool-" + t).hidden = t !== id; });
  $$("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.tool === id));
  try { history.replaceState(null, "", "#" + id); } catch (e) {}
  window.scrollTo({ top: 0 }); if (TOOL_RENDER[id]) TOOL_RENDER[id]();
}
function projectContext() { const b = obj(DB.project); if (!b.brand) return ""; let s = `${b.brand}（${b.industry || ""}）：${b.product || ""} 目标人群：${b.audience || ""}${b.tone ? " 调性：" + b.tone : ""}`; if (b.slogan) s += ` 传播主张：「${b.slogan}」`; if (b.keyMessages) s += ` 核心信息（必须出现）：${b.keyMessages}`; if (b.clientPlan) s += `\n客户确认的方案要点（以此为准）：${String(b.clientPlan).slice(0, 800)}`; return s; }
function renderAll() { for (const k of Object.keys(TOOL_RENDER)) try { TOOL_RENDER[k](); } catch (e) { console.error(k, e); } }
</script>
