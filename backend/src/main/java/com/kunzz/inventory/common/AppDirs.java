package com.kunzz.inventory.common;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 运行期数据目录（2026-10-23，task 2026-10-23-data-dir-outside-repo）
 *
 * 为什么要有这个东西：
 *   以前后端所有路径都写死 {@code Paths.get("data")} / {@code Paths.get("uploads")}，
 *   也就是**跟着进程的工作目录走**。结果：
 *     1. 部署机只要换了 WorkingDirectory（或换了启动方式），程序就去读另一个空目录 →
 *        后台显示「已上传 0」，照片像是丢了（其实在旧目录里）。
 *     2. 这两个目录当年还被纳进了 git（`backend/data/**`、`backend/uploads/**`），
 *        一次 `git reset / checkout / clean` 就能把线上传的图片和 `media_config.json` 回滚掉。
 *
 * 现在：目录位置由环境变量固定，与工作目录、与 git 都无关：
 *   - 数据目录：`APP_DATA_DIR`（或 JVM 参数 `-Dapp.data.dir=...`），默认 `data`
 *   - 上传目录：`APP_UPLOADS_DIR`（或 `-Dapp.uploads.dir=...`），默认 `uploads`
 *   生产建议（systemd EnvironmentFile=/etc/inventory-backend.env）：
 *     APP_DATA_DIR=/opt/inventory/data
 *     APP_UPLOADS_DIR=/opt/inventory/uploads
 *
 * 注意：`data` 与 `uploads` 是两个不同的目录，别合并：
 *   - `data/`：media_config.json、page_config.json、comphotos/、page-images/、timeline/、bgmusic/、uploads/（简历与媒体文件）
 *   - `uploads/`：碗碟照片 `uploads/dishware/`（历史上就独立在仓库根目录下的 uploads/）
 */
public final class AppDirs {

    private static final Path DATA = resolve("app.data.dir", "APP_DATA_DIR", "data");
    private static final Path UPLOADS = resolve("app.uploads.dir", "APP_UPLOADS_DIR", "uploads");

    private AppDirs() { }

    private static Path resolve(String systemProperty, String envName, String fallback) {
        String v = System.getProperty(systemProperty);
        if (v == null || v.isBlank()) v = System.getenv(envName);
        if (v == null || v.isBlank()) v = fallback;
        return Paths.get(v).toAbsolutePath().normalize();
    }

    /** 数据目录（默认 `<cwd>/data`） */
    public static Path dataDir() {
        return DATA;
    }

    /** 上传目录（默认 `<cwd>/uploads`） */
    public static Path uploadsDir() {
        return UPLOADS;
    }

    /** 数据目录下的子路径，如 {@code AppDirs.data("comphotos")} */
    public static Path data(String... more) {
        return join(DATA, more);
    }

    /** 上传目录下的子路径，如 {@code AppDirs.uploads("dishware")} */
    public static Path uploads(String... more) {
        return join(UPLOADS, more);
    }

    private static Path join(Path base, String... more) {
        Path p = base;
        for (String m : more) {
            p = p.resolve(m);
        }
        return p.normalize();
    }

    /** 启动日志用 */
    public static String describe() {
        return "data=" + DATA + ", uploads=" + UPLOADS;
    }
}
