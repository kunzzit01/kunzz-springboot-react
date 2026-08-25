import { FeedbackForm } from './JoinContactFeedback.jsx';

export default function JoinFeedbackMobile() {
  return (
    <div className="contact-form-section contact-form-section--feedback-only join-slide-card-center">
      <div className="contact-form-container contact-form-container--feedback-only">
        <div className="feedback-card joinus-feedback joinus-feedback--stacked feedback-card--mobile-scroll">
          <h2 className="feedback-title">请提供您宝贵的意见</h2>
          <p className="feedback-subtitle">我们期待您的反馈，将尽快与您联系。</p>
          <FeedbackForm formId="feedbackFormMobile" compact />
        </div>
      </div>
    </div>
  );
}
