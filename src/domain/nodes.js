// Text of the nodes of the editor (Slate documents are plain json), as pure functions.

// Safe node text extraction
export const getNodeText = (editor, node) => {
    try {
        if (!node || typeof node !== 'object') {
            return '';
        }

        if (node.children && Array.isArray(node.children)) {
            return node.children.map(child => {
                if (typeof child === 'string') {
                    return child;
                } else if (child && typeof child === 'object' && child.text !== undefined) {
                    return child.text;
                } else if (child && child.children) {
                    return getNodeText(editor, child);
                }
                return '';
            }).join('');
        }

        if (node.text !== undefined) {
            return node.text;
        }

        return '';
    } catch (error) {
        console.error('Error processing node:', node, error);
        return '';
    }
};

// The selected part of each paragraph from the start offset in the first to the end offset in the last, joined as paragraphs
export const joinSelectedBlocks = (blocks, startBlock, startOffset, endBlock, endOffset) => {
    const pieces = [];
    for (let i = startBlock; i <= endBlock; i++) {
        const text = blocks[i] || '';
        const piece = text.slice(i === startBlock ? startOffset : 0, i === endBlock ? endOffset : text.length);
        if (piece.trim()) pieces.push(piece);
    }
    return pieces.join('\n\n');
};
