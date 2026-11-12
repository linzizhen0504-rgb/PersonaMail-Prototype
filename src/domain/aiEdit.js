// What the preference model is told when the user changes a text with the AI and uses the result instead of taking a version card.
import { plainText } from './text';

// The values a part can move to, with their dimensions: the prompt of the user is matched with them
export const aiEditCandidates = (unit) => ((unit && unit.linkedIntents) || []).flatMap(intent =>
    (intent.other_values || []).map(value => ({ dimension: intent.dimension, value })));

// The /preference/update event for a used AI text, or null when there is nothing to learn (no prompt, or nothing changed)
export const aiEditEvent = ({ pid, context, sessionId, unit, prompt, beforeText, afterText }) => {
    const asked = String(prompt || '').trim();
    if (!asked || plainText(beforeText) === plainText(afterText)) return null;
    const first = unit && unit.linkedIntents && unit.linkedIntents[0];
    return {
        pid,
        context,
        intent_dimension: (first && first.dimension) || 'text edit',
        event: 'ai_edit',
        session_id: sessionId,
        prompt: asked,
        current_text: beforeText,
        new_text: afterText,
        candidates: aiEditCandidates(unit)
    };
};
