package com.kunzz.inventory.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.NoArgsConstructor;

@Entity
@NoArgsConstructor
@Table(name = "j2stocklist_total")
public class J2StockTotal extends BaseBranchStockTotal {
}
