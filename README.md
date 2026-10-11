# ACE 营销工作台

AI 驱动、能在真实业务里跑起来的营销执行工具：全案策划、内容工厂、评论洞察、达人匹配、投放监测、数据接入。前端是一个单页面，后端是零依赖的 Node 服务。

## 目录

```
ace-workbench/
├── public/index.html      # 前端（由 build/parts 拼出，不要直接改）
├── server/
│   ├── server.js          # HTTP 服务：静态页 + API + 定时任务
│   ├── seed.json          # 示例数据模板（由 build 生成）
│   └── lib/               # 存储、模型代理、监测、连接器、字段识别
├── build/
│   ├── parts/             # 前端源文件（样式、页面、各工具脚本）
│   ├── build.py           # 拼装脚本：python3 build/build.py
│   └── artifact.html      # claude.ai Artifact 发布版（无 doctype）
├── docs/部署指南.md
├── Dockerfile
└── package.json
```

## 本地运行

双击 `启动.command`（Mac）或 `启动.bat`（Windows）。首次会自动下载 Node.js 到本目录，然后打开浏览器，出现初始化向导：设口令、填模型 Key。

命令行方式：

```bash
node server/server.js
# 打开 http://localhost:8787
```

也可以用环境变量预设：`ADMIN_TOKEN=... LLM_BASE=https://api.deepseek.com/v1 LLM_KEY=sk-xxx LLM_MODEL=deepseek-chat node server/server.js`

不带后端直接双击 `public/index.html` 也能用：数据存在浏览器里，模型接口在页面「设置」里填。

## 修改前端

改 `build/parts/` 下的文件，然后：

```bash
python3 build/build.py
```

有 Node 时会同步重新生成 `server/seed.json`。

## 部署

见 `docs/部署指南.md`（Zeabur / Railway / Docker / 自有服务器）。
