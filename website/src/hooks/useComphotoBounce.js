import { useEffect, useRef, useState } from 'react';

const PHOTOS_API = '/api/comphotos_api.php';
const NAVBAR_HEIGHT = 80;
const PHOTO_MARGIN = 10;

function getPhotoWidth() {
  return Math.min(120, Math.max(60, window.innerWidth * 0.08));
}

function getPhotoHeight() {
  return Math.min(80, Math.max(40, window.innerWidth * 0.0533));
}

function generateDiagonalAngle() {
  const minAngle = Math.PI / 6;
  const maxAngle = Math.PI / 3;
  const quadrant = Math.floor(Math.random() * 4);
  let baseAngle;

  switch (quadrant) {
    case 0:
      baseAngle = Math.random() * (maxAngle - minAngle) + minAngle;
      break;
    case 1:
      baseAngle = Math.PI - (Math.random() * (maxAngle - minAngle) + minAngle);
      break;
    case 2:
      baseAngle = Math.PI + (Math.random() * (maxAngle - minAngle) + minAngle);
      break;
    default:
      baseAngle = 2 * Math.PI - (Math.random() * (maxAngle - minAngle) + minAngle);
  }

  return baseAngle;
}

function generateVelocityFromAngle(angle) {
  const speed = 0.6;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

function correctBounceAngle(vx, vy, isHorizontalBounce) {
  let newVx = vx;
  let newVy = vy;

  if (isHorizontalBounce) newVx = -vx;
  else newVy = -vy;

  let currentAngle = Math.atan2(newVy, newVx);
  if (currentAngle < 0) currentAngle += 2 * Math.PI;

  const tolerance = Math.PI / 8;
  const horizontalAngles = [0, Math.PI, 2 * Math.PI];
  const verticalAngles = [Math.PI / 2, (3 * Math.PI) / 2];
  let needsCorrection = false;

  for (const hAngle of horizontalAngles) {
    if (Math.abs(currentAngle - hAngle) < tolerance) {
      needsCorrection = true;
      break;
    }
  }

  if (!needsCorrection) {
    for (const vAngle of verticalAngles) {
      if (Math.abs(currentAngle - vAngle) < tolerance) {
        needsCorrection = true;
        break;
      }
    }
  }

  if (needsCorrection) {
    const velocity = generateVelocityFromAngle(generateDiagonalAngle());
    return { vx: velocity.vx, vy: velocity.vy };
  }

  return { vx: newVx, vy: newVy };
}

function getBoundaries() {
  const photoWidth = getPhotoWidth();
  const photoHeight = getPhotoHeight();
  return {
    left: 0,
    right: window.innerWidth - photoWidth,
    top: NAVBAR_HEIGHT,
    bottom: window.innerHeight - photoHeight,
  };
}

export function useComphotoBounce(containerRef, onPhotoClick) {
  const photoDataRef = useRef([]);
  const occupiedRef = useRef([]);
  const animationIdRef = useRef(null);
  const isPausedRef = useRef(false);
  const [photos, setPhotos] = useState([]);
  const [layoutTick, setLayoutTick] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      setLayoutTick((tick) => tick + 1);
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    let cancelled = false;

    fetch(PHOTOS_API)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) {
          setPhotos(data.photos || []);
        }
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || photos.length === 0) return;

    photoDataRef.current = [];
    occupiedRef.current = [];
    isPausedRef.current = false;

    container.querySelectorAll('img.comphoto').forEach((img) => img.remove());

    const isOverlapping = (pos1, pos2) => {
      const w = getPhotoWidth();
      const h = getPhotoHeight();
      return !(
        pos1.x + w + PHOTO_MARGIN < pos2.x ||
        pos2.x + w + PHOTO_MARGIN < pos1.x ||
        pos1.y + h + PHOTO_MARGIN < pos2.y ||
        pos2.y + h + PHOTO_MARGIN < pos1.y
      );
    };

    const getRandomNonOverlappingPosition = () => {
      const boundaries = getBoundaries();
      let attempts = 0;

      while (attempts < 200) {
        const x = Math.random() * (boundaries.right - boundaries.left) + boundaries.left;
        const y = Math.random() * (boundaries.bottom - boundaries.top) + boundaries.top;
        const newPos = { x, y };
        let overlaps = false;

        for (const occupiedPos of occupiedRef.current) {
          if (isOverlapping(newPos, occupiedPos)) {
            overlaps = true;
            break;
          }
        }

        if (!overlaps) {
          occupiedRef.current.push(newPos);
          return newPos;
        }
        attempts += 1;
      }

      const cols = Math.floor(
        (boundaries.right - boundaries.left) / (getPhotoWidth() + PHOTO_MARGIN),
      );
      const index = occupiedRef.current.length;
      const fallbackPos = {
        x: boundaries.left + (index % cols) * (getPhotoWidth() + PHOTO_MARGIN),
        y: boundaries.top + Math.floor(index / cols) * (getPhotoHeight() + PHOTO_MARGIN),
      };
      occupiedRef.current.push(fallbackPos);
      return fallbackPos;
    };

    photos.forEach((src, index) => {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'comphoto';
      img.loading = 'lazy';
      img.alt = `公司照片 ${index + 1}`;

      const pos = getRandomNonOverlappingPosition();
      const velocity = generateVelocityFromAngle(generateDiagonalAngle());

      img.style.left = `${pos.x}px`;
      img.style.top = `${pos.y}px`;

      img.addEventListener('click', () => {
        isPausedRef.current = true;
        onPhotoClick?.(img);
      });

      photoDataRef.current.push({
        element: img,
        x: pos.x,
        y: pos.y,
        vx: velocity.vx,
        vy: velocity.vy,
      });

      container.appendChild(img);
    });

    const updatePhotos = () => {
      if (isPausedRef.current) return;
      const boundaries = getBoundaries();

      photoDataRef.current.forEach((photo) => {
        photo.x += photo.vx;
        photo.y += photo.vy;
        let bounced = false;
        let isHorizontalBounce = false;

        if (photo.x <= boundaries.left || photo.x >= boundaries.right) {
          photo.x = Math.max(boundaries.left, Math.min(boundaries.right, photo.x));
          bounced = true;
          isHorizontalBounce = true;
        }

        if (photo.y <= boundaries.top || photo.y >= boundaries.bottom) {
          photo.y = Math.max(boundaries.top, Math.min(boundaries.bottom, photo.y));
          bounced = true;
          isHorizontalBounce = false;
        }

        if (bounced) {
          const corrected = correctBounceAngle(photo.vx, photo.vy, isHorizontalBounce);
          photo.vx = corrected.vx;
          photo.vy = corrected.vy;
        }

        photo.element.style.left = `${photo.x}px`;
        photo.element.style.top = `${photo.y}px`;
      });
    };

    const animate = () => {
      updatePhotos();
      animationIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      photoDataRef.current.forEach((p) => p.element.remove());
      photoDataRef.current = [];
    };
  }, [photos, containerRef, onPhotoClick, layoutTick]);

  return {
    resume: () => {
      isPausedRef.current = false;
    },
    pause: () => {
      isPausedRef.current = true;
    },
  };
}
