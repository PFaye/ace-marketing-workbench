<script>
// ===================== 数据接入：表格导入 + 连接器 =====================
const im = { target: "kols", headers: [], rows: [], mapping: {}, source: "", editing: null };
const SAMPLE_TABLES = {
  pgy: "博主昵称\t粉丝数\t内容类型\t所在地\t阅读中位数\t互动中位数\t图文报价(元)\t视频报价(元)\t粉丝画像\n@小满的下班日记\t28.0万\t职场生活\t上海\t3.6万\t2230\t18000\t26000\t22-30岁女性为主，一二线城市\n@气泡水测评员Lulu\t9.0万\t美食饮品\t上海\t1.4万\t1190\t6000\t9000\t18-26岁学生与职场新人\n@可可的宿舍日常\t5.0万\t校园生活\t武汉\t9000\t990\t3000\t4500\t大学生，女性70%\n@轻食日记Yoyo\t7.5万\t健康饮食\t杭州\t2.1万\t1500\t5000\t8000\t25-35岁女性，控糖健身",
  xingtu: "达人昵称\t平台\t粉丝数量\t播放中位数\t互动率\t20-60s视频报价\t垂类\t城市\n@下班去哪儿\t抖音\t60.0w\t18.0w\t2.9%\t38000\t本地生活\t深圳\n@阿杰去露营\t抖音\t85.0w\t26.0w\t3.1%\t60000\t户外露营\t成都\n@健身教练大明\t抖音\t150.0w\t38.0w\t1.6%\t90000\t运动健身\t北京\n@周末厨房小记\t抖音\t32.0w\t9.5w\t4.2%\t22000\t美食\t杭州",
  metrics: () => { const d1 = addDaysStr(todayStr(), -1), d0 = todayStr(); return `日期\t渠道\t计划名称\t消耗(元)\t展示数\t点击数\t转化数\t互动数\t负评\n${d1}\t抖音\t达人短剧 + 挑战赛\t12,800\t58.2万\t12,100\t365\t26,000\t4\n${d1}\t小红书\tKOC 铺量 + 搜索\t8,400\t30.1万\t7,900\t205\t16,500\t2\n${d1}\t程序化广告\t信息流 oCPM\t9,600\t53.0万\t9,100\t310\t4,200\t1\n${d0}\t抖音\t达人短剧 + 挑战赛\t13,100\t60.0万\t12,400\t370\t27,100\t24\n${d0}\t小红书\tKOC 铺量 + 搜索\t8,900\t31.5万\t8,300\t210\t17,200\t3\n${d0}\t程序化广告\t信息流 oCPM\t9,300\t52.0万\t4,700\t150\t4,000\t2`; }
};
let sheetJsPromise = null;
function loadSheetJs() { if (window.XLSX) return Promise.resolve(); if (sheetJsPromise) return sheetJsPromise; sheetJsPromise = new Promise((res, rej) => { const s = h("script", { src: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" }); s.onload = () => res(); s.onerror = () => { sheetJsPromise = null; rej(new Error("Excel 解析库加载失败，请把表格另存为 CSV 再导入")); }; document.head.append(s); }); return sheetJsPromise; }
async function readFile(file) {
  if (/\.xlsx?$/i.test(file.name)) { await loadSheetJs(); const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: "array" }); const ws = wb.Sheets[wb.SheetNames[0]]; const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }); const hi = grid.findIndex((r) => r.filter((x) => String(x).trim()).length >= 2); const headers = (grid[hi] || []).map((x) => String(x).trim()); return { headers, rows: grid.slice(hi + 1).filter((r) => r.some((x) => String(x).trim() !== "")).map((r) => Object.fromEntries(headers.map((hd, i) => [hd, r[i] == null ? "" : r[i]]))) }; }
  const text = await file.text(); return parseTable(text);
}
function setParsed(parsed, source) { im.headers = parsed.headers; im.rows = parsed.rows; im.source = source; im.mapping = inferMapping(im.headers, im.target); renderMapping(); }
function renderMapping() {
  const card = $("#imMapCard"); if (!im.rows.length) { card.hidden = true; return; } card.hidden = false;
  const spec = im.target === "metrics" ? METRIC_FIELDS : KOL_FIELDS; const required = im.target === "metrics" ? ["date"] : ["name"];
  const okReq = required.every((f) => im.mapping[f]); $("#imMapSub").textContent = `${im.source} · ${im.rows.length} 行 · 已识别 ${Object.keys(im.mapping).length} / ${Object.keys(spec).length} 个字段` + (okReq ? " · 可直接导入" : " · 请先选择必填字段"); $("#imCommit").disabled = !okReq;
  $("#imMap").replaceChildren(...Object.keys(spec).map((f) => { const sel = h("select", { class: im.mapping[f] ? "" : "miss", onchange: (e) => { if (e.target.value) im.mapping[f] = e.target.value; else delete im.mapping[f]; renderPreview(); e.target.className = e.target.value ? "" : "miss"; } }, h("option", { value: "" }, required.includes(f) ? "— 必填，请选择 —" : "— 不导入 —"), ...im.headers.map((hd) => h("option", { value: hd, selected: im.mapping[f] === hd }, hd)));
    return h("div", { class: "maprow" }, h("div", { class: "k" }, FIELD_LABELS[f] || f, h("small", null, f)), h("div", { class: "ar" }, "←"), sel); }));
  renderPreview();
}
function renderPreview() { const rows = mapRows(im.rows.slice(0, 5), im.target, im.mapping); const cols = im.target === "metrics" ? ["date", "platform", "campaign", "spend", "impressions", "clicks", "conversions", "engagements", "negatives"] : ["name", "platform", "category", "followers", "avgViews", "avgEngagements", "engagementRate", "quote", "fitScore", "audience"];
  const t = $("#imPreview"); t.replaceChildren(h("thead", null, h("tr", null, cols.map((c) => h("th", null, FIELD_LABELS[c] || c)))), h("tbody", null, rows.length ? rows.map((r) => h("tr", null, cols.map((c) => h("td", { class: typeof r[c] === "number" ? "num" : "" }, r[c] == null || r[c] === "" ? h("span", { class: "mini" }, "-") : typeof r[c] === "number" ? fmtN(r[c]) : str(r[c]))))) : [h("tr", null, h("td", { colspan: cols.length }, "映射后没有有效行，请检查必填字段"))])); }
// 把映射好的行并入达人库 / 投放数据（去重合并），返回 { count, added }；演示与手动导入共用
function mergeImported(target, rows, source) {
  if (target === "metrics") { const key = (r) => `${r.date}|${r.platform}|${r.campaign}`; const map = new Map(DB.metrics.map((r) => [key(r), r])); let added = 0; for (const r of rows) { if (!map.has(key(r))) added++; map.set(key(r), { ...r, source }); } DB.metrics = [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1)); return { count: rows.length, added }; }
  const key = (r) => `${r.name}|${r.platform}`; const map = new Map(DB.kols.map((r) => [key(r), r])); let added = 0; for (const r of rows) { const o = map.get(key(r)); if (!o) added++; map.set(key(r), { ...(o || { id: uid("k"), status: "待评估", selected: false }), ...r, source }); } DB.kols = [...map.values()]; return { count: rows.length, added };
}
async function commitImport() {
  if (!(repo.mode === "local" || requireWrite())) return; const rows = mapRows(im.rows, im.target, im.mapping); if (!rows.length) return toast("没有可导入的有效行");
  const r = mergeImported(im.target, rows, im.source);
  if (im.target === "metrics") { if (await save("metrics")) toast(`已导入 ${r.count} 行投放数据`); } else { if (await save("kols")) toast(`已导入 ${r.count} 位达人（新增 ${r.added}）`); }
  im.rows = []; im.headers = []; $("#imMapCard").hidden = true; $("#imPaste").value = ""; renderImportStats(); renderConnectors();
}
function renderImportStats() { const dates = DB.metrics.map((r) => r.date).sort(); const last = DB.metrics.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "无";
  $("#imStats").replaceChildren(statTile("达人库", String(DB.kols.length), [...new Set(DB.kols.map((k) => k.platform))].filter(Boolean).join(" · ") || "尚未导入"), statTile("投放数据", `${DB.metrics.length} 行`, last), statTile("连接器", String(DB.connectors.length), `${DB.connectors.filter((c) => c.type === "http").length} 个接口数据源`)); }
