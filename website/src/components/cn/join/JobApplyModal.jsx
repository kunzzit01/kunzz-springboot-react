import { useState } from 'react';

export default function JobApplyModal({ position, company, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  if (!position) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    // 职位/公司由父级传入，补进表单
    fd.set('job_title', position);
    fd.set('company_name', company || 'KUNZZ HOLDINGS');
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/applications', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.code === 0) {
        setSuccess(true);
        form.reset();
      } else {
        setError(json.message || '提交失败，请稍后再试');
      }
    } catch (err) {
      setError('网络错误，提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="formModal"
      className="modal"
      style={{ display: 'flex' }}
      onClick={(e) => e.target.id === 'formModal' && onClose()}
      onKeyDown={() => {}}
      role="presentation"
    >
      <div className="job-modal-content">
        <button type="button" className="close-btn" onClick={onClose}>
          &times;
        </button>
        <form className="job-form" id="jobApplicationForm" onSubmit={handleSubmit} encType="multipart/form-data">
          <h2>申请职位</h2>
          {success ? (
            <div className="job-apply-success">
              <p>🎉 申请提交成功！</p>
              <p className="job-apply-success-sub">我们已收到您的简历，HR 会尽快与您联系。</p>
              <button type="button" className="job-submit-btn" onClick={onClose}>
                关闭
              </button>
            </div>
          ) : (
            <>
              <label htmlFor="formPosition">职位名称：</label>
              <input type="text" id="formPosition" name="position" value={position} readOnly />

              <div className="job-form-row">
                <div className="job-half-width">
                  <label htmlFor="chinese_name">中文姓名：</label>
                  <input
                    type="text"
                    id="chinese_name"
                    name="chinese_name"
                    required
                    pattern="[\u4e00-\u9fa5]{2,}"
                    title="请输入中文姓名（至少两个汉字）"
                  />
                </div>
                <div className="job-half-width">
                  <label htmlFor="gender">性别：</label>
                  <select id="gender" name="gender" required defaultValue="">
                    <option value="">请选择</option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </div>
              </div>

              <label htmlFor="english_name">英文姓名：</label>
              <input
                type="text"
                id="english_name"
                name="english_name"
                required
                pattern="[A-Za-z ]{2,}"
                title="请输入英文姓名（只限英文字母）"
              />

              <label htmlFor="email">电子邮箱：</label>
              <input type="email" id="email" name="email" required />

              <label htmlFor="phone">电话号码：</label>
              <div className="job-phone-group">
                <select name="country_code" required defaultValue="+60">
                  <option value="+60">马来西亚 (+60)</option>
                  <option value="+65">新加坡 (+65)</option>
                  <option value="+86">中国 (+86)</option>
                  <option value="+852">香港 (+852)</option>
                  <option value="+81">日本 (+81)</option>
                </select>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  required
                  pattern="\d{1,10}"
                  maxLength={10}
                  title="请输入最多10位数字的电话号码"
                />
              </div>

              <label htmlFor="resume">上传简历（PDF，≤3MB）：</label>
              <input type="file" name="resume" id="resume" accept=".pdf" required />

              {error ? <p className="job-apply-error">{error}</p> : null}
              <button type="submit" className="job-submit-btn" disabled={submitting}>
                {submitting ? '提交中…' : '提交申请'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
