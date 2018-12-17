import React, {
    Component
} from 'react';
import './App.css';
import {
    Provider
} from 'react-redux';

import configureStore from '../store/configureStore';
import {
    BrowserRouter as Router,
    Route,
    Switch,
} from 'react-router-dom';
import ViewPicksPage from '../Containers/ViewPicksPage';
import PickemApp from '../Containers/PickemApp';
import GameIndex from '../Containers/GameIndex';
import MakePicksPage from '../Containers/MakePicksPage';
import ViewScoresPage from '../Containers/ViewScoresPage';
import LoginPage from '../Containers/LoginPage';
import LogoutPage from '../Containers/LogoutPage';
import { UserIsAuthenticated, UserIsNotAuthenticated } from '../auth.js';
import PageNotFound from '../Components/PageNotFound';
import AdminViewPicksPage from '../Containers/AdminViewPicksPage';
import YearSelector from '../Containers/YearSelector';
import ViewHistoryPage from '../Containers/ViewHistoryPage';

let { store } = configureStore();


function withYearSelector(WrappedComponent) {
    class NewClass extends Component {
        render() {
            return (
                <YearSelector>
                    <WrappedComponent {...this.props} />
                </YearSelector>
            );
        }
    };
    return NewClass;
}


class App extends Component {
    render() {
        return (
            <Provider store={store}>
                <div>
                    <Router>
                    <div>
                        <Route path='/' component={PickemApp} />
                        {/* <NavRedirect to='/2017/index' /> */}
                        <Route path='login' component={UserIsNotAuthenticated(LoginPage)} />
                        <Route path='logout' component={UserIsAuthenticated(LogoutPage)} />
                        <Route path='history' component={ViewHistoryPage} />
                        {/*<Route path='/:year' component={YearSelector}/> */}
                        {/* <NavRedirect to='index' /> */}
                        <Route path='/:year/index' component={withYearSelector(GameIndex)} />
                        <Route path='/:year/makepicks' component={UserIsAuthenticated(withYearSelector(MakePicksPage))} />
                        <Route path='/:year/picks' component={withYearSelector(ViewPicksPage)} />
                        <Route path='/:year/scores' component={withYearSelector(ViewScoresPage)} />
                        <Route path='/:year/admin/addwinner' component={withYearSelector(AdminViewPicksPage)}/>
                        {/* Make sure this route is last */}
                        <Route path='*' component={PageNotFound} />
                    </div>
                    </Router>
                </div>
            </Provider>
        );
    }
}

export default App;
