<script>
// ===================== 一进来就开始的流程引导（五步，在真实界面上高亮讲解）+ 初始化向导 =====================
const TOUR_STEPS = [
  { center: true, stage: "", title: "粘 Brief，点一下，全套出来", text: "Brief 已经填好，先看一键出全套的效果；要接真实业务，再往下走。", cta: "开始" },
  { tool: "start", el: "#oneRun", stage: "0 · 一键", title: "点这里，方案、稿件、达人策略一起出", text: "生成过程会在卡片里实时播放。" },
  { tool: "plan", el: "#fQuick", stage: "1 · 定项目", title: "单独出方案在这里", text: "要改方案，改下面的「项目设定」。" },
  { tool: "factory", el: "#fcRun", stage: "2 · 出内容", title: "点一下，出几十条稿", text: "审过的才导出。" },
  { tool: "import", el: "#imDrop", stage: "3 · 接数据", title: "把平台导出的表拖这里", text: "达人名单、投放日报都从这里进。" },
  { tool: "kol", el: "#klOneClick", stage: "4 · 选达人", title: "一键选人", text: "按预算自动勾选，再生成合作 Brief。" },
  { tool: "monitor", el: "#moRun", stage: "5 · 盯投放", title: "每天点一下，日报推到群", text: "异常自动告警。", cta: "完成" }
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
  $("#tourStep").textContent = s.stage || ""; $("#tourTitle").textContent = s.title; $("#tourText").textContent = s.text;
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
function onboardingStart() { if (repo.mode === "server" && repo.setupNeeded) { openSetup(); return; } if (!store.get("ace.welcomed")) openWelcome(); }

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
    toast("初始化完成"); setTimeout(() => { $("#setupModal").hidden = true; openWelcome(); }, 900); }
  catch (e) { st.textContent = e.message || "初始化失败"; $("#suSave").disabled = false; $("#suLater").disabled = false; }
}
function initOnboarding() {
  $("#helpBtn").addEventListener("click", openWelcome);
  const openTut = () => { $("#tutModal").hidden = false; }; $("#tutBtn").addEventListener("click", openTut); $("#tutClose").addEventListener("click", () => { $("#tutModal").hidden = true; }); $("#tutModal").addEventListener("click", (e) => { if (e.target === $("#tutModal")) $("#tutModal").hidden = true; });
  $("#tourSkip").addEventListener("click", tourEnd); $("#tourPrev").addEventListener("click", () => { if (tour.i > 0) tourShow(tour.i - 1); }); $("#tourNext").addEventListener("click", () => { if (tour.i >= TOUR_STEPS.length - 1) tourEnd(); else tourShow(tour.i + 1); });
  document.addEventListener("keydown", (e) => { if (tour.i < 0) return; if (e.key === "Escape") tourEnd(); if (e.key === "ArrowRight") $("#tourNext").click(); if (e.key === "ArrowLeft") $("#tourPrev").click(); });
  window.addEventListener("resize", () => { if (tour.i >= 0) tourPlace(); }); window.addEventListener("scroll", () => { if (tour.i >= 0) tourPlace(); }, true);
  $("#suSave").addEventListener("click", () => doSetup(true)); $("#suLater").addEventListener("click", () => doSetup(false));
}
</script>
