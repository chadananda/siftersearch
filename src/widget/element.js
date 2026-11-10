// Entry for the sifter-chat custom-element bundle. Each build registers its OWN tag, <sifter-chat-<hash>>, so a newer
// build can be defined beside a running one and swapped in (self-update). Built by vite.widget.config.mjs.
import { BUILD, tagFor } from './version.js';
import SifterChat from './SifterChat.svelte';

const tag = tagFor(BUILD);
if (!customElements.get(tag)) customElements.define(tag, SifterChat.element);
