<script>
// ===================== 开始页：Hero + 一键出全套（流水线实时播放）+ 把真实业务搬进来（折叠） =====================
const DEMO_BRAND = "泡研社";
const hasDemoData = () => DB.kols.some((x) => x.source === "示例数据") || DB.metrics.some((r) => r.source === "示例") || DB.batches.some((x) => x.source === "示例") || DB.insights.some((x) => x.source === "示例") || obj(DB.plan).mode === "demo";
function startChecks() { const pj = obj(DB.project), pl = obj(DB.plan);
  return [
    { done: (pl.mode && pl.mode !== "demo") || (pj.brand && pj.brand !== DEMO_BRAND), t: "粘一段你的 Brief，生成方案", s: "上面一键出全套，或到「全案策划」单独生成。客户有意见改「项目设定」。", tool: "plan" },
    { done: DB.kols.some((x) => x.source && x.source !== "示例数据"), t: "导入你的达人名单", s: "蒲公英 / 星图导出表拖进「数据接入」→ 导入 → 达人匹配一键选人。", tool: "import" },
    { done: DB.metrics.some((r) => r.source && r.source !== "示例"), t: "导入你的投放日报", s: "后台下载的日报表拖进「数据接入」选「投放日报」→ 投放监测自动告警。", tool: "import" },
    { done: !!obj(obj(DB.settings).webhook).url, t: "填群机器人，日报自动推", s: "投放监测 → 推送设置 → 粘飞书 / 企微 Webhook → 勾自动 → 保存。", tool: "monitor" }
  ]; }
