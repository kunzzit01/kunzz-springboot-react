package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.StockData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface StockDataRepository extends JpaRepository<StockData, Integer>, JpaSpecificationExecutor<StockData> {

    /** 按产品名取第一条台账（用于分店记录的 type/category 自动补全，对齐旧系统 saveToJ1Table） */
    StockData findFirstByProductName(String productName);

    /** 按产品编号取第一条台账 */
    StockData findFirstByProductCode(String productCode);

    /** 全量产品名 → category 映射（用于中央进出货/总库存补 type，对齐分店显示） */
    @Query("select d.productName, d.category from StockData d where d.category is not null and d.category != ''")
    List<Object[]> productCategories();
}
