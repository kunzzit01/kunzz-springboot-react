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
        setError(json.message || 'Submission failed, please try again later');
      }
    } catch (err) {
      setError('Network error, please try again later');
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
          <h2>Apply</h2>
          {success ? (
            <div className="job-apply-success">
              <p>🎉 Application submitted successfully!</p>
              <p className="job-apply-success-sub">We have received your resume. Our HR team will contact you soon.</p>
              <button type="button" className="job-submit-btn" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <>
              <label htmlFor="formPosition">Position Title:</label>
              <input type="text" id="formPosition" name="position" value={position} readOnly />

              <div className="job-form-row">
                <div className="job-half-width">
                  <label htmlFor="chinese_name">Chinese Name:</label>
                  <input
                    type="text"
                    id="chinese_name"
                    name="chinese_name"
                    required
                    pattern="[\u4e00-\u9fa5]{2,}"
                    title="Please Enter a Valid Chinese Name"
                  />
                </div>
                <div className="job-half-width">
                  <label htmlFor="gender">Gender:</label>
                  <select id="gender" name="gender" required defaultValue="">
                    <option value="">Please Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <label htmlFor="english_name">English Name:</label>
              <input
                type="text"
                id="english_name"
                name="english_name"
                required
                pattern="[A-Za-z ]{2,}"
                title="Please Enter a Valid English Name"
              />

              <label htmlFor="email">Email:</label>
              <input type="email" id="email" name="email" required />

              <label htmlFor="phone">Phone Number:</label>
              <div className="job-phone-group">
                <select name="country_code" required defaultValue="+60">
                  <option value="+60">Malaysia (+60)</option>
                  <option value="+65">Singapore (+65)</option>
                  <option value="+86">China (+86)</option>
                  <option value="+852">Hong Kong (+852)</option>
                  <option value="+81">Japan (+81)</option>
                </select>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  required
                  pattern="\d{1,10}"
                  maxLength={10}
                  title="Please enter up to 10 digits"
                />
              </div>

              <label htmlFor="resume">Upload Resume (PDF, ≤3MB):</label>
              <input type="file" name="resume" id="resume" accept=".pdf" required />

              {error ? <p className="job-apply-error">{error}</p> : null}
              <button type="submit" className="job-submit-btn" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
