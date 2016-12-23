import React from 'react';
import PicksPage from '../src/Components/PicksPage';
import renderer from 'react-test-renderer';

describe('PicksPage', () => {
    it('should render sample data', () => {
        const sampleData = [{
            left: {
                picks: [{username: 'Ryan', wager: 1}],
                teamName: 'Left1'
            },
            right: {
                picks: [{username: 'Dan', wager: 2}],
                teamName: 'Right1'
            },
            gameDetails: {
                eventName: 'Game1',
                date: new Date(2016, 11, 1, 13, 0, 0),
            },
            id: 1,
        }];
        const component = renderer.create(
            <PicksPage matchupPicks={sampleData} />
        );
        let tree = component.toJSON();
        expect(tree).toMatchSnapshot();
    });
});
