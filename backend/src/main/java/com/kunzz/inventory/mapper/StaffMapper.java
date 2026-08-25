package com.kunzz.inventory.mapper;

import com.kunzz.inventory.entity.ApplicationCode;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.entity.UserPagePermission;
import com.kunzz.inventory.entity.UserSidebarPermission;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 职员管理 Mapper：users / application_codes / user_sidebar_permissions / user_page_permissions
 */
@Mapper
public interface StaffMapper {

    // ---------- 职员 users ----------
    List<User> listUsers(@Param("keyword") String keyword);

    User findUserById(@Param("id") Integer id);

    User findUserByUsername(@Param("username") String username);

    User findUserByEmail(@Param("email") String email);

    int insertUser(User u);

    int updateUser(User u);

    /** 显式把性别清空为 NULL（enum 不接受 ''，动态 UPDATE 会跳过 null 字段） */
    int clearGender(@Param("id") Integer id);

    int deleteUser(@Param("id") Integer id);

    // ---------- 注册码 application_codes ----------
    List<ApplicationCode> listCodes();

    int insertCode(ApplicationCode c);

    int deleteCode(@Param("id") Integer id);

    // ---------- 侧边栏权限 user_sidebar_permissions ----------
    UserSidebarPermission findSidebarPerm(@Param("userId") Integer userId);

    int upsertSidebarPerm(UserSidebarPermission p);

    // ---------- 页面权限 user_page_permissions ----------
    List<UserPagePermission> listPagePerms(@Param("userId") Integer userId);

    int deletePagePerms(@Param("userId") Integer userId);

    int insertPagePerm(UserPagePermission p);
}
