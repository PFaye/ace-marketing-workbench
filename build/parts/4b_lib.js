<script>
// ===================== 投放指标（与 server/lib/monitor.js 保持一致） =====================
const METRIC_LABELS = { spend: "消耗", impressions: "曝光", clicks: "点击", conversions: "转化", engagements: "互动", negatives: "负评", ctr: "CTR", cpm: "CPM", cpa: "CPA", cvr: "CVR", er: "互动率" };
const METRIC_UNITS = { spend: "元", impressions: "", clicks: "", conversions: "", engagements: "", negatives: "条", ctr: "%", cpm: "元", cpa: "元", cvr: "%", er: "%" };
const r2 = (v, d = 2) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };
function derive(t) { t.ctr = t.impressions ? r2(t.clicks / t.impressions * 100) : null; t.cpm = t.impressions ? r2(t.spend / t.impressions * 1000) : null; t.cpa = t.conversions ? r2(t.spend / t.conversions) : null; t.cvr = t.clicks ? r2(t.conversions / t.clicks * 100) : null; t.er = t.impressions ? r2(t.engagements / t.impressions * 100) : null; return t; }
function sumRows(rows) { const t = { spend: 0, impressions: 0, clicks: 0, conversions: 0, engagements: 0, negatives: 0 }; const days = new Set(); for (const r of rows) { for (const k of Object.keys(t)) t[k] += Number(r[k]) || 0; days.add(r.date); } t.days = days.size; return derive(t); }
function latestDate(rows) { return rows.reduce((a, r) => (r.date > a ? r.date : a), ""); }
function platformsOf(rows) { return [...new Set(rows.map((r) => r.platform).filter(Boolean))]; }
function dayStats(rows, date) { const day = rows.filter((r) => r.date === date); const by = {}; for (const p of platformsOf(day)) by[p] = sumRows(day.filter((r) => r.platform === p)); return { date, overall: sumRows(day), byPlatform: by }; }
function rangeAvg(rows, from, to, platform) { const sel = rows.filter((r) => r.date >= from && r.date <= to && (!platform || r.platform === platform)); const t = sumRows(sel); const n = t.days || 1; return derive({ spend: t.spend / n, impressions: t.impressions / n, clicks: t.clicks / n, conversions: t.conversions / n, engagements: t.engagements / n, negatives: t.negatives / n }); }
function fmtMetric(k, v) { if (v == null) return "-"; const u = METRIC_UNITS[k] || ""; if (k === "spend" || k === "cpm" || k === "cpa") return fmtN(v, v >= 100 ? 0 : 2) + " 元"; if (u === "%") return v + "%"; return fmtN(v) + (u ? " " + u : ""); }
function evaluateRules(rules, rows, date) {
  const alerts = []; const stats = dayStats(rows, date); if (!date) return { alerts, stats, date };
  const prevFrom = addDaysStr(date, -7), prevTo = addDaysStr(date, -1);
  for (const rule of arr(rules)) {
    if (!rule || rule.enabled === false) continue;
    const scopes = rule.scope && rule.scope !== "all" ? [rule.scope] : ["all", ...Object.keys(stats.byPlatform)];
    for (const scope of scopes) {
      const cur = scope === "all" ? stats.overall : stats.byPlatform[scope]; if (!cur) continue; const v = cur[rule.metric]; if (v == null) continue;
      let hit = false, detail = ""; const unit = METRIC_UNITS[rule.metric] || "";
      if (rule.op === "gt") { hit = v > Number(rule.value); detail = `${fmtN(v)}${unit}，阈值 > ${rule.value}${unit}`; }
      else if (rule.op === "lt") { hit = v < Number(rule.value); detail = `${fmtN(v)}${unit}，阈值 < ${rule.value}${unit}`; }
      else { const base = rangeAvg(rows, prevFrom, prevTo, scope === "all" ? null : scope)[rule.metric]; if (!base) continue; const chg = (v - base) / base * 100; hit = rule.op === "drop_pct" ? chg <= -Number(rule.value) : chg >= Number(rule.value); detail = `${fmtN(v)}${unit}，较前 7 日均值 ${fmtN(base)}${unit} ${chg >= 0 ? "+" : ""}${r2(chg, 1)}%`; }
      if (!hit) continue;
      alerts.push({ id: `${date}-${rule.id}-${scope}`, date, ruleId: rule.id, name: rule.name, level: rule.level || "warn", metric: rule.metric, scope, value: v, message: `${scope === "all" ? "整体" : scope} ${METRIC_LABELS[rule.metric] || rule.metric} ${detail}`, acknowledged: false, createdAt: new Date().toISOString() });
    }
  }
  return { alerts, stats, date };
}
function deltaTxt(c, p) { if (c == null || !p) return ""; const chg = (c - p) / p * 100; return ` (${chg >= 0 ? "+" : ""}${r2(chg, 1)}% 环比)`; }
function templateBrief({ date, stats, prevStats, alerts, kolTodo, project }) {
  const o = stats.overall, p = prevStats && prevStats.overall; const L = [`# ${project && project.brand ? project.brand + " · " : ""}投放日报 ${date}`, "", "## 核心数据"];
  L.push(`- 消耗 ${fmtN(o.spend)} 元${p ? deltaTxt(o.spend, p.spend) : ""}｜曝光 ${fmtN(o.impressions)}${p ? deltaTxt(o.impressions, p.impressions) : ""}｜点击 ${fmtN(o.clicks)}`);
  L.push(`- CTR ${o.ctr == null ? "-" : o.ctr + "%"}${p ? deltaTxt(o.ctr, p.ctr) : ""}｜CPM ${o.cpm == null ? "-" : o.cpm + " 元"}｜CPA ${o.cpa == null ? "-" : o.cpa + " 元"}${p ? deltaTxt(o.cpa, p.cpa) : ""}｜转化 ${fmtN(o.conversions)}`);
  if (o.negatives) L.push(`- 负面评论 ${o.negatives} 条`);
  L.push("", "## 各平台"); for (const [k, v] of Object.entries(stats.byPlatform)) L.push(`- ${k}：消耗 ${fmtN(v.spend)} 元，CTR ${v.ctr == null ? "-" : v.ctr + "%"}，CPA ${v.cpa == null ? "-" : v.cpa + " 元"}，转化 ${fmtN(v.conversions)}`);
  L.push("", "## 异常与建议"); if (alerts.length) for (const a of alerts) L.push(`- ${a.level === "critical" ? "🔴" : "🟠"} ${a.message}`); else L.push("- 无触发告警，按计划继续。");
  if (kolTodo && kolTodo.length) { L.push("", "## 今日达人跟进"); for (const k of kolTodo) L.push(`- ${k.name}（${k.platform}）：${k.status}，跟进日 ${k.nextFollowUp}`); }
  L.push("", "_由 ACE 营销工作台自动生成，数据来自已导入的投放报表。_"); return L.join("\n");
}
function aiBriefPrompt(ctx) { const { date, stats, prevStats, alerts, kolTodo, project } = ctx;
  return `你是一家营销传播集团的投放优化师，请根据下面的数据写一份给客户和团队看的投放日报（${date}）。
要求：简体中文、Markdown；结构固定为四节：「核心结论」（2-3 句，先说最重要的变化）、「各平台表现」（每个平台 1 行，带关键数字）、「异常与建议」（针对每条告警给具体可执行的动作，没有告警就说明正常并给 1 条优化建议）、「今日待办」（含达人跟进）。
不要编造数据外的数字；环比按给出的前一日数据计算；总字数 300-450 字。只输出日报正文，不要前言。
【品牌】${JSON.stringify(project || {})}
【当日数据】${JSON.stringify(stats)}
【前一日数据】${JSON.stringify(prevStats || null)}
【触发的告警】${JSON.stringify(alerts)}
【今日达人跟进】${JSON.stringify(kolTodo || [])}`; }

