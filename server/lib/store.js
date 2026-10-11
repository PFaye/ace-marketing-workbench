// 极简 JSON 文件存储：单进程、小数据量、原子写入、延迟合并写盘。
const fs = require("fs");
const path = require("path");

class Store {
  constructor(file, seed) {
    this.file = file;
    this.seed = seed || {};
    this.data = null;
    this.timer = null;
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (e) {
      this.data = JSON.parse(JSON.stringify(this.seed));
      this.data.meta = { seededAt: new Date().toISOString() };
      this.flush();
    }
    for (const k of ["kols", "metrics", "rules", "alerts", "briefs", "batches", "connectors"]) if (!Array.isArray(this.data[k])) this.data[k] = [];
    if (!this.data.settings || typeof this.data.settings !== "object") this.data.settings = {};
    return this.data;
  }

  get(name) { return this.data[name]; }
  set(name, value) { this.data[name] = value; this.save(); }
  update(fn) { fn(this.data); this.save(); }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 150);
  }

  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
