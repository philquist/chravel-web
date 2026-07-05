import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { TripPreferences } from '../TripPreferences';
import { TripPreferences as TripPreferencesType } from '../../types/consumer';
import { useConsumerSubscription } from '../../hooks/useConsumerSubscription';
import { useAuth } from '../../hooks/useAuth';
import { userPreferencesService } from '../../services/userPreferencesService';
import { toast } from 'sonner';
import { useDemoMode } from '../../hooks/useDemoMode';
import { ConciergeVoicePicker } from '@/features/concierge/components/ConciergeVoicePicker';
import { ConciergeLanguagePicker } from '@/features/concierge/components/ConciergeLanguagePicker';
import { ConciergeConversationModeToggle } from '@/features/concierge/components/ConciergeConversationModeToggle';

export const ConsumerAIConciergeSection = () => {
  const { isPlus } = useConsumerSubscription();
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const [preferences, setPreferences] = useState<TripPreferencesType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Grounding the Concierge in these preferences is a premium-only capability
  // (enforced server-side in lovable-concierge). Demo mode previews the premium
  // experience. Free users can still edit/save preferences — they simply unlock
  // when the user upgrades. isPlus now honors the full access policy (active, trial,
  // canceled-in-period, super admins), so this screen agrees with the server + chat.
  const isPremium = isDemoMode || isPlus;

  useEffect(() => {
    if (isDemoMode) {
      // Set mock preferences for demo mode
      setPreferences({
        dietary: ['Vegan', 'Gluten-Free'],
        vibe: ['Adventure', 'Cultural'],
        accessibility: ['Wheelchair Access', 'EV Charging'],
        business: [],
        entertainment: ['Live Music'],
        lifestyle: ['Eco-Friendly'],
        budgetMin: 50,
        budgetMax: 200,
        budgetUnit: 'experience',
        timePreference: 'early-riser',
      });
      setIsLoading(false);
    } else if (user) {
      // Load saved preferences for any signed-in user so they can view/edit them.
      // Whether they actually influence the Concierge is gated on Premium server-side.
      loadPreferences();
    } else {
      setIsLoading(false);
    }
  }, [user, isDemoMode]);

  const loadPreferences = async () => {
    if (!user) return;
    try {
      const prefs = await userPreferencesService.getAIPreferences(user.id);
      setPreferences(prefs);
    } catch (error) {
      console.error('Error loading AI preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreferencesChange = async (newPrefs: TripPreferencesType) => {
    setPreferences(newPrefs);

    if (isDemoMode) {
      toast.success('Demo: Preferences preview updated');
      return;
    }

    if (!user) return;

    try {
      const success = await userPreferencesService.setAIPreferences(user.id, newPrefs);
      if (success) {
        toast.success('AI preferences saved');
      } else {
        toast.error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving AI preferences:', error);
      toast.error('Failed to save preferences');
    }
  };

  // The Concierge itself is free to use. Grounding answers in these saved
  // preferences is the premium capability, gated server-side.

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 gold-gradient-spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-gray-400">
            {isPremium
              ? 'Configure your preferences once — the AI Concierge applies them across all your trips for personalized recommendations.'
              : 'Configure your preferences once. With Premium, the AI Concierge applies them across all your trips for personalized recommendations.'}
          </p>
        </div>
        {isDemoMode ? (
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 px-4 py-2 rounded-full shrink-0">
            <span className="text-green-400 font-semibold text-sm">DEMO MODE</span>
          </div>
        ) : (
          <div className="bg-gold-primary/10 border border-gold-primary/20 px-4 py-2 rounded-full shrink-0">
            <span className="text-gold-primary font-semibold text-sm whitespace-nowrap">
              {isPremium ? 'PREMIUM' : 'PREMIUM FEATURE'}
            </span>
          </div>
        )}
      </div>

      {/* Free-user upsell — soft, non-nagging. Persistence still works; grounding is gated. */}
      {!isPremium && (
        <div className="bg-gold-primary/10 border border-gold-primary/20 rounded-xl p-4">
          <p className="text-gold-primary font-semibold text-sm mb-1">✦ Premium feature</p>
          <p className="text-gray-300 text-sm">
            You can set your preferences now, but the AI Concierge only factors them into its
            answers for Premium members. Upgrade in the Billing tab to have every recommendation
            grounded in your dietary needs, vibe, budget, and accessibility — automatically, across
            all your trips.
          </p>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <Settings size={20} />
          How Concierge Works
        </h3>
        <ul className="space-y-1.5 text-gray-300 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-gold-primary leading-5" aria-hidden="true">
              ✦
            </span>
            <span>Set your preferences below (dietary, vibe, budget, accessibility)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gold-primary leading-5" aria-hidden="true">
              ✦
            </span>
            <span>AI remembers them across ALL your trips</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gold-primary leading-5" aria-hidden="true">
              ✦
            </span>
            <span>
              {isPremium
                ? 'Get personalized suggestions filtered to YOUR needs'
                : 'Premium: get personalized suggestions filtered to YOUR needs'}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gold-primary leading-5" aria-hidden="true">
              ✦
            </span>
            <span>No need to repeat preferences for each trip</span>
          </li>
        </ul>
      </div>

      {/* Preferences Component */}
      <TripPreferences
        tripId="global-user-preferences"
        onPreferencesChange={handlePreferencesChange}
        initialPreferences={preferences || undefined}
      />

      {/* Conversation Mode (hands-free voice) */}
      <ConciergeConversationModeToggle />

      {/* Reply Language */}
      <ConciergeLanguagePicker />

      {/* Voice Picker */}
      <ConciergeVoicePicker />

      {/* Active Filters Summary */}
      {preferences && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-3">Active AI Filters</h3>
          <p className="text-gray-400 text-sm mb-3">
            {isPremium
              ? 'When you ask AI for recommendations, these filters are automatically applied:'
              : 'Once you upgrade to Premium, these filters are automatically applied when you ask AI for recommendations:'}
          </p>
          <div className="flex flex-wrap gap-2">
            {preferences.dietary.map(item => (
              <span
                key={item}
                className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm"
              >
                {item}
              </span>
            ))}
            {preferences.vibe.map(item => (
              <span
                key={item}
                className="bg-primary/15 text-primary px-3 py-1 rounded-full text-sm"
              >
                {item}
              </span>
            ))}
            {preferences.accessibility.map(item => (
              <span
                key={item}
                className="bg-primary/15 text-primary px-3 py-1 rounded-full text-sm"
              >
                {item}
              </span>
            ))}
            {(() => {
              const unit = preferences.budgetUnit || 'experience';
              const unitLabel =
                unit === 'experience'
                  ? 'per experience'
                  : unit === 'day'
                    ? 'per day'
                    : unit === 'person'
                      ? 'per person'
                      : 'per trip';
              const hasMin = preferences.budgetMin > 0;
              const hasMax = preferences.budgetMax > 0;
              if (hasMin && hasMax) {
                return (
                  <span className="bg-primary/15 text-primary px-3 py-1 rounded-full text-sm">
                    Budget: ${preferences.budgetMin}–${preferences.budgetMax} {unitLabel}
                  </span>
                );
              } else if (hasMax) {
                return (
                  <span className="bg-primary/15 text-primary px-3 py-1 rounded-full text-sm">
                    Budget: up to ${preferences.budgetMax} {unitLabel}
                  </span>
                );
              } else if (hasMin) {
                return (
                  <span className="bg-primary/15 text-primary px-3 py-1 rounded-full text-sm">
                    Budget: from ${preferences.budgetMin} {unitLabel}
                  </span>
                );
              }
              return null;
            })()}
            {preferences.timePreference !== 'flexible' && (
              <span className="bg-pink-500/20 text-pink-400 px-3 py-1 rounded-full text-sm capitalize">
                {preferences.timePreference.replace('-', ' ')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
