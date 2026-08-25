import { useJoinSlideAnimation } from '../../../hooks/useJoinSlideAnimation.js';
import { mediaUrl } from '../../../utils/media.js';

const benefits = [
  { icon: '/images/带薪假期.webp', label: 'Annual Leave' },
  { icon: '/images/旅游奖励.webp', label: 'Travel Incentive' },
  { icon: '/images/汽车奖励.webp', label: 'Car Allowance' },
  { icon: '/images/房子奖励.webp', label: 'Housing Allowance' },
  { icon: '/images/年度绩效奖励.webp', label: 'Annual Bonus' },
  { icon: '/images/专业培训与学习机会.webp', label: 'Training & Learning' },
];

function BenefitsGrid() {
  return (
    <div className="benefits-grid">
      {benefits.map((item) => (
        <div className="benefit-item" key={item.label}>
          <img src={item.icon} alt={item.label} />
          <p>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function JoinHeroBenefits({ layout = 'combined' }) {
  const bannerRef = useJoinSlideAnimation('joinus-banner', 'joinus-loaded');
  const benefitsRef = useJoinSlideAnimation('benefits-wrapper', 'benefits-loaded');

  const heroBanner = (
    <div ref={bannerRef} className="joinus-banner joinus-banner--full">
      <img src={mediaUrl('joinus_background')} alt="" className="background-image" />
      <div className="joinus-content">
        <h1>Join Us</h1>
        <p>
          Here, your effort shapes more than result - you help build the brand and grow alongside
          it.{' '}
        </p>
      </div>
    </div>
  );

  const benefitsBlock = (
    <div ref={benefitsRef} className="benefits-wrapper" id="benefits">
      <h2>Benefits</h2>
      <BenefitsGrid />
    </div>
  );

  if (layout === 'hero') {
    return <section className="joinus-section joinus-section--hero-only">{heroBanner}</section>;
  }

  if (layout === 'benefits') {
    return (
      <section
        ref={benefitsRef}
        className="benefits-wrapper benefits-wrapper--full-slide"
        id="benefits"
      >
        <h2>Benefits</h2>
        <BenefitsGrid />
      </section>
    );
  }

  return (
    <section className="joinus-section">
      {heroBanner}
      {benefitsBlock}
    </section>
  );
}
