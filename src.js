/**
 * viewport-utilities
 *
 * This source file creates and exports all the utilities we want from the 
 * package
 */

// module dependencies: npm packages
import xs from 'xstream';
import fromEvent from 'xstream/extra/fromEvent';
import dropRepeats from 'xstream/extra/dropRepeats';
import isolate from '@cycle/isolate';
import {
  locsFrameTrans,
  identityFrame,
  scaledFrame,
  translatedFrame,
  transformedByMatrix,
} from '@mvarble/frames.js';

export {
  relativeMousePosition,
  singleClick,
  createDrag,
  renderBox,
  withWindow,
  putInWindow,
  resizeFrame,
  changeZoom,
  parentDims,
};
export default {
  relativeMousePosition,
  singleClick,
  createDrag,
  renderBox,
  withWindow,
  putInWindow,
  resizeFrame,
  changeZoom,
  parentDims,
};

/**
 * relativeMousePosition:
 *
 * Function which returns the mouse position relative to the target of the click
 * event; if the appendended event at the `isDrag` attribute is existent, we 
 * use that target in the relative positioning
 */
function relativeMousePosition(event) {
  const target = event.isDrag ? event.isDrag.target : event.target;
  const rect = target.getBoundingClientRect();
  return [
    (event.clientX - rect.left) / (rect.right - rect.left) * target.width,
    (event.clientY - rect.top) / (rect.bottom - rect.top) * target.height,
  ];
};


/**
 * singleClick:
 *
 * This is a xstream operator that takes a stream of 'mousedown' events
 * and returns a stream of 'click' events that happened within 250ms of the
 * inputted 'mousedown'. These click streams will have the `event.frame` and
 * `event.treeKeys` appended from the initializing `mousedown` event.
 */
const appendOver = (event, downEvent) => {
  event.frame = downEvent.frame;
  event.treeKeys = downEvent.treeKeys;
  return event;
}
function singleClick(mousedown$) {
  if (typeof document === 'undefined') return xs.empty();
  return mousedown$.map(downE => (
    fromEvent(document, 'click').endWhen(xs.periodic(250)).filter(upE => (
      Math.abs(upE.clientX - downE.clientX) < 3
      && Math.abs(upE.clientY - downE.clientY) < 3
    )).map(e => appendOver(e, downE)))
  ).flatten();
}

/**
 * createDrag:
 *
 * This is a xstream operator that takes a stream of 'mousedown' events and 
 * returns a stream of streams that match the following diagram.
 *
 * mousedown: |-----x-------------------x------------->
 *
 * (createDrag)
 *
 * mousemove: |-x-------x--x-x----x------------------->
 * mouseup:   |----------------o-------------o-------->
 *
 * output:    |-----x-------------------x------------->
 *                   \                   \
 *                    --x--x-x-o-|        -----|
 *
 * Note that every stream starts with a 'mousedown' event, and ends with the 
 * 'mouseup' event. The streams will always output 'mousemove' and 'mouseup' 
 * events from the document (not by DOM element that triggered 'mousedown').
 * Note in the example above, we have that the output streams will be empty
 * if no 'mousemove' occurs between 'mousedown' and 'mouseup' events. Thus
 *   
 *   (1) Clicks are not drags
 *   (2) Every nonempty drag starts with a 'mousemove'.
 *   (3) Every nonempty drag ends with a 'mouseup'. 
 */
const appendDrag = (e, e1) => {
  e1.isDrag = e;
  return e1;
};

function createDrag(startStream$) {
  // if there is no document, we return an empty stream
  if (typeof document === 'undefined') return xs.empty();

  // create the output stream
  return startStream$.map(e => {
    const move$ = fromEvent(document, 'mousemove').map(e1 => appendDrag(e, e1));
    const up$ = fromEvent(document, 'mouseup').map(e1 => appendDrag(e, e1));
    return xs.create({
      start: listener => {
        let hasMoved = false;
        xs.merge(move$.endWhen(up$), up$.take(1)).addListener({
          next: e => {
            if (e.type === 'mousemove' || hasMoved) {
              hasMoved = true;
              listener.next(e);
            }
          },
          error: err => listener.error(err),
          complete: () => listener.complete(),
        });
      },
      stop: () => {}
    });
  });
}

/**
 * renderBox:
 *
 * This is a function ((context, frame) => void) which renders a box 
 * corresponding to the coordinates [-1, -1], [1, 1] in the frame.
 */
