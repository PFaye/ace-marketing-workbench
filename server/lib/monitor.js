// 投放监测：按日聚合、规则告警、日报生成（模板 / AI）、飞书 / 企微群机器人推送。
const crypto = require("crypto");

const METRIC_LABELS = { spend: "消耗", impressions: "曝光", clicks: "点击", conversions: "转化", engagements: "互动", negatives: "负评", ctr: "CTR", cpm: "CPM", cpa: "CPA", cvr: "CVR", er: "互动率" };
const METRIC_UNITS = { spend: "元", impressions: "", clicks: "", conversions: "", engagements: "", negatives: "条", ctr: "%", cpm: "元", cpa: "元", cvr: "%", er: "%" };

function todayIn(tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
function addDays(date, n) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function sumRows(rows) {
  const t = { spend: 0, impressions: 0, clicks: 0, conversions: 0, engagements: 0, negatives: 0, days: new Set() };
  for (const r of rows) { for (const k of ["spend", "impressions", "clicks", "conversions", "engagements", "negatives"]) t[k] += Number(r[k]) || 0; t.days.add(r.date); }
  t.days = t.days.size;
  return derive(t);
}
function derive(t) {
  t.ctr = t.impressions ? round(t.clicks / t.impressions * 100, 2) : null;
  t.cpm = t.impressions ? round(t.spend / t.impressions * 1000, 2) : null;
  t.cpa = t.conversions ? round(t.spend / t.conversions, 2) : null;
  t.cvr = t.clicks ? round(t.conversions / t.clicks * 100, 2) : null;
  t.er = t.impressions ? round(t.engagements / t.impressions * 100, 2) : null;
  return t;
}
function round(v, d) { const m = Math.pow(10, d); return Math.round(v * m) / m; }
function latestDate(rows) { return rows.reduce((a, r) => (r.date > a ? r.date : a), ""); }
function platforms(rows) { return [...new Set(rows.map((r) => r.platform).filter(Boolean))]; }

function dayStats(rows, date) {
  const day = rows.filter((r) => r.date === date);
  const by = {}; for (const p of platforms(day)) by[p] = sumRows(day.filter((r) => r.platform === p));
  return { date, overall: sumRows(day), byPlatform: by };
}
function rangeAvg(rows, from, to, platform) {
  const sel = rows.filter((r) => r.date >= from && r.date <= to && (!platform || r.platform === platform));
  const t = sumRows(sel); const n = t.days || 1;
  const avg = { spend: t.spend / n, impressions: t.impressions / n, clicks: t.clicks / n, conversions: t.conversions / n, engagements: t.engagements / n, negatives: t.negatives / n };
  return derive(avg);
}

function evaluateRules(rules, rows, date) {
  const alerts = [];
  const stats = dayStats(rows, date);
  const prevFrom = addDays(date, -7), prevTo = addDays(date, -1);
  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;
    const scopes = rule.scope && rule.scope !== "all" ? [rule.scope] : ["all", ...Object.keys(stats.byPlatform)];
    for (const scope of scopes) {
      const cur = scope === "all" ? stats.overall : stats.byPlatform[scope]; if (!cur) continue;
      const v = cur[rule.metric]; if (v == null) continue;
      let hit = false, detail = "";
      const unit = METRIC_UNITS[rule.metric] || "";
      if (rule.op === "gt") { hit = v > Number(rule.value); detail = `${fmt(v)}${unit}，阈值 > ${rule.value}${unit}`; }
      else if (rule.op === "lt") { hit = v < Number(rule.value); detail = `${fmt(v)}${unit}，阈值 < ${rule.value}${unit}`; }
      else if (rule.op === "drop_pct" || rule.op === "rise_pct") {
        const base = rangeAvg(rows, prevFrom, prevTo, scope === "all" ? null : scope)[rule.metric];
        if (!base) continue;
        const chg = (v - base) / base * 100;
        hit = rule.op === "drop_pct" ? chg <= -Number(rule.value) : chg >= Number(rule.value);
        detail = `${fmt(v)}${unit}，较前 7 日均值 ${fmt(base)}${unit} ${chg >= 0 ? "+" : ""}${round(chg, 1)}%`;
      }
      if (!hit) continue;
      alerts.push({ id: `${date}-${rule.id}-${scope}`, date, ruleId: rule.id, name: rule.name, level: rule.level || "warn", metric: rule.metric, scope, value: v,
        message: `${scope === "all" ? "整体" : scope} ${METRIC_LABELS[rule.metric] || rule.metric} ${detail}`, acknowledged: false, createdAt: new Date().toISOString() });
    }
  }
  return { alerts, stats };
}
function fmt(v) { if (v == null) return "-"; if (Math.abs(v) >= 1e8) return round(v / 1e8, 2) + " 亿"; if (Math.abs(v) >= 1e4) return round(v / 1e4, 1) + " 万"; return Number.isInteger(v) ? String(v) : String(round(v, 2)); }

