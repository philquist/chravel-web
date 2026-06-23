/**
 * Streaming TTS over SSE PCM.
 *
 * The concierge-voice-tts edge function will return an SSE stream of
 *   { type: "speech.audio.delta", audio: <base64 PCM chunk> }
 * when called with { stream: true }. PCM is raw 24kHz 16-bit signed LE mono.
 *
 * We decode chunks as they arrive and schedule them on a shared AudioContext
 * so the user hears the first words *while* the rest is still being generated.
 *
 * Designed to be used for the FIRST sentence of a longer response. The
 * remaining sentences continue with the existing blob-based path so we keep
 * stop/cleanup semantics identical to before.
 */

const SAMPLE_RATE = 24000;

export interface StreamPcmSpeechOptions {
  url: string;
  body: Record<string, unknown>;
  accessToken: string;
  apikey: string;
  signal: AbortSignal;
  onPlaybackStart?: () => void;
  onMeta?: (meta: { usedFallbackVoice: boolean }) => void;
  /** Optional shared AudioContext (must be resumed in a user gesture). */
  audioContext?: AudioContext;
}

export interface StreamPcmSpeechResult {
  /** Resolves once the full stream has finished AND scheduled audio has played. */
  done: Promise<void>;
  /** Stops scheduled playback immediately. */
  stop: () => void;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Stream PCM speech from the concierge-voice-tts SSE endpoint and play it
 * through a WebAudio context with sample-accurate scheduling.
 */
export function streamPcmSpeech(opts: StreamPcmSpeechOptions): StreamPcmSpeechResult {
  const sources: AudioBufferSourceNode[] = [];
  let stopped = false;

  const stop = () => {
    stopped = true;
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    sources.length = 0;
  };

  const done = (async () => {
    const ctx =
      opts.audioContext ??
      new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )({
        sampleRate: SAMPLE_RATE,
      });
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    let playhead = 0;
    let pending = new Uint8Array(0);
    let startedPlayback = false;
    let lastEndsAt = 0;

    const scheduleChunk = (bytes: Uint8Array) => {
      if (stopped || bytes.length === 0) return;
      const merged = new Uint8Array(pending.length + bytes.length);
      merged.set(pending);
      merged.set(bytes, pending.length);
      const usable = merged.length - (merged.length % 2);
      pending = merged.slice(usable);
      if (usable === 0) return;

      const samples = new Int16Array(merged.buffer, 0, usable / 2);
      const floats = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;

      const buffer = ctx.createBuffer(1, floats.length, SAMPLE_RATE);
      buffer.copyToChannel(floats, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      if (playhead === 0) {
        playhead = ctx.currentTime + 0.05;
      } else {
        playhead = Math.max(playhead, ctx.currentTime);
      }
      source.start(playhead);
      playhead += buffer.duration;
      lastEndsAt = playhead;
      sources.push(source);

      if (!startedPlayback) {
        startedPlayback = true;
        opts.onPlaybackStart?.();
      }
    };

    const res = await fetch(opts.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.accessToken}`,
        apikey: opts.apikey,
      },
      body: JSON.stringify({ ...opts.body, stream: true }),
      signal: opts.signal,
    });

    if (!res.ok) {
      let msg = `Streaming TTS failed (${res.status})`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }

    if (res.headers.get('x-tts-stream') !== 'sse-pcm-24000') {
      throw new Error('Streaming response missing SSE PCM contract');
    }

    opts.onMeta?.({ usedFallbackVoice: res.headers.get('x-voice-fallback') === 'true' });

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body for streaming TTS');
    const decoder = new TextDecoder();
    let buffer = '';

    while (!stopped) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload) as { type?: string; audio?: string };
            if (evt.type === 'speech.audio.delta' && evt.audio) {
              scheduleChunk(base64ToBytes(evt.audio));
            }
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    }

    if (!startedPlayback) {
      throw new Error('Streaming TTS produced no audio');
    }

    // Wait for scheduled playback to finish.
    const remaining = Math.max(0, lastEndsAt - ctx.currentTime);
    await new Promise<void>(resolve => {
      const t = window.setTimeout(resolve, Math.ceil(remaining * 1000) + 50);
      if (stopped) {
        clearTimeout(t);
        resolve();
      }
    });
  })();

  return { done, stop };
}
