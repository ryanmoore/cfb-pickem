
import React from 'react';
import ItemPreview from '../src/ItemPreview';
import renderer from 'react-test-renderer';

describe('ItemPreview', () => {
    // Pull the item we wrote out from the Drag-and-Drop wrapper
    const RawItemPreview = ItemPreview.DecoratedComponent;

    it('should be hidden/null when not dragging', () => {
        const component = renderer.create(
            <RawItemPreview isDragging={false}/>
        );
        let tree = component.toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('should be hidden/null when not dragging even with known offset', () => {
        const component = renderer.create(
            <RawItemPreview isDragging={false} currentOffset={{x:0, y:0}}/>
        );
        let tree = component.toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('should be hidden/null when offset is unknown', () => {
        const component = renderer.create(
            <RawItemPreview isDragging={true} currentOffset={null}/>
        );
        let tree = component.toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('should take the value of the current offset when dragging', () => {
        const component = renderer.create(
            <RawItemPreview isDragging={true} currentOffset={ {x:0, y:0} }/>
        );
        let tree = component.toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('should transform to match current offset when dragging', () => {
        const component = renderer.create(
            <RawItemPreview isDragging={true} currentOffset={ {x:1, y:2} }/>
        );
        let tree = component.toJSON();
        expect(tree).toMatchSnapshot();
    });
});
