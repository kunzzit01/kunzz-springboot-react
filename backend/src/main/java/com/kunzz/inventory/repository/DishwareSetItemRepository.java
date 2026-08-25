package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareSetItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DishwareSetItemRepository extends JpaRepository<DishwareSetItem, Integer> {
    List<DishwareSetItem> findBySetIdOrderBySortOrderAsc(Integer setId);
    void deleteBySetId(Integer setId);
}
