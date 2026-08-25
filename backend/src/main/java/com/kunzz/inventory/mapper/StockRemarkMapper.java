package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;

import java.util.List;
import java.util.Map;

/**
 * 货品备注分析 Mapper（对齐线上 stockremarkapi.php?action=analysis）
 * 数据访问：MyBatis Mapper（显式聚合 SQL）
 */
@Mapper
public interface StockRemarkMapper {

    /**
     * 多价格/备注货品分析行：
     * 每个 remark_number（备注编号）一条，净库存 = SUM(in) - SUM(out)，仅保留净库存 > 0 的记录
     */
    List<Map<String, Object>> analysisRows();
}
