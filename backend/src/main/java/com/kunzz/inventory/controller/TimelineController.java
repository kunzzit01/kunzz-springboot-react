package com.kunzz.inventory.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.common.BusinessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 发展历史（Timeline）管理，对齐线上 aboutpage4upload.php + api/timeline_api.php
 * 数据存 data/timeline_config.json（zh）/ timeline_config_en.json（en）
 * 首次无本地数据时从线上拉取（含图片缓存到本地）
 */
@RestController
public class TimelineController {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String REMOTE_API = "https://www.kunzzgroup.com/api/timeline_api.php";
    private static final String REMOTE_IMG_BASE = "https://www.kunzzgroup.com/";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path dataDir = Paths.get("data").toAbsolutePath().normalize();
    private final Path timelineDir = Paths.get("data", "timeline").toAbsolutePath().normalize();

    private Path configFile(String lang) {
        return dataDir.resolve("en".equals(lang) ? "timeline_config_en.json" : "timeline_config.json");
    }

    // ---------- 公开 API（对齐线上 timeline_api.php，官网消费） ----------

    @GetMapping("/api/timeline_api.php")
    public Map<String, Object> timelineApi(@RequestParam(defaultValue = "zh") String lang) {
        List<Map<String, Object>> items = loadItems("en".equals(lang) ? "en" : "zh");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        return out;
    }

    // ---------- 管理端 ----------

