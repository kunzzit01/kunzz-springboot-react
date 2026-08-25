package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.MenuCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MenuCategoryRepository extends JpaRepository<MenuCategory, Integer> {
    List<MenuCategory> findAllByOrderBySortOrderAscIdAsc();
}
