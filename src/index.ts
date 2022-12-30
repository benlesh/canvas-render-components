/**
 * CRC - Canvas Render Components (alpha)
 *
 * MIT License
 *
 * Copyright 2020 Ben Lesh <ben@benlesh.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
 * and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions
 * of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

export interface CompEl<P = any> {
	type: CompFn<P>;
	props: P;
}

export type CompFn<P> = (
	props: P,
	ctx: CanvasRenderingContext2D,
) => CompEl[] | CompEl | void;

interface CompRefs<P> {
	id: string;
	element: CompEl<P>;
	refs: any[];
}

let refsStore = new WeakMap<HTMLCanvasElement, Map<string, CompRefs<any>>>();
let roots = new WeakMap<HTMLCanvasElement, CompEl<any>>();
let renderIds = new WeakMap<HTMLCanvasElement, number>();

let _currentRefs: Map<string, CompRefs<any>> | undefined = undefined;
let _currentRefsEntry: CompRefs<any> | undefined = undefined;
let _currentCanvas: HTMLCanvasElement | undefined = undefined;
let _currentIsMounting = false;
let _currentHookIndex = 0;
let _currentRenderContext: CanvasRenderingContext2D | undefined = undefined;
let _unseenIds: Set<string> | undefined = undefined;

/**
 * Useful for testing and HMR.
 * DO NOT USE IN PROD
 */
export function clearSharedState() {
	refsStore = new WeakMap<HTMLCanvasElement, Map<string, CompRefs<any>>>();
	roots = new WeakMap<HTMLCanvasElement, CompEl<any>>();
	renderIds = new WeakMap<HTMLCanvasElement, number>();
	anonElementNames = new WeakMap<any, string>();
	_unseenIds = undefined;
	_currentRefs = undefined;
	_currentRefsEntry = undefined;
	_currentCanvas = undefined;
	_currentIsMounting = false;
	_currentHookIndex = 0;
	_currentRenderContext = undefined;
}

/**
 * Mounts or updates a canvas render component on a given HTMLCanvasElement
 * @param canvas The canvas to render on
 * @param element The CRC element to render
 */
export function crc<P>(canvas: HTMLCanvasElement, element: CompEl<P>) {
	if (!refsStore.has(canvas)) {
		const refs = new Map<string, CompRefs<P>>();
		refsStore.set(canvas, refs);
	}
	update(canvas, element);
}

/**
 * Creates a simple structure representing a component to be rendered.
 * DOES NOT RENDER.
 * @param comp Ther render function for a component
 * @param props The props to pass to that render function on render
 * @returns A structure that represents a component to be mounted or updated during render
 */
export function createElement<P>(comp: CompFn<P>, props: P): CompEl<P> {
	return { type: comp, props };
}

/**
 * Used to convert a component render function to a function that will return a component element.
 * This is useful for now because setting up JSX is still annoying.
 * @param compFn A component to create a simplfied function for
 */
export function defineComp<P>(compFn: CompFn<P>) {
	return (props: P) => createElement(compFn, props);
}

/**
 * Gets the root element for a canvas and renders it. This is the
 * entry point for rendering the entire tree.
 * @param canvas The canvas to render on
 */
function executeRender(canvas: HTMLCanvasElement) {
	renderIds.delete(canvas);
	try {
		_currentCanvas = canvas;
		_currentRefs = refsStore.get(canvas);
		const rootElement = roots.get(canvas)!;
		const ctx = get2dContext(canvas);
		_currentRenderContext = ctx;
		_unseenIds = new Set(_currentRefs!.keys());
		const id = 'root';
		_unseenIds.delete(id);
		render(rootElement, id);
		for (const id of _unseenIds) {
			_currentRefs.delete(id);
		}
	} finally {
		_currentCanvas = undefined;
		_currentRefs = undefined;
		_currentRenderContext = undefined;
		_unseenIds = undefined;
	}
}

/**
 *
 * @param canvas The canvas with CRC mounted on it to update
 * @param element The optional element to update as the root element of that canvas.
 */
