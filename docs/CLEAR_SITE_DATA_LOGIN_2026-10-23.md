# 登录时清 HTTP 缓存：Clear-Site-Data（2026-10-23）

## 为什么

部署新版本后，**旧标签页/旧缓存里的 HTML+JS 仍会继续跑**（登录是前端路由，不重新加载页面；
bfcache 还会把旧页面原样恢复）。现象：登出→再进入某页还是旧界面，F5 一下才变。

`Clear-Site-Data: "cache"` 让浏览器在收到响应时清掉本站 HTTP 缓存。挂在 **`/login` 文档**上，
就是「每次进登录页 → 清一次缓存 → 之后加载的一定是最新 bundle」。

> 只清 `cache`，**不动 cookies / localStorage** → 登录 token 不受影响（不会把人踢下线）。

## 线上操作

```bash
# 1) 变量定义（map 必须在 http 级别，conf.d 正好在这个上下文；变量名全机唯一）
sudo tee /etc/nginx/conf.d/kunzz-clear-cache.conf >/dev/null <<'CONF'
# 只有 /login 这份文档会带上 Clear-Site-Data: "cache"
map $request_uri $kz_clear_cache {
    default "";
    ~^/login$ "cache";
}
CONF

# 2) 在后台的 location = /index.html 里加一行（先备份，已加过会自动跳过）
sudo python3 - <<'PY'
import re, glob, shutil, time
n = 0
for p in glob.glob('/etc/nginx/sites-available/*'):
    s = open(p, encoding='utf-8').read()
    if 'location = /index.html' not in s or 'Clear-Site-Data' in s:
        continue
    s2 = re.sub(r'(location\s*=\s*/index\.html\s*\{[^}]*?)(\n\s*\})',
                r'\1\n        add_header Clear-Site-Data $kz_clear_cache;\2', s, count=1)
    if s2 != s:
        shutil.copy2(p, p + '.bak-' + time.strftime('%Y%m%d_%H%M'))
        open(p, 'w', encoding='utf-8').write(s2)
        print('已修改', p); n += 1
print('修改文件数:', n)
PY

# 3) 校验 + 重载（失败时会把 .bak-* 拷回去）
sudo nginx -t && sudo systemctl reload nginx
```

## 验证

```bash
# 登录页：应该有
curl -sD - -o /dev/null https://www.kunzzgroup.com/login | grep -i clear-site-data
# 期望： Clear-Site-Data: "cache"

# 其它页面：不应该有（值为空时 nginx 不发这个头）
curl -sD - -o /dev/null https://www.kunzzgroup.com/dashboard | grep -i clear-site-data \
  || echo "正常：dashboard 没有该头"
```

## 触发时机（重要）

只有在 **`/login` 作为整页文档加载**时才会触发：

- ✅ 从官网点「员工登录」、地址栏直接输 `/login`、在登录页按 F5
- ❌ 在后台里点「登出」（前端路由，不加载 `/login` 文档）→ 不触发

所以它是「减少旧缓存窗口」的保险，不是万能药；纯前端登出的场景仍然靠：
`登录成功后整页跳转`（`Login.tsx`）+ `底部「系统已更新 → 立即刷新」提示条`（`versionWatcher.ts`）。

## 回滚

```bash
sudo rm -f /etc/nginx/conf.d/kunzz-clear-cache.conf
sudo cp -a /etc/nginx/sites-available/<file>.bak-<时间> /etc/nginx/sites-available/<file>
sudo nginx -t && sudo systemctl reload nginx
```
