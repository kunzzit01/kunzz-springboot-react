import { AnimateOnScroll } from '../../hooks/AnimateOnScroll.jsx';

export default function CompanyProfile() {
  return (
    <section className="about-section" id="comprofile">
      <div className="comprofile-section">
        <div className="comprofile-text">
          <AnimateOnScroll as="p" className="comprofile-subtitle slide-in-left delay-1">
            <span className="circle" />
            公司简介
          </AnimateOnScroll>
          <AnimateOnScroll as="h2" className="comprofile-title slide-in-left delay-2">
            KUNZZ HOLDINGS
          </AnimateOnScroll>
          <AnimateOnScroll as="p" className="comprofile-description slide-in-left delay-3">
            Kunzz Holdings 成立于2023年，初衷是为旗下业务建立统一的管理平台，提升资源整合效率。我们坚守「塑造积极向上和舒适的工作环境」为使命，持续推动组织氛围建设，成就更有温度的企业文化。我们信奉积极、高效、灵活、诚信的核心精神，始终以目标导向、理念一致为准则，追求卓越，勇于创新。
          </AnimateOnScroll>
        </div>

        <AnimateOnScroll className="comprofile-image rotate-3d-full">
          <img src="/images/logo.webp" alt="公司介绍图" />
        </AnimateOnScroll>
      </div>

      <AnimateOnScroll className="stats-section">
        <div className="stat-box">
          <div className="stat-number">2023</div>
          <div className="stat-label">成立年份</div>
        </div>
        <div className="divider" />
        <div className="stat-box">
          <div className="stat-number">3</div>
          <div className="stat-label">子公司数量</div>
        </div>
        <div className="divider" />
        <div className="stat-box">
          <div className="stat-number">70+</div>
          <div className="stat-label">员工数量</div>
        </div>
      </AnimateOnScroll>
    </section>
  );
}