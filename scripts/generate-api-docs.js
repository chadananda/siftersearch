// scripts/generate-api-docs.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerJSDoc from 'swagger-jsdoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Define OpenAPI specification
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'SifterSearch API',
    version: '1.0.0',
    description: 'API for SifterSearch - An intelligent search and chat system',
    contact: {
      name: 'SifterSearch Support',
      url: 'https://siftersearch.com/support',
      email: 'support@siftersearch.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: '/api',
      description: 'API server'
    }
  ],
  tags: [
    {
      name: 'Public',
      description: 'Public API endpoints accessible with an API key'
    },
    {
      name: 'API Keys',
      description: 'API key management endpoints'
    },
    {
      name: 'System',
      description: 'System-related endpoints'
    }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key for accessing public endpoints'
      },
      ClerkAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token from Clerk authentication'
      }
    },
    schemas: {
      ApiKey: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier for the API key'
          },
          name: {
            type: 'string',
            description: 'Name/description of the API key'
          },
          key: {
            type: 'string',
            description: 'The API key value (only shown on creation)'
          },
          site_id: {
            type: 'string',
            description: 'ID of the site this key is associated with'
          },
          user_id: {
            type: 'string',
            description: 'ID of the user who created this key'
          },
          active: {
            type: 'boolean',
            description: 'Whether the key is active'
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp'
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          },
          last_used_at: {
            type: 'string',
            format: 'date-time',
            description: 'Last usage timestamp'
          }
        }
      },
      SearchResult: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier for the document'
          },
          title: {
            type: 'string',
            description: 'Document title'
          },
          content_snippet: {
            type: 'string',
            description: 'Snippet of content containing the search match'
          },
          score: {
            type: 'number',
            description: 'Relevance score'
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata about the document'
          }
        }
      },
      SearchResponse: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/SearchResult'
            }
          },
          total: {
            type: 'integer',
            description: 'Total number of matching results'
          },
          query: {
            type: 'string',
            description: 'The original search query'
          }
        }
      },
      Error: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Error status'
          },
          message: {
            type: 'string',
            description: 'Error message'
          }
        }
      }
    }
  }
};

// Options for the swagger-jsdoc
const options = {
  swaggerDefinition,
  apis: [
    path.join(rootDir, 'src/routes/api/**/*.js'),
    path.join(rootDir, 'src/routes/api/*.js')
  ]
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJSDoc(options);

// Create output directory if it doesn't exist
const outputDir = path.join(rootDir, 'static/api-docs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write the OpenAPI specification to a file
fs.writeFileSync(
  path.join(outputDir, 'openapi.json'),
  JSON.stringify(swaggerSpec, null, 2)
);

// Copy Swagger UI files
const swaggerUiDist = path.dirname(require.resolve('swagger-ui-dist'));
const swaggerUiFiles = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'favicon-32x32.png'
];

for (const file of swaggerUiFiles) {
  fs.copyFileSync(
    path.join(swaggerUiDist, file),
    path.join(outputDir, file)
  );
}

// Create HTML file for Swagger UI
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SifterSearch API Documentation</title>
  <link rel="stylesheet" type="text/css" href="swagger-ui.css" />
  <link rel="icon" type="image/png" href="favicon-32x32.png" sizes="32x32" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    
    *,
    *:before,
    *:after {
      box-sizing: inherit;
    }
    
    body {
      margin: 0;
      background: #fafafa;
    }
    
    .swagger-ui .topbar {
      background-color: #24292e;
    }
    
    .swagger-ui .info .title {
      color: #24292e;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="swagger-ui-bundle.js"></script>
  <script src="swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(outputDir, 'index.html'), html);

console.log('API documentation generated successfully at /static/api-docs/');

// Create a SvelteKit route to serve the API docs
const apiDocsRouteDir = path.join(rootDir, 'src/routes/api-docs');
if (!fs.existsSync(apiDocsRouteDir)) {
  fs.mkdirSync(apiDocsRouteDir, { recursive: true });
}

const pageServerJs = `
// src/routes/api-docs/+page.server.js
export function load() {
  return {
    title: 'SifterSearch API Documentation'
  };
}
`;

const pageJs = `
// src/routes/api-docs/+page.js
export const ssr = false;
`;

const pageSvelte = `
<!-- src/routes/api-docs/+page.svelte -->
<script>
  import { onMount } from 'svelte';
  export let data;
  
  onMount(() => {
    // Redirect to the static API docs
    window.location.href = '/api-docs/';
  });
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

<div class="container">
  <h1>Loading API Documentation...</h1>
  <p>If you are not redirected automatically, <a href="/api-docs/">click here</a>.</p>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
  }
</style>
`;

fs.writeFileSync(path.join(apiDocsRouteDir, '+page.server.js'), pageServerJs);
fs.writeFileSync(path.join(apiDocsRouteDir, '+page.js'), pageJs);
fs.writeFileSync(path.join(apiDocsRouteDir, '+page.svelte'), pageSvelte);

console.log('API documentation route created at /api-docs/');
