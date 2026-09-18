package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.FreezerCategory;
import com.kunzz.inventory.mapper.StockDataSystemMapper;
import com.kunzz.inventory.repository.FreezerCategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 冰箱分类字典维护（freezer_categories）
 *
 * 货品上的冰箱分类是纯文本（逗号分隔多选），2026-09-18 起存在 stock_data_system 表里
 * **每个系统一行**；字典只维护【名字 + 顺序】这一层，改名时级联改写各系统行上的文本
 * （名字是字典与数据之间唯一的联系，所以改名对所有系统一起生效）。
 */
@Service
@RequiredArgsConstructor
public class FreezerCategoryService {

    /** 与 stock_data.freezer_category 列宽一致（varchar(50)）：多值组合也不能超，否则写库会被截断 */
    private static final int MAX_LEN = 50;
    private static final String SEP = ",";

    private final FreezerCategoryRepository repo;
    private final StockDataSystemMapper stockDataSystemMapper;

    /**
     * 下拉选项 / 管理面板列表（按业务顺序，全部返回）
     * 没有「停用」概念：分类要么在用，要么删掉（删除会级联清掉货品上的引用）
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list() {
        Map<String, Integer> usage = usageCounts();
        List<FreezerCategory> all = repo.findAllByOrderBySortOrderAscIdAsc();
        Set<String> registered = new HashSet<>();
        List<Map<String, Object>> out = new ArrayList<>();
        for (FreezerCategory c : all) {
            registered.add(c.getName());
            out.add(view(c, usage.getOrDefault(c.getName(), 0)));
        }
        // 货品上在用、但字典里没有的值（老数据 / 直接从 live 导入的数据）一并返回：
        // 否则这些值在下拉里既看不见也取消不掉。排在有顺序的字典项之后，管理面板可把它「补充」进字典。
        List<String> orphans = new ArrayList<>();
        for (String n : usage.keySet()) if (!registered.contains(n)) orphans.add(n);
        Collections.sort(orphans);
        for (String n : orphans) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", null);
            m.put("name", n);
            m.put("sort_order", 0);
            m.put("is_active", true); // 在用就必须能选，不能藏起来
            m.put("usage_count", usage.getOrDefault(n, 0));
            m.put("registered", false);
            out.add(m);
        }
        return out;
    }

    /** 新增分类（排在最末） */
    @Transactional
    public Map<String, Object> create(String rawName) {
        String name = cleanName(rawName);
        if (findIgnoreCase(name) != null) {
            throw new BusinessException("冰箱分类「" + name + "」已经存在了");
        }
        FreezerCategory c = new FreezerCategory();
        c.setName(name);
        // 排在末尾：现有的顺序就是冰箱物理顺序，新增的不能插到中间去
        c.setSortOrder(repo.findFirstByOrderBySortOrderDescIdDesc()
                .map(x -> (x.getSortOrder() == null ? 0 : x.getSortOrder()) + 1).orElse(1));
        c.setIsActive(true);
        return view(repo.save(c), 0);
    }

    /**
     * 全局改名：字典跟着改，所有挂了该分类的货品也一起改
     * （stock_data 是冰箱分类的唯一存储处，改完总库存/手机版/搜索自动跟着变）
     *
     * 实现要点：
     *  1) 先全量试算，任何一行会超长就整体报错取消 —— 绝不写一半（改到一半是最难收拾的状态）
     *  2) token 级替换：按逗号 split 后精确比对，不用 SQL REPLACE
     *     （REPLACE('K1-1,K1-10','K1-1','X') 会把 K1-10 一起改坏）
     *  3) 只更新 freezer_category 一列，不整行覆写
     */
    @Transactional
    public Map<String, Object> rename(Integer id, String rawName) {
        FreezerCategory c = repo.findById(id).orElseThrow(() -> new BusinessException(404, "冰箱分类不存在"));
        String oldName = c.getName();
        String name = cleanName(rawName);
        if (name.equals(oldName)) return result(false, 0, oldName, oldName);

        FreezerCategory same = findIgnoreCase(name);
        if (same != null && !same.getId().equals(id)) {
            throw new BusinessException("冰箱分类「" + name + "」已经存在了");
        }

        List<Map<String, Object>> rows = stockDataSystemMapper.findByFreezerToken(oldName);
        List<Object[]> pending = new ArrayList<>();
        List<String> overflow = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            String cur = str(r.get("freezer_category"));
            String next = replaceToken(cur, oldName, name);
            if (next.equals(cur)) continue;
            if (next.length() > MAX_LEN) {
                overflow.add(str(r.get("product_name")));
                continue;
            }
            pending.add(new Object[]{r.get("id"), next});
        }
        if (!overflow.isEmpty()) throw new BusinessException(overflowMessage(name, overflow));

        for (Object[] u : pending) stockDataSystemMapper.updateFreezerOnly(toInt(u[0]), (String) u[1]);

