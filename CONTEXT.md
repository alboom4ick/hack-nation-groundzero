# GroundZero: The AI Apprentice

An apprentice that watches an expert work on a screen, asks why, maps the workflow with its guardrails and teaches it to a new hire. Terms follow the challenge brief (see README.md).

## Language

### People and roles

**Expert**:
The person whose knowledge is captured while they do a real task on their own screen.
_Avoid_: user, SME, Sabine (she is the example)

**New hire**:
The person the tutor coaches through a case on their own screen.
_Avoid_: learner, trainee, student

**Apprentice**:
The product as a whole: the one that watches, asks, maps and teaches.
_Avoid_: recorder, bot, assistant

**Interviewer**:
The voice role that asks the expert questions during Capture and the debrief.

**Tutor**:
The voice role that coaches the new hire during Teach.

### The three modules

**Capture**:
The session in which the expert shares their screen and the interviewer asks why at natural pauses.

**Map**:
The debrief after Capture that turns the session into a Work Map.

**Teach**:
The lesson in which the tutor coaches a new hire with a Work Map.

### Watching and asking

**Screen watch**:
The watching of a shared screen and microphone that says when the person is busy or has paused and takes the masked frames; Capture and Teach both use it.
_Avoid_: recorder, capture loop, probe

**Pause**:
A moment when the screen has been still and the person is not talking, the only time the apprentice may speak.
_Avoid_: silence, idle

**Frame**:
One image of the shared screen, masked for personal data before it leaves the browser.
_Avoid_: screenshot

**Segment**:
A short run of frames in which the screen changed, described by the vision model as one screen event.
_Avoid_: node, clip

**Voice turn**:
One thing asked aloud and what the person said back, already redacted.
_Avoid_: question round, Q&A, prompt

**Off the record**:
A stretch the expert has excluded: nothing is probed, transcribed, framed or asked until they come back on the record.
_Avoid_: paused, muted, private mode

### The Work Map

**Work Map**:
The clickable timeline of steps that Map produces and Teach consumes.
_Avoid_: workflow, process doc, BPMN

**Step**:
One business action in a Work Map, with its screen moment, decision, reason and guardrails.
_Avoid_: segment, node, task

**Decision**:
The judgment call made in a step.

**Reason**:
Why the decision was made, in the expert's own words.
_Avoid_: explanation, rationale

**Guardrail**:
A limit, an exception or a moment to stop and ask someone, stated by the expert.
_Avoid_: rule, constraint, policy

**Screen moment**:
The time in the recording that a step, reason or guardrail links to.
_Avoid_: timestamp, keyframe

**Follow-up**:
A debrief question about something the expert did not explain during the task.

**Teach-back**:
The apprentice explaining the whole process back so the expert can confirm or correct it.
_Avoid_: summary, recap

**Lesson**:
One run of Teach on one Work Map: where the tutor is and what the new hire has proven so far.
_Avoid_: session, course

**Save hold**:
The ERP asking the open tutor before it saves, so a wrong decision is caught before it is saved.
_Avoid_: save interception, guard

**Mastery**:
What the new hire has proven per step, by a right prediction or a clean pass, and what they still need to practice.

## Relationships

- A **Capture** produces **Segments**; **Map** merges them into the **Steps** of one **Work Map**
- A **Step** has one **Screen moment**, at most one **Decision** with its **Reason**, and zero or more **Guardrails**
- Every **Reason** and **Guardrail** carries the **Expert**'s own words and the **Screen moment** they were said at
- A **Screen watch** yields **Pauses** and **Frames**; a **Voice turn** happens only at a **Pause**
- The debrief is complete after at least three answered **Follow-ups** and a **Teach-back** the **Expert** confirms
- A **Step** with no **Reason** and no **Guardrail** carries what the **Expert** said while doing it, when they said anything
- A **Save hold** releases the save only on a clean screen check; a violation moves the **Lesson** to that **Step**
- **Off the record** suspends the **Screen watch** and cancels the **Voice turn** in flight

## Example dialogue

> **Dev:** "The **Expert** stopped typing for three seconds. Can the **Interviewer** ask now?"
> **Domain expert:** "Only if it is a **Pause**: still screen and not talking. Reading aloud is not a **Pause**."
> **Dev:** "And if they go **Off the record** halfway through the answer?"
> **Domain expert:** "Then that **Voice turn** yields nothing, and no **Frame** leaves the browser until they are back."
> **Dev:** "Does every **Segment** become a **Step**?"
> **Domain expert:** "No. Several **Segments** that are one business action merge into one **Step**, and a **Guardrail** only exists if the **Expert** said it."

## Flagged ambiguities

- "segment" and "step" were used interchangeably in the UI ("Captured N steps"): resolved: a **Segment** is what the vision model describes, a **Step** exists only in a **Work Map**.
- "node" (`nodes`, `n1`) in the Work Map builder's input means a described **Segment**; it is a legacy name, not a separate concept.
- "agent" means two things: an ElevenAgents voice role (**Interviewer**, **Tutor**) and the software agent that loads the agent-ready export. Say which.
