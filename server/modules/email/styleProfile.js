// What the sender prefers in this email, learned from their choices so far (the style profile of the preference model), as a section
// of the rewriter's prompt. Nothing when there is nothing to say. The intent values keep their meaning: only the length and the manner follow
// the sender, so that the versions of the different values still differ from each other.
const MAX_LISTED = 5;
const MAX_TEXT = 200;
const MIN_LENGTH_CHANGE = 10; // a length change below this (in percent) is not asked for

const texts = (list) => (Array.isArray(list) ? list : [])
    .filter(item => typeof item === 'string' && item.trim())
    .slice(0, MAX_LISTED)
    .map(item => (item.length > MAX_TEXT ? `${item.slice(0, MAX_TEXT)}…` : item.trim()));

function styleProfileSection(profile) {
    if (!profile || typeof profile !== 'object') return '';
    const traits = texts(profile.traits);
    const liked = texts(profile.liked);
    const disliked = texts(profile.disliked);
    const pct = Number.isFinite(profile.lengthChangePct) ? Math.round(profile.lengthChangePct) : null;
    const lengthAsked = pct !== null && Math.abs(pct) >= MIN_LENGTH_CHANGE && traits.length > 0;
    if (traits.length === 0 && liked.length === 0 && disliked.length === 0) return '';
    const lines = [];
    if (traits.length > 0) lines.push(`What they tend to do: ${traits.join('; ')}.`);
    if (liked.length > 0) lines.push(`Versions they took: ${liked.join(' | ')}.`);
    if (disliked.length > 0) lines.push(`Versions they passed over: ${disliked.join(' | ')}.`);
    if (lengthAsked) lines.push(`Aim for about ${Math.abs(pct)}% ${pct < 0 ? 'shorter' : 'longer'} than the current component, as they tend to make it.`);
    return '\n\n**What this sender prefers in this email** (learned from the choices they have made so far). Let the length and the manner of each version follow this, where it applies to the component. Keep the meaning of each intent value: the versions of the different values must still differ from each other. Do not copy wording from the versions listed, and do not add a greeting, a pleasantry, a closing or anything else that is not the component\'s own job.\n'
        + lines.join('\n');
}

module.exports = { styleProfileSection };
