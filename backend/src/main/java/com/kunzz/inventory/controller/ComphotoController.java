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
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 我们的足迹照片管理，对齐线上 joinpage2upload.php + api/comphotos_api.php
 * 30 个照片位（comphoto_1..30），配置存 data/media_config.json，文件存 data/comphotos/
 */
@RestController
public class ComphotoController {

    private static final int MAX_PHOTOS = 30;
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final List<String> IMAGE_EXTS = List.of("jpg", "jpeg", "png", "webp", "heic", "heif");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path dataDir = Paths.get("data").toAbsolutePath().normalize();
    private final Path comphotoDir = Paths.get("data", "comphotos").toAbsolutePath().normalize();
    private final Path configPath = dataDir.resolve("media_config.json");

    // ---------- 公开 API（对齐线上 comphotos_api.php，官网消费） ----------

    @GetMapping("/api/comphotos_api.php")
    public Map<String, Object> comphotosApi() {
        List<String> photos = new ArrayList<>();
        Map<String, Object> config = readConfig();
        if (config != null) {
            for (int i = 1; i <= MAX_PHOTOS; i++) {
                Object o = config.get("comphoto_" + i);
                if (o instanceof Map) {
                    Object file = ((Map<?, ?>) o).get("file");
                    if (file != null) {
                        Path p = Paths.get(String.valueOf(file));
                        if (Files.exists(p)) {
                            photos.add("/api/comphotos-files/" + p.getFileName() + "?t=" + safeMtime(p));
                        }
                    }
                }
            }
        }
        // 兜底：扫描目录补齐到 30 张
        if (photos.size() < MAX_PHOTOS && Files.exists(comphotoDir)) {
            try (var stream = Files.list(comphotoDir)) {
                List<Path> files = stream.filter(Files::isRegularFile)
                        .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                        .toList();
                for (Path p : files) {
                    if (photos.size() >= MAX_PHOTOS) break;
                    String url = "/api/comphotos-files/" + p.getFileName() + "?t=" + safeMtime(p);
                    if (!photos.contains(url)) photos.add(url);
                }
            } catch (IOException ignored) { }
        }
        if (photos.size() > MAX_PHOTOS) photos = photos.subList(0, MAX_PHOTOS);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("photos", photos);
        return out;
    }

    // ---------- 管理端 ----------

    /** 30 格状态列表 */
    @GetMapping("/api/comphotos")
    public ApiResponse<Map<String, Object>> list() {
        Map<String, Object> config = readConfig();
        List<Map<String, Object>> photos = new ArrayList<>();
        int uploaded = 0;
        for (int i = 1; i <= MAX_PHOTOS; i++) {
            Map<String, Object> slot = new LinkedHashMap<>();
            slot.put("number", i);
            Map<String, Object> entry = config == null ? null : entry(config, i);
            if (entry != null) {
                Object file = entry.get("file");
                if (file != null && Files.exists(Paths.get(String.valueOf(file)))) {
                    Path p = Paths.get(String.valueOf(file));
                    slot.put("exists", true);
                    slot.put("url", "/api/comphotos-files/" + p.getFileName() + "?t=" + safeMtime(p));
                    slot.put("updated", String.valueOf(entry.getOrDefault("updated", "")));
                    uploaded++;
                } else {
                    slot.put("exists", false);
                }
            } else {
                slot.put("exists", false);
            }
            photos.add(slot);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", MAX_PHOTOS);
        out.put("uploaded", uploaded);
        out.put("pending", MAX_PHOTOS - uploaded);
        out.put("photos", photos);
        return ApiResponse.ok(out);
    }

    /** 上传/更新某格照片 */
    @PostMapping("/api/comphotos/{number}")
    public ApiResponse<Map<String, Object>> upload(@PathVariable int number,
                                                   @RequestParam("file") MultipartFile file) {
        if (number < 1 || number > MAX_PHOTOS) throw new BusinessException("照片编号必须在 1-30 之间");
        String ext = extNoDot(file.getOriginalFilename());
        if (!IMAGE_EXTS.contains(ext)) {
            throw new BusinessException("只支持图片格式（JPG, PNG, WebP）！");
        }
        if (file.getSize() > 10L * 1024 * 1024) {
            throw new BusinessException("文件大小超过10MB限制！");
        }
        try {
            Files.createDirectories(comphotoDir);
            // 删除旧照片
            Map<String, Object> config = readConfig();
            if (config != null) {
                Map<String, Object> old = entry(config, number);
                if (old != null && old.get("file") != null) {
                    Files.deleteIfExists(Paths.get(String.valueOf(old.get("file"))));
                }
            }
            String name = number + "." + ext;
            Path saved = comphotoDir.resolve(name);
            Files.copy(file.getInputStream(), saved, StandardCopyOption.REPLACE_EXISTING);
            if (config == null) config = new LinkedHashMap<>();
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("file", saved.toString().replace("\\", "/"));
            info.put("url", "/api/comphotos-files/" + name);
            info.put("type", "image");
            info.put("updated", LocalDateTime.now().format(DT_FMT));
            config.put("comphoto_" + number, info);
            writeConfig(config);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("number", number);
            out.put("exists", true);
            out.put("url", info.get("url") + "?t=" + safeMtime(saved));
            out.put("updated", info.get("updated"));
            return ApiResponse.ok(out);
        } catch (IOException e) {
            throw new BusinessException("照片上传失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/api/comphotos/{number}")
    public ApiResponse<Void> delete(@PathVariable int number) {
        if (number < 1 || number > MAX_PHOTOS) throw new BusinessException("照片编号必须在 1-30 之间");
        Map<String, Object> config = readConfig();
        if (config != null) {
            Map<String, Object> old = entry(config, number);
            if (old != null && old.get("file") != null) {
                try {
                    Files.deleteIfExists(Paths.get(String.valueOf(old.get("file"))));
                } catch (IOException ignored) { }
            }
            config.remove("comphoto_" + number);
            writeConfig(config);
        }
        return ApiResponse.ok();
    }

    /** 公开文件访问 */
    @GetMapping("/api/comphotos-files/{name}")
    public ResponseEntity<org.springframework.core.io.Resource> file(@PathVariable String name) {
        Path p = comphotoDir.resolve(name).normalize();
        if (!p.startsWith(comphotoDir) || !Files.exists(p)) {
            throw new BusinessException(404, "文件不存在");
        }
        String mime = imageMime(extNoDot(name));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                .body(org.springframework.core.io.UrlResource.from(p.toUri()));
    }

    // ---------- 内部 ----------

    @SuppressWarnings("unchecked")
    private Map<String, Object> entry(Map<String, Object> config, int number) {
        Object o = config.get("comphoto_" + number);
        return o instanceof Map ? (Map<String, Object>) o : null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readConfig() {
        if (!Files.exists(configPath)) return null;
        try {
            return objectMapper.readValue(configPath.toFile(), Map.class);
        } catch (IOException e) {
            return null;
        }
    }

    private void writeConfig(Map<String, Object> config) {
        try {
            Files.createDirectories(dataDir);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(configPath.toFile(), config);
        } catch (IOException e) {
            throw new BusinessException("保存配置失败: " + e.getMessage());
        }
    }

    private long safeMtime(Path p) {
        try { return Files.getLastModifiedTime(p).toMillis(); } catch (IOException e) { return 0; }
    }

    private String extNoDot(String name) {
        if (name == null) return "bin";
        int i = name.lastIndexOf('.');
        return i < 0 ? "bin" : name.substring(i + 1).toLowerCase();
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
