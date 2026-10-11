<script>
// ===================== 评论洞察 =====================
const ins = { current: null };
function insightPrompt(context, lines) { return `你是消费者洞察分析师。请分析下列用户评论（共 ${lines.length} 条），输出结构化洞察。
【产品背景】${context || "（未填写）"}
【评论】每行一条：
${lines.join("\n")}
要求：themes 4-6 个，按占比从高到低；share 为该主题评论占比（整数百分比，主题可重叠，合计可超过 100）；每个主题引用 1-3 条原话（必须是评论原文，不改写、不编造）；sentiment 取 pos / neu / neg；action 给具体可执行的内容或运营动作≤40字；negatives 挑出需要立刻回应的负面（品控、健康、客服、误导、投诉），level 取 critical / warn，reason≤25字；keywords 8-10 个高频词；summary≤80字，先说最重要的发现。全部简体中文。只返回一个 JSON 对象，不要其他文字、不要 markdown 代码块：
{"summary":"","themes":[{"name":"主题≤12字","share":34,"sentiment":"pos","quotes":["原话"],"action":""}],"negatives":[{"text":"原文","level":"critical","reason":""}],"keywords":[""]}`; }
function insightMd(r, ctx) { r = obj(r); const L = [`# 评论洞察报告`, ctx ? `> ${ctx}` : "", "", `**核心发现**：${str(r.summary)}`, "", "## 主题"]; for (const t of arr(r.themes)) { t = obj(t); L.push(`### ${str(t.name)}（${str(t.share)}% · ${t.sentiment === "pos" ? "正面" : t.sentiment === "neg" ? "负面" : "中性"}）`, ...arr(t.quotes).map((q) => `> ${str(q)}`), `- 建议动作：${str(t.action)}`, ""); }
  L.push("## 需要立刻回应的负面", ...arr(r.negatives).map((n) => { n = obj(n); return `- ${n.level === "critical" ? "🔴" : "🟠"} ${str(n.text)}（${str(n.reason)}）`; }), "", `**高频词**：${arr(r.keywords).join("、")}`); return L.join("\n"); }
function renderInsight(rec, label) {
  const r = obj(rec && rec.result); const out = $("#inOut"); if (!r.themes) { out.replaceChildren(emptyNode("还没有分析结果", "粘贴评论后点击「分析评论」")); return; }
  const negs = arr(r.negatives);
  out.replaceChildren(
    label ? h("div", { class: "notice" }, h("div", null, h("b", null, label), " ", rec.context ? str(rec.context).slice(0, 60) : "")) : null,
    h("div", { class: "lead" }, h("small", null, "核心发现"), h("div", null, str(r.summary))),
    h("div", { class: "stats" }, statTile("评论数", String(rec.count || arr(r.themes).length), rec.createdAt ? new Date(rec.createdAt).toLocaleString("zh-CN", { hour12: false }) : ""), statTile("主题", String(arr(r.themes).length), "按占比排序"), statTile("需立刻回应", String(negs.length), negs.filter((n) => obj(n).level === "critical").length + " 条严重", negs.length ? "down" : "flat")),
    h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", null, "主题与原话"), h("div", { class: "right" }, h("button", { type: "button", class: "btn sm", onclick: () => copyText(insightMd(r, rec.context), "报告已复制") }, "复制报告"), h("button", { type: "button", class: "btn sm", onclick: () => downloadFile("评论洞察报告.md", insightMd(r, rec.context), "text/markdown;charset=utf-8") }, "下载 .md"))),
      h("div", { class: "card-body" }, h("div", { class: "g2" }, arr(r.themes).map((t) => { t = obj(t); const s = t.sentiment === "pos" ? "pos" : t.sentiment === "neg" ? "neg" : "neu"; return h("div", { class: "theme" + (s === "neg" ? " neg" : "") }, h("div", { class: "th" }, h("h4", null, str(t.name)), h("span", { class: "sent " + s }, s === "pos" ? "正面" : s === "neg" ? "负面" : "中性"), h("span", { class: "share" }, str(t.share) + "%")), h("div", { class: "bar" }, h("i", { style: "width:" + Math.min(100, Number(t.share) || 0) + "%" })), ...arr(t.quotes).map((q) => h("div", { class: "q" }, "“", str(q), "”")), h("div", { class: "mini" }, h("b", { style: "color:var(--fg-2)" }, "建议："), str(t.action))); })))),
    h("div", { class: "row-cards" }, h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", null, "需要立刻回应"), h("span", { class: "sub" }, "品控 · 健康 · 客服 · 误导")), h("div", { class: "card-body tight" }, ...(negs.length ? negs.map((n) => { n = obj(n); return h("div", { class: "alert " + (n.level === "critical" ? "critical" : "warn") }, h("i"), h("div", null, h("div", { class: "t" }, str(n.text)), h("div", { class: "s" }, str(n.reason))), h("span", { class: "lvl " + (n.level === "critical" ? "critical" : "warn") }, n.level === "critical" ? "严重" : "提醒")); }) : [h("p", { class: "mini" }, "没有需要立刻回应的负面")]))),
      h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", null, "高频词")), h("div", { class: "card-body" }, h("div", { class: "kws" }, arr(r.keywords).map((k) => h("span", { class: "kw" }, str(k))))))));
}
function initInsights() {
  $("#inSample").addEventListener("click", () => { $("#inText").value = SAMPLE_COMMENTS; toast("已填入 30 条示例评论"); });
  $("#syncInsight").addEventListener("click", () => { $("#inContext").value = projectContext() || $("#inContext").value; toast("已同步当前项目"); });
  TOOL_RENDER.insights = () => { if (!$("#inContext").value) $("#inContext").value = projectContext() || SEED_INSIGHTS.context; if (!$("#inText").value) $("#inText").value = SAMPLE_COMMENTS; const rec = ins.current || DB.insights[0]; renderInsight(rec, rec && rec.source === "示例" ? "示例" : rec && !ins.current ? "上次分析" : null); };
  $("#insightForm").addEventListener("submit", async (ev) => { ev.preventDefault(); if (!ai.ready()) { refreshAvailability(); return; } const lines = $("#inText").value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 300); if (lines.length < 3) { $("#inHint").className = "hint err"; $("#inHint").textContent = "至少贴 3 条评论。"; return; }
    const g = genNode(`Insight Agent 正在分析 ${lines.length} 条评论…`); $("#inOut").replaceChildren(h("div", { class: "card" }, h("div", { class: "card-body" }, g))); $("#inRun").disabled = true; $("#inHint").className = "hint"; $("#inHint").textContent = "约 20-60 秒。";
    try { const r = await ai.json(insightPrompt($("#inContext").value.trim(), lines), { cache: false, onText: ({ text }) => feed(g, text) }); const rec = { id: uid("ins"), createdAt: new Date().toISOString(), context: $("#inContext").value.trim(), count: lines.length, result: r, source: "生成" }; ins.current = rec; DB.insights.unshift(rec); DB.insights = DB.insights.slice(0, 20); if (repo.mode === "local" || repo.canWrite) await save("insights"); renderInsight(rec, null); $("#inHint").textContent = `已分析 ${lines.length} 条评论。`; }
    catch (e) { $("#inOut").replaceChildren(h("div", { class: "card" }, emptyNode(errCopy(e)))); $("#inHint").className = "hint err"; $("#inHint").textContent = errCopy(e); fatalCode(e); } $("#inRun").disabled = !ai.ready(); });
}
</script>
