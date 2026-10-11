<script>
// ===================== 达人匹配：达人库 / 组合试算 / AI 评估 / 合作跟进 / 选型策略 =====================
const KOL_STATUS = ["待评估", "待沟通", "待寄样", "已寄样", "已收样", "待内容", "已交付", "暂不合作"];
const kl = { platforms: new Set(), sort: "fit", dir: -1 };
const ks = { platforms: new Set(["小红书", "抖音"]) };
function kolDerived(k) { const views = num(k.avgViews), eng = num(k.avgEngagements), q = num(k.quote); const er = num(k.engagementRate) != null ? num(k.engagementRate) : (views && eng != null ? r2(eng / views * 100) : null);
  return { er, cpm: q && views ? r2(q / views * 1000, 1) : null, cpe: q && eng ? r2(q / eng, 2) : null }; }
function kolFiltered() { const s = $("#klSearch").value.trim().toLowerCase(); const maxQ = num($("#klMaxQuote").value), minF = num($("#klMinFit").value) || 0;
  let list = DB.kols.filter((k) => (!kl.platforms.size || kl.platforms.has(k.platform)) && (!s || [k.name, k.category, k.city, k.audience, k.notes].join(" ").toLowerCase().includes(s)) && (maxQ == null || num(k.quote) == null || num(k.quote) <= maxQ) && ((num(k.fitScore) || 0) >= minF));
  const key = kl.sort; const val = (k) => { const d = kolDerived(k); if (key === "fit") return num(k.fitScore); if (key === "ai") return num(k.aiScore); if (key === "cpm") return d.cpm; if (key === "er") return d.er; if (key === "followers") return num(k.followers); if (key === "quote") return num(k.quote); return null; };
  const asc = key === "cpm" || key === "quote"; list.sort((a, b) => { const va = val(a), vb = val(b); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return asc ? va - vb : vb - va; }); return list; }
function renderKolSummary(list) { const sel = DB.kols.filter((k) => k.selected); const total = sel.reduce((a, k) => a + (num(k.quote) || 0), 0); const unknown = sel.filter((k) => num(k.quote) == null).length; const budget = num($("#klBudget").value) || 0;
  $("#klSummary").replaceChildren(statTile("候选", String(list.length), `达人库共 ${DB.kols.length} 位`), statTile("已选", String(sel.length), unknown ? `${unknown} 位待询价` : "按当前筛选或手动勾选"), statTile("已选报价合计", fmtMoney(total), "不含税费、寄样与加热"), statTile("预算余额", fmtMoney(budget - total), budget - total < 0 ? "超预算" : `本轮预算 ${fmtMoney(budget)}`, budget - total < 0 ? "down" : "flat")); }