// Hero 上的 AI 状态胶囊（AI 可用性变化时由 refreshAvailability 调用）
function renderStartStatus() {
  const n = $("#startAi"); if (!n) return; const ready = ai.ready(); n.className = "hero-status " + (ready ? "ok" : "warn");
  $("#startAiText").textContent = ready ? "AI 已接入 · " + ai.label.replace(/^服务端 · /, "") : IN_ARTIFACT && state.sample === undefined ? "正在检测 AI…" : repo.mode === "server" ? (repo.canWrite ? "AI 未配置 · 到「设置」填模型 Key" : "AI 未配置 · 请管理员在「设置」填 Key") : IN_ARTIFACT ? "AI 不可用 · 登录 Claude 后可生成" : "AI 未接入 · 到「设置」填接口";
  const run = $("#oneRun"); if (run) run.classList.toggle("ready", ready && !one.running);
  if (!one.running && !ready) $("#oneHint").textContent = hasDemoData() ? "" : "没有 AI 也能先看效果：展开下面「把真实业务搬进来」→ 载入示例数据。";
}
function renderStart() {
  renderStartStatus();
  const checks = startChecks(); const done = checks.filter((x) => x.done).length;
  $("#startIntro").textContent = done === checks.length ? "全部就绪，日常只需每天拖一份日报表" : "导入达人名单、投放日报，接上群机器人";
  const pill = $("#startMorePill"); pill.textContent = `${done} / ${checks.length}`; pill.className = "pill" + (done === checks.length ? " ok" : done ? " accent" : "");
  $("#startSteps").replaceChildren(...checks.map((x, i) => h("div", { class: "chk" + (x.done ? " done" : "") }, h("i", null, x.done ? "✓" : String(i + 1)), h("div", null, h("div", { class: "t" }, x.t), h("div", { class: "s" }, x.s)), h("button", { type: "button", class: "btn sm" + (x.done ? " ghost" : ""), onclick: () => showTool(x.tool) }, x.done ? "再看看" : "去做"))));
  const canClear = repo.mode === "local" || repo.canWrite; const demo = hasDemoData();
  $("#startClear").hidden = !demo; $("#startClear").disabled = !canClear; $("#startDemo").hidden = demo; $("#startDemo").disabled = !canClear;
  $("#startClearHint").textContent = canClear ? "" : "登录后可载入或清空示例。";
}
// ---- 示例数据：载入 / 清空；全部清空 ----
let clearArmed = false;
async function clearDemoData() {
  if (!(repo.mode === "local" || requireWrite())) return;
  if (!clearArmed) { clearArmed = true; $("#startClear").textContent = "再点一次确认清空"; setTimeout(() => { clearArmed = false; $("#startClear").textContent = "清空示例数据"; }, 4000); return; }
  clearArmed = false; $("#startClear").textContent = "清空示例数据";
  stripDemo(DB); fc.batch = null; ins.current = null; P.results = {}; P.brief = null;
  for (const c of ["kols", "metrics", "batches", "insights", "plan", "project", "alerts", "briefs"]) await save(c);
  renderAll(); toast("示例数据已清空");
}
async function loadDemoData() {
  if (!(repo.mode === "local" || requireWrite())) return; $("#startDemo").disabled = true;
  const seed = materializeSeed(SEED_TEMPLATE, repo.now || todayStr()); stripDemo(DB);
  DB.project = seed.project; DB.plan = seed.plan; DB.kols = [...DB.kols, ...seed.kols]; DB.metrics = [...DB.metrics, ...seed.metrics].sort((a, b) => (a.date < b.date ? -1 : 1)); DB.batches = [...seed.batches, ...DB.batches]; DB.insights = [...seed.insights, ...DB.insights];
  if (!arr(DB.rules).length) DB.rules = seed.rules;
  const ev = evaluateRules(DB.rules, DB.metrics, latestDate(DB.metrics)); DB.alerts = ev.alerts;
  DB.briefs = [{ id: "brief-demo", date: ev.date, text: templateBrief({ date: ev.date, stats: ev.stats, prevStats: dayStats(DB.metrics, addDaysStr(ev.date, -1)), alerts: ev.alerts, kolTodo: [], project: DB.project }), source: "template", createdAt: new Date().toISOString(), pushed: false, alertCount: ev.alerts.length }, ...DB.briefs.filter((b) => b.id !== "brief-demo")];
  fc.batch = null; ins.current = null;
  for (const c of ["project", "plan", "kols", "metrics", "rules", "alerts", "briefs", "batches", "insights"]) await save(c);
  renderAll(); toast("示例数据已载入，每个页面都有内容了");
}
async function resetAllData() {
  if (repo.mode === "local") { const keep = { settings: DB.settings, rules: DB.rules, connectors: DB.connectors }; repo.resetLocal(false); Object.assign(DB, keep); store.set("ace.db", DB); }
  else { DB.project = null; DB.plan = null; DB.kols = []; DB.metrics = []; DB.alerts = []; DB.briefs = []; DB.batches = []; DB.insights = []; for (const c of ["project", "plan", "kols", "metrics", "alerts", "briefs", "batches", "insights"]) await save(c); }
  fc.batch = null; ins.current = null; P.results = {}; P.brief = null; renderAll(); toast("已清空，回到空白起点");
}
// ---- 产出计数（有内容才显示） ----
function renderOutput() { const pl = obj(DB.plan); const chapters = pl.results ? Object.values(pl.results).filter(Boolean).length : 0; const drafts = DB.batches.reduce((a, b) => a + arr(b.items).length, 0); const reviewed = DB.batches.reduce((a, b) => a + arr(b.items).filter((x) => x.status === "已审校").length, 0); const evaluated = DB.kols.filter((k) => num(k.aiScore) != null).length;
  const el = $("#startOutput"); const any = (chapters || drafts || DB.kols.length || DB.briefs.length || DB.insights.length) && $("#oneSummary").hidden; el.hidden = !any; if (!any) { el.replaceChildren(); return; }
  el.replaceChildren(statTile("方案", chapters + " 章", pl.mode === "demo" ? "示例" : chapters ? "AI 生成" : "尚未生成"), statTile("稿件", String(drafts), `已审 ${reviewed}`), statTile("达人", `${DB.kols.length} 位`, `AI 评估 ${evaluated}`), statTile("日报", String(DB.briefs.length), `告警 ${DB.alerts.length}`), statTile("洞察", String(DB.insights.length), "份")); }

