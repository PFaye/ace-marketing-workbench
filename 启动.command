#!/bin/bash
# ACE 营销工作台 · 双击启动（macOS）。首次运行会自动下载 Node.js 到本目录的 .node 文件夹，不改动系统。
cd "$(dirname "$0")"
NODE="$(command -v node 2>/dev/null)"
if [ -z "$NODE" ]; then
  V=v24.21.0; ARCH=$(uname -m); if [ "$ARCH" = "arm64" ]; then A=darwin-arm64; else A=darwin-x64; fi
  if [ ! -x ".node/bin/node" ]; then
    echo "首次运行：正在下载 Node.js（约 50MB，国内镜像）…"; mkdir -p .node
    curl -L --progress-bar "https://npmmirror.com/mirrors/node/$V/node-$V-$A.tar.gz" | tar -xz -C .node --strip-components=1 \
      || curl -L --progress-bar "https://nodejs.org/dist/$V/node-$V-$A.tar.gz" | tar -xz -C .node --strip-components=1 \
      || { echo "下载失败，请检查网络后重新双击"; read -r -p "按回车关闭"; exit 1; }
  fi
  NODE=".node/bin/node"
fi
echo "启动中…浏览器会自动打开 http://localhost:8787（关闭这个窗口即停止）"
( sleep 1.5; open "http://localhost:8787" ) &
PORT=8787 "$NODE" server/server.js
