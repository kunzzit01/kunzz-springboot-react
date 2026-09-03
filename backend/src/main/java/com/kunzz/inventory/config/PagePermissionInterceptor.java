package com.kunzz.inventory.config;

import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.entity.UserSidebarPermission;
import com.kunzz.inventory.mapper.StaffMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 页面权限拦截器（纵深防御层，2026-09-03）：
 * 桌面前端已有路由守卫（RequirePage），这里再拦【非 GET 写操作】——
 * 防止绕过前端直接调 API 修改无权限模块的数据。
 *
 * 映射：路径前缀 → 侧边栏一级组（user_sidebar_permissions.permissions_json 的值域）：
 *   /api/stock/**  → resource（库存功能区）
 *   /api/kpi/**    → analytics（营收数据）
 *   /api/staff/**  → hr（人事管理）
 *   /api/media/**  → visual（视觉管理）
 *   /api/schedule/** /api/phone/** → brand（集团架构）
 *
 * 放行语义（与前端 /auth/me/permissions 一致）：
 *   - user_sidebar_permissions 无记录 = 从未配置 → 全放行
 *   - account_type = special（老板）→ 全放行
 *   - 手机端 /api/mobile/** 不在此拦（已有 assertBranch 专属双层校验，避免双体系冲突）
 *   - GET 不拦（浏览由前端路由守卫负责，后续可按需收紧）
 */
@Component
public class PagePermissionInterceptor implements HandlerInterceptor {

    private final StaffMapper staffMapper;

    public PagePermissionInterceptor(StaffMapper staffMapper) {
        this.staffMapper = staffMapper;
    }

    private static final Map<String, String> PREFIX_SECTION = new LinkedHashMap<>(Map.of(
            "/api/stock/", "resource",
            "/api/kpi/", "analytics",
            "/api/staff/", "hr",
            "/api/media/", "visual",
            "/api/schedule/", "brand",
            "/api/phone/", "brand"
    ));

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String method = request.getMethod();
        if ("GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method) || "OPTIONS".equalsIgnoreCase(method)) {
            return true;
        }
        String path = request.getRequestURI();
        String section = null;
        for (var e : PREFIX_SECTION.entrySet()) {
            if (path.startsWith(e.getKey())) { section = e.getValue(); break; }
        }
        System.out.println("[PagePerm] " + method + " " + path + " → section=" + section
                + " principal=" + (request.getUserPrincipal() == null ? "null" : request.getUserPrincipal().getClass().getSimpleName()));
        if (section == null) return true; // 不在映射内的写接口（auth/官网公开提交等）不受页面权限管

        // principal 兼容两种形态：User 实体 / UsernamePasswordAuthenticationToken（其 principal 为 User）
        Object prin = request.getUserPrincipal();
        User u = null;
        if (prin instanceof User usr) u = usr;
        else if (prin instanceof org.springframework.security.core.Authentication a && a.getPrincipal() instanceof User usr2) u = usr2;
        if (u == null) return true; // 未知形态交由 Spring Security

        if ("special".equalsIgnoreCase(String.valueOf(u.getAccountType()))) return true; // 老板恒放行

        UserSidebarPermission p = staffMapper.findSidebarPerm(u.getId());
        if (p == null) return true; // 从未配置权限 → 全放行（对齐前端语义）

        String json = p.getPermissionsJson();
        if (json == null || json.isBlank()) return true;
        // 解析 ["brand","hr",...]，检查 section 是否在一级组内
        List<String> sections = java.util.Arrays.stream(json.replace("[", "").replace("]", "").replace("\"", "").split(","))
                .map(String::trim).filter(x -> !x.isEmpty()).toList();
        if (sections.contains(section)) return true;

        response.setStatus(403);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":403,\"message\":\"无权限执行此操作（页面权限已关闭）\",\"data\":null}");
        return false;
    }
}
