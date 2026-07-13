import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlaceMiniCardProps {
  name: string;
  url: string;
  image?: string | null;
  subtitle?: string | null;
  className?: string;
}

/**
 * Compact in-bubble place card for Maps / Places links (Phase 3 plan).
 * Uses link-preview metadata — no extra Places API round-trip.
 */
export const PlaceMiniCard: React.FC<PlaceMiniCardProps> = ({
  name,
  url,
  image,
  subtitle,
  className,
}) => {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'mt-2 flex gap-2.5 rounded-2xl overflow-hidden border border-border/50',
        'bg-muted/60 hover:bg-muted transition-colors',
        className,
      )}
      style={{ maxWidth: '320px' }}
    >
      <div className="w-16 h-16 shrink-0 bg-muted flex items-center justify-center overflow-hidden">
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <MapPin size={18} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0 py-2 pr-2.5 flex flex-col justify-center">
        <div className="flex items-start gap-1">
          <p className="text-sm font-semibold text-foreground truncate flex-1">{name}</p>
          <ExternalLink size={12} className="text-muted-foreground shrink-0 mt-0.5" />
        </div>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{subtitle}</p>
        )}
      </div>
    </a>
  );
};

const PLACE_URL_RE =
  /(google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|chravel:\/\/place\/)/i;

export function isPlaceLinkUrl(url?: string | null): boolean {
  if (!url) return false;
  return PLACE_URL_RE.test(url);
}
