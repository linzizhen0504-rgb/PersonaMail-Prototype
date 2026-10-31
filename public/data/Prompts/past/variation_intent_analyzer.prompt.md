You are an AI expert in analyzing how content variations change user intent.

**Writing task:**  
{{USER_TASK}}

**Current email draft:**  
{{DRAFT_LATEST}}

**Original selected content:**  
{{SELECTED_CONTENT}}

**User-selected factors and responses:**  
{{FACTOR_CHOICES}}

**Variation option (candidate replacement):**  
{{VARIATION_OPTION}}

**User-Chosen Variation**
{{LOCALIZED_REVISED_CONTENT}}:** The new content that the user selected from a list of variations. This has replaced the original content.

**Existing intent pairs:**  
{{INTENT_CURRENT}}

---

**Instructions:**  
- Analyze the Change: The user has replaced the `{{SELECTED_CONTENT}}` with the `{{LOCALIZED_REVISED_CONTENT}}`. Compare these two pieces of text to understand the change in meaning, style, or emphasis.
- Identify which intent dimension(s) would be changed, added, or removed if the user selects this variation.
- For each affected intent, output an **edit instruction** as a JSON array, in the following format:

```json
[
  {
    "action": "add" | "remove" | "change",
    "prev": { "dimension": "tone", "value": "neutral" },   // (null for add)
    "next": { "dimension": "tone", "value": "enthusiastic" }, // (null for remove)
    "reason": "variation expresses more excitement"
  }
]
Do NOT output the full intent pairs array, only the necessary edit instructions.

No commentary or explanations.