export function update<P>(canvas: HTMLCanvasElement, element?: CompEl<P>) {
	if (element) {
		roots.set(canvas, element);
	}

	if (!roots.has(canvas) || !refsStore.has(canvas)) {
		throw new Error('Canvas does not have CRC mounted.');
	}

	if (!renderIds.has(canvas)) {
		renderIds.set(
			canvas,
			requestAnimationFrame(() => executeRender(canvas)),
		);
	}
}

let anonElementNames = new WeakMap<any, string>();

let anon = 0;

function getAnonElemName(fn: any) {
	if (!anonElementNames.has(fn)) {
		anonElementNames.set(fn, `Anon${anon++}`);
	}
	return anonElementNames.get(fn)!;
}

function getElementTypeName(element: CompEl) {
	return (
		element.props.key || element.type.name || getAnonElemName(element.type)
	);
}

function render<P>(element: CompEl<P>, parentId: string) {
	try {
		const id = parentId + ':' + getElementTypeName(element);
		_unseenIds.delete(id);
		_currentIsMounting = !_currentRefs!.has(id);
		if (_currentIsMounting) {
			_currentRefs!.set(id, {
				id,
				element,
				refs: [],
			});
		}

		_currentRefsEntry = _currentRefs!.get(id)!;
		_currentHookIndex = 0;

		const ctx = _currentRenderContext!;
		ctx.save();
		const result = element.type(element.props, ctx);
		if (result) {
			if (Array.isArray(result)) {
				for (let i = 0; i < result.length; i++) {
					const child = result[i];
					render(child, id + ':' + i);
				}
			} else {
				render(result, id);
			}
		}
		ctx.restore();
	} finally {
		_currentIsMounting = false;
		_currentRefsEntry = undefined;
		_currentHookIndex = 0;
	}
}

interface CRCRef<T> {
	current: T | undefined;
}

/**
 * Hook: Creates a reference object, similar to React's useRef.
 * @param init The initial reference value
 * @returns A reference with a `current` property containing the value
 */
export function crcRef<T>(init?: T): CRCRef<T> {
	if (_currentIsMounting) {
		_currentRefsEntry!.refs.push({
			type: 'ref',
			current: init,
		});
	}

	return _currentRefsEntry!.refs[_currentHookIndex++];
}

/**
 * Hook: creates a tuple of state and a state setter. Setting the state with the
 * state setter will cause the entire canvas CRC instance to be scheduled for
 * rerender. If you set the state multiple times before the next animation frame,
 * it will only rerender with whatever the most recent state is as of that animation frame.
 * @param init The initial state
 * @returns A tuple with the state, and a setter function
 */
export function crcState<T>(init?: T): readonly [T, (update: T) => void] {
	if (_currentIsMounting) {
		const ref = {
			type: 'state',
			value: init,
			setter,
		};

		const canvas = _currentCanvas;

		function setter(newValue: T) {
			ref.value = newValue;
			update(canvas!);
		}

		_currentRefsEntry!.refs.push(ref);
	}

	const ref = _currentRefsEntry!.refs[_currentHookIndex++];
	return [ref.value, ref.setter] as const;
}

/**
 * Hook: creates a memoized value, similar to React's `useMemo`.
 * @param create The factory to create the memoized value.
 * @param deps The deps to check to see if the memoized value needs to be updated.
 * @returns The memoized value
 */
export function crcMemo<T>(create: () => T, deps: any[]): T {
	const ref = crcRef<T>();

	// NOTE: sync updates
	crcWhenChanged(() => {
		ref.current = create();
	}, deps);

	return ref.current as T;
}

/**
 * Does a shallow diff check on the deps. If they've changed, it will synchronously
 * call the provided call back. This is not like useEffect, but it's useful when
 * a developer wants to diff a value. Also allows for a teardown to be returned that
 * is called when deps change (very, very similar to useEffect, just ALWAYS synchronous).
 * If you have work in here that only sets state, you should be using {@link crcMemo}
 * instead.
 * @param callback The SYNCHRONOUS callback when the deps have changed
 * @param deps The deps to check for changes.
 */
