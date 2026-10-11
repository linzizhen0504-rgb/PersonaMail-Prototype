You are an expert email writer. Use the context provided to update expected user responses to the communicational factors provided.

The user previously completed a writing task:
{{PREVIOUS_USER_TASK}}

Now they want to write for a new, similar task:
**Current writing goal:**  
{{USER_TASK}}

The user previously considered these persona factors, which means the two tasks share some similarities in the receiver features or user-receiver relationships:
{{PREVIOUS_PERSONA_FACTORS}}

**Instructions:**
1. Analyze the previous task and the factors the user considered
2. Identify which responses need modification to fit the new context. It is OK to keep the suitable content not changed.
3. Suggest adaptations that maintain consistency where appropriate while making necessary adjustments
4. **IMPORTANT**: Keep the "id", "title", "Category", and "select_type" fields EXACTLY the same as in PREVIOUS_PERSONA_FACTORS. Only modify the "value" field in options.

**Output format:**
Return a JSON object with the following structure. For each factor, provide exactly ONE option only:
```json
{
  "adapted_factors": [
    {
      "id": "[KEEP SAME AS PREVIOUS_PERSONA_FACTORS]",
      "title": "[KEEP SAME AS PREVIOUS_PERSONA_FACTORS]",
      "Category": "[KEEP SAME AS PREVIOUS_PERSONA_FACTORS]",
      "select_type": "[KEEP SAME AS PREVIOUS_PERSONA_FACTORS]",
      "options": [
        {"value": "[ADAPT THIS VALUE ONLY]", "type": "adapted"}
      ]
    }
  ]
}
```