const CONN_ICON = { file: "CSV", http: "API", oceanengine: "星图", juguang: "聚光", pugongying: "蒲公英" };
const CONN_HELP = {
  oceanengine: "巨量引擎开放平台（含星图）面向有企业资质的服务商 / 广告主。流程：在 open.oceanengine.com 创建应用 → 获得 app_id / secret → 广告主授权 → 用授权码换取 access_token。填入后，服务端按官方文档拉取投放报表与星图达人数据。个人账号无法开通。",
  juguang: "小红书聚光 Marketing API 走 OAuth 2.0：需要聚光广告主企业账号并创建应用 → 获得 app_id / secret → 授权后换取 access_token。可拉取计划级消耗、展现、点击与转化报表。",
  http: "任何能返回 JSON 或 CSV 的接口都能接：第三方数据服务（新榜、蝉妈妈等）的 API、你们自己的数据中台、甚至一个在线表格的导出链接。返回的字段会按表头自动识别，也可以在导入后手动调整映射。"
};
function renderConnectors() {
  const canEdit = repo.mode === "local" || repo.canWrite;
  $("#imConnectors").replaceChildren(...DB.connectors.map((c) => { const official = ["oceanengine", "juguang", "pugongying"].includes(c.type);
    return h("div", { class: "conn" }, h("div", { class: "ic" }, CONN_ICON[c.type] || "API"), h("div", null, h("div", { class: "n" }, str(c.name), " ", h("span", { class: "pill" + (c.type === "http" ? " accent" : official && c.type !== "pugongying" ? " warn" : " ok") }, c.type === "file" ? "可用" : c.type === "http" ? "接口" : c.type === "pugongying" ? "无 API" : (obj(c.config).access_token ? "已填凭证" : "待授权"))), h("div", { class: "s" }, str(c.lastStatus) + (c.lastRun ? " · " + new Date(c.lastRun).toLocaleString("zh-CN", { hour12: false }) : "") + (c.target ? " · 导入到" + (c.target === "metrics" ? "投放日报" : "达人名单") : ""))),
      h("div", { class: "acts" }, c.type === "http" && h("button", { type: "button", class: "btn sm primary", disabled: !canEdit, onclick: () => runConnectorUi(c) }, "立即拉取"), (c.type === "http" || c.type === "oceanengine" || c.type === "juguang") && h("button", { type: "button", class: "btn sm", disabled: !canEdit, onclick: () => openConn(c) }, "配置"), c.type === "file" && h("button", { type: "button", class: "btn sm", onclick: () => $("#imFile").click() }, "选择文件"), c.type === "pugongying" && h("button", { type: "button", class: "btn sm", onclick: () => { $("#imPaste").value = SAMPLE_TABLES.pgy; toast("已填入蒲公英导出格式示例，点「识别字段」") } }, "查看导出格式"))); }));
}
async function runConnectorUi(c) {
  if (!(repo.mode === "local" || requireWrite())) return; toast("正在拉取 " + c.name + "…");
  try {
    if (repo.mode === "server") { const r = await repo.call(`/connectors/${c.id}/run`); await repo.reload(); toast(`已导入 ${r.count} 条`); }
    else { const cfg = c.config || {}; let hd = {}; try { hd = cfg.headers ? JSON.parse(cfg.headers) : {}; } catch (e) { throw { message: "Headers 不是合法 JSON" }; } const res = await fetch(cfg.url, { headers: hd }); if (!res.ok) throw { message: "接口返回 HTTP " + res.status }; const text = await res.text(); let rows;
      if (cfg.format === "csv") { const p = parseTable(text); rows = p.rows; } else { let j; try { j = JSON.parse(text); } catch (e) { throw { message: "接口返回的不是 JSON" }; } rows = (cfg.path || "").split(".").filter(Boolean).reduce((a, k) => (a == null ? a : a[k]), j); if (!Array.isArray(rows)) throw { message: "在路径 " + (cfg.path || "(根)") + " 下没有数组" }; }
      im.target = c.target || "kols"; segSet($("#imTarget"), im.target); setParsed({ headers: rows.length ? Object.keys(rows[0]) : [], rows }, c.name); c.lastRun = new Date().toISOString(); c.lastStatus = `拉取到 ${rows.length} 行，请确认字段后导入`; await save("connectors"); }
    renderConnectors(); renderImportStats(); renderAll();
  } catch (e) { c.lastRun = new Date().toISOString(); c.lastStatus = "失败：" + (e.message || "未知错误"); toast("拉取失败：" + (e.message || "")); renderConnectors(); }
}
function openConn(c) { im.editing = c || null; const m = $("#connModal"); m.hidden = false; $("#cnHint").textContent = ""; $("#cnDelete").hidden = !c;
  $("#cnType").value = c ? c.type : "http"; $("#cnTarget").value = c ? c.target || "kols" : "kols"; $("#cnName").value = c ? c.name : ""; const cfg = obj(c && c.config);
  $("#cnUrl").value = cfg.url || ""; $("#cnFormat").value = cfg.format || "json"; $("#cnPath").value = cfg.path || ""; $("#cnHeaders").value = cfg.headers || ""; $("#cnAppId").value = cfg.app_id || ""; $("#cnSecret").value = cfg.secret || ""; $("#cnToken").value = cfg.access_token || ""; $("#cnType").disabled = !!c; syncConnFields(); }
