import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { componentTagger } from 'lovable-tagger';
import { mcpPlugin } from '@lovable.dev/mcp-js/stacks/supabase/vite';

// Generate build version timestamp
const buildVersion = Date.now().toString(36);

// Plugin to replace build version placeholder in index.html
const buildVersionPlugin = (): Plugin => ({
  name: 'build-version-plugin',
  transformIndexHtml(html) {
    return html.replace('__BUILD_VERSION__', buildVersion);
  },
});

// Vendor chunk groups (same groups as the previous object-form manualChunks,
// with each package's bundled-in dependencies listed explicitly).
const VENDOR_CHUNKS: Record<string, string[]> = {
  'react-vendor': [
    'react',
    'react-dom',
    'scheduler',
    'react-router',
    'react-router-dom',
    '@remix-run/router',
  ],
  'ui-vendor': [
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-select',
    '@radix-ui/react-tabs',
  ],
  supabase: [
    '@supabase/supabase-js',
    '@supabase/auth-js',
    '@supabase/functions-js',
    '@supabase/node-fetch',
    '@supabase/postgrest-js',
    '@supabase/realtime-js',
    '@supabase/storage-js',
  ],
  // stream-chat (~423 KB) — isolated into one stable, cacheable chunk
  'stream-chat': ['stream-chat'],
  utils: ['date-fns', 'clsx', 'tailwind-merge'],
  charts: ['recharts'],
  pdf: ['jspdf', 'jspdf-autotable', 'html2canvas'],
  // exceljs (~950 KB) — only needed when importing a spreadsheet, lazy-loaded
  exceljs: ['exceljs'],
};

const PACKAGE_TO_CHUNK = new Map<string, string>();
for (const [chunkName, packages] of Object.entries(VENDOR_CHUNKS)) {
  for (const pkg of packages) {
    PACKAGE_TO_CHUNK.set(pkg, chunkName);
  }
}

/** Extract the npm package name (including @scope/) from a module id. */
const packageNameFromModuleId = (id: string): string | null => {
  const match = id.match(/[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/);
  return match ? match[1].replace(/\\/g, '/') : null;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  /**
   * P0 fix: using a relative base (`./`) breaks deep links like `/join/:code`
   * because bundles are requested from `/join/assets/...` and 404, causing a blank screen.
   */
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 8080,
  },
  plugins: [
    react(),
    buildVersionPlugin(),
    mcpPlugin(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Inject build version for SW cache busting when VITE_BUILD_ID not set (e.g. Vercel)
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(
      process.env.VITE_BUILD_ID || process.env.RENDER_GIT_COMMIT || buildVersion,
    ),
    // Deploy markers for incident correlation in telemetry
    'import.meta.env.VITE_DEPLOY_SHA': JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || 'local',
    ),
    'import.meta.env.VITE_DEPLOY_TIMESTAMP': JSON.stringify(new Date().toISOString()),
  },
  build: {
    // Performance optimizations
    rollupOptions: {
      output: {
        // Manual chunks for better caching (function form, not object form:
        // object form left Vite's dynamic-import preload helper unassigned and
        // Rollup colocated it with the 'pdf' chunk — since every lazy chunk
        // imports that helper, the entire 624KB jspdf/html2canvas bundle was
        // statically pulled into the boot path of every page).
        manualChunks: (id: string) => {
          // Pin the preload helper to the always-loaded react-vendor chunk.
          if (id.includes('vite/preload-helper')) return 'react-vendor';
          const pkg = packageNameFromModuleId(id);
          return pkg ? PACKAGE_TO_CHUNK.get(pkg) : undefined;
        },
        // Optimize chunk names - include build version for aggressive cache busting
        chunkFileNames: `assets/js/[name]-[hash]-${buildVersion}.js`,
        entryFileNames: `assets/js/[name]-[hash]-${buildVersion}.js`,
        assetFileNames: assetInfo => {
          if (!assetInfo.name) return 'assets/[name]-[hash][extname]';
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/woff|woff2|eot|ttf|otf/i.test(ext)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    // Use esbuild for faster and lighter minification (default)
    minify: 'esbuild',
    // Optimize CSS
    cssMinify: true,
    // Set chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Source maps for production debugging
    sourcemap: mode !== 'production',
    // Asset inlining threshold
    assetsInlineLimit: 4096,
  },
  // Strip developer console noise from production bundles only.
  // `console.log/debug/info` return undefined and their result is always unused,
  // so esbuild's minifier drops these pure-annotated calls — while `console.error`
  // and `console.warn` (used for Sentry/error reporting) are intentionally kept.
  // Dev builds are unaffected, so logs remain visible during local development.
  esbuild: {
    pure: mode === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    force: mode === 'development',
    exclude: ['@sentry/react', 'posthog-js'],
  },
}));
