package com.kunzz.inventory.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.NoArgsConstructor;

@Entity
@NoArgsConstructor
@Table(name = "j3stocklist_total")
public class J3StockTotal extends BaseBranchStockTotal {
}
