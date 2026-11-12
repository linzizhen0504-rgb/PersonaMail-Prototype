import { profileVisible } from './flags';

describe('profileVisible: the style profile is only shown with ?profile=1 in the address (the demo), never by default', () => {
    it('is on for ?profile=1, with other parameters around it, and for true', () => {
        expect(profileVisible('?profile=1')).toBe(true);
        expect(profileVisible('?pid=DEMO&profile=1')).toBe(true);
        expect(profileVisible('?profile=1&pid=DEMO')).toBe(true);
        expect(profileVisible('?profile=true')).toBe(true);
    });

    it('is off without it, and for anything else', () => {
        expect(profileVisible('')).toBe(false);
        expect(profileVisible('?pid=P01')).toBe(false);
        expect(profileVisible('?profile=0')).toBe(false);
        expect(profileVisible('?profile=')).toBe(false);
        expect(profileVisible('?profiles=1')).toBe(false);
        expect(profileVisible(undefined)).toBe(false);
    });
});
