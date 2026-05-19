import { useCallback } from 'react';
import { useWebSpeechVoice } from '@/hooks/useWebSpeechVoice';
import type { VoiceState } from '@/hooks/useWebSpeechVoice';

interface Params {
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
}

export function useConciergeVoice({ setInputMessage }: Params) {
  const handleDictationResult = useCallback(
    (text: string) => {
      if (text.trim()) {
        setInputMessage(prev => {
          const separator = prev && !prev.endsWith(' ') ? ' ' : '';
          return prev + separator + text.trim();
        });
      }
    },
    [setInputMessage],
  );

  const { voiceState: dictationState, toggleVoice: toggleDictation } =
    useWebSpeechVoice(handleDictationResult);

  const convoVoiceState: VoiceState = dictationState;

  return {
    convoVoiceState,
    handleConvoToggle: toggleDictation,
  };
}
