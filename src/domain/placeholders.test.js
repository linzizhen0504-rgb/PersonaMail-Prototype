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

describe('hasNarrativePlaceholder (a version card must not carry an instruction for the writer)', () => {
    const { hasNarrativePlaceholder } = require('./placeholders');

    it('finds the long instruction brackets of the cards in question (more than 60 characters, so they are not fields)', () => {
        expect(hasNarrativePlaceholder('I still need to [mention remaining work, e.g., conduct the final analysis and draft the conclusion], which requires more time.')).toBe(true);
        expect(hasNarrativePlaceholder('I am currently [mention current stage, e.g., midway through the data analysis phase], and I need a few days.')).toBe(true);
    });

    it('finds the short ones too: a reason, a next step, a list of things to pick from', () => {
        expect(hasNarrativePlaceholder('I am sorry for [briefly state your reason, e.g., an illness].')).toBe(true);
        expect(hasNarrativePlaceholder('The next step is [mention the next step].')).toBe(true);
        expect(hasNarrativePlaceholder('He keeps [stealing my food / snuggling in bed / snacking].')).toBe(true);
    });

    it('does not mind brackets that are plain facts the sender fills in later', () => {
        expect(hasNarrativePlaceholder('Dear Professor [Professor\'s Last Name], my [Course Name] project is due on [Original Due Date].')).toBe(false);
    });

    it('is false for a text without brackets, and for an empty text', () => {
        expect(hasNarrativePlaceholder('A recent illness has set me back on my schedule.')).toBe(false);
        expect(hasNarrativePlaceholder('')).toBe(false);
        expect(hasNarrativePlaceholder(null)).toBe(false);
    });
});
