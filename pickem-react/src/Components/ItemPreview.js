
import React, { PropTypes, Component }  from 'react';
import DragLayer from 'react-dnd/lib/DragLayer';

const layerStyles = {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: 100,
    left: 0,
    top: 0,
    width: '100%',
    height: '100%'
};

function collect(monitor) {
    return {
        currentOffset: monitor.getSourceClientOffset(),
        isDragging: monitor.isDragging()
    };
}

function stylePreview(offset) {
    // Hide if not dragging
    if(!offset) {
        return { display: 'none' };
    }

    const transform = `translate(${offset.x}px, ${offset.y}px)`;
    return { pointerEvents: 'none',
        transform: transform,
        WebkitTransform: transform
    };
}

class ItemPreview extends Component {
    static propTypes = {
        currentOffset: PropTypes.shape({
            x: PropTypes.number.isRequired,
            y: PropTypes.number.isRequired,
        }),
        isDragging: PropTypes.bool.isRequired
    };

    render() {
        const { currentOffset, isDragging, children } = this.props;
        if(!isDragging) {
            return null;
        }
        return (
            <div style={ layerStyles }>
                <div style={stylePreview(currentOffset)}>
                    { children }
                </div>
            </div>
        );
    }
}

export default DragLayer(collect)(ItemPreview);
