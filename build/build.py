#!/usr/bin/env python3
"""把 build/parts 拼成 public/index.html（自托管版）和 build/artifact.html（claude.ai 发布版），
并用 Node 从数据文件导出 server/seed.json。用法：python3 build/build.py"""
import os, re, json, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTS = ["1_head.html", "2_body.html", "3_data.js", "4_core.js", "4b_lib.js", "5_plan.js", "6_factory.js", "7_kol.js", "8_import.js", "9_monitor.js", "10_insights.js", "10b_start.js", "11_settings_init.js", "12_onboarding.js"]

def read(p):
    with open(os.path.join(ROOT, "build", "parts", p), encoding="utf-8") as f:
        return f.read()

body = "".join(read(p) for p in PARTS)
os.makedirs(os.path.join(ROOT, "public"), exist_ok=True)
with open(os.path.join(ROOT, "public", "index.html"), "w", encoding="utf-8") as f:
    f.write('<!doctype html>\n<html lang="zh-CN">\n' + body + "\n</html>\n")
with open(os.path.join(ROOT, "build", "artifact.html"), "w", encoding="utf-8") as f:
    f.write(body)
print("wrote public/index.html (%d bytes) and build/artifact.html" % len(body.encode("utf-8")))

node = os.environ.get("NODE") or shutil.which("node")
if not node:
    print("未找到 node，跳过 server/seed.json 生成（已有文件保持不变）")
    sys.exit(0)
data_js = re.sub(r"</?script[^>]*>", "", read("3_data.js"))
script = data_js + "\nprocess.stdout.write(JSON.stringify(SEED_TEMPLATE));\n"
tmp = os.path.join(ROOT, "build", "_seed_tmp.js")
with open(tmp, "w", encoding="utf-8") as f:
    f.write(script)
try:
    out = subprocess.run([node, tmp], capture_output=True, text=True, check=True).stdout
    seed = json.loads(out)
    with open(os.path.join(ROOT, "server", "seed.json"), "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False)
    print("wrote server/seed.json: %d kols, %d metric rows, %d rules" % (len(seed["kols"]), len(seed["metricsTemplate"]), len(seed["rules"])))
finally:
    os.remove(tmp)
