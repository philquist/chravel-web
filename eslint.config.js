import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'public/**',
      'android/**',
      'supabase/**',
      'unfurl/**',
      'scripts/**',
      // Node render scripts (same class as scripts/**); remotion/src stays linted
      'remotion/scripts/**',
      'node_modules/**',
      '.ai/**',
      'docs/**',
      '*.config.js',
      '*.config.ts',
      '.lintstagedrc.js',
      '.prettierrc.js',
      'vercel.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unexpected-multiline': 'error',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: './enhancedTripContextService',
              message:
                'Deprecated. Use TripContextAggregator from src/services/tripContextAggregator.ts as the single source of truth.',
            },
            {
              name: '../services/enhancedTripContextService',
              message:
                'Deprecated. Use TripContextAggregator from src/services/tripContextAggregator.ts as the single source of truth.',
            },
            {
              name: '@/services/enhancedTripContextService',
              message:
                'Deprecated. Use TripContextAggregator from src/services/tripContextAggregator.ts as the single source of truth.',
            },
            {
              name: 'src/services/enhancedTripContextService',
              message:
                'Deprecated. Use TripContextAggregator from src/services/tripContextAggregator.ts as the single source of truth.',
            },
          ],
          patterns: [
            {
              group: ['**/enhancedTripContextService', '**/enhancedTripContextService.*'],
              message:
                'Deprecated. Use TripContextAggregator from src/services/tripContextAggregator.ts as the single source of truth.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/features/chat/components/**/*.{ts,tsx}',
      'src/components/pro/channels/**/*.{ts,tsx}',
      'src/hooks/stream/**/*.{ts,tsx}',
    ],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/services/chatService',
              message:
                'Stream-enabled chat surfaces must not import legacy chatService mutation APIs. Use Stream mutation callbacks from transport hooks.',
            },
          ],
          // Depth-agnostic guard: catches the legacy service via any relative
          // depth or alias so the Stream/legacy boundary cannot silently regress.
          patterns: [
            {
              group: ['**/services/chatService', '**/services/chatService.*'],
              message:
                'Stream-enabled chat surfaces must not import legacy chatService mutation APIs. Use Stream mutation callbacks from transport hooks.',
            },
          ],
        },
      ],
    },
  },
);
