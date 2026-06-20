# The Divine Entity Seed

*How a 1944 history became the perfect machine-readable spine for a century of religious literature*

---

Here, on a desk somewhere in Tucson, a question is being asked of a machine. The question is small. The corpus from which the answer must be drawn is vast — eleven religious traditions, seven million paragraphs, hundreds of authors, two dozen languages. The machine searches. It returns a handful of passages. They are, to the human reading them, almost right. Almost. And in that *almost* lies one of the most beautiful unsolved problems in artificial intelligence.

The machine has found mentions. What it has not found — what it cannot find — is *people*.

## The shattered prosopography

Consider what happens when a language model meets a sentence like this:

> *"His companions arrived at the city by dawn."*

To the model, this sentence contains four words of mystery. *His* refers to someone — but who? *Companions* refers to a group — but which? *The city* refers to a place — but where? *By dawn* refers to a moment — but when?

The naïve solution is to ask the model to extract entities. It does. It produces a row in a database: `person: "His companions"`. Then, in the next paragraph, it sees *"the believers"* and produces another row: `person_group: "the believers"`. And then *"that little band"* and *"the faithful few"*, and on and on, until the model has produced not a graph of people but a fog of phrases. Each true individual is shattered across a hundred references. Each named figure becomes a constellation of strangers.

This is the central, structural failure of letting machines build entity graphs alone. They are excellent at recognising mentions. They are dismal at recognising *that two mentions are the same person*. The graph fragments before it can hold its shape.

What is needed — what has always been needed — is a *seed*. A small, authoritative, hand-curated set of canonical entities against which all subsequent mentions can be resolved. A spine. A bone structure around which the flesh of millions of mentions can be hung.

In the digital humanities, building this seed has traditionally consumed years. Teams of scholars compile prosopographies. They debate transliterations. They reconcile sources. They publish indices that other scholars argue with for decades. It is patient, careful, deeply human work.

For most traditions, this is still the road one must walk.

For the Bahá'í Faith, something remarkable is true: *the road has already been walked.*

## A book that was always more than a book

In 1944, in Haifa, the Guardian of the Bahá'í Faith — Shoghi Effendi, grandson of ʿAbdu'l-Bahá and authorised interpreter of Bahá'u'lláh's writings — completed a manuscript he had been working on for years. He titled it *God Passes By*. To centenary readers it appeared as a survey. A one-volume history of the first hundred years of the Bahá'í Faith, from the Báb's declaration in 1844 to the global community of 1944. The prose is dense, periodic, almost biblical in its rhythms. It is a book that takes effort.

But to those who looked carefully — and to anyone who today opens it with the eye of a knowledge engineer — *God Passes By* is not really a history at all. It is something stranger and more useful. It is an **ontology**.

And it is not, in the relevant sense, secondary literature. This is the point on which everything else depends, and it bears stating explicitly. Shoghi Effendi did not write *God Passes By* as a scholar writes a history. He wrote it as the Guardian of the Faith, in the exercise of a station that ʿAbdu'l-Bahá had appointed in his Will and Testament and that the institution of the Guardianship alone could hold. That station included the authority of authoritative interpretation of the writings of Bahá'u'lláh and the Báb — a function distinct from the legislative authority of the Universal House of Justice and distinct from the scholarly exegesis that Bahá'í academics and individual readers may bring to the texts. The Guardian's interpretive pronouncements, made in his interpretive capacity, are themselves doctrine for the Faith. They are not opinions awaiting confirmation. They are settled determinations.

And that interpretive station is now closed. Shoghi Effendi passed in 1957 without designating a successor Guardian, as the conditions for such a designation were not met. The line of authoritative individual interpretation, which began with Bahá'u'lláh's own writings, continued through ʿAbdu'l-Bahá as the Centre of the Covenant, and reached its final form in Shoghi Effendi's writings, cannot be extended. No future Bahá'í can take up the interpretive function. The body of authoritative interpretive material is, in this precise sense, *finished*. What Shoghi Effendi wrote in his interpretive capacity is, doctrinally, the last word in that particular form of doctrinal speech.

