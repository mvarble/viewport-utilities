/**
 * viewport-utilities
 *
 * This source file creates and exports all the utilities we want from the 
 * package
 */

// module dependencies: npm packages
import xs from 'xstream';
import fromEvent from 'xstream/extra/fromEvent';
import { locsFrameTrans, identityFrame } from '@mvarble/frames.js';

export {
  singleClick,
  createDrag,
  renderBox,
};
export default {
  singleClick,
  createDrag,
  renderBox,
};

/**
 * singleClick
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
 * createDrag
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
 * renderBox
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
