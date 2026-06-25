import React from 'react';
import { Mic } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useConversationModePreference } from '@/features/concierge/hooks/useConversationModePreference';

export const ConciergeConversationModeToggle: React.FC = () => {
  const { enabled, setEnabled } = useConversationModePreference();

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
            <Mic size={20} />
            Conversation Mode
          </h3>
          <p className="text-gray-400 text-sm">
            Hands-free — talk to your Concierge like a phone call. One full chat = one query. When
            off, the mic button is hidden from the Concierge composer.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Toggle hands-free conversation mode"
          className="mt-1 shrink-0"
        />
      </div>
    </div>
  );
};
