import { AnimateOnScroll } from '../../hooks/AnimateOnScroll.jsx';

export default function CompanyProfile() {
  return (
    <section className="about-section" id="comprofile">
      <div className="comprofile-section">
        <div className="comprofile-text">
          <AnimateOnScroll as="p" className="comprofile-subtitle slide-in-left delay-1">
            <span className="circle" />
            Company Profile
          </AnimateOnScroll>
          <AnimateOnScroll as="h2" className="comprofile-title slide-in-left delay-2">
            KUNZZ HOLDINGS
          </AnimateOnScroll>
          <AnimateOnScroll as="p" className="comprofile-description slide-in-left delay-3">
            Kunzz Holdings was established in 2023 with the original intention of establishing a unified management platform for its businesses and improving the efficiency of resource integration. We adhere to the mission of "creating a positive and comfortable working evoironment", continue to promote the construction of organizational atmosphere, and achieve a warmer corporate culture. We believe in the core spirit of positivity, efficiency, flexibility and intergrity, always take goal orientation and consistent concepts as the critiria, pursue excellence, and be innovative.
          </AnimateOnScroll>
        </div>

        <AnimateOnScroll className="comprofile-image rotate-3d-full">
          <img src="/images/logo.webp" alt="公司介绍图" />
        </AnimateOnScroll>
      </div>

      <AnimateOnScroll className="stats-section stats-section--en">
        <div className="stat-box">
          <div className="stat-number">2023</div>
          <div className="stat-label">Year Founded</div>
        </div>
        <div className="divider" />
        <div className="stat-box">
          <div className="stat-number">3</div>
          <div className="stat-label">Subsidiaries</div>
        </div>
        <div className="divider" />
        <div className="stat-box">
          <div className="stat-number">70+</div>
          <div className="stat-label">Employees</div>
        </div>
      </AnimateOnScroll>
    </section>
  );
}
