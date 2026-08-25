import { useState } from 'react';

import { useJoinSlideAnimation } from '../../../hooks/useJoinSlideAnimation.js';
import { useIsMobile } from '../../../hooks/useIsMobile.js';
import { useJobs } from '../../../hooks/useJobs.js';

const COMPANY_TAB_LABELS = {
  'KUNZZ HOLDINGS': 'KUNZZ',
  'TOKYO JAPANESE CUISINE': 'TOKYO',
  'TOKYO IZAKAYA': 'IZAKAYA',
};

function TokyoJobs({ jobs, deptOrder, deptDisplay, onJobClick }) {
  const departmentJobs = {};
  jobs.forEach((job) => {
    const dept = job.department || '其他';
    if (!departmentJobs[dept]) departmentJobs[dept] = [];
    departmentJobs[dept].push(job);
  });

  return (
    <>
      {deptOrder.map((dept) => {
        const list = departmentJobs[dept];
        if (!list?.length) return null;
        const jobCount = list.length;
        const singleJobClass = jobCount === 1 ? ' single-job' : '';

        return (
          <div className="department-section" key={dept}>
            <div className="department-title">{deptDisplay[dept] || dept}</div>
            <div className={`department-jobs${singleJobClass}`}>
              {list.map((job, index) => {
                const isLastOdd =
                  jobCount > 2 && jobCount % 2 === 1 && index === jobCount - 1
                    ? ' last-odd-job'
                    : '';
                return (
                  <div
                    key={job.id}
                    className={`job-item${isLastOdd}`}
                    data-job-id={job.id}
                    onClick={() => onJobClick(job.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onJobClick(job.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="job-item-title">{job.title}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function CompanyJobCard({ company, deptOrder, deptDisplay, onJobClick }) {
  return (
    <div className="company-job-container">
      <h3 className="company-title">{company.name}</h3>
      <div className="company-jobs-list">
        {company.jobs.length === 0 ? (
          <div className="no-jobs-company">暂无职位</div>
        ) : company.name === 'TOKYO JAPANESE CUISINE' || company.name === 'TOKYO IZAKAYA' ? (
          <TokyoJobs
            jobs={company.jobs}
            deptOrder={deptOrder}
            deptDisplay={deptDisplay}
            onJobClick={onJobClick}
          />
        ) : (
          company.jobs.map((job) => (
            <div
              key={job.id}
              className="job-item"
              data-job-id={job.id}
              onClick={() => onJobClick(job.id)}
              onKeyDown={(e) => e.key === 'Enter' && onJobClick(job.id)}
              role="button"
              tabIndex={0}
            >
              <div className="job-item-title">{job.title}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function JoinJobs({ onJobClick }) {
  const isMobile = useIsMobile();
  const [activeCompany, setActiveCompany] = useState(0);
  const tableRef = useJoinSlideAnimation('job-table-container', 'job-table-loaded');
  const { companies, loading, error, deptOrder, deptDisplay } = useJobs('zh');

  const safeActiveIndex = Math.min(activeCompany, Math.max(companies.length - 1, 0));
  const activeCompanyData = companies[safeActiveIndex];

  return (
    <div className={`job-section${isMobile ? ' job-section--mobile-pure' : ''}`}>
      <div ref={tableRef} className="job-table-container">
        <h2 className="job-table-title">目前在招聘的职位</h2>
      </div>

      {loading ? <div className="no-jobs">加载职位中…</div> : null}
      {error ? <div className="no-jobs">职位数据加载失败，请确认 XAMPP 与数据库已启动</div> : null}

      {!loading && !error && isMobile ? (
        <>
          <div className="jobs-company-tabs" role="tablist" aria-label="选择公司">
            {companies.map((company, index) => (
              <button
                key={company.name}
                type="button"
                role="tab"
                aria-selected={safeActiveIndex === index}
                className={`jobs-company-tab${safeActiveIndex === index ? ' active' : ''}`}
                onClick={() => setActiveCompany(index)}
              >
                {COMPANY_TAB_LABELS[company.name] || company.name}
              </button>
            ))}
          </div>
          <div className="jobs-wrapper jobs-wrapper--tabbed">
            {activeCompanyData ? (
              <CompanyJobCard
                company={activeCompanyData}
                deptOrder={deptOrder}
                deptDisplay={deptDisplay}
                onJobClick={onJobClick}
              />
            ) : null}
          </div>
        </>
      ) : null}

      {!loading && !error && !isMobile ? (
        <div className="jobs-wrapper">
          <div className="jobs-container">
            {companies.map((company) => (
              <CompanyJobCard
                key={company.name}
                company={company}
                deptOrder={deptOrder}
                deptDisplay={deptDisplay}
                onJobClick={onJobClick}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
