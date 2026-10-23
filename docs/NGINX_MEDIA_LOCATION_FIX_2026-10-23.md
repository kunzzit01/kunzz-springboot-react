# nginx `location /media/` 把后台页面路由代理给后端（2026-10-23）

> 任务：`2026-10-23-nginx-media-location`

## 症状

后台页面 `/media/join2`、`/media/join3`、`/media/music`、`/media/about4`、`/media/homepage1` …
**从菜单点进去正常，一刷新/直链打开就变成一段 JSON**：

```json
{"code":404,"message":"资源不存在: media/join2","data":null}
```

（修 `MediaServeController` 之前是 `{"code":404,"message":"类型不支持"}` —— 换了个说法，根因没变。）

## 根因

VPS 上 nginx 的后台 server 块里有：

```nginx
location /media/ {
    proxy_pass http://127.0.0.1:8082;   # ← 把所有 /media/* 都给了后端
}
```

后端只认 4 个官网背景 key（`home_background / about_background / joinus_background / tokyo_background`），
其余 `/media/xxx` 它没有映射 → 落到静态资源处理器 → 返回 404 JSON。
而**前端的页面路由刚好也在 `/media/` 下面**：

```
/media                 媒体管理总览
/media/music           背景音乐
/media/about4          发展历史
/media/join2           我们的足迹
/media/join3           职位
/media/:key            页面媒体上传
```

所以这些页面「刷新即挂」。`/zzz-nonexistent` 这类不在代理前缀里的路径走 `try_files … /index.html`，
200 正常 —— 这就是「点进去没事、刷新才坏」的原因。

对照实测（2026-10-23）：

| 请求 | 结果 |
|---|---|
| `/uploads/nope.png` | `404 application/json` → 走了 `/uploads/` 代理 |
| `/zzz-nonexistent` | `200 text/html` → nginx `try_files` 回 index.html |
| `/media/join2` | `404 application/json` → 被 `/media/` 代理吞掉 |

## 修复

有两种改法，**任选一种**（改完都不需要重建前端）：

- **方案 A（推荐，改 nginx）**：把 `/media/` 收窄成 4 个 key，页面路由回到 `try_files`
- **方案 B（不改 nginx，改后端一处环境变量）**：让后端自己把 `/media/**` 回退到 admin 的 index.html

### 方案 A：改 nginx（保留现有 URL，最干净）

把 `location /media/` 收窄成只匹配 4 个 key 的正则（**nginx 正则 location 优先于前缀 location**，
所以 `/media/join2` 会落回 `location /` → `try_files` → `index.html`）：

```nginx
location ~ ^/media/(home_background|about_background|joinus_background|tokyo_background)$ {
    proxy_pass http://127.0.0.1:8082;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

仓库里的 `nginx-ec2.sh`（admin + website 两个 server 块）已同步改好。

## 线上操作（3 步）

```bash
# 1) 找到实际配置文件（可能是 sites-enabled 里的软链）
sudo grep -rn "location /media/" /etc/nginx/
sudo ss -lntp | grep -E ':(808[0-9]|80|443)\b' | head    # 确认后端端口（文档里是 8082）

# 2) 备份 + 替换
sudo cp -a /etc/nginx/sites-available/<你的配置文件> /root/nginx-backup-$(date +%F_%H%M)
sudo python3 /tmp/fix_media_location.py /etc/nginx/sites-available/<你的配置文件>

# 3) 校验并重载（不重启)
sudo nginx -t && sudo systemctl reload nginx
```

### 方案 B：不改 nginx，让后端自己兜底（需重建 jar）

`WebConfig` 已支持 `app.static-dir` 写**绝对路径**。把后端指向 nginx 的 admin 根目录即可：

```bash
sudo tee -a /etc/inventory-backend.env >/dev/null <<'ENV'
APP_STATIC_DIR=/var/www/admin/
ENV
sudo systemctl daemon-reload && sudo systemctl restart inventory-backend
```

原理：nginx 把 `/media/*` 反代给后端 → 后端静态资源处理器找不到文件 → 用
`/var/www/admin/index.html` 做 SPA 回退 → 浏览器拿到的就是页面，后续 `/assets/*` 仍由 nginx 提供。

> 若 `APP_STATIC_DIR` 没生效（`journalctl -u inventory-backend | grep -i static` 看不到），
> 改用 JVM 参数：在 systemd 的 `ExecStart` 后面加 `--app.static-dir=/var/www/admin/`。
> **方案 B 没有改 nginx 干净**：它让后端多承担一份静态托管，长期看仍建议回到方案 A。

`/tmp/fix_media_location.py` 内容见本文件末尾。

## 验证

```bash
# 应返回 200 + text/html（index.html），不再是 JSON
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -H "Accept: text/html" https://kunzzgroup.com/media/join2
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -H "Accept: text/html" https://kunzzgroup.com/media/music

# 官网背景图/视频不受影响
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://kunzzgroup.com/media/home_background
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://kunzzgroup.com/media/joinus_background
```

## 附：替换脚本

```python
#!/usr/bin/env python3
# 把 nginx 配置里的 `location /media/ { ... }` 换成只匹配 4 个 key 的正则
import re, sys

BACKEND_PORT = "8082"          # 按 ss -lntp 的实际端口改
pat = re.compile(r'[ \t]*location\s+/media/\s*\{[^}]*\}\n', re.M)
new = (
    "    # 只代理官网背景媒体的 4 个 key；后台页面路由 /media/join2 等交给 try_files\n"
    "    location ~ ^/media/(home_background|about_background|joinus_background|tokyo_background)$ {\n"
    f"        proxy_pass http://127.0.0.1:{BACKEND_PORT};\n"
    "        proxy_set_header Host $host;\n"
    "        proxy_set_header X-Real-IP $remote_addr;\n"
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
    "        proxy_set_header X-Forwarded-Proto $scheme;\n"
    "    }\n"
)

for f in sys.argv[1:]:
    s = open(f, encoding="utf-8").read()
    s2, n = pat.subn(new, s)
    if n:
        open(f, "w", encoding="utf-8").write(s2)
        print(f"{f}: 替换 {n} 处")
    else:
        print(f"{f}: 没有匹配到 location /media/")
```
