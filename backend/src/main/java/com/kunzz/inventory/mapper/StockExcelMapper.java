package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 进出货 Excel 导出 Mapper（对齐线上 export_branch_stock_excel.php）
 */
@Mapper
public interface StockExcelMapper {

    /** 日期范围流水（表名动态：stockinout_data 或 jXstockedit_data；对齐旧系统 export：正序 + 可选排除 SOT + 入库/出库筛选） */
    List<Map<String, Object>> listRange(@Param("table") String table,
                                        @Param("startDate") String startDate,
                                        @Param("endDate") String endDate,
                                        @Param("excludeSot") boolean excludeSot,
                                        @Param("includeIn") boolean includeIn,
                                        @Param("includeOut") boolean includeOut);

    /** 中央出库记录（invoice PDF 用：stockinout_data 出库 + 目标店面匹配，对齐旧系统 confirmExport 过滤） */
    List<Map<String, Object>> listInvoiceData(@Param("system") String system,
                                              @Param("startDate") String startDate,
                                              @Param("endDate") String endDate);

    /** 分店入库记录（分店 Excel 导出用：jXstockinout_data 入库，对齐旧系统 export_branch_stock_excel.php） */
    List<Map<String, Object>> listBranchInbound(@Param("table") String table,
                                                @Param("startDate") String startDate,
                                                @Param("endDate") String endDate);
}
