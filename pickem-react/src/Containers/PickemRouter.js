import React, {
    Component
} from 'react';
import {
    BrowserRouter as Router,
    Route,
    Switch,
    Redirect,
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

function withYearSelector(WrappedComponent) {
    class NewClass extends Component {
        render() {
            return (
                <YearSelector {...this.props}>
                    <WrappedComponent {...this.props} />
                </YearSelector>
            );
        }
    }
    return NewClass;
}

function redirectIfYear(props) {
    const year = props.match.params.year;
    if(year) {
        return <Redirect to={ `/${year}/index` }/>
    }
    return null;
}

class PickemRouter extends Component {
    render() {
        return (
            <Router basename={process.env.REACT_APP_SITE_BASENAME}>
                <div>
                    <Route path='/' component={PickemApp} />
                    <Switch>
                        <Route exact path="/" render={() => (
                            <Redirect to="/2019/index"/>
                        )}/>
                        <Route path='/login' component={UserIsNotAuthenticated(LoginPage)} />
                        <Route path='/logout' component={UserIsAuthenticated(LogoutPage)} />
                        <Route path='/history' component={ViewHistoryPage} />
                        {/*<Route path='/:year' component={YearSelector}/> */}
                        {/* <NavRedirect to='index' /> */}
                        <Route exact path="/:year" render={redirectIfYear}/>
                        <Route path='/:year/index' component={withYearSelector(GameIndex)} />
                        <Route path='/:year/makepicks' component={UserIsAuthenticated(withYearSelector(MakePicksPage))} />
                        <Route path='/:year/picks' component={withYearSelector(ViewPicksPage)} />
                        <Route path='/:year/scores' component={withYearSelector(ViewScoresPage)} />
                        <Route path='/:year/admin/addwinner' component={withYearSelector(AdminViewPicksPage)}/>
                        {/* Make sure this route is last */}
                        <Route
                            path='*'
                            render={props => <PageNotFound {...props}
                                from='RoutingFallthrough'/>} />
                    </Switch>
                </div>
            </Router>
        );
    }
}

export default PickemRouter;
