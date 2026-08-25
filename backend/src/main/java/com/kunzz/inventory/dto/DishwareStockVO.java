package com.kunzz.inventory.dto;

import com.kunzz.inventory.entity.DishwareInfo;
import com.kunzz.inventory.entity.DishwareStock;

import java.math.BigDecimal;

/**
 * 碗碟 + 库存联合视图
 */
public record DishwareStockVO(
        Integer id,
        Integer dishwareId,
        String productName,
        String codeNumber,
        String category,
        String size,
        BigDecimal unitPrice,
        String photoPath,
        Integer wenhuaQuantity,
        Integer centralQuantity,
        Integer j1Quantity,
        Integer j2Quantity,
        Integer j3Quantity,
        Integer totalQuantity
) {
    public static DishwareStockVO from(DishwareInfo info, DishwareStock stock) {
        return new DishwareStockVO(
                stock == null ? null : stock.getId(),
                info.getId(),
                info.getProductName(),
                info.getCodeNumber(),
                info.getCategory(),
                info.getSize(),
                info.getUnitPrice(),
                info.getPhotoPath(),
                stock == null ? 0 : stock.getWenhuaQuantity(),
                stock == null ? 0 : stock.getCentralQuantity(),
                stock == null ? 0 : stock.getJ1Quantity(),
                stock == null ? 0 : stock.getJ2Quantity(),
                stock == null ? 0 : stock.getJ3Quantity(),
                stock == null ? 0 : stock.getTotalQuantity()
        );
    }
}
