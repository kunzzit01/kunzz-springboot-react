package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 进出货辅助选项 Mapper（对齐线上 stockeditapi.php）
 * 下拉选项：编号/产品/收货人；价格批次：HIFO 出库计价
 */
@Mapper
public interface StockEditMapper {

    /** 编号列表（来自 stock_data 台账） */
    List<Map<String, Object>> codeNumbers();

    /** 产品列表（来自 stock_data 台账） */
    List<Map<String, Object>> products();

    /** 收货人列表（来自出入库记录 distinct） */
    List<String> shippers();

    /** 价格批次（按价格降序，仅保留净库存 > 0；HIFO 最高价先出；tableName 白名单由 service 映射） */
    List<Map<String, Object>> priceBatches(@Param("tableName") String tableName,
                                           @Param("productName") String productName,
                                           @Param("codeNumber") String codeNumber);

    /** 价格+库存明细（含 total_in/total_out，用于出库计价与库存检查） */
    List<Map<String, Object>> priceStock(@Param("tableName") String tableName,
                                         @Param("productName") String productName,
                                         @Param("codeNumber") String codeNumber);

    /** 在库备注编号（净库存 > 0，供备注编号前缀/后缀生成） */
    List<String> remarkCodes(@Param("productName") String productName);
}