function syncConnFields() { const t = $("#cnType").value; $("#cnHttpFields").hidden = t !== "http"; $("#cnOfficialFields").hidden = t === "http"; $("#cnHelp").textContent = CONN_HELP[t] || ""; }
function initImport() {
  segInit($("#imTarget"), (v) => { im.target = v; if (im.rows.length) { im.mapping = inferMapping(im.headers, im.target); renderMapping(); } });
  const drop = $("#imDrop"); const file = $("#imFile");
  const handle = async (f) => { if (!f) return; $("#imHint").className = "hint"; $("#imHint").textContent = "正在读取 " + f.name + "…"; try { setParsed(await readFile(f), f.name); $("#imHint").textContent = `已识别 ${im.rows.length} 行，右侧确认后导入。`; } catch (e) { $("#imHint").className = "hint err"; $("#imHint").textContent = e.message || "读取失败"; } };
  file.addEventListener("change", () => handle(file.files[0])); ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); })); ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); })); drop.addEventListener("drop", (e) => handle(e.dataTransfer.files[0]));
  $$("#importForm .chip[data-s]").forEach((b) => b.addEventListener("click", () => { const s = SAMPLE_TABLES[b.dataset.s]; $("#imPaste").value = typeof s === "function" ? s() : s; const tg = b.dataset.s === "metrics" ? "metrics" : "kols"; im.target = tg; segSet($("#imTarget"), tg); setParsed(parseTable($("#imPaste").value), "示例 · " + b.textContent); $("#imHint").className = "hint"; $("#imHint").textContent = "右侧确认后导入。"; }));
  let pasteTimer = null; $("#imPaste").addEventListener("input", () => { clearTimeout(pasteTimer); pasteTimer = setTimeout(() => { const v = $("#imPaste").value; if (v.split("\n").filter((x) => x.trim()).length < 2) return; const p = parseTable(v); if (!p.rows.length) return; setParsed(p, "粘贴的表格"); $("#imHint").className = "hint"; $("#imHint").textContent = `已识别 ${p.rows.length} 行，右侧确认后导入。`; }, 500); });
  $("#imParse").addEventListener("click", () => { const p = parseTable($("#imPaste").value); if (!p.rows.length) { $("#imHint").className = "hint err"; $("#imHint").textContent = "没有识别到表格内容，请粘贴含表头的数据。"; return; } setParsed(p, "粘贴的表格"); $("#imHint").className = "hint"; $("#imHint").textContent = `已识别 ${p.rows.length} 行，右侧确认后导入。`; });
  $("#imCommit").addEventListener("click", commitImport);
  $("#imAddConn").addEventListener("click", () => { if (!(repo.mode === "local" || requireWrite())) return; openConn(null); });
  $("#cnType").addEventListener("change", syncConnFields); $("#cnClose").addEventListener("click", () => { $("#connModal").hidden = true; }); $("#connModal").addEventListener("click", (e) => { if (e.target === $("#connModal")) $("#connModal").hidden = true; });
  $("#cnSave").addEventListener("click", async () => { const t = $("#cnType").value; const name = $("#cnName").value.trim(); if (!name) { $("#cnHint").textContent = "请填写名称"; return; }
    const config = t === "http" ? { url: $("#cnUrl").value.trim(), format: $("#cnFormat").value, path: $("#cnPath").value.trim(), headers: $("#cnHeaders").value.trim() } : { app_id: $("#cnAppId").value.trim(), secret: $("#cnSecret").value.trim(), access_token: $("#cnToken").value.trim() };
    if (t === "http" && !config.url) { $("#cnHint").textContent = "请填写接口地址"; return; }
    if (im.editing) Object.assign(im.editing, { name, target: $("#cnTarget").value, config: { ...im.editing.config, ...config } }); else DB.connectors.push({ id: uid("c"), type: t, name, target: $("#cnTarget").value, config, lastStatus: t === "http" ? "尚未拉取" : "已填凭证，授权与拉取按官方文档接入" });
    if (await save("connectors")) { $("#connModal").hidden = true; renderConnectors(); renderImportStats(); } });
  $("#cnDelete").addEventListener("click", async () => { if (!im.editing) return; DB.connectors = DB.connectors.filter((c) => c !== im.editing); if (await save("connectors")) { $("#connModal").hidden = true; renderConnectors(); renderImportStats(); } });
  TOOL_RENDER.import = () => { renderConnectors(); renderImportStats(); };
}
</script>
