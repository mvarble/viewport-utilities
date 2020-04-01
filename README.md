# viewport-utilities

A bunch of utilities for interfacing with the [viewport.js](https://github.com/mvarble/viewport.js) API. 

## API

### singleClick

```js
singleclick$ = mousedown$.compose(singleClick)
```

This is a [xstream](https://github.com/staltz/xstream) operator that takes a stream of `mousedown` events and returns a stream of click events that happened within 50ms and 3 pixels of each `mousedown`.
The intention of this is to separate usual `click` events from those returned by [createDrag](#createdrag).

### createDrag

```js
drag$ = mousedown$.compose(createDrag)
```

This is a [xstream](https://github.com/staltz/xstream) operator that takes a stream of `mousedown` events and returns a stream of streams that match the following diagram.

```
mousedown: |-----x-------------------x------------->

        (createDrag)

mousemove: |-x-------x--x-x----x------------------->
mouseup:   |----------------o-------------o-------->

output:    |-----x-------------------x------------->
                   \                   \
                    --x--x-x-o-|        -----|
```

Note that every stream starts with a `mousedown` event, and ends with the `mouseup` event.
The streams will always output `mousemove` and `mouseup` events from the document, _not_ the DOM element that the `mousedown` events corresponded to.
However, each of these events will have an `isDrag` attribute which will point to the reference of the original `mousedown` event.
Also, these streams are not provided as arguments of the operator; they are just in the diagram for explanation.

Note in the example above, we have that the output streams will be empty if no `mousemove` occurs between 'mousedown' and 'mouseup' events.
The rationale behind this is that:

1. Clicks are not drags
2. Every nonempty drag starts with a 'mousemove'.
3. Every nonempty drag ends with a 'mouseup'. 


### renderBox

```js
renderBox(context, frame, options)
```

This function will use the provided `context` to perform an imperative render to the canvas with said context.
The render will display a rectangle with vertices having coordinates [-1, -1] and [1, 1] with respect to `frame`.
By providing an object `options` with `options.fill` and `options.stroke`, this will decide whether to do the respective operations in the render.
The `options` object is optional, and it is assumed of its attributes both are true.

### withWindow

```js
NewComponent = withWindow(FrameComponent, options)
```

By providing a component `FrameComponent` that is managing a frame using the [withState](https://cycle.js.org/api/state.html#cycle-state-source) API, this will return a new component which wraps the `oldState` into an object of the form:

```js
{
  type: 'root',
  width: w,
  height: h,
  children: [
    { type: 'window', worldMatrix: [...] },
    oldState
  ],
}
```

This object will be such that its first child frame has a world matrix such that [-1, -1] and [1, 1] are the bottom-left and top-right coordinates of the canvas, respectively.
Moreover, this component will merge reducers into the state stream of `FrameComponent` that trigger resize calculations and allow for navigating its frame within the window.

The returned `NewComponent` will be such that there is a new source, a stream of desired dimensions `[w, h]` of the component.
The resize will be calculated such that the child frame will be scaled uniformly in both dimensions with a scale that requires the least amount of distortion in accomodating the new dimension ratio `w/h`.

The `options` object sets the keys of the sources/sinks `NewComponent` necessarily uses.
Its keys are the following:

  - `state`: This is the desired key of the `withState` source/sinks. By default, it is `'state'`.
  - `dimensions`: This is the desired source key of the stream of desired dimensions. By default, it is `'dimensions'`.
  - `frameSource`: This is the desired source key of the mounted [FrameSource](https://github.com/mvarble/viewport.js#framesource) instance is required for delivering mouse intent for panning/resizing the child frame. By default, it is `'frameSource'`.

### resizeFrame

```js
newFrame = resizeFrame(frame, width, height)
```

This will take a state `frame` of the form of [withWindow](#withwindow) and return `newFrame`, accomodated to the new dimensions `width` and `height`.
This is used in the reducer of the component returned by said wrapper.

### changeZoom

```js
newFrame = changeZoom(event, frame)
```

This will take a `wheel` event `event` and a state `frame` of the form of [withWindow](#withwindow) and return `newFrame`, in which `frame.children[1]` has been scaled according to the direction of the wheel move. 
This is used in the reducer of the component returned by said wrapper.

### parentDims

```js
dimensions$ = element$.compose(parentDims)
```

This is a [xstream](https://github.com/staltz/xstream) operator that takes a stream of DOM elements and returns a stream of `[offsetWidth, offsetHeight]` dimensions corresponding to the parent of the element in the stream.
The initial dimensions are returned with the delivery of the element of the stream `element$`; thereafter, window `resize` events will pipe to this stream *only when the dimensions have changed*.
To this end, you may think of this as a flattened stream of streams of the form

```js
|---[initialWidth, initialHeight]----[newWidth, newHeight]--[newWidth, newHeight]--->
```

> **Warning.** If you declare the canvas size dependent on this stream (and make your imperative render function resize accordingly) and the parent does not have fixed sizing, you may cause an indefinite loop of 
>
> parent dimensions change &rarr; parentDims update &rarr; canvas dimensions change &rarr; parent dimensions change &rarr; ...
>
> so tread lightly with setting the parent's dimensions in some fixed way (say, with CSS `vw` and `vh`).
