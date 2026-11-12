// Switches that come with the address of the page.

// The style profile (what the preference model has learned about the writer in this email, and why a card is recommended) is shown only
// for a demonstration: the address has to say ?profile=1. Participants of the study never see anything about the preference model.
export const profileVisible = (search) => {
    const value = new URLSearchParams(search || '').get('profile');
    return value === '1' || value === 'true';
};
