package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.service.CorporateService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/corporate")
@RequiredArgsConstructor
public class CorporateController {

    private final CorporateService corporateService;

    @GetMapping
    public ApiResponse<Map<String, Object>> read() {
        return ApiResponse.ok(corporateService.read());
    }

    @PutMapping
    public ApiResponse<Void> write(@RequestBody Map<String, Object> data) {
        corporateService.write(data);
        return ApiResponse.ok();
    }
}
