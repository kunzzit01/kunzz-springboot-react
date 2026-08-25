package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.EvaluationCriteriaConfig;
import com.kunzz.inventory.entity.EvaluationCriteriaStandard;
import com.kunzz.inventory.entity.EvaluationForm;
import com.kunzz.inventory.entity.EvaluationFormDetail;
import com.kunzz.inventory.service.EvaluationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/evaluation")
@RequiredArgsConstructor
public class EvaluationController {

    private final EvaluationService evaluationService;

    // ---------- 标准配置 ----------

    @GetMapping("/configs")
    public ApiResponse<List<EvaluationCriteriaConfig>> listConfigs() {
        return ApiResponse.ok(evaluationService.listConfigs());
    }

    @PostMapping("/configs")
    public ApiResponse<EvaluationCriteriaConfig> saveConfig(@RequestBody EvaluationCriteriaConfig c) {
        return ApiResponse.ok(evaluationService.saveConfig(c));
    }

    @DeleteMapping("/configs/{id}")
    public ApiResponse<Void> deleteConfig(@PathVariable Integer id) {
        evaluationService.deleteConfig(id);
        return ApiResponse.ok();
    }

    // ---------- 评分标准 ----------

    @GetMapping("/standards")
    public ApiResponse<List<EvaluationCriteriaStandard>> listStandards() {
        return ApiResponse.ok(evaluationService.listStandards());
    }

    @PostMapping("/standards")
    public ApiResponse<List<EvaluationCriteriaStandard>> saveStandards(@RequestBody List<EvaluationCriteriaStandard> items) {
        return ApiResponse.ok(evaluationService.saveStandards(items));
    }

    @DeleteMapping("/standards/{id}")
    public ApiResponse<Void> deleteStandard(@PathVariable Integer id) {
        evaluationService.deleteStandard(id);
        return ApiResponse.ok();
    }

    // ---------- 表单 ----------

    @GetMapping("/forms")
    public ApiResponse<List<EvaluationForm>> listForms() {
        return ApiResponse.ok(evaluationService.listForms());
    }

    @GetMapping("/forms/{id}/details")
    public ApiResponse<List<EvaluationFormDetail>> listDetails(@PathVariable Integer id) {
        return ApiResponse.ok(evaluationService.listDetails(id));
    }

    /** 创建表单 + 明细 */
    @PostMapping("/forms")
    public ApiResponse<EvaluationForm> createForm(@RequestBody Map<String, Object> body) {
        EvaluationForm form = new EvaluationForm();
        form.setFormName(str(body, "formName"));
        form.setDepartment(str(body, "department"));
        form.setRestaurant(str(body, "restaurant"));
        form.setEvaluatorName(str(body, "evaluatorName"));
        if (body.get("evaluationDate") != null) {
            form.setEvaluationDate(java.time.LocalDate.parse(String.valueOf(body.get("evaluationDate"))));
        }
        form.setCreatedBy(str(body, "createdBy"));
        List<EvaluationFormDetail> details = new java.util.ArrayList<>();
        Object d = body.get("details");
        if (d instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    EvaluationFormDetail detail = new EvaluationFormDetail();
                    detail.setEmployeeName(str(m, "employeeName"));
                    detail.setEmployeeId(num(m, "employeeId"));
                    detail.setCriteria1(str(m, "criteria1"));
                    detail.setCriteria2(str(m, "criteria2"));
                    detail.setCriteria3(str(m, "criteria3"));
                    detail.setCriteria4(str(m, "criteria4"));
                    detail.setCriteria5(str(m, "criteria5"));
                    detail.setCriteria6(str(m, "criteria6"));
                    detail.setCriteria7(str(m, "criteria7"));
                    detail.setNotes(str(m, "notes"));
                    details.add(detail);
                }
            }
        }
        return ApiResponse.ok(evaluationService.createForm(form, details));
    }

    @DeleteMapping("/forms/{id}")
    public ApiResponse<Void> deleteForm(@PathVariable Integer id) {
        evaluationService.deleteForm(id);
        return ApiResponse.ok();
    }

    private String str(Map<?, ?> m, String key) {
        Object v = m.get(key);
        return v == null ? null : String.valueOf(v);
    }

    private Integer num(Map<?, ?> m, String key) {
        Object v = m.get(key);
        if (v == null) return null;
        try { return ((Number) v).intValue(); } catch (Exception e) { return null; }
    }
}
