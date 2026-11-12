import { isIndependentUnit, propagationTargets, markUnit, highlightUnit, replaceUnit, unitText, shapeUnitText, keepSubjectPrefix } from './units';

const paragraph = (...leaves) => ({ type: 'paragraph', children: leaves.map(leaf => (typeof leaf === 'string' ? { text: leaf } : leaf)) });
const texts = (value) => value.map(node => node.children.map(child => child.text).join(''));
const leavesOf = (value, key) => value.flatMap((node, index) => node.children.filter(child => child[key]).map(child => ({ index, text: child.text, ...child })));

const SIGNATURE = 'Sincerely,\n\n[Your Name]  \n[Your Student ID]  \n[Course Name and Section Number]';
const draft = () => [
    paragraph('Dear Professor Lee,'),
    paragraph('Could we meet on Friday?'),
    paragraph('Sincerely,'),
    paragraph('[Your Name]  \n[Your Student ID]  \n[Course Name and Section Number]')
];

describe('isIndependentUnit', () => {
    it('is true for the opening salutation and the valediction, whatever the model called them', () => {
        for (const unit of [
            { id: 'opening_salutation', title: 'Opening Salutation' },
            { id: 'salutation', title: 'Salutation' },
            { id: 'valediction', title: 'Valediction' },
            { id: 'valediction_and_signature', title: 'Valediction and Sign-off' },
            { id: 'x', title: 'VALEDICTION' }
        ]) expect(isIndependentUnit(unit)).toBe(true);
    });

    it('is false for every other unit', () => {
        for (const unit of [
            { id: 'call_to_action', title: 'Call to Action' }, { id: 'closing_pleasantry', title: 'Closing Pleasantry' },
            { id: 'subject_line', title: 'Subject Line' }, { id: 'justification', title: 'Justification' }, {}, null
        ]) expect(isIndependentUnit(unit)).toBe(false);
    });
});

describe('propagationTargets', () => {
    const intent = (current) => ({ dimension: 'Tone', current_value: current });
    const unit = (id, title, current) => ({ id, title, content: id, linkedIntents: [intent(current)] });
    const units = [
        unit('subject_line', 'Subject Line', 'Warm'),
        unit('opening_salutation', 'Opening Salutation', 'Warm'),
        unit('background', 'Background', 'Warm'),
        unit('valediction', 'Valediction', 'Warm'),
        unit('evidence', 'Evidence', 'Cool'),
        { id: 'other', title: 'Other', content: 'o', linkedIntents: [{ dimension: 'Length', current_value: 'Short' }] }
    ];

    it('lists the other units that share the intent with another value, not the unit it came from', () => {
        expect(propagationTargets(units, 'subject_line', { dimension: 'Tone', current_value: 'Cool' }).map(u => u.id)).toEqual(['background']);
    });

    it('leaves out the opening salutation and the valediction: they are changed on their own', () => {
        const ids = propagationTargets(units, 'subject_line', { dimension: 'Tone', current_value: 'Brisk' }).map(u => u.id);
        expect(ids).toEqual(['background', 'evidence']);
    });

    it('gives nothing when the unit it came from is the opening salutation or the valediction', () => {
        expect(propagationTargets(units, 'opening_salutation', { dimension: 'Tone', current_value: 'Cool' })).toEqual([]);
        expect(propagationTargets(units, 'valediction', { dimension: 'Tone', current_value: 'Cool' })).toEqual([]);
    });

    it('does not list a unit that already has the value', () => {
        expect(propagationTargets(units, 'subject_line', { dimension: 'Tone', current_value: 'Warm' }).map(u => u.id)).toEqual(['evidence']);
    });
});

