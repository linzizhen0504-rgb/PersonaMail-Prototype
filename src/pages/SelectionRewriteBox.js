import React, { useEffect, useRef } from 'react';
import { ArrowUpOutlined, LoadingOutlined } from '@ant-design/icons';

// Corner radius shared by the intent cards (.vc-card), the intent tags and this box
export const CARD_BORDER_RADIUS = '10px';

// cards condition: floating "Describe changes" box shown under a text selection. It only draws; EmailEditor decides when
// it is shown, sends the request and applies the result.
const SelectionRewriteBox = React.forwardRef(function SelectionRewriteBox(
    { top, left, width, status, prompt, onPromptChange, onSubmit, newText, errorMessage, notice, onAccept, onDiscard },
    ref
) {
    const inputRef = useRef(null);
    // The box does not take the keyboard focus when it opens: the writer can type, delete or paste over the selected words
    // by hand. The input is focused again only after an answer came back to a request typed in it.
    const previousStatus = useRef(status);
    useEffect(() => {
        if (previousStatus.current === 'loading' && status !== 'loading' && inputRef.current) inputRef.current.focus({ preventScroll: true });
        previousStatus.current = status;
    }, [status]);

    const canSend = prompt.trim().length > 0 && status !== 'loading';
    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) onSubmit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            onDiscard();
        }
    };

    return (
        <div
            ref={ref}
            className='rw-box'
            style={{ top, left, width }}
            // Clicking the box must not clear the selection; the input itself still takes focus
            onMouseDown={(event) => { if (event.target.tagName !== 'INPUT') event.preventDefault(); }}
        >
            <style>{`
                .rw-box { position: absolute; z-index: 20; box-sizing: border-box; padding: 8px 8px 8px 16px; background: #f6f6f9;
                    border: 1px solid #e3e5e8; border-radius: ${CARD_BORDER_RADIUS}; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12); line-height: 1.4; }
                .rw-row { display: flex; align-items: center; gap: 8px; }
                .rw-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 16px; color: #333; padding: 6px 0; }
                .rw-input::placeholder { color: #8a8a90; }
                .rw-send { flex: none; width: 36px; height: 36px; border: none; border-radius: 50%; background: #d4d5db; color: #fff;
                    display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: not-allowed; }
                .rw-send.ready { background: #2f6fde; cursor: pointer; }
                .rw-preview { margin: 8px 8px 4px 0; padding-top: 8px; border-top: 1px solid #e3e5e8; }
                .rw-text { max-height: 120px; overflow: auto; font-size: 14px; color: #333; white-space: pre-wrap; }
                .rw-notice { margin-top: 6px; font-size: 12px; color: #8a8a90; }
                .rw-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
                .rw-btn { padding: 4px 12px; font-size: 13px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; color: #333; cursor: pointer; }
                .rw-btn.primary { border-color: #2f6fde; background: #2f6fde; color: #fff; }
                .rw-error { margin: 6px 8px 2px 0; font-size: 13px; color: #cf1322; }
                ::highlight(rewrite-selection) { background-color: #cfe0fb; color: inherit; }
            `}</style>
            <div className='rw-row'>
                <input
                    ref={inputRef}
                    className='rw-input'
                    value={prompt}
                    placeholder='Describe changes'
                    disabled={status === 'loading'}
                    onChange={(event) => onPromptChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <button
                    type='button'
                    className={`rw-send${canSend ? ' ready' : ''}`}
                    aria-label='Send'
                    disabled={!canSend}
                    onClick={onSubmit}
                >
                    {status === 'loading' ? <LoadingOutlined /> : <ArrowUpOutlined />}
                </button>
            </div>
            {status === 'preview' && (
                <div className='rw-preview'>
                    <div className='rw-text'>{newText}</div>
                    {notice && <div className='rw-notice'>{notice}</div>}
                    <div className='rw-actions'>
                        <button type='button' className='rw-btn' onClick={onDiscard}>Discard</button>
                        <button type='button' className='rw-btn primary' onClick={onAccept}>Accept</button>
                    </div>
                </div>
            )}
            {status === 'error' && <div className='rw-error'>{errorMessage}</div>}
        </div>
    );
});

export default SelectionRewriteBox;
