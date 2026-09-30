package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;

import java.util.List;
import java.util.Map;

/**
 * 碗碟库存（按店面）Mapper。
 *
 * 真实数量在 dishware_stock_by_restaurant；另一张聚合表 dishware_stock 在旧系统里就没在维护
 * （实测几乎全 0），不能作为数据源 —— 旧系统 dishware_api.php?action=stock 也是从本表汇总。
 */
@Mapper
public interface DishwareStockMapper {

    /** 每个「碗碟 × 店面」的库存数量合计（dishwareId / restaurantId / qty） */
    List<Map<String, Object>> stockByRestaurant();
}
