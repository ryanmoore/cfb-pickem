import React, {
    Component
} from 'react';
import PicksPage from '../Components/PicksPage';

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
        date: new Date(Date.now())
    },
    id: 1,
}];

class ViewPicksPage extends Component {
    render() {
        return <PicksPage matchupPicks={sampleData} />;
    }
}

export default ViewPicksPage;
