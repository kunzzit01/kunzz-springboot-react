package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 媒体与页面图片上传（对应 media_manager / bgmusicupload / homepage/about/join/tokyo upload）
 * 文件存 backend/data/uploads 与 backend/data/page-images
 */
@RestController
@RequestMapping("/api/media")
public class MediaController {

    private final Path uploadDir = Paths.get("data", "uploads").toAbsolutePath().normalize();
    private final Path pageImageDir = Paths.get("data", "page-images").toAbsolutePath().normalize();

    /** 背景音乐（对齐线上 bgmusicupload.php：单文件、上传即替换、配置带元信息） */
    private static final List<String> AUDIO_EXTS = List.of("mp3", "wav", "ogg", "m4a");
    private static final Map<String, String> AUDIO_MIME = Map.of(
            "mp3", "audio/mpeg", "wav", "audio/wav", "ogg", "audio/ogg", "m4a", "audio/mp4");

    /** 页面背景（对齐线上 homepage1upload.php 等：视频 + 图片，配置带类型/时间） */
    private static final List<String> PAGE_VIDEO_EXTS = List.of("mp4", "webm", "mov", "avi");
    private static final List<String> PAGE_IMAGE_EXTS = List.of("jpg", "jpeg", "png", "webp", "heic", "heif");
    private static final Map<String, String> PAGE_VIDEO_MIME = Map.of(
            "mp4", "video/mp4", "webm", "video/webm", "mov", "video/quicktime", "avi", "video/x-msvideo");

    /** 新旧 key 映射：后台页面 key -> 旧系统媒体 key（官网 serve 用，对齐 media_config.json） */
    private static final Map<String, String> LEGACY_KEY = Map.of(
            "homepage1", "home_background",
            "about1", "about_background",
            "join1", "joinus_background");

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path bgMusicDir = Paths.get("data", "bgmusic").toAbsolutePath().normalize();
    private final Path bgMusicConfigPath = Paths.get("data", "bgmusic_config.json").toAbsolutePath().normalize();
    private final Path pageConfigPath = Paths.get("data", "page_config.json").toAbsolutePath().normalize();

    // ---------- 背景音乐（对齐线上 bgmusicupload.php） ----------

    /** 当前背景音乐配置（无则 exists=false） */
    @GetMapping("/bgmusic")
    public ApiResponse<Map<String, Object>> bgMusic() {
        Map<String, Object> music = currentBgMusic();
        if (music == null) {
            return ApiResponse.ok(Map.of("exists", false));
        }
        String filePath = String.valueOf(music.get("file"));
        Path f = Paths.get(filePath);
        if (!Files.exists(f)) {
            return ApiResponse.ok(Map.of("exists", false));
        }
        long size = safeSize(f);
        long mtime = safeMtime(f);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exists", true);
        out.put("original_name", music.getOrDefault("original_name", f.getFileName().toString()));
        out.put("format", String.valueOf(music.getOrDefault("format", extNoDot(f.getFileName().toString()))).toUpperCase());
        out.put("updated", String.valueOf(music.getOrDefault("updated", "")));
        out.put("filesize", size);
        out.put("size_formatted", formatFileSize(size));
        out.put("modified", Instant.ofEpochMilli(mtime).atZone(ZoneId.systemDefault()).format(DT_FMT));
        out.put("url", "/api/media/bgmusic-file?t=" + mtime);
        return ApiResponse.ok(out);
    }