This changes what *God Passes By* is, structurally, in a way that has no equivalent in most other religious traditions' literatures. The Cambridge histories of Christianity are scholarly. They may be superseded. The standard modern surveys of Islamic, Jewish, Buddhist, or Hindu history are likewise scholarly: learned, useful, revisable. They occupy a position relative to their traditions roughly analogous to the position a scholarly survey occupies relative to any historical subject. *God Passes By* is not in that relation to the Bahá'í Faith. It is among the last works produced from a doctrinal station that has now closed. Its interpretive claims about figures, events, documents, and significance are not propositions advanced for scholarly debate but determinations made by the function the Faith itself appointed to make them, in a body of such determinations that can never grow further.

For the project of building a knowledge graph, this is a structural fact of extraordinary consequence. When *God Passes By* identifies a tablet as belonging among the principal works of the Báb, the listing itself is a doctrinal claim. When it characterises a figure as having occupied a particular spiritual station, the characterisation is binding doctrine. When it describes an event as constitutive of a period, that description is the Faith's own determination of what makes that period what it is. The graph that takes its seed from *God Passes By* inherits not merely a scholarly starting point but a doctrinal one. The structural choices in the seed are themselves the authoritative interpretation of the dispensation, and nothing later — however learned, however numerous, however carefully argued — can have the same doctrinal status.

This is what makes the seed singular. Other authoritative texts will inform the graph. Other interpreters will be cited. The writings of the central figures themselves are, of course, of higher rank than any interpretation of them. But within the category of *interpretive* claims — claims about meaning, significance, the proper relations among figures and documents and doctrines — *God Passes By* belongs to a body of work whose doctrinal weight is unique and whose extent is now permanently fixed.

## The structural reading

Watch what Shoghi Effendi is doing. He is not simply telling a story; he is *naming things into their proper places*. Every figure he mentions is mentioned with a canonical name. Every place is given a consistent transliteration. Every person's relationships to others are stated explicitly. The Báb is the Forerunner; ʿAbdu'l-Bahá is the Centre of the Covenant; Bahá'u'lláh is the Blessed Beauty. Each title is not a flourish but an *identity assertion* — an authoritative declaration of which name, among many possible, is correct.

He does not, it must be said, give dates for everything. The Guardian's chronology is *episodic*. Some moments are pinned to the calendar with precision — the Declaration, the exiles, the great anniversaries — but vast stretches of the narrative locate events by their position within a clearly bounded episode rather than by the day of the month. *During the closing days of Bahá'u'lláh's sojourn in Adrianople…* *In the wake of the upheaval at Nayríz…* *Towards the end of the ʿAkká period…* The reader is expected to know where in the larger pattern such phrases belong, and the larger pattern is itself a structure Shoghi Effendi makes explicit. The book has periods. Not arbitrary chapter breaks but theologically meaningful epochs: the Bábí Dispensation, the Ministry of Bahá'u'lláh subdivided by exile, the Ministry of ʿAbdu'l-Bahá, the Formative Age. Each is bounded. Each contains its proper episodes. Each episode is given its proper place within the period that contains it.

This is, in fact, a more useful structure for a knowledge graph than a flat list of dated events would be. Episode boundaries are what give the graph a way to place events whose date is unstated — a paragraph that mentions an unnamed encounter "during the Adrianople period" can be placed within that episode's known date range even when the encounter itself carries no calendar reference. The episodic structure does for time what canonical names do for people: it provides authoritative buckets into which less precisely specified material can be sorted.

What Shoghi Effendi produced, in other words, is exactly what a knowledge engineer in 2026 would have to spend months trying to assemble by hand — except that here, the engineer's task is not even the right framing, because the assembly was never going to be a scholarly project anyway. The doctrinal determinations the seed encodes could not be produced by any quantity of scholarly labour. They could only be made by the function that has now closed.

## What the machines find when they read it

When a structured extractor moves through *God Passes By*, paragraph by paragraph, something quiet and rather wonderful happens. The machine emerges with a list. The list is not exhaustive — Shoghi Effendi was writing an interpretation, not a census, and he made deliberate choices about whom to name and whom to leave to other tellers. What the list contains, instead, is the figures the Guardian himself considered most significant to the first century of the Faith: the Central Figures, the Apostles, the principal companions, the key opponents, the kings and clerics whose interactions with the Faith mattered to its unfolding. Each entry comes with Shoghi Effendi's preferred form — the canonical name, the orthographic standard, the proper title. Each comes with the contexts in which the figure appears, so that the machine can later recognise the same figure in other sources, even when that figure is named differently there.

