
import { 
    connectedRouterRedirect ,
} from 'redux-auth-wrapper/history4/redirect';
import connectedAuthWrapper from 'redux-auth-wrapper/connectedAuthWrapper';
import authWrapper from 'redux-auth-wrapper/authWrapper';
import moment from 'moment';
// import { routerActions } from 'react-router-redux';

export const tokenIsExpired = (state) => {
    return (
        typeof(state.auth.expires) != 'undefined'
        && moment(state.auth.expires) <= moment()
    );
}

const userIsLoggedIn = (state) => {
    return (
        typeof(state.auth.user) != 'undefined'
        && state.auth.user !== null
        && !tokenIsExpired(state)
    );
}

const isAdmin = (state) => userIsLoggedIn(state) && state.auth.user.is_superuser;

const isNotAuthed = (state) => !userIsLoggedIn(state);


export const UserIsAuthenticated = connectedRouterRedirect({
    authenticatedSelector: userIsLoggedIn,
    // redirectAction: routerActions.replace,
    redirectPath: '/login',
    wrapperDisplayName: 'UserIsAuthenticated',
});

export const UserIsNotAuthenticated = connectedRouterRedirect({
    authenticatedSelector: isNotAuthed,
    // redirectAction: routerActions.replace,
    wrapperDisplayName: 'UserIsNotAuthenticated',
    redirectPath: '/',
    allowRedirectBack: false,
});

export const VisibleWhenAuth = authWrapper({
    authenticatedSelector: userIsLoggedIn,
    wrapperDisplayName: 'VisibleWhenAuth',
});

export const UserIsAuthOrElse = (Component, FailureComponent) => connectedAuthWrapper({
    authenticatedSelector: userIsLoggedIn,
    wrapperDisplayName: 'UserIsAuthOrElse',
    FailureComponent,
})(Component);

export const VisibleWhenSuperuser = connectedAuthWrapper({
    authenticatedSelector: isAdmin,
    wrapperDisplayName: 'VisibleWhenSuperuser',
});
