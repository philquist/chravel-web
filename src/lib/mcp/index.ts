import { auth, defineMcp } from '@lovable.dev/mcp-js';
import echoTool from './tools/echo';

// The OAuth issuer MUST be the direct Supabase host (not the .lovable.cloud proxy).
// Built from VITE_SUPABASE_PROJECT_ID which Vite inlines at build time, keeping
// this module import-safe (no runtime env reads at module top level).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? 'project-ref-unset';

export default defineMcp({
  name: 'chravel-mcp',
  title: 'Chravel MCP',
  version: '0.1.0',
  instructions:
    'Chravel agent integrations. Use `echo` to verify connectivity. Additional trip-aware tools will be added over time. Callers authenticate as a Chravel user via Supabase OAuth; tools act as that user.',
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: 'authenticated',
  }),
  tools: [echoTool],
});
