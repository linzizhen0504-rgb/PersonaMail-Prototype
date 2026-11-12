import React from 'react';
import { Popover, Tag, Progress, Tooltip } from 'antd';
import { usableProfile, describeOperation } from '../domain/styleProfile';

// Demo only (?profile=1): what the preference model has learned about the writer in this email, with the evidence for every statement.
// A small tag next to the title of the component list; a click opens the details. It takes no room in the layout.
const Section = ({ title, hint, children }) => (
    <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: '#8a9099', marginBottom: '4px' }}>
            {hint ? <Tooltip title={hint}><span style={{ cursor: 'help', borderBottom: '1px dotted #8a9099' }}>{title}</span></Tooltip> : title}
        </div>
        {children}
    </div>
);

const EVIDENCE_HINT = 'How much the system has to go on. It grows with every operation (a used card, a version passed over, an AI rewrite, a hand edit) and is full after four.';
const STRENGTH_HINT = 'The more operations and the more they point the same way, the higher the number. It can go down when you change very different texts, even if you keep taking the recommended versions. It shows how consistent the changes are, not how often the system is right.';

const Values = ({ items, color }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {items.map(item => <Tag key={`${item.dimension}|${item.value}`} color={color} style={{ margin: 0 }}>{item.value}{item.weight >= 1.5 ? ` ×${Math.round(item.weight)}` : ''}</Tag>)}
    </div>
);

const percent = (strength) => Math.min(100, Math.round(strength * 100));

export const StyleProfileDetails = ({ profile }) => {
    if (!usableProfile(profile)) {
        return <div style={{ width: '300px', color: '#8a9099', fontSize: '13px' }}>Nothing learned yet. Use a card, and the system starts to learn how this writer changes the text.</div>;
    }
    const { traits, liked, disliked, stats, recent } = profile;
    return (
        <div style={{ width: '320px', fontSize: '13px', maxHeight: '60vh', overflowY: 'auto' }}>
            <Section title={`Evidence (${profile.ops_count} operation${profile.ops_count > 1 ? 's' : ''})`} hint={EVIDENCE_HINT}>
                <Progress percent={percent(profile.evidence)} size="small" showInfo />
            </Section>
            <Section title="Style strength" hint={STRENGTH_HINT}>
                <Progress percent={percent(profile.strength)} size="small" showInfo />
            </Section>
            <Section title="What this writer tends to do">
                {traits.length === 0
                    ? <div style={{ color: '#8a9099' }}>Not enough changes yet to say (at least 2 are needed).</div>
                    : traits.map(trait => (
                        <div key={trait.kind} style={{ marginBottom: '4px' }}>
                            {trait.text}
                            <div style={{ color: '#8a9099', fontSize: '12px' }}>from: {trait.evidence.join(', ')}</div>
                        </div>
                    ))}
            </Section>
            {liked.length > 0 && <Section title="Versions taken"><Values items={liked} color="blue" /></Section>}
            {disliked.length > 0 && <Section title="Versions passed over"><Values items={disliked} /></Section>}
            {stats.changes > 0 && (
                <Section title="Over all changes">
                    <div>{stats.changes} change{stats.changes > 1 ? 's' : ''}; average length {stats.mean_length_change_pct > 0 ? '+' : ''}{stats.mean_length_change_pct}%; new sentences in {stats.with_added}, sentences removed in {stats.with_removed}, only reworded in {stats.only_reworded}</div>
                </Section>
            )}
            {recent.length > 0 && (
                <Section title="Latest operations">
                    {recent.map((op, index) => <div key={index} style={{ marginBottom: '2px' }}>{describeOperation(op)}</div>)}
                </Section>
            )}
        </div>
    );
};

const StyleProfileChip = ({ profile }) => (
    <Popover title="Style learned in this email" content={<StyleProfileDetails profile={profile} />} trigger="click" placement="bottomRight">
        <Tag color={usableProfile(profile) ? 'blue' : 'default'} style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
            Style{usableProfile(profile) ? ` · ${percent(profile.evidence)}%` : ''}
        </Tag>
    </Popover>
);

export default StyleProfileChip;
