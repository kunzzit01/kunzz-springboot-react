package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J1Daily;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J1DailyRepository extends JpaRepository<J1Daily, Integer> {
    List<J1Daily> findAllByOrderByDateDesc();
}
