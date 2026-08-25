package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.service.StockExcelService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 进出货 Excel 导出（对齐线上 export_branch_stock_excel.php）
 */
@RestController
@RequiredArgsConstructor
public class StockExcelController {

    private final StockExcelService stockExcelService;

    @GetMapping("/api/stock/export-excel")
    public ResponseEntity<byte[]> exportExcel(
            @RequestParam String system,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "true") boolean includeIn,
            @RequestParam(defaultValue = "true") boolean includeOut) {
        try {
            byte[] body = stockExcelService.buildPdf(system, startDate, endDate, includeIn, includeOut);
            String filename = system.toUpperCase() + "_STOCK_"
                    + (startDate == null ? "" : startDate.replace("-", ""))
                    + "_" + (endDate == null ? "" : endDate.replace("-", "")) + ".pdf";
            String encoded = java.net.URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + encoded)
                    .contentType(MediaType.APPLICATION_PDF)
                    .body(body);
        } catch (Exception e) {
            throw new BusinessException("PDF 导出失败: " + e.getMessage());
        }
    }

    /** 进出货导出数据（前端 jsPDF 生成 PDF 用） */
    @GetMapping("/api/stock/export-data")
    public ApiResponse<List<Map<String, Object>>> exportData(
            @RequestParam String system,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "true") boolean includeIn,
            @RequestParam(defaultValue = "true") boolean includeOut) {
        return ApiResponse.ok(stockExcelService.buildData(system, startDate, endDate, includeIn, includeOut));
    }

    /** 中央出库数据（前端 pdf-lib 生成 invoice PDF 用，对齐旧系统 confirmExport） */
    @GetMapping("/api/stock/export-invoice-data")
    public ApiResponse<List<Map<String, Object>>> invoiceData(
            @RequestParam String system,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ApiResponse.ok(stockExcelService.invoiceData(system, startDate, endDate));
    }

    /** 分店导出 PDF（对齐旧系统 export_branch_stock_excel.php 内容：jXstockinout_data 入库，8 列） */
    @GetMapping("/api/stock/export-branch-excel")
    public ResponseEntity<byte[]> exportBranchExcel(
            @RequestParam String system,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            byte[] body = stockExcelService.buildBranchPdf(system, startDate, endDate);
            String filename = system.toUpperCase() + "_stock_" + (startDate == null ? "" : startDate.replace("-", ""))
                    + "_to_" + (endDate == null ? "" : endDate.replace("-", "")) + ".pdf";
            String encoded = java.net.URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + encoded)
                    .contentType(MediaType.APPLICATION_PDF)
                    .body(body);
        } catch (Exception e) {
            throw new BusinessException("PDF 导出失败: " + e.getMessage());
        }
    }
}
