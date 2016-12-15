import { PickData } from '../src/Components/Matchup';

describe('PickData', () => {
    it('should display unranked team', () => {
        const pick = new PickData(1, 'A');
        expect(pick.id).toBe(1);
        expect(pick.toString()).toBe('A');
    });

    it('should display ranked team', () => {
        const pick = new PickData(1, 'A', 2);
        expect(pick.id).toBe(1);
        expect(pick.toString()).toBe('(2) A');
    });
});