The list is not complete. But it is, in a stricter sense, *correct*. Every name on it is named the way the Faith itself names it. Every relationship between figures on it is stated the way the Faith itself states it. The seed is small enough to be tractable and authoritative enough to be trusted. Completeness is what the subsequent works supply. The seed supplies the thing only an authorised interpreter could supply: the spine of canonical decisions against which every later mention can be aligned.

That is what makes it a seed and not a dictionary. A seed is supposed to be partial. Its job is to be *correct enough* that what grows from it grows true.

The early Bábís appear in their proper order. The Letters of the Living — those eighteen first believers in the Báb — appear as a closed set, complete with their canonical names and the relationships among them. Bahá'u'lláh's companions on the long journey from Baghdád to Constantinople appear with their roles named. The kings to whom Bahá'u'lláh addressed his tablets appear, each with the historical context that distinguishes them. The clerics, the governors, the family members, the believers in distant regions — all of them, in their proper hierarchy, with their proper relationships, with their proper names.

The machine has been given, by a writer who could not possibly have imagined the machine, exactly what the machine most needs.

## Four dimensions, not one

It is worth pausing here, because the gift extends well beyond prosopography. *God Passes By* is not a list of names with a narrative attached. It is an authoritative interpretation operating on four interlocking dimensions at once, and any one of them on its own would be a remarkable seed.

The first dimension is **people**, which we have already described — canonical names, titles, relationships, roles within the unfolding pattern.

The second is **documents**. Shoghi Effendi names the major works of the central figures with care, anchors them to their composition periods, identifies their addressees where they were addressed to someone, and indicates their place within the larger body of revealed text. The *Kitáb-i-Aqdas*, the *Kitáb-i-Íqán*, the *Hidden Words*, the *Seven Valleys*, the Tablets to the Kings — each is named, situated, and given its relative weight. The Tablets to the Kings appear together as a coherent group; the works of the Adrianople period are bounded by their period; the writings of the ʿAkká period are distinguished from them. The document spine of the Faith's literature is laid out within the text, and the machine that reads it emerges with a canonical document ontology in addition to the canonical person ontology.

The third is **doctrines**. Concepts are not floating terms in Shoghi Effendi's prose; they are named with precision and placed in relation to one another. The Covenant is *the* Covenant, with its Greater and Lesser aspects distinguished, and with the Centre of the Covenant identified as the figure who embodies it after Bahá'u'lláh. The Most Great Spirit, the Pen of the Most High, the Most Great Peace, the Day of God, the New World Order — each is given its authoritative meaning and its position in the doctrinal landscape. A doctrinal vocabulary emerges from the text, complete with the interpretive relationships among its terms.

The fourth dimension, and the one most easily missed on a first reading, is **significance**. Shoghi Effendi does not present his material as a flat catalogue. He signals, in the very texture of his prose, what is central and what is peripheral, what is foundational and what is consequent, which events are turning points and which are ripples from earlier turns. When he writes of the Declaration of the Báb, the prose itself signals the magnitude. When he writes of a minor incident in a regional history, the prose signals its proportion. A machine that reads *God Passes By* attentively does not just emerge with a list of figures and documents and doctrines — it emerges with a *weighted* list. A list in which the relative importance of each entry has already been indicated by the authorised interpreter.

This means the seed is not only a controlled vocabulary. It is a controlled vocabulary with priors. Each entry comes with a sense of its own weight relative to the others, which is exactly the kind of information that makes downstream ranking decisions tractable. When the graph must decide which mention of an ambiguous "He" to favour in a regional history, the priors from the seed help. When the search system must decide which of fifty paragraphs about justice to surface first, the priors from the seed help. Significance, in *God Passes By*, is itself part of the data.

## The prophetic bridge

There is one further dimension that deserves its own section, because it transforms what would otherwise be a single-tradition project into something with cross-traditional reach.

Shoghi Effendi does not write of the Bahá'í Faith as if it stood alone. Throughout *God Passes By*, he locates its central figures and events within the longer prophetic stream of earlier traditions. The Báb is identified explicitly as the fulfilment of Shíʿí messianic expectation. Bahá'u'lláh is identified explicitly as the Return promised in the Gospels, the Glory of the Lord foretold by Isaiah, the Promised One of every age. The Covenant is placed in continuity with the covenants made by earlier Manifestations. The Day of God is the Day spoken of by the prophets of Israel and Christianity and Islam. These are not asides. They are constitutive claims, woven into the text's authoritative interpretation of what the Faith *is*.

