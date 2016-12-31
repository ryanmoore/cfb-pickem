import React from 'react';
import {
    IndexRedirect,
    Route,
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
import AdminViewPicksPage from './Containers/AdminViewPicksPage';
import YearSelector from './Containers/YearSelector';
import ViewHistoryPage from './Containers/ViewHistoryPage';

export default (
    <Route path='/'>
        <IndexRedirect to='/2016/index' />
        <Route path='login' component={UserIsNotAuthenticated(LoginPage)} />
        <Route path='logout' component={UserIsAuthenticated(LogoutPage)} />
        <Route path='/:year' component={YearSelector}>
            <Route component={PickemApp}>
                <IndexRedirect to='index' />
                <Route path='history' component={ViewHistoryPage} />
                <Route path='index' component={GameIndex} />
                <Route path='makepicks' component={UserIsAuthenticated(MakePicksPage)} />
                <Route path='picks' component={ViewPicksPage} />
                <Route path='scores' component={ViewScoresPage} />
                <Route path='admin'>
                    <Route path='addwinner' component={() => (<AdminViewPicksPage />)}/>
                </Route>
            </Route>

            {/* Make sure this route is last */}
            <Route path='*' component={PageNotFound} />
        </Route>
    </Route>
);
