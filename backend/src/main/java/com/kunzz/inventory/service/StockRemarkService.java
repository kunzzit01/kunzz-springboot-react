package com.kunzz.inventory.service;

import com.kunzz.inventory.mapper.StockRemarkMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 货品备注分析（对齐线上 stockremarkapi.php?action=analysis）
 * 响应格式与线上一致：products[].{product_name, variants[], total_quantity}
 * variants[].{code_number, specification, in_quantity, out_quantity, current_stock,
 *             formatted_quantity, price, formatted_price, remark_number}
 */
@Service
@RequiredArgsConstructor
public class StockRemarkService {

    private final StockRemarkMapper stockRemarkMapper;

    public Map<String, Object> analysis() {
        List<Map<String, Object>> rows = stockRemarkMapper.analysisRows();

        // 按产品名分组（SQL 已按 product_name 排序，保持字母序与线上一致）
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            String name = String.valueOf(r.get("product_name"));
            groups.computeIfAbsent(name, k -> new ArrayList<>()).add(r);
        }

        List<Map<String, Object>> products = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> e : groups.entrySet()) {
            List<Map<String, Object>> variants = e.getValue();
            // 备注编号自然排序（字母+数字混合，对齐线上 naturalSort：SA-9 < SA-10）
            variants.sort((a, b) -> naturalCompare(str(a.get("remark_number")), str(b.get("remark_number"))));

            List<Map<String, Object>> vs = new ArrayList<>();
            BigDecimal total = BigDecimal.ZERO;
            for (Map<String, Object> v : variants) {
                BigDecimal in = dec(v.get("in_quantity"));
                BigDecimal out = dec(v.get("out_quantity"));
                BigDecimal price = dec(v.get("price"));
                BigDecimal stock = in.subtract(out);
                total = total.add(stock);

                Map<String, Object> item = new LinkedHashMap<>();
                item.put("code_number", str(v.get("code_number")));
                item.put("specification", str(v.get("specification")));
                item.put("in_quantity", strip(in));
                item.put("out_quantity", strip(out));
                item.put("current_stock", strip(stock));
                item.put("formatted_quantity", strip(stock).toPlainString());
                item.put("price", strip(price));
                item.put("formatted_price", String.format("%.2f", price));
                item.put("remark_number", str(v.get("remark_number")));
                vs.add(item);
            }

            Map<String, Object> p = new LinkedHashMap<>();
            p.put("product_name", e.getKey());
            p.put("variants", vs);
            p.put("total_quantity", strip(total));
            products.add(p);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("products", products);
        return data;
    }

    /** 备注编号自然排序：字母部分按字典序，数字部分按数值（SA-9 < SA-10） */
    private int naturalCompare(String a, String b) {
        int i = 0, j = 0;
        while (i < a.length() && j < b.length()) {
            char ca = a.charAt(i), cb = b.charAt(j);
            if (Character.isDigit(ca) && Character.isDigit(cb)) {
                int x = i, y = j;
                while (i < a.length() && Character.isDigit(a.charAt(i))) i++;
                while (j < b.length() && Character.isDigit(b.charAt(j))) j++;
                String na = a.substring(x, i);
                String nb = b.substring(y, j);
                int cmp = new BigDecimal(na).compareTo(new BigDecimal(nb));
                if (cmp != 0) return cmp;
            } else {
                int cmp = Character.compare(ca, cb);
                if (cmp != 0) return cmp;
                i++;
                j++;
            }
        }
        return Integer.compare(a.length() - i, b.length() - j);
    }

    private BigDecimal dec(Object o) {
        if (o == null) return BigDecimal.ZERO;
        if (o instanceof BigDecimal bd) return bd;
        if (o instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try {
            return new BigDecimal(String.valueOf(o).trim());
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    /** 去尾零（0.170 -> 0.17，1.00 -> 1） */
    private BigDecimal strip(BigDecimal bd) {
        return bd.stripTrailingZeros();
    }
}
