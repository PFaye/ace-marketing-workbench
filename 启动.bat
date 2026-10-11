@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul && (set NODE=node) || (
  if not exist ".node\node.exe" (
    echo 首次运行：正在下载 Node.js（约 30MB）…
    powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; $v='v24.21.0'; $u=\"https://npmmirror.com/mirrors/node/$v/node-$v-win-x64.zip\"; try { Invoke-WebRequest $u -OutFile node.zip } catch { Invoke-WebRequest \"https://nodejs.org/dist/$v/node-$v-win-x64.zip\" -OutFile node.zip }; Expand-Archive node.zip -DestinationPath .node_tmp -Force; Move-Item .node_tmp\node-$v-win-x64 .node -Force; Remove-Item node.zip; Remove-Item .node_tmp -Recurse -Force"
  )
  set NODE=.node\node.exe
)
echo 启动中…浏览器会自动打开 http://localhost:8787（关闭这个窗口即停止）
start "" http://localhost:8787
set PORT=8787
%NODE% server\server.js
pause