function renderKolTable() {
  const list = kolFiltered(); renderKolSummary(list); $("#klCount").textContent = `${list.length} 位 · ${kl.sort === "cpm" || kl.sort === "quote" ? "升序" : "降序"}`;
  const canEdit = repo.mode === "local" || repo.canWrite; const t = $("#klTable"); t.replaceChildren();
  const cols = [["", ""], ["达人", ""], ["粉丝", "followers"], ["互动率", "er"], ["报价", "quote"], ["CPM / CPE", "cpm"], ["匹配分", "fit"], ["AI 评估", "ai"], ["状态", ""], ["跟进日", ""], ["", ""]];
  t.append(h("thead", null, h("tr", null, cols.map(([c, k]) => h("th", { class: ["followers", "quote", "cpm", "er", "fit", "ai"].includes(k) ? "r" : "" }, k ? h("button", { type: "button", class: "sortbtn" + (kl.sort === k ? " on" : ""), onclick: () => { kl.sort = k; $("#klSort").value = k; renderKolTable(); } }, c + (kl.sort === k ? " ↓" : "")) : c)))));
  const tb = h("tbody"); if (!list.length) tb.append(h("tr", null, h("td", { colspan: 11 }, emptyNode("没有符合条件的达人", "调整筛选，或在「数据接入」导入名单"))));
  for (const k of list) { const d = kolDerived(k);
    const cb = h("input", { type: "checkbox", class: "checkbox", checked: !!k.selected, onchange: async (e) => { k.selected = e.target.checked; if (canEdit) await save("kols"); renderKolTable(); } });
    const stSel = h("select", { disabled: !canEdit, onchange: async (e) => { k.status = e.target.value; await save("kols"); } }, KOL_STATUS.map((s) => h("option", { selected: (k.status || "待评估") === s }, s)));
    const dt = h("input", { type: "date", value: k.nextFollowUp || "", disabled: !canEdit, onchange: async (e) => { k.nextFollowUp = e.target.value; await save("kols"); } });
    const aiCell = num(k.aiScore) != null ? h("div", null, h("span", { class: "score" }, String(k.aiScore), h("i", null, h("b", { style: "width:" + Math.max(0, Math.min(100, num(k.aiScore))) + "%" }))), " ", h("span", { class: "verdict " + (/推荐/.test(k.aiVerdict || "") ? "go" : /备选/.test(k.aiVerdict || "") ? "maybe" : "no") }, str(k.aiVerdict, "-")), (k.aiPros || k.aiRisks) && h("span", { class: "sub" }, "优势：", str(k.aiPros), " 风险：", str(k.aiRisks))) : h("span", { class: "mini" }, "未评估");
    tb.append(h("tr", { class: k.selected ? "sel" : "" }, h("td", null, cb), h("td", { class: "wrap" }, h("b", null, str(k.name)), h("span", { class: "sub" }, [k.platform, k.category, k.city].filter(Boolean).join(" · ")), k.audience && h("span", { class: "sub" }, str(k.audience))),
      h("td", { class: "num r" }, fmtN(num(k.followers))), h("td", { class: "num r" }, d.er == null ? "-" : d.er + "%"), h("td", { class: "num r" }, num(k.quote) == null ? h("span", { class: "mini" }, "待询价") : fmtMoney(num(k.quote))), h("td", { class: "num r" }, d.cpm == null ? "-" : d.cpm + " / " + (d.cpe == null ? "-" : d.cpe)), h("td", { class: "num r" }, num(k.fitScore) == null ? "-" : String(k.fitScore)), h("td", { class: "wrap" }, aiCell), h("td", null, stSel), h("td", null, dt),
      h("td", null, canEdit && h("button", { type: "button", class: "btn ghost sm", title: "移出达人库", onclick: async () => { DB.kols = DB.kols.filter((x) => x !== k); await save("kols"); renderKolTable(); } }, "×")))); }
  t.append(tb);
}
function kolEvalPrompt(rows) { return `你是达人投放的数据评估专家。请根据项目背景对候选达人逐个评估打分并排序。
【项目背景】${projectContext() || "（未填写，按通用消费品牌判断）"}
【候选名单】${JSON.stringify(rows.map((k) => { const d = kolDerived(k); return { name: k.name, platform: k.platform, category: k.category, city: k.city, followers: k.followers, avgViews: k.avgViews, avgEngagements: k.avgEngagements, engagementRate: d.er, quote: k.quote, cpm: d.cpm, fitScore: k.fitScore, audience: k.audience, notes: k.notes }; }))}
评估维度：人群匹配度、互动质量（互动率是否健康、是否疑似水分）、内容调性契合、性价比（已给出按历史均值计算的 CPM）、合规与翻车风险。
只返回一个 JSON 数组，按 score 从高到低排序，每位候选一项，name 必须与输入完全一致，不要其他文字、不要 markdown 代码块：
[{"name":"达人名","score":86,"pros":"优势≤35字","risks":"风险≤35字","verdict":"推荐合作|备选|不建议"}]
score 为 0-100 整数；信息不足时降低分数并在 risks 中说明；全部简体中文。`; }
function kolBriefPrompt(sel) { const pj = obj(DB.project); const bi = obj(obj(obj(DB.plan).results).strategy).big_idea; return `你是达人营销项目经理，请为下列已选达人写一份可直接发给达人或 MCN 的「合作 Brief」。
【项目背景】${projectContext() || "（未填写）"}
【传播主张】${pj.slogan ? pj.slogan + (bi.slogan === pj.slogan && bi.rationale ? "：" + str(bi.rationale) : "") : bi.slogan ? bi.slogan + "：" + str(bi.rationale) : "无，按产品卖点提炼"}
【必须出现的核心信息】${pj.keyMessages || "按产品卖点"}${pj.clientPlan ? "\n【客户确认的方案要点，以此为准】" + String(pj.clientPlan).slice(0, 800) : ""}
【已选达人】${JSON.stringify(sel.map((k) => ({ name: k.name, platform: k.platform, category: k.category, followers: k.followers, quote: k.quote, audience: k.audience, status: k.status })))}
要求：简体中文，Markdown，用二级标题分节：合作目标、核心信息（必须出现，列清单）、内容方向（每位达人 1-2 句，结合其内容类型与粉丝画像）、交付物与时间（脚本 / 成片 / 发布的节点与修改轮次）、合规要求（合作标识、AIGC 标识、广告法禁用语、不出现的画面）、报价与结算口径（含税、寄样、授权、加热是否包含）、待确认事项。总字数 500-800 字，具体、可执行，不写空话。只输出 Brief 正文。`; }
function rKolStrategy(d) { d = obj(d);
  return h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", null, "达人选型策略"), h("span", { class: "sub" }, "金字塔结构 · 赛道 · 筛选标准 · 合作 Brief 要点")), h("div", { class: "card-body" },
    blk("达人金字塔", h("div", { class: "pyr" }, arr(d.pyramid).map((l) => { l = obj(l); return h("div", { class: "lvl" }, h("div", { class: "t" }, str(l.tier), h("small", null, str(l.count))), h("div", { class: "d" }, str(l.role), " ", h("span", null, "· ", str(l.price_range), " · ", str(l.type))), h("div", { class: "p" }, (Number(l.budget_pct) || 0) + "%")); }))),
    blk("推荐赛道", h("div", { class: "g2" }, arr(d.tracks).map((t) => { t = obj(t); return tile(str(t.track), str(t.platform), h("p", null, str(t.why))); }))),
    blk("筛选评分卡", table(["维度", "权重", "及格线"], arr(d.criteria).map((c) => { c = obj(c); return h("tr", null, h("td", null, h("b", null, str(c.name))), h("td", { class: "num" }, (Number(c.weight) || 0) + "%"), h("td", null, str(c.bar))); }))),
    h("div", { class: "g2" }, tile("合作 Brief 要点", null, ul(d.brief_points)), h("div", { class: "tile risk" }, h("h4", null, "避坑"), ul(d.pitfalls))))); }
