import React, { useRef, useState } from 'react';
import { Mic, Lock, Play, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CONCIERGE_VOICES,
  DEFAULT_CONCIERGE_VOICE,
  useConciergeVoicePreference,
  type ConciergeVoiceId,
} from '@/features/concierge/hooks/useConciergeVoicePreference';
import {
  supabase,
  SUPABASE_PROJECT_URL,
  SUPABASE_PUBLIC_ANON_KEY,
} from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const PREVIEW_TEXT = "Hi, I'm your ChravelApp concierge. This is how I'll sound.";
const TTS_URL = `${SUPABASE_PROJECT_URL}/functions/v1/concierge-voice-tts`;

export const ConciergeVoicePicker: React.FC = () => {
  const { voice, setVoice, isPaid } = useConciergeVoicePreference();
  const [previewingVoice, setPreviewingVoice] = useState<ConciergeVoiceId | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPreviewingVoice(null);
  };

  const previewVoice = async (voiceId: ConciergeVoiceId) => {
    if (previewingVoice === voiceId) {
      stopPreview();
      return;
    }
    stopPreview();
    setPreviewingVoice(voiceId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sign in to preview voices.');
      }
      const res = await fetch(TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_PUBLIC_ANON_KEY,
        },
        body: JSON.stringify({ text: PREVIEW_TEXT, voice: voiceId, format: 'mp3' }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Preview failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stopPreview();
      audio.onerror = () => stopPreview();
      await audio.play();
    } catch (err) {
      stopPreview();
      toast.error(err instanceof Error ? err.message : 'Preview failed');
    }
  };

  const handleSelect = (voiceId: ConciergeVoiceId) => {
    if (!isPaid) return;
    setVoice(voiceId);
    toast.success(`Voice set to ${CONCIERGE_VOICES.find(v => v.id === voiceId)?.label}`);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Mic size={20} className="text-gold-primary" />
          Concierge Voice
        </h3>
        {!isPaid && (
          <span className="inline-flex items-center gap-1 text-xs text-gold-primary bg-gold-primary/10 border border-gold-primary/30 px-2 py-1 rounded-full">
            <Lock size={12} />
            Paid feature
          </span>
        )}
      </div>
      <p className="text-gray-400 text-sm mb-1">
        {isPaid
          ? 'Choose how the concierge sounds when you tap the speaker on a response.'
          : `Free plan uses ${CONCIERGE_VOICES[0].label} by default. Upgrade to choose any of 10 voices.`}
      </p>
      <p className="text-gray-500 text-xs mb-4 italic">
        Tap ▶ to preview a voice — previewing never changes your saved selection. Tap the row to
        save.
      </p>

      <div className="space-y-2">
        {CONCIERGE_VOICES.map(v => {
          const isSelected = v.id === voice;
          const isPreviewing = previewingVoice === v.id;
          const isDisabled = !isPaid && v.id !== DEFAULT_CONCIERGE_VOICE;
          return (
            <div
              key={v.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                isSelected
                  ? 'border-gold-primary/60 bg-gold-primary/5'
                  : 'border-white/10 bg-white/0',
                isDisabled && 'opacity-50',
              )}
            >
              <button
                type="button"
                onClick={() => handleSelect(v.id)}
                disabled={isDisabled}
                className="flex-1 text-left min-h-[42px]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 rounded-full border-2 items-center justify-center',
                      isSelected ? 'border-gold-primary' : 'border-white/30',
                    )}
                  >
                    {isSelected && <span className="h-2 w-2 rounded-full bg-gold-primary" />}
                  </span>
                  <span className="text-white font-medium">{v.label}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-6">{v.description}</p>
              </button>
              <button
                type="button"
                onClick={() => previewVoice(v.id)}
                className="inline-flex items-center justify-center min-h-[42px] min-w-[42px] rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                aria-label={isPreviewing ? `Stop ${v.label} preview` : `Preview ${v.label}`}
              >
                {isPreviewing && !audioRef.current ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : isPreviewing ? (
                  <Square size={14} className="fill-current" />
                ) : (
                  <Play size={14} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
