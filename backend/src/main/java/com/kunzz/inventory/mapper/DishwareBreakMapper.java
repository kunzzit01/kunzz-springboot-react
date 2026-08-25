package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 碗碟破损记录 Mapper：对齐旧系统 dishware_api.php?action=damage_records
 * 服务端按店 + 日期范围过滤，联表返回编号/名称
 */
@Mapper
public interface DishwareBreakMapper {

    /**
     * 破损记录列表（联表 dishware_info）
     * @param shopType  店面（j1/j2/j3）；null/空=全部
     * @param startDate 起始日期（含）
     * @param endDate   结束日期（含）
     */
    List<Map<String, Object>> listBreaks(@Param("shopType") String shopType,
                                         @Param("startDate") String startDate,
                                         @Param("endDate") String endDate);
}
