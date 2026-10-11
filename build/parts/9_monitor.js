<script>
// ===================== 投放监测：看板 / 规则告警 / 日报 / 群推送 =====================
const mo = { range: 14, briefId: null };
const OP_LABEL = { lt: "低于", gt: "高于", drop_pct: "较 7 日均值下降超过", rise_pct: "较 7 日均值上升超过" };
function monitorDates(rows) { return [...new Set(rows.map((r) => r.date))].sort().slice(-mo.range); }
function renderMonitor() {
  const rows = DB.metrics; const notice = $("#moNotice");
  if (!rows.length) { notice.hidden = false; $("#moNoticeText").textContent = "还没有投放数据。到「数据接入」导入每日报表（支持粘贴或上传各平台后台导出的表格）后，这里会自动出现看板与告警。"; $("#moTiles").replaceChildren(); $("#moCharts").replaceChildren(); } else notice.hidden = true;
  const last = latestDate(rows); const cur = dayStats(rows, last), prev = dayStats(rows, addDaysStr(last, -1)); const has = (k) => prev.overall[k] != null && prev.overall.days;
  const delta = (k, good) => { const c = cur.overall[k], p = prev.overall[k]; if (!has(k) || c == null || !p) return [null, "flat"]; const chg = (c - p) / p * 100; const cls = chg === 0 ? "flat" : (chg > 0) === good ? "up" : "down"; return [`${chg >= 0 ? "+" : ""}${r2(chg, 1)}% 环比`, cls]; };
  if (rows.length) { const o = cur.overall; const tiles = [["消耗", fmtMetric("spend", o.spend), ...delta("spend", true)], ["曝光", fmtN(o.impressions), ...delta("impressions", true)], ["CTR", o.ctr == null ? "-" : o.ctr + "%", ...delta("ctr", true)], ["CPA", fmtMetric("cpa", o.cpa), ...delta("cpa", false)], ["转化", fmtN(o.conversions), ...delta("conversions", true)], ["负评", String(o.negatives), ...delta("negatives", false)]];
    $("#moTiles").replaceChildren(h("div", { class: "mini", style: "grid-column:1/-1" }, `最新数据日 ${last}${cur.overall.days ? "" : ""} · 环比前一日`), ...tiles.map(([m, v, d, cls]) => statTile(m, v, d, cls)));
    const dates = monitorDates(rows); const series = dates.map((d) => ({ x: d, s: dayStats(rows, d).overall }));
    const plats = platformsOf(rows.filter((r) => dates.includes(r.date))); const spendBy = plats.map((p) => ({ label: p, value: sumRows(rows.filter((r) => r.platform === p && dates.includes(r.date))).spend })).sort((a, b) => b.value - a.value).map((b, i) => ({ ...b, color: SERIES[i % 3] }));
    $("#moCharts").replaceChildren(
      h("div", { class: "card" }, h("div", { class: "card-body tight" }, lineChart({ title: "每日消耗", sub: `近 ${dates.length} 天`, points: series.map((x) => ({ x: x.x, y: x.s.spend })), color: SERIES[0], fmt: (v) => fmtN(v) + " 元" }))),
      h("div", { class: "card" }, h("div", { class: "card-body tight" }, lineChart({ title: "CTR", sub: "点击 ÷ 曝光", points: series.map((x) => ({ x: x.x, y: x.s.ctr })), color: SERIES[0], fmt: (v) => r2(v, 2) + "%" }))),
      h("div", { class: "card" }, h("div", { class: "card-body tight" }, lineChart({ title: "CPA", sub: "消耗 ÷ 转化", points: series.map((x) => ({ x: x.x, y: x.s.cpa })), color: SERIES[0], fmt: (v) => r2(v, 1) + " 元" }))),
      h("div", { class: "card" }, h("div", { class: "card-body tight" }, barChart({ title: "各平台消耗", sub: `近 ${dates.length} 天合计`, bars: spendBy, fmt: (v) => fmtN(v) + " 元" }))),
      h("details", { class: "card", style: "grid-column:1/-1" }, h("summary", { class: "card-head", style: "cursor:pointer;border-bottom:0" }, h("h3", null, "数据明细"), h("span", { class: "sub" }, "按日汇总，点击展开")), h("div", { class: "card-body", style: "padding:0" }, table(["日期", "消耗", "曝光", "点击", "CTR", "转化", "CPA", "互动率", "负评"], series.slice().reverse().map(({ x, s }) => h("tr", null, h("td", { class: "num" }, x), h("td", { class: "num" }, fmtN(s.spend)), h("td", { class: "num" }, fmtN(s.impressions)), h("td", { class: "num" }, fmtN(s.clicks)), h("td", { class: "num" }, s.ctr == null ? "-" : s.ctr + "%"), h("td", { class: "num" }, fmtN(s.conversions)), h("td", { class: "num" }, s.cpa == null ? "-" : s.cpa), h("td", { class: "num" }, s.er == null ? "-" : s.er + "%"), h("td", { class: "num" }, String(s.negatives))))))));
  }
  renderAlerts(); renderRules(); renderBriefs(); renderWebhook();
}
function renderAlerts() { const canEdit = repo.mode === "local" || repo.canWrite; const list = DB.alerts.slice(0, 40); const open = DB.alerts.filter((a) => !a.acknowledged).length; $("#moAlertSub").textContent = open ? `${open} 条未处理` : "暂无未处理告警";
  $("#moAlerts").replaceChildren(...(list.length ? list.map((a) => h("div", { class: "alert " + (a.level || "warn") + (a.acknowledged ? " ack" : "") }, h("i"), h("div", null, h("div", { class: "t" }, str(a.message)), h("div", { class: "s" }, `${a.date} · ${str(a.name)}`)), h("div", null, h("span", { class: "lvl " + (a.level || "warn") }, a.level === "critical" ? "严重" : "提醒"), " ", canEdit && !a.acknowledged && h("button", { type: "button", class: "btn ghost sm", onclick: async () => { a.acknowledged = true; await save("alerts"); renderAlerts(); } }, "已读")))) : [emptyNode("没有告警", "运行监测后，命中规则的异常会出现在这里")])); }
