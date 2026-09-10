import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        crypto: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',   // sibling of AbortSignal; its absence was the repo's only lint ERROR
        Uint8Array: 'readonly',
        ReadableStream: 'readonly',
        navigator: 'readonly',
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        // Svelte 5 runes
        $state: 'readonly',
        $derived: 'readonly',
        $effect: 'readonly',
        $props: 'readonly',
        $bindable: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-case-declarations': 'off', // Allow declarations in case blocks
      // Newly in eslint:recommended as of ESLint 10. Every one of the 45 it flags
      // here is the deliberate `let x = <safe default>;` before a try/catch that
      // reassigns it — dropping the initializer would leave x undefined on a path
      // the catch does not cover. Kept visible as a warning, not an error, in the
      // same spirit as no-unused-vars and prefer-const above.
      'no-useless-assignment': 'warn'
    }
  },
  {
    // Cloudflare Workers runtime (worker/) — these are platform globals, not Node's.
    // Without this the worker's own fetch/Response/caches read as undefined vars and the
    // pre-commit lint gate blocks every worker change.
    files: ['worker/**/*.js'],
    languageOptions: {
      globals: {
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        addEventListener: 'readonly',
        console: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        ReadableStream: 'readonly'
      }
    }
  },
  {
    // CommonJS files (.cjs) need module and exports globals
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly'
      }
    }
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.astro/**',
      '.wrangler/**',
      'data/**',
      'tmp/**',
      'scripts/wip/**',
      'planning/**',
      '*.min.js',
      // Generated Vite bundle (src/widget → here). Linting build output produced
      // 17 of the repo's lint errors — all of them about browser globals and
      // minifier-shaped code that no one will ever edit by hand.
      'api/static/widget/sifter-chat.js',
      // Skip Svelte/Astro files - need special parsers
      '**/*.svelte',
      '**/*.astro'
    ]
  }
];
