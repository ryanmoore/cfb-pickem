
import { 
    connectedReduxRedirect ,
} from 'redux-auth-wrapper/history4/redirect';
import connectedAuthWrapper from 'redux-auth-wrapper/connectedAuthWrapper';
import { routerActions } from 'react-router-redux';

const authSelector = (state) => state.auth;

export const UserIsAuthenticated = connectedReduxRedirect({
    authenticatedSelector: authSelector,
    redirectAction: routerActions.replace,
    redirectPath: '/login',
    wrapperDisplayName: 'UserIsAuthenticated',
});

export const UserIsNotAuthenticated = connectedReduxRedirect({
    authenticatedSelector: authSelector,
    redirectAction: routerActions.replace,
    wrapperDisplayName: 'UserIsNotAuthenticated',
    predicate: auth => (typeof(auth.user) === 'undefined'),
    redirectPath: '/',
    allowRedirectBack: false,
});

export const VisibleWhenAuth = connectedAuthWrapper({
    authenticatedSelector: authSelector,
    wrapperDisplayName: 'VisibleWhenAuth',
});

export const UserIsAuthOrElse = (Component, FailureComponent) => connectedAuthWrapper({
    authenticatedSelector: authSelector,
    wrapperDisplayName: 'UserIsAuthOrElse',
    FailureComponent,
})(Component);

export const VisibleWhenSuperuser = connectedAuthWrapper({
    authenticatedSelector: authSelector,
    wrapperDisplayName: 'VisibleWhenSuperuser',
    predicate: auth => auth.user && auth.user.is_superuser,
});
