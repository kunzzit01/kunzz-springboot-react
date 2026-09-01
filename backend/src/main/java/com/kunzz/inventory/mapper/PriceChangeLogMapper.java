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

    /** 某货品的改价历史（从旧到最新） */
    List<Map<String, Object>> listByProduct(@Param("productName") String productName);

    /** 每个货品的最近一次改价（总库存「最近改价」列用） */
    List<Map<String, Object>> latestAll();
}