export function crcWhenChanged(
	callback: () => (() => void) | void,
	deps?: any[],
) {
	if (_currentIsMounting) {
		const ref = {
			type: 'whenChanged',
			lastDeps: undefined,
			teardown: undefined,
		};

		_currentRefsEntry!.refs.push(ref);
	}

	const hookIndex = _currentHookIndex++;
	const ref = _currentRefsEntry!.refs[hookIndex];
	if (!ref.lastDeps || !deps || !shallowArrayEquals(deps, ref.lastDeps)) {
		ref.teardown?.();
		ref.lastDeps = deps;
		ref.teardown = callback();
	}
}

interface CRCMouseEvent {
	x: number;
	y: number;
	originalEvent: MouseEvent;
}

function crcBasicMouseEvent({
	type,
	path,
	handler,
	fill = false,
	lineWidth = 0,
}: {
	type: 'click' | 'dblclick' | 'mousemove' | 'contextmenu';
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineWidth?: number;
}) {
	crcWhenChanged(() => {
		const ac = new AbortController();
		const transform = _currentRenderContext!.getTransform();
		_currentCanvas!.addEventListener(
			type,
			(e) => {
				const canvas = e.target as HTMLCanvasElement;
				const [x, y] = getMouseCoordinates(e);
				const ctx = get2dContext(canvas);
				ctx.setTransform(transform);
				if (
					(fill && ctx.isPointInPath(path, x, y)) ||
					(lineWidth > 0 && ctx.isPointInStroke(path, x, y))
				) {
					handler({ x, y, originalEvent: e });
				}
			},
			{ signal: ac.signal },
		);
		return () => {
			ac.abort();
		};
	}, [type, path, handler, fill, lineWidth]);
}

/**
 * Hook: For wiring up click events that correspond to a given Path.
 * NOTE: If the path reference changes between, the click event will be
 * torn down and re-registered. Be sure use the same instance of a Path if
 * it doesn't change. {@link crcMemo} may be useful for this.
 */
export function crcClick(config: {
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineWidth?: number;
}) {
	crcBasicMouseEvent({
		...config,
		type: 'click',
	});
}

/**
 * Hook: For wiring up double click events that correspond to a given Path.
 * NOTE: If the path reference changes between, the click event will be
 * torn down and re-registered. Be sure use the same instance of a Path if
 * it doesn't change. {@link crcMemo} may be useful for this.
 */
export function crcDblClick(config: {
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineWidth?: number;
}) {
	crcBasicMouseEvent({
		...config,
		type: 'dblclick',
	});
}

/**
 * Hook: For wiring up right-click events that correspond to a given Path.
 * NOTE: If the path reference changes between, the click event will be
 * torn down and re-registered. Be sure use the same instance of a Path if
 * it doesn't change. {@link crcMemo} may be useful for this.
 */
export function crcContextMenu(config: {
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineWidth?: number;
}) {
	crcBasicMouseEvent({
		...config,
		type: 'contextmenu',
	});
}

/**
 * Hook: For wiring up mouse move events that correspond to a given Path.
 * NOTE: If the path reference changes between, the click event will be
 * torn down and re-registered. Be sure use the same instance of a Path if
 * it doesn't change. {@link crcMemo} may be useful for this.
 */
export function crcMouseMove(config: {
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineWidth?: number;
}) {
	crcBasicMouseEvent({
		...config,
		type: 'mousemove',
	});
}

/**
 * Hook: For wiring up mouse over events that correspond to a given Path.
 * NOTE: If the path reference changes between, the click event will be
 * torn down and re-registered. Be sure use the same instance of a Path if
 * it doesn't change. {@link crcMemo} may be useful for this.
 */
export function crcMouseOver(config: {
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineWidth?: number;
}) {
	crcMouseOverOrOut({
		...config,
		type: 'mouseover',
	});
}

/**
 * Hook: For wiring up mouse out events that correspond to a given Path.
 * NOTE: If the path reference changes between, the click event will be
 * torn down and re-registered. Be sure use the same instance of a Path if
 * it doesn't change. {@link crcMemo} may be useful for this.
 */
export function crcMouseOut(config: {
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineWidth?: number;
}) {
	crcMouseOverOrOut({
		...config,
		type: 'mouseout',
	});
}

