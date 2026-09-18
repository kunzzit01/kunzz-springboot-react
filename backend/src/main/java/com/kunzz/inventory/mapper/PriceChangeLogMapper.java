package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 改价日志 Mapper：货品种类每次更改单价记录一条（change_date=当天），
 * 总库存页展示改价历史（从旧到最新：列显示最近一次 + 点击货品名弹窗看全量）
 */
@Mapper
public interface PriceChangeLogMapper {

    /** 插入一条改价记录 */
    int insertLog(@Param("l") Map<String, Object> log);

    /** 当天该货品在该系统下的改价记录（同一天只保留一条：先查再决定更新还是插入）；system 传归一后的系统名 */
    Map<String, Object> findToday(@Param("productName") String productName,
                                  @Param("system") String system,
                                  @Param("changeDate") String changeDate);

    /** 更新当天那条记录的新价（old_price 保持当天起点价不变） */
    int updateTodayPrice(@Param("id") Integer id,
                         @Param("newPrice") Double newPrice,
                         @Param("changedBy") String changedBy);

    /** 某货品的改价历史（从旧到最新）；system 为空/总览 → 不过滤 */
    List<Map<String, Object>> listByProduct(@Param("productName") String productName,
                                            @Param("system") String system);

    /** 每个货品的最近一次改价（总库存「最近改价」列用）；按当前系统过滤 */
    List<Map<String, Object>> latestAll(@Param("system") String system);
}
