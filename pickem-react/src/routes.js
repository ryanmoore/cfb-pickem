import React from 'react';
import {
    IndexRoute, 
    Route
} from 'react-router';
import PickemApp from './Containers/PickemApp';
import GameIndex from './Containers/GameIndex';
import DisplayedMatchupList from './Containers/DisplayedMatchupList';

export default (
    <Route path='/' component={PickemApp}>
        <IndexRoute component={GameIndex} />
        <Route path='picks' component={DisplayedMatchupList} />
    </Route>
);