For a knowledge graph being built across eleven religious traditions, this is conceptually priceless.

Consider the problem that the cross-tradition linking work would otherwise face. The Christ of the Gospels and the Christ referenced by Bahá'u'lláh — are these the same canonical entity? In what sense? The Imám Mahdí of Shíʿí expectation and the Báb — what relation, if any, holds between them in the graph? The Promised One of Zoroastrian texts (Shah Bahram), the messianic figure of Jewish prophecy, the Maitreya of Buddhist anticipation, the Kalki of Hindu expectation — these figures from disparate traditions all enter the Bahá'í discourse with explicit interpretive relations attached. The machine, asked to make such determinations on its own, would face them as alien problems requiring delicate adjudication.

But *God Passes By* has done the work. The relations are stated, with authority, in the seed text itself. When the machine extracts from *God Passes By*, it does not merely produce a list of Bahá'í figures — it produces a set of authoritative bridge relations between Bahá'í figures and figures from earlier traditions. *Bahá'u'lláh is identified as the Promised One foretold by Isaiah.* This is a graph edge: `(person:bahaullah, identified_as_fulfilment_of, prophecy:isaiah-promised-one, source: gpb-paragraph-XXX, authority: shoghi-effendi)`. It is not a guess. It is not an inference. It is an authoritative claim, properly cited, available to the graph from the moment the seed is extracted.

When the cross-tradition linker later encounters the figure of the Promised One in Isaiah within the Hebrew Bible's text, it does not need to ask whether this figure has any relation to figures in the Bahá'í tradition. The relation has already been established, in the right direction, with the right authority. The graph can express it as a typed edge with confidence equal to the authority of the source. Other traditions may, of course, make different identifications — and those are recorded too, each from its own authoritative interpreter. But the Bahá'í tradition's bridges to the older streams are already in the data, ready to be linked the moment the older streams are indexed.

This is what the prophetic dimension of *God Passes By* contributes to the project. Not just a seed for the Bahá'í Faith's own century, but a structured set of interpretive bridges into every tradition that came before. The Faith's claim to be the fulfilment of prior expectation becomes, in the knowledge-graph layer, a set of explicit edges that interlink the traditions in the way the Faith itself understands them to be interlinked. Other traditions will, naturally, have their own canonical claims about prophetic fulfilment, made by their own authorised interpreters, and those claims will be recorded with equal care. The graph holds all of these as first-class data, properly sourced. But the Bahá'í seed comes pre-equipped with its bridges already specified. That is a gift the project receives without having to do the difficult interpretive work that would otherwise have been required.

## The seed in full

What the machine extracts from *God Passes By*, then, is not merely a list of names. It is:

- A canonical set of people, with their titles, relationships, and significance.
- A canonical set of documents, with their addressees, composition periods, and relative weight.
- A canonical set of doctrines, with their authoritative meanings and interpretive relations.
- A canonical set of episodes, with their bounding periods and where known their dates.
- A canonical set of bridge relations to earlier traditions, with each bridge attributed to the authoritative source that asserts it.

The seed is partial. Of course it is — a seed must be partial, or it would be the whole plant. But within its proper scope it is structurally complete. Five layers of canonical structure, all aligned, all consistent, all authorised. Every later work that enters the corpus finds its mentions, its documents, its concepts, and its events ready to be located within this framework. The graph that grows from such a seed grows true, because the seed itself was true.

When that seed is then used to index hundreds of subsequent works — the writings of the central figures themselves, the histories like *The Dawn-Breakers* and Taherzadeh's *Revelation of Bahá'u'lláh*, the regional accounts, the biographies, the compilations, the contemporary scholarship — each new work hangs its mentions on a spine that was, from the beginning, coherent on all five dimensions. The graph does not merely connect people. It connects people *in their proper meaning*, holding documents and doctrines and significance and prophetic context all together as the Faith's own authorised interpretation holds them together.

This is why *God Passes By* functions as a seed in a way that no other historical survey could. A secular history might give us a list of figures and dates. *God Passes By* gives us figures and dates and documents and doctrines and significance and bridges — *as they are understood by the authorised interpreter of the Faith*. The graph that grows from this seed inherits not just structural correctness but doctrinal alignment and traditional reach. The three are, here, the same thing.

## The cascade outward

