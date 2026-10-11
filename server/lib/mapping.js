// 字段识别：把各平台（蒲公英 / 星图 / 千瓜 / 新榜 / 投放后台）导出表格的表头映射到统一字段。
// 浏览器端有一份同步的副本（public/index.html 内），修改时两边一起改。

const KOL_FIELDS = {
  name: ["name", "达人名称", "达人昵称", "博主昵称", "账号名称", "达人", "昵称", "账号", "博主", "创作者", "kol", "nickname"],
  platform: ["platform", "平台", "渠道", "媒体"],
  category: ["category", "内容类型", "内容方向", "品类", "类目", "垂类", "赛道", "分类"],
  city: ["city", "城市", "地区", "所在地", "地域"],
  engagementRate: ["engagementrate", "互动率", "平均互动率", "赞藏率", "互动比例"],
  followers: ["followers", "粉丝数量", "粉丝数", "粉丝量", "粉丝", "fans", "关注数"],
  avgViews: ["avgviews", "阅读中位数", "播放中位数", "曝光中位数", "平均阅读", "平均播放", "平均曝光", "阅读量", "播放量", "曝光量", "阅读", "播放", "曝光", "views"],
  avgEngagements: ["avgengagements", "互动中位数", "平均互动", "互动量", "互动数", "互动", "engagements"],
  quote: ["quote", "图文报价", "视频报价", "合作报价", "一口价", "报价", "价格", "price", "费用"],
  fitScore: ["fitscore", "匹配分", "匹配度", "人工评分", "评分"],
  audience: ["audience", "粉丝画像", "受众", "人群", "粉丝构成"],
  notes: ["notes", "备注", "说明", "内容方向与粉丝画像", "简介"],
  sourceUrl: ["sourceurl", "主页链接", "主页", "链接", "url", "homepage"],
  updatedAt: ["updatedat", "更新日期", "数据日期", "数据更新时间", "日期"],
};

const METRIC_FIELDS = {
  date: ["date", "统计日期", "日期", "时间", "天", "day"],
  platform: ["platform", "平台", "渠道", "媒体", "媒介", "来源"],
  campaign: ["campaign", "广告计划", "计划名称", "计划", "系列", "活动", "项目", "campaign_name", "广告组"],
  spend: ["spend", "cost", "总花费", "消耗", "花费", "消费", "成本"],
  impressions: ["impressions", "展示数", "展示量", "曝光量", "展现量", "展示", "曝光", "展现", "show"],
  clicks: ["clicks", "点击数", "点击量", "点击", "click"],
  conversions: ["conversions", "转化数", "转化量", "订单数", "成交数", "转化", "订单", "成交", "convert"],
  engagements: ["engagements", "互动数", "互动量", "互动"],
  negatives: ["negatives", "负面评论", "负评数", "负评", "负面", "差评"],
};

function normHeader(h) {
  return String(h || "").toLowerCase().replace(/[\s_\-（(].*$/u, "").replace(/[\s_\-]/g, "").trim();
}

// 根据表头推断映射：返回 { 统一字段: 原始表头 }
function inferMapping(headers, target) {
  const spec = target === "metrics" ? METRIC_FIELDS : KOL_FIELDS;
  const used = new Set();
  const mapping = {};
  const norm = headers.map((h) => ({ raw: h, n: normHeader(h), full: String(h || "").toLowerCase() }));
  for (const [field, syns] of Object.entries(spec)) {
    let hit = null;
    for (const s of syns) {
      const sn = s.toLowerCase();
      hit = norm.find((x) => !used.has(x.raw) && (x.n === sn || x.full === sn)); if (hit) break;
    }
    if (!hit) for (const s of syns) { const sn = s.toLowerCase(); hit = norm.find((x) => !used.has(x.raw) && x.full.includes(sn)); if (hit) break; }
    if (hit) { mapping[field] = hit.raw; used.add(hit.raw); }
  }
  return mapping;
}

function parseNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[,，¥￥$\s]/g, "");
  if (!s || /待|无|-$|^n\/?a$/i.test(s)) return null;
  let mult = 1;
  if (/亿/.test(s)) { mult = 1e8; s = s.replace(/亿/g, ""); }
  else if (/[万w]/i.test(s)) { mult = 1e4; s = s.replace(/[万w]/gi, ""); }
  else if (/[kK]$/.test(s)) { mult = 1e3; s = s.replace(/[kK]$/, ""); }
  const pct = /%$/.test(s); s = s.replace(/%$/, "");
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return pct ? n : n * mult;
}

function parseDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") { // Excel 序列号
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim().replace(/[年月]/g, "-").replace(/日/g, "").replace(/\//g, "-").replace(/\./g, "-");
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m2) return `${new Date().getFullYear()}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

const PLATFORM_ALIASES = [["小红书", /小红书|xhs|red|rednote/i], ["抖音", /抖音|douyin|tiktok/i], ["B站", /b站|bilibili|哔哩/i], ["微博", /微博|weibo/i], ["快手", /快手|kuaishou/i], ["视频号", /视频号|微信视频/i], ["微信", /微信|wechat|公众号|朋友圈/i], ["知乎", /知乎|zhihu/i], ["淘宝/天猫", /淘宝|天猫|tmall|taobao/i], ["京东", /京东|jd/i], ["程序化广告", /程序化|信息流|巨量|腾讯广告|广点通|oCPM/i]];
function normPlatform(v) { const s = String(v || "").trim(); if (!s) return ""; for (const [name, re] of PLATFORM_ALIASES) if (re.test(s)) return name; return s; }

function mapRows(rows, target, mapping) {
  const out = [];
  for (const r of rows) {
    const get = (f) => (mapping[f] != null ? r[mapping[f]] : undefined);
    if (target === "metrics") {
      const row = { date: parseDate(get("date")), platform: normPlatform(get("platform")), campaign: String(get("campaign") || "").trim(),
        spend: parseNum(get("spend")) || 0, impressions: parseNum(get("impressions")) || 0, clicks: parseNum(get("clicks")) || 0,
        conversions: parseNum(get("conversions")) || 0, engagements: parseNum(get("engagements")) || 0, negatives: parseNum(get("negatives")) || 0 };
      if (!row.date) continue;
      out.push(row);
    } else {
      const name = String(get("name") || "").trim(); if (!name) continue;
      const row = { name, platform: normPlatform(get("platform")), category: String(get("category") || "").trim(), city: String(get("city") || "").trim(),
        followers: parseNum(get("followers")), avgViews: parseNum(get("avgViews")), avgEngagements: parseNum(get("avgEngagements")), engagementRate: parseNum(get("engagementRate")),
        quote: parseNum(get("quote")), fitScore: parseNum(get("fitScore")), audience: String(get("audience") || "").trim(), notes: String(get("notes") || "").trim(),
        sourceUrl: String(get("sourceUrl") || "").trim(), updatedAt: parseDate(get("updatedAt")) || "" };
      if (row.engagementRate == null && row.avgViews && row.avgEngagements) row.engagementRate = Math.round(row.avgEngagements / row.avgViews * 10000) / 100;
      out.push(row);
    }
  }
  return out;
}

module.exports = { KOL_FIELDS, METRIC_FIELDS, inferMapping, mapRows, parseNum, parseDate, normPlatform };
