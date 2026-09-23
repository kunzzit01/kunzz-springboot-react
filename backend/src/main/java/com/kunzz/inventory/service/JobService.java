package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.PageResult;
import com.kunzz.inventory.entity.JobApplication;
import com.kunzz.inventory.entity.JobPosition;
import com.kunzz.inventory.entity.OperationLog;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.repository.JobApplicationRepository;
import com.kunzz.inventory.repository.JobPositionRepository;
import com.kunzz.inventory.repository.OperationLogRepository;
import com.kunzz.inventory.repository.UserRepository;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
    private final OperationLogRepository operationLogRepo;
    private final UserRepository userRepo;

    /** 可以把应聘者转交给谁：HR 部门 + 老板（users.account_type 枚举里本来就有 'hr'） */
    private static final List<String> HANDLER_ACCOUNT_TYPES = List.of("hr", "special");

    /** 跟进记录挂在 operation_logs.target 上的前缀（一张表可承载多种业务对象） */
    private static final String LOG_TARGET_PREFIX = "job_application:";

    /** 认领结果：claimed=false 表示这条已被别人认领（并发竞争的正常结果，不是错误） */
    public record ClaimResult(boolean claimed, JobApplication application, String handlerName) {}

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
    public JobApplication updateApplication(Integer id, Map<String, Object> patch, User me) {
        JobApplication a = applicationRepo.findById(id)
                .orElseThrow(() -> new BusinessException(404, "申请不存在"));
        requireHandler(a, me, "修改");
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

    // ---------- 处理人归属：认领 / 转交 / 释放 ----------

    /**
     * 认领：谁点开详情谁接手。
     * 已被别人认领时返回 claimed=false（并发竞争的正常结果，交给前端切只读，不当错误抛）。
     */
    @Transactional
    public ClaimResult claim(Integer id, User me) {
        JobApplication a = applicationRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(404, "申请不存在"));
        if (a.getHandlerId() != null) {
            if (a.getHandlerId().equals(me.getId())) {
                return new ClaimResult(true, a, a.getHandlerName()); // 本来就是我的，幂等
            }
            return new ClaimResult(false, a, a.getHandlerName());
        }
        a.setHandlerId(me.getId());
        a.setHandlerName(me.getDisplayName());
        a.setClaimedAt(LocalDateTime.now());
        JobApplication saved = applicationRepo.save(a);
        writeLog(me, "认领", id, null);
        return new ClaimResult(true, saved, saved.getHandlerName());
    }

    /** 转交给另一位 HR（本人或老板） */
    @Transactional
    public JobApplication transfer(Integer id, User me, Integer targetUserId) {
        JobApplication a = applicationRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(404, "申请不存在"));
        // 转交不要求「你必须是当前处理人」：任何工作人员都可以把一条申请转给别人
        // （2026-09-23 用户要求：处理人休假/转岗时不该被卡住）
        if (targetUserId == null) throw new BusinessException(400, "请选择要转交的人");
        if (targetUserId.equals(me.getId())) throw new BusinessException(400, "不能转交给自己");
        User target = userRepo.findById(targetUserId)
                .orElseThrow(() -> new BusinessException(404, "转交对象不存在"));
        if (!HANDLER_ACCOUNT_TYPES.contains(String.valueOf(target.getAccountType()))) {
            throw new BusinessException(400, "只能转交给 HR 部门成员");
        }
        // 选中的就是当前处理人 → 什么都不用做，别写一条「转交给 X（原处理人 X）」的荒唐记录
        if (target.getId().equals(a.getHandlerId())) {
            throw new BusinessException(400, "该申请已经由 " + target.getDisplayName() + " 处理");
        }
        String previous = a.getHandlerName();
        a.setHandlerId(target.getId());
        a.setHandlerName(target.getDisplayName());
        a.setClaimedAt(LocalDateTime.now());
        JobApplication saved = applicationRepo.save(a);
        writeLog(me, "转交", id, "转交给 " + target.getDisplayName()
                + (previous == null ? "（原为未认领）" : "（原处理人 " + previous + "）"));
        return saved;
    }

    /** 释放回「未认领」（认领错了 / 人要离职） */
    @Transactional
    public JobApplication release(Integer id, User me) {
        JobApplication a = applicationRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(404, "申请不存在"));
        if (!isSpecial(me) && !me.getId().equals(a.getHandlerId())) {
            throw new BusinessException(409, "该申请当前由 " + handlerLabel(a) + " 处理，你无法释放");
        }
        String previous = a.getHandlerName();
        a.setHandlerId(null);
        a.setHandlerName(null);
        a.setClaimedAt(null);
        JobApplication saved = applicationRepo.save(a);
        writeLog(me, "释放", id, previous == null ? null : "原处理人 " + previous);
        return saved;
    }

    /** 强制接管：仅老板（account_type=special）—— 处理人离职/忘记释放时兜底 */
    @Transactional
    public JobApplication takeover(Integer id, User me) {
        if (!isSpecial(me)) throw new BusinessException(403, "只有管理员可以强制接管");
        JobApplication a = applicationRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(404, "申请不存在"));
        String previous = a.getHandlerName();
        a.setHandlerId(me.getId());
        a.setHandlerName(me.getDisplayName());
        a.setClaimedAt(LocalDateTime.now());
        JobApplication saved = applicationRepo.save(a);
        writeLog(me, "强制接管", id, previous == null ? "原为未认领" : "原处理人 " + previous);
        return saved;
    }

    /** 可转交的人员名单（HR + 老板），排除自己 */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> handlerOptions(Integer excludeUserId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (User u : userRepo.findAll()) {
            if (!HANDLER_ACCOUNT_TYPES.contains(String.valueOf(u.getAccountType()))) continue;
            if (u.getId().equals(excludeUserId)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("name", u.getDisplayName());
            m.put("position", u.getPosition());
            out.add(m);
        }
        return out;
    }

    /** 某条申请的跟进记录（认领 / 转交 / 释放 / 强制接管） */
    @Transactional(readOnly = true)
    public List<OperationLog> applicationLogs(Integer id) {
        return operationLogRepo.findTop50ByTargetOrderByCreatedAtDesc(LOG_TARGET_PREFIX + id);
    }

    /**
     * 归属校验：这条已被别人认领时，非处理人（且非老板）不许改。
     * 前端 UI 已经拦住了，这里是纵深防御 —— 直接调 API 也改不动别人的应聘者。
     */
    private void requireHandler(JobApplication a, User me, String verb) {
        if (a.getHandlerId() == null) return; // 未认领：放行（正常 UI 流程下打开详情即已认领）
        if (me != null && a.getHandlerId().equals(me.getId())) return;
        if (isSpecial(me)) return;
        throw new BusinessException(409, "该申请由 " + handlerLabel(a) + " 跟进中，你无法" + verb);
    }

    private static String handlerLabel(JobApplication a) {
        return a.getHandlerName() == null ? "其他 HR" : a.getHandlerName();
    }

    private static boolean isSpecial(User u) {
        return u != null && "special".equalsIgnoreCase(String.valueOf(u.getAccountType()));
    }

    /** 写一条跟进记录到已有的 operation_logs 表（本仓库首次启用这张表） */
    private void writeLog(User me, String action, Integer applicationId, String detail) {
        OperationLog log = new OperationLog();
        log.setOperator(me == null ? null : me.getDisplayName());
        log.setAction(action);
        log.setTarget(LOG_TARGET_PREFIX + applicationId);
        log.setDetail(detail);
        operationLogRepo.save(log);
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
