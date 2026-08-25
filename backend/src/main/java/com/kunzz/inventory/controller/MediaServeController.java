package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 官网媒体 serve（对齐线上 serve_media.php）
 * GET /media/{type} 公开访问：本地有则返回本地；本地没有则从线上拉取并缓存（后台立即可见、官网上传后立即生效）
 * 注意：独立 Controller（无类级前缀），避免与方法级 /media/{type} 拼接
 */
@RestController
public class MediaServeController {

    /** 官网可消费的媒体类型（对齐线上 serve_media.php 白名单） */
    private static final List<String> SERVE_TYPES = List.of("home_background", "about_background", "joinus_background", "tokyo_background");
    private static final String REMOTE_MEDIA_BASE = "https://www.kunzzgroup.com/media/";

    /** 新旧 key 映射：后台页面 key -> 旧系统媒体 key（官网 serve 用，对齐 media_config.json） */
    private static final Map<String, String> LEGACY_KEY = Map.of(
            "homepage1", "home_background",
            "about1", "about_background",
            "join1", "joinus_background");

    private static final List<String> PAGE_VIDEO_EXTS = List.of("mp4", "webm", "mov", "avi");
    private static final Map<String, String> PAGE_VIDEO_MIME = Map.of(
            "mp4", "video/mp4", "webm", "video/webm", "mov", "video/quicktime", "avi", "video/x-msvideo");
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path pageImageDir = Paths.get("data", "page-images").toAbsolutePath().normalize();
    private final Path pageConfigPath = Paths.get("data", "page_config.json").toAbsolutePath().normalize();

    @GetMapping("/media/{type}")
    public ResponseEntity<org.springframework.core.io.Resource> serveMedia(@PathVariable String type) {
        if (!SERVE_TYPES.contains(type)) {
            throw new BusinessException(404, "类型不支持");
        }
        Path p = findLocalMedia(type);
        if (p == null) {
            p = fetchRemoteMedia(type);
        }
        if (p == null) {
            throw new BusinessException(404, "文件不存在");
        }
        String ext = extNoDot(p.getFileName().toString());
        String mime = PAGE_VIDEO_MIME.getOrDefault(ext, imageMime(ext));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                .body(org.springframework.core.io.UrlResource.from(p.toUri()));
    }

    /** 本地查找：旧 key 配置 -> 新 key 配置 -> 目录扫描（webm/mp4 互换） */
    private Path findLocalMedia(String legacyType) {
        Map<String, Object> config = readPageConfig();
        if (config != null) {
            for (String k : List.of(legacyType, reverseLegacy(legacyType))) {
                Object o = config.get(k);
                if (o instanceof Map) {
                    Object file = ((Map<?, ?>) o).get("file");
                    if (file != null) {
                        Path p = Paths.get(String.valueOf(file));
                        if (Files.exists(p)) return p;
                    }
                }
            }
        }
        String base = reverseLegacy(legacyType);
        if (base != null && Files.exists(pageImageDir)) {
            for (String ext : List.of("webm", "mp4", "jpg", "png", "webp")) {
                Path p = pageImageDir.resolve(base + "." + ext);
                if (Files.exists(p)) return p;
            }
        }
        return null;
    }

    /** 从线上拉取并缓存到本地（对齐官网现有媒体） */
    private Path fetchRemoteMedia(String legacyType) {
        try {
            HttpClient client = HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(REMOTE_MEDIA_BASE + legacyType))
                    .timeout(Duration.ofSeconds(30))
                    .header("User-Agent", "Mozilla/5.0")
                    .GET().build();
            HttpResponse<byte[]> resp = client.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() != 200 || resp.body().length == 0) return null;
            String ct = resp.headers().firstValue("Content-Type").orElse("");
            String ext = extFromMime(ct);
            if (ext == null) return null;
            String newKey = reverseLegacy(legacyType);
            String name = (newKey != null ? newKey : legacyType) + "." + ext;
            Files.createDirectories(pageImageDir);
            Path saved = pageImageDir.resolve(name);
            Files.write(saved, resp.body());
            // 写配置（新 key + 旧 key），后台页面立即可见
            Map<String, Object> config = readPageConfig();
            if (config == null) config = new LinkedHashMap<>();
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("file", saved.toString().replace("\\", "/"));
            info.put("type", PAGE_VIDEO_EXTS.contains(ext) ? "video" : "image");
            info.put("updated", LocalDateTime.now().format(DT_FMT));
            if (newKey != null) config.put(newKey, info);
            config.put(legacyType, info);
            writePageConfig(config);
            return saved;
        } catch (Exception e) {
            return null;
        }
    }

    private String reverseLegacy(String legacyType) {
        for (Map.Entry<String, String> e : LEGACY_KEY.entrySet()) {
            if (e.getValue().equals(legacyType)) return e.getKey();
        }
        return null;
    }

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
        if (m.contains("jpeg") || m.contains("jpg")) return "jpg";
        if (m.contains("png")) return "png";
        if (m.contains("webp")) return "webp";
        if (m.contains("webm")) return "webm";
        if (m.contains("mp4")) return "mp4";
        if (m.contains("quicktime")) return "mov";
        return null;
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

    private String extOf(String name) {
        if (name == null) return ".bin";
        int i = name.lastIndexOf('.');
        return i < 0 ? ".bin" : name.substring(i);
    }

    private String extNoDot(String name) {
        String e = extOf(name);
        return e.startsWith(".") ? e.substring(1).toLowerCase() : e.toLowerCase();
    }
}
