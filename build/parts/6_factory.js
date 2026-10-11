<script>
// ===================== 内容工厂（批量生成 + 审校交付） =====================
const fc = { type: FACTORY_TYPES[0], platforms: new Set(["小红书"]), personas: new Set(), count: 20, batch: null, filter: "all", running: false, ctl: null, editing: null };
let renderFcPersona;
function fcTypeDef(id) { return FACTORY_TYPES.find((t) => t.id === id) || FACTORY_TYPES[0]; }
function setFcType(id, keepPersona) { fc.type = fcTypeDef(id); $$("#fcType button").forEach((b) => b.classList.toggle("on", b.dataset.v === fc.type.id)); if (!keepPersona) { fc.personas.clear(); fc.type.personas.slice(0, 6).forEach((p) => fc.personas.add(p)); } renderFcPersona = chipGroup($("#fcPersona"), fc.type.personas, fc.personas); }
const TYPE_RULES = {
  koc: "小红书 / 抖音风格的个人分享笔记：标题有钩子，开头一句就进入场景，中段自然带出产品信息，结尾有行动或感受；语气真实、有细节（时间、地点、动作）",
  reply: "评论区回复：针对该视角对应的评论场景写回复，口语、友好、有梗但不油；回应质疑给事实不给承诺；每条独立成句。title 字段写该回复所针对的评论原话（≤15字）",
  group: "社群推送 / 互动话术：有称呼、有一个具体理由（时间 / 场景 / 福利）、有一个明确的动作引导；可用 1-2 个 emoji；title 字段写话术用途",
  feed: "信息流广告：title 为标题（≤18字，含钩子），body 为描述（≤30字，含利益点与行动引导），两者不重复信息",
  live: "直播口播片段：主播第一人称，有节奏感与互动感（提问、让观众扣 1），自然讲出产品信息；title 字段写该片段的用途"
};
function factoryPrompt(p) { return `你是一家头部营销传播集团的内容创意负责人。请为下方品牌批量生产 ${p.count} 条「${p.type.label}」，供 ${p.platforms.join("、")} 平台的合作达人或品牌官方账号使用。
【品牌背景】${p.context}
【必须包含的信息】${p.must || "无特别要求"}
【禁忌】${p.avoid || "无"}
【视角 / 场景】轮流使用以下视角，每条明确属于其中一个，尽量平均分配：${p.personas.join("、")}
【写作要求】
- ${TYPE_RULES[p.type.id]}
- 每条的切入场景、句式、情绪都要不同，不能只是换词；像真人分享而不是广告口播，可用口语、停顿、具体细节
- 不出现「最」「第一」「国家级」等绝对化用语，不承诺功效，不编造数据与奖项，不贬低竞品，不冒充无合作关系的普通用户
- body 不超过 ${p.type.len} 字，换行用 \\n；全部简体中文，中文引号用「」
【输出格式】每行一个 JSON 对象，共 ${p.count} 行；不要数组、不要编号、不要 markdown 代码块、不要任何其他文字：
{"persona":"所用视角","title":"标题≤20字","body":"正文","tags":["标签1","标签2","标签3"]}`; }
function safeLine(line) { let s = line.trim(); if (!s || s.startsWith("```")) return null; s = s.replace(/^[\d]+[.、)]\s*/, "").replace(/,\s*$/, ""); const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a < 0 || b < a) return null; try { const o = JSON.parse(s.slice(a, b + 1)); return o && typeof o === "object" && (o.body || o.title) ? o : null; } catch (e) { return null; } }
function mkItem(o) { const it = { id: uid("n"), persona: str(obj(o).persona), title: str(obj(o).title), body: str(obj(o).body), tags: arr(obj(o).tags).map(str), status: "待审校", edited: false }; it.flags = checkFlags(it.title + "\n" + it.body); return it; }
function itemText(it) { return [str(it.title), str(it.body), arr(it.tags).map((t) => "#" + str(t)).join(" ")].filter(Boolean).join("\n"); }
async function persistBatch() { if (!fc.batch) return; const i = DB.batches.findIndex((b) => b.id === fc.batch.id); if (i >= 0) DB.batches[i] = fc.batch; else DB.batches.unshift(fc.batch); DB.batches = DB.batches.slice(0, 40); if (repo.mode === "local" || repo.canWrite) { await save("batches"); fc.batch.unsaved = false; } else fc.batch.unsaved = true; renderFcToolbar(); }
function noteCard(it, i) {
  const editing = fc.editing === it.id; const card = h("div", { class: "note" + (it.status === "已审校" ? " reviewed" : "") });
  const head = h("div", { class: "nh" }, h("span", { class: "idx" }, String(i + 1).padStart(2, "0")), h("span", { class: "who" }, str(it.persona, "视角")), h("span", { class: "pill " + (it.status === "已审校" ? "ok" : "warn") }, it.status), it.edited ? h("span", { class: "mini" }, "已改稿") : null, h("button", { type: "button", class: "btn ghost sm", onclick: () => copyText(itemText(it), "已复制第 " + (i + 1) + " 条") }, "复制"));
  card.append(head);
  if (editing) {
    const ti = h("input", { class: "ttl", type: "text", value: it.title }); const ta = h("textarea", null, it.body);
    card.append(ti, ta, h("div", { class: "nf" }, h("button", { type: "button", class: "btn sm primary", onclick: async () => { it.title = ti.value.trim(); it.body = ta.value.trim(); it.edited = true; it.status = "待审校"; it.flags = checkFlags(it.title + "\n" + it.body); fc.editing = null; await persistBatch(); renderFactory(); toast("已保存，状态回到待审校"); } }, "保存"), h("button", { type: "button", class: "btn sm ghost", onclick: () => { fc.editing = null; renderFactory(); } }, "取消")));
    return card;
  }
  if (it.title) card.append(h("h4", null, it.title)); card.append(h("div", { class: "body" }, it.body));
  if (arr(it.tags).length) card.append(h("div", { class: "tags" }, it.tags.map((t) => h("span", null, "#" + t))));
  if (arr(it.flags).length) card.append(h("div", { class: "flags" }, h("span", { class: "mini" }, "提示："), it.flags.map((f) => h("span", { class: "flag " + (f.level === "bad" ? "bad" : "") }, f.word + (f.level === "bad" ? " · 广告法禁用" : " · 需有依据")))));
  const canEdit = repo.mode === "local" || repo.canWrite;
  card.append(h("div", { class: "nf" }, h("span", { class: "mini", style: "margin-right:auto" }, ""),
    canEdit && h("button", { type: "button", class: "btn sm ghost", onclick: () => { fc.editing = it.id; renderFactory(); } }, "改稿"),
    canEdit && h("button", { type: "button", class: "btn sm " + (it.status === "已审校" ? "ghost" : ""), onclick: async () => { it.status = it.status === "已审校" ? "待审校" : "已审校"; await persistBatch(); renderFactory(); } }, it.status === "已审校" ? "退回待审校" : "标为已审校"),
    canEdit && h("button", { type: "button", class: "btn sm ghost", onclick: async () => { fc.batch.items = fc.batch.items.filter((x) => x.id !== it.id); await persistBatch(); renderFactory(); } }, "删除")));
  return card;
}
function renderFcToolbar() { const b = fc.batch; const items = b ? b.items : []; const reviewed = items.filter((x) => x.status === "已审校").length;
  $("#fcCnt").textContent = items.length ? `${items.length} 条 · 已审校 ${reviewed}` : ""; const p = $("#fcPill"); const src = b && b.source === "示例" ? "示例" : b && b.unsaved ? "未保存" : b ? "已保存" : ""; p.textContent = src; p.className = "pill " + (src === "示例" ? "accent" : src === "未保存" ? "warn" : "ok"); p.hidden = !src;
  $("#fcSave").hidden = !(b && b.unsaved && repo.canWrite);
  const sel = $("#fcBatchSel"); sel.replaceChildren(...(b && b.unsaved ? [h("option", { value: b.id }, "当前批次（未保存）")] : []), ...DB.batches.map((x) => h("option", { value: x.id, selected: b && x.id === b.id }, `${str(x.createdAt).slice(5, 16).replace("T", " ")} · ${x.typeLabel || x.type} · ${x.platform} · ${x.items.length} 条`))); }
