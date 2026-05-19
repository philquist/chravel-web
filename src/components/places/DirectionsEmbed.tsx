import React, { useMemo, useState } from 'react';
import { MapPin, ArrowUpDown, X, Navigation, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BasecampLocation } from '@/types/basecamp';
import { PersonalBasecamp } from '@/services/basecampService';
import {
  useCurrentPersonalBaseCamp,
  useCurrentTripBaseCamp,
  usePersonalBaseCamps,
  useTripBaseCamps,
} from '@/hooks/useMultiBaseCamps';
import { formatBaseCampLabel } from '@/utils/baseCamps';

interface DirectionsEmbedProps {
  tripId: string;
  tripBasecamp?: BasecampLocation | null;
  personalBasecamp?: PersonalBasecamp | null;
}

export const DirectionsEmbed: React.FC<DirectionsEmbedProps> = ({
  tripId,
  tripBasecamp,
  personalBasecamp,
}) => {
  const { data: tripCamps = [] } = useTripBaseCamps(tripId);
  const { data: personalCamps = [] } = usePersonalBaseCamps(tripId);
  const { currentBaseCamp: currentTripBaseCamp } = useCurrentTripBaseCamp(tripId);
  const { currentBaseCamp: currentPersonalBaseCamp } = useCurrentPersonalBaseCamp(tripId);

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [directionsUrl, setDirectionsUrl] = useState<string | null>(null);
  const [showDirections, setShowDirections] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const defaultFrom = useMemo(() => {
    return (
      currentPersonalBaseCamp?.address ||
      currentTripBaseCamp?.address ||
      personalBasecamp?.address ||
      tripBasecamp?.address ||
      ''
    );
  }, [
    currentPersonalBaseCamp?.address,
    currentTripBaseCamp?.address,
    personalBasecamp?.address,
    tripBasecamp?.address,
  ]);

  React.useEffect(() => {
    if (!fromText && defaultFrom) setFromText(defaultFrom);
  }, [defaultFrom, fromText]);

  const handleSwap = () => {
    const temp = fromText;
    setFromText(toText);
    setToText(temp);
  };

  const handleGetDirections = () => {
    if (!fromText.trim() || !toText.trim()) return;
    const saddr = encodeURIComponent(fromText.trim());
    const daddr = encodeURIComponent(toText.trim());
    const url = `https://www.google.com/maps?output=embed&saddr=${saddr}&daddr=${daddr}`;
    setDirectionsUrl(url);
    setShowDirections(true);
    setIframeLoading(true);
    setIframeError(false);
  };

  const canGetDirections = !!fromText.trim() && !!toText.trim();

  const quickPicks = [
    ...tripCamps.map(c => ({
      key: `trip-${c.id}`,
      label: `Trip: ${formatBaseCampLabel(c)}`,
      address: c.address,
    })),
    ...personalCamps.map(c => ({
      key: `personal-${c.id}`,
      label: `Personal: ${formatBaseCampLabel(c)}`,
      address: c.address,
    })),
  ];

  if (showDirections && directionsUrl) return <div />;

  return (
    <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-4 border border-white/10">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        <Navigation size={18} className="text-primary" />
        Get Directions
      </h3>
      <div className="mb-3">
        <label className="text-sm text-gray-300 font-medium">From</label>
        <input
          value={fromText}
          onChange={e => setFromText(e.target.value)}
          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm"
        />
      </div>
      <div className="mb-3">
        <label className="text-sm text-gray-300 font-medium">To</label>
        <input
          value={toText}
          onChange={e => setToText(e.target.value)}
          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {quickPicks.slice(0, 8).map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => setFromText(p.address)}
            className="text-xs px-2 py-1 rounded border border-white/20 text-primary"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={handleSwap} variant="outline" className="min-h-[44px]">
          <ArrowUpDown size={16} />
        </Button>
        <Button disabled={!canGetDirections} onClick={handleGetDirections} className="min-h-[44px]">
          Directions
        </Button>
      </div>
      {showDirections && (
        <div className="mt-3 h-[300px] relative">
          {iframeLoading && <div className="absolute inset-0">Loading...</div>}
          {iframeError ? (
            <AlertCircle />
          ) : (
            <iframe
              src={directionsUrl!}
              title="Google Maps Directions"
              className="w-full h-full"
              onLoad={() => setIframeLoading(false)}
              onError={() => {
                setIframeLoading(false);
                setIframeError(true);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};
