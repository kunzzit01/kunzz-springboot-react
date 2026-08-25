import { useJoinSlideAnimation } from '../../../hooks/useJoinSlideAnimation.js';
import { useIsMobile } from '../../../hooks/useIsMobile.js';

export function FeedbackForm({ formId, compact = false, hideSubmit = false }) {
  return (
    <form
      id={formId}
      action="https://api.web3forms.com/submit"
      method="POST"
      encType="multipart/form-data"
    >
      <input type="hidden" name="access_key" value="a18bc4c6-2f16-4861-8d10-a3de747cab50" />
      <input
        type="hidden"
        name="redirect"
        value="https://kunzzgroup.com/frontend/success.html"
      />

      <div className="fb-form-row">
        <div className="fb-field fb-field-wide">
          <label htmlFor={`${formId}-chineseName`}>中文姓名 *</label>
          <input
            type="text"
            id={`${formId}-chineseName`}
            name="chineseName"
            placeholder="请输入中文姓名"
            required
            pattern="[\u4e00-\u9fa5]{2,}"
            title="请输入中文姓名（至少两个汉字）"
          />
        </div>
        <div className="fb-field fb-field-narrow">
          <label>性别 *</label>
          <div className="fb-gender-options">
            <label>
              <input type="radio" name="gender" value="male" required /> 男
            </label>
            <label>
              <input type="radio" name="gender" value="female" required /> 女
            </label>
          </div>
        </div>
      </div>

      <div className="fb-field">
        <label htmlFor={`${formId}-englishName`}>英文姓名 *</label>
        <input
          type="text"
          id={`${formId}-englishName`}
          name="englishName"
          placeholder="请输入英文姓名"
          required
          pattern="[A-Za-z ]{2,}"
          title="请输入英文姓名（只限字母）"
        />
      </div>

      <div className="fb-field">
        <label htmlFor={`${formId}-phone`}>手机号码 *</label>
        <div className="fb-phone-row">
          <select id={`${formId}-countryCode`} name="countryCode" required defaultValue="+60">
            <option value="+60">+60</option>
            <option value="+65">+65</option>
            <option value="+86">+86</option>
            <option value="+852">+852</option>
            <option value="+81">+81</option>
          </select>
          <input
            type="tel"
            id={`${formId}-phone`}
            name="phoneNumber"
            placeholder="请输入电话号码"
            required
            pattern="\d{7,15}"
            maxLength={15}
            inputMode="numeric"
            title="请输入正确手机号"
          />
        </div>
      </div>

      <div className="fb-field">
        <label htmlFor={`${formId}-email`}>电子邮箱 *</label>
        <input
          type="email"
          id={`${formId}-email`}
          name="email"
          placeholder="请输入邮箱地址"
          required
        />
      </div>

      <div className="fb-field">
        <label htmlFor={`${formId}-message`}>信息 *</label>
        <textarea
          id={`${formId}-message`}
          name="message"
          rows={compact ? 5 : 5}
          placeholder="请输入您的意见或建议…"
          required
        />
      </div>

      {hideSubmit ? null : (
        <button type="submit" className="fb-submit-btn">
          提 交
        </button>
      )}
    </form>
  );
}

export default function JoinContactFeedback() {
  const isMobile = useIsMobile();
  const sectionRef = useJoinSlideAnimation('contact-form-section', 'contact-loaded');

  const goToLocation = () => {
    const map = document.getElementById('custom-map');
    if (map) {
      map.src =
        'https://www.google.com/maps/d/embed?mid=1WGUSQUviVSNKcc7LNK-aSDA6j6S3EMc&ehbc=2E312F#target-location';
    }
  };

  return (
    <div ref={sectionRef} className="contact-form-section contact-form-section--contact-only join-slide-card-center" id="map">
      <div className="contact-form-container contact-form-container--contact-only">
        <div className="contact-card contact-card--mobile">
          <div className="contact-map-embed">
            <iframe
              id="custom-map"
              title="Kunzz Holdings location"
              src="https://www.google.com/maps/d/embed?mid=1WGUSQUviVSNKcc7LNK-aSDA6j6S3EMc&ehbc=2E312F"
              width="100%"
              height="100%"
            />
          </div>

          <div className="contact-info-bottom">
            <div className="contact-card-header">
              <h2 className="contact-title">联系我们</h2>
            </div>
            <div className="contact-details">
              <div className="contact-detail-item">
                <div className="contact-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff5c00" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="contact-detail-text">
                  <span className="contact-label">地址</span>
                  <a
                    href="#map"
                    onClick={(e) => {
                      e.preventDefault();
                      goToLocation();
                    }}
                    className="contact-link"
                  >
                    25, Jln Tanjong 3, Taman Desa Cemerlang,
                    <br />
                    81800 Ulu Tiram, Johor Darul Ta&apos;zim
                  </a>
                </div>
              </div>
              <div className="contact-detail-item">
                <div className="contact-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff5c00" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <div className="contact-detail-text">
                  <span className="contact-label">电话</span>
                  <span>+60 13-553 5355</span>
                </div>
              </div>
              <div className="contact-detail-item">
                <div className="contact-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff5c00" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div className="contact-detail-text">
                  <span className="contact-label">邮箱</span>
                  <span>kunzzholdings@gmail.com</span>
                </div>
              </div>
              <div className="contact-detail-item">
                <div className="contact-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff5c00" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="contact-detail-text">
                  <span className="contact-label">营业时间</span>
                  <span>周一至周五 9AM – 6PM</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!isMobile ? (
          <div className="feedback-card joinus-feedback joinus-feedback--inline">
            <h2 className="feedback-title">请提供您宝贵的意见</h2>
            <p className="feedback-subtitle">我们期待您的反馈，将尽快与您联系。</p>
            <FeedbackForm formId="feedbackForm" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
