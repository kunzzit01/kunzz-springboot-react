package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 餐厅食品/价格（映射 restaurant_foods） */
@Getter @Setter @NoArgsConstructor
@Entity @Table(name = "restaurant_foods")
public class RestaurantFood {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "restaurant_id") private Integer restaurantId;
    @Column(name = "food_name", length = 200) private String foodName;
    @Column(name = "food_type", length = 100) private String foodType;
    @Column(name = "price", precision = 10, scale = 2) private BigDecimal price;
}