function deltaText(cur, prev, key, unit) {
  if (cur == null || prev == null || !prev) return "";
  const chg = (cur - prev) / prev * 100; return ` (${chg >= 0 ? "+" : ""}${round(chg, 1)}% 环比)`;
}

function templateBrief({ date, stats, prevStats, alerts, kolTodo, project }) {
  const o = stats.overall, p = prevStats && prevStats.overall;
  const L = [`# ${project && project.brand ? project.brand + " · " : ""}投放日报 ${date}`, ""];
  L.push("## 核心数据");
  L.push(`- 消耗 ${fmt(o.spend)} 元${p ? deltaText(o.spend, p.spend) : ""}｜曝光 ${fmt(o.impressions)}${p ? deltaText(o.impressions, p.impressions) : ""}｜点击 ${fmt(o.clicks)}`);
  L.push(`- CTR ${o.ctr == null ? "-" : o.ctr + "%"}${p ? deltaText(o.ctr, p.ctr) : ""}｜CPM ${o.cpm == null ? "-" : o.cpm + " 元"}｜CPA ${o.cpa == null ? "-" : o.cpa + " 元"}${p ? deltaText(o.cpa, p.cpa) : ""}｜转化 ${fmt(o.conversions)}`);
  if (o.negatives) L.push(`- 负面评论 ${o.negatives} 条`);
  L.push("", "## 各平台");
  for (const [k, v] of Object.entries(stats.byPlatform)) L.push(`- ${k}：消耗 ${fmt(v.spend)} 元，CTR ${v.ctr == null ? "-" : v.ctr + "%"}，CPA ${v.cpa == null ? "-" : v.cpa + " 元"}，转化 ${fmt(v.conversions)}`);
  L.push("", "## 异常与建议");
  if (alerts.length) for (const a of alerts) L.push(`- ${a.level === "critical" ? "🔴" : "🟠"} ${a.message}`); else L.push("- 无触发告警，按计划继续。");
  if (kolTodo && kolTodo.length) { L.push("", "## 今日达人跟进"); for (const k of kolTodo) L.push(`- ${k.name}（${k.platform}）：${k.status}，跟进日 ${k.nextFollowUp}`); }
  L.push("", "_由 ACE 营销工作台自动生成，数据来自已导入的投放报表。_");
  return L.join("\n");
}

function aiBriefPrompt(ctx) {
  const { date, stats, prevStats, alerts, kolTodo, project } = ctx;
  return `你是一家营销传播集团的投放优化师，请根据下面的数据写一份给客户和团队看的投放日报（${date}）。
要求：简体中文、Markdown；结构固定为四节：「核心结论」（2-3 句，先说最重要的变化）、「各平台表现」（每个平台 1 行，带关键数字）、「异常与建议」（针对每条告警给具体可执行的动作，没有告警就说明正常并给 1 条优化建议）、「今日待办」（含达人跟进）。
不要编造数据外的数字；环比按给出的前一日数据计算；总字数 300-450 字。只输出日报正文，不要前言。
【品牌】${JSON.stringify(project || {})}
【当日数据】${JSON.stringify(stats)}
【前一日数据】${JSON.stringify(prevStats || null)}
【触发的告警】${JSON.stringify(alerts)}
【今日达人跟进】${JSON.stringify(kolTodo || [])}`;
}

async function pushWebhook(webhook, text, title) {
  if (!webhook || !webhook.url) throw new Error("未配置 Webhook 地址");
  let body;
  if (webhook.type === "wecom") body = { msgtype: "markdown", markdown: { content: text.slice(0, 4000) } };
  else {
    body = { msg_type: "text", content: { text: text.slice(0, 20000) } };
    if (webhook.secret) { const ts = String(Math.floor(Date.now() / 1000)); body.timestamp = ts; body.sign = crypto.createHmac("sha256", `${ts}\n${webhook.secret}`).update("").digest("base64"); }
  }
  const r = await fetch(webhook.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  let ok = r.ok; try { const j = JSON.parse(t); if (j.code && j.code !== 0) ok = false; if (j.errcode && j.errcode !== 0) ok = false; if (j.StatusCode && j.StatusCode !== 0) ok = false; } catch (e) {}
  return { ok, status: r.status, body: t.slice(0, 300) };
}

module.exports = { todayIn, addDays, dayStats, rangeAvg, evaluateRules, templateBrief, aiBriefPrompt, pushWebhook, latestDate, sumRows, fmt, METRIC_LABELS };
