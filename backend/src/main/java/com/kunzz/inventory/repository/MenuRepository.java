package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.Menu;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MenuRepository extends JpaRepository<Menu, Integer> {
    List<Menu> findAllByOrderBySortOrderAscIdAsc();
    List<Menu> findByCategoryIdOrderBySortOrderAscIdAsc(Integer categoryId);
}
