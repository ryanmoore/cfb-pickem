import React, {
    Component
} from 'react';
import {
    Nav,
    Navbar,
    NavItem,
    NavDropdown,
    MenuItem,
} from 'react-bootstrap';
import {
    LinkContainer,
    IndexLinkContainer,
} from 'react-router-bootstrap';
import {
    IndexLink,
} from 'react-router';
import {
    DragDropContext
} from 'react-dnd';
import {
    default as TouchBackend
} from 'react-dnd-touch-backend';
import {
    connect,
} from 'react-redux';
import HTML5Backend from 'react-dnd-html5-backend';
import {
    VisibleWhenAuth,
    VisibleWhenSuperuser,
    UserIsAuthOrElse,
} from '../auth';
import {
    selectCurrentYear,
} from '../Selectors';

class UserGreeting extends Component {
    static propTypes = {
        name: React.PropTypes.string,
    };
    render() {
        const {
            name
        } = this.props;
        return (<Navbar.Text pullRight>Logged in as: {name}</Navbar.Text>);
    }
}
const DisplayUserGreeting = VisibleWhenAuth(connect((state) => ({
    name: state.auth.user.username,
}))(UserGreeting));

const LogoutLink = () => (<LinkContainer to='/logout'>
                            <NavItem eventKey={5}>Logout</NavItem>
                        </LinkContainer>);
const LoginLink = () => (<LinkContainer to='/login'>
                            <NavItem eventKey={6}>Login</NavItem>
                        </LinkContainer>);
const LoginOrOutLink = UserIsAuthOrElse(LogoutLink, LoginLink);


class AdminMenu extends Component {
    static propTypes = {
        baseKey: React.PropTypes.number.isRequired,
        year: React.PropTypes.number.isRequired,
    };

    render() {
        const { baseKey, year } = this.props;
        return (
            <NavDropdown eventKey={baseKey} title='Admin' id='admin-dropdown'>
                <LinkContainer to={`/${year}/admin/addwinner`}>
                    <MenuItem eventKey={baseKey + .1}>Add winner</MenuItem>
                </LinkContainer>
                <MenuItem eventKey={baseKey + .2}>Another action</MenuItem>
            </NavDropdown>
        );
    }
}

const AdminNavItem = VisibleWhenSuperuser((props) => (
    <AdminMenu year={props.year} baseKey={props.baseKey} />
));

class PickemApp extends Component {
    static propTypes = {
        children: React.PropTypes.node,
        year: React.PropTypes.number.isRequired,
    }
    render() {
        const { year } = this.props;
        return (
            <div>
                <Navbar bsStyle='default' fixedTop collapseOnSelect >
                    <Navbar.Header>
                        <Navbar.Brand>
                            <IndexLink to={`/${year}`}>Pickem</IndexLink>
                        </Navbar.Brand>
                        <Navbar.Toggle />
                    </Navbar.Header>
                    <Navbar.Collapse>
                        <DisplayUserGreeting/>
                        <Nav>
                            <IndexLinkContainer to={`/${year}`}>
                                <NavItem eventKey={1}>Home</NavItem>
                            </IndexLinkContainer>
                            <LinkContainer to={`/${year}/picks`}>
                                <NavItem eventKey={2}>Picks</NavItem>
                            </LinkContainer>
                            <LinkContainer to={`${year}/scores`}>
                                <NavItem eventKey={3}>Scores</NavItem>
                            </LinkContainer>
                            <LinkContainer to={`${year}/makepicks`}>
                                <NavItem eventKey={4}>MakePicks</NavItem>
                            </LinkContainer>
                            <AdminNavItem year={year} baseKey={5} />
                            <LoginOrOutLink/>
                        </Nav>
                    </Navbar.Collapse>
                </Navbar>
                { this.props.children }
           </div>
        );
    }
}

// TODO: Seems we rarely take the html5 backend. Not working in chrome at
// least on dev machine
if ('ontouchstart' in window) {
    // TODO: Update to decorators once stabilized 
    // Use class assign until Decorators stabilize
    // eslint-disable-next-line no-class-assign
    PickemApp = DragDropContext(TouchBackend({
        enableMouseEvents: true
    }))(PickemApp);
} else {
    // eslint-disable-next-line no-class-assign
    PickemApp = DragDropContext(HTML5Backend)(PickemApp);
}

const mapStateToProps = (state) => ({
   year: selectCurrentYear(state),
});

export default connect(mapStateToProps)(PickemApp);
