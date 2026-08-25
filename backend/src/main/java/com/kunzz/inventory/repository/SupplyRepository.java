package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.Supply;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SupplyRepository extends JpaRepository<Supply, Integer> {
    List<Supply> findAllByOrderByIdAsc();
}
