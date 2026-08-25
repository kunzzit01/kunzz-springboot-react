package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.ApplicationCode;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.entity.UserPagePermission;
import com.kunzz.inventory.service.StaffService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class StaffController {

    private final StaffService staffService;

    /** 当前用户权限（驱动侧边栏） */
    @GetMapping("/auth/me/permissions")
    public ApiResponse<Map<String, Object>> myPermissions(Authentication auth) {
        User u = (User) auth.getPrincipal();
        return ApiResponse.ok(staffService.myPermissions(u.getId()));
    }

    /** 当前用户货品种类页面权限（对齐旧系统 check_permissions.php：canApply / canApprove / systems / views） */
    @GetMapping("/auth/me/stock-perms")
    public ApiResponse<Map<String, Object>> myStockPerms(Authentication auth) {
        User u = (User) auth.getPrincipal();
        return ApiResponse.ok(staffService.stockPerms(u.getId()));
    }

    // ---------- 职员 ----------

    @GetMapping("/staff")
    public ApiResponse<List<User>> listUsers(@RequestParam(required = false) String keyword) {
        return ApiResponse.ok(staffService.listUsers(keyword));
    }

    @PostMapping("/staff")
    public ApiResponse<Map<String, Object>> createUser(@RequestBody Map<String, Object> body) {
        User u = new User();
        u.setUsername(str(body, "username"));
        u.setUsernameCn(str(body, "usernameCn"));
        u.setNickname(str(body, "nickname"));
        u.setEmail(str(body, "email"));
        u.setAccountType(str(body, "accountType"));
        u.setPosition(str(body, "position"));
        u.setPhoneNumber(str(body, "phoneNumber"));
        u.setBranch(str(body, "branch"));
        u.setIcNumber(str(body, "icNumber"));
        u.setBankName(str(body, "bankName"));
        u.setBankAccount(str(body, "bankAccount"));
        u.setHomeAddress(str(body, "homeAddress"));
        u.setCurrentAddress(str(body, "currentAddress"));
        u.setCity(str(body, "city"));
        u.setState(str(body, "state"));
        u.setPostcode(str(body, "postcode"));
        u.setGender(str(body, "gender"));
        u.setNationality(str(body, "nationality"));
        u.setRace(str(body, "race"));
        u.setEmergencyContactName(str(body, "emergencyContactName"));
        u.setEmergencyPhoneNumber(str(body, "emergencyPhoneNumber"));
        u.setBankAccountHolderEn(str(body, "bankAccountHolderEn"));
        u.setRegistrationCode(str(body, "registrationCode"));
        String rawPassword = str(body, "password");
        // 提取权限参数（对齐线上 add_user：permissions/submenu/page/brand/report/restaurant）
        Map<String, Object> perms = new HashMap<>();
        String[] permKeys = {"permissions", "submenu_permissions", "page_permissions",
                "brand_permissions", "report_permissions", "restaurant_permissions"};
        for (String k : permKeys) {
            if (body.containsKey(k)) perms.put(k, body.get(k));
        }
        return ApiResponse.ok(staffService.createUser(u, rawPassword, perms));
    }

    @PutMapping("/staff/{id}")
    public ApiResponse<User> updateUser(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        User patch = new User();
        patch.setUsername(str(body, "username"));
        patch.setUsernameCn(str(body, "usernameCn"));
        patch.setNickname(str(body, "nickname"));
        patch.setEmail(str(body, "email"));
        patch.setAccountType(str(body, "accountType"));
        patch.setPosition(str(body, "position"));
        patch.setPhoneNumber(str(body, "phoneNumber"));
        patch.setBranch(str(body, "branch"));
        patch.setIcNumber(str(body, "icNumber"));
        patch.setBankName(str(body, "bankName"));
        patch.setBankAccount(str(body, "bankAccount"));
        patch.setHomeAddress(str(body, "homeAddress"));
        patch.setCurrentAddress(str(body, "currentAddress"));
        patch.setCity(str(body, "city"));
        patch.setState(str(body, "state"));
        patch.setPostcode(str(body, "postcode"));
        patch.setGender(str(body, "gender"));
        patch.setNationality(str(body, "nationality"));
        patch.setRace(str(body, "race"));
        patch.setEmergencyContactName(str(body, "emergencyContactName"));
        patch.setEmergencyPhoneNumber(str(body, "emergencyPhoneNumber"));
        patch.setBankAccountHolderEn(str(body, "bankAccountHolderEn"));
        String newPassword = str(body, "newPassword");
        return ApiResponse.ok(staffService.updateUser(id, patch, newPassword));
    }

    @DeleteMapping("/staff/{id}")
    public ApiResponse<Void> deleteUser(@PathVariable Integer id) {
        staffService.deleteUser(id);
        return ApiResponse.ok();
    }

    // ---------- 注册码 ----------

    @GetMapping("/application-codes")
    public ApiResponse<List<ApplicationCode>> listCodes() {
        return ApiResponse.ok(staffService.listCodes());
    }

    @PostMapping("/application-codes/generate")
    public ApiResponse<List<ApplicationCode>> generateCodes(
            @RequestParam(defaultValue = "special") String accountType,
            @RequestParam(defaultValue = "5") int count) {
        return ApiResponse.ok(staffService.generateCodes(accountType, Math.min(count, 100)));
    }

    @DeleteMapping("/application-codes/{id}")
    public ApiResponse<Void> deleteCode(@PathVariable Integer id) {
        staffService.deleteCode(id);
        return ApiResponse.ok();
    }

    // ---------- 权限 ----------

    @GetMapping("/permissions/{userId}")
    public ApiResponse<Map<String, Object>> getPermissions(@PathVariable Integer userId) {
        return ApiResponse.ok(staffService.getPermissions(userId));
    }

    @PutMapping("/permissions/{userId}")
    public ApiResponse<Void> savePermissions(@PathVariable Integer userId, @RequestBody Map<String, Object> body) {
        staffService.savePermissions(userId, body);
        return ApiResponse.ok();
    }

    @GetMapping("/permissions/{userId}/pages")
    public ApiResponse<List<UserPagePermission>> listPagePermissions(@PathVariable Integer userId) {
        return ApiResponse.ok(staffService.listPagePermissions(userId));
    }

    private String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v == null ? null : String.valueOf(v);
    }
}
