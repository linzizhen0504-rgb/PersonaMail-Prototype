// The style profile of the email as the page uses it: whether there is one, and what goes to the rewriter.

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
