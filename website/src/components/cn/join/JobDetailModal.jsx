export default function JobDetailModal({ job, onClose, onApply }) {
  if (!job) return null;

  return (
    <div
      id="jobDetailModal"
      className="modal"
      style={{ display: 'flex' }}
      onClick={(e) => e.target.id === 'jobDetailModal' && onClose()}
      onKeyDown={() => {}}
      role="presentation"
    >
      <div className="job-detail-modal">
        <button type="button" className="close-btn" onClick={onClose}>
          &times;
        </button>
        <div className="job-detail-content">
          <h2 id="jobDetailTitle">{job.title}</h2>
          <div className="job-detail-meta">
            <div className="job-detail-item">
              <span className="job-detail-label">人数:</span>
              <span>{job.count}</span>
            </div>
            <div className="job-detail-item">
              <span className="job-detail-label">工作经验:</span>
              <span>{job.experience}</span>
              <span className="job-detail-label"> 年</span>
            </div>
            <div className="job-detail-item">
              <span className="job-detail-label">发布:</span>
              <span>{job.publish_date}</span>
            </div>
            <div className="job-detail-item">
              <span className="job-detail-label">公司:</span>
              <span>{job.company}</span>
            </div>
            {job.department ? (
              <div className="job-detail-item">
                <span className="job-detail-label">部门:</span>
                <span>{job.department}</span>
              </div>
            ) : null}
            {job.salary ? (
              <div className="job-detail-item">
                <span className="job-detail-label">薪资:</span>
                <span>{job.salary}</span>
              </div>
            ) : null}
          </div>
          <div className="job-detail-description">
            <h3>职位详情：</h3>
            <p>{job.description}</p>
          </div>
          <div className="job-detail-address">
            <h3>工作地址：</h3>
            <p>{job.address || '待定'}</p>
          </div>
          <div className="apply-btn-container">
            <button type="button" className="apply-btn" onClick={() => onApply(job)}>
              申请职位
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
