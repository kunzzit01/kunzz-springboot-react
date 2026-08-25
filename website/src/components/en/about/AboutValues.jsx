import { AnimateOnScroll } from '../../../hooks/AnimateOnScroll.jsx';

const values = [
  {
    title: 'Goal-Oriented',
    icon: '/images/目标导向.webp',
    desc: 'Results-driven, focused on key tasks, with a clear sense of direction and purpose in every step.',
  },
  {
    title: 'Aligned Values',
    icon: '/images/理念一致.webp',
    desc: 'Maintain a high level of consensus, stay on the same wavelength, and align on goals to minimize internal friction.',
  },
  {
    title: 'Pursuit of Excellence',
    icon: '/images/追求卓越.webp',
    desc: 'Not satisfied with merely completing tasks -- we strive to do better, achieve higher standards, and continuosly optimize every aspect of our work.',
  },
  {
    title: 'Innovation Spirit',
    icon: '/images/创新精神.webp',
    desc: 'Embrace change, dare to try, break existing frameworks, and continously explore new methods, tools, and perspectives to drive business growth.',
  },
];

export default function AboutValues() {
  return (
    <section id="values" className="values-section">
      <AnimateOnScroll className="values-top">
        <h2 className="values-title values-scale-fade delay-3">
          Our Core <span style={{ color: '#FF5C00' }}>Values</span>
        </h2>
        <p className="values-description values-scale-fade delay-4">
          Our core values run through every effort and every collaboration within our team. 
          They unite us in culture, keep us grounded in challenges, and maintain our original
          intention throughout our growth.
        </p>
      </AnimateOnScroll>
    
      <AnimateOnScroll className="values-bottom card-tilt-in-left">
        {values.map((item) => (
          <div className="values-card" key={item.title}>
            <img src={item.icon} alt="" className="values-icon" />
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </div>
        ))}
      </AnimateOnScroll>
    </section>
  );
}
