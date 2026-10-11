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
module.exports = { materialize };
