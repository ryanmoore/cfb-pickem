
import { UserAuthWrapper } from 'redux-auth-wrapper';
import { routerActions } from 'react-router-redux';

const authSelector = (state) => state.auth;

export const UserIsAuthenticated = UserAuthWrapper({
    authSelector,
    redirectAction: routerActions.replace,
    wrapperDisplayName: 'UserIsAuthenticated',
});

export const UserIsNotAuthenticated = UserAuthWrapper({
    authSelector,
    redirectAction: routerActions.replace,
    wrapperDisplayName: 'UserIsNotAuthenticated',
    predicate: auth => (typeof(auth.user) === 'undefined'),
    failureRedirectPath: (state, ownProps) => ownProps.location.query.redirect || '/',
    allowRedirectBack: false,
});

export const VisibleWhenAuth = UserAuthWrapper({
    authSelector,
    wrapperDisplayName: 'VisibleWhenAuth',
    FailureComponent: null,
});

export const UserIsAuthOrElse = (Component, FailureComponent) => UserAuthWrapper({
    authSelector,
    wrapperDisplayName: 'UserIsAuthOrElse',
    FailureComponent,
})(Component);

export const VisibleWhenSuperuser = UserAuthWrapper({
    authSelector,
    wrapperDisplayName: 'VisibleWhenSuperuser',
    FailureComponent: null,
    predicate: auth => auth.user && auth.user.is_superuser,
});
