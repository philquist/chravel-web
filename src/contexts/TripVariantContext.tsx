import React, { createContext, useContext } from 'react';

type TripVariant = 'consumer' | 'pro' | 'events';

interface TripVariantContextType {
  variant: TripVariant;
  accentColors: {
    primary: string;
    secondary: string;
    gradient: string;
    badge: string;
  };
}

// Single gold accent across all trip variants. The old per-variant palettes
// (orange/crimson/blue "glass" colors) were never defined in Tailwind, so they
// never rendered — trip types are differentiated by badges/labels, not accent hue.
const GOLD_ACCENT = {
  primary: 'gold-primary',
  secondary: 'gold-mid',
  gradient: 'from-gold-primary to-gold-mid',
  badge: 'from-gold-primary to-gold-mid',
};

const TripVariantContext = createContext<TripVariantContextType>({
  variant: 'consumer',
  accentColors: GOLD_ACCENT,
});

// eslint-disable-next-line react-refresh/only-export-components
export const useTripVariant = () => useContext(TripVariantContext);

interface TripVariantProviderProps {
  variant: TripVariant;
  children: React.ReactNode;
}

export const TripVariantProvider = ({ variant, children }: TripVariantProviderProps) => {
  const accentColors = GOLD_ACCENT;

  return (
    <TripVariantContext.Provider value={{ variant, accentColors }}>
      {children}
    </TripVariantContext.Provider>
  );
};
