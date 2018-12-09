
import { 
    connectedReduxRedirect ,
} from 'redux-auth-wrapper/history4/redirect';
import connectedAuthWrapper from 'redux-auth-wrapper/connectedAuthWrapper';
import authWrapper from 'redux-auth-wrapper/authWrapper';
// import { routerActions } from 'react-router-redux';

const authSelector = (state) => state.auth;

const isUser = (state) => state.auth.user !== null;

const isAdmin = (state) => state.auth.user !== null && state.auth.user.is_superuser;

const isNotAuthed = (state) => typeof(state.auth.user) === 'undefined';


export const UserIsAuthenticated = connectedReduxRedirect({
    authenticatedSelector: isUser,
    // redirectAction: routerActions.replace,
    redirectPath: '/login',
    wrapperDisplayName: 'UserIsAuthenticated',
});

export const UserIsNotAuthenticated = connectedReduxRedirect({
    authenticatedSelector: isNotAuthed,
    // redirectAction: routerActions.replace,
    wrapperDisplayName: 'UserIsNotAuthenticated',
    redirectPath: '/',
    allowRedirectBack: false,
});

export const VisibleWhenAuth = authWrapper({
    authenticatedSelector: isUser,
    wrapperDisplayName: 'VisibleWhenAuth',
});

export const UserIsAuthOrElse = (Component, FailureComponent) => connectedAuthWrapper({
    authenticatedSelector: isUser,
    wrapperDisplayName: 'UserIsAuthOrElse',
    FailureComponent,
})(Component);

export const VisibleWhenSuperuser = connectedAuthWrapper({
    authenticatedSelector: isAdmin,
    wrapperDisplayName: 'VisibleWhenSuperuser',
});
