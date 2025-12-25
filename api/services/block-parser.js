/**
 * Markdown Block Parser
 *
 * Parses markdown text into typed blocks, enabling:
 * 1. Clean content storage (without markdown syntax)
 * 2. Exact markdown reconstruction from stored content
 * 3. Blocktype-based filtering in search
 *
 * Supported block types:
 * - paragraph: Regular text
 * - heading1: # Heading
 * - heading2: ## Heading
 * - heading3: ### Heading
 * - quote: > Quoted text
 * - list_item: - List item
 * - code: ```code blocks```
 */

/**
 * Block type definitions
 */
export const BLOCK_TYPES = {
  PARAGRAPH: 'paragraph',
  HEADING1: 'heading1',
  HEADING2: 'heading2',
  HEADING3: 'heading3',
  QUOTE: 'quote',
  LIST_ITEM: 'list_item',
  CODE: 'code'
};

/**
 * Parse markdown text into typed blocks
 *
 * @param {string} text - Raw markdown text
 * @returns {Array<{type: string, content: string, raw: string}>} Array of blocks
 */
export function parseMarkdownBlocks(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const blocks = [];
  const lines = text.split('\n');
  let currentParagraph = [];
  let inCodeBlock = false;
  let codeBlockContent = [];
  let codeBlockStart = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks (``` or ```)
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        blocks.push({
          type: BLOCK_TYPES.CODE,
          content: codeBlockContent.join('\n'),
          raw: codeBlockStart + '\n' + codeBlockContent.join('\n') + '\n```'
        });
        codeBlockContent = [];
        codeBlockStart = '';
        inCodeBlock = false;
      } else {
        // Start of code block - flush any pending paragraph
        if (currentParagraph.length) {
          const paragraphText = currentParagraph.join('\n').trim();
          if (paragraphText) {
            blocks.push({
              type: BLOCK_TYPES.PARAGRAPH,
              content: paragraphText,
              raw: paragraphText
            });
          }
          currentParagraph = [];
        }
        codeBlockStart = line;
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Check for heading (# ## ###)
    const headingMatch = line.match(/^(#{1,3}) (.+)$/);
    if (headingMatch) {
      // Flush any pending paragraph
      if (currentParagraph.length) {
        const paragraphText = currentParagraph.join('\n').trim();
        if (paragraphText) {
          blocks.push({
            type: BLOCK_TYPES.PARAGRAPH,
            content: paragraphText,
            raw: paragraphText
          });
        }
        currentParagraph = [];
      }

      const level = headingMatch[1].length;
      const headingType = level === 1 ? BLOCK_TYPES.HEADING1 :
                         level === 2 ? BLOCK_TYPES.HEADING2 :
                         BLOCK_TYPES.HEADING3;

      blocks.push({
        type: headingType,
        content: headingMatch[2].trim(),
        raw: line
      });
      continue;
    }

    // Check for blockquote (> text)
    if (line.startsWith('> ')) {
      // Flush paragraph
      if (currentParagraph.length) {
        const paragraphText = currentParagraph.join('\n').trim();
        if (paragraphText) {
          blocks.push({
            type: BLOCK_TYPES.PARAGRAPH,
            content: paragraphText,
            raw: paragraphText
          });
        }
        currentParagraph = [];
      }

      blocks.push({
        type: BLOCK_TYPES.QUOTE,
        content: line.slice(2).trim(),
        raw: line
      });
      continue;
    }

    // Check for list item (- item or * item)
    const listMatch = line.match(/^[-*] (.+)$/);
    if (listMatch) {
      // Flush paragraph
      if (currentParagraph.length) {
        const paragraphText = currentParagraph.join('\n').trim();
        if (paragraphText) {
          blocks.push({
            type: BLOCK_TYPES.PARAGRAPH,
            content: paragraphText,
            raw: paragraphText
          });
        }
        currentParagraph = [];
      }

      blocks.push({
        type: BLOCK_TYPES.LIST_ITEM,
        content: listMatch[1].trim(),
        raw: line
      });
      continue;
    }

    // Empty line = paragraph break
    if (!line.trim()) {
      if (currentParagraph.length) {
        const paragraphText = currentParagraph.join('\n').trim();
        if (paragraphText) {
          blocks.push({
            type: BLOCK_TYPES.PARAGRAPH,
            content: paragraphText,
            raw: paragraphText
          });
        }
        currentParagraph = [];
      }
      continue;
    }

    // Regular paragraph content
    currentParagraph.push(line);
  }

  // Flush remaining paragraph
  if (currentParagraph.length) {
    const paragraphText = currentParagraph.join('\n').trim();
    if (paragraphText) {
      blocks.push({
        type: BLOCK_TYPES.PARAGRAPH,
        content: paragraphText,
        raw: paragraphText
      });
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent.length) {
    blocks.push({
      type: BLOCK_TYPES.CODE,
      content: codeBlockContent.join('\n'),
      raw: codeBlockStart + '\n' + codeBlockContent.join('\n')
    });
  }

  return blocks;
}

/**
 * Reconstruct markdown from typed blocks
 *
 * @param {Array<{type: string, content: string}>} blocks - Array of blocks
 * @returns {string} Reconstructed markdown text
 */
export function blocksToMarkdown(blocks) {
  if (!blocks || !Array.isArray(blocks)) {
    return '';
  }

  return blocks.map(block => {
    switch (block.type) {
      case BLOCK_TYPES.HEADING1:
        return `# ${block.content}`;
      case BLOCK_TYPES.HEADING2:
        return `## ${block.content}`;
      case BLOCK_TYPES.HEADING3:
        return `### ${block.content}`;
      case BLOCK_TYPES.QUOTE:
        return `> ${block.content}`;
      case BLOCK_TYPES.LIST_ITEM:
        return `- ${block.content}`;
      case BLOCK_TYPES.CODE:
        return '```\n' + block.content + '\n```';
      case BLOCK_TYPES.PARAGRAPH:
      default:
        return block.content;
    }
  }).join('\n\n');
}

/**
 * Get the markdown prefix for a block type
 *
 * @param {string} blocktype - Block type
 * @returns {string} Markdown prefix (e.g., "# " for heading1)
 */
export function getBlockPrefix(blocktype) {
  switch (blocktype) {
    case BLOCK_TYPES.HEADING1: return '# ';
    case BLOCK_TYPES.HEADING2: return '## ';
    case BLOCK_TYPES.HEADING3: return '### ';
    case BLOCK_TYPES.QUOTE: return '> ';
    case BLOCK_TYPES.LIST_ITEM: return '- ';
    case BLOCK_TYPES.CODE: return '```\n';
    default: return '';
  }
}

/**
 * Get the markdown suffix for a block type
 *
 * @param {string} blocktype - Block type
 * @returns {string} Markdown suffix (e.g., "\n```" for code)
 */
export function getBlockSuffix(blocktype) {
  if (blocktype === BLOCK_TYPES.CODE) {
    return '\n```';
  }
  return '';
}

/**
 * Determine block type from raw markdown line
 *
 * @param {string} line - Raw markdown line
 * @returns {string} Block type
 */
export function detectBlockType(line) {
  if (!line || typeof line !== 'string') {
    return BLOCK_TYPES.PARAGRAPH;
  }

  if (line.startsWith('### ')) return BLOCK_TYPES.HEADING3;
  if (line.startsWith('## ')) return BLOCK_TYPES.HEADING2;
  if (line.startsWith('# ')) return BLOCK_TYPES.HEADING1;
  if (line.startsWith('> ')) return BLOCK_TYPES.QUOTE;
  if (line.match(/^[-*] /)) return BLOCK_TYPES.LIST_ITEM;
  if (line.startsWith('```')) return BLOCK_TYPES.CODE;

  return BLOCK_TYPES.PARAGRAPH;
}
