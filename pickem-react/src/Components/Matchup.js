import React, { Component, PropTypes } from 'react';
import { Button, Row, Col, Glyphicon } from 'react-bootstrap';

import { DropTarget, DragSource } from 'react-dnd';
import { findDOMNode } from 'react-dom';
import { getEmptyImage } from 'react-dnd-html5-backend';
import './Matchup.css';
import { connect } from 'react-redux';

const Types = {
    MATCHUP: 'matchup'
}

class PickData {
    constructor(id, name, rank, selected) {
        this.id = id;
        this.name = name;
        this.rank = rank;
        this.selected = selected;
    }
    toString() {
        var str = this.name;
        if(this.rank) {
            str = '(' + this.rank.toString() + ') ' + str;
        }
        return str;
    }
    getButtonId() {
        return `pick=${this.id}`;
    }
}

class MatchupData {
    constructor(id, name, left, right, fixedWagerAmount) {
        this.id = id;
        this.name = name;
        this.left = left;
        this.right = right;
        this.fixedWagerAmount = fixedWagerAmount;
    }
}

class Pick extends Component {
    static propTypes = {
        pickdata: PropTypes.shape({
            id: PropTypes.number.isRequired,
            toString: PropTypes.func.isRequired
        }),
        gameid: PropTypes.number.isRequired,
        makePick: PropTypes.func.isRequired,
        selected: PropTypes.object.isRequired,
        preview: PropTypes.bool.isRequired,
    }

    constructor(props) {
        super(props);
        this.handleOnChange = this.handleOnChange.bind(this);
    }

    handleOnChange(e) {
        this.props.makePick(this.props.gameid, parseInt(e.target.value, 10));
    }

    render() {
        const { gameid, pickdata, selected, preview } = this.props;
        const checked = selected && selected[gameid] === pickdata.id;
        return (
            <Col xs={4} className="matchup-col btn btn-default">
                { preview ? null : 
                    <input className='pick-radio'
                        type='radio'
                        name={`game=${gameid}`}
                        value={pickdata.id}
                        id={pickdata.getButtonId()}
                        onChange={this.handleOnChange}
                        checked={checked}
                    />
                }
                <label className="pick-button"
                    htmlFor={pickdata.getButtonId()}>
                    {pickdata.toString()}
                </label>
            </Col>
        );
    }
}

const selectCurrentUIPicks = (state) => state.ui.makePicksOrdering.picks;
const mapStateToProps = (state) => ({
    selected: selectCurrentUIPicks(state),
})

// TODO: Use decorator when stable
// eslint-disable-next-line no-class-assign
Pick = connect(mapStateToProps)(Pick);

class MatchupHandle extends Component {
    static propTypes = {
        wager: PropTypes.number.isRequired,
        name: PropTypes.string.isRequired
    }
    render() {
        return (
            <Col xs={4} className="handle matchup-col">
                <span className="handle-grip">::</span>
                <span className="matchup-wager">{this.props.wager}</span>
                <span className="matchup-info">
                    <Button className="matchup-info-btn" bsStyle="default">
                        <Glyphicon glyph="info-sign"/>
                    </Button>
                    <span className="hidden-xs">
                        { this.props.name }
                    </span>
                </span>
            </Col>
        );
    }
}

function movePastThreshold(monitor, component, hoverIndex, dragIndex) {
    // For a better user interaction, we only want to swap the position of two
    // Matchups if the one we're dragging is clearly past the one we're
    // hovering over. So we will check to see that the mouse of the user
    // is at least past the half way mark.
    // eslint-disable-next-line react/no-find-dom-node
    const hoverBoundingRect = findDOMNode(component).getBoundingClientRect();
    const hoverRectMiddle = (hoverBoundingRect.bottom - hoverBoundingRect.top)/2;
    const mouseOffsetInTarget = monitor.getClientOffset();
    const mousePosInTarget = mouseOffsetInTarget.y - hoverBoundingRect.top;

    const draggingDown = dragIndex < hoverIndex;
    const draggingUp = !draggingDown;
    const mouseBelowMiddle = mousePosInTarget > hoverRectMiddle;
    const mouseAboveMiddle = !mouseBelowMiddle;

    return ((draggingDown && mouseBelowMiddle)
        || (draggingUp && mouseAboveMiddle));
}

