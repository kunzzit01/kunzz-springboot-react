import { FeedbackForm } from './JoinContactFeedback.jsx';

export default function JoinFeedbackMobile() {
  return (
    <div className="contact-form-section contact-form-section--feedback-only join-slide-card-center">
      <div className="contact-form-container contact-form-container--feedback-only">
        <div className="feedback-card joinus-feedback joinus-feedback--stacked feedback-card--mobile-scroll">
          <h2 className="feedback-title">Share Your Feedback</h2>
          <p className="feedback-subtitle">We value your input and will get back to you soon.</p>
          <FeedbackForm formId="feedbackFormMobile" compact />
        </div>
      </div>
    </div>
  );
}
