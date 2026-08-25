package com.kunzz.inventory.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * 静态资源映射：
 *  /uploads/** → backend/uploads/（碗碟照片等）
 *  /**        → backend/static/（前端构建产物，免 Node 部署）
 *
 * SPA 回退：static/ 下找不到的文件一律回退到 index.html（交给 React 路由），
 * 但 /api、/uploads 不参与回退（返回 404）。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private static final String UPLOAD_DIR = "uploads/";

    @Value("${app.static-dir:static/}")
    private String staticDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String cwd = System.getProperty("user.dir");
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:" + cwd + "/" + UPLOAD_DIR);
        registry.addResourceHandler("/**")
                .addResourceLocations("file:" + cwd + "/" + staticDir)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        // API 与上传文件不走 SPA 回退
                        if (resourcePath.startsWith("api/") || resourcePath.startsWith("uploads/")) {
                            return null;
                        }
                        Resource requested = location.createRelative(resourcePath);
                        if (requested.exists() && requested.isReadable() && requested.isFile()) {
                            return requested;
                        }
                        // /home 及 /home/** → 官网 SPA 回退到 home/index.html；其余 → 后台 index.html
                        String fallback = (resourcePath.equals("home") || resourcePath.startsWith("home/"))
                                ? "home/index.html" : "index.html";
                        Resource index = location.createRelative(fallback);
                        return index.exists() ? index : null;
                    }
                });
    }
}
