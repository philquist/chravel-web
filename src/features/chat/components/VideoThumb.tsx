import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface VideoThumbProps {
  src: string;
  className?: string;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Video attachment with duration badge (Phase 3). GIFs (.gif as video rare) —
 * for image/gif use GifAutoplayImage instead.
 */
export const VideoThumb: React.FC<VideoThumbProps> = ({ src, className }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [durationSec, setDurationSec] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDurationSec(video.duration);
      }
    };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [src]);

  return (
    <div className={cn('relative', className)}>
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        className="rounded-lg max-w-full h-auto"
        style={{ maxHeight: '300px' }}
      >
        Your browser does not support the video tag.
      </video>
      {durationSec > 0 && (
        <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
          {formatDuration(durationSec)}
        </span>
      )}
    </div>
  );
};

interface GifAutoplayImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

/** Autoplay muted GIF when scrolled into view (Phase 3). */
export const GifAutoplayImage: React.FC<GifAutoplayImageProps> = ({
  src,
  alt,
  className,
  onClick,
}) => {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (entry) setInView(entry.isIntersecting);
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // GIFs animate whenever the <img> is in the DOM; hide when off-screen to pause.
  return (
    <img
      ref={imgRef}
      src={inView ? src : undefined}
      data-src={src}
      alt={alt}
      className={className}
      loading="eager"
      onClick={onClick}
    />
  );
};