describe('markUnit', () => {
    it('marks the text of a unit that lies in one paragraph, and splits the leaf at its edges', () => {
        const marked = markUnit([paragraph('Hello. Could we meet on Friday? Thanks.')], 'Could we meet on Friday?', 'cta');
        expect(marked[0].children).toEqual([{ text: 'Hello. ' }, { text: 'Could we meet on Friday?', componentId: 'cta' }, { text: ' Thanks.' }]);
    });

    it('marks every paragraph of a unit that covers several, in full', () => {
        const marked = markUnit(draft(), SIGNATURE, 'valediction');
        expect(leavesOf(marked, 'componentId').map(leaf => [leaf.index, leaf.text])).toEqual([
            [2, 'Sincerely,'], [3, '[Your Name]  \n[Your Student ID]  \n[Course Name and Section Number]']
        ]);
    });

    it('marks a unit that starts and ends inside a paragraph', () => {
        const marked = markUnit([paragraph('Hello Mia. I'), paragraph('hope you are well. Bye.')], 'I\n\nhope you are well.', 'u');
        expect(texts(marked)).toEqual(['Hello Mia. I', 'hope you are well. Bye.']);
        expect(leavesOf(marked, 'componentId').map(leaf => [leaf.index, leaf.text])).toEqual([[0, 'I'], [1, 'hope you are well.']]);
    });

    it('keeps what a leaf already carries (a filled-in placeholder) and does not take over a leaf of another unit', () => {
        const value = [paragraph({ text: 'Dear ', componentId: 'opening' }, { text: 'Mia', placeholderKey: 'name' }), paragraph('Dear Mia')];
        const marked = markUnit(value, 'Dear Mia', 'second');
        expect(marked[0].children[0].componentId).toBe('opening');
        expect(marked[0].children[1].placeholderKey).toBe('name');
    });

    it('gives the editor back as it was when the text is not there', () => {
        const value = draft();
        expect(markUnit(value, 'Goodbye', 'x')).toBe(value);
    });
});

describe('highlightUnit', () => {
    it('highlights the paragraphs of a unit over several paragraphs and clears the highlight of any other', () => {
        const value = markUnit([paragraph({ text: 'Dear Professor Lee,', highlight: true, componentId: 'opening' }), ...draft().slice(1)], SIGNATURE, 'valediction');
        const result = highlightUnit(value, SIGNATURE, 'valediction');
        expect(leavesOf(result, 'highlight').map(leaf => [leaf.index, leaf.text])).toEqual([[2, 'Sincerely,'], [3, '[Your Name]  \n[Your Student ID]  \n[Course Name and Section Number]']]);
    });

    it('clears every highlight and changes nothing else when the text is not there', () => {
        const value = [paragraph({ text: 'Hello', highlight: true, componentId: 'a' })];
        const result = highlightUnit(value, 'Goodbye', 'b');
        expect(result[0].children).toEqual([{ text: 'Hello', componentId: 'a' }]);
    });
});

describe('replaceUnit', () => {
    it('replaces a unit that lies in one paragraph and keeps the rest of the paragraph', () => {
        const result = replaceUnit([paragraph('Hello. Could we meet on Friday? Thanks.')], 'Could we meet on Friday?', 'Would Friday suit you?', 'cta');
        expect(texts(result.value)).toEqual(['Hello. Would Friday suit you? Thanks.']);
        expect(result.value[0].children).toEqual([{ text: 'Hello. ' }, { text: 'Would Friday suit you?', componentId: 'cta' }, { text: ' Thanks.' }]);
    });

    it('replaces the paragraphs of a unit that covers several, with the paragraphs of the new text', () => {
        const result = replaceUnit(draft(), SIGNATURE, 'Warmly,\n\nMia', 'valediction');
        expect(texts(result.value)).toEqual(['Dear Professor Lee,', 'Could we meet on Friday?', 'Warmly,', 'Mia']);
        expect(leavesOf(result.value, 'componentId').map(leaf => [leaf.index, leaf.componentId])).toEqual([[2, 'valediction'], [3, 'valediction']]);
    });

    it('may give a unit of several paragraphs one paragraph, or more', () => {
        expect(texts(replaceUnit(draft(), SIGNATURE, 'Warmly, Mia', 'v').value)).toEqual(['Dear Professor Lee,', 'Could we meet on Friday?', 'Warmly, Mia']);
        expect(texts(replaceUnit(draft(), SIGNATURE, 'Warmly,\n\nMia\n\nCS702', 'v').value).slice(2)).toEqual(['Warmly,', 'Mia', 'CS702']);
    });

    it('keeps the text before and after the unit when it starts or ends inside a paragraph', () => {
        const result = replaceUnit([paragraph('Hello Mia. I'), paragraph('hope you are well. Bye.')], 'I\n\nhope you are well.', 'We hope\n\nall is well.', 'u');
        expect(texts(result.value)).toEqual(['Hello Mia. We hope', 'all is well. Bye.']);
    });

    it('keeps the highlight of a unit that was highlighted', () => {
        const value = highlightUnit(markUnit(draft(), SIGNATURE, 'v'), SIGNATURE, 'v');
        const result = replaceUnit(value, SIGNATURE, 'Warmly,\n\nMia', 'v');
        expect(leavesOf(result.value, 'highlight').map(leaf => leaf.index)).toEqual([2, 3]);
    });

    it('highlights the new text when it is asked to, also when the unit was not highlighted', () => {
        const result = replaceUnit(markUnit(draft(), SIGNATURE, 'v'), SIGNATURE, 'Warmly,\n\nMia', 'v', { highlight: true });
        expect(leavesOf(result.value, 'highlight').map(leaf => leaf.index)).toEqual([2, 3]);
    });

    it('does not highlight the new text when it is asked not to, also when the unit was highlighted', () => {
        const value = highlightUnit(markUnit(draft(), SIGNATURE, 'v'), SIGNATURE, 'v');
        expect(leavesOf(replaceUnit(value, SIGNATURE, 'Warmly,\n\nMia', 'v', { highlight: false }).value, 'highlight')).toEqual([]);
    });

    it('says where the unit was (the paragraphs it covered), and the paragraphs it covers now', () => {
        const result = replaceUnit(draft(), SIGNATURE, 'Warmly,\n\nMia\n\nCS702', 'v');
        expect(result.range).toEqual({ first: 2, last: 3, start: 0, end: draft()[3].children[0].text.length });
        expect(result.paragraphs).toEqual({ first: 2, last: 4 });
    });

    it('gives null, and changes nothing, when the old text is not there', () => {
        const value = draft();
        expect(replaceUnit(value, 'Goodbye', 'Hello', 'x')).toBeNull();
        expect(texts(value)[0]).toBe('Dear Professor Lee,');
    });
});

