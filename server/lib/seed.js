// 示例数据模板 → 具体数据：模板里用 dayOffset / nextOffset 表示相对“今天”的天数，首次启动时换算成日期。
function addDays(date, n) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function materialize(t, today) {
  const seed = JSON.parse(JSON.stringify(t || {}));
  seed.metrics = (seed.metricsTemplate || []).map((r) => { const { dayOffset, ...rest } = r; return { date: addDays(today, dayOffset), ...rest }; }); delete seed.metricsTemplate;
  seed.kols = (seed.kols || []).map((k) => { const { nextOffset, ...rest } = k; return { ...rest, nextFollowUp: nextOffset == null ? "" : addDays(today, nextOffset) }; });
  const stamp = today + "T09:00:00+08:00";
  (seed.batches || []).forEach((b) => { b.createdAt = b.createdAt || stamp; }); (seed.insights || []).forEach((x) => { x.createdAt = x.createdAt || stamp; });
  return seed;
}
// 去掉带「示例」标记的数据：旧版本部署会预装示例，升级到空白起点后首次启动时清一次；用户自己生成或导入的内容保留
function stripDemo(db) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  db.kols = arr(db.kols).filter((x) => x && x.source !== "示例数据");
  db.metrics = arr(db.metrics).filter((r) => r && r.source !== "示例");
  db.batches = arr(db.batches).filter((x) => x && x.source !== "示例");
  db.insights = arr(db.insights).filter((x) => x && x.source !== "示例");
  if (db.plan && db.plan.mode === "demo") { db.plan = null; if (db.project && db.project.brand === "泡研社") db.project = null; }
  db.briefs = arr(db.briefs).filter((b) => b && b.id !== "brief-seed" && b.id !== "brief-demo");
  if (!db.metrics.length) db.alerts = [];
  return db;
}
module.exports = { materialize, stripDemo };
