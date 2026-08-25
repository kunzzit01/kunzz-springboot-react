package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.CompanyCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CompanyCategoryRepository extends JpaRepository<CompanyCategory, Integer> {
    List<CompanyCategory> findAllByOrderByIdAsc();
}
