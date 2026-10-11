<script>
// ===================== 一进来就开始的流程引导（五步，在真实界面上高亮讲解）+ 初始化向导 =====================
const TOUR_STEPS = [
  { center: true, stage: "", title: "跟着走一遍完整流程", text: "五步，每步一个动作：粘贴、点一下、拖进来。示例数据已经填好，引导里高亮的按钮可以直接点，不会弄坏任何东西。大约 2 分钟。", cta: "开始" },
  { tool: "plan", el: "#fQuick", stage: "第 1 步 · 定项目", title: "把客户 Brief 粘进来", text: "随便写一段需求，点「生成全案」，AI 先整理成表单，再由五个智能体接力出洞察、策略、内容、媒介、执行指令。" },
  { tool: "plan", el: "#projCard", stage: "第 1 步 · 定项目", title: "客户改了方案？在这里改，不用上传", text: "生成后传播主张自动填入。客户换了主张、改了核心信息，或者不用 AI 的方案，就在「项目设定」里改或把客户确认版粘进来，保存。后面所有工具都按这个版本。", open: "#projCard" },
  { tool: "factory", el: "#fcRun", stage: "第 2 步 · 出内容", title: "点一下，几十条稿件", text: "选类型和数量，开始生成，稿件一条条出现，视角各不相同。" },
  { tool: "factory", el: "#fcNotes", stage: "第 2 步 · 出内容", title: "逐条审校，只交付审过的", text: "每条可改稿、标为已审校；广告法敏感词自动标出。右上角「导出 CSV」或「复制已审校」交给达人或运营。" },
  { tool: "import", el: "#imDrop", stage: "第 3 步 · 选达人", title: "平台导出的表拖进来", text: "蒲公英、星图导出的达人表，或投放后台的日报表，拖进来或直接粘贴，字段自动识别，确认后进入达人库 / 投放数据。" },
  { tool: "kol", el: "#klOneClick", stage: "第 3 步 · 选达人", title: "一键推荐组合", text: "AI 评估名单里每位达人，再按本轮预算自动勾选。CPM / CPE 按公式算，表里可手动增减、记合作状态和跟进日。" },
  { tool: "kol", el: "#klBrief", stage: "第 3 步 · 选达人", title: "生成合作 Brief", text: "按项目设定和已选达人写一份可直接发给达人或 MCN 的 Brief，含核心信息、交付节点、合规要求。" },
  { tool: "monitor", el: "#moRun", stage: "第 4 步 · 盯投放", title: "运行监测，出日报", text: "每天把日报表拖进「数据接入」，这里自动按规则告警：CTR 掉了、CPA 超了、负评多了。点一下生成 AI 日报。" },
  { tool: "monitor", el: "#whDetails", stage: "第 4 步 · 盯投放", title: "填一次机器人，每天自动推", text: "飞书或企微群机器人的 Webhook 填进来，勾选自动运行与自动推送，到点日报自己到群里。", open: "#whDetails" },
  { tool: "insights", el: "#inRun", stage: "第 5 步 · 看反馈", title: "评论粘进来，看用户怎么说", text: "主题、原话、情绪、负面预警一次出来。负面先回应，机会词写进下一批内容的视角里。" },
  { center: true, stage: "完成", title: "就这五步", text: "现在页面里都是示例数据，每个工具左侧的主按钮直接点就能看效果。左下角「重看引导」可以重来，「完整流程」是文字版。", cta: "开始使用" }
];
const tour = { i: -1, timer: null };
function tourPlace() {
  const s = TOUR_STEPS[tour.i]; if (!s || s.center) return; const el = $(s.el); if (!el) return;
  const r = el.getBoundingClientRect(); const pad = 8; const spot = $("#tourSpot"); spot.hidden = false; spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px"; spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
  const card = $("#tourCard"); const cw = card.offsetWidth, ch = card.offsetHeight; const vw = window.innerWidth, vh = window.innerHeight;
  let top = r.bottom + pad + 12; if (top + ch > vh - 12) top = Math.max(12, r.top - pad - 12 - ch); if (top + ch > vh - 12) top = vh - ch - 12;
  let left = Math.min(Math.max(12, r.left), vw - cw - 12); if (vw < 600) left = 16;
  card.style.left = left + "px"; card.style.top = top + "px";
}
function tourShow(i) {
  tour.i = i; const s = TOUR_STEPS[i]; const layer = $("#tour"); layer.hidden = false; const card = $("#tourCard");
  $("#tourStep").textContent = (s.stage ? s.stage + " · " : "") + `${i + 1} / ${TOUR_STEPS.length}`; $("#tourTitle").textContent = s.title; $("#tourText").textContent = s.text;
  $("#tourPrev").disabled = i === 0; $("#tourBar").style.width = Math.round((i + 1) / TOUR_STEPS.length * 100) + "%"; $("#tourNext").textContent = s.cta || (i === TOUR_STEPS.length - 1 ? "完成" : "下一步");
  if (s.center) { clearTimeout(tour.timer); $("#tourSpot").hidden = true; card.classList.add("center"); card.style.left = ""; card.style.top = ""; return; }
  card.classList.remove("center");
  if ($("#tool-" + s.tool).hidden) showTool(s.tool);
  if (s.open) { const d = $(s.open); if (d && "open" in d) d.open = true; }
  const el = $(s.el); if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
  clearTimeout(tour.timer); tour.timer = setTimeout(tourPlace, 80);
}
function tourEnd() { $("#tour").hidden = true; $("#tourCard").classList.remove("center"); tour.i = -1; store.set("ace.welcomed", true); }
function tourStart() { tourShow(0); }
function onboardingStart() { if (repo.mode === "server" && repo.setupNeeded) { openSetup(); return; } if (!store.get("ace.welcomed")) tourStart(); }

