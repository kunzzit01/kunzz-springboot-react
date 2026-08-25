package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.RestaurantFood;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RestaurantFoodRepository extends JpaRepository<RestaurantFood, Integer> {
    List<RestaurantFood> findByRestaurantIdOrderByIdAsc(Integer restaurantId);
}