function crcMouseOverOrOut({
	type,
	path,
	handler,
	fill = false,
	lineWidth = 0,
}: {
	type: 'mouseover' | 'mouseout';
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineWidth?: number;
}) {
	const overRef = crcRef(false);

	crcWhenChanged(() => {
		const ac = new AbortController();
		const transform = _currentRenderContext!.getTransform();

		_currentCanvas!.addEventListener(
			'mousemove',
			(e) => {
				const canvas = e.target as HTMLCanvasElement;
				const [x, y] = getMouseCoordinates(e);
				const ctx = get2dContext(canvas);
				ctx.setTransform(transform);
				const isOver =
					(fill && ctx.isPointInPath(path, x, y)) ||
					(lineWidth > 0 && ctx.isPointInStroke(path, x, y));

				const wasOver = overRef.current;
				if (isOver) {
					overRef.current = true;
					if (type === 'mouseover' && !wasOver) {
						handler({
							x,
							y,
							originalEvent: e,
						});
					}
				} else {
					overRef.current = false;
					if (type === 'mouseout' && wasOver) {
						handler({
							x,
							y,
							originalEvent: e,
						});
					}
				}
			},
			{
				signal: ac.signal,
			},
		);

		_currentCanvas!.addEventListener(
			'mouseout',
			(e) => {
				overRef.current = false;
				if (type === 'mouseout') {
					const [x, y] = getMouseCoordinates(e);
					handler({
						x,
						y,
						originalEvent: e,
					});
				}
			},
			{
				signal: ac.signal,
			},
		);

		return () => ac.abort();
	}, [type, path, handler, fill, lineWidth]);
}

/**
 * Hook: For wiring up changes to the CSS cursor style while over a corresponding path.
 * NOTE: If the path reference changes between, the click event will be
 * torn down and re-registered. Be sure use the same instance of a Path if
 * it doesn't change. {@link crcMemo} may be useful for this.
 */
export function crcCursor({
	path,
	style,
	fill = false,
	lineWidth = 0,
}: {
	path: Path2D;
	style: string;
	fill?: boolean;
	lineWidth?: number;
}) {
	crcMouseOver({
		path,
		handler: (e) => {
			const canvas = e.originalEvent.target as HTMLCanvasElement;
			canvas.style.cursor = style;
		},
		fill,
		lineWidth,
	});

	crcMouseOut({
		path,
		handler: (e) => {
			const canvas = e.originalEvent.target as HTMLCanvasElement;
			canvas.style.removeProperty('cursor');
		},
		fill,
		lineWidth,
	});
}

function getMouseCoordinates(event: MouseEvent): readonly [number, number] {
	const target = event.target as HTMLElement;
	const bounds = target.getBoundingClientRect();
	const x = event.clientX - bounds.left;
	const y = event.clientY - bounds.top;
	return [x, y] as const;
}

function shallowArrayEquals<T>(arr1: T[], arr2: T[]): boolean {
	if (arr1.length !== arr2.length) {
		return false;
	}
	for (let i = 0; i < arr1.length; i++) {
		if (arr1[i] !== arr2[i]) {
			return false;
		}
	}
	return true;
}

function get2dContext(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Unable to get 2d context!');
	}
	return ctx;
}

export interface CRCBasicMouseEvents {
	onClick?: (e: CRCMouseEvent) => void;
	onDblClick?: (e: CRCMouseEvent) => void;
	onMouseMove?: (e: CRCMouseEvent) => void;
	onMouseOver?: (e: CRCMouseEvent) => void;
	onMouseOut?: (e: CRCMouseEvent) => void;
	onContextMenu?: (e: CRCMouseEvent) => void;
}

type FillStyle = CanvasRenderingContext2D['fillStyle'];
type StrokeStyle = CanvasRenderingContext2D['strokeStyle'];

export interface AlphaProps {
	alpha?: number;
}

export interface StrokeStyleProps {
	strokeStyle?: StrokeStyle;
	lineWidth?: number;
}

export interface FillStyleProps {
	fillStyle?: FillStyle;
}

export interface CursorStyleProps {
	cursor?: string;
}

export interface PathProps
	extends CRCBasicMouseEvents,
		FillStyleProps,
		StrokeStyleProps,
		CursorStyleProps,
		AlphaProps {
	path: Path2D;
}

