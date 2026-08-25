package com.kunzz.inventory.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.NoArgsConstructor;

@Entity
@NoArgsConstructor
@Table(name = "j1stocklist_total")
public class J1StockTotal extends BaseBranchStockTotal {
}