describe('unitText and shapeUnitText', () => {
    it('unitText joins the paragraphs of a unit with a blank line', () => {
        expect(unitText(markUnit(draft(), SIGNATURE, 'v'), 'v')).toBe('Sincerely,\n\n[Your Name]  \n[Your Student ID]  \n[Course Name and Section Number]');
        expect(unitText(draft(), 'missing')).toBe('');
    });

    it('shapeUnitText keeps the paragraph breaks of a unit that covers several paragraphs and flattens the text of one that does not', () => {
        expect(shapeUnitText('Warmly,\n\nMia', true)).toBe('Warmly,\n\nMia');
        expect(shapeUnitText('Warmly,\n  \nMia', true)).toBe('Warmly,\n\nMia');
        expect(shapeUnitText('Warmly,\n[Name]  \n[ID]', true)).toBe('Warmly,\n[Name]  \n[ID]');
        expect(shapeUnitText('Hello,\n\nthere  friend', false)).toBe('Hello, there  friend');
    });
});

describe('the subject line keeps its "Subject:" prefix (it is what tells the subject from the body)', () => {
    const withSubject = () => [paragraph('Subject: Quick heads-up / fridge leftovers'), paragraph('Hey Sam,'), paragraph('About the cake.')];

    it('REPRODUCTION: writing a version that left the prefix out into the editor must not turn the subject into the first line of the body', () => {
        const replaced = replaceUnit(withSubject(), 'Subject: Quick heads-up / fridge leftovers', 'Really upset about last night\'s missing cake', 'subject_line');
        expect(texts(replaced.value)[0]).toBe('Subject: Really upset about last night\'s missing cake');
    });

    it('keepSubjectPrefix puts the prefix of the old text in front of a version that left it out', () => {
        expect(keepSubjectPrefix('Subject: Quick heads-up', 'Really upset about the cake')).toBe('Subject: Really upset about the cake');
    });

    it('a version that has the prefix is written in as it is (the prefix is not doubled)', () => {
        const old = 'Subject: Quick heads-up / fridge leftovers';
        const replaced = replaceUnit(withSubject(), old, 'Subject: Really upset about the cake', 'subject_line');
        expect(texts(replaced.value)[0]).toBe('Subject: Really upset about the cake');
    });

    it('leaves a version that has the prefix alone, whatever its case and spacing', () => {
        expect(keepSubjectPrefix('Subject: A', 'Subject: B')).toBe('Subject: B');
        expect(keepSubjectPrefix('Subject: A', 'subject:B')).toBe('subject:B');
        expect(keepSubjectPrefix('Subject: A', '  SUBJECT : B')).toBe('  SUBJECT : B');
    });

    it('copies the prefix as the old text wrote it', () => {
        expect(keepSubjectPrefix('SUBJECT:  A', 'B')).toBe('SUBJECT:  B');
    });

    it('does nothing for a text that is not a subject line', () => {
        expect(keepSubjectPrefix('Dear Professor Lee,', 'Hello Professor Lee,')).toBe('Hello Professor Lee,');
        expect(keepSubjectPrefix('', 'x')).toBe('x');
        expect(keepSubjectPrefix(null, 'x')).toBe('x');
    });
});
