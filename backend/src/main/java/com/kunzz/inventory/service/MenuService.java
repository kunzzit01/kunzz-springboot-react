package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 菜单管理 + 菜单成本 + 餐厅食品 + 价格对比
 */
@Service
@RequiredArgsConstructor
public class MenuService {

    private final MenuCategoryRepository categoryRepo;
    private final MenuRepository menuRepo;
    private final MenuItemRepository itemRepo;
    private final MenuItemIngredientRepository ingredientRepo;
    private final MenuCostDataRepository costDataRepo;
    private final RestaurantRepository restaurantRepo;
    private final RestaurantFoodRepository foodRepo;
    private final SupplyRepository supplyRepo;
    private final SupplyMaterialRepository supplyMaterialRepo;

    // ---------- 菜单分类 / 菜单项 ----------

    @Transactional(readOnly = true)
    public List<MenuCategory> listCategories() {
        return categoryRepo.findAllByOrderBySortOrderAscIdAsc();
    }

    @Transactional
    public MenuCategory saveCategory(MenuCategory c) {
        return categoryRepo.save(c);
    }

    @Transactional
    public void deleteCategory(Integer id) {
        categoryRepo.deleteById(id);
    }

    @Transactional(readOnly = true)
    public List<Menu> listMenus(Integer categoryId) {
        if (categoryId == null) {
            return menuRepo.findAllByOrderBySortOrderAscIdAsc();
        }
        return menuRepo.findByCategoryIdOrderBySortOrderAscIdAsc(categoryId);
    }

    @Transactional
    public Menu saveMenu(Menu m) {
        return menuRepo.save(m);
    }

    @Transactional
    public void deleteMenu(Integer id) {
        menuRepo.deleteById(id);
    }

    // ---------- 菜单成本（menu_items + 配料） ----------

    @Transactional(readOnly = true)
    public List<MenuItem> listItems() {
        return itemRepo.findAllByOrderByIdAsc();
    }

    @Transactional
    public MenuItem saveItem(MenuItem item) {
        return itemRepo.save(item);
    }

    @Transactional
    public void deleteItem(Integer id) {
        ingredientRepo.deleteByMenuItemId(id);
        itemRepo.deleteById(id);
    }

    @Transactional(readOnly = true)
    public List<MenuItemIngredient> listIngredients(Integer itemId) {
        return ingredientRepo.findByMenuItemIdOrderBySortOrderAsc(itemId);
    }

    /** 全量保存配料 */
    @Transactional
    public void saveIngredients(Integer itemId, List<MenuItemIngredient> ingredients) {
        itemRepo.findById(itemId).orElseThrow(() -> new BusinessException(404, "菜单项不存在"));
        ingredientRepo.deleteByMenuItemId(itemId);
        int sort = 1;
        for (MenuItemIngredient ig : ingredients) {
            ig.setMenuItemId(itemId);
            ig.setSortOrder(sort++);
            ingredientRepo.save(ig);
        }
    }

    @Transactional(readOnly = true)
    public List<MenuCostData> listCostData() {
        return costDataRepo.findAllByOrderByProductNameAsc();
    }

    @Transactional
    public MenuCostData saveCostData(MenuCostData d) {
        return costDataRepo.save(d);
    }

    @Transactional
    public void deleteCostData(Integer id) {
        costDataRepo.deleteById(id);
    }

    // ---------- 餐厅 / 食品 / 价格对比 ----------

    @Transactional(readOnly = true)
    public List<Restaurant> listRestaurants() {
        return restaurantRepo.findAllByOrderByDisplayOrderAscIdAsc();
    }

    @Transactional
    public Restaurant saveRestaurant(Restaurant r) {
        return restaurantRepo.save(r);
    }

    @Transactional
    public void deleteRestaurant(Integer id) {
        foodRepo.findByRestaurantIdOrderByIdAsc(id).forEach(foodRepo::delete);
        restaurantRepo.deleteById(id);
    }

    @Transactional(readOnly = true)
    public List<RestaurantFood> listFoods(Integer restaurantId) {
        return foodRepo.findByRestaurantIdOrderByIdAsc(restaurantId);
    }

    @Transactional
    public RestaurantFood saveFood(RestaurantFood f) {
        return foodRepo.save(f);
    }

