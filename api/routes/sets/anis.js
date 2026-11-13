// The ANÍS service's routes (siftersearch-anis): conversations (chat stream), letters, the reading guide, the widget and
// companion — a change here reloads only Anís (docs/architecture/continuous-deploy.md).
import companionMeRoutes from '../companion-me.js';
import assistantMailRoutes from '../assistant-mail.js';
import readingRoutes from '../reading.js';
import chatRoutes from '../chat.js';
import widgetRoutes from '../widget.js';
import anisDocsRoutes from '../anis-docs.js';
import anisToolsRoutes from '../anis-impl-tools.js';

export const ANIS_ROUTES = [
  [companionMeRoutes, { prefix: '/api/v1/companion' }],
  [assistantMailRoutes, { prefix: '/api/v1/anis' }],   // Anís letters: footer pause link
  [anisToolsRoutes, { prefix: '/api/v1/anis' }],   // research-tool API for the edge Worker: POST /tool/:fn, /tools, GET /tool-names (internal key)
  [anisDocsRoutes, { prefix: '/api/v1/anis' }],   // public docs reads: /strategies, /activities, /tools (strategy graph Phase 2)
  [readingRoutes, { prefix: '/api/v1/reading' }],   // reading guide: one turn, any channel
  [chatRoutes, { prefix: '/api/chat' }],
  [widgetRoutes, {}],   // SifterChat embed: /widget.js, /widget/sifter-chat.js, /api/v1/widget/config/:token (absolute paths)
];
