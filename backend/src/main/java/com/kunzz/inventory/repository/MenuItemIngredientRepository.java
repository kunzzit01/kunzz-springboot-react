package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.MenuItemIngredient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MenuItemIngredientRepository extends JpaRepository<MenuItemIngredient, Integer> {
    List<MenuItemIngredient> findByMenuItemIdOrderBySortOrderAsc(Integer menuItemId);
    void deleteByMenuItemId(Integer menuItemId);
}
