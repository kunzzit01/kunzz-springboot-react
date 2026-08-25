package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.service.MenuService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MenuController {

    private final MenuService menuService;

    // ---------- 菜单分类 ----------

    @GetMapping("/menu/categories")
    public ApiResponse<List<MenuCategory>> listCategories() {
        return ApiResponse.ok(menuService.listCategories());
    }

    @PostMapping("/menu/categories")
    public ApiResponse<MenuCategory> saveCategory(@RequestBody MenuCategory c) {
        return ApiResponse.ok(menuService.saveCategory(c));
    }

    @DeleteMapping("/menu/categories/{id}")
    public ApiResponse<Void> deleteCategory(@PathVariable Integer id) {
        menuService.deleteCategory(id);
        return ApiResponse.ok();
    }

    // ---------- 菜单项 ----------

    @GetMapping("/menu/items")
    public ApiResponse<List<Menu>> listMenus(@RequestParam(required = false) Integer categoryId) {
        return ApiResponse.ok(menuService.listMenus(categoryId));
    }

    @PostMapping("/menu/items")
    public ApiResponse<Menu> saveMenu(@RequestBody Menu m) {
        return ApiResponse.ok(menuService.saveMenu(m));
    }

    @DeleteMapping("/menu/items/{id}")
    public ApiResponse<Void> deleteMenu(@PathVariable Integer id) {
        menuService.deleteMenu(id);
        return ApiResponse.ok();
    }

    // ---------- 菜单成本 ----------

    @GetMapping("/menucost/items")
    public ApiResponse<List<MenuItem>> listItems() {
        return ApiResponse.ok(menuService.listItems());
    }

    @PostMapping("/menucost/items")
    public ApiResponse<MenuItem> saveItem(@RequestBody MenuItem item) {
        return ApiResponse.ok(menuService.saveItem(item));
    }

    @DeleteMapping("/menucost/items/{id}")
    public ApiResponse<Void> deleteItem(@PathVariable Integer id) {
        menuService.deleteItem(id);
        return ApiResponse.ok();
    }

    @GetMapping("/menucost/items/{id}/ingredients")
    public ApiResponse<List<MenuItemIngredient>> listIngredients(@PathVariable Integer id) {
        return ApiResponse.ok(menuService.listIngredients(id));
    }

    @PutMapping("/menucost/items/{id}/ingredients")
    public ApiResponse<Void> saveIngredients(@PathVariable Integer id, @RequestBody List<MenuItemIngredient> ingredients) {
        menuService.saveIngredients(id, ingredients);
        return ApiResponse.ok();
    }

    @GetMapping("/menucost/data")
    public ApiResponse<List<MenuCostData>> listCostData() {
        return ApiResponse.ok(menuService.listCostData());
    }

    @PostMapping("/menucost/data")
    public ApiResponse<MenuCostData> saveCostData(@RequestBody MenuCostData d) {
        return ApiResponse.ok(menuService.saveCostData(d));
    }

    @DeleteMapping("/menucost/data/{id}")
    public ApiResponse<Void> deleteCostData(@PathVariable Integer id) {
        menuService.deleteCostData(id);
        return ApiResponse.ok();
    }

    // ---------- 餐厅 / 食品 / 价格对比 ----------

    @GetMapping("/restaurants")
    public ApiResponse<List<Restaurant>> listRestaurants() {
        return ApiResponse.ok(menuService.listRestaurants());
    }

    @PostMapping("/restaurants")
    public ApiResponse<Restaurant> saveRestaurant(@RequestBody Restaurant r) {
        return ApiResponse.ok(menuService.saveRestaurant(r));
    }

    @DeleteMapping("/restaurants/{id}")
    public ApiResponse<Void> deleteRestaurant(@PathVariable Integer id) {
        menuService.deleteRestaurant(id);
        return ApiResponse.ok();
    }

    @GetMapping("/restaurants/{id}/foods")
    public ApiResponse<List<RestaurantFood>> listFoods(@PathVariable Integer id) {
        return ApiResponse.ok(menuService.listFoods(id));
    }

    @PostMapping("/restaurants/{id}/foods")
    public ApiResponse<RestaurantFood> saveFood(@PathVariable Integer id, @RequestBody RestaurantFood f) {
        f.setRestaurantId(id);
        return ApiResponse.ok(menuService.saveFood(f));
    }

    @PutMapping("/restaurants/foods/{foodId}")
    public ApiResponse<RestaurantFood> updateFood(@PathVariable Integer foodId, @RequestBody RestaurantFood f) {
        return ApiResponse.ok(menuService.updateFood(foodId, f));
    }

    @DeleteMapping("/restaurants/foods/{foodId}")
    public ApiResponse<Void> deleteFood(@PathVariable Integer foodId) {
        menuService.deleteFood(foodId);
        return ApiResponse.ok();
    }

    // ---------- 价格对比矩阵 ----------

    @GetMapping("/price/compare")
    public ApiResponse<Map<String, Object>> comparePrices(@RequestParam(defaultValue = "restaurant") String mode) {
        return ApiResponse.ok(menuService.comparePrices(mode));
    }
}
