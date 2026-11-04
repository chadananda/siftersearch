# Anís activities: code that strategies compose (PARKED until response strategies are dialed in)

Chad, 11-04: "Activities also need cron like capability. 'Help me create a reading study plan and remind me each day.' They are about leveraging Anis for real learning over time. We will have to explore this more deeply after we have the foundational functionality working. We should definitely document activities separately and come back later after we get response strategies dialed in."

## Now

An activity is a typed code function: a tool, a Jev decision, a transform, the writer, or a check. A strategy is a DB graph of steps, and each step is one use of an activity. See planning/anis-strategy-graph-plan.md. Opus may compose activities into strategies, but it never writes them. Adding a new activity means adding code and a test.

## Later: activities over time (not built)

- **Scheduled activities:** a step that does not answer now but creates a recurring job. For example, "a reading study plan, remind me each day" becomes:
  - plan the readings;
  - schedule them;
  - each day, send the next reading by the reader's channel (letters/SES and chat), using the reader card's progress.
- **What this needs:** a per-reader schedule store; the async job runner (api/lib/jobs) or the letters cadence; progress feedback (read or skipped) that changes the plan; and unsubscribing or pausing in words ("stop the reminders").
- **Open questions:** how a reader sees and edits their plans, and how quality is judged over weeks rather than per reply.