function Path(props: PathProps, ctx: CanvasRenderingContext2D) {
	const { alpha, path, fillStyle, strokeStyle, lineWidth } = props;

	if (alpha) {
		ctx.globalAlpha = ctx.globalAlpha * alpha;
	}

	if (fillStyle) {
		ctx.fillStyle = fillStyle;
		ctx.fill(path);
	}

	if (strokeStyle && lineWidth && lineWidth > 0) {
		(ctx.strokeStyle = strokeStyle), (ctx.lineWidth = lineWidth);
		ctx.stroke(path);
	}

	const {
		onClick,
		onContextMenu,
		onDblClick,
		onMouseMove,
		onMouseOut,
		onMouseOver,
	} = props;

	if (onClick) {
		crcClick({
			path,
			handler: onClick,
			fill: !!fillStyle,
			lineWidth,
		});
	}

	if (onContextMenu) {
		crcContextMenu({
			path,
			handler: onContextMenu,
			fill: !!fillStyle,
			lineWidth,
		});
	}

	if (onDblClick) {
		crcDblClick({
			path,
			handler: onDblClick,
			fill: !!fillStyle,
			lineWidth,
		});
	}

	if (onMouseOver) {
		crcMouseOver({
			path,
			handler: onMouseOver,
			fill: !!fillStyle,
			lineWidth,
		});
	}

	if (onMouseMove) {
		crcMouseMove({
			path,
			handler: onMouseMove,
			fill: !!fillStyle,
			lineWidth,
		});
	}

	if (onMouseOut) {
		crcMouseOut({
			path,
			handler: onMouseOut,
			fill: !!fillStyle,
			lineWidth,
		});
	}

	const { cursor } = props;

	if (cursor) {
		crcCursor({ path, style: cursor, fill: !!fillStyle, lineWidth });
	}
}

/**
 * Creates a renderable Path component element.
 */
export const path = defineComp(Path);

export interface RectProps
	extends CRCBasicMouseEvents,
		FillStyleProps,
		StrokeStyleProps,
		AlphaProps,
		CursorStyleProps {
	x: number;
	y: number;
	width: number;
	height: number;
}

function Rect(props: RectProps, ctx: CanvasRenderingContext2D) {
	const { x, y, width, height, ...pathProps } = props;
	const rectPath = crcRectPath(x, y, width, height);
	return Path(
		{
			...pathProps,
			path: rectPath,
		},
		ctx,
	);
}

/**
 * Creates a renderable Rect component element.
 */
export const rect = defineComp(Rect);

export interface LineProps extends CRCBasicMouseEvents, StrokeStyleProps {
	coords: [number, number][];
}

function Line(props: LineProps, ctx: CanvasRenderingContext2D) {
	const { coords, ...pathProps } = props;
	const linePath = crcLinePath(coords);

	return Path(
		{
			...pathProps,
			path: linePath,
		},
		ctx,
	);
}

/**
 * Creates a renderable Line component element.
 */
export const line = defineComp(Line);

export interface VerticalLineProps
	extends CRCBasicMouseEvents,
		StrokeStyleProps {
	x: number;
	top?: number;
	bottom?: number;
	alignToPixelGrid?: boolean;
}

function VerticalLine(props: VerticalLineProps, ctx: CanvasRenderingContext2D) {
	const {
		x: initialX,
		top = 0,
		bottom = ctx.canvas.height,
		alignToPixelGrid = false,
		...lineProps
	} = props;
	const x = alignToPixelGrid
		? Math.round(initialX) - ((props.lineWidth ?? 0) % 1)
		: initialX;
	const coords: [number, number][] = [
		[x, top],
		[x, bottom],
	];
	return Line(
		{
			coords,
			...lineProps,
		},
		ctx,
	);
}

/**
 * Creates a renderable VerticalLine component element.
 */
export const verticalLine = defineComp(VerticalLine);

export interface HorizontalLineProps
	extends CRCBasicMouseEvents,
		StrokeStyleProps {
	y: number;
	left?: number;
	right?: number;
	alignToPixelGrid?: boolean;
}

