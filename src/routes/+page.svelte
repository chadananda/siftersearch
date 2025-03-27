<script>
  import Chat from '$lib/components/ui/Chat.svelte';
  import { authStore } from '$lib/client/auth.js';
  import { browser } from '$app/environment';

  const testData = [
    {
      speaker: 'system',
      message: `# Welcome to Sifter Search

I'm here to help you search and explore the library. I can:

- Find specific documents and topics
- Explain concepts and their relationships
- Compile thematic summaries
- Track historical figures and places
- Answer questions about the library

How may I assist you today?`
    },
    {
      speaker: 'user',
      message: "Can you show me some examples of different types of content formatting?"
    },
    {
      speaker: 'assistant',
      message: `# Comprehensive Formatting Examples

## 1. Text Styles
Here's a showcase of different text styles:
- **Bold text** for emphasis
- *Italic text* for subtle emphasis
- ~~Strikethrough~~ for outdated info
- \`inline code\` for technical terms

## 2. Lists
### Ordered List
1. First item
2. Second item with sub-items:
   1. Sub-item A
   2. Sub-item B
3. Third item

### Unordered List
- Main point
  - Supporting detail
  - Another detail
    - Even deeper detail
- Another point

## 3. Tables
### Library Statistics

| Category | Count | Growth Rate |
|----------|--------|-------------|
| Books | 150,000 | +5% |
| Articles | 75,000 | +12% |
| Manuscripts | 25,000 | +3% |
| Digital Resources | 500,000 | +25% |

## 4. Code Blocks
\`\`\`javascript
function searchLibrary(query) {
  return library.filter(item => 
    item.title.includes(query) ||
    item.content.includes(query)
  );
}
\`\`\`

## 5. Blockquotes
> "Knowledge is of two kinds. We know a subject ourselves, or we know where we can find information upon it."
> — Samuel Johnson

## 6. RTL Text Support
### Arabic Text
<div dir="rtl">
مرحباً بكم في مكتبتنا الرقمية. نحن نقدم مجموعة واسعة من الكتب والمقالات.
</div>

### Hebrew Text
<div dir="rtl">
ברוכים הבאים לספרייה הדיגיטלית שלנו. אנו מציעים מגוון רחב של ספרים ומאמרים.
</div>

## 7. Mixed Content Example
Here's a complex example combining multiple elements:

> ### Research Methods
> When conducting library research:
> 1. **Define** your topic
> 2. *Identify* key sources
> 3. Create a structured outline:
>    - Main arguments
>    - Supporting evidence
>    - Counter-arguments
>
> | Phase | Duration | Deliverable |
> |-------|----------|-------------|
> | Planning | 1 week | Outline |
> | Research | 3 weeks | Draft |
> | Review | 1 week | Final Paper |`
    },
    {
      speaker: 'user',
      message: "That's impressive! Can you show me some mathematical and scientific notation?"
    },
    {
      speaker: 'assistant',
      message: `# Mathematical and Scientific Notation

## Mathematical Equations
Here are some common mathematical equations:

1. Pythagorean Theorem:

   $$
   a^2 + b^2 = c^2
   $$

2. Quadratic Formula:

   $$
   x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
   $$

3. Einstein's Mass-Energy Equivalence:

   $$
   E = mc^2
   $$

4. Some inline math examples:
   - Area of a circle: $A = \pi r^2$
   - Euler's identity: $e^{i\pi} + 1 = 0$
   - Sum notation: $\sum_{i=1}^n i = \frac{n(n+1)}{2}$

## Chemical Equations
Some basic chemical reactions:

$$
\begin{aligned}
2H_2 + O_2 &\rightarrow 2H_2O \\
CaCO_3 + 2HCl &\rightarrow CaCl_2 + H_2O + CO_2
\end{aligned}
$$

## Data Analysis Example

### Temperature Readings (°C)
| Time | Reading 1 | Reading 2 | Average |
|------|-----------|-----------|---------|
| 0h   | 20.5     | 20.7     | 20.6    |
| 1h   | 21.2     | 21.0     | 21.1    |
| 2h   | 22.1     | 22.3     | 22.2    |

### Statistical Analysis
- Mean (μ): 21.3°C
- Standard Deviation (σ): 0.8
- Confidence Interval: 21.3 ± 0.4°C

## Molecular Structure
ASCII representation of water molecule:
\`\`\`
    H
    |
H - O
\`\`\`

## SI Units Table
| Quantity | Unit | Symbol |
|----------|------|--------|
| Length | meter | m |
| Mass | kilogram | kg |
| Time | second | s |
| Temperature | kelvin | K |
| Current | ampere | A |`
    },
    {
      speaker: 'user',
      message: 'These examples are helpful. Can you show me some historical and literary examples?'
    },
    {
      speaker: 'assistant',
      message: `# Historical and Literary Examples

## Timeline of Ancient Civilizations

| Period | Civilization | Key Developments |
|--------|--------------|------------------|
| 3500-1750 BCE | Mesopotamia | Cuneiform writing, Code of Hammurabi |
| 3000-30 BCE | Ancient Egypt | Hieroglyphs, Pyramids |
| 2200-500 BCE | Ancient India | Vedas, Buddhism |
| 1600-1046 BCE | Shang Dynasty | Oracle bones, Bronze metallurgy |

## Literary Analysis Example

### Shakespeare's Sonnet 18
> Shall I compare thee to a summer's day?
> Thou art more lovely and more temperate:
> Rough winds do shake the darling buds of May,
> And summer's lease hath all too short a date...

#### Analysis Points
1. **Metaphor**: Summer day comparison
   - Natural beauty
   - Temporal nature
   - Divine perfection

2. **Structure**
   - *Rhyme scheme*: abab cdcd efef gg
   - *Meter*: Iambic pentameter
   - *Turn*: Line 9

## Historical Documents

### Declaration of Independence
Key principles:
- Natural rights
- Popular sovereignty
- Right of revolution

> We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights...

## Multilingual Literary Traditions

### Arabic Poetry
<div dir="rtl">
قفا نبكِ من ذكرى حبيبٍ ومنزلِ
بسقطِ اللوى بين الدخولِ فحوملِ
</div>

### Chinese Classical Poetry
春眠不觉晓，
处处闻啼鸟。
夜来风雨声，
花落知多少。

## Archaeological Findings Table

| Artifact | Location | Date | Significance |
|----------|----------|------|--------------|
| Rosetta Stone | Egypt | 196 BCE | Key to hieroglyphs |
| Dead Sea Scrolls | Qumran | 2nd BCE-1st CE | Biblical texts |
| Terracotta Army | Xi'an | 210-209 BCE | Qin dynasty |`
    }
  ];

  const messages = $state(testData);
  
  // Get authentication status from auth store
  const isAuthenticated = $derived($authStore.isAuthenticated);

  async function handleMessage(event) {
    const userMessage = {
      speaker: 'user',
      message: event.detail.text
    };
    
    messages.push(userMessage);

    // TODO: Send to API and get response
    // For now, just echo back
    const assistantMessage = {
      speaker: 'assistant',
      message: `You said: ${event.detail.text}`
    };

    // Add assistant message after a small delay to simulate API call
    setTimeout(() => {
      messages.push(assistantMessage);
    }, 1000);
  }
  
  // Function to handle login request from Chat component
  function handleLogin() {
    if (browser && window.Clerk) {
      window.Clerk.openSignIn();
    }
  }
</script>

<div class="h-full">
  <Chat 
    {messages} 
    {isAuthenticated}
    on:message={handleMessage}
    on:login={handleLogin}
  />
</div>

<style>
  :global(html) {
    height: 100%;
    overflow: hidden;
  }
  
  :global(body) {
    height: 100%;
    overflow: hidden;
  }
</style>
