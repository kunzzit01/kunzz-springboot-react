package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 餐厅（映射 restaurants） */
@Getter @Setter @NoArgsConstructor
@Entity @Table(name = "restaurants")
public class Restaurant {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "name_cn", length = 100) private String nameCn;
    @Column(name = "name_en", length = 100) private String nameEn;
    @Column(name = "name", length = 100) private String name;
    @Column(name = "code", length = 50) private String code;
    @Column(name = "display_order") private Integer displayOrder;
    @Column(name = "is_active") private Boolean isActive;
}
