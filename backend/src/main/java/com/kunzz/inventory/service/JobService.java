package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.PageResult;
import com.kunzz.inventory.entity.JobApplication;
import com.kunzz.inventory.entity.JobPosition;
import com.kunzz.inventory.repository.JobApplicationRepository;
import com.kunzz.inventory.repository.JobPositionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 招聘：职位管理 + 求职申请（对应 hire / job_positions_api / hireapi / resume）
 */
@Service
@RequiredArgsConstructor
public class JobService {

    private final JobPositionRepository positionRepo;
    private final JobApplicationRepository applicationRepo;

    // ---------- 职位 ----------

    @Transactional(readOnly = true)
    public List<JobPosition> listPositions() {
        return positionRepo.findAllByOrderByPublishDateDescIdDesc();
    }

    @Transactional
    public JobPosition createPosition(JobPosition p) {
        return positionRepo.save(p);
    }

    @Transactional
    public JobPosition updatePosition(Integer id, JobPosition patch) {
        JobPosition p = positionRepo.findById(id)
                .orElseThrow(() -> new BusinessException(404, "职位不存在"));
        if (patch.getJobTitle() != null) p.setJobTitle(patch.getJobTitle());
        if (patch.getWorkExperience() != null) p.setWorkExperience(patch.getWorkExperience());
        if (patch.getRecruitmentCount() != null) p.setRecruitmentCount(patch.getRecruitmentCount());
        if (patch.getPublishDate() != null) p.setPublishDate(patch.getPublishDate());
        if (patch.getCompanyCategory() != null) p.setCompanyCategory(patch.getCompanyCategory());
        if (patch.getCompanyDepartment() != null) p.setCompanyDepartment(patch.getCompanyDepartment());
        if (patch.getSalary() != null) p.setSalary(patch.getSalary());
        if (patch.getJobDescription() != null) p.setJobDescription(patch.getJobDescription());
        if (patch.getCompanyLocation() != null) p.setCompanyLocation(patch.getCompanyLocation());
        if (patch.getLanguage() != null) p.setLanguage(patch.getLanguage());
        return positionRepo.save(p);
    }

    @Transactional
    public void deletePosition(Integer id) {
        positionRepo.deleteById(id);
    }

    // ---------- 申请 ----------

    @Transactional(readOnly = true)
    public List<JobApplication> listApplications() {
        return applicationRepo.findAllByOrderByCreatedAtDesc();
    }

    /** 申请列表（动态过滤 + 分页，对齐 hireapi.php action=list） */
    @Transactional(readOnly = true)
    public PageResult<JobApplication> listApplicationsFiltered(
            String keyword, String company, String jobTitle, Integer status,
            LocalDate dateStart, LocalDate dateEnd, int page, int size) {
        Specification<JobApplication> spec = (root, q, cb) -> {
            List<jakarta.persistence.criteria.Predicate> ps = new ArrayList<>();
            if (keyword != null && !keyword.isBlank()) {
                String k = "%" + keyword.trim().toLowerCase() + "%";
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("chineseName")), k),
                        cb.like(cb.lower(root.get("englishName")), k),
                        cb.like(cb.lower(root.get("email")), k),
                        cb.like(cb.lower(root.get("phoneNumber")), k)
                ));
            }
            if (company != null && !company.isBlank()) ps.add(cb.equal(root.get("companyName"), company));
            if (jobTitle != null && !jobTitle.isBlank()) ps.add(cb.equal(root.get("jobTitle"), jobTitle));
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (dateStart != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), dateStart.atStartOfDay()));
            if (dateEnd != null) ps.add(cb.lessThan(root.get("createdAt"), dateEnd.plusDays(1).atStartOfDay()));
            return cb.and(ps.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
        Page<JobApplication> p = applicationRepo.findAll(spec,
                PageRequest.of(Math.max(page - 1, 0), size, Sort.by(Sort.Direction.DESC, "createdAt", "id")));
        return new PageResult<>(p.getTotalElements(), p.getContent());
    }

    @Transactional(readOnly = true)
    public long pendingCount() {
        return applicationRepo.countByStatus(0);
    }

    @Transactional
    public JobApplication updateApplication(Integer id, Map<String, Object> patch) {
        JobApplication a = applicationRepo.findById(id)
                .orElseThrow(() -> new BusinessException(404, "申请不存在"));
        if (patch.containsKey("status")) {
            a.setStatus(((Number) patch.get("status")).intValue());
        }
        Object remarks = patch.get("hrRemarks");
        if (remarks == null) remarks = patch.get("hr_remarks");
        if (remarks != null) {
            a.setHrRemarks(String.valueOf(remarks));
        }
        return applicationRepo.save(a);
    }

    @Transactional
    public void deleteApplication(Integer id) {
        applicationRepo.deleteById(id);
    }

    // ---------- 官网应聘提交（加入我们 → job_applications） ----------

    private final Path resumeDir = Paths.get("data", "uploads").toAbsolutePath().normalize();

    /** 接收官网应聘申请：multipart 表单 + 简历文件 */
    @Transactional
    public JobApplication createApplication(Map<String, String> fields, MultipartFile resume) {
        String companyName = fields.get("company_name");
        String jobTitle = fields.get("job_title");
        String chineseName = fields.get("chinese_name");
        if (companyName == null || companyName.isBlank()) companyName = "KUNZZ HOLDINGS";
        if (jobTitle == null || jobTitle.isBlank()) throw new BusinessException("职位不能为空");
        if (chineseName == null || chineseName.isBlank()) throw new BusinessException("请填写中文姓名");

        JobApplication a = new JobApplication();
        a.setCompanyName(companyName);
        a.setJobTitle(jobTitle);
        a.setChineseName(chineseName);
        a.setEnglishName(emptyToNull(fields.get("english_name")));
        a.setGender(mapGender(fields.get("gender")));
        a.setEmail(emptyToNull(fields.get("email")));
        a.setPhoneCode(emptyToNull(fields.get("phone_code")));
        a.setPhoneNumber(emptyToNull(fields.get("phone_number")));
        a.setStatus(0);

        // 简历文件 → data/uploads/
        if (resume != null && !resume.isEmpty()) {
            a.setResumeFileUrl(saveResume(resume));
        }
        return applicationRepo.save(a);
    }

    private String saveResume(MultipartFile file) {
        try {
            Files.createDirectories(resumeDir);
            String original = file.getOriginalFilename();
            String ext = "";
            if (original != null) {
                int i = original.lastIndexOf('.');
                if (i >= 0) ext = original.substring(i).toLowerCase();
            }
            if (!ext.matches("\\.(pdf|doc|docx)$")) throw new BusinessException("简历仅支持 PDF/DOC/DOCX");
            String name = "resume_" + UUID.randomUUID().toString().substring(0, 8) + ext;
            Files.copy(file.getInputStream(), resumeDir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            return "/api/media/files/" + name;
        } catch (IOException e) {
            throw new BusinessException("简历上传失败: " + e.getMessage());
        }
    }

    private String emptyToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    /** 官网表单性别值为 male/female/other，老库后台按中文显示 */
    private String mapGender(String g) {
        if (g == null) return null;
        return switch (g) {
            case "male" -> "男";
            case "female" -> "女";
            default -> "其他";
        };
    }
}
