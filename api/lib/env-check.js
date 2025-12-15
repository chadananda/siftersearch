/**
 * Environment Variable Checker
 *
 * Validates all required and optional API keys/configuration on startup.
 * Provides clear feedback about what's configured and what's missing.
 */

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

/**
 * Environment variable definitions
 * - required: App won't start without these
 * - recommended: Features degraded without these
 * - optional: Nice to have, feature-specific
 */
export const ENV_CONFIG = {
  // Core Configuration (Required)
  core: {
    name: 'Core Configuration',
    required: true,
    vars: [
      { key: 'API_PORT', description: 'API server port', default: '3000' },
      { key: 'TURSO_DATABASE_URL', description: 'Database connection URL' },
      { key: 'JWT_ACCESS_SECRET', aliases: ['JWT_SECRET'], description: 'JWT signing secret (access tokens)', sensitive: true },
      { key: 'JWT_REFRESH_SECRET', aliases: ['JWT_SECRET'], description: 'JWT signing secret (refresh tokens)', sensitive: true }
    ]
  },

  // Search (Required for core functionality)
  search: {
    name: 'Search (Meilisearch)',
    required: true,
    vars: [
      { key: 'MEILI_HOST', description: 'Meilisearch server URL', default: 'http://localhost:7700' },
      { key: 'MEILI_MASTER_KEY', aliases: ['MEILISEARCH_KEY'], description: 'Meilisearch admin key', sensitive: true }
    ]
  },

  // Authentication (Required)
  auth: {
    name: 'Authentication (Clerk)',
    required: true,
    vars: [
      { key: 'PUBLIC_CLERK_PUBLISHABLE_KEY', description: 'Clerk public key' },
      { key: 'CLERK_SECRET_KEY', description: 'Clerk secret key', sensitive: true }
    ]
  },

  // AI/LLM - Embeddings (Required for search)
  embeddings: {
    name: 'AI Embeddings',
    required: true,
    vars: [
      { key: 'OPENAI_API_KEY', description: 'OpenAI API key (for embeddings)', sensitive: true },
      { key: 'EMBEDDING_MODEL', description: 'Embedding model', default: 'text-embedding-3-large' },
      { key: 'EMBEDDING_DIMENSIONS', description: 'Embedding dimensions', default: '3072' }
    ]
  },

  // AI/LLM - Chat (Recommended)
  chat: {
    name: 'AI Chat/Orchestration',
    required: false,
    recommended: true,
    vars: [
      { key: 'CHAT_LLM_PROVIDER', description: 'Chat provider (openai/anthropic/ollama)', default: 'openai' },
      { key: 'CHAT_LLM_MODEL', description: 'Chat model', default: 'gpt-4o' },
      { key: 'ANTHROPIC_API_KEY', description: 'Anthropic API key (if using Claude)', sensitive: true, conditional: 'CHAT_LLM_PROVIDER=anthropic' }
    ]
  },

  // Audio/TTS (Optional)
  audio: {
    name: 'Audio/Text-to-Speech',
    required: false,
    vars: [
      { key: 'AUDIO_DIR', description: 'Audio file storage path', default: './data/audio' },
      // Uses OPENAI_API_KEY from embeddings
    ],
    note: 'Uses OpenAI TTS (requires OPENAI_API_KEY)'
  },

  // Translation (Optional)
  translation: {
    name: 'Translation Service',
    required: false,
    vars: [
      { key: 'TRANSLATION_DIR', description: 'Translation cache path', default: './data/translations' }
    ],
    note: 'Uses configured chat LLM provider'
  },

  // Email (Optional)
  email: {
    name: 'Email Notifications',
    required: false,
    vars: [
      { key: 'EMAIL_PROVIDER', description: 'Email provider (resend/sendgrid/brevo/console)', default: 'console' },
      { key: 'EMAIL_FROM', description: 'From address', default: 'SifterSearch <noreply@siftersearch.com>' },
      { key: 'RESEND_API_KEY', description: 'Resend API key', sensitive: true, conditional: 'EMAIL_PROVIDER=resend' },
      { key: 'SENDGRID_API_KEY', description: 'SendGrid API key', sensitive: true, conditional: 'EMAIL_PROVIDER=sendgrid' },
      { key: 'BREVO_API_KEY', description: 'Brevo API key', sensitive: true, conditional: 'EMAIL_PROVIDER=brevo' }
    ]
  },

  // Cloud Storage (Optional)
  storage: {
    name: 'Cloud Storage',
    required: false,
    vars: [
      { key: 'B2_APPLICATION_KEY_ID', description: 'Backblaze B2 key ID', sensitive: true },
      { key: 'B2_APPLICATION_KEY', description: 'Backblaze B2 secret', sensitive: true },
      { key: 'SCALEWAY_ACCESS_KEY', description: 'Scaleway access key', sensitive: true },
      { key: 'SCALEWAY_SECRET_KEY', description: 'Scaleway secret', sensitive: true }
    ]
  },

  // Production Database (Optional - for cloud deployment)
  cloudDatabase: {
    name: 'Cloud Database (Turso)',
    required: false,
    vars: [
      { key: 'TURSO_AUTH_TOKEN', description: 'Turso authentication token', sensitive: true }
    ],
    note: 'Required for production deployment to Turso cloud'
  },

  // Local AI (Optional - for self-hosted)
  localAI: {
    name: 'Local AI (Ollama)',
    required: false,
    vars: [
      { key: 'OLLAMA_HOST', description: 'Ollama server URL', default: 'http://localhost:11434' },
      { key: 'OLLAMA_CHAT_MODEL', description: 'Ollama chat model', default: 'qwen2.5:32b' },
      { key: 'OLLAMA_SEARCH_MODEL', description: 'Ollama search model', default: 'qwen2.5:14b' }
    ],
    note: 'Alternative to cloud AI providers'
  },

  // Voice (Optional - alternative TTS)
  voice: {
    name: 'Voice (Ultravox)',
    required: false,
    vars: [
      { key: 'ULTRAVOX_API_KEY', description: 'Ultravox API key', sensitive: true }
    ],
    note: 'Alternative voice provider'
  },

  // Analytics (Optional)
  analytics: {
    name: 'Analytics (PostHog)',
    required: false,
    vars: [
      { key: 'POSTHOG_SITE_KEY', description: 'PostHog site key' }
    ]
  }
};