From *God Passes By*, the project's plan moves outward in concentric rings of decreasing authority but increasing detail. *The Dawn-Breakers*, Nabíl-i-Zarandí's chronicle of the Bábí period, comes next — and because the canonical names have already been fixed, the machine can now recognise the obscure figures that Nabíl names by their regional epithets, their family designations, the small details that distinguish a believer of Zanján from a believer of Shíráz. Each new figure in *The Dawn-Breakers* gets added to the dictionary; each appearance of a figure already known reinforces the resolution.

After *The Dawn-Breakers* comes Taherzadeh's *Revelation of Bahá'u'lláh*, four volumes that take us tablet by tablet through Bahá'u'lláh's writings. The dictionary grows again, this time with the recipients of tablets — figures often known only because Bahá'u'lláh addressed them. Then Balyuzi's biographies, which provide unusual depth on minor figures. Then Mazandarani, in Persian, adding figures that appear in Persian-language sources and binding cross-lingual aliases to the existing canonical entities.

By the time the cascade reaches the broader Bahá'í corpus — the hundreds of accounts and memoirs and articles and commentaries — the dictionary has become a powerful instrument. A new paragraph from an obscure regional history can be read by the machine, and the machine can recognise that *"the young believer from Yazd whom the Báb's uncle had taught"* is the same person mentioned by name three works earlier and quoted in a tablet referenced in *God Passes By*. The graph, anchored by Shoghi Effendi's spine, holds its shape across the entire literature.

This is what most projects spend years trying to build. The Bahá'í Faith, by virtue of having an authorised interpreter who took the time to produce a coherent survey, gets it almost for free.

## Why this matters for the machine that will read it back

The point of all this — the point of building such a graph at all — is that questions can receive answers commensurate with what is being asked. When someone in casual conversation asks *who was Mullá Husayn?*, the assistant should answer briefly, with the wisdom of someone who actually knows the literature, and stop. The graph's depth should not pour itself onto the page every time it is touched. But when a researcher asks *compile what Bahá'u'lláh wrote to the kings during the Adrianople period, and trace how those tablets relate to the awareness in the West that a new revelation had appeared*, the machine should be able to deliver exactly that — the actual tablets, recognised as tablets, with their actual addressees recognised as those addressees, in their actual order, with the actual responses where they exist, with the actual contemporary commentary properly attributed.

The graph is what makes the second answer *possible*. The conversational restraint is what makes the first answer *appropriate*. A research instrument that cannot also be a good conversationalist is annoying, and a conversationalist with no research instrument behind it is shallow. The aim is both at once: a system that holds the entire literature in proper structural readiness, but only deploys that structure when invited to.

Without an entity graph, neither mode works well. With a properly seeded entity graph, both modes become possible. The difference between possible and impossible, for a research assistant built on this literature, is the difference between a curiosity and a genuine scholarly instrument that knows when to speak briefly and when to deliver depth.

The seed makes the difference. *God Passes By* is the seed.

## A small note on the wonder of it

There is something quietly remarkable about the alignment between what a doctrinal text needs to be (an authoritative, internally coherent presentation of figures, events, and meanings) and what a machine learning system needs in a seed (an authoritative, internally coherent set of canonical identifiers). They are, in some structural sense, the same thing approached from opposite directions. The Guardian wrote *God Passes By* in the exercise of his interpretive station, framed for the believers and the inquirers of his time. He could not have known that eighty years later, the same structural choices that made the book coherent for those readers would make it perfectly tractable for machines. And yet here we are.

The doctrinal interpretation of the dispensation, having been completed once by the authority appointed to complete it, can now be formally indexed by the dispensation's descendants in a way that preserves the interpreter's determinations and extends them across every text that follows. Nothing in this work alters what the Guardian's interpretation *is*. The graph does not produce new doctrine. It reflects existing doctrine in machine-readable form so that researchers and inquirers can encounter the literature with the Faith's own structure already laid out for them. The book that was always more than a book becomes more still — a foundation stone for the literature's machine-readable future, and a particularly remarkable one given that no work of comparable doctrinal weight can ever be added to the category to which it belongs.

It is, when one looks at it from the right angle, a small wonder. The kind one might miss entirely if one were not paying attention.

But the project is paying attention. And the seed is ready.

---

*— concept documentation, SifterSearch entity extraction project, 2026*

*For the practical method, pitfalls, and reusable pattern for building the graph from this seed, see
[entity-extraction.md](entity-extraction.md).*