function renderRules() { const canEdit = repo.mode === "local" || repo.canWrite; const t = $("#moRules"); t.replaceChildren(h("thead", null, h("tr", null, ["启用", "规则", "条件", "范围", "级别", ""].map((c) => h("th", null, c)))),
    h("tbody", null, ...(DB.rules.length ? DB.rules.map((r) => h("tr", null, h("td", null, h("input", { type: "checkbox", class: "checkbox", checked: r.enabled !== false, disabled: !canEdit, onchange: async (e) => { r.enabled = e.target.checked; await save("rules"); } })), h("td", null, h("b", null, str(r.name))), h("td", { class: "wrap" }, `${METRIC_LABELS[r.metric] || r.metric} ${OP_LABEL[r.op] || r.op} ${r.value}${r.op.endsWith("pct") ? "%" : (METRIC_UNITS[r.metric] || "")}`), h("td", null, r.scope === "all" || !r.scope ? "整体与各平台" : r.scope), h("td", null, h("span", { class: "lvl " + (r.level || "warn") }, r.level === "critical" ? "严重" : "提醒")), h("td", null, canEdit && h("button", { type: "button", class: "btn ghost sm", onclick: async () => { DB.rules = DB.rules.filter((x) => x !== r); await save("rules"); renderRules(); } }, "×")))) : [h("tr", null, h("td", { colspan: 6 }, h("span", { class: "mini" }, "还没有规则，在下方添加")))])));
  const sc = $("#ruScope"); const cur = sc.value; sc.replaceChildren(h("option", { value: "all" }, "整体与各平台"), ...platformsOf(DB.metrics).map((p) => h("option", { value: p }, p))); sc.value = cur || "all"; }
function renderBriefs() { const list = DB.briefs; const sel = $("#moBriefSel"); sel.replaceChildren(...list.map((b) => h("option", { value: b.id }, `${b.date} · ${b.source === "ai" ? "AI" : "模板"}${b.pushed ? " · 已推送" : ""}`))); if (!list.length) sel.append(h("option", { value: "" }, "暂无日报"));
  const b = list.find((x) => x.id === mo.briefId) || list[0]; if (b) sel.value = b.id; $("#moBriefMeta").textContent = b ? `${b.source === "ai" ? "AI 生成" : "模板生成"} · ${new Date(b.createdAt).toLocaleString("zh-CN", { hour12: false })}${b.alertCount ? ` · ${b.alertCount} 条告警` : ""}${b.pushResult ? (b.pushResult.ok ? " · 推送成功" : " · 推送失败") : ""}` : "";
  $("#moBrief").replaceChildren(b ? renderMd(b.text) : emptyNode("还没有日报", "点「运行监测」")); }
function renderWebhook() { const s = DB.settings || {}; const w = obj(s.webhook); segSet($("#whType"), w.type || "feishu"); $("#whUrl").value = w.url || ""; $("#whSecret").value = w.secret || ""; const hr = $("#whHour"); if (!hr.children.length) for (let i = 0; i < 24; i++) hr.append(h("option", { value: i }, String(i).padStart(2, "0") + ":00")); hr.value = s.dailyHour == null ? 9 : s.dailyHour; $("#whAuto").checked = !!s.autoRun; $("#whAutoPush").checked = !!s.autoPush;
  const wd = $("#whDetails"); if (wd && w.url) wd.open = true;
  const srv = repo.mode === "server"; ["#whUrl", "#whSecret", "#whHour", "#whAuto", "#whAutoPush", "#whSave", "#whTest", "#moPush"].forEach((id) => { $(id).disabled = !srv || !repo.canWrite; }); $("#whHint").textContent = !srv ? "需要部署后端。" : !repo.canWrite ? "登录后可修改。" : ""; }