function renderFactory() { const wrap = $("#fcNotes"); const items = fc.batch ? fc.batch.items : []; const list = items.filter((x) => fc.filter === "all" || (fc.filter === "reviewed") === (x.status === "已审校"));
  wrap.replaceChildren(...(list.length ? list.map((it) => noteCard(it, items.indexOf(it))) : [emptyNode(items.length ? "此状态下没有稿件" : "还没有稿件", items.length ? "" : "填写左侧信息后点击「开始批量生成」")])); renderFcToolbar(); }
function batchCsv(b) { return toCsv(b.items.map((it, i) => ({ idx: i + 1, persona: it.persona, title: it.title, body: it.body, tags: arr(it.tags).join(" "), status: it.status, flags: arr(it.flags).map((f) => f.word).join(" "), platform: b.platform, type: b.typeLabel })), ["idx", "platform", "type", "persona", "title", "body", "tags", "status", "flags"], { idx: "序号", platform: "平台", type: "类型", persona: "视角", title: "标题", body: "正文", tags: "标签", status: "审校状态", flags: "敏感词提示" }); }
async function runFactory() {
  if (!ai.ready()) { refreshAvailability(); return; }
  const p = { type: fc.type, platforms: [...fc.platforms], personas: [...fc.personas], count: fc.count, context: $("#fcBrand").value.trim(), must: $("#fcMust").value.trim(), avoid: $("#fcAvoid").value.trim() };
  if (!p.platforms.length) { $("#fcHint").className = "hint err"; $("#fcHint").textContent = "请选择至少一个平台。"; return; } if (!p.personas.length) { $("#fcHint").className = "hint err"; $("#fcHint").textContent = "请选择至少一个视角。"; return; }
  const ctl = new AbortController(); fc.ctl = ctl; fc.running = true; fc.editing = null; fc.filter = "all"; segSet($("#fcFilter"), "all"); const t0 = Date.now();
  fc.batch = { id: uid("batch"), createdAt: new Date().toISOString(), type: p.type.id, typeLabel: p.type.label, platform: p.platforms.join(" / "), context: p.context, source: "生成", unsaved: true, items: [] };
  $("#fcRun").disabled = true; $("#fcStop").hidden = false; $("#fcHint").className = "hint"; $("#fcHint").textContent = "稿件会一条条出现，可随时停止。";
  const wrap = $("#fcNotes"); const g = genNode(`Content Agent 正在写 ${p.count} 条「${p.type.label}」…`); wrap.replaceChildren(g); renderFcToolbar(); const pill = $("#fcPill"); pill.hidden = false; pill.className = "pill accent live"; pill.textContent = "生成中";
  let pending = "";
  const push = (line) => { const o = safeLine(line); if (!o) return; const it = mkItem(o); fc.batch.items.push(it); wrap.insertBefore(noteCard(it, fc.batch.items.length - 1), g); $("#fcCnt").textContent = `已生成 ${fc.batch.items.length} / ${p.count} 条`; };
  try { const { text } = await ai.text(factoryPrompt(p), { tier: $("#fcFast").checked ? "quick" : "default", signal: ctl.signal, cache: false, onText: ({ delta, text }) => { feed(g, text); const lines = (pending + delta).split("\n"); pending = lines.pop(); lines.forEach(push); } });
    if (pending.trim()) push(pending); if (!fc.batch.items.length && text) text.split("\n").forEach(push); g.remove(); await persistBatch(); renderFactory(); $("#fcHint").textContent = `完成 ${fc.batch.items.length} 条，用时 ${Math.round((Date.now() - t0) / 1000)} 秒。逐条审校后再交付。`; }
  catch (e) { if (pending.trim()) push(pending); g.remove(); if (fc.batch.items.length) await persistBatch(); renderFactory(); if (e && e.code !== "cancelled") { $("#fcHint").className = "hint err"; $("#fcHint").textContent = errCopy(e); } else $("#fcHint").textContent = `已停止，保留 ${fc.batch.items.length} 条。`; fatalCode(e); }
  fc.running = false; fc.ctl = null; $("#fcRun").disabled = !ai.ready(); $("#fcStop").hidden = true;
}
function initFactory() {
  $("#fcType").replaceChildren(...FACTORY_TYPES.map((t) => h("button", { type: "button", "data-v": t.id, title: t.desc, onclick: () => setFcType(t.id) }, t.label)));
  chipGroup($("#fcPlatform"), ["小红书", "抖音", "微信", "微博", "B站", "快手", "视频号"], fc.platforms);
  setFcType("koc"); fc.personas.clear(); EXAMPLE_FACTORY.items.slice(0, 6).forEach((it) => fc.personas.add(it.persona)); renderFcPersona();
  $("#fcBrand").value = projectContext() || EXAMPLE_FACTORY.context; $("#fcMust").value = obj(DB.project).keyMessages || "0 糖 0 卡、5% 真实柚子汁、便利店 6 元、清醒地微醺";
  $$("#fcCount button").forEach((b) => b.addEventListener("click", () => { fc.count = Number(b.dataset.v); $$("#fcCount button").forEach((x) => x.classList.toggle("on", x === b)); }));
  segInit($("#fcFilter"), (v) => { fc.filter = v; renderFactory(); });
  TOOL_RENDER.factory = () => { if (!fc.running && (!fc.batch || !fc.batch.unsaved)) { fc.batch = DB.batches[0] ? JSON.parse(JSON.stringify(DB.batches[0])) : null; } renderFactory(); };
  $("#fcBatchSel").addEventListener("change", (e) => { const b = DB.batches.find((x) => x.id === e.target.value); if (b) { fc.batch = JSON.parse(JSON.stringify(b)); fc.editing = null; renderFactory(); } });
  $("#syncFactory").addEventListener("click", () => { $("#fcBrand").value = projectContext() || $("#fcBrand").value; toast("已同步当前项目"); });
  $("#factoryForm").addEventListener("submit", (ev) => { ev.preventDefault(); runFactory(); });
  $("#fcStop").addEventListener("click", () => { if (fc.ctl) fc.ctl.abort(); });
  $("#fcSave").addEventListener("click", async () => { if (!requireWrite()) return; await persistBatch(); toast("批次已保存"); });
  $("#fcReviewAll").addEventListener("click", async () => { if (!fc.batch || !fc.batch.items.length) return toast("还没有稿件"); if (!(repo.mode === "local" || requireWrite())) return; const withFlags = fc.batch.items.filter((x) => x.flags && x.flags.some((f) => f.level === "bad")).length; fc.batch.items.forEach((x) => { if (!(x.flags || []).some((f) => f.level === "bad")) x.status = "已审校"; }); await persistBatch(); renderFactory(); toast(withFlags ? `已标记，${withFlags} 条含广告法禁用词保留待审校` : "已全部标为已审校"); });
  $("#fcCopyAll").addEventListener("click", () => { const items = (fc.batch ? fc.batch.items : []).filter((x) => x.status === "已审校"); if (!items.length) return toast("还没有已审校的稿件"); copyText(items.map((it, i) => `${i + 1}. 【${it.persona}】${it.title}\n${it.body}\n${arr(it.tags).map((t) => "#" + t).join(" ")}`).join("\n\n"), `已复制 ${items.length} 条已审校稿件`); });
  $("#fcCsv").addEventListener("click", () => { if (!fc.batch || !fc.batch.items.length) return toast("还没有稿件"); downloadFile(`${fc.batch.typeLabel}-${fc.batch.items.length}条.csv`, batchCsv(fc.batch)); });
}
</script>
