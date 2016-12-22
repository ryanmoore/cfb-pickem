import React from 'react';
import {
    IndexRoute, 
    Route
} from 'react-router';
import ViewPicksPage from './Containers/ViewPicksPage';
import PickemApp from './Containers/PickemApp';
import GameIndex from './Containers/GameIndex';
import DisplayedMatchupList from './Containers/DisplayedMatchupList';
import ViewScoresPage from './Containers/ViewScoresPage';
import LoginPage from './Containers/LoginPage';

export default (
    <Route path='/' component={PickemApp}>
        <IndexRoute component={GameIndex} />
        <Route path='makepicks' component={DisplayedMatchupList} />
        <Route path='picks' component={ViewPicksPage} />
        <Route path='scores' component={ViewScoresPage} />
        <Route path='login' component={LoginPage} />
    </Route>
);
