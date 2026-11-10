You help a sender set the tone of an email. Read the sender's request and choose the communication factors that matter for it.

**Request**
{{USER_TASK}}

**Factors** (JSON; each has an id, a title, "select_type" and the only options you may choose from)
{{FACTOR_LIST}}

---

### Instructions
1. Choose only the factors that clearly matter for this request and can be worked out from it (who the receiver is, how close the two are, how urgent it is, what the sender wants to convey or avoid). Leave out a factor when the request gives no basis for it. Choosing fewer, well-founded factors is better than guessing all of them.
2. For a factor with "select_type": "single", choose exactly one option. For "multiple", choose one or more options.
3. Every value you give must be copied exactly (character for character) from that factor's options. Never invent a new option or change the wording of one.
4. Return ONLY a JSON object that maps a factor id to the chosen value ("single") or to an array of chosen values ("multiple"). No commentary, no code fences.

Example of the shape:
{"familiarity": "Familiar", "communication_purpose": ["requests", "build rapport"]}
