<script>
// ===================== 开始页：AI 状态 + 三步搬进来清单 + 清空示例 =====================
const DEMO_BRAND = "泡研社";
function startChecks() { const pj = obj(DB.project), pl = obj(DB.plan);
  return [
    { done: (pl.mode && pl.mode !== "demo") || (pj.brand && pj.brand !== DEMO_BRAND), t: "粘一段你的 Brief，生成方案", s: "全案策划 → 粘贴 → 生成。客户有意见改「项目设定」。", tool: "plan" },
    { done: DB.kols.some((x) => x.source && x.source !== "示例数据"), t: "导入你的达人名单", s: "蒲公英 / 星图导出表拖进「数据接入」→ 导入 → 达人匹配一键选人。", tool: "import" },
    { done: DB.metrics.some((r) => r.source && r.source !== "示例"), t: "导入你的投放日报", s: "后台下载的日报表拖进「数据接入」选「投放日报」→ 投放监测自动告警。", tool: "import" },
    { done: !!obj(obj(DB.settings).webhook).url, t: "填群机器人，日报自动推", s: "投放监测 → 推送设置 → 粘飞书 / 企微 Webhook → 勾自动 → 保存。", tool: "monitor" }
  ]; }
function renderStart() {
  const ready = ai.ready(); const t = $("#startAiText"); const n = $("#startAi"); n.className = "notice" + (ready ? "" : " warn");
  t.textContent = ""; t.append(h("b", null, ready ? "AI 已接入，直接用。" : "AI 还没接入。"), " ", ready ? (repo.mode === "server" ? `模型 ${ai.label.replace(/^服务端 · /, "")} 已由管理员配置，所有生成按钮可直接点，访客也能试用。` : `当前用 ${ai.label}。`) : (repo.mode === "server" ? (repo.canWrite ? "到「设置」填一个模型 Key 即可。" : "请管理员在「设置」填模型 Key。") : "到「设置」接入模型。"));
  const checks = startChecks(); const done = checks.filter((x) => x.done).length;
  $("#startIntro").textContent = done === checks.length ? "全部就绪，日常只需每天拖一份日报表。" : `三步把你的业务搬进来，已完成 ${done} / ${checks.length}。`;
  $("#startSteps").replaceChildren(...checks.map((x, i) => h("div", { class: "chk" + (x.done ? " done" : "") }, h("i", null, x.done ? "✓" : String(i + 1)), h("div", null, h("div", { class: "t" }, x.t), h("div", { class: "s" }, x.s)), h("button", { type: "button", class: "btn sm" + (x.done ? " ghost" : " primary"), onclick: () => showTool(x.tool) }, x.done ? "再看看" : "去做"))));
  const canClear = repo.mode === "local" || repo.canWrite; const hasDemo = DB.kols.some((x) => x.source === "示例数据") || DB.metrics.some((r) => r.source === "示例") || DB.batches.some((x) => x.source === "示例") || obj(DB.plan).mode === "demo";
  $("#startClear").hidden = !hasDemo; $("#startClear").disabled = !canClear; $("#startClearHint").textContent = !hasDemo ? "示例数据已清空。" : canClear ? "" : "登录后可清空。";
}
let clearArmed = false;
async function clearDemoData() {
  if (!(repo.mode === "local" || requireWrite())) return;
  if (!clearArmed) { clearArmed = true; $("#startClear").textContent = "再点一次确认清空"; setTimeout(() => { clearArmed = false; $("#startClear").textContent = "清空示例数据"; }, 4000); return; }
  clearArmed = false; $("#startClear").textContent = "清空示例数据";
  DB.kols = DB.kols.filter((x) => x.source !== "示例数据"); DB.metrics = DB.metrics.filter((r) => r.source !== "示例"); DB.batches = DB.batches.filter((x) => x.source !== "示例"); DB.insights = DB.insights.filter((x) => x.source !== "示例");
  if (obj(DB.plan).mode === "demo") { DB.plan = null; if (obj(DB.project).brand === DEMO_BRAND) DB.project = null; }
  DB.alerts = []; DB.briefs = []; fc.batch = null; ins.current = null;
  for (const c of ["kols", "metrics", "batches", "insights", "plan", "project", "alerts", "briefs"]) await save(c);
  renderAll(); toast("示例数据已清空");
}
function initStart() { TOOL_RENDER.start = renderStart; $("#startDemo").addEventListener("click", () => showTool("plan")); $("#startClear").addEventListener("click", clearDemoData); }
</script>
