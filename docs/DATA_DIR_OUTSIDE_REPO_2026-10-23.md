# 运行期数据目录移出仓库（2026-10-23）

> 任务：`2026-10-23-data-dir-outside-repo`
> 起因：`/media/join2` 上传的照片在部署后变成「已上传 0」，`data/media_config.json` 被 git 回滚成 `{ }`。

## 1. 改了什么

| 项 | 之前 | 现在 |
|---|---|---|
| 数据目录 | `Paths.get("data")` —— **跟着进程工作目录走** | `AppDirs.dataDir()`，取 `APP_DATA_DIR`（或 `-Dapp.data.dir`），默认 `./data` |
| 上传目录（碗碟照片） | `System.getProperty("user.dir") + "/uploads"` | `AppDirs.uploadsDir()`，取 `APP_UPLOADS_DIR`（或 `-Dapp.uploads.dir`），默认 `./uploads` |
| git 跟踪 | `backend/data/**` + `backend/uploads/**` 共 390 个文件 | **已取消跟踪**，并写入 `.gitignore` |

新增文件：`backend/src/main/java/com/kunzz/inventory/common/AppDirs.java`
启动时会打印一行（`journalctl -u inventory-backend | grep AppDirs`）：

```
[AppDirs] data=/opt/inventory/data, uploads=/opt/inventory/uploads
```

改了这些读取路径的地方：`ComphotoController`、`MediaController`、`MediaServeController`、
`TimelineController`、`DishwareController`、`CorporateService`、`JobService`、`WebConfig`。

## 2. VPS 迁移步骤（**顺序不能变**）

在 `187.127.125.136` 上执行。核心原则：**先把数据复制到仓库外，再让 git 删除仓库里的副本**。

```bash
# ① 先搞清楚现在这份数据到底在哪（两种可能都查一下）
systemctl show inventory-backend -p WorkingDirectory
sudo ls -la /opt/inventory/data /opt/inventory/uploads 2>/dev/null
sudo ls -la /opt/inventory/backend/data /opt/inventory/backend/uploads 2>/dev/null

# ② 停服务 + 全量备份（20 秒，别省）
sudo systemctl stop inventory-backend
sudo mkdir -p /opt/backups
sudo tar czf /opt/backups/runtime-data_$(date +%F_%H%M).tar.gz \
  -C /opt/inventory $(cd /opt/inventory && ls -d data uploads backend/data backend/uploads 2>/dev/null)

# ③ 把数据搬到仓库外（源目录以 ① 查到的为准，这里假设在 /opt/inventory/backend/）
sudo mkdir -p /opt/inventory/data /opt/inventory/uploads
sudo cp -a /opt/inventory/backend/data/.    /opt/inventory/data/
sudo cp -a /opt/inventory/backend/uploads/. /opt/inventory/uploads/

# ④ 固化目录（写进环境文件，恢复服务时生效）
sudo tee -a /etc/inventory-backend.env >/dev/null <<'ENV'
APP_DATA_DIR=/opt/inventory/data
APP_UPLOADS_DIR=/opt/inventory/uploads
ENV
sudo systemctl daemon-reload

# ⑤ 起服务并确认它读的是新目录
sudo systemctl start inventory-backend
sleep 10
sudo systemctl is-active inventory-backend
sudo journalctl -u inventory-backend -n 30 --no-pager | grep AppDirs
```

确认无误后，再拉代码（这一步会让 git **删除**仓库里的 `backend/data`、`backend/uploads`，
因为它们已经从版本控制里移除 —— 此时数据已经在 `/opt/inventory/{data,uploads}` 里了）：

```bash
cd /opt/kunzz-springboot-react
git status --short          # 应该看到一大批 D backend/data/... backend/uploads/...
git pull --ff-only          # 或按你的流程 reset
```

> ⚠️ 如果 ⑤ 之前就跑 `git pull`，工作区里那 390 个文件会被删掉 —— 所以数据必须先搬走。

## 3. 重建 + 部署

```bash
# 后端（AppDirs + /media 路由修复 + multipart 30MB）
cd /opt/kunzz-springboot-react/backend
mvn -DskipTests clean package
sudo cp target/inventory-backend-1.0.0.jar /opt/inventory/app.jar
sudo chown kunzz:kunzz /opt/inventory/app.jar
sudo systemctl restart inventory-backend

# 前端（删除照片按钮 / HEIC / 自动压缩）
cd /opt/kunzz-springboot-react/inventory-system/frontend
npm ci --no-audit --no-fund
npm run build
sudo rsync -a --delete dist/ /var/www/admin/
sudo chown -R www-data:www-data /var/www/admin
```

## 4. 验证（各 1 条）

```bash
# 目录：应是 /opt/inventory/data 与 /opt/inventory/uploads
sudo journalctl -u inventory-backend -n 50 --no-pager | grep AppDirs

# 刷新页面不再返回 JSON（应 200 + index.html）
curl -s -o /dev/null -w "%{http_code}\n" -H "Accept: text/html" http://127.0.0.1:8080/media/join2

# 上传不再撞 1MB 限制（应返回业务错误「职位不能为空」，而不是「服务器内部错误」）
curl -s -X POST -F "resume=@/tmp/2mb.bin;filename=x.pdf" http://127.0.0.1:8080/api/applications
```

浏览器：

1. `/media/join2` → **F5 刷新**不再变 JSON；照片数量与上传记录对得上
2. 上传一张 >10MB 的手机原图 → 成功，提示「已自动压缩 x → y」
3. 已上传的格子上有红色 ✕（图片右上角）和「删除照片」按钮，点了能删
4. 碗碟页照片仍能显示（`/uploads/dishware/*.png`）

## 5. 本地开发注意

- 不配 `APP_DATA_DIR` / `APP_UPLOADS_DIR` 时行为不变：仍读写 `backend/data`、`backend/uploads`。
- 这两个目录已不在 git 里，**本地 `git pull` 时 git 会把工作区里旧的 390 个文件删掉**
  （因为提交里删除了它们）。需要种子数据就恢复一次：

```bash
git checkout e7155dd -- backend/data backend/uploads
```

（`e7155dd` = 取消跟踪之前的最后一个提交，2026-10-23。）

## 6. 回滚

```bash
# 代码回滚（恢复到用相对路径的版本）
git revert <本次提交>
# 数据不受影响：它们从来不在本次改动的路径上
```

## 7. 仍然存在的风险（本次没解决）

- `/opt/backups/` 与 `data/`、`uploads/` 同机，机器坏了还是一起没。建议把 `runtime-data_*.tar.gz` 定期拉回本地。
- `backend/target/inventory-backend-1.0.0.jar` 仍在 git 里（历史遗留），每次构建都会变，属于另一个热点问题。
