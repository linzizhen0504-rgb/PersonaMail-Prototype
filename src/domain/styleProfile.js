// The style profile of the email as the page uses it: whether there is one, what goes to the rewriter, how an operation reads.

const MAX_SENT = 5;
const DISLIKED_CLEARLY = 0.5; // a card shown next to a used one counts 0.3, so one use alone is not "passed over"

export const usableProfile = (profile) => Boolean(profile) && profile.available !== false && profile.ops_count > 0;

// What the rewriter is told (the `styleProfile` of /intent-change-rewriter), or null when there is nothing to tell
export const rewriterProfile = (profile) => {
    if (!usableProfile(profile)) return null;
    const traits = (profile.traits || []).map(trait => trait.text).slice(0, MAX_SENT);
    const liked = (profile.liked || []).map(item => item.value).slice(0, MAX_SENT);
    const disliked = (profile.disliked || []).filter(item => item.weight >= DISLIKED_CLEARLY).map(item => item.value).slice(0, MAX_SENT);
    if (traits.length === 0 && liked.length === 0 && disliked.length === 0) return null;
    const aboutLength = (profile.traits || []).some(trait => trait.kind === 'shorter' || trait.kind === 'longer');
    return { traits, liked, disliked, lengthChangePct: aboutLength ? profile.stats.mean_length_change_pct : null };
};

const KIND = {
    pick: (value) => `Used "${value}"`,
    ai_edit: (value) => `AI rewrite${value ? ` (${value})` : ''}`,
    manual_edit: (value) => `Edited by hand after "${value}"`
};

// One operation as a line: what it was and what it changed
export const describeOperation = (op) => {
    const head = (KIND[op.kind] || (() => op.kind))(op.value);
    const parts = [];
    if (op.length_change_pct < 0) parts.push(`${Math.abs(op.length_change_pct)}% shorter`);
    else if (op.length_change_pct > 0) parts.push(`${op.length_change_pct}% longer`);
    else parts.push('same length');
    if (op.added > 0) parts.push(`${op.added} new sentence${op.added > 1 ? 's' : ''}`);
    if (op.removed > 0) parts.push(`${op.removed} removed`);
    if (op.added === 0 && op.removed === 0 && op.reworded > 0) parts.push('only reworded');
    return `${head}: ${parts.join(', ')}`;
};

// Why a card is recommended, for the card the model is clear about (`recommended` of /rank) and no other: { headline, detail }, or null
export const recommendationReason = (value, recommended, reasons) => {
    if (!recommended || value !== recommended) return null;
    const reason = reasons && reasons[value];
    if (!reason || !reason.nearest_liked) return null;
    const { nearest_liked: nearest, length_change_pct: pct } = reason;
    let detail = `Closest to "${nearest.value}" (similarity ${nearest.similarity.toFixed(2)})`;
    if (typeof pct === 'number' && pct !== 0) detail += `; would make the text ${Math.abs(pct)}% ${pct < 0 ? 'shorter' : 'longer'}`;
    return { headline: `Matches your picks: ${nearest.value}`, detail: `${detail}.` };
};
