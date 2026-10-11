<script>
// ===================== 设置 =====================
const APP_VERSION = "3.1";
function kv(pairs) { return pairs.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v)]); }
function renderSettings() {
  const modeTxt = IN_ARTIFACT ? "Claude Artifact 环境（数据存于浏览器，AI 由 Claude 提供）" : repo.mode === "server" ? "服务端模式（数据存于后端，所有访客看到同一份）" : "本地模式（数据只存于当前浏览器）";
  $("#stEnv").replaceChildren(...kv([["运行模式", modeTxt], ["AI", ai.ready() ? ai.label : "未配置"], ["登录", repo.mode === "server" ? (repo.authRequired ? (repo.canWrite ? "已登录（可编辑）" : "访客（只读）") : "未设置管理员口令，任何人可编辑") : "不需要"], ["数据日期", repo.now || todayStr()], ["版本", "v" + APP_VERSION]]));
  const srv = repo.mode === "server"; const l = obj(obj(DB.settings).llm);
  $("#stLlmSub").textContent = srv ? (repo.llmServer && repo.llmServer.configured ? "已配置 · " + (repo.llmServer.label || "") : "未配置") : IN_ARTIFACT ? "由 Claude 提供，无需配置" : "本地模式：使用浏览器本地 API 设置";
  $$("#stLlmBody .field, #stLlmSave").forEach((el) => { el.hidden = !srv; }); $("#stLlmSave").disabled = !repo.canWrite; $("#stApiLocal").hidden = IN_ARTIFACT;
  if (srv) { segSet($("#stLlmKind"), l.kind || "openai"); $("#stLlmBase").value = l.base || ""; $("#stLlmModel").value = l.model || ""; $("#stLlmKey").placeholder = repo.llmServer && repo.llmServer.configured ? "已设置，留空保持不变" : "sk-…"; $("#stLlmHint").textContent = repo.canWrite ? "保存后立即生效；若部署时设置了 LLM_* 环境变量，以环境变量为准。" : "登录后可修改。"; }
  else $("#stLlmHint").textContent = IN_ARTIFACT ? "" : "没有后端时，模型接口保存在你的浏览器里。";
  const p = obj(DB.project); $("#stProject").replaceChildren(...(p.brand ? kv([["品牌", p.brand], ["行业 / 目标", [p.industry, p.goal].filter(Boolean).join(" · ")], ["产品", p.product], ["人群", p.audience], ["预算 / 周期", [p.budget, p.period].filter(Boolean).join(" · ")], ["平台", arr(p.platforms).join("、")]]) : [h("dd", null, "还没有项目，去「全案策划」生成一次即可")]));
  $("#stData").replaceChildren(...kv([["达人库", DB.kols.length + " 位"], ["投放数据", DB.metrics.length + " 行"], ["内容批次", DB.batches.length + " 个"], ["告警 / 日报", DB.alerts.length + " / " + DB.briefs.length], ["洞察报告", DB.insights.length + " 份"]]));
  $("#stReset").hidden = srv && !repo.canWrite; $("#stDataHint").textContent = srv ? (repo.canWrite ? "清空会删除服务端的方案、稿件、达人、投放数据与日报，所有人同步；规则、连接器、模型设置保留。" : "登录后可清空。") : "清空会删除当前浏览器里的方案、稿件、达人、投放数据与日报；规则与设置保留。";
}
function initSettings() {
  segInit($("#stLlmKind"));
  $("#stLlmSave").addEventListener("click", async () => { if (!requireWrite()) return; const body = { llm: { kind: segVal($("#stLlmKind")), base: $("#stLlmBase").value.trim().replace(/\/+$/, ""), model: $("#stLlmModel").value.trim() } }; const key = $("#stLlmKey").value.trim(); if (key) body.llmKey = key;
    try { await repo.putSettings(body); $("#stLlmKey").value = ""; await repo.reload(); decideAiMode(); refreshAvailability(); renderSettings(); toast("模型接口已保存到服务端"); } catch (e) { toast(e.message || "保存失败"); } });
  $("#stGoPlan").addEventListener("click", () => showTool("plan"));
  $("#stExportKols").addEventListener("click", () => { if (repo.mode === "server") window.open("/api/export/kols.csv", "_blank"); else downloadFile("达人库.csv", toCsv(DB.kols, ["name", "platform", "category", "city", "followers", "avgViews", "avgEngagements", "engagementRate", "quote", "fitScore", "aiScore", "aiVerdict", "status", "nextFollowUp", "audience", "notes"], FIELD_LABELS)); });
  $("#stExportMetrics").addEventListener("click", () => { if (repo.mode === "server") window.open("/api/export/metrics.csv", "_blank"); else downloadFile("投放数据.csv", toCsv(DB.metrics, ["date", "platform", "campaign", "spend", "impressions", "clicks", "conversions", "engagements", "negatives"], FIELD_LABELS)); });
  let armed = false; $("#stReset").addEventListener("click", async () => { if (!(repo.mode === "local" || requireWrite())) return; if (!armed) { armed = true; $("#stReset").textContent = "再点一次确认清空"; setTimeout(() => { armed = false; $("#stReset").textContent = "清空全部数据"; }, 4000); return; } armed = false; $("#stReset").textContent = "清空全部数据"; await resetAllData(); });
  TOOL_RENDER.settings = renderSettings;
}

// ===================== 启动 =====================
async function boot() {
  initPlan(); initFactory(); initInsights(); initKol(); initMonitor(); initImport(); initSettings(); initStart(); initAuth(); initApiModal();
  $$("#nav button").forEach((b) => b.addEventListener("click", () => showTool(b.dataset.tool)));
  const about = $("#aboutModal"); $("#aboutBtn").addEventListener("click", () => { about.hidden = false; $("#aboutClose").focus(); }); $("#aboutClose").addEventListener("click", () => { about.hidden = true; }); about.addEventListener("click", (e) => { if (e.target === about) about.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".modal").forEach((m) => { m.hidden = true; }); });
  const server = await repo.detect(); if (!server) repo.loadLocal();
  if (IN_ARTIFACT) { ai.mode = "artifact"; ai.label = "Claude"; useCap("sample").then((s) => { state.sample = s || null; if (!s) ai.mode = "none"; refreshAvailability(); renderSettings(); }); useCap("downloads").then((d) => { state.downloads = d || null; $("#dlMdBtn").hidden = !d; }); }
  else { decideAiMode(); $("#dlMdBtn").hidden = false; }
  refreshAuthUi(); refreshAvailability(); renderAll();
  const hash = (location.hash || "").replace("#", ""); showTool(TOOLS.includes(hash) ? hash : "start");
  initOnboarding(); onboardingStart(); initFx();
}
boot();
</script>
