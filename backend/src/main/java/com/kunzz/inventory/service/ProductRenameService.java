package com.kunzz.inventory.service;

import com.kunzz.inventory.mapper.StockInoutMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 货品改名级联（2026-09-24 新增）。
 *
 * 货品名在本系统里同时是"货品身份"：总库存按 product_name 分组，最低库存、改价日志、
 * 备注分析也全都按名字关联。只改台账而不同步历史，同一条货品就会当场裂成两份库存
 * （实例：2026-09-19 把台账那条 SURUME IKA P 的名字从制表符改成空格，流水里 184 行仍是制表符，
 * 总库存于是显示两行 5.00 / 24.00）。所以台账改名时必须把历史一起改掉。
 *
 * 「货品种类」编辑和「维护 → 重命名产品」两处都走这里，口径保持一套。
 */
@Service
@RequiredArgsConstructor
public class ProductRenameService {

    private final StockInoutMapper stockInoutMapper;

    /** 分店系统 = 表名前缀 */
    private static final String[] BRANCHES = {"j1", "j2", "j3"};

    /** 把 oldName 在所有流水/台账/关联表里改成 newName（与 2026-09-24 的生产修复脚本口径一致） */
    @Transactional
    public void cascade(String oldName, String newName) {
        if (oldName == null || oldName.isBlank() || newName == null || newName.isBlank()) return;
        if (oldName.equals(newName)) return;

        // 中央流水
        stockInoutMapper.renameProductNameKeepStamp("stockinout_data", oldName, newName);

        for (String b : BRANCHES) {
            // 分店流水（中央转分店的入库镜像）/ 分店台账 / 手机台账
            stockInoutMapper.renameProductNameKeepStamp(b + "stockinout_data", oldName, newName);
            stockInoutMapper.renameProductNameKeepStamp(b + "stockedit_data", oldName, newName);
            stockInoutMapper.renameProductNameKeepStamp(b + "stockeditmobile_data", oldName, newName);
            // 手机版总库存缓存：唯一键 (product_name, code_number, specification)
            // → 先把数量并到新名行、删掉旧名行，再把剩下的旧名行改名（表只有 last_updated，无 updated_at）
            String listTotal = b + "stocklist_total";
            stockInoutMapper.mergeListTotalOnRename(listTotal, oldName, newName);
            stockInoutMapper.deleteMergedListTotalOnRename(listTotal, oldName, newName);
            stockInoutMapper.renameProductName(listTotal, oldName, newName);
        }

        // 改价日志（总库存的「最近改价」图标按名字关联；表无 updated_at）
        stockInoutMapper.renameProductName("price_change_log", oldName, newName);

        // 最低库存：唯一键 (stock_system, product_name) → 先取两者较大值、删旧名行、再把剩余旧名行改名
        stockInoutMapper.mergeMinimumOnRename(oldName, newName);
        stockInoutMapper.deleteMergedMinimumOnRename(oldName, newName);
        stockInoutMapper.renameProductNameKeepStamp("stock_minimum_settings", oldName, newName);
    }
}