// ===================== 表格识别（与 server/lib/mapping.js 保持一致） =====================
const KOL_FIELDS = { name: ["name", "达人名称", "达人昵称", "博主昵称", "账号名称", "达人", "昵称", "账号", "博主", "创作者", "kol", "nickname"], platform: ["platform", "平台", "渠道", "媒体"], category: ["category", "内容类型", "内容方向", "品类", "类目", "垂类", "赛道", "分类"], city: ["city", "城市", "地区", "所在地", "地域"], engagementRate: ["engagementrate", "互动率", "平均互动率", "赞藏率", "互动比例"], followers: ["followers", "粉丝数量", "粉丝数", "粉丝量", "粉丝", "fans", "关注数"], avgViews: ["avgviews", "阅读中位数", "播放中位数", "曝光中位数", "平均阅读", "平均播放", "平均曝光", "阅读量", "播放量", "曝光量", "阅读", "播放", "曝光", "views"], avgEngagements: ["avgengagements", "互动中位数", "平均互动", "互动量", "互动数", "互动", "engagements"], quote: ["quote", "图文报价", "视频报价", "合作报价", "一口价", "报价", "价格", "price", "费用"], fitScore: ["fitscore", "匹配分", "匹配度", "人工评分", "评分"], audience: ["audience", "粉丝画像", "受众", "人群", "粉丝构成"], notes: ["notes", "备注", "说明", "内容方向与粉丝画像", "简介"], sourceUrl: ["sourceurl", "主页链接", "主页", "链接", "url", "homepage"], updatedAt: ["updatedat", "更新日期", "数据日期", "数据更新时间", "日期"] };
const METRIC_FIELDS = { date: ["date", "统计日期", "日期", "时间", "天", "day"], platform: ["platform", "平台", "渠道", "媒体", "媒介", "来源"], campaign: ["campaign", "广告计划", "计划名称", "计划", "系列", "活动", "项目", "campaign_name", "广告组"], spend: ["spend", "cost", "总花费", "消耗", "花费", "消费", "成本"], impressions: ["impressions", "展示数", "展示量", "曝光量", "展现量", "展示", "曝光", "展现", "show"], clicks: ["clicks", "点击数", "点击量", "点击", "click"], conversions: ["conversions", "转化数", "转化量", "订单数", "成交数", "转化", "订单", "成交", "convert"], engagements: ["engagements", "互动数", "互动量", "互动"], negatives: ["negatives", "负面评论", "负评数", "负评", "负面", "差评"] };
const FIELD_LABELS = { name: "达人名称", platform: "平台", category: "品类 / 内容方向", city: "城市", followers: "粉丝数", avgViews: "平均阅读 / 播放", avgEngagements: "平均互动", engagementRate: "互动率 %", quote: "报价（元）", fitScore: "匹配分", audience: "粉丝画像", notes: "备注", sourceUrl: "主页链接", updatedAt: "数据日期", date: "日期", campaign: "计划 / 系列", spend: "消耗（元）", impressions: "曝光", clicks: "点击", conversions: "转化", engagements: "互动", negatives: "负评" };
function normHeader(x) { return String(x || "").toLowerCase().replace(/[\s_\-（(].*$/u, "").replace(/[\s_\-]/g, "").trim(); }
function inferMapping(headers, target) {
  const spec = target === "metrics" ? METRIC_FIELDS : KOL_FIELDS; const used = new Set(); const mapping = {}; const norm = headers.map((hd) => ({ raw: hd, n: normHeader(hd), full: String(hd || "").toLowerCase() }));
  for (const [field, syns] of Object.entries(spec)) { let hit = null;
    for (const s of syns) { const sn = s.toLowerCase(); hit = norm.find((x) => !used.has(x.raw) && (x.n === sn || x.full === sn)); if (hit) break; }
    if (!hit) for (const s of syns) { const sn = s.toLowerCase(); hit = norm.find((x) => !used.has(x.raw) && x.full.includes(sn)); if (hit) break; }
    if (hit) { mapping[field] = hit.raw; used.add(hit.raw); } }
  return mapping;
}
function parseNum(v) { if (v == null || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null; let s = String(v).trim().replace(/[,，¥￥$\s]/g, ""); if (!s || /待|无|-$|^n\/?a$/i.test(s)) return null; let mult = 1;
  if (/亿/.test(s)) { mult = 1e8; s = s.replace(/亿/g, ""); } else if (/[万w]/i.test(s)) { mult = 1e4; s = s.replace(/[万w]/gi, ""); } else if (/[kK]$/.test(s)) { mult = 1e3; s = s.replace(/[kK]$/, ""); }
  const pct = /%$/.test(s); s = s.replace(/%$/, ""); const n = parseFloat(s); if (!isFinite(n)) return null; return pct ? n : n * mult; }
function parseDate(v) { if (v == null || v === "") return null; if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  const s = String(v).trim().replace(/[年月]/g, "-").replace(/日/g, "").replace(/\//g, "-").replace(/\./g, "-"); const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})$/); if (m2) return `${new Date().getFullYear()}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`; const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
const PLATFORM_ALIASES = [["小红书", /小红书|xhs|red|rednote/i], ["抖音", /抖音|douyin|tiktok/i], ["B站", /b站|bilibili|哔哩/i], ["微博", /微博|weibo/i], ["快手", /快手|kuaishou/i], ["视频号", /视频号|微信视频/i], ["微信", /微信|wechat|公众号|朋友圈/i], ["知乎", /知乎|zhihu/i], ["淘宝/天猫", /淘宝|天猫|tmall|taobao/i], ["京东", /京东|jd/i], ["程序化广告", /程序化|信息流|巨量|腾讯广告|广点通|ocpm/i]];
function normPlatform(v) { const s = String(v || "").trim(); if (!s) return ""; for (const [name, re] of PLATFORM_ALIASES) if (re.test(s)) return name; return s; }
function mapRows(rows, target, mapping) { const out = [];
  for (const r of rows) { const get = (f) => (mapping[f] != null ? r[mapping[f]] : undefined);
    if (target === "metrics") { const row = { date: parseDate(get("date")), platform: normPlatform(get("platform")), campaign: String(get("campaign") || "").trim(), spend: parseNum(get("spend")) || 0, impressions: parseNum(get("impressions")) || 0, clicks: parseNum(get("clicks")) || 0, conversions: parseNum(get("conversions")) || 0, engagements: parseNum(get("engagements")) || 0, negatives: parseNum(get("negatives")) || 0 }; if (!row.date) continue; out.push(row); }
    else { const name = String(get("name") || "").trim(); if (!name) continue; const row = { name, platform: normPlatform(get("platform")), category: String(get("category") || "").trim(), city: String(get("city") || "").trim(), followers: parseNum(get("followers")), avgViews: parseNum(get("avgViews")), avgEngagements: parseNum(get("avgEngagements")), engagementRate: parseNum(get("engagementRate")), quote: parseNum(get("quote")), fitScore: parseNum(get("fitScore")), audience: String(get("audience") || "").trim(), notes: String(get("notes") || "").trim(), sourceUrl: String(get("sourceUrl") || "").trim(), updatedAt: parseDate(get("updatedAt")) || "" };
      if (row.engagementRate == null && row.avgViews && row.avgEngagements) row.engagementRate = r2(row.avgEngagements / row.avgViews * 100); if (row.avgEngagements == null && row.avgViews && row.engagementRate != null) row.avgEngagements = Math.round(row.avgViews * row.engagementRate / 100); out.push(row); } }
  return out; }
function parseCsv(text, delim) { const rows = []; let row = [], cell = "", q = false; text = String(text).replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c; }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== "")); }
function parseTable(text) { const t = String(text || "").trim(); if (!t) return { headers: [], rows: [] }; const first = t.split(/\r?\n/)[0]; const delim = first.includes("\t") ? "\t" : first.split(",").length > first.split(";").length ? "," : ";";
  const grid = parseCsv(t, delim); const headers = (grid.shift() || []).map((x) => String(x).trim()); return { headers, rows: grid.map((r) => Object.fromEntries(headers.map((hd, i) => [hd, r[i] == null ? "" : String(r[i]).trim()]))) }; }
function downloadFile(name, text, mime = "text/csv;charset=utf-8") {
  if (state.downloads) return state.downloads.save({ filename: name, data: text }).then(() => toast("已保存 " + name)).catch((e) => { if (e && e.code !== "declined") copyText(text, "下载不可用，已复制内容"); });
  if (IN_ARTIFACT) return copyText(text, "已复制内容（当前环境不支持下载）");
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast("已下载 " + name);
}
function toCsv(rows, cols, labels) { const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; return "﻿" + cols.map((c) => esc((labels || {})[c] || c)).join(",") + "\n" + rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n"); }

// ===================== 图表（SVG，单系列折线 / 分类柱） =====================
const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)"];
function lineChart({ title, sub, points, color = "var(--s1)", fmt = (v) => fmtN(v), W = 600, H = 190 }) {
  const wrap = h("div", { class: "chart" }, h("div", { class: "ttl" }, h("span", null, title), h("span", null, sub || "")));
  const pts = points.filter((p) => p.y != null); if (pts.length < 2) { wrap.append(h("div", { class: "mini" }, "数据不足两天")); return wrap; }
  const L = 44, R = 12, T = 12, B = 26; const max = Math.max(...pts.map((p) => p.y)) * 1.12 || 1;
  const sx = (i) => L + (i / (pts.length - 1)) * (W - L - R), sy = (v) => T + (1 - v / max) * (H - T - B);
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title });
  const grid = h("g", { class: "grid" }); for (let i = 0; i <= 4; i++) { const v = max * i / 4, y = sy(v); grid.append(h("line", { x1: L, x2: W - R, y1: y, y2: y })); grid.append(h("text", { x: L - 6, y: y + 3.5, "text-anchor": "end" }, fmt(v))); } svg.append(grid);
  const path = pts.map((p, i) => (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(p.y).toFixed(1)).join(" ");
  svg.append(h("path", { class: "area", d: path + ` L${sx(pts.length - 1).toFixed(1)} ${sy(0)} L${L} ${sy(0)} Z`, fill: color }), h("path", { class: "line", d: path, stroke: color }));
  [0, Math.floor((pts.length - 1) / 2), pts.length - 1].forEach((i) => svg.append(h("text", { x: sx(i), y: H - 8, "text-anchor": i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle" }, pts[i].x.slice(5))));
  const xh = h("line", { class: "xh", y1: T, y2: H - B, x1: 0, x2: 0, visibility: "hidden" }), dot = h("circle", { class: "dot", r: 4.5, fill: color, visibility: "hidden" }); svg.append(xh, dot);
  const tip = h("div", { class: "tip", hidden: true }); wrap.append(svg, tip);
  const hit = h("rect", { class: "hit", x: L, y: 0, width: W - L - R, height: H }); svg.append(hit);
  const move = (ev) => { const rect = svg.getBoundingClientRect(); const x = (ev.clientX - rect.left) / rect.width * W; const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - L) / (W - L - R) * (pts.length - 1)))); const p = pts[i];
    xh.setAttribute("x1", sx(i)); xh.setAttribute("x2", sx(i)); xh.setAttribute("visibility", "visible"); dot.setAttribute("cx", sx(i)); dot.setAttribute("cy", sy(p.y)); dot.setAttribute("visibility", "visible");
    tip.hidden = false; tip.textContent = ""; tip.append(p.x + " ", h("b", null, fmt(p.y))); tip.style.left = (sx(i) / W * rect.width) + "px"; tip.style.top = (sy(p.y) / H * rect.height + 24) + "px"; };
  const leave = () => { xh.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move); hit.addEventListener("pointerleave", leave);
  return wrap;
}
function barChart({ title, sub, bars, fmt = (v) => fmtN(v), W = 600, H = 190 }) {
  const wrap = h("div", { class: "chart" }, h("div", { class: "ttl" }, h("span", null, title), h("span", null, sub || "")));
  if (!bars.length) { wrap.append(h("div", { class: "mini" }, "暂无数据")); return wrap; }
  const L = 12, R = 12, T = 22, B = 26; const max = Math.max(...bars.map((b) => b.value)) * 1.15 || 1; const n = bars.length; const slot = (W - L - R) / n; const bw = Math.min(64, slot * 0.6);
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title }); const total = bars.reduce((a, b) => a + b.value, 0) || 1;
  svg.append(h("line", { class: "axis", x1: L, x2: W - R, y1: H - B, y2: H - B }));
  const tip = h("div", { class: "tip", hidden: true });
  bars.forEach((b, i) => { const x = L + slot * i + (slot - bw) / 2, hgt = (b.value / max) * (H - T - B), y = H - B - hgt;
    const rect = h("rect", { class: "bar", x, y, width: bw, height: Math.max(hgt, 1), fill: b.color || SERIES[i % 3] });
    const show = (ev) => { const r = svg.getBoundingClientRect(); tip.hidden = false; tip.textContent = ""; tip.append(b.label + " ", h("b", null, fmt(b.value)), ` · ${r2(b.value / total * 100, 1)}%`); tip.style.left = ((x + bw / 2) / W * r.width) + "px"; tip.style.top = (y / H * r.height) + "px"; };
    rect.addEventListener("pointerenter", show); rect.addEventListener("pointermove", show); rect.addEventListener("pointerleave", () => { tip.hidden = true; });
    svg.append(rect, h("text", { class: "blab", x: x + bw / 2, y: y - 6, "text-anchor": "middle" }, fmt(b.value)), h("text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle" }, b.label)); });
  wrap.append(svg, tip); return wrap;
}
</script>
