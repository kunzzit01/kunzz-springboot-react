package com.kunzz.inventory.dto;

import com.kunzz.inventory.common.ProductName;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.time.LocalTime;

public record StockDataRequest(
        LocalDate date,
        LocalTime time,
        @NotBlank(message = "产品编号不能为空") String productCode,
        @NotBlank(message = "产品名称不能为空") String productName,
        String specification,
        String category,
        @NotBlank(message = "供应商不能为空") String supplier,
        String applicant,
        String approver,
        String systemAssign,
        String freezerCategory
) {
    /** 货品名先规范化（2026-09-24）：避免名字里夹不可见字符，让同一条货品裂成两行 */
    public StockDataRequest {
        productName = ProductName.normalize(productName);
    }
}
