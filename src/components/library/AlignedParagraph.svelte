<script>
  /**
   * AlignedParagraph Component
   * Displays original text and translation with interactive phrase-level highlighting.
   * Hover or tap on a phrase to highlight the corresponding phrase in the other language.
   */

  let {
    segments = [],
    direction = 'ltr',
    originalLabel = 'Original',
    translationLabel = 'Translation'
  } = $props();

  // Track which segment is currently active (hovered or tapped)
  let activeSegmentId = $state(null);

  // Handle mouse enter - activate segment
  function handleMouseEnter(segmentId) {
    activeSegmentId = segmentId;
  }

  // Handle mouse leave - deactivate if still the same segment
  function handleMouseLeave(segmentId) {
    if (activeSegmentId === segmentId) {
      activeSegmentId = null;
    }
  }

  // Handle tap/click - toggle segment on mobile
  function handleClick(segmentId) {
    if (activeSegmentId === segmentId) {
      activeSegmentId = null;
    } else {
      activeSegmentId = segmentId;
    }
  }
</script>

<div class="aligned-paragraph">
  <!-- Original text column -->
  <div class="text-column original" dir={direction}>
    <span class="column-label">{originalLabel}</span>
    <p class="text-content">
      {#each segments as seg (seg.id)}
        <span
          class="segment"
          class:active={activeSegmentId === seg.id}
          onmouseenter={() => handleMouseEnter(seg.id)}
          onmouseleave={() => handleMouseLeave(seg.id)}
          onclick={() => handleClick(seg.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && handleClick(seg.id)}
        >{seg.original}</span>{' '}
      {/each}
    </p>
  </div>

  <!-- Translation column -->
  <div class="text-column translation">
    <span class="column-label">{translationLabel}</span>
    <p class="text-content">
      {#each segments as seg (seg.id)}
        <span
          class="segment"
          class:active={activeSegmentId === seg.id}
          onmouseenter={() => handleMouseEnter(seg.id)}
          onmouseleave={() => handleMouseLeave(seg.id)}
          onclick={() => handleClick(seg.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && handleClick(seg.id)}
        >{seg.translation}</span>{' '}
      {/each}
    </p>
  </div>
</div>

<style>
  .aligned-paragraph {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .text-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .column-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
  }

  .text-content {
    margin: 0;
    font-family: 'Libre Caslon Text', Georgia, 'Times New Roman', serif;
    font-size: 0.9375rem;
    line-height: 1.65;
    color: #1a1a1a;
  }

  /* RTL text styling */
  .original[dir="rtl"] .text-content {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    font-size: 1.25rem;
    line-height: 1.85;
    text-align: right;
  }

  /* Segment styling */
  .segment {
    cursor: pointer;
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
    border-radius: 2px;
    padding: 0 2px;
    margin: 0 -2px;
  }

  .segment:hover {
    background-color: rgba(139, 115, 85, 0.1);
  }

  .segment:focus {
    outline: 2px solid rgba(139, 115, 85, 0.3);
    outline-offset: 1px;
  }

  /* Active segment - highlighted */
  .segment.active {
    background-color: rgba(139, 115, 85, 0.2);
    box-shadow: 0 0 0 2px rgba(139, 115, 85, 0.15);
  }

  /* Responsive - stack on mobile */
  @media (max-width: 640px) {
    .aligned-paragraph {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .text-column {
      padding: 0.75rem;
      background: #faf8f3;
      border-radius: 0.5rem;
      border: 1px solid rgba(0, 0, 0, 0.08);
    }

    .translation {
      background: #f5f2ea;
    }
  }
</style>
