
import { UserAuthWrapper } from 'redux-auth-wrapper';
import { routerActions } from 'react-router-redux';

export const UserIsAuthenticated = UserAuthWrapper({
    authSelector: state => state.auth,
    redirectAction: routerActions.replace,
    wrapperDisplayName: 'UserIsAuthenticated',
});

export const UserIsNotAuthenticated = UserAuthWrapper({
    authSelector: state => state.auth,
    redirectAction: routerActions.replace,
    wrapperDisplayName: 'UserIsNotAuthenticated',
    predicate: auth => (typeof(auth.user) === 'undefined'),
    failureRedirectPath: (state, ownProps) => ownProps.location.query.redirect || '/',
    allowRedirectBack: false,
});
