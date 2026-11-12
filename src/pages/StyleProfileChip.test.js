import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StyleProfileChip, { StyleProfileDetails } from './StyleProfileChip';

const PROFILE = {
    available: true, ops_count: 4, strength: 0.62, evidence: 1,
    liked: [{ dimension: 'Tone', value: 'Direct and formal', weight: 2 }],
    disliked: [{ dimension: 'Tone', value: 'Apologetic', weight: 0.9 }],
    stats: { changes: 3, mean_length_change_pct: -23, with_added: 2, with_removed: 1, only_reworded: 0 },
    traits: [{ kind: 'shorter', text: 'Tends to make texts shorter (about 23% on average)', evidence: ['Direct and formal', 'Short'] }],
    recent: [{ kind: 'pick', dimension: 'Tone', value: 'Direct and formal', added: 1, removed: 0, reworded: 0, length_change_pct: -30 }]
};

describe('StyleProfileDetails', () => {
    it('says nothing is learned yet when there is no profile', () => {
        render(<StyleProfileDetails profile={null} />);
        expect(screen.getByText(/Nothing learned yet/i)).toBeInTheDocument();
    });

    it('shows each statement with the evidence it stands on', () => {
        render(<StyleProfileDetails profile={PROFILE} />);
        expect(screen.getByText(/Tends to make texts shorter/)).toBeInTheDocument();
        expect(screen.getByText(/from: Direct and formal, Short/)).toBeInTheDocument();
    });

    it('shows both numbers: the evidence (how much there is to go on) and the strength of the style (how much the changes point the same way)', () => {
        render(<StyleProfileDetails profile={{ ...PROFILE, evidence: 0.5, strength: 0.4 }} />);
        expect(screen.getByText(/Evidence \(4 operations\)/)).toBeInTheDocument();
        expect(screen.getByText(/Style strength/)).toBeInTheDocument();
        const bars = screen.getAllByRole('progressbar');
        expect(bars.map(bar => bar.getAttribute('aria-valuenow'))).toEqual(['50', '40']);
    });

    it('explains the evidence when the mouse is over it: it grows with every operation', async () => {
        render(<StyleProfileDetails profile={PROFILE} />);
        userEvent.hover(screen.getByText(/Evidence \(4 operations\)/));
        expect(await screen.findByText(/grows with every operation/i)).toBeInTheDocument();
    });

    it('explains the strength when the mouse is over it: more operations and the more they point the same way, the higher; it can fall; not an accuracy', async () => {
        render(<StyleProfileDetails profile={PROFILE} />);
        userEvent.hover(screen.getByText(/Style strength/));
        expect(await screen.findByText(/the more they point the same way, the higher the number/i)).toBeInTheDocument();
        expect(screen.getByText(/can go down when you change very different texts/i)).toBeInTheDocument();
        expect(screen.getByText(/not how often the system is right/i)).toBeInTheDocument();
    });

    it('shows the versions taken and passed over, and the latest operations as lines', () => {
        render(<StyleProfileDetails profile={PROFILE} />);
        expect(screen.getByText('Direct and formal ×2')).toBeInTheDocument(); // taken twice
        expect(screen.getByText('Apologetic')).toBeInTheDocument();
        expect(screen.getByText('Used "Direct and formal": 30% shorter, 1 new sentence')).toBeInTheDocument();
    });

    it('says that more changes are needed when no statement can be made yet', () => {
        render(<StyleProfileDetails profile={{ ...PROFILE, traits: [] }} />);
        expect(screen.getByText(/at least 2 are needed/i)).toBeInTheDocument();
    });
});

describe('StyleProfileChip', () => {
    it('shows the evidence as a percentage, never more than 100%: it is the number that only grows', () => {
        render(<StyleProfileChip profile={{ ...PROFILE, evidence: 1.4, strength: 0.2 }} />);
        expect(screen.getByText('Style · 100%')).toBeInTheDocument();
    });

    it('shows just "Style" while nothing is learned', () => {
        render(<StyleProfileChip profile={null} />);
        expect(screen.getByText('Style')).toBeInTheDocument();
    });
});
