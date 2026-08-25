import { AnimateOnScroll } from '../../../hooks/AnimateOnScroll.jsx';

export default function AboutVision() {
  return (
    <section id="vision" className="vision">
      <AnimateOnScroll className="vision-content vision-slide-down">
        <h1>Our Beliefs & Direction</h1>
        <p>
          We believe every great achievement begins with a clear belief.
          <br />
          Mission, vision, culture, and values are the guiding light of our journey and the principles we uphold together.
          <br />
          Guided by these ideals, we keep growing , keep breaking through, and keep inspring one another.
        </p>

        <div className="vision-cards">
          <AnimateOnScroll className="vision-card slide-in-left">
            <div className="vision-label">Our Mission</div>
            <h2>Foster a Positive and Comfortable Work Environment</h2>
            <p>
              We believe that a great work environment nurtures a great team. We strive to
              build a warm, inclusive, and belonging space where every member can perform 
              confidently and grow together. Here, challenges are met with support, and every
              effort is seen and valued.
            </p>
          </AnimateOnScroll>

          <AnimateOnScroll className="vision-card slide-in-right">
            <div className="vision-label">Our Vision</div>
            <h2>Build a High-Performance Team, Shape the Future of the industry</h2>
            <p>
              A great team is the core engine of sustained value creation. Only when efficiency
              and innovation go hand in hand can a team transcend limits and achieve the
              extraordinary. We are steadily walking the path toward becoming an industry
              benchmark, letting our achievements speak, and moving forward with 
              conviction.
            </p>
          </AnimateOnScroll>
        </div>
      </AnimateOnScroll>
    </section>
  );
}
