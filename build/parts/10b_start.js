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
// ---- 产出计数 ----
function renderOutput() { const pl = obj(DB.plan); const chapters = pl.results ? Object.values(pl.results).filter(Boolean).length : 0; const drafts = DB.batches.reduce((a, b) => a + arr(b.items).length, 0); const reviewed = DB.batches.reduce((a, b) => a + arr(b.items).filter((x) => x.status === "已审校").length, 0); const evaluated = DB.kols.filter((k) => num(k.aiScore) != null).length;
  $("#startOutput").replaceChildren(statTile("方案", chapters + " 章", pl.mode === "demo" ? "示例" : chapters ? "AI 生成" : "尚未生成"), statTile("稿件", String(drafts), `已审 ${reviewed}`), statTile("达人", `${DB.kols.length} 位`, `AI 评估 ${evaluated}`), statTile("日报", String(DB.briefs.length), `告警 ${DB.alerts.length}`), statTile("洞察", String(DB.insights.length), "份")); }

// ---- 一键出全套 ----
const ONE_STEPS = [["brief", "整理 Brief"], ["plan", "方案五章"], ["content", "内容矩阵"], ["kolS", "达人策略"], ["kol", "达人组合 + 合作 Brief"]];
const one = { running: false, st: {} };
function renderOneProgress() { $("#oneProgress").replaceChildren(...ONE_STEPS.map(([k, t], i) => { const x = one.st[k] || { s: "pending", detail: "" }; const cls = x.s === "done" ? "done" : x.s === "running" ? "running" : x.s === "fail" ? "fail" : x.s === "skip" ? "skip" : "";
  return h("div", { class: "chk " + cls }, h("i", null, x.s === "done" ? "✓" : x.s === "fail" ? "×" : x.s === "running" ? "…" : String(i + 1)), h("div", null, h("div", { class: "t" }, t), h("div", { class: "s" }, x.detail || ""))); })); }
function oneSet(k, s, detail) { one.st[k] = { s, detail: detail || "" }; renderOneProgress(); }
async function runOneClick() {
  if (!ai.ready()) { refreshAvailability(); return; } const text = $("#oneBrief").value.trim(); if (!text) { $("#oneHint").textContent = "先粘一段 Brief。"; return; }
  one.running = true; one.st = {}; $("#oneRun").disabled = true; $("#oneProgress").hidden = false; $("#oneSummary").hidden = true; $("#oneHint").textContent = "生成中，可以切到别的页面看，这里会继续。"; const t0 = Date.now(); renderOneProgress();
  const fast = $("#oneFast").checked; $("#fastMode").checked = fast; let brief = null, drafts = 0, plat = "小红书", picked = 0, briefOk = false, strategyOk = false;
  try { oneSet("brief", "running"); $("#fQuick").value = text; await parseQuick(); brief = readForm(); oneSet("brief", "done", `${brief.brand} · ${brief.goal}`); }
  catch (e) { oneSet("brief", "fail", errCopy(e)); one.running = false; $("#oneRun").disabled = !ai.ready(); fatalCode(e); return; }
  oneSet("plan", "running", "0/5"); const poll = setInterval(() => { const d = STAGES.filter((x) => stageK[x.id] === "done").length; one.st.plan.detail = `${d}/5 · ${STAGES.filter((x) => stageK[x.id] === "run").map((x) => x.t).join(" ")}`; renderOneProgress(); }, 600);
  await runPipeline(brief); clearInterval(poll); const dn = STAGES.filter((x) => stageK[x.id] === "done").length; oneSet("plan", dn ? "done" : "fail", `${dn}/5 章`);
  plat = arr(brief.platforms).find((p) => ["小红书", "抖音", "微信", "微博", "B站", "快手", "视频号"].includes(p)) || "小红书";
  oneSet("content", "running", "0 条"); try { await runMatrix({ types: ["koc", "reply", "feed"], platforms: [plat], per: 5, context: projectContext(), must: obj(DB.project).keyMessages || "", avoid: "", tier: fast ? "quick" : "default", onItem: () => { drafts++; one.st.content.detail = `${drafts} 条 · ${plat}`; renderOneProgress(); } }); oneSet("content", drafts ? "done" : "fail", `${drafts} 条 · ${plat}（种草笔记 / 评论回复 / 信息流）`); } catch (e) { oneSet("content", "fail", errCopy(e)); }
  oneSet("kolS", "running"); try { const kp = arr(brief.platforms).filter((p) => KOL_PLATFORMS.includes(p)).slice(0, 2); $("#ksBrand").value = projectContext(); await kolStrategyGen({ context: projectContext(), platforms: kp.length ? kp : ["小红书", "抖音"], budget: $("#ksBudget").value, goal: "新品种草 / 认知" }); strategyOk = true; oneSet("kolS", "done", "金字塔 · 赛道 · 筛选标准"); } catch (e) { oneSet("kolS", "fail", errCopy(e)); }
  if (DB.kols.length) { oneSet("kol", "running", `评估 ${Math.min(30, DB.kols.length)} 位…`); try { picked = await kolOneClick(); if (picked) { one.st.kol.detail = `已选 ${picked} 位，写合作 Brief…`; renderOneProgress(); try { await kolBriefGen(); briefOk = true; } catch (e) {} } oneSet("kol", "done", `${picked} 位` + (briefOk ? " · 合作 Brief 已写" : "")); } catch (e) { oneSet("kol", "fail", errCopy(e)); } }
  else oneSet("kol", "skip", "没有达人名单，导入后可一键选人");
  one.running = false; $("#oneRun").disabled = !ai.ready(); renderOutput(); const secs = Math.round((Date.now() - t0) / 1000); $("#oneHint").textContent = `完成，用时 ${secs} 秒。`;
  const sum = $("#oneSummary"); sum.hidden = false; sum.className = "toolbar"; sum.replaceChildren(h("span", { class: "cnt" }, `从 1 段 Brief 产出：方案 ${dn} 章 · 稿件 ${drafts} 条${strategyOk ? " · 达人策略 1 份" : ""}${picked ? ` · 达人组合 ${picked} 位` : ""}${briefOk ? " · 合作 Brief 1 份" : ""}`),
    h("div", { class: "right" }, h("button", { type: "button", class: "btn sm primary", onclick: () => showTool("plan") }, "看方案"), h("button", { type: "button", class: "btn sm", onclick: () => showTool("factory") }, "看稿件"), h("button", { type: "button", class: "btn sm", onclick: () => { showTool("kol"); segSet($("#kolMode"), "strategy"); $("#kolLib").hidden = true; $("#kolStrategy").hidden = false; } }, "看达人策略"), picked ? h("button", { type: "button", class: "btn sm", onclick: () => { showTool("kol"); segSet($("#kolMode"), "lib"); $("#kolLib").hidden = false; $("#kolStrategy").hidden = true; } }, "看组合") : null));
}
function initStart() { TOOL_RENDER.start = () => { renderStart(); renderOutput(); if (!$("#oneBrief").value) $("#oneBrief").value = briefToQuick(obj(DB.plan).mode === "demo" || !obj(DB.project).brand ? SAMPLE_BRIEFS[1] : DB.project); }; $("#startDemo").addEventListener("click", () => showTool("plan")); $("#startClear").addEventListener("click", clearDemoData); $("#oneRun").addEventListener("click", runOneClick); }
</script>
