import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { getJoinSectionSlide } from '../../utils/joinSlides.js';

/**
 * Footer content only — must sit inside SwiperSlide.footer-slide (see Home.jsx).
 * Matches public/footer.php structure.
 */
export default function Footer({ onSlideTo, page = 'home_en' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isAbout = page === 'about_en' || location.pathname === '/about_en';
  const isJoin = page === 'join_en' || location.pathname === '/join_en';
  const isMobile = useIsMobile();
  const joinSlide = (section) => getJoinSectionSlide(section, isMobile);

  const goToHomeSlide = (e, slide) => {
    e.preventDefault();
    if (location.pathname === '/') {
      onSlideTo?.(slide);
    } else {
      navigate(`Home_en/?slide=${slide}`);
    }
  };

  const goToAboutSlide = (e, slide) => {
    e.preventDefault();
    if (isAbout) {
      onSlideTo?.(slide);
    } else {
      navigate(`/about_en?slide=${slide}`);
    }
  };

  const goToJoinSlide = (e, slide) => {
    e.preventDefault();
    if (isJoin) {
      onSlideTo?.(slide);
    } else {
      navigate(`/join_en?slide=${slide}`);
    }
  };

  return (
    <>
      <footer className="footer">
        <div className="footer-section">
          <h4>
            <Link to="/Home_en">Home</Link>
          </h4>
          <ul>
            <li>
              <a href="Home_en/?slide=1" onClick={(e) => goToHomeSlide(e, 1)}>
                Company Profile
              </a>
            </li>
            <li>
              <a href="Home_en/?slide=2" onClick={(e) => goToHomeSlide(e, 2)}>
                Company Culture
              </a>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>
            <Link to="/about_en">About Us</Link>
          </h4>
          <ul>
            <li>
              <a href="/about_en?slide=0" onClick={(e) => goToAboutSlide(e, 0)}>
                Group Profile
              </a>
            </li>
            <li>
              <a href="/about_en?slide=1" onClick={(e) => goToAboutSlide(e, 1)}>
                Beliefs & Direction
              </a>
            </li>
            <li>
              <a href="/about_en?slide=2" onClick={(e) => goToAboutSlide(e, 2)}>
                Our Core Values
              </a>
            </li>
            <li>
              <a href="/about_en?slide=3" onClick={(e) => goToAboutSlide(e, 3)}>
                Milestones
              </a>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>
            <Link to="/join_en">Join Us </Link>
          </h4>
          <ul>
            <li>
              <a
                href={`/join_en?slide=${joinSlide('benefits')}`}
                onClick={(e) => goToJoinSlide(e, joinSlide('benefits'))}
              >
                Benefits
              </a>
            </li>
            <li>
              <a
                href={`/join_en?slide=${joinSlide('comphoto')}`}
                onClick={(e) => goToJoinSlide(e, joinSlide('comphoto'))}
              >
                Our Journey
              </a>
            </li>
            <li>
              <a
                href={`/join_en?slide=${joinSlide('jobs')}`}
                onClick={(e) => goToJoinSlide(e, joinSlide('jobs'))}
              >
                Open Positions
              </a>
            </li>
            <li>
              <a
                href={`/join_en?slide=${joinSlide('contact')}`}
                onClick={(e) => goToJoinSlide(e, joinSlide('contact'))}
              >
                Contact Us
              </a>
            </li>
          </ul>
        </div>
      </footer>

      <div className="footer-bottom">
        © 2025 Kunzz Holdings Sdn. Bhd. All rights reserved.
      </div>
    </>
  );
}
