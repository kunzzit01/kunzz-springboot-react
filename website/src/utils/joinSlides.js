/** Swiper slide indices for Join Us footer / deep links */
export const JOIN_SECTION_SLIDES = {
  benefits: { desktop: 0, mobile: 1 },
  comphoto: { desktop: 1, mobile: 2 },
  jobs: { desktop: 2, mobile: 3 },
  contact: { desktop: 3, mobile: 4 },
};

export function getJoinSectionSlide(section, isMobile) {
  return JOIN_SECTION_SLIDES[section][isMobile ? 'mobile' : 'desktop'];
}