async function runMonitorUi() {
  if (!DB.metrics.length) return toast("还没有投放数据");
  const btn = $("#moRun"); btn.disabled = true; btn.textContent = "运行中…";
  try {
    if (repo.mode === "server") { if (!requireWrite()) throw { silent: true }; await repo.call("/monitor/run", { push: false, useAi: true }); await repo.reload(); }
    else { const d = latestDate(DB.metrics); const ev = evaluateRules(DB.rules, DB.metrics, d); const prevStats = dayStats(DB.metrics, addDaysStr(d, -1)); const kolTodo = DB.kols.filter((k) => k.nextFollowUp && k.nextFollowUp <= d && !/已交付|暂不合作/.test(k.status || "")).slice(0, 8).map((k) => ({ name: k.name, platform: k.platform, status: k.status || "待评估", nextFollowUp: k.nextFollowUp }));
      const ctx = { date: d, stats: ev.stats, prevStats: prevStats.overall.days ? prevStats : null, alerts: ev.alerts, kolTodo, project: DB.project }; let text = null, source = "template";
      if (ai.ready()) { try { text = (await ai.text(aiBriefPrompt(ctx), { cache: false })).text; source = "ai"; } catch (e) { toast("AI 日报失败，使用模板：" + errCopy(e)); } }
      if (!text) text = templateBrief(ctx);
      const ids = new Set(DB.alerts.map((a) => a.id)); for (const a of ev.alerts) if (!ids.has(a.id)) DB.alerts.unshift(a); DB.alerts = DB.alerts.slice(0, 500); DB.briefs.unshift({ id: uid("b"), date: d, text, source, createdAt: new Date().toISOString(), pushed: false, alertCount: ev.alerts.length }); DB.briefs = DB.briefs.slice(0, 120); await save("alerts"); await save("briefs"); }
    mo.briefId = null; renderMonitor(); toast("监测完成" + (DB.alerts.filter((a) => !a.acknowledged).length ? "，有未处理告警" : ""));
  } catch (e) { if (!e.silent) toast(e.message || "运行失败"); }
  btn.disabled = false; btn.textContent = "运行监测";
}
function initMonitor() {
  segInit($("#moRange"), (v) => { mo.range = Number(v); renderMonitor(); });
  $("#moRun").addEventListener("click", runMonitorUi); $("#moAckAll").addEventListener("click", async () => { if (!(repo.mode === "local" || requireWrite())) return; DB.alerts.forEach((a) => { a.acknowledged = true; }); await save("alerts"); renderAlerts(); });
  $("#ruAdd").addEventListener("click", async () => { if (!(repo.mode === "local" || requireWrite())) return; const name = $("#ruName").value.trim(), value = num($("#ruValue").value); if (!name || value == null) return toast("请填写规则名和阈值"); DB.rules.push({ id: uid("r"), name, metric: $("#ruMetric").value, op: $("#ruOp").value, value, scope: $("#ruScope").value, level: $("#ruLevel").value, enabled: true }); if (await save("rules")) { $("#ruName").value = ""; $("#ruValue").value = ""; renderRules(); toast("规则已添加"); } });
  $("#moBriefSel").addEventListener("change", (e) => { mo.briefId = e.target.value; renderBriefs(); });
  $("#moBriefCopy").addEventListener("click", () => { const b = DB.briefs.find((x) => x.id === mo.briefId) || DB.briefs[0]; if (b) copyText(b.text, "日报已复制"); });
  $("#moPush").addEventListener("click", async () => { const b = DB.briefs.find((x) => x.id === mo.briefId) || DB.briefs[0]; if (!b) return toast("还没有日报"); if (!requireWrite()) return; try { const r = await repo.call("/monitor/push", { briefId: b.id }); toast(r.ok ? "已推送到群" : "推送失败：" + (r.body || "")); await repo.reload(); renderBriefs(); } catch (e) { toast("推送失败：" + (e.message || "")); } });
  segInit($("#whType"));
  $("#whSave").addEventListener("click", async () => { if (!requireWrite()) return; try { await repo.putSettings({ webhook: { type: segVal($("#whType")), url: $("#whUrl").value.trim(), secret: $("#whSecret").value.trim() }, dailyHour: Number($("#whHour").value), autoRun: $("#whAuto").checked, autoPush: $("#whAutoPush").checked }); toast("推送设置已保存"); renderWebhook(); } catch (e) { toast(e.message || "保存失败"); } });
  $("#whTest").addEventListener("click", async () => { if (!requireWrite()) return; $("#whHint").textContent = "发送中…"; try { const r = await repo.call("/webhook/test"); $("#whHint").textContent = r.ok ? "群里应该已收到测试消息。" : "发送失败：" + (r.body || ""); } catch (e) { $("#whHint").textContent = "发送失败：" + (e.message || ""); } });
  TOOL_RENDER.monitor = renderMonitor;
}
</script>
