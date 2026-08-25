package com.kunzz.inventory.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.mapper.StaffMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 职员管理 + 注册码 + 权限（对应老系统 generatecode / add_employee / edit_profile）
 * 数据访问：MyBatis Mapper（显式 SQL）
 */
@Service
@RequiredArgsConstructor
public class StaffService {

    private final StaffMapper staffMapper;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final ObjectMapper objectMapper;

    // ---------- 职员 ----------

    @Transactional(readOnly = true)
    public List<User> listUsers(String keyword) {
        List<User> list = staffMapper.listUsers(keyword);
        list.sort(Comparator.comparing(User::getId));
        return list;
    }

    /**
     * 创建职员（对齐线上 generatecodeapi add_user 完整流程）：
     * 邮箱唯一校验 → 生成6位申请码(application_codes used=1) → 后端生成10位强密码 →
     * is_first_login=1 → 保存初始权限(user_sidebar_permissions + user_page_permissions)
     */
    @Transactional
    public Map<String, Object> createUser(User u, String rawPassword, Map<String, Object> perms) {
        if (staffMapper.findUserByUsername(u.getUsername()) != null) {
            throw new BusinessException("用户名已存在");
        }
        // 邮箱唯一性校验（对齐线上 add_user）
        if (u.getEmail() != null && !u.getEmail().isBlank()
                && staffMapper.findUserByEmail(u.getEmail()) != null) {
            throw new BusinessException("该邮箱已被注册");
        }
        // 密码：未传则由后端生成10位强密码（大小写+数字+符号，对齐线上 generateRandomPassword）
        String password = (rawPassword == null || rawPassword.isBlank())
                ? generateStrongPassword() : rawPassword;
        u.setPassword(passwordEncoder.encode(password));

        // 生成6位唯一申请码并写入 application_codes（used=1），用户登记 registration_code
        String codeStr = randomUniqueCode();
        ApplicationCode code = new ApplicationCode();
        code.setCode(codeStr);
        code.setAccountType(u.getAccountType());
        code.setUsed(true);
        staffMapper.insertCode(code);
        u.setRegistrationCode(codeStr);

        u.setIsFirstLogin(true); // 对齐线上 is_first_login=1
        normalizeGender(u);
        if (u.getCreatedAt() == null) u.setCreatedAt(LocalDateTime.now());
        staffMapper.insertUser(u);

        // 保存初始权限（对齐线上 add_user：user_sidebar_permissions + user_page_permissions）
        if (perms != null && !perms.isEmpty()) {
            savePermissions(u.getId(), perms);
        }

        // 欢迎邮件：新成员邮箱非空时通过 SMTP 发送临时密码（对齐旧系统 sendWelcomeEmail）；
        // 发送失败或未填邮箱 → emailSent=false，前端提示 admin 手动告知申请码+临时密码
        boolean emailSent = false;
        if (u.getEmail() != null && !u.getEmail().isBlank()) {
            emailSent = mailService.sendWelcomeEmail(u.getEmail(), u.getUsername(), password, u.getAccountType());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("user", staffMapper.findUserById(u.getId()));
        result.put("code", codeStr);
        result.put("defaultPassword", password);
        result.put("emailSent", emailSent);
        return result;
    }

    /** 生成10位强密码（至少1大写+1小写+1数字+1符号，对齐线上 generateRandomPassword） */
    private String generateStrongPassword() {
        String upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        String lower = "abcdefghijklmnopqrstuvwxyz";
        String digits = "0123456789";
        String symbols = "!@#$%&*";
        StringBuilder sb = new StringBuilder();
        sb.append(upper.charAt(ThreadLocalRandom.current().nextInt(upper.length())));
        sb.append(lower.charAt(ThreadLocalRandom.current().nextInt(lower.length())));
        sb.append(digits.charAt(ThreadLocalRandom.current().nextInt(digits.length())));
        sb.append(symbols.charAt(ThreadLocalRandom.current().nextInt(symbols.length())));
        String all = upper + lower + digits + symbols;
        for (int i = 4; i < 10; i++) {
            sb.append(all.charAt(ThreadLocalRandom.current().nextInt(all.length())));
        }
        // 打乱顺序
        char[] arr = sb.toString().toCharArray();
        for (int i = arr.length - 1; i > 0; i--) {
            int j = ThreadLocalRandom.current().nextInt(i + 1);
            char t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return new String(arr);
    }

    /** 生成6位唯一申请码（最多尝试100次，对齐线上 generateRandomCode） */
    private String randomUniqueCode() {
        for (int attempt = 0; attempt < 100; attempt++) {
            String c = randomCode();
            boolean exists = staffMapper.listCodes().stream()
                    .anyMatch(ac -> c.equals(ac.getCode()));
            if (!exists) return c;
        }
        throw new BusinessException("无法生成唯一的申请码，请稍后重试");
    }

    @Transactional
    public User updateUser(Integer id, User patch, String newPassword) {
        User u = staffMapper.findUserById(id);
        if (u == null) throw new BusinessException(404, "职员不存在");
        // 邮箱唯一性校验（对齐线上 updateCodeAndUser：排除自己）
        if (patch.getEmail() != null && !patch.getEmail().isBlank()) {
            User dup = staffMapper.findUserByEmail(patch.getEmail());
            if (dup != null && !dup.getId().equals(id)) {
                throw new BusinessException("邮箱已被其他用户使用");
            }
        }
        if (patch.getUsername() != null) u.setUsername(patch.getUsername());
        if (patch.getUsernameCn() != null) u.setUsernameCn(patch.getUsernameCn());
        if (patch.getNickname() != null) u.setNickname(patch.getNickname());
        if (patch.getEmail() != null) u.setEmail(patch.getEmail());
        if (patch.getAccountType() != null) u.setAccountType(patch.getAccountType());
        if (patch.getPosition() != null) u.setPosition(patch.getPosition());
        if (patch.getPhoneNumber() != null) u.setPhoneNumber(patch.getPhoneNumber());
        if (patch.getBranch() != null) u.setBranch(patch.getBranch());
        if (patch.getIcNumber() != null) u.setIcNumber(patch.getIcNumber());
        if (patch.getBankName() != null) u.setBankName(patch.getBankName());
        if (patch.getBankAccount() != null) u.setBankAccount(patch.getBankAccount());
        if (patch.getHomeAddress() != null) u.setHomeAddress(patch.getHomeAddress());
        if (patch.getCurrentAddress() != null) u.setCurrentAddress(patch.getCurrentAddress());
        if (patch.getCity() != null) u.setCity(patch.getCity());
        if (patch.getState() != null) u.setState(patch.getState());
        if (patch.getPostcode() != null) u.setPostcode(patch.getPostcode());
        if (patch.getDateOfBirth() != null) u.setDateOfBirth(patch.getDateOfBirth());
        if (patch.getGender() != null) {
            String g = patch.getGender().trim().toLowerCase();
            if (g.equals("male") || g.equals("female") || g.equals("other")) {
                u.setGender(g);
            } else {
                // 空串/非法值 → 显式清空为 NULL（enum 不接受 ''，且动态 UPDATE 会跳过 null）
                u.setGender(null);
                staffMapper.clearGender(id);
            }
        }
        if (patch.getNationality() != null) u.setNationality(patch.getNationality());
        if (patch.getRace() != null) u.setRace(patch.getRace());
        if (patch.getEmergencyContactName() != null) u.setEmergencyContactName(patch.getEmergencyContactName());
        if (patch.getEmergencyPhoneNumber() != null) u.setEmergencyPhoneNumber(patch.getEmergencyPhoneNumber());
        if (patch.getBankAccountHolderEn() != null) u.setBankAccountHolderEn(patch.getBankAccountHolderEn());
        if (newPassword != null && !newPassword.isBlank()) {
            u.setPassword(passwordEncoder.encode(newPassword));
        }
        staffMapper.updateUser(u);
        return staffMapper.findUserById(id);
    }

    /** 性别规范化：空串/大小写/非法值 → NULL（enum('male','female','other') 严格模式不接受 ''） */
    private void normalizeGender(User u) {
        if (u.getGender() == null) return;
        String g = u.getGender().trim().toLowerCase();
        u.setGender((g.equals("male") || g.equals("female") || g.equals("other")) ? g : null);
    }

    @Transactional
    public void deleteUser(Integer id) {
        if (staffMapper.findUserById(id) == null) {
            throw new BusinessException(404, "职员不存在");
        }
        staffMapper.deleteUser(id);
    }

    // ---------- 注册码 ----------

    @Transactional(readOnly = true)
    public List<ApplicationCode> listCodes() {
        return staffMapper.listCodes();
    }

    @Transactional
    public List<ApplicationCode> generateCodes(String accountType, int count) {
        List<ApplicationCode> out = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            ApplicationCode c = new ApplicationCode();
            c.setCode(randomCode());
            c.setAccountType(accountType);
            c.setUsed(false);
            staffMapper.insertCode(c);
            out.add(c);
        }
        return out;
    }

    @Transactional
    public void deleteCode(Integer id) {
        staffMapper.deleteCode(id);
    }

    private String randomCode() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            sb.append(chars.charAt(ThreadLocalRandom.current().nextInt(chars.length())));
        }
        return sb.toString();
    }

    // ---------- 权限 ----------

    /** 当前用户权限视图（驱动前端侧边栏；sections/submenu/brand/pages 旧格式） */
    @Transactional(readOnly = true)
    public Map<String, Object> myPermissions(Integer userId) {
        Map<String, Object> result = new LinkedHashMap<>();
        UserSidebarPermission p = staffMapper.findSidebarPerm(userId);
        if (p != null) {
            putJson(result, "sections", p.getPermissionsJson(), List.of("brand", "analytics", "hr", "resource", "visual"));
            putJson(result, "submenu", p.getSubmenuPermissionsJson(), defaultSubmenu());
            putJson(result, "brand", p.getBrandPermissionsJson(), defaultBrand());
            putJson(result, "pages", p.getPagePermissionsJson(), Map.of());
        } else {
            result.put("sections", List.of("brand", "analytics", "hr", "resource", "visual"));
            result.put("submenu", defaultSubmenu());
            result.put("brand", defaultBrand());
            result.put("pages", Map.of());
        }
        return result;
    }

    /** 用户权限（线上 generatecode 格式，供权限设定模态框回填） */
    @Transactional(readOnly = true)
    public Map<String, Object> getPermissions(Integer userId) {
        Map<String, Object> result = new LinkedHashMap<>();
        UserSidebarPermission p = staffMapper.findSidebarPerm(userId);
        if (p != null) {
            putJson(result, "permissions", p.getPermissionsJson(), List.of("brand", "analytics", "hr", "resource", "visual"));
            putJson(result, "submenu_permissions", p.getSubmenuPermissionsJson(), defaultSubmenu());
            putJson(result, "brand_permissions", p.getBrandPermissionsJson(), defaultBrand());
            putJson(result, "page_permissions", p.getPagePermissionsJson(), Map.of());
            putJson(result, "report_permissions", p.getReportPermissionsJson(), List.of());
            putJson(result, "restaurant_permissions", p.getRestaurantPermissionsJson(), List.of());
        } else {
            result.put("permissions", List.of("brand", "analytics", "hr", "resource", "visual"));
            result.put("submenu_permissions", defaultSubmenu());
            result.put("brand_permissions", defaultBrand());
            result.put("page_permissions", Map.of());
            result.put("report_permissions", List.of());
            result.put("restaurant_permissions", List.of());
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private void putJson(Map<String, Object> target, String key, String json, Object def) {
        if (json != null && !json.isBlank()) {
            try {
                target.put(key, objectMapper.readValue(json, Object.class));
                return;
            } catch (Exception ignored) { }
        }
        target.put(key, def);
    }

    private Map<String, Object> defaultSubmenu() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("brand", List.of("kunzz_holdings", "tokyo_cuisine", "tokyo_izakaya"));
        m.put("analytics", List.of("kpi_report", "kpi_upload"));
        m.put("hr", List.of("staff_management"));
        m.put("resource", List.of("stock_inventory", "dishware", "price_comparison"));
        m.put("visual", List.of());
        return m;
    }

    private Map<String, Object> defaultBrand() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("kunzz_holdings", Map.of("blueprint", List.of("blueprint")));
        m.put("tokyo_cuisine", Map.of("j1", List.of("schedule"), "j2", List.of("schedule")));
        m.put("tokyo_izakaya", Map.of("j3", List.of("schedule")));
        return m;
    }

    /** 保存用户权限（线上格式 permissions/submenu_permissions/page_permissions/brand_permissions/report_permissions/restaurant_permissions） */
    @Transactional
    public void savePermissions(Integer userId, Map<String, Object> body) {
        UserSidebarPermission p = staffMapper.findSidebarPerm(userId);
        if (p == null) {
            p = new UserSidebarPermission();
            p.setUserId(userId);
        }
        p.setPermissionsJson(json(body.getOrDefault("permissions", body.getOrDefault("sections", List.of("brand", "analytics", "hr", "resource", "visual")))));
        p.setSubmenuPermissionsJson(json(body.getOrDefault("submenu_permissions", body.getOrDefault("submenu", defaultSubmenu()))));
        p.setBrandPermissionsJson(json(body.getOrDefault("brand_permissions", body.getOrDefault("brand", defaultBrand()))));
        p.setPagePermissionsJson(json(body.getOrDefault("page_permissions", body.getOrDefault("pages", Map.of()))));
        p.setReportPermissionsJson(json(body.getOrDefault("report_permissions", List.of())));
        p.setRestaurantPermissionsJson(json(body.getOrDefault("restaurant_permissions", List.of())));
        staffMapper.upsertSidebarPerm(p);

        // 同步 page_permissions 表
        staffMapper.deletePagePerms(userId);
        Object pagesObj = body.getOrDefault("page_permissions", body.get("pages"));
        if (pagesObj instanceof Map<?, ?> pages) {
            pages.forEach((k, v) -> {
                UserPagePermission pp = new UserPagePermission();
                pp.setUserId(userId);
                pp.setPageKey(String.valueOf(k));
                try {
                    pp.setPermissionsJson(objectMapper.writeValueAsString(v));
                } catch (Exception ignored) { }
                staffMapper.insertPagePerm(pp);
            });
        }
    }

    private String json(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            throw new BusinessException("权限 JSON 解析失败");
        }
    }

    @Transactional(readOnly = true)
    public List<UserPagePermission> listPagePermissions(Integer userId) {
        return staffMapper.listPagePerms(userId);
    }

    /**
     * 货品种类页面权限（对齐旧系统 check_permissions.php + applyPagePermissions）
     * 读取 user_page_permissions 表 page_key='stock_inventory' 的 permissions_json
     * views 含 apply / approve；无权限记录时返回空（前端默认全部可用，兼容 demo）
     */
    @Transactional(readOnly = true)
    public Map<String, Object> stockPerms(Integer userId) {
        List<UserPagePermission> perms = staffMapper.listPagePerms(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("canApply", false);
        out.put("canApprove", false);
        out.put("systems", List.of());
        out.put("views", List.of());
        for (UserPagePermission p : perms) {
            if (!"stock_inventory".equals(p.getPageKey())) continue;
            try {
                Map<String, Object> json = objectMapper.readValue(p.getPermissionsJson(), Map.class);
                List<String> views = asStrList(json.get("views"));
                List<String> systems = new ArrayList<>();
                Object sys = json.get("system");
                if (sys == null) sys = json.get("systems");
                if (sys instanceof List<?> list) {
                    for (Object o : list) systems.add(String.valueOf(o));
                }
                out.put("views", views);
                out.put("systems", systems);
                out.put("canApply", views.contains("apply"));
                out.put("canApprove", views.contains("approve"));
            } catch (Exception e) {
                // JSON 解析失败则视为无权限
            }
            break;
        }
        return out;
    }

    private List<String> asStrList(Object o) {
        List<String> list = new ArrayList<>();
        if (o instanceof List<?> l) {
            for (Object x : l) if (x != null) list.add(String.valueOf(x));
        }
        return list;
    }
}