        c.setName(name);
        repo.save(c);
        return result(true, pending.size(), oldName, name);
    }

    /** 调顺序：按传入的 id 顺序重排 sort_order；请求里漏掉的追加在末尾并保持原有相对顺序 */
    @Transactional
    public void reorder(List<Integer> ids) {
        if (ids == null || ids.isEmpty()) return;
        Map<Integer, FreezerCategory> byId = new LinkedHashMap<>();
        for (FreezerCategory c : repo.findAllByOrderBySortOrderAscIdAsc()) byId.put(c.getId(), c);
        List<FreezerCategory> ordered = new ArrayList<>();
        for (Integer id : ids) {
            FreezerCategory c = byId.remove(id);
            if (c != null) ordered.add(c);
        }
        ordered.addAll(byId.values());
        int order = 1;
        for (FreezerCategory c : ordered) c.setSortOrder(order++);
        repo.saveAll(ordered);
    }

    /**
     * 删除分类
     * - 没有被货品引用 → 直接删
     * - 还有货品在用 → 必须带 force=true（前端会弹确认框说明影响），
     *   删除的同时把这些货品上的这个分类一并去掉（多冰箱货品的其余分类保持不变）
     * 不带 force 时拒绝：这是给直接调接口的人留的护栏，避免一次误调就把几十个货品的冰箱标注清掉
     */
    @Transactional
    public Map<String, Object> delete(Integer id, boolean force) {
        FreezerCategory c = repo.findById(id).orElseThrow(() -> new BusinessException(404, "冰箱分类不存在"));
        String name = c.getName();

        List<Map<String, Object>> rows = stockDataSystemMapper.findByFreezerToken(name);
        if (!rows.isEmpty() && !force) {
            throw new BusinessException("还有 " + rows.size() + " 个货品在用「" + name
                    + "」。删除会同时把这些货品上的这个分类去掉；确认无误请带 force=true 重试。");
        }

        int cleared = 0;
        for (Map<String, Object> r : rows) {
            String cur = str(r.get("freezer_category"));
            String next = removeToken(cur, name);
            if (next.equals(cur)) continue;
            stockDataSystemMapper.updateFreezerOnly(toInt(r.get("id")), next);
            cleared++;
        }
        repo.delete(c);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("name", name);
        out.put("cleared", cleared);
        return out;
    }

    // ---------- 内部 ----------

    /** 逗号串里精确移除一个 token（删分类时清掉货品上的引用）；保序 + 去重 */
    private String removeToken(String csv, String token) {
        List<String> out = new ArrayList<>();
        for (String part : csv.split(SEP)) {
            String t = part.trim();
            if (t.isEmpty() || t.equals(token)) continue;
            if (!out.contains(t)) out.add(t);
        }
        return String.join(SEP, out);
    }

    /** 逗号串里精确替换一个 token：保序 + 去重（改名后可能撞上串里已有的另一个 token） */
    private String replaceToken(String csv, String oldToken, String newToken) {
        List<String> out = new ArrayList<>();
        for (String part : csv.split(SEP)) {
            String t = part.trim();
            if (t.isEmpty()) continue;
            if (t.equals(oldToken)) t = newToken;
            if (!out.contains(t)) out.add(t);
        }
        return String.join(SEP, out);
    }

    /** 名字校验：必须与 stock_data.freezer_category 的存储格式兼容（逗号是分类之间的分隔符） */
    private String cleanName(String raw) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty()) throw new BusinessException("冰箱分类名称不能为空");
        if (name.contains(SEP)) throw new BusinessException("冰箱分类名称不能包含逗号——逗号是多个冰箱之间的分隔符");
        if (name.length() > MAX_LEN) throw new BusinessException("冰箱分类名称不能超过 " + MAX_LEN + " 个字符");
        return name;
    }

    /** 大小写不敏感查重：避免出现 K1-1 和 k1-1 两个看着一样的分类 */
    private FreezerCategory findIgnoreCase(String name) {
        for (FreezerCategory c : repo.findAllByOrderBySortOrderAscIdAsc()) {
            if (c.getName() != null && c.getName().equalsIgnoreCase(name)) return c;
        }
        return null;
    }

    private String overflowMessage(String name, List<String> products) {
        int show = Math.min(3, products.size());
        String sample = String.join("、", products.subList(0, show));
        return "「" + name + "」这个名字太长了：有 " + products.size() + " 个货品的冰箱分类组合会超过 " + MAX_LEN
                + " 个字符（如 " + sample + (products.size() > show ? " 等" : "") + "）。"
                + "这些货品同时挂了多个冰箱，请换个短一点的名字。本次没有做任何修改。";
    }

    /** 每个分类被多少个货品使用：按 token 收集货品 id（多值行按逗号拆开；同一货品挂多个系统只算一个货品） */
    private Map<String, Integer> usageCounts() {
        Map<String, Set<Integer>> byToken = new LinkedHashMap<>();
        for (Map<String, Object> r : stockDataSystemMapper.usageRows()) {
            String csv = str(r.get("freezer_category"));
            Integer dataId = toInt(r.get("stockDataId"));
            for (String part : csv.split(SEP)) {
                String t = part.trim();
                if (!t.isEmpty()) byToken.computeIfAbsent(t, k -> new LinkedHashSet<>()).add(dataId);
            }
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Map.Entry<String, Set<Integer>> e : byToken.entrySet()) counts.put(e.getKey(), e.getValue().size());
        return counts;
    }

    private Map<String, Object> view(FreezerCategory c, int usage) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("sort_order", c.getSortOrder() == null ? 0 : c.getSortOrder());
        m.put("is_active", Boolean.TRUE.equals(c.getIsActive()));
        m.put("usage_count", usage);
        m.put("registered", true);
        return m;
    }

    private Map<String, Object> result(boolean renamed, int changed, String oldName, String newName) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("success", true);
        m.put("renamed", renamed);
        m.put("changed", changed);
        m.put("old_name", oldName);
        m.put("new_name", newName);
        return m;
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private int toInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (Exception e) {
            return 0;
        }
    }
}
