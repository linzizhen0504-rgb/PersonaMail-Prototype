You are checking an email for consistency after the sender changed one decision in it.

**The sender's request**
{{USER_TASK}}

**The email as it is now** (the change is already in it)
{{DRAFT_LATEST}}

**The decision that was changed**
{{INTENT}}

**The part of the email that was changed**
{{SOURCE}}

**Other parts of the email that are linked to the same decision** (JSON; each has an id, a title and its current text)
{{TARGETS}}

---

### Instructions
1. For each other part, decide whether its current text still agrees with the decision's **new value**. A part needs a change when it contradicts the new value, expresses the old value, takes a different stance on the same question, or would read as inconsistent next to the part that was changed.
2. A part does **not** need a change when it is silent on the question, only mentions a related detail, or already fits the new value. Do not ask for a change just because it could be worded differently.
3. For every part, give a one-sentence reason that names what in its text agrees or conflicts. Keep it under 25 words.
4. Return ONLY a JSON array with one object per part, in the same order, using the given ids. No commentary, no code fences.

[
  {"id": "<part id>", "needs_change": true, "reason": "…"},
  {"id": "<part id>", "needs_change": false, "reason": "…"}
]
