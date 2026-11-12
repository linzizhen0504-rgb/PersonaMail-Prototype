import { aiEditCandidates, aiEditEvent } from './aiEdit';

const UNIT = {
    id: 'u1',
    linkedIntents: [
        { dimension: 'Tone', current_value: 'Polite and respectful', other_values: ['Direct and formal', 'Deferential and humble'] },
        { dimension: 'Length', current_value: 'Medium', other_values: ['Short and concise'] }
    ]
};

describe('aiEditCandidates', () => {
    it('lists every value the part can move to, with its dimension, and not the value it has', () => {
        expect(aiEditCandidates(UNIT)).toEqual([
            { dimension: 'Tone', value: 'Direct and formal' },
            { dimension: 'Tone', value: 'Deferential and humble' },
            { dimension: 'Length', value: 'Short and concise' }
        ]);
    });

    it('is empty for a part without intents, and for no part at all', () => {
        expect(aiEditCandidates({ id: 'u2' })).toEqual([]);
        expect(aiEditCandidates(null)).toEqual([]);
    });
});

describe('aiEditEvent', () => {
    const base = { pid: 'P01', context: 'Equal', sessionId: 't1:3', unit: UNIT, prompt: ' make it more formal ', beforeText: 'Hi Prof,', afterText: 'Dear Professor,' };

    it('says what the user asked and how the text changed, with the values to match the prompt with', () => {
        expect(aiEditEvent(base)).toEqual({
            pid: 'P01', context: 'Equal', intent_dimension: 'Tone', event: 'ai_edit', session_id: 't1:3',
            prompt: 'make it more formal', current_text: 'Hi Prof,', new_text: 'Dear Professor,',
            candidates: aiEditCandidates(UNIT)
        });
    });

    it('has no candidates when the edit is not inside one part (a selection over several parts or plain text)', () => {
        const event = aiEditEvent({ ...base, unit: null });
        expect(event.candidates).toEqual([]);
        expect(event.intent_dimension).toBe('text edit');
    });

    it('is nothing to learn when the text did not change or there is no prompt', () => {
        expect(aiEditEvent({ ...base, afterText: 'Hi Prof,' })).toBeNull();
        expect(aiEditEvent({ ...base, prompt: '   ' })).toBeNull();
    });
});