function kolStrategyPrompt(p) { return `你是一家头部营销传播集团的达人营销（KOL）策划专家，熟悉小红书蒲公英、抖音星图等平台的达人生态、报价区间与数据判断方法。
【品牌背景】${p.context}
【投放平台】${p.platforms.join("、")}
【达人预算】${p.budget}
【达人目标】${p.goal}
任务：产出达人选型策略。要求具体、可执行；报价与数量给区间不给单值；不写任何真实达人姓名，只写类型；全部简体中文，中文引号用「」。只返回一个 JSON 对象，不要其他文字、不要 markdown 代码块：
{"pyramid":[{"tier":"头部达人","count":"位数区间","budget_pct":25,"role":"作用≤25字","price_range":"单条报价区间","type":"适合的达人类型≤25字"},{"tier":"腰部达人","count":"","budget_pct":45,"role":"","price_range":"","type":""},{"tier":"尾部 / KOC","count":"","budget_pct":30,"role":"","price_range":"","type":""}],"tracks":[{"track":"赛道≤10字","why":"为什么≤35字","platform":"平台"}],"criteria":[{"name":"筛选维度","weight":30,"bar":"及格线≤30字"}],"brief_points":["合作 brief 要点≤40字"],"pitfalls":["避坑≤35字"]}
budget_pct 合计 100；tracks 4 条；criteria 5 条且 weight 合计 100；brief_points 6 条；pitfalls 3 条。`; }
function initKol() {
  chipGroup($("#klPlatform"), ["小红书", "抖音", "B站", "微博", "快手", "视频号"], kl.platforms, { onChange: renderKolTable });
  ["#klSearch", "#klMaxQuote", "#klMinFit", "#klBudget", "#klMax"].forEach((id) => $(id).addEventListener("input", renderKolTable));
  $("#klSort").addEventListener("change", (e) => { kl.sort = e.target.value; renderKolTable(); });
  TOOL_RENDER.kol = () => { renderKolTable(); if (!$("#ksBrand").value) $("#ksBrand").value = projectContext() || EXAMPLE_KOL_STRATEGY.context; if (!$("#ksOut").children.length) $("#ksOut").replaceChildren(h("div", { class: "notice" }, h("div", null, h("b", null, "示例"), " 基于「泡研社」预生成的选型策略，点击左侧按钮可针对当前项目重新生成。")), rKolStrategy(EXAMPLE_KOL_STRATEGY.result)); };
  $("#klClearSel").addEventListener("click", async () => { DB.kols.forEach((k) => { k.selected = false; }); if (repo.mode === "local" || repo.canWrite) await save("kols"); renderKolTable(); });
  $("#klImportGo").addEventListener("click", () => { segSet($("#imTarget"), "kols"); im.target = "kols"; showTool("import"); });
  $("#klExport").addEventListener("click", () => { const cols = ["name", "platform", "category", "city", "followers", "avgViews", "avgEngagements", "engagementRate", "quote", "cpm", "fitScore", "aiScore", "aiVerdict", "aiPros", "aiRisks", "status", "nextFollowUp", "selected", "audience", "notes"]; const rows = kolFiltered().map((k) => ({ ...k, cpm: kolDerived(k).cpm, selected: k.selected ? "是" : "" })); downloadFile("达人库.csv", toCsv(rows, cols, { ...FIELD_LABELS, cpm: "CPM", aiScore: "AI 评分", aiVerdict: "AI 建议", aiPros: "优势", aiRisks: "风险", status: "合作状态", nextFollowUp: "跟进日", selected: "已选" })); });
  $("#klAuto").addEventListener("click", async () => { const budget = num($("#klBudget").value) || 0, max = num($("#klMax").value) || 5; let total = 0, n = 0; DB.kols.forEach((k) => { k.selected = false; });
    for (const k of kolFiltered()) { const q = num(k.quote); if (q == null || /暂不合作/.test(k.status || "")) continue; if (n >= max) break; if (total + q > budget) continue; k.selected = true; total += q; n++; }
    if (repo.mode === "local" || repo.canWrite) await save("kols"); renderKolTable(); $("#klHint").className = "hint"; $("#klHint").textContent = `按「${$("#klSort").selectedOptions[0].textContent}」依次选入预算内的 ${n} 位，报价合计 ${fmtMoney(total)}。启发式建议，不保证最优；待询价者未计入。`; });
  $("#klOneClick").addEventListener("click", async () => { const btn = $("#klOneClick"); btn.disabled = true; btn.textContent = "推荐中…";
    try { if (ai.ready()) { const rows = kolFiltered().slice(0, 30); $("#klHint").className = "hint"; $("#klHint").textContent = `正在评估 ${rows.length} 位达人…`; const out = await ai.json(kolEvalPrompt(rows), { cache: false }); for (const r of arr(out)) { const kk = DB.kols.find((x) => x.name === str(obj(r).name)) || DB.kols.find((x) => str(obj(r).name).includes(x.name) || x.name.includes(str(obj(r).name))); if (!kk) continue; kk.aiScore = Math.max(0, Math.min(100, Math.round(num(obj(r).score) || 0))); kk.aiPros = str(obj(r).pros); kk.aiRisks = str(obj(r).risks); kk.aiVerdict = str(obj(r).verdict); } kl.sort = "ai"; $("#klSort").value = "ai"; }
      else { kl.sort = "fit"; $("#klSort").value = "fit"; }
      const budget = num($("#klBudget").value) || 0, max = num($("#klMax").value) || 5; let total = 0, n = 0; DB.kols.forEach((x) => { x.selected = false; });
      for (const x of kolFiltered()) { const q = num(x.quote); if (q == null || /暂不合作|不建议/.test((x.status || "") + (x.aiVerdict || ""))) continue; if (n >= max) break; if (total + q > budget) continue; x.selected = true; total += q; n++; }
      if (repo.mode === "local" || repo.canWrite) await save("kols"); renderKolTable(); $("#klHint").className = "hint"; $("#klHint").textContent = `已选 ${n} 位，报价合计 ${fmtMoney(total)}，${ai.ready() ? "按 AI 评分" : "按匹配分"}依次选入预算内、未被标为不建议的达人。勾选框可手动增减，然后生成合作 Brief。`; }
    catch (e) { $("#klHint").className = "hint err"; $("#klHint").textContent = errCopy(e); fatalCode(e); } btn.disabled = false; btn.textContent = "一键推荐组合"; });
  $("#klAiScore").addEventListener("click", async () => { if (!ai.ready()) { refreshAvailability(); return; } const rows = kolFiltered().slice(0, 30); if (!rows.length) return toast("没有可评估的达人");
    const btn = $("#klAiScore"); btn.disabled = true; $("#klHint").className = "hint"; $("#klHint").textContent = `正在评估 ${rows.length} 位达人，约 20-60 秒…`;
    try { const out = await ai.json(kolEvalPrompt(rows), { cache: false }); let n = 0; for (const r of arr(out)) { const k = DB.kols.find((x) => x.name === str(obj(r).name)) || DB.kols.find((x) => str(obj(r).name).includes(x.name) || x.name.includes(str(obj(r).name))); if (!k) continue; k.aiScore = Math.max(0, Math.min(100, Math.round(num(obj(r).score) || 0))); k.aiPros = str(obj(r).pros); k.aiRisks = str(obj(r).risks); k.aiVerdict = str(obj(r).verdict); n++; }
      if (repo.mode === "local" || repo.canWrite) await save("kols"); kl.sort = "ai"; $("#klSort").value = "ai"; renderKolTable(); $("#klHint").textContent = `已评估 ${n} 位，已按 AI 评分排序。评分是模型判断，不是效果预测。`; }
    catch (e) { $("#klHint").className = "hint err"; $("#klHint").textContent = errCopy(e); fatalCode(e); } btn.disabled = !ai.ready(); });
  $("#klBrief").addEventListener("click", async () => { if (!ai.ready()) { refreshAvailability(); return; } const sel = DB.kols.filter((k) => k.selected); if (!sel.length) return toast("先勾选要合作的达人");
    const out = $("#klBriefOut"); const g = genNode(`正在为 ${sel.length} 位达人写合作 Brief…`); out.replaceChildren(h("div", { class: "card" }, h("div", { class: "card-body" }, g))); $("#klBrief").disabled = true;
    try { const { text } = await ai.text(kolBriefPrompt(sel), { cache: false, onText: ({ text }) => feed(g, text) }); out.replaceChildren(h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", null, "合作 Brief"), h("span", { class: "sub" }, sel.map((k) => k.name).join("、")), h("div", { class: "right" }, h("button", { type: "button", class: "btn sm", onclick: () => copyText(text, "已复制合作 Brief") }, "复制"), h("button", { type: "button", class: "btn sm", onclick: () => downloadFile("合作Brief.md", text, "text/markdown;charset=utf-8") }, "下载 .md"))), h("div", { class: "card-body" }, renderMd(text)))); }
    catch (e) { out.replaceChildren(h("div", { class: "card" }, emptyNode(errCopy(e)))); fatalCode(e); } $("#klBrief").disabled = !ai.ready(); });
  // 选型策略
  chipGroup($("#ksPlatform"), ["小红书", "抖音", "B站", "微博", "快手", "视频号"], ks.platforms);
  segInit($("#kolMode"), (m) => { $("#kolLib").hidden = m !== "lib"; $("#kolStrategy").hidden = m !== "strategy"; });
  $("#syncKolS").addEventListener("click", () => { $("#ksBrand").value = projectContext() || $("#ksBrand").value; toast("已同步当前项目"); });
  $("#kolStrategyForm").addEventListener("submit", async (ev) => { ev.preventDefault(); if (!ai.ready()) { refreshAvailability(); return; } const p = { context: $("#ksBrand").value.trim(), platforms: [...ks.platforms], budget: $("#ksBudget").value, goal: $("#ksGoal").value }; if (!p.platforms.length) { $("#ksHint").className = "hint err"; $("#ksHint").textContent = "请选择至少一个平台。"; return; }
    const g = genNode("KOL Agent 正在设计选型策略…"); $("#ksOut").replaceChildren(h("div", { class: "card" }, h("div", { class: "card-body" }, g))); $("#ksRun").disabled = true; $("#ksHint").className = "hint"; $("#ksHint").textContent = "约 20-60 秒。";
    try { const d = await ai.json(kolStrategyPrompt(p), { onText: ({ text }) => feed(g, text) }); $("#ksOut").replaceChildren(rKolStrategy(d)); $("#ksHint").textContent = "已生成。切回「达人库」把名单接进来，按这套标准筛选。"; } catch (e) { $("#ksOut").replaceChildren(h("div", { class: "card" }, emptyNode(errCopy(e)))); fatalCode(e); } $("#ksRun").disabled = !ai.ready(); });
}
</script>
