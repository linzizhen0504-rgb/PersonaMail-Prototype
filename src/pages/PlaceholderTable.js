import React, { useRef, useState } from 'react';
import { Card, Input } from 'antd';
import { ClearOutlined, DeleteOutlined } from '@ant-design/icons';
import { SIDEBAR_TITLE_STYLE, SIDEBAR_SECTION_GAP, SidebarToggle, HoverIconButton } from './FactorPanel';

// Table of the [bracketed] information a draft still asks for, shown at the top of the sidebar.
// It only draws; EmailEditor finds the placeholders and puts the values into the draft that "Regenerate with These Options" makes.
const PlaceholderTable = ({ rows, onChange, onDelete, onClearAll, canClear, generating = false }) => {
    const [open, setOpen] = useState(true); // open at first, like the other sections of the sidebar
    // The scrollbar is drawn only while the list is being scrolled (the class is added on scroll and dropped after a moment)
    const scrollTimer = useRef(null);
    const showScrollbar = (event) => {
        const element = event.currentTarget;
        element.classList.add('is-scrolling');
        clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => element.classList.remove('is-scrolling'), 800);
    };
    const cell = { padding: '8px 16px', textAlign: 'left', fontSize: '14px', fontWeight: 400 };
    return (
        <div className='placeholder-table' style={{ marginBottom: SIDEBAR_SECTION_GAP }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={SIDEBAR_TITLE_STYLE}>Information to fill</div>
                    <SidebarToggle open={open} onClick={() => setOpen(value => !value)} what='information to fill' />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <HoverIconButton icon={<ClearOutlined />} label='Clear All' onClick={onClearAll} disabled={!canClear} title='Clear the values typed in the table' />
                </div>
            </div>
            {open && (
                // The table fills the white card: no grey box inside it, so the card's whole area shows rows
                <Card variant='borderless' styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
                    {rows.length === 0 && !generating ? (
                        <div style={{ ...cell, color: 'rgba(0, 0, 0, 0.45)' }}>Nothing to fill in here. Reasons and next steps in brackets can be changed with the version cards.</div>
                    ) : (
                        // The ruled lines run from the left edge of the placeholders to the right edge of the inputs. The 10px between their end and
                        // the card edge hold the scrollbar in the middle: 2px margin, the 6px scrollbar, 2px padding. It only shows while scrolling
                        <div className='pt-scroll' onScroll={showScrollbar} style={{ maxHeight: '260px', overflowY: 'auto', boxSizing: 'border-box', paddingLeft: '24px', paddingRight: '2px', marginRight: '2px' }}>
                            <style>{`
                                .pt-scroll::-webkit-scrollbar { width: 6px; }
                                .pt-scroll::-webkit-scrollbar-track { background: transparent; }
                                .pt-scroll::-webkit-scrollbar-thumb { background-color: transparent; border-radius: 3px; }
                                .pt-scroll.is-scrolling::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.3); }
                                .pt-delete { position: absolute; left: -22px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; padding: 0;
                                    display: flex; align-items: center; justify-content: center; border: 0; border-radius: 4px; background: transparent;
                                    color: #8c8c8c; font-size: 14px; cursor: pointer; }
                                .pt-delete:hover { color: #cf1322; }
                                .pt-delete:focus-visible { color: #cf1322; outline: 2px solid #1677ff; outline-offset: -1px; }
                            `}</style>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ color: 'rgba(0, 0, 0, 0.45)' }}>
                                        <th style={{ ...cell, padding: '8px 4px 8px 0', width: '46%' }}>Placeholder</th>
                                        <th style={{ ...cell, padding: '8px 0' }}>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => (
                                        <tr key={row.key} style={{ borderTop: '1px solid #e8e8e8', color: 'rgba(0, 0, 0, 0.88)' }}>
                                            <td style={{ ...cell, padding: '8px 4px 8px 0', wordBreak: 'break-word', verticalAlign: 'middle', position: 'relative' }}>
                                                {/* the delete icon sits in the 24px left of the ruled lines, so the lines and the text keep their left edge */}
                                                <button
                                                    type='button'
                                                    className='pt-delete'
                                                    aria-label={`Delete ${row.placeholder}`}
                                                    title={`Delete ${row.placeholder} from the email`}
                                                    onClick={() => onDelete(row.key)}
                                                >
                                                    <DeleteOutlined />
                                                </button>
                                                {row.placeholder}
                                            </td>
                                            <td style={{ padding: '6px 0' }}>
                                                <Input
                                                    size='small'
                                                    value={row.value}
                                                    placeholder='Enter value'
                                                    aria-label={`Value for ${row.placeholder}`}
                                                    onChange={event => onChange(row.key, event.target.value)}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

export default PlaceholderTable;
