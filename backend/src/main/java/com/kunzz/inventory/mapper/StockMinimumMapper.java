package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 最低库存设置 Mapper（对齐线上 stockminimumapi.php）
 * 列出某系统全部在库货品（镜像总库存汇总分组），并 LEFT JOIN stock_minimum_settings
 */
@Mapper
public interface StockMinimumMapper {

    /** 某系统全部在库货品 + 最低库存设置（表名动态：stockinout_data 或 jXstockedit_data；最低库存全局，不按系统） */
    List<Map<String, Object>> productsWithMinimum(@Param("table") String table);

    /** 按产品名汇总净库存（不管价格/规格；检测口径：名字统一库存数量） */
    List<Map<String, Object>> totalStockByName(@Param("table") String table, @Param("excludeSot") boolean excludeSot);

    /** 按产品名 UPSERT 最低库存（product_name 唯一键：INSERT ... ON DUPLICATE KEY UPDATE） */
    int upsert(@Param("productName") String productName, @Param("quantity") BigDecimal quantity);
}
