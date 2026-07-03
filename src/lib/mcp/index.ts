import { defineMcp } from '@lovable.dev/mcp-js';
import echoTool from './tools/echo';

export default defineMcp({
  name: 'chravel-mcp',
  title: 'Chravel MCP',
  version: '0.1.0',
  instructions:
    'Chravel agent integrations. Use `echo` to verify connectivity. Additional trip-aware tools will be added over time.',
  tools: [echoTool],
});
