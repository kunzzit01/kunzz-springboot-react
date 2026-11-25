#!/usr/bin/env bash
# 校验 backend/static/index.html 引用的每个 /assets/* 都真实存在。
# 背景：2026-11-25 提交过“index.html 指向 index-DLajQWp5.js，但 assets 里只有 index-CGaW7zFz.js”，
#       部署后全站白屏、控制台 404。这个检查在提交前拦住同类错误。
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0
html="backend/static/index.html"
[ -f "$html" ] || exit 0
miss=0
for f in $(grep -o '/assets/[^"]*' "$html" | sort -u); do
  if [ ! -f "backend/static$f" ]; then
    echo "[static-check] 缺少被引用的产物: backend/static$f"
    miss=1
  fi
done
if [ "$miss" = "1" ]; then
  echo "[static-check] index.html 与 backend/static/assets 不配套"
  echo "               （重新构建后要把 dist/index.html 和 dist/assets 一起同步）"
  exit 1
fi
echo "[static-check] OK：index.html 引用的资源都在"
