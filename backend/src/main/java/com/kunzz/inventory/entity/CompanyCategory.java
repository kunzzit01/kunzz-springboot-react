package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 公司分类（映射老库 company_categories）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "company_categories")
public class CompanyCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "category_name", length = 100)
    private String categoryName;
}
