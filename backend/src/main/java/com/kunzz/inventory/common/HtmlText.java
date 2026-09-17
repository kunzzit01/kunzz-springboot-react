package com.kunzz.inventory.common;

/**
 * HTML 实体解码（老库字段里带 &amp; 等实体：旧 PHP / 手机端写入时编码过）。
 * 新系统对外一律用解码后的值，保证不同页面拿到的同名货品/供应商字符串一致。
 */
public final class HtmlText {

    private HtmlText() {
    }

    /** 逐层解码 HTML 实体：&amp; 先替换，能顺带处理 &amp;amp; 这类多次编码的脏数据 */
    public static String decode(String s) {
        if (s == null || s.isBlank()) return s == null ? "" : s;
        String out = s;
        for (int i = 0; i < 3; i++) {
            String next = out.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                    .replace("&quot;", "\"").replace("&#039;", "'").replace("&nbsp;", " ");
            if (next.equals(out)) break;
            out = next;
        }
        return out;
    }
}
