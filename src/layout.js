// The space at the top of the page. The title "Email Draft Editor" (right) and the title "Information to fill" (sidebar, left) have to
// stay on one line, so the numbers that place them are here, in one place, and the sidebar one is worked out from the other.
const ORIGINAL_PAGE_TOP_PADDING = 24; // before the titles were moved up
const ORIGINAL_TITLE_GAP = 12;

export const PAGE_TOP_PADDING = 12;            // between the top of the content and the title row of the editor
export const TITLE_ROW_HEIGHT = 40;            // the title row of the editor (the title is centred in it)
export const TITLE_GAP = 0;                    // between that row and the editor box
export const SIDEBAR_FIRST_ROW_HEIGHT = 20;    // the row of "Information to fill" with its small button

// The sidebar starts lower than the page by half the difference of the two rows, so that the two titles have the same centre
export const SIDEBAR_TOP_PADDING = PAGE_TOP_PADDING + (TITLE_ROW_HEIGHT - SIDEBAR_FIRST_ROW_HEIGHT) / 2;
export const titleCentre = () => PAGE_TOP_PADDING + TITLE_ROW_HEIGHT / 2;

// The inside of the editor box. Roomier at the top (the frame, the subject row and the gap under it), and the room for that is won at
// the bottom of the frame, in the toolbar, and from the padding above the intents.
export const FRAME_TOP = 12;                   // between the top of the grey frame and the subject row
export const SUBJECT_MIN_HEIGHT = 36;          // the subject row
export const SUBJECT_GAP = 12;                 // between the subject row and the white card
export const FRAME_BOTTOM = 12;                // between the white card and the bottom of the grey frame (and of the box)
export const TOOLBAR_PAD_TOP = 6;              // compact toolbar padding
export const TOOLBAR_PAD_BOTTOM = 6;
export const TOOLBAR_BUTTON_PAD_Y = 2;         // vertical padding of a toolbar button
export const TOOLBAR_HEIGHT_EXTRA = TOOLBAR_PAD_TOP + TOOLBAR_PAD_BOTTOM + 2 * TOOLBAR_BUTTON_PAD_Y; // the toolbar's height besides its text
const ORIGINAL_INTENTS_TOP_PADDING = 8;
export const INTENTS_TOP_PADDING = 2;          // above the first row of intent cards

// The editor box starts higher; its height grows by what was won above it and by what the intents gave up on top, so that the
// intent cards stay exactly where they were
export const EDITOR_ROW_EXTRA = (ORIGINAL_PAGE_TOP_PADDING - PAGE_TOP_PADDING) + (ORIGINAL_TITLE_GAP - TITLE_GAP) + (ORIGINAL_INTENTS_TOP_PADDING - INTENTS_TOP_PADDING);
export const EDITOR_ROW_HEIGHT = 500 + EDITOR_ROW_EXTRA;

export const EDITOR_RADIUS = 8;                // the corner radius of the editor box, its white card and the subject row