    @GetMapping("/api/timeline")
    public ApiResponse<Map<String, Object>> list(@RequestParam(defaultValue = "zh") String lang) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("lang", "en".equals(lang) ? "en" : "zh");
        out.put("items", loadItems("en".equals(lang) ? "en" : "zh"));
        return ApiResponse.ok(out);
    }

    /** 新增记录（年份 + 月份，创建空条目） */
    @PostMapping("/api/timeline")
    public ApiResponse<Map<String, Object>> add(@RequestParam(defaultValue = "zh") String lang,
                                                @RequestParam int year,
                                                @RequestParam int month) {
        String l = "en".equals(lang) ? "en" : "zh";
        List<Map<String, Object>> items = loadItems(l);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", "rec_" + System.currentTimeMillis() + "_" + (1000 + new Random().nextInt(9000)));
        item.put("year", String.valueOf(year));
        item.put("month", month);
        item.put("title", "");
        item.put("description1", "");
        item.put("description2", "");
        item.put("image", "");
        item.put("image_url", "");
        item.put("created", LocalDateTime.now().format(DT_FMT));
        item.put("updated", LocalDateTime.now().format(DT_FMT));
        items.add(item);
        saveItems(l, items);
        return ApiResponse.ok(item);
    }

    /** 更新条目内容（标题/描述/月份） */
    @PutMapping("/api/timeline/{id}")
    public ApiResponse<Map<String, Object>> update(@PathVariable String id,
                                                   @RequestParam(defaultValue = "zh") String lang,
                                                   @RequestParam(required = false) String title,
                                                   @RequestParam(required = false) String description1,
                                                   @RequestParam(required = false) String description2,
                                                   @RequestParam(required = false) Integer month) {
        String l = "en".equals(lang) ? "en" : "zh";
        List<Map<String, Object>> items = loadItems(l);
        for (Map<String, Object> it : items) {
            if (Objects.equals(String.valueOf(it.get("id")), id)) {
                if (title != null) it.put("title", title);
                if (description1 != null) it.put("description1", description1);
                if (description2 != null) it.put("description2", description2);
                if (month != null) it.put("month", month);
                it.put("updated", LocalDateTime.now().format(DT_FMT));
                saveItems(l, items);
                return ApiResponse.ok(it);
            }
        }
        throw new BusinessException(404, "记录不存在");
    }

    /** 条目照片上传 */
    @PostMapping("/api/timeline/{id}/photo")
    public ApiResponse<Map<String, Object>> uploadPhoto(@PathVariable String id,
                                                        @RequestParam(defaultValue = "zh") String lang,
                                                        @RequestParam("file") MultipartFile file) {
        String l = "en".equals(lang) ? "en" : "zh";
        List<Map<String, Object>> items = loadItems(l);
        for (Map<String, Object> it : items) {
            if (Objects.equals(String.valueOf(it.get("id")), id)) {
                String ext = extNoDot(file.getOriginalFilename());
                if (!List.of("jpg", "jpeg", "png", "webp", "heic", "heif").contains(ext)) {
                    throw new BusinessException("只支持图片格式（JPG, PNG, WebP）！");
                }
                if (file.getSize() > 10L * 1024 * 1024) {
                    throw new BusinessException("文件大小超过10MB限制！");
                }
                try {
                    Files.createDirectories(timelineDir);
                    // 删除旧图片
                    String old = String.valueOf(it.getOrDefault("image", ""));
                    if (!old.isEmpty()) {
                        Path oldP = timelineDir.resolve(Paths.get(old).getFileName());
                        Files.deleteIfExists(oldP);
                    }
                    String name = "timeline_" + id + "_发展." + ext;
                    Files.copy(file.getInputStream(), timelineDir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
                    it.put("image", "timeline/" + name);
                    it.put("image_url", "/api/timeline-files/" + name);
                    it.put("updated", LocalDateTime.now().format(DT_FMT));
                    saveItems(l, items);
                    return ApiResponse.ok(it);
                } catch (IOException e) {
                    throw new BusinessException("照片上传失败: " + e.getMessage());
                }
            }
        }
        throw new BusinessException(404, "记录不存在");
    }

    @DeleteMapping("/api/timeline/{id}")
    public ApiResponse<Void> delete(@PathVariable String id, @RequestParam(defaultValue = "zh") String lang) {
        String l = "en".equals(lang) ? "en" : "zh";
        List<Map<String, Object>> items = loadItems(l);
        boolean removed = items.removeIf(it -> Objects.equals(String.valueOf(it.get("id")), id));
        if (!removed) throw new BusinessException(404, "记录不存在");
        saveItems(l, items);
        return ApiResponse.ok();
    }

    /** 公开文件访问 */
    @GetMapping("/api/timeline-files/{name}")
    public ResponseEntity<org.springframework.core.io.Resource> file(@PathVariable String name) {
        Path p = timelineDir.resolve(name).normalize();
        if (!p.startsWith(timelineDir) || !Files.exists(p)) {
            throw new BusinessException(404, "文件不存在");
        }
        String mime = imageMime(extNoDot(name));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                .body(org.springframework.core.io.UrlResource.from(p.toUri()));
    }

    // ---------- 内部 ----------

    /** 读配置；本地空则从线上拉取（含图片缓存） */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> loadItems(String lang) {
        Path f = configFile(lang);
        if (!Files.exists(f)) {
            fetchRemote(lang);
        }
        if (!Files.exists(f)) return new ArrayList<>();
        try {
            Object raw = objectMapper.readValue(f.toFile(), Object.class);
            List<Map<String, Object>> items = new ArrayList<>();
            if (raw instanceof List) {
                for (Object o : (List<?>) raw) {
                    if (o instanceof Map) items.add((Map<String, Object>) o);
                }
            } else if (raw instanceof Map) {
                // 按年份分组 -> 扁平化
                for (Object v : ((Map<?, ?>) raw).values()) {
                    if (v instanceof List) {
                        for (Object o : (List<?>) v) {
                            if (o instanceof Map) items.add((Map<String, Object>) o);
                        }
                    } else if (v instanceof Map) {
                        items.add((Map<String, Object>) v);
                    }
                }
            }
            items.sort(Comparator.comparing((Map<String, Object> it) -> String.valueOf(it.getOrDefault("year", "0"))));
            return items;
        } catch (IOException e) {
            return new ArrayList<>();
        }
    }

    private void saveItems(String lang, List<Map<String, Object>> items) {
        try {
            Files.createDirectories(dataDir);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(configFile(lang).toFile(), items);
        } catch (IOException e) {
            throw new BusinessException("保存失败: " + e.getMessage());
        }
    }

    /** 从线上拉取 timeline 数据（JSON + 图片缓存到本地） */
    private void fetchRemote(String lang) {
        try {
            HttpClient client = HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(REMOTE_API + "?lang=" + lang))
                    .timeout(Duration.ofSeconds(30))
                    .header("User-Agent", "Mozilla/5.0")
                    .GET().build();
            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) return;
            Map<String, Object> body = objectMapper.readValue(resp.body(), Map.class);
            Object itemsObj = body.get("items");
            if (!(itemsObj instanceof List)) return;
            List<Map<String, Object>> items = new ArrayList<>();
            for (Object o : (List<?>) itemsObj) {
                if (!(o instanceof Map)) continue;
                @SuppressWarnings("unchecked")
                Map<String, Object> it = new LinkedHashMap<>((Map<String, Object>) o);
                // 图片字段：线上是 images/images/xxx，拉取到本地缓存
                String img = String.valueOf(it.getOrDefault("image", "")).replace("\\/", "/");
                if (!img.isEmpty() && !img.startsWith("http")) {
                    String base = img.replaceFirst("^.*?([^/]+)$", "$1");
                    String remoteUrl = REMOTE_IMG_BASE + img;
                    Path cached = downloadFile(client, remoteUrl, base);
                    if (cached != null) {
                        it.put("image", "timeline/" + cached.getFileName());
                        it.put("image_url", "/api/timeline-files/" + cached.getFileName());
                    }
                }
                if (!it.containsKey("id") || it.get("id") == null) {
                    it.put("id", "rec_" + System.currentTimeMillis() + "_" + new Random().nextInt(90000));
                }
                items.add(it);
            }
            saveItems(lang, items);
        } catch (Exception ignored) { }
    }

    private Path downloadFile(HttpClient client, String url, String name) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("User-Agent", "Mozilla/5.0")
                .GET().build();
        HttpResponse<byte[]> resp = client.send(req, HttpResponse.BodyHandlers.ofByteArray());
        if (resp.statusCode() != 200 || resp.body().length == 0) return null;
        Files.createDirectories(timelineDir);
        String safe = Paths.get(name).getFileName().toString();
        Path p = timelineDir.resolve(safe);
        Files.write(p, resp.body());
        return p;
    }

    private String extNoDot(String name) {
        if (name == null) return "bin";
        int i = name.lastIndexOf('.');
        String e = i < 0 ? "bin" : name.substring(i + 1);
        return e.toLowerCase();
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
}
