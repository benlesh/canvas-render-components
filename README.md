# Canvas Render Components (alpha)

**Super duper alpha.. Use at your own risk. lol**

The basic idea here is a "react-like" API that will create canvas "components" such that it handles:

1. Events over very specific areas of of the canvas, as defined by components.
2. Communicating state changes between components.
3. Ensuring that only what needs to be rendered is actually rendered.

There's a [playground link here on Stackblitz](https://stackblitz.com/fork/canvas-render-components).

## Known Issues and Missing Features

- **THERE ARE NO TESTS!! (duh, huge red flag!)**
- Missing events:
  - onMouseDown
  - onMouseUp
  - onKeyPress
  - onKeyDown
  - onKeyUp
  - touch events?
- Have yet to figure out focus management scheme
- Screen reader updates
- Components:
  - Ellipse? Circle?
- Do I want to allow transformations (scale, rotate, etc) on other existing components?

## Getting Started

See storybook examples for usage.

Basically:

1. Define a component

```ts
import { defineComp, rect, text } from 'canvas-render-components';

function MyComp(props: MyCompProps, ctx: CanvasRenderingContext2D) => {
    // There are hooks like React, just prefixed with `crc` instead of use:
    const [count, setCount] = crcState(0);

    // You can return other crc elements, like react, but JSX is annoying to hook up
    // So I don't have that in this example:
    return [
        rect({
            x: 10,
            y: 10,
            width: 100,
            height: 100,
            fillStyle: 'blue',
            onClick: () => setCount(count + 1)
        }),
        text({
            x: 10,
            y: 10,
            width: 100,
            text: 'Click Me',
            fillStyle: 'white'
        })
    ];
}

export const myComp = defineComp(MyComp)
```

2. Mount the component to an existing `HTMLCanvasElement`:

```ts
import { myComp } from './MyComp';
import { crc } from 'canvas-render-components';

const canvas = document.querySelector('#my-canvas-id');
crc(canvas, myComp);
```

# API List

Sorry, this isn't really documentation, just the basic idea:

## Utilities

- `crc(canvasElement, crcElement)` - Mount or update an existing canvas element with a crc element
- `defineComp(compFn)` - used to create a more ergonomic means of consuming crc components and returning crc elements when setting up JSX is too annoying (it's always too annoying).

## Components

- `path`: Renders an arbitrary `Path2D`
- `rect`: Renders a rectangle
- `text`: Text rendering (including multiline, singleline, ellipsis overflow, etc)
- `line`: Renders a series of coordinates as connected line segments
- `verticalLine`/`horizontalLine` special components for rendering vertical or horizontal line segments, which includes a bit called `alignToPixelGrid` that allows you to ensure 1px lines are _really_ 1px. (it's a canvas quirk)
- `svgPath`: Renders svg path data as a shape
- `img`: Loads and renders an image
- `g`: A grouping component that allows the group application of transformations such as scale, rotation, etc.
- `clip`: A grouping component that applies a clipping path to everything rendered in its `children`. It ALSO will "clip" events.

## Hooks

- `crcRef` - basically a simplified version of react's `useRef`
- `crcState` - A simplified version of react's `useState`
- `crcMemo` - Basically react's `useMemo`. This is VERY useful for memoizing `Path2D` objects that need to be passed to other hooks. Strongly recommended for that use case.
- `crcWhenChanged` - Looks like react's `useEffect`.. it is **NOT**. It takes a callback that will execute _SYNCHRONOUSLY_ when dependencies change. It also allows the return of a teardown. This is specifically for use cases where one might need to execute some logic only when some dependencies change. **DO NOT USE if you need to _synchronously update some \_state_ when dependencies change, use `crcMemo` instead**.
- `crcCursor` - A hook to allow the setup of CSS cursor (pointer) changes when hovering a given `Path2D`.
- `crcEvent` - A hook for setting up events related to a particular `Path2D` (or if no path is provided, the entire canvas)
- `crcRectPath` - A simplified hook that returns a memoized `Path2D` for a rectangle (A common task).
- `crcLinePath` - A hook for memoized `Path2D` objects from coordinates.
- `crcSvgPath` - A hook for memoized `Path2D` objects from svg path data strings.

# Tips

## Events coming through other rendered things

If you're seeing events "bleeding through" things you've rendered over top of them, you need to use the `clip` component to constrain where the event is allowed to fire. Events are registered separate from rendering anything, they operate on a 2d plain of their own and don't "know" about what pixels are rendered where. The `clip` component keeps track of clipping paths in a context that it will apply to events registered underneath it. Basically, if your event is registered against a path as part of a `clip` components children or descendants, for the event to fire, it must match the event path AND the clipping path. Think of the clipping path as a "mask" of where events underneath it are "allowed" to fire. (It also clips what is rendered)

## Order matters!

The last thing in a list of children will be rendered "on top". Remember that as you're rendering things.

## Perf: More events, more problems.

Events are register and/or unregistered on every render. They're associated with `Path2D` objects, functions that are handlers, and probably some closure and other things. **The more events you have, the slower your render will be**. Full stop. So, "event delegation" can be a useful tool for you. Perhaps what you need to do is use the `crcEvent` hook and register one event against a compound path of some sort. Or maybe register an event against the whole canvas by passing a `undefined` path to `crcEvent`, and then do some of your own math to figure out if it's a hit or not. In any case, if you're registering and unregistring 1,000 event handlers on each render, it's going to add up. Don't do that.

## Perf: Canvas layering

Another technique is to have more than one canvas, one on top of the other. In this way, you can have elements of your scene that are rarely updated rendered on the "bottom" canvas, while your more frequently updated elements are rendered on the "top" canvas. This means less code being executed on each pass.
