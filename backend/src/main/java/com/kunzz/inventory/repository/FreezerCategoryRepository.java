package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.FreezerCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FreezerCategoryRepository extends JpaRepository<FreezerCategory, Integer> {

    /** 全部：按业务顺序（总库存排序与下拉选项顺序的唯一依据） */
    List<FreezerCategory> findAllByOrderBySortOrderAscIdAsc();

    /** 取最大 sort_order，新增时排在末尾 */
    Optional<FreezerCategory> findFirstByOrderBySortOrderDescIdDesc();
}
