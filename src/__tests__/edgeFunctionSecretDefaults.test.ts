import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('edge function privileged secret defaults', () => {
  it('keeps TTS free-for-all behavior opt-in only', () => {
    for (const path of [
      'supabase/functions/concierge-tts/index.ts',
      'supabase/functions/gemini-tts/index.ts',
    ]) {
      const source = readRepoFile(path);
      expect(source).toContain(
        "const VOICE_TTS_FREE_FOR_ALL = Deno.env.get('VOICE_TTS_FREE_FOR_ALL') === 'true';",
      );
      expect(source).not.toMatch(/VOICE_TTS_FREE_FOR_ALL[\s\S]*\?\? ['"]true['"]/);
    }
  });

  it('does not downgrade privileged service-role clients to anon credentials', () => {
    for (const path of [
      'supabase/functions/concierge-tts/index.ts',
      'supabase/functions/gemini-tts/index.ts',
      'supabase/functions/push-notifications/index.ts',
    ]) {
      const source = readRepoFile(path);
      expect(source).not.toMatch(
        /SUPABASE_SERVICE_ROLE_KEY['"]\)\s*(\|\||\?\?)\s*SUPABASE_ANON_KEY/,
      );
      expect(source).not.toMatch(
        /SUPABASE_SERVICE_ROLE_KEY['"]\)\s*(\|\||\?\?)\s*Deno\.env\.get\(['"]SUPABASE_ANON_KEY['"]\)/,
      );
    }
  });
});
