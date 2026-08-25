package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J2Daily;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J2DailyRepository extends JpaRepository<J2Daily, Integer> {
    List<J2Daily> findAllByOrderByDateDesc();
}
