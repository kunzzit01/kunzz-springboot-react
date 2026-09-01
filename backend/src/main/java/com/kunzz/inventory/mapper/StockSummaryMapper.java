package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 总库存汇总 Mapper：按分店动态表名聚合净库存
 */
@Mapper
public interface StockSummaryMapper {

    /** 某系统库存汇总（表名动态：stockinout_data 或 jXstockedit_data；endDate 非空 = 截至该日期的库存余额，对齐旧系统导出） */
    List<Map<String, Object>> summaryRows(@Param("table") String table,
                                          @Param("targetSystem") String targetSystem,
                                          @Param("endDate") LocalDate endDate);

    /** 供货总额（对齐线上 stocklistapi.php getSupplyTotal：本月 jXstockinout_data 的入库额 SUM(in×price)） */
    List<Map<String, Object>> supplyValue(@Param("table") String table,
                                          @Param("start") String start,
                                          @Param("end") String end);

    /** 最新一条匹配货品流水的货品信息（AI 助手用：取最新价格；分词 AND 模糊，精确名优先；零库存也能查到） */
    Map<String, Object> latestProductInfo(@Param("table") String table,
                                          @Param("words") List<String> words,
                                          @Param("full") String full);

    /** 台账（货品主表，仅中央 stock_data）：流水/汇总都没有时的最后兑底 */
    Map<String, Object> stockDataProductInfo(@Param("words") List<String> words,
                                             @Param("full") String full);
}
