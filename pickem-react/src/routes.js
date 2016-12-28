import React from 'react';
import {
    IndexRoute, 
    Route
} from 'react-router';
import ViewPicksPage from './Containers/ViewPicksPage';
import PickemApp from './Containers/PickemApp';
import GameIndex from './Containers/GameIndex';
import MakePicksPage from './Containers/MakePicksPage';
import ViewScoresPage from './Containers/ViewScoresPage';
import LoginPage from './Containers/LoginPage';
import LogoutPage from './Containers/LogoutPage';
import { UserIsAuthenticated, UserIsNotAuthenticated } from './auth.js';
import PageNotFound from './Components/PageNotFound';

export default (
    <Route path='/' component={PickemApp}>
        <IndexRoute component={GameIndex} />
        <Route path='makepicks' component={UserIsAuthenticated(MakePicksPage)} />
        <Route path='picks' component={ViewPicksPage} />
        <Route path='scores' component={ViewScoresPage} />
        <Route path='login' component={UserIsNotAuthenticated(LoginPage)} />
        <Route path='logout' component={UserIsAuthenticated(LogoutPage)} />
        <Route path='*' component={PageNotFound} />
    </Route>
);