    /** 上传背景音乐（仅音频，自动替换旧文件） */
    @PostMapping("/bgmusic")
    public ApiResponse<Map<String, Object>> uploadBgMusic(@RequestParam("file") MultipartFile file) {
        String orig = file.getOriginalFilename() == null ? "music" : file.getOriginalFilename();
        String ext = extNoDot(orig);
        if (!AUDIO_EXTS.contains(ext)) {
            throw new BusinessException("不支持的文件类型！请上传 MP3、WAV、OGG 或 M4A 格式的音频文件。");
        }
        try {
            Files.createDirectories(bgMusicDir);
            // 删除旧文件（所有可能的音频扩展名，对齐线上逻辑）
            for (String e : AUDIO_EXTS) {
                Files.deleteIfExists(bgMusicDir.resolve("music." + e));
            }
            String targetName = "music." + ext;
            Files.copy(file.getInputStream(), bgMusicDir.resolve(targetName), StandardCopyOption.REPLACE_EXISTING);
            Path saved = bgMusicDir.resolve(targetName);

            Map<String, Object> config = readBgMusicConfig();
            if (config == null) config = new LinkedHashMap<>();
            Map<String, Object> music = new LinkedHashMap<>();
            music.put("file", saved.toString().replace("\\", "/"));
            music.put("type", "audio");
            music.put("format", ext);
            music.put("updated", LocalDateTime.now().format(DT_FMT));
            music.put("filesize", safeSize(saved));
            music.put("original_name", orig);
            config.put("background_music", music);
            writeBgMusicConfig(config);
            return bgMusic();
        } catch (IOException e) {
            throw new BusinessException("上传失败: " + e.getMessage());
        }
    }

    /** 删除当前背景音乐 */
    @DeleteMapping("/bgmusic")
    public ApiResponse<Void> deleteBgMusic() {
        Map<String, Object> config = readBgMusicConfig();
        if (config != null) {
            Map<String, Object> music = (Map<String, Object>) config.get("background_music");
            if (music != null && music.get("file") != null) {
                try {
                    Files.deleteIfExists(Paths.get(String.valueOf(music.get("file"))));
                } catch (IOException ignored) { }
            }
            config.remove("background_music");
            writeBgMusicConfig(config);
        }
        try {
            for (String e : AUDIO_EXTS) Files.deleteIfExists(bgMusicDir.resolve("music." + e));
        } catch (IOException ignored) { }
        return ApiResponse.ok();
    }

    /** 音频文件访问（动态 Content-Type，支持浏览器内联播放 + 缓存破坏参数） */
    @GetMapping(value = "/bgmusic-file")
    public ResponseEntity<org.springframework.core.io.Resource> bgMusicFile(@RequestParam(value = "t", required = false) String t) {
        Path p = findBgMusicFile();
        if (p == null) {
            throw new BusinessException(404, "文件不存在");
        }
        String ext = extNoDot(p.getFileName().toString());
        String mime = AUDIO_MIME.getOrDefault(ext, "application/octet-stream");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                .body(org.springframework.core.io.UrlResource.from(p.toUri()));
    }

    /**
     * 官网媒体 serve 已移到 MediaServeController（/media/{type}）
     * 原因：本类类级 @RequestMapping("/api/media") 会把方法级 /media/{type} 拼成 /api/media/media/{type}
     */

    private String imageMime(String ext) {
        switch (ext) {
            case "jpg", "jpeg" -> { return "image/jpeg"; }
            case "png" -> { return "image/png"; }
            case "webp" -> { return "image/webp"; }
            case "heic", "heif" -> { return "image/heic"; }
            default -> { return "application/octet-stream"; }
        }
    }

    private String extFromMime(String ct) {
        String m = ct.toLowerCase();
        if (m.contains("webm")) return "webm";
        if (m.contains("mp4")) return "mp4";
        if (m.contains("mpeg") || m.contains("jpg")) return "jpg";
        if (m.contains("png")) return "png";
        if (m.contains("webp")) return "webp";
        if (m.contains("quicktime")) return "mov";
        return null;
    }

    private Map<String, Object> currentBgMusic() {
        Map<String, Object> config = readBgMusicConfig();
        if (config == null) return null;
        Object m = config.get("background_music");
        return m instanceof Map ? (Map<String, Object>) m : null;
    }

