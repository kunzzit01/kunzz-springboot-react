package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.JobApplication;
import com.kunzz.inventory.entity.JobPosition;
import com.kunzz.inventory.repository.JobPositionRepository;
import com.kunzz.inventory.service.JobService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class JobController {

    private final JobService jobService;
    private final JobPositionRepository jobPositionRepository;

    /**
     * 官网职位 API：兼容老系统 get_jobs_api.php 的返回格式
     * { success: true, companies: { "KUNZZ HOLDINGS": { name, jobs: [...] } } }
     */
    @GetMapping("/jobs/website")
    public Map<String, Object> websiteJobs(@RequestParam(defaultValue = "zh") String lang) {
        Map<String, Object> companies = new LinkedHashMap<>();
        List<JobPosition> jobs = jobPositionRepository.findAllByOrderByPublishDateDescIdDesc();
        for (JobPosition job : jobs) {
            if (job.getLanguage() != null && !job.getLanguage().isBlank()
                    && !job.getLanguage().equalsIgnoreCase(lang)) {
                continue;
            }
            String company = job.getCompanyCategory() == null || job.getCompanyCategory().isBlank()
                    ? "KUNZZ HOLDINGS" : job.getCompanyCategory();
            companies.computeIfAbsent(company, k -> {
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("name", k);
                c.put("jobs", new java.util.ArrayList<>());
                return c;
            });
            Map<String, Object> jobData = new LinkedHashMap<>();
            jobData.put("id", job.getId());
            jobData.put("title", job.getJobTitle());
            jobData.put("count", job.getRecruitmentCount());
            jobData.put("experience", job.getWorkExperience());
            jobData.put("publish_date", job.getPublishDate());
            jobData.put("description", job.getJobDescription());
            jobData.put("address", job.getCompanyLocation() == null ? "待定" : job.getCompanyLocation());
            jobData.put("department", job.getCompanyDepartment() == null ? "" : job.getCompanyDepartment());
            jobData.put("salary", job.getSalary() == null ? "" : job.getSalary());
            ((List<Map<String, Object>>) ((Map<String, Object>) companies.get(company)).get("jobs")).add(jobData);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("companies", companies);
        return response;
    }

    // ---------- 职位 ----------

    @GetMapping("/jobs")
    public ApiResponse<List<JobPosition>> listPositions() {
        return ApiResponse.ok(jobService.listPositions());
    }

    @PostMapping("/jobs")
    public ApiResponse<JobPosition> createPosition(@RequestBody JobPosition p) {
        return ApiResponse.ok(jobService.createPosition(p));
    }

    @PutMapping("/jobs/{id}")
    public ApiResponse<JobPosition> updatePosition(@PathVariable Integer id, @RequestBody JobPosition patch) {
        return ApiResponse.ok(jobService.updatePosition(id, patch));
    }

    @DeleteMapping("/jobs/{id}")
    public ApiResponse<Void> deletePosition(@PathVariable Integer id) {
        jobService.deletePosition(id);
        return ApiResponse.ok();
    }

    // ---------- 申请 ----------

    @GetMapping("/applications")
    public ApiResponse<?> listApplications(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String company,
            @RequestParam(required = false) String jobTitle,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String dateStart,
            @RequestParam(required = false) String dateEnd,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        if (pageSize >= 5000) {
            // 全量拉取模式（对齐线上 loadRawData 的 page_size=2000）
            List<JobApplication> all = jobService.listApplications();
            Map<String, Object> data = new java.util.LinkedHashMap<>();
            data.put("list", all);
            data.put("total", all.size());
            data.put("totalPages", 1);
            return ApiResponse.ok(data);
        }
        java.time.LocalDate ds = dateStart == null || dateStart.isBlank() ? null : java.time.LocalDate.parse(dateStart);
        java.time.LocalDate de = dateEnd == null || dateEnd.isBlank() ? null : java.time.LocalDate.parse(dateEnd);
        var r = jobService.listApplicationsFiltered(keyword, company, jobTitle, status, ds, de, page, pageSize);
        Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("list", r.items());
        data.put("total", r.total());
        data.put("totalPages", (int) Math.max(1, Math.ceil((double) r.total() / pageSize)));
        return ApiResponse.ok(data);
    }

    @GetMapping("/applications/pending-count")
    public ApiResponse<Long> pendingCount() {
        return ApiResponse.ok(jobService.pendingCount());
    }

    @PutMapping("/applications/{id}")
    public ApiResponse<JobApplication> updateApplication(@PathVariable Integer id, @RequestBody Map<String, Object> patch) {
        return ApiResponse.ok(jobService.updateApplication(id, patch));
    }

    @DeleteMapping("/applications/{id}")
    public ApiResponse<Void> deleteApplication(@PathVariable Integer id) {
        jobService.deleteApplication(id);
        return ApiResponse.ok();
    }

    // ---------- 官网应聘提交（加入我们，multipart） ----------

    @PostMapping(value = "/applications", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<JobApplication> createApplication(
            @RequestParam(required = false) String company_name,
            @RequestParam(required = false) String job_title,
            @RequestParam(required = false) String chinese_name,
            @RequestParam(required = false) String english_name,
            @RequestParam(required = false) String gender,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String phone_code,
            @RequestParam(required = false) String phone_number,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) String position,
            @RequestParam(required = false) String country_code,
            @RequestParam(required = false) org.springframework.web.multipart.MultipartFile resume) {
        Map<String, String> fields = new java.util.LinkedHashMap<>();
        fields.put("company_name", company_name);
        fields.put("job_title", job_title != null ? job_title : position);
        fields.put("chinese_name", chinese_name);
        fields.put("english_name", english_name);
        fields.put("gender", gender);
        fields.put("email", email);
        fields.put("phone_code", phone_code != null ? phone_code : country_code);
        fields.put("phone_number", phone_number != null ? phone_number : phone);
        return ApiResponse.ok(jobService.createApplication(fields, resume));
    }
}