    @Transactional
    public RestaurantFood updateFood(Integer id, RestaurantFood f) {
        RestaurantFood existing = foodRepo.findById(id)
                .orElseThrow(() -> new BusinessException("食品记录不存在"));
        if (f.getFoodName() != null && !f.getFoodName().isBlank()) existing.setFoodName(f.getFoodName());
        existing.setFoodType(f.getFoodType());
        existing.setPrice(f.getPrice());
        return foodRepo.save(existing);
    }

    @Transactional
    public void deleteFood(Integer id) {
        foodRepo.deleteById(id);
    }

    // ---------- 价格对比矩阵（餐厅对比 / 批发商对比） ----------

    /**
     * 返回价格对比矩阵：
     * restaurant 模式 → columns=餐厅列表，rows 按 food_name 聚合，prices={restaurantId: price}
     * supplier 模式 → columns=批发商列表，rows 按 material_name 聚合，prices={supplyId: price}
     */
    @Transactional(readOnly = true)
    public Map<String, Object> comparePrices(String mode) {
        Map<String, Object> result = new LinkedHashMap<>();
        if ("supplier".equalsIgnoreCase(mode)) {
            List<Supply> columns = supplyRepo.findAllByOrderByIdAsc();
            List<Map<String, Object>> rows = new ArrayList<>();
            Set<String> types = new LinkedHashSet<>();
            Map<String, List<SupplyMaterial>> byName = supplyMaterialRepo.findAll().stream()
                    .collect(Collectors.groupingBy(SupplyMaterial::getMaterialName, LinkedHashMap::new, Collectors.toList()));
            for (Map.Entry<String, List<SupplyMaterial>> e : byName.entrySet()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("name", e.getKey());
                Map<String, Object> cells = new LinkedHashMap<>();
                String type = null;
                for (SupplyMaterial m : e.getValue()) {
                    if (m.getMaterialType() != null && type == null) type = m.getMaterialType();
                    if (m.getPrice() != null) {
                        Map<String, Object> cell = new LinkedHashMap<>();
                        cell.put("id", m.getId());
                        cell.put("price", m.getPrice());
                        cells.put(String.valueOf(m.getSupplyId()), cell);
                    }
                }
                row.put("type", type);
                row.put("cells", cells);
                if (type != null && !type.isBlank()) types.add(type);
                rows.add(row);
            }
            List<Map<String, Object>> cols = new ArrayList<>();
            for (Supply s : columns) {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("id", s.getId());
                c.put("label", s.getName());
                cols.add(c);
            }
            result.put("mode", "supplier");
            result.put("columns", cols);
            result.put("rows", rows);
            result.put("types", new ArrayList<>(types));
        } else {
            // 默认：餐厅对比
            List<Restaurant> columns = restaurantRepo.findAllByOrderByDisplayOrderAscIdAsc();
            List<Map<String, Object>> rows = new ArrayList<>();
            Set<String> types = new LinkedHashSet<>();
            Map<String, List<RestaurantFood>> byName = foodRepo.findAll().stream()
                    .collect(Collectors.groupingBy(RestaurantFood::getFoodName, LinkedHashMap::new, Collectors.toList()));
            for (Map.Entry<String, List<RestaurantFood>> e : byName.entrySet()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("name", e.getKey());
                Map<String, Object> cells = new LinkedHashMap<>();
                String type = null;
                for (RestaurantFood f : e.getValue()) {
                    if (f.getFoodType() != null && type == null) type = f.getFoodType();
                    if (f.getPrice() != null) {
                        Map<String, Object> cell = new LinkedHashMap<>();
                        cell.put("id", f.getId());
                        cell.put("price", f.getPrice());
                        cells.put(String.valueOf(f.getRestaurantId()), cell);
                    }
                }
                row.put("type", type);
                row.put("cells", cells);
                if (type != null && !type.isBlank()) types.add(type);
                rows.add(row);
            }
            List<Map<String, Object>> cols = new ArrayList<>();
            for (Restaurant r : columns) {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("id", r.getId());
                c.put("label", r.getNameCn() != null ? r.getNameCn() : (r.getNameEn() != null ? r.getNameEn() : r.getName()));
                cols.add(c);
            }
            result.put("mode", "restaurant");
            result.put("columns", cols);
            result.put("rows", rows);
            result.put("types", new ArrayList<>(types));
        }
        return result;
    }
}
