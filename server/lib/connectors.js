// 数据连接器：file（手动导入，不需要运行）、http（定时拉取 JSON / CSV 接口）、
// oceanengine / juguang（官方广告平台接入层，需企业资质与授权，当前为预留）。
const { inferMapping, mapRows } = require("./mapping");

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false; text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter((r) => r.some((x) => String(x).trim() !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] == null ? "" : r[i]])));
}

function pick(obj, path) { if (!path) return obj; return String(path).split(".").reduce((a, k) => (a == null ? a : a[k]), obj); }

async function runHttp(conn) {
  const cfg = conn.config || {};
  if (!cfg.url) throw new Error("未填写接口地址");
  let headers = {}; try { headers = cfg.headers ? (typeof cfg.headers === "string" ? JSON.parse(cfg.headers) : cfg.headers) : {}; } catch (e) { throw new Error("Headers 不是合法 JSON"); }
  const r = await fetch(cfg.url, { method: cfg.method || "GET", headers, body: cfg.method === "POST" && cfg.body ? cfg.body : undefined, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`接口返回 HTTP ${r.status}`);
  const text = await r.text();
  let rows;
  if ((cfg.format || "json") === "csv") rows = parseCsv(text);
  else { let j; try { j = JSON.parse(text); } catch (e) { throw new Error("接口返回的不是 JSON"); } rows = pick(j, cfg.path); if (!Array.isArray(rows)) throw new Error("在路径 " + (cfg.path || "(根)") + " 下没有找到数组"); }
  if (!rows.length) return { rows: [], mapping: {} };
  const headers2 = Object.keys(rows[0]);
  const mapping = Object.assign(inferMapping(headers2, conn.target), cfg.mapping || {});
  return { rows: mapRows(rows, conn.target, mapping), mapping };
}

const OFFICIAL = {
  oceanengine: { label: "巨量引擎 / 星图", docs: "https://open.oceanengine.com/", need: "企业资质的开发者账号 + 创建应用后的 app_id / secret + 广告主或星图授权",
    message: "接入层已预留：填入 app_id、secret 与授权后的 access_token 后，可按开放平台文档拉取投放报表与星图达人数据。个人账号无法开通，需要公司资质。" },
  juguang: { label: "小红书聚光", docs: "https://ad.xiaohongshu.com/", need: "聚光广告主账号 + 开放平台应用（OAuth 2.0）",
    message: "接入层已预留：聚光 Marketing API 走 OAuth 2.0 授权，授权后可拉取计划级消耗、展现、点击与转化报表。需要广告主企业账号与应用审核。" },
  pugongying: { label: "小红书蒲公英", docs: "https://pgy.xiaohongshu.com/", need: "无公开 API",
    message: "蒲公英没有面向第三方的公开接口。达人数据请在后台导出表格后用「文件导入」接入；页面会自动识别字段。" },
};

async function runConnector(conn) {
  const t = conn.type;
  if (t === "http") return runHttp(conn);
  if (t === "file") throw new Error("文件连接器不需要运行，直接在「数据接入」里上传或粘贴表格");
  if (OFFICIAL[t]) { const o = OFFICIAL[t]; const cfg = conn.config || {}; const has = ["app_id", "secret", "access_token"].filter((k) => cfg[k]);
    throw new Error(`${o.label}：${o.message}${has.length ? "（已填写：" + has.join("、") + "；授权与拉取逻辑按官方文档接入）" : ""}`); }
  throw new Error("未知的连接器类型：" + t);
}

function maskConfig(conn) {
  const c = { ...(conn.config || {}) };
  for (const k of ["secret", "access_token", "token", "api_key", "key"]) if (c[k]) c[k] = "••••" + String(c[k]).slice(-4);
  if (c.headers && typeof c.headers === "string" && /authorization|token|key/i.test(c.headers)) c.headers = c.headers.replace(/("(?:[^"]*?(?:authorization|token|key)[^"]*?)"\s*:\s*")([^"]*)(")/gi, (m, a, v, b) => a + "••••" + v.slice(-4) + b);
  return { ...conn, config: c };
}

module.exports = { runConnector, parseCsv, OFFICIAL, maskConfig };