    private Path findBgMusicFile() {
        Map<String, Object> music = currentBgMusic();
        if (music != null && music.get("file") != null) {
            Path p = Paths.get(String.valueOf(music.get("file")));
            if (Files.exists(p)) return p;
        }
        for (String e : AUDIO_EXTS) {
            Path p = bgMusicDir.resolve("music." + e);
            if (Files.exists(p)) return p;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readBgMusicConfig() {
        if (!Files.exists(bgMusicConfigPath)) return null;
        try {
            return objectMapper.readValue(bgMusicConfigPath.toFile(), Map.class);
        } catch (IOException e) {
            return null;
        }
    }

    private void writeBgMusicConfig(Map<String, Object> config) {
        try {
            Files.createDirectories(bgMusicConfigPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(bgMusicConfigPath.toFile(), config);
        } catch (IOException e) {
            throw new BusinessException("保存配置失败: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readPageConfig() {
        if (!Files.exists(pageConfigPath)) return null;
        try {
            return objectMapper.readValue(pageConfigPath.toFile(), Map.class);
        } catch (IOException e) {
            return null;
        }
    }

    private void writePageConfig(Map<String, Object> config) {
        try {
            Files.createDirectories(pageConfigPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(pageConfigPath.toFile(), config);
        } catch (IOException e) {
            throw new BusinessException("保存配置失败: " + e.getMessage());
        }
    }

    private long safeSize(Path p) {
        try { return Files.size(p); } catch (IOException e) { return 0; }
    }

    private long safeMtime(Path p) {
        try { return Files.getLastModifiedTime(p).toMillis(); } catch (IOException e) { return 0; }
    }

    private String formatFileSize(long bytes) {
        String[] units = {"B", "KB", "MB", "GB"};
        double b = Math.max(bytes, 0);
        int pow = (int) Math.floor(b == 0 ? 0 : Math.log(b) / Math.log(1024));
        pow = Math.min(pow, units.length - 1);
        b /= Math.pow(1024, pow);
        return String.format("%.2f %s", b, units[pow]);
    }

    @GetMapping("/list")
    public ApiResponse<List<Map<String, String>>> list() {
        List<Map<String, String>> out = new ArrayList<>();
        try {
            if (Files.exists(uploadDir)) {
                try (var stream = Files.list(uploadDir)) {
                    stream.filter(Files::isRegularFile)
                            .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                            .forEach(p -> out.add(Map.of(
                                    "name", p.getFileName().toString(),
                                    "url", "/api/media/files/" + p.getFileName())));
                }
            }
        } catch (IOException e) {
            throw new BusinessException("读取媒体目录失败");
        }
        return ApiResponse.ok(out);
    }

    @PostMapping("/upload")
    public ApiResponse<Map<String, String>> upload(@RequestParam("file") MultipartFile file) {
        return ApiResponse.ok(save(uploadDir, file));
    }

    /** 页面上传：key 如 homepage1/about1/about4/tokyo1..5/join1..3（对齐线上 media_type，支持视频+图片） */
    @PostMapping("/page-image")
    public ApiResponse<Map<String, String>> pageImage(@RequestParam("file") MultipartFile file,
                                                      @RequestParam String key) {
        String orig = file.getOriginalFilename() == null ? key : file.getOriginalFilename();
        String ext = extNoDot(orig);
        boolean isVideo = PAGE_VIDEO_EXTS.contains(ext);
        boolean isImage = PAGE_IMAGE_EXTS.contains(ext);
        if (!isVideo && !isImage) {
            throw new BusinessException("不支持的文件类型！请上传 MP4、WebM、MOV、AVI 视频或 JPG、PNG、WebP 图片。");
        }
        try {
            Files.createDirectories(pageImageDir);
            // 删除该 key 的旧文件（对齐线上：同名替换）
            try (var stream = Files.list(pageImageDir)) {
                stream.filter(p -> p.getFileName().toString().startsWith(key + "."))
                        .forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignored) { } });
            }
            String targetName = key + "." + ext;
            Files.copy(file.getInputStream(), pageImageDir.resolve(targetName), StandardCopyOption.REPLACE_EXISTING);

            // 写入配置：新 key + 旧系统 key（官网 serve 用），指向同一文件
            Map<String, Object> config = readPageConfig();
            if (config == null) config = new LinkedHashMap<>();
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("file", pageImageDir.resolve(targetName).toString().replace("\\", "/"));
            info.put("type", isVideo ? "video" : "image");
            info.put("updated", LocalDateTime.now().format(DT_FMT));
            config.put(key, info);
            String legacy = LEGACY_KEY.get(key);
            if (legacy != null) config.put(legacy, info);
            writePageConfig(config);
            return ApiResponse.ok(Map.of("key", key,
                    "url", "/api/media/page-files/" + targetName + "?t=" + safeMtime(pageImageDir.resolve(targetName)),
                    "type", isVideo ? "video" : "image"));
        } catch (IOException e) {
            throw new BusinessException("上传失败: " + e.getMessage());
        }
    }

    /** 页面图片/视频列表：{ key: {url, type, updated} } */
    @GetMapping("/page-images")
    public ApiResponse<Map<String, Object>> pageImages() {
        Map<String, Object> config = readPageConfig();
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            if (Files.exists(pageImageDir)) {
                try (var stream = Files.list(pageImageDir)) {
                    stream.filter(Files::isRegularFile).forEach(p -> {
                        String name = p.getFileName().toString();
                        int dot = name.lastIndexOf('.');
                        String key = dot > 0 ? name.substring(0, dot) : name;
                        String ext = extNoDot(name);
                        String type = PAGE_VIDEO_EXTS.contains(ext) ? "video" : "image";
                        String updated = null;
                        if (config != null && config.get(key) instanceof Map) {
                            updated = String.valueOf(((Map<?, ?>) config.get(key)).get("updated"));
                        }
                        if (updated == null || "null".equals(updated)) {
                            updated = Instant.ofEpochMilli(safeMtime(p)).atZone(ZoneId.systemDefault()).format(DT_FMT);
                        }
                        Map<String, Object> info = new LinkedHashMap<>();
                        info.put("url", "/api/media/page-files/" + name + "?t=" + safeMtime(p));
                        info.put("type", type);
                        info.put("updated", updated);
                        out.put(key, info);
                    });
                }
            }
        } catch (IOException ignored) { }
        return ApiResponse.ok(out);
    }

    @DeleteMapping("/{name}")
    public ApiResponse<Void> delete(@PathVariable String name) {
        try {
            Files.deleteIfExists(uploadDir.resolve(name));
        } catch (IOException e) {
            throw new BusinessException("删除失败");
        }
        return ApiResponse.ok();
    }

    /** 静态文件访问 */
    @GetMapping(value = "/files/{name}", produces = "application/octet-stream")
    public org.springframework.core.io.Resource file(@PathVariable String name) {
        return load(uploadDir, name);
    }

    @GetMapping(value = "/page-files/{name}")
    public ResponseEntity<org.springframework.core.io.Resource> pageFile(@PathVariable String name) {
        Path p = pageImageDir.resolve(name).normalize();
        if (!p.startsWith(pageImageDir) || !Files.exists(p)) {
            throw new BusinessException(404, "文件不存在");
        }
        String ext = extNoDot(name);
        String mime = PAGE_VIDEO_MIME.get(ext);
        if (mime == null) {
            switch (ext) {
                case "jpg", "jpeg" -> mime = "image/jpeg";
                case "png" -> mime = "image/png";
                case "webp" -> mime = "image/webp";
                case "heic", "heif" -> mime = "image/heic";
                default -> mime = "application/octet-stream";
            }
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                .body(org.springframework.core.io.UrlResource.from(p.toUri()));
    }

    private org.springframework.core.io.Resource load(Path dir, String name) {
        Path p = dir.resolve(name).normalize();
        if (!p.startsWith(dir) || !Files.exists(p)) {
            throw new BusinessException(404, "文件不存在");
        }
        return org.springframework.core.io.UrlResource.from(p.toUri());
    }

    private Map<String, String> save(Path dir, MultipartFile file) {
        return save(dir, file, file.getOriginalFilename());
    }

    private Map<String, String> save(Path dir, MultipartFile file, String name) {
        try {
            Files.createDirectories(dir);
            String safe = Paths.get(name).getFileName().toString();
            Files.copy(file.getInputStream(), dir.resolve(safe), StandardCopyOption.REPLACE_EXISTING);
            String base = dir.equals(pageImageDir) ? "/api/media/page-files/" : "/api/media/files/";
            return Map.of("name", safe, "url", base + safe);
        } catch (IOException e) {
            throw new BusinessException("上传失败: " + e.getMessage());
        }
    }

    private String extOf(String name) {
        if (name == null) return ".bin";
        int i = name.lastIndexOf('.');
        return i < 0 ? ".bin" : name.substring(i);
    }

    /** 无点扩展名（小写），用于音频类型判断 */
    private String extNoDot(String name) {
        String e = extOf(name);
        return e.startsWith(".") ? e.substring(1).toLowerCase() : e.toLowerCase();
    }
}