// ---- 一键出全套：流水线 ----
const ONE_ICON = { brief: "M7 3h7l5 5v13H7z|M14 3v5h5|M10 13h5|M10 17h5", plan: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M12 3v3M12 18v3M3 12h3M18 12h3", content: "M3 4h18v6H3z|M3 14h8v6H3z|M13 14h8v6h-8z", kolS: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", kol: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z|M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6|M17 11a3 3 0 1 0 0-6|M21 20c0-2.8-1.9-5.1-4.5-5.8" };
const ONE_STEPS = [["brief", "整理 Brief"], ["plan", "方案五章"], ["content", "内容矩阵"], ["kolS", "达人策略"], ["kol", "达人组合"]];
const one = { running: false, st: {}, doneOnce: false, sampleIdx: 0, typeRaf: 0, nodes: {} };
function icon(paths) { const s = sv("svg", { viewBox: "0 0 24 24" }); for (const d of paths.split("|")) s.append(sv("path", { d })); return s; }
function buildPipe() { one.nodes = {}; $("#onePipe").replaceChildren(...ONE_STEPS.map(([k, t]) => { const n = h("div", { class: "pnode" }, h("div", { class: "ring" }, icon(ONE_ICON[k]), h("span", { class: "chk" }, "✓"), h("span", { class: "x" }, "×")), h("div", { class: "t" }, t), h("div", { class: "s" }, "")); one.nodes[k] = n; return n; })); }
function oneSet(k, s, detail) { one.st[k] = { s, detail: detail || "" }; const n = one.nodes[k]; if (!n) return; n.className = "pnode " + (s === "pending" ? "" : s) + (s === "done" || s === "fail" || s === "skip" ? " lit" : ""); $(".s", n).textContent = detail || ""; $(".s", n).title = detail || "";
  if (s === "running") { $("#oneLive b").textContent = ONE_STEPS.find((x) => x[0] === k)[1]; } }
function liveText(t) { const box = $("#oneLiveText"); box.replaceChildren(h("span", null, t)); requestAnimationFrame(() => { const sp = box.firstElementChild; $("#oneLive").classList.toggle("fade", !!sp && sp.scrollWidth > box.clientWidth + 1); }); }
function liveSub(text) { if (!one.running) return; const t = String(text || "").replace(/\s+/g, " ").replace(/[{}\[\]"`#*\\]/g, "").replace(/\b[a-z_]+:\s*/g, "").trim(); liveText(t.slice(-200)); }
function feedPush(it) { const f = $("#oneFeed"); f.hidden = false; f.prepend(h("div", { class: "fi" }, h("div", { class: "fh" }, it.platform ? h("span", { class: "plat" }, str(it.platform)) : null, h("span", null, [str(it.typeLabel), str(it.persona)].filter(Boolean).join(" · "))), h("h5", null, str(it.title) || str(it.body).slice(0, 24)), h("p", null, str(it.body)))); while (f.children.length > 6) f.lastElementChild.remove(); }
function oneButton(label, busy) { const b = $("#oneRun"); $("span", b).textContent = label; b.classList.toggle("busy", !!busy); }
async function runOneClick() {
  if (!ai.ready()) { refreshAvailability(); return; } finishTyping(); const text = $("#oneBrief").value.trim(); if (!text) { $("#oneHint").textContent = "先粘一段 Brief。"; $("#oneBrief").focus(); return; }
  one.running = true; one.st = {}; const run = $("#oneRun"); run.disabled = true; run.classList.remove("ready"); oneButton("生成中…", true);
  $("#oneCard").classList.add("running"); buildPipe(); $("#onePipe").hidden = false; const live = $("#oneLive"); live.hidden = false; live.classList.remove("idle"); $("#oneLive b").textContent = "AI"; liveText("连接模型…"); $("#oneFeed").hidden = true; $("#oneFeed").replaceChildren(); $("#oneSummary").hidden = true; $("#oneHint").textContent = "生成中，切到别的页面也会继续。";
  aiLive.subs.add(liveSub); const t0 = Date.now(); const fast = $("#oneFast").checked; $("#fastMode").checked = fast;
  let brief = null, drafts = 0, plat = "小红书", picked = 0, briefOk = false, strategyOk = false, dn = 0;
  const finish = () => { aiLive.subs.delete(liveSub); one.running = false; one.doneOnce = true; $("#oneCard").classList.remove("running"); run.disabled = !ai.ready(); run.classList.toggle("ready", ai.ready()); live.classList.add("idle"); renderOutput(); };
  try { oneSet("brief", "running"); $("#fQuick").value = text; await parseQuick(); brief = readForm(); if (!brief.brand) throw { code: "invalid_json", message: "brief" }; oneSet("brief", "done", `${brief.brand} · ${brief.goal}`); }
  catch (e) { oneSet("brief", "fail", errCopy(e)); finish(); oneButton("重试", false); liveText(errCopy(e)); $("#oneHint").textContent = errCopy(e); fatalCode(e); return; }
  oneSet("plan", "running", "0/5"); const poll = setInterval(() => { const d = STAGES.filter((x) => stageK[x.id] === "done").length; const run_ = STAGES.filter((x) => stageK[x.id] === "run").map((x) => x.t).join(" "); oneSet("plan", "running", `${d}/5${run_ ? " · " + run_ : ""}`); }, 500);
  await runPipeline(brief); clearInterval(poll); dn = STAGES.filter((x) => stageK[x.id] === "done").length; oneSet("plan", dn ? "done" : "fail", `${dn}/5 章`);
  plat = arr(brief.platforms).find((p) => ["小红书", "抖音", "微信", "微博", "B站", "快手", "视频号"].includes(p)) || "小红书";
  oneSet("content", "running", "0 条"); try { await runMatrix({ types: ["koc", "reply", "feed"], platforms: [plat], per: 5, context: projectContext(), must: obj(DB.project).keyMessages || "", avoid: "", tier: fast ? "quick" : "default", onItem: (it) => { drafts++; oneSet("content", "running", `${drafts} 条 · ${plat}`); feedPush(it); } }); oneSet("content", drafts ? "done" : "fail", `${drafts} 条 · ${plat}`); } catch (e) { oneSet("content", "fail", errCopy(e)); }
  oneSet("kolS", "running"); try { const kp = arr(brief.platforms).filter((p) => KOL_PLATFORMS.includes(p)).slice(0, 2); $("#ksBrand").value = projectContext(); await kolStrategyGen({ context: projectContext(), platforms: kp.length ? kp : ["小红书", "抖音"], budget: $("#ksBudget").value, goal: "新品种草 / 认知" }); strategyOk = true; oneSet("kolS", "done", "金字塔 · 赛道 · 标准"); } catch (e) { oneSet("kolS", "fail", errCopy(e)); }
  if (DB.kols.length) { oneSet("kol", "running", `评估 ${Math.min(30, DB.kols.length)} 位…`); try { picked = await kolOneClick(); if (picked) { oneSet("kol", "running", `已选 ${picked} 位 · 写合作 Brief…`); try { await kolBriefGen(); briefOk = true; } catch (e) {} } oneSet("kol", "done", `${picked} 位` + (briefOk ? " · Brief 已写" : "")); } catch (e) { oneSet("kol", "fail", errCopy(e)); } }
  else oneSet("kol", "skip", "没有达人名单");
  finish(); const secs = Math.round((Date.now() - t0) / 1000); oneButton("再出一套", false); $("#oneHint").textContent = ""; $("#oneLive b").textContent = "完成"; liveText(`${secs} 秒 · 方案 ${dn} 章 · 稿件 ${drafts} 条${strategyOk ? " · 达人策略 1 份" : ""}${picked ? ` · 达人组合 ${picked} 位` : ""}${briefOk ? " · 合作 Brief 1 份" : ""}`);
  const sum = $("#oneSummary"); sum.hidden = false; sum.replaceChildren(
    h("div", { class: "stats" }, statTile("方案", `${dn} 章`, dn === 5 ? "五章齐全" : dn ? "部分完成" : "未生成"), statTile("稿件", String(drafts), `${plat} · 种草 / 回复 / 信息流`), statTile("达人策略", strategyOk ? "1 份" : "0", strategyOk ? "金字塔 · 筛选标准" : "未生成"), picked ? statTile("达人组合", `${picked} 位`, briefOk ? "合作 Brief 已写" : "按预算勾选") : statTile("达人组合", "—", DB.kols.length ? "未选出" : "导入名单后可选人"), statTile("用时", `${secs} 秒`, fast ? "快速模式" : "深度模式")),
    h("div", { class: "acts" }, h("span", { class: "cnt" }, "已保存，到各页细看、修改、导出。"), h("button", { type: "button", class: "btn sm primary", onclick: () => showTool("plan") }, "看方案"), h("button", { type: "button", class: "btn sm", onclick: () => showTool("factory") }, "看稿件"), h("button", { type: "button", class: "btn sm", onclick: () => { showTool("kol"); segSet($("#kolMode"), "strategy"); $("#kolLib").hidden = true; $("#kolStrategy").hidden = false; } }, "看达人策略"), picked ? h("button", { type: "button", class: "btn sm", onclick: () => { showTool("kol"); segSet($("#kolMode"), "lib"); $("#kolLib").hidden = false; $("#kolStrategy").hidden = true; } }, "看组合") : null));
  renderOutput();
}
// ---- Brief 预填：打字机效果 ----
function typeInto(el, text) { cancelAnimationFrame(one.typeRaf); one.typing = null; if (NO_MOTION) { el.value = text; return; } let i = 0; one.typing = { el, text }; const step = () => { if (!one.typing) return; i = Math.min(text.length, i + Math.max(2, Math.round(text.length / 40))); el.value = text.slice(0, i); if (i < text.length) one.typeRaf = requestAnimationFrame(step); else one.typing = null; }; one.typeRaf = requestAnimationFrame(step); }
// 打字还没打完就点按钮 / 点进输入框：立刻补全
function finishTyping() { if (!one.typing) return; cancelAnimationFrame(one.typeRaf); one.typing.el.value = one.typing.text; one.typing = null; }
function defaultBrief() { const pj = obj(DB.project); return pj.brand && obj(DB.plan).mode !== "demo" ? briefToQuick(pj) : briefToQuick(SAMPLE_BRIEFS[one.sampleIdx % SAMPLE_BRIEFS.length]); }
function initStart() {
  TOOL_RENDER.start = () => { renderStart(); renderOutput(); if (!$("#oneBrief").value && !one.running) typeInto($("#oneBrief"), defaultBrief()); fxStart(); };
  $("#startDemo").addEventListener("click", loadDemoData); $("#startClear").addEventListener("click", clearDemoData); $("#oneRun").addEventListener("click", runOneClick);
  $("#oneSwap").addEventListener("click", () => { if (one.running) return; one.sampleIdx = (one.sampleIdx + 1) % SAMPLE_BRIEFS.length; typeInto($("#oneBrief"), briefToQuick(SAMPLE_BRIEFS[one.sampleIdx])); oneButton("一键出全套", false); });
  $("#oneBrief").addEventListener("focus", finishTyping); $("#oneBrief").addEventListener("input", () => { if (!one.running && one.doneOnce) oneButton("一键出全套", false); });
  applyTheme(store.get("ace.theme") || ""); $("#themeBtn").addEventListener("click", () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
}

// ===================== 视觉特效：粒子星网（Hero 背景）、卡片光斑、数字卡 3D 倾斜 =====================
const fx = { on: false, raf: 0, pts: [], dpr: 1, mouse: { x: -1e4, y: -1e4 } };
function fxColor() { const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(); const m = v.match(/^#([0-9a-f]{6})$/i); if (!m) return [46, 98, 255]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function fxResize(force) { const c = $("#fxCanvas"); if (!c) return; const r = c.getBoundingClientRect(); if (!r.width || !r.height) return; const dpr = Math.min(2, window.devicePixelRatio || 1); const W = Math.floor(r.width * dpr), H = Math.floor(r.height * dpr); if (!force && c.width === W && c.height === H) return; c.width = W; c.height = H; fx.dpr = dpr;
  const n = Math.min(100, Math.max(36, Math.round(r.width * r.height / 11000))); fx.pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .28 * dpr, vy: (Math.random() - .5) * .28 * dpr, r: (Math.random() * 1.3 + .7) * dpr })); }
function fxStep() { const c = $("#fxCanvas"); if (!c || document.hidden || $("#tool-start").hidden) { fx.on = false; return; } fxResize(false); const ctx = c.getContext("2d"); const W = c.width, H = c.height, dpr = fx.dpr; ctx.clearRect(0, 0, W, H); const [r, g, b] = fxColor(); const link = 130 * dpr, rad = 130 * dpr; const pts = fx.pts;
  for (const p of pts) { p.x += p.vx; p.y += p.vy; const dx = p.x - fx.mouse.x, dy = p.y - fx.mouse.y; const d2 = dx * dx + dy * dy; if (d2 < rad * rad) { const d = Math.sqrt(d2) || 1; const f = (1 - d / rad) * .9; p.x += dx / d * f; p.y += dy / d * f; } if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10; }
  ctx.lineWidth = dpr; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y; const d2 = dx * dx + dy * dy; if (d2 > link * link) continue; ctx.strokeStyle = `rgba(${r},${g},${b},${((1 - Math.sqrt(d2) / link) * .38).toFixed(3)})`; ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); }
  ctx.fillStyle = `rgba(${r},${g},${b},.8)`; for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  fx.raf = requestAnimationFrame(fxStep); }
function fxStart() { if (NO_MOTION || fx.on || !$("#fxCanvas") || $("#tool-start").hidden) return; fx.on = true; fxResize(false); fx.raf = requestAnimationFrame(fxStep); }
function initFx() {
  const wrap = $(".hero-wrap"); if (wrap) { wrap.addEventListener("pointermove", (e) => { const c = $("#fxCanvas"); const r = c.getBoundingClientRect(); fx.mouse.x = (e.clientX - r.left) * fx.dpr; fx.mouse.y = (e.clientY - r.top) * fx.dpr; }, { passive: true }); wrap.addEventListener("pointerleave", () => { fx.mouse.x = fx.mouse.y = -1e4; }); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) fxStart(); }); fxStart();
  // 光斑跟随（.card / .stat）与数字卡 3D 倾斜
  document.addEventListener("pointermove", (e) => { const t = e.target && e.target.closest ? e.target.closest(".stat, .card") : null; if (!t) return; const r = t.getBoundingClientRect(); if (!r.width) return; const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; t.style.setProperty("--mx", (x * 100).toFixed(1) + "%"); t.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    if (!NO_MOTION && t.classList.contains("stat")) t.style.transform = `perspective(700px) rotateX(${((.5 - y) * 7).toFixed(2)}deg) rotateY(${((x - .5) * 7).toFixed(2)}deg) translateY(-2px)`; }, { passive: true });
  document.addEventListener("pointerout", (e) => { const t = e.target && e.target.closest ? e.target.closest(".stat") : null; if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) t.style.transform = ""; }, { passive: true });
}
</script>