/**
 * Check if a conditional variable should be validated
 */
function shouldCheckConditional(conditional) {
  if (!conditional) return true;

  const [key, value] = conditional.split('=');
  return process.env[key] === value;
}

/**
 * Mask sensitive value for display
 */
function maskValue(value, sensitive) {
  if (!value) return '(not set)';
  if (!sensitive) return value.length > 50 ? value.substring(0, 47) + '...' : value;

  // Show first 4 and last 4 chars for sensitive values
  if (value.length <= 12) return '****';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
}

/**
 * Check all environment variables and return status
 */
export function checkEnvironment(options = {}) {
  const { silent = false, exitOnError = true } = options;

  const results = {
    valid: true,
    missing: {
      required: [],
      recommended: [],
      optional: []
    },
    configured: [],
    warnings: [],
    sections: {}
  };

  for (const [sectionKey, section] of Object.entries(ENV_CONFIG)) {
    const sectionResult = {
      name: section.name,
      required: section.required,
      recommended: section.recommended || false,
      configured: [],
      missing: [],
      note: section.note
    };

    for (const varDef of section.vars) {
      // Skip conditional vars that don't apply
      if (!shouldCheckConditional(varDef.conditional)) {
        continue;
      }

      // Check primary key first, then aliases
      let value = process.env[varDef.key];
      let usedKey = varDef.key;

      if ((value === undefined || value === '') && varDef.aliases) {
        for (const alias of varDef.aliases) {
          const aliasValue = process.env[alias];
          if (aliasValue !== undefined && aliasValue !== '') {
            value = aliasValue;
            usedKey = alias;
            // Also set the primary key for the app to use
            process.env[varDef.key] = aliasValue;
            break;
          }
        }
      }

      const hasValue = value !== undefined && value !== '';
      const hasDefault = varDef.default !== undefined;

      if (hasValue) {
        const displayKey = usedKey !== varDef.key ? `${varDef.key} (via ${usedKey})` : varDef.key;
        sectionResult.configured.push({
          key: displayKey,
          value: maskValue(value, varDef.sensitive),
          description: varDef.description
        });
        results.configured.push(varDef.key);
      } else if (hasDefault) {
        // Has default, use it
        process.env[varDef.key] = varDef.default;
        sectionResult.configured.push({
          key: varDef.key,
          value: `${varDef.default} (default)`,
          description: varDef.description
        });
      } else {
        // Missing
        const aliasHint = varDef.aliases ? ` (or ${varDef.aliases.join(', ')})` : '';
        sectionResult.missing.push({
          key: varDef.key + aliasHint,
          description: varDef.description,
          sensitive: varDef.sensitive
        });

        if (section.required) {
          results.missing.required.push(varDef.key);
          results.valid = false;
        } else if (section.recommended) {
          results.missing.recommended.push(varDef.key);
        } else {
          results.missing.optional.push(varDef.key);
        }
      }
    }

    results.sections[sectionKey] = sectionResult;
  }

  // Add warnings for common issues
  if (process.env.DEV_MODE === 'true' && !process.env.OPENAI_API_KEY) {
    results.warnings.push('DEV_MODE=true but OPENAI_API_KEY not set - AI features will fail');
  }

  if (process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== 'console') {
    const providerKey = `${process.env.EMAIL_PROVIDER.toUpperCase()}_API_KEY`;
    if (!process.env[providerKey]) {
      results.warnings.push(`EMAIL_PROVIDER=${process.env.EMAIL_PROVIDER} but ${providerKey} not set`);
    }
  }

  // Print results unless silent
  if (!silent) {
    printResults(results);
  }

  // Exit if required vars missing
  if (!results.valid && exitOnError) {
    console.error(`\n${colors.red}${colors.bold}Cannot start: Missing required environment variables${colors.reset}\n`);
    process.exit(1);
  }

  return results;
}

/**
 * Print formatted results to console
 */
function printResults(results) {
  console.log('\n' + colors.bold + '═══════════════════════════════════════════════════════════════' + colors.reset);
  console.log(colors.bold + '                    SifterSearch Environment Check' + colors.reset);
  console.log(colors.bold + '═══════════════════════════════════════════════════════════════' + colors.reset + '\n');

  for (const [_key, section] of Object.entries(results.sections)) {
    const hasIssues = section.missing.length > 0;
    const isRequired = section.required;
    const isRecommended = section.recommended;

    // Section header with status indicator
    let statusIcon, statusColor;
    if (section.missing.length === 0) {
      statusIcon = '✓';
      statusColor = colors.green;
    } else if (isRequired) {
      statusIcon = '✗';
      statusColor = colors.red;
    } else if (isRecommended) {
      statusIcon = '!';
      statusColor = colors.yellow;
    } else {
      statusIcon = '○';
      statusColor = colors.dim;
    }

    const requiredTag = isRequired ? ` ${colors.red}(required)${colors.reset}` :
                        isRecommended ? ` ${colors.yellow}(recommended)${colors.reset}` : '';

    console.log(`${statusColor}${statusIcon}${colors.reset} ${colors.bold}${section.name}${colors.reset}${requiredTag}`);

    // Show configured vars
    for (const v of section.configured) {
      console.log(`  ${colors.green}✓${colors.reset} ${v.key}: ${colors.dim}${v.value}${colors.reset}`);
    }

    // Show missing vars
    for (const v of section.missing) {
      const icon = isRequired ? colors.red + '✗' : colors.yellow + '○';
      console.log(`  ${icon}${colors.reset} ${v.key}: ${colors.dim}${v.description}${colors.reset}`);
    }

    // Show section note if present
    if (section.note && section.missing.length > 0) {
      console.log(`  ${colors.dim}↳ ${section.note}${colors.reset}`);
    }

    console.log('');
  }

  // Summary
  console.log(colors.bold + '───────────────────────────────────────────────────────────────' + colors.reset);

  if (results.valid) {
    console.log(`${colors.green}${colors.bold}✓ All required environment variables configured${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}✗ Missing ${results.missing.required.length} required variable(s):${colors.reset}`);
    results.missing.required.forEach(key => {
      console.log(`  ${colors.red}• ${key}${colors.reset}`);
    });
  }

  if (results.missing.recommended.length > 0) {
    console.log(`${colors.yellow}! ${results.missing.recommended.length} recommended variable(s) not set${colors.reset}`);
  }

  if (results.missing.optional.length > 0) {
    console.log(`${colors.dim}○ ${results.missing.optional.length} optional variable(s) not set${colors.reset}`);
  }

  // Warnings
  if (results.warnings.length > 0) {
    console.log('');
    console.log(`${colors.yellow}${colors.bold}Warnings:${colors.reset}`);
    results.warnings.forEach(w => {
      console.log(`  ${colors.yellow}⚠ ${w}${colors.reset}`);
    });
  }

  console.log(colors.bold + '═══════════════════════════════════════════════════════════════' + colors.reset + '\n');
}

/**
 * Get a quick status summary (for logs)
 */
export function getEnvSummary() {
  const results = checkEnvironment({ silent: true, exitOnError: false });

  return {
    valid: results.valid,
    configured: results.configured.length,
    missingRequired: results.missing.required.length,
    missingRecommended: results.missing.recommended.length,
    missingOptional: results.missing.optional.length,
    warnings: results.warnings.length
  };
}

export default { checkEnvironment, getEnvSummary, ENV_CONFIG };
