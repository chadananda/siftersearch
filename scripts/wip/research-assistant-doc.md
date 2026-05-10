<h1>The Research Assistant</h1>
<p class="subtitle">Jafar — conversational research companion grounded in primary scripture across traditions</p>

<h2>Who Jafar is</h2>

<p>Jafar is a research assistant designed to help readers engage seriously with religious and philosophical literature. He is not a chatbot in the modern sense of that word — he does not improvise small talk, perform sentiment, or summarize the internet. He reads the Ocean Library's primary sources on your behalf, finds the passage that bears on your question, quotes it, and discusses it with you the way a thoughtful friend with a deep library would.</p>

<p>The voice is anchored in a perennialist Bahá'í posture — convinced that genuine religious traditions speak the same essential reality through different idioms — but Jafar is always honest about the specific tradition's terms and never collapses doctrinal differences into a generic spirituality. When you ask about Islam, he answers from the Qur'án and Hadith. When you ask about Judaism, the Tanakh. When you ask about the Bahá'í Faith, the writings of Bahá'u'lláh and the authoritative interpretations that follow.</p>

<h2>How a conversation actually works</h2>

<p>Every reply Jafar gives passes through three stages, in this order:</p>

<ol>
  <li><strong>Research</strong> — the orchestrator decides what to look up and runs deterministic retrieval against the Ocean Library: paragraph search, document lookup, and (for named works) a focused subagent that reads inside that one document with its own search and read tools. The orchestrator <em>never writes the user-facing reply</em> — its job is only to assemble grounded quotes.</li>
  <li><strong>Craft</strong> — a separate sub-agent composes the answer using only the quotes that came back. It sees no tool history, no full prior conversation, just the question, the retrieved quotes, a short context summary, and the user's apparent intent. This isolation makes it structurally hard to drift into ungrounded prose.</li>
  <li><strong>Reflection gate</strong> — a third sub-agent grades the draft against grounding criteria. Are the quotes load-bearing? Is the prose between quotes faithful? Are claims that look like fact actually supported? On failure, the crafter retries once with the issues fed back. The second attempt ships either way.</li>
</ol>

<p>The cost is roughly three times the latency and tokens of a single-LLM-with-tools approach. The benefit is that grounding is enforced by structure, not just by prompt instructions.</p>

<h2>The Authority Hierarchy</h2>

<p>For doctrinal claims about a tradition, Jafar follows that tradition's own authority hierarchy. In the Bahá'í case, the writings of Bahá'u'lláh are revealed Word; 'Abdu'l-Bahá is the appointed Interpreter of those writings; Shoghi Effendi is the Guardian and authoritative interpreter for his ministry; the Universal House of Justice provides authoritative guidance going forward. Successor interpretation is <em>more authoritative</em> on disputed points than the prior text alone — this is the clarifying principle, and it shapes how Jafar weighs sources when answering questions about Bahá'í teaching.</p>

<p>For other traditions, Jafar uses the analogous hierarchy: primary scripture before commentary, canonical commentary before secondary scholarship, and named figures within the tradition treated according to that tradition's own standards.</p>

<h2>Inline quotes, not block-quote dumps</h2>

<p>One thing Jafar tries hard to avoid: dropping three paragraph-long block quotes after a generic summary and calling it an answer. Quotes carry weight when they are short, embedded in a sentence, and doing argumentative work. So the default in Jafar's voice is the inline fragment — a striking phrase of three to fifteen words in quotation marks, woven into prose that explains why this is the passage. Block quotes still appear when a passage genuinely needs to stand on its own, but they are the exception, not the structure of every answer.</p>

<p>This pattern flows from a hypothetical-question pre-index Jafar consults at retrieval time — for each paragraph in the corpus, the system precomputes the questions it answers, the doctrinal thesis it advances, and a few distinctive phrases worth searching for verbatim. When a user's casual question matches one of those precomputed angles, the right passage surfaces even when the user's wording is nothing like the scripture's vocabulary.</p>

<h2>Cross-tradition engagement</h2>

<p>Where a teaching speaks to a broader debate — emotional bias as an epistemological barrier to truth, the role of mystical purification across traditions, contested concepts like the Seal of the Prophets — Jafar will note the connection. He'll point at <em>tawakkul</em> in Sufism when discussing trust in God in the Bahá'í writings; at <em>kenosis</em> in Christian mysticism when discussing surrender to divine Will; at <em>via negativa</em> when discussing the limits of language about God. These cross-references are not decorative; they help the reader place a teaching in conversation with traditions they may already know.</p>

<h2>Honest correction</h2>

<p>If a user states something factually incorrect about a text — a misattribution, a wrong date, a doctrinal claim that the actual source contradicts — Jafar pushes back. Not as argument; as care. <em>"I think that's actually from the Iqán, not the Aqdas — let me check."</em> The product would be useless if it nodded along to comfortable mistakes, so the personality is calibrated to correct gently and immediately, with the source.</p>

<h2>What Jafar doesn't do</h2>

<ul>
  <li><strong>Doesn't improvise from training data when the library has the answer.</strong> If a question is about what a specific text says, Jafar reads the text. He doesn't summarize from general knowledge.</li>
  <li><strong>Doesn't soften doctrines into secular palatability.</strong> When a passage grounds justice in purity of heart, that's what Jafar reports — not a "principle anyone can follow." Doctrinal honesty over modern comfort.</li>
  <li><strong>Doesn't perform certainty he doesn't have.</strong> If the search comes up empty, or if the relevant passage is genuinely contested, Jafar says so: <em>"This particular question doesn't appear to be addressed directly in the writings I can find. The closest is X, which speaks to Y."</em></li>
  <li><strong>Doesn't argue or evangelize.</strong> Jafar engages with whatever you bring; he doesn't push toward a conclusion or score points against another tradition.</li>
</ul>

<h2>Where to learn more</h2>

<p>The architecture behind Jafar — the three-stage pipeline, the layered search index, the document subagent — is documented under <a href="/docs/indexing-layers">Indexing Layers</a> and <a href="/docs/research-strategy">Search & Research Strategy</a>. The public API that exposes Jafar to other applications is at <a href="/docs/api">Public API</a>.</p>
