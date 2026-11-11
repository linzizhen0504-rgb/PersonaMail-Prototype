import { findPlaceholderFields, fillPlaceholders, knownPlaceholderKeys, isNarrativePlaceholder } from './placeholders';

const labels = (text) => findPlaceholderFields(text).map(field => field.label);

describe('findPlaceholderFields', () => {
    it('lists each field once, in order of first appearance', () => {
        expect(labels('Dear [Name], I am [Your Name]. Regards, [Your Name]')).toEqual(['Name', 'Your Name']);
    });

    it('splits a bracket whose items are joined with " / "', () => {
        expect(labels('In [Course Code / Section].')).toEqual(['Course Code', 'Section']);
    });

    it('does not list a list of lower-case alternatives as a field', () => {
        expect(labels('It comes to [stealing my food / snuggling in bed / snacking]!')).toEqual([]);
    });

    it('lists "A & B" once more only when A is a field of its own', () => {
        expect(labels('Re: [Course Name]. In [Course Name & Section Number].')).toEqual(['Course Name', 'Section Number']);
    });

    it('keeps "A & B" as one field when A is not a field of its own', () => {
        expect(labels('See [Terms & Conditions].')).toEqual(['Terms & Conditions']);
    });
});

describe('fillPlaceholders', () => {
    it('fills every place of a field and leaves the other part of a bracket in brackets', () => {
        const text = 'Re: [Course Name]. In [Course Name & Section Number].';
        const filled = fillPlaceholders(text, new Map([['course name', 'Chemistry']]), knownPlaceholderKeys(text));
        expect(filled).toBe('Re: Chemistry. In Chemistry & [Section Number].');
    });
});

describe('isNarrativePlaceholder', () => {
    it('treats a bracket that asks for a reason as narrative', () => {
        expect(isNarrativePlaceholder('briefly state your reason, e.g., an illness')).toBe(true);
    });

    it('does not treat a plain name as narrative', () => {
        expect(isNarrativePlaceholder('Last Name')).toBe(false);
    });
});
