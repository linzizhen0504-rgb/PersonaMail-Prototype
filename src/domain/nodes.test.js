import { getNodeText, joinSelectedBlocks } from './nodes';

describe('getNodeText', () => {
    it('joins the text of the leaves of a paragraph', () => {
        expect(getNodeText(null, { type: 'paragraph', children: [{ text: 'Hello ' }, { text: 'world', bold: true }] })).toBe('Hello world');
    });

    it('reads nested children and plain strings', () => {
        expect(getNodeText(null, { children: [{ children: [{ text: 'a' }, { text: 'b' }] }, 'c'] })).toBe('abc');
    });

    it('reads a leaf', () => {
        expect(getNodeText(null, { text: 'leaf' })).toBe('leaf');
    });

    it('gives an empty text for what has no text', () => {
        expect(getNodeText(null, null)).toBe('');
        expect(getNodeText(null, 'x')).toBe('');
        expect(getNodeText(null, { children: [{}] })).toBe('');
    });
});

describe('joinSelectedBlocks', () => {
    const blocks = ['Dear Mia,', 'See you soon.', 'Love, Wanda'];

    it('takes the part of one paragraph', () => {
        expect(joinSelectedBlocks(blocks, 1, 4, 1, 7)).toBe('you');
    });

    it('takes the end of the first paragraph, the middle ones whole and the start of the last, as paragraphs', () => {
        expect(joinSelectedBlocks(blocks, 0, 5, 2, 4)).toBe('Mia,\n\nSee you soon.\n\nLove');
    });

    it('leaves out a paragraph that has nothing selected', () => {
        expect(joinSelectedBlocks(['abc', '', 'def'], 0, 1, 2, 2)).toBe('bc\n\nde');
    });
});