// ---- 初始化向导（服务端首次启动） ----
const su = { provider: "deepseek" };
function suFill(id) { const p = API_PRESETS[id] || API_PRESETS.custom; su.provider = id; $$("#suProvider button").forEach((b) => b.classList.toggle("on", b.dataset.v === id)); $("#suBase").value = p.base; $("#suModel").value = p.model; $("#suHelp").textContent = p.help; }
function openSetup() { $("#setupModal").hidden = false; if (!$("#suProvider").children.length) { $("#suProvider").replaceChildren(...Object.entries(API_PRESETS).map(([id, p]) => h("button", { type: "button", "data-v": id, onclick: () => suFill(id) }, p.label))); suFill("deepseek"); } setTimeout(() => $("#suToken").focus(), 50); }
async function doSetup(withLlm) {
  const token = $("#suToken").value.trim(); const st = $("#suHint"); if (token.length < 4) { st.textContent = "口令至少 4 位。"; return; }
  const body = { token }; if (withLlm) { const base = $("#suBase").value.trim(), model = $("#suModel").value.trim(), key = $("#suKey").value.trim(); if (!base || !model) { st.textContent = "请填写接口地址和模型名。"; return; } body.llm = { kind: (API_PRESETS[su.provider] || {}).kind || "openai", base, model }; if (key) body.llmKey = key; }
  $("#suSave").disabled = true; $("#suLater").disabled = true; st.textContent = "保存中…";
  try { const r = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "初始化失败");
    repo.setToken(token); await repo.reload(); decideAiMode(); refreshAuthUi(); refreshAvailability(); renderAll();
    if (withLlm) { st.textContent = "口令已设置，正在测试模型…"; try { const { text } = await ai.text("请只回复两个字：连接成功", { tier: "quick" }); st.textContent = "模型连接成功：" + text.trim().slice(0, 20); } catch (e) { st.textContent = "口令已设置，但模型测试失败：" + errCopy(e) + " 可稍后在「设置」里修改。"; $("#suSave").disabled = false; $("#suLater").disabled = false; return; } }
    toast("初始化完成"); setTimeout(() => { $("#setupModal").hidden = true; tourStart(); }, 900); }
  catch (e) { st.textContent = e.message || "初始化失败"; $("#suSave").disabled = false; $("#suLater").disabled = false; }
}
function initOnboarding() {
  $("#helpBtn").addEventListener("click", tourStart);
  const openTut = () => { $("#tutModal").hidden = false; }; $("#tutBtn").addEventListener("click", openTut); $("#tutClose").addEventListener("click", () => { $("#tutModal").hidden = true; }); $("#tutModal").addEventListener("click", (e) => { if (e.target === $("#tutModal")) $("#tutModal").hidden = true; });
  $("#tourSkip").addEventListener("click", tourEnd); $("#tourPrev").addEventListener("click", () => { if (tour.i > 0) tourShow(tour.i - 1); }); $("#tourNext").addEventListener("click", () => { if (tour.i >= TOUR_STEPS.length - 1) tourEnd(); else tourShow(tour.i + 1); });
  document.addEventListener("keydown", (e) => { if (tour.i < 0) return; if (e.key === "Escape") tourEnd(); if (e.key === "ArrowRight") $("#tourNext").click(); if (e.key === "ArrowLeft") $("#tourPrev").click(); });
  window.addEventListener("resize", () => { if (tour.i >= 0) tourPlace(); }); window.addEventListener("scroll", () => { if (tour.i >= 0) tourPlace(); }, true);
  $("#suSave").addEventListener("click", () => doSetup(true)); $("#suLater").addEventListener("click", () => doSetup(false));
}
</script>
