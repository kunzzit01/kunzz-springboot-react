package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.Restaurant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RestaurantRepository extends JpaRepository<Restaurant, Integer> {
    List<Restaurant> findAllByOrderByDisplayOrderAscIdAsc();
}
