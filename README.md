# Canvas Render Components (alpha)

Super duper alpha.. Use at your own risk. lol

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
  - Clipping: A component to define a clipping area? Maybe this could be done with the `g` component?
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

## Hooks

- `crcRef` - basically a simplified version of react's `useRef`
- `crcState` - A simplified version of react's `useState`
- `crcMemo` - Basically react's `useMemo`. This is VERY useful for memoizing `Path2D` objects that need to be passed to other hooks. Strongly recommended for that use case.
- `crcWhenChanged` - Looks like react's `useEffect`.. it is **NOT**. It takes a callback that will execute _SYNCHRONOUSLY_ when dependencies change. It also allows the return of a teardown. This is specifically for use cases where one might need to execute some logic only when some dependencies change. **DO NOT USE if you need to _synchronously update some \_state_ when dependencies change, use `crcMemo` instead**.
- `crcCursor` - A hook to allow the setup of CSS cursor (pointer) changes when hovering a given `Path2D`.
- `crcClick`, `crcDblClick`, `crcMouseMove`, (et al)... Hooks to allow setup of events related to a given `Path2D`.
- `crcRectPath` - A simplified hook that returns a memoized `Path2D` for a rectangle (A common task).
- `crcLinePath` - A hook for memoized `Path2D` objects from coordinates.
- `crcSvgPath` - A hook for memoized `Path2D` objects from svg path data strings.
