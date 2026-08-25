package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 碗碟转卖 Mapper：对齐旧系统 dishware_api.php?action=transfer_records
 * 服务端按店 + 日期范围过滤，联表返回编号/名称/餐厅名
 */
@Mapper
public interface DishwareTransferMapper {

    /**
     * 转卖记录列表（联表 dishware_info / dishware_restaurant_locations）
     * @param shopType 店面（j1/j2/j3）：out 记录按来源店匹配、in 记录按目标店匹配；null/空=全部
     * @param startDate 起始日期（含）
     * @param endDate   结束日期（含）
     */
    List<Map<String, Object>> listTransfers(@Param("shopType") String shopType,
                                            @Param("startDate") String startDate,
                                            @Param("endDate") String endDate);
}
