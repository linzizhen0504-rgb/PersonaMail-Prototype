// How the names the writer sees (intent dimensions and values, component titles) are compared and kept short.

// Same name, whatever the case, underscores or repeated spaces
const normalizeName = (name) => String(name).toLowerCase().replace(/[_\s]+/g, ' ').trim();

// Names the writer sees are short and plain: when the model joins two names with a slash, only the first one is kept
// ("Call to Action / Proposed Next Steps" -> "Call to Action")
const plainName = (text) => {
    const name = String(text).split(/\s*\/\s*/)[0].trim();
    return name || String(text).trim();
};

module.exports = { normalizeName, plainName };