function HorizontalLine(
	props: HorizontalLineProps,
	ctx: CanvasRenderingContext2D,
) {
	const {
		y: initialY,
		left = 0,
		right = ctx.canvas.width,
		alignToPixelGrid = false,
		...lineProps
	} = props;
	const y = alignToPixelGrid
		? Math.round(initialY) - ((props.lineWidth ?? 0) % 1)
		: initialY;

	const coords: [number, number][] = [
		[left, y],
		[right, y],
	];

	return Line(
		{
			coords,
			...lineProps,
		},
		ctx,
	);
}

/**
 * Creates a renderable HorizontalLine component element
 */
export const horizontalLine = defineComp(HorizontalLine);

export interface ImgProps extends CRCBasicMouseEvents, AlphaProps {
	image: HTMLImageElement;
	x: number;
	y: number;
	width?: number;
	height?: number;
}

function Img(props: ImgProps, ctx: CanvasRenderingContext2D) {
	const {
		alpha,
		image,
		x,
		y,
		width = image.width,
		height = image.height,
		...otherProps
	} = props;

	if (alpha) {
		ctx.globalAlpha = ctx.globalAlpha * alpha;
	}

	ctx.drawImage(image, x, y, width, height);
	const imagePath = crcRectPath(x, y, width, height);

	// For event handling.
	return Path(
		{
			path: imagePath,
			...otherProps,
		},
		ctx,
	);
}

/**
 * Creates a renderable Img component element.
 */
export const img = defineComp(Img);

/**
 * Creates a memoized Path2D for a rectangle. Useful when
 * defining events efficiently.
 * @returns A memoized Path2D
 */
export function crcRectPath(
	x: number,
	y: number,
	width: number,
	height: number,
): Path2D {
	return crcMemo(() => {
		const path = new Path2D();
		path.rect(x, y, width, height);
		return path;
	}, [x, y, width, height]);
}

/**
 * Creates a memoized Path2D for a set of line coordinates.
 * @returns A memoized Path2D
 */
export function crcLinePath(coords: [number, number][]): Path2D {
	return crcMemo(() => {
		const path = new Path2D();
		for (let i = 0; i < coords.length; i++) {
			const [x, y] = coords[i];
			if (i === 0) {
				path.moveTo(x, y);
			} else {
				path.lineTo(x, y);
			}
		}
		return path;
	}, coords.flat());
}

/**
 * Creates a memoized Path2D for an SVG data string.
 * @returns A memoized Path2D
 */
export function crcSvgPath(svgPathData: string): Path2D {
	return crcMemo(() => new Path2D(svgPathData), [svgPathData]);
}

export interface SvgPathProps
	extends CRCBasicMouseEvents,
		FillStyleProps,
		StrokeStyleProps,
		AlphaProps,
		CursorStyleProps {
	d: string;
}

function SvgPath(props: SvgPathProps, ctx: CanvasRenderingContext2D) {
	const { d, ...pathProps } = props;
	const svgPath = crcSvgPath(d);
	return Path(
		{
			...pathProps,
			path: svgPath,
		},
		ctx,
	);
}

/**
 * Creates a renderable SvgPath component element.
 */
export const svgPath = defineComp(SvgPath);

export interface GProps {
	children: CompEl[];
	scaleX?: number;
	scaleY?: number;
	rotate?: number;
	x?: number;
	y?: number;
	skewX?: number;
	skewY?: number;
}

function G(props: GProps, ctx: CanvasRenderingContext2D) {
	const transform = new DOMMatrix();

	const { scaleX = 1, scaleY = 1 } = props;
	if (scaleX !== 1 || scaleY !== 1) {
		transform.scaleSelf(scaleX, scaleY);
	}

	const { rotate } = props;
	if (rotate) {
		transform.rotateSelf(rotate);
	}

	const { x = 0, y = 0 } = props;
	if (x || y) {
		transform.translateSelf(x, y);
	}

	const { skewX } = props;
	if (skewX) {
		transform.skewXSelf(skewX);
	}

	const { skewY } = props;
	if (skewY) {
		transform.skewYSelf(skewY);
	}

	ctx.setTransform(transform);

	return props.children;
}

/**
 * Creates a group element that can be used to define transformations on a set
 * of related CRC elements.
 */
export const g = defineComp(G);