const matchupTarget = {
    hover(props, monitor, component) {
        const dragIndex = monitor.getItem().index;
        const hoverIndex = props.index;

        // Make sure we've moved far enough to perform the swap and don't swap
        // with ourselves
        if(dragIndex === hoverIndex
            || !movePastThreshold(monitor, component, hoverIndex, dragIndex)) {
            return;
        }

        props.moveMatchup(1, dragIndex, hoverIndex);

        // From react-dnd example, they insist this is an okay time to mutate
        // monitor for the sake of performance to avoid index computations via
        // lookup
        monitor.getItem().index = hoverIndex;
    }
};

const matchupSource = {
    beginDrag(props) {
        props.setPreview(props.index);
        const item = { id: props.id, index: props.index };
        return item;
    }
};

function collect(connect, monitor) {
    return { connectDragSource: connect.dragSource(),
        connectDragPreview: connect.dragPreview(),
        isDragging: monitor.isDragging() };
}

class Matchup extends Component {
    static propTypes = {
        connectHandle: PropTypes.func,
        id: PropTypes.any.isRequired,
        wager: PropTypes.number.isRequired,
        left: PropTypes.any.isRequired,
        right: PropTypes.any.isRequired,
        name: PropTypes.string.isRequired,
        makePick: PropTypes.func.isRequired,
        preview: PropTypes.bool.isRequired,
    };
    render() {
        const { id,
            wager,
            left,
            right,
            makePick,
            preview } = this.props;
        const identity = elt => elt;
        const connectHandle = this.props.connectHandle || identity;
        // The whole object is the target and serves as the
        // DragPreview (what the user sees as faded near their cursor)
        // We assign just the handle as the drag source so button clikcing and
        // item dragging don't intermix 
        // If the Matchup is not draggable, connectHandle won't do anything
        return (
            <Row id={ id }>
                { connectHandle(
                    <div> <MatchupHandle wager={ wager } name={ name }/></div>
                )}
                <Pick pickdata={ left }
                    gameid={id}
                    makePick={makePick}
                    preview={preview}
                />
                <Pick pickdata={ right }
                    gameid={id}
                    makePick={makePick}
                    preview={preview}
                />
            </Row>
        );
    }
}

class DragableMatchup extends Component {
    static propTypes = {
        connectDragSource: PropTypes.func.isRequired,
        connectDropTarget: PropTypes.func.isRequired,
        connectDragPreview: PropTypes.func.isRequired,
        index: PropTypes.number.isRequired,
        wager: PropTypes.number.isRequired,
        id: PropTypes.any.isRequired,
        left: PropTypes.any.isRequired,
        right: PropTypes.any.isRequired,
        name: PropTypes.string.isRequired,
        moveMatchup: PropTypes.func.isRequired,
        setPreview: PropTypes.func.isRequired,
        makePick: PropTypes.func.isRequired,
        isDragging: PropTypes.bool.isRequired
    }

    componentDidMount() {
        // Use an empty drag image since we will be creating our own preview
        this.props.connectDragPreview(getEmptyImage(),
            { captureDraggingState: true }
        );
    }

    render() {
        const { isDragging,
            connectDragSource,
            connectDropTarget } = this.props;
        const opacity = isDragging ? 0 : 1;
        return connectDropTarget(
            <div style={{ opacity }}>
                {this.createMatchup(connectDragSource)}
            </div>
        );
    }

    createMatchup(connectDragSource) {
        const { id,
            wager,
            left,
            right,
            name,
            makePick } = this.props;
        return (<Matchup id={id}
            wager={wager}
            left={left}
            right={right}
            name={name}
            makePick={makePick}
            preview={false}
            connectHandle={connectDragSource}/>
        );
    }
}

// TODO: Update to decorators once stabilized 
// Use class assign until Decorators stabilize
// eslint-disable-next-line no-class-assign
DragableMatchup = DropTarget(Types.MATCHUP, matchupTarget, connect => ({
    connectDropTarget: connect.dropTarget()
}))(DragableMatchup);
// Use class assign until Decorators stabilize
// eslint-disable-next-line no-class-assign
DragableMatchup = DragSource(Types.MATCHUP, matchupSource, collect)(DragableMatchup);

export default Matchup;
//export default Matchup;
export { PickData, MatchupData, DragableMatchup };


