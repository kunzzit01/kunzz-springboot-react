package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 总库存汇总 Mapper：按分店动态表名聚合净库存
 */
@Mapper
public interface StockSummaryMapper {

    /** 某系统库存汇总（表名动态：stockinout_data 或 jXstockedit_data） */
    List<Map<String, Object>> summaryRows(@Param("table") String table,
                                          @Param("targetSystem") String targetSystem);

    /** 供货总额（对齐线上 stocklistapi.php getSupplyTotal：本月 jXstockinout_data 的入库额 SUM(in×price)） */
    List<Map<String, Object>> supplyValue(@Param("table") String table,
                                          @Param("start") String start,
                                          @Param("end") String end);
}
