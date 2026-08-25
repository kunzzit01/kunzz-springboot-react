package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * 考核表单（对应 evaluation_form，标准配置 + 表单 + 明细评分）
 */
@Service
@RequiredArgsConstructor
public class EvaluationService {

    private final EvaluationCriteriaConfigRepository configRepo;
    private final EvaluationCriteriaStandardRepository standardRepo;
    private final EvaluationFormRepository formRepo;
    private final EvaluationFormDetailRepository detailRepo;

    // ---------- 标准配置 ----------

    @Transactional(readOnly = true)
    public List<EvaluationCriteriaConfig> listConfigs() {
        return configRepo.findAllByOrderByDepartmentAscCriteriaOrderAsc();
    }

    @Transactional
    public EvaluationCriteriaConfig saveConfig(EvaluationCriteriaConfig c) {
        return configRepo.save(c);
    }

    @Transactional
    public void deleteConfig(Integer id) {
        configRepo.deleteById(id);
    }

    // ---------- 评分标准 ----------

    @Transactional(readOnly = true)
    public List<EvaluationCriteriaStandard> listStandards() {
        return standardRepo.findAllByOrderByDepartmentAscCriteriaOrderAsc();
    }

    /** 批量保存标准（upsert：按 部门+指标顺序+分数 存在则更新，否则插入） */
    @Transactional
    public List<EvaluationCriteriaStandard> saveStandards(List<EvaluationCriteriaStandard> items) {
        List<EvaluationCriteriaStandard> saved = new java.util.ArrayList<>();
        if (items == null) return saved;
        for (EvaluationCriteriaStandard s : items) {
            if (s.getDepartment() == null || s.getCriteriaOrder() == null || s.getScore() == null) continue;
            EvaluationCriteriaStandard existing = standardRepo.findByDepartmentAndCriteriaOrderAndScore(
                    s.getDepartment(), s.getCriteriaOrder(), s.getScore());
            if (existing != null) {
                existing.setDescriptionText(s.getDescriptionText());
                saved.add(standardRepo.save(existing));
            } else {
                saved.add(standardRepo.save(s));
            }
        }
        return saved;
    }

    @Transactional
    public void deleteStandard(Integer id) {
        standardRepo.deleteById(id);
    }

    // ---------- 表单 ----------

    @Transactional(readOnly = true)
    public List<EvaluationForm> listForms() {
        return formRepo.findAllByOrderByEvaluationDateDescIdDesc();
    }

    @Transactional(readOnly = true)
    public List<EvaluationFormDetail> listDetails(Integer formId) {
        return detailRepo.findByFormIdOrderByIdAsc(formId);
    }

    /** 创建表单 + 明细 */
    @Transactional
    public EvaluationForm createForm(EvaluationForm form, List<EvaluationFormDetail> details) {
        EvaluationForm saved = formRepo.save(form);
        if (details != null) {
            for (EvaluationFormDetail d : details) {
                d.setFormId(saved.getId());
                detailRepo.save(d);
            }
        }
        return saved;
    }

    @Transactional
    public void deleteForm(Integer id) {
        if (!formRepo.existsById(id)) {
            throw new BusinessException(404, "表单不存在");
        }
        detailRepo.findByFormIdOrderByIdAsc(id).forEach(detailRepo::delete);
        formRepo.deleteById(id);
    }
}
