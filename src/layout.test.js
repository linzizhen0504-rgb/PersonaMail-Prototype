import { PAGE_TOP_PADDING, TITLE_ROW_HEIGHT, SIDEBAR_FIRST_ROW_HEIGHT, SIDEBAR_TOP_PADDING, titleCentre } from './layout';

describe('the two titles at the top of the page', () => {
    it('are on one line: the centre of "Email Draft Editor" and of "Information to fill" is the same', () => {
        const editorTitle = PAGE_TOP_PADDING + TITLE_ROW_HEIGHT / 2;
        const sidebarTitle = SIDEBAR_TOP_PADDING + SIDEBAR_FIRST_ROW_HEIGHT / 2;
        expect(sidebarTitle).toBe(editorTitle);
    });

    it('titleCentre is that centre', () => {
        expect(titleCentre()).toBe(PAGE_TOP_PADDING + TITLE_ROW_HEIGHT / 2);
    });

    it('are higher than they were (the centre was 44px under the top of the content, with 24px of padding)', () => {
        expect(titleCentre()).toBeLessThanOrEqual(44 - 10);
    });

    it('the space won above the title and above the intents goes to the editor box, so that its bottom stays where it was', () => {
        const { PAGE_TOP_PADDING: top, EDITOR_ROW_EXTRA } = require('./layout');
        expect(EDITOR_ROW_EXTRA).toBe((24 - top) + 12 + (8 - require('./layout').INTENTS_TOP_PADDING));
    });
});

describe('the editor box: roomier at the top, not smaller, and the intents stay where they were', () => {
    const L = require('./layout');
    // before: frame top 8, subject row 32, gap 8, frame bottom 20, toolbar padding 8+6 with buttons padded 4, intents padded 8 at the top
    const OLD = { frameTop: 8, subjectRow: 32, subjectGap: 8, frameBottom: 20, toolbar: 8 + 6 + 4 * 2, intentsTop: 8, rowHeight: 524 };

    it('the grey frame, the subject row and the gap under it are all roomier than before', () => {
        expect(L.FRAME_TOP).toBeGreaterThan(OLD.frameTop);
        expect(L.SUBJECT_MIN_HEIGHT).toBeGreaterThan(OLD.subjectRow);
        expect(L.SUBJECT_GAP).toBeGreaterThan(OLD.subjectGap);
    });

    it('the first intent card stays at the same place under the page top (the intents show as much as before)', () => {
        expect(L.EDITOR_ROW_HEIGHT + L.INTENTS_TOP_PADDING).toBe(OLD.rowHeight + OLD.intentsTop);
    });

    it('the text area (card minus toolbar) is higher than before', () => {
        const textArea = (frameTop, subjectRow, gap, frameBottom, toolbar, rowHeight) => rowHeight - frameTop - subjectRow - gap - frameBottom - toolbar;
        const before = textArea(OLD.frameTop, OLD.subjectRow, OLD.subjectGap, OLD.frameBottom, OLD.toolbar, OLD.rowHeight);
        const now = textArea(L.FRAME_TOP, L.SUBJECT_MIN_HEIGHT, L.SUBJECT_GAP, L.FRAME_BOTTOM, L.TOOLBAR_HEIGHT_EXTRA, L.EDITOR_ROW_HEIGHT);
        expect(now).toBeGreaterThan(before);
    });
});

describe('the corners of the editor', () => {
    it('are as round as the corners of the placeholder table card on the left (the antd card radius, 8px)', () => {
        expect(require('./layout').EDITOR_RADIUS).toBe(8);
    });
});