function renderBox(context, frame, options) {
  const { fill, stroke } = options || {};
  const locs = locsFrameTrans(
    [[-1, -1], [1, -1], [1, 1], [-1, 1]], 
    frame,
    identityFrame
  );
  context.beginPath();
  context.moveTo(...locs[0]);
  [1, 2, 3, 0].forEach(i => context.lineTo(...locs[i]));
  if (fill) { context.fill(); }
  if (stroke) { context.stroke(); }
}

/**
 * withWindow:
 *
 * a component wrapper that wraps the frame state and puts the state in a plane
 * which resizes on canvas resize.
 */
function withWindow(PlaneFrame, options) {
  // get the tags the user wants for state reducers and dimension changes
  let { state, dimensions, frameSource } = (options || {});
  if (!state) { state = 'state'; }
  if (!dimensions) { dimensions = 'dimensions'; }
  if (!frameSource) { frameSource = 'frameSource'; }

  // wrap the component
  function RootFrame(sources) {
    // isolate the state into the second child of the root
    const isolation = {
      [state]: {
        get: state => state.children[1],
        set: (state, childState) => ({ 
          ...state,
          children: [state.children[0], childState],
        }),
      },
      '*': null
    };
    const sink = isolate(PlaneFrame, isolation)(sources);

    // add a reducer for window resizes
    const resize$ = sources[dimensions]
      .map(dims => (frame => resizeFrame(frame, ...dims)));

    // add a reducer for panning
    const pan$ = sources[frameSource].select(frame => !frame)
      .events('mousedown')
      .compose(createDrag)
      .flatten()
      .map(event => (frame => isolation[state].set(
        frame,
        translatedFrame(
          frame.children[1], 
          [event.movementX, event.movementY],
          identityFrame,
        )
      )))

    // add a reducer for zoom
    const zoom$ = sources[frameSource].select(frame => !frame)
      .events('wheel')
      .map(event => (frame => isolation[state].set(
        frame,
        changeZoom(event, frame.children[1])
      )));

    return { 
      ...sink,
      [state]: xs.merge(sink[state], resize$, pan$, zoom$),
    };
  }

  // return accordingly
  return RootFrame;
}


/**
 * putInWindow:
 *
 * a reducer that wraps a frame in the context of a canvas with specified 
 * width and height
 */
function putInWindow(frame, width, height) {
  return {
    type: 'root',
    width,
    height,
    children: [
      { 
        type: 'window',
        worldMatrix: [
          [width/2, 0,         width/2],
          [0,       -height/2, height/2],
          [0,       0,         1],
        ],
      },
      frame,
    ]
  };
}

/**
 * resizeFrame:
 *
 * This will take our state formed by `withWindow` and resize the frames to 
 * match the dimensions
 */
function resizeFrame(frame, width, height) {
  // get the old data
  const oldWidth = frame.width || 1;
  const oldHeight = frame.height || 1;

  // get the relative scale
  const scales = [width / oldWidth, height / oldHeight];
  const logScales = scales.map(s => Math.abs(Math.log(s)));
  const scale = scales[logScales.indexOf(Math.min(...logScales))];

  // transform the frame according to the resize
  const view = transformedByMatrix(
    frame.children[1],
    [
      [scale, 0, (width - oldWidth)/2],
      [0, scale, (height - oldHeight)/2],
      [0, 0, 1]
    ],
    { worldMatrix: [[1, 0, oldWidth/2], [0, 1, oldHeight/2], [0, 0, 1]] }
  );

  // return the new frame
  return putInWindow(view, width, height);
}

/**
 * changeZoom:
 *
 * This will resize a frame according to a mouse wheel event
 */
function changeZoom(event, frame) {
  // create a frame based on the event
  const [x, y] = relativeMousePosition(event);
  const mouseFrame = { worldMatrix: [[1, 0, x], [0, -1, y], [0, 0, 1]] };

  // get the scale of the transformation from the event
  const scale = Math.pow(1.1, -event.deltaY);

  // return a scaled frame based off of the event
  return scaledFrame(frame, [scale, scale], mouseFrame);
}

/**
 * parentDims:
 *
 * This is an xstream operator that will take a stream of elements, and return
 * a stream of [offsetWidth, offsetHeight] parent resizes.
 */
function parentDims(element$) {
  const resizes$ = xs.merge(xs.of(undefined), fromEvent(window, 'resize'));
  return xs.combine(element$, resizes$)
    .filter(([el]) => el && el.parentNode)
    .map(([el]) => [el.parentNode.offsetWidth, el.parentNode.offsetHeight])
    .compose(dropRepeats(([a, b], [c, d]) => a === c && b === d));
}
