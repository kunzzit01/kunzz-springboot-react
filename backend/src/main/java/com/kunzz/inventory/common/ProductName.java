package com.kunzz.inventory.common;

/**
 * 货品名称规范化（2026-09-24 新增）。
 *
 * 为什么需要：货品名在本系统里同时也是"货品身份"——总库存按 product_name 分组，
 * 最低库存、改价日志、备注分析也都按名字关联。名字里一旦混进不可见字符
 * （制表符 / 连续空格 / 不换行空格 …），同一条货品就会裂成两行，各自累计库存，
 * 而页面渲染出来肉眼完全看不出差别。
 * 实例：'SURUME IKA&lt;Tab&gt;P' 与 'SURUME IKA P' 在总库存显示成两行 5.00 / 24.00。
 *
 * 规则：先按老库惯例解码 HTML 实体（&amp;amp; 等），再把所有空白字符折叠成单个半角空格，最后去首尾。
 */
public final class ProductName {

    private ProductName() {
    }

    /** 规范化货品名；null 原样返回（空值由调用方的 @NotBlank 等校验兜底） */
    public static String normalize(String name) {
        if (name == null) return null;
        String s = HtmlText.decode(name);
        StringBuilder sb = new StringBuilder(s.length());
        boolean pendingSpace = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (isBlank(c)) {
                pendingSpace = sb.length() > 0; // 开头的空白直接丢掉，不留前导空格
                continue;
            }
            if (pendingSpace) {
                sb.append(' ');
                pendingSpace = false;
            }
            sb.append(c);
        }
        return sb.toString();
    }

    /** 是否算空白：常见空白 + 各种"看起来是空格/看不见"的字符 */
    private static boolean isBlank(char c) {
        switch (c) {
            case ' ':
            case '\t':
            case '\n':
            case '\r':
            case '\f':
            case '\u000B': // 垂直制表
            case '\u00A0': // 不换行空格（渲染出来和普通空格一样）
            case '\u2007': // 数字空格
            case '\u202F': // 窄不换行空格
            case '\u3000': // 全角空格
            case '\u200B': // 零宽空格（完全看不见）
            case '\uFEFF': // BOM
                return true;
            default:
                return Character.isWhitespace(c) || Character.isSpaceChar(c);
        }
    }
}
