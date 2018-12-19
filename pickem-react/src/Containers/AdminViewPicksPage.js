import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import { Button } from 'react-bootstrap';
import {
    connect
} from 'react-redux';
import {
    submitAddWinnerButtonPress,
} from  '../actions';
import ViewPicksPage from '../Containers/ViewPicksPage';
import './AdminViewPicksPage.css';

class AdminAddWinnerButton extends Component {
    static propTypes = {
        id: PropTypes.number.isRequired,
        onClick: PropTypes.func.isRequired,
        left: PropTypes.bool.isRequired,
    }

    constructor(props) {
        super(props);
        this.handleOnClick = this.handleOnClick.bind(this);
    }

    handleOnClick(/*event*/) {
        this.props.onClick(this.props.id);
    }

    render() {
        const { left } = this.props;
        const className = 'admin-add-winner-button-' + (left ? 'left' : 'right');
        return (
            <Button className={className}
                onClick={this.handleOnClick}
                >
                Add winner
            </Button>
        );
    }
}

const mapDispatchToProps = (dispatch) => ({
    onClick: (id) => dispatch(submitAddWinnerButtonPress(id)).then(

    ),
});

const submitAddWinnerButton = connect(null, mapDispatchToProps)(AdminAddWinnerButton);

class AdminViewPicksPage extends Component {
    render() {
        return (
            <ViewPicksPage admin={true} AdminButton={submitAddWinnerButton}/>

        );
    }
}

export default AdminViewPicksPage;
