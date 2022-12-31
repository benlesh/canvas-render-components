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

interface CRCInstance {
	root: CompEl<any>;
	refs: Map<string, CompRefs<any>>;
	animationFrameId: number;
	renderTimestamp: number;
	abortController: AbortController;
}

////////////////////////////////////////////////////////////////////////////////////////
// Shared State
////////////////////////////////////////////////////////////////////////////////////////

let crcInstances = new Map<HTMLCanvasElement, CRCInstance>();
let _currentCRCInstance: CRCInstance | undefined = undefined;
let _componentRefs: CompRefs<any> | undefined = undefined;
let _canvas: HTMLCanvasElement | undefined = undefined;
let _componentIsMounting = false;
let _compnentHookIndex = 0;
let _renderContext: CanvasRenderingContext2D | undefined = undefined;
let _unseenIds: Set<string> | undefined = undefined;

let anonElementNames = new WeakMap<any, string>();

let anon = 0;

/**
 * Used to get a name for an anonymous function.
 * @param fn The anonymous function to get a name for
 * @returns A name for the anonymous function
 */
function getAnonElemName(fn: any) {
	if (!anonElementNames.has(fn)) {
		anonElementNames.set(fn, `Anon${anon++}`);
	}
	return anonElementNames.get(fn)!;
}

/**
 * Useful for testing and HMR.
 * DO NOT USE IN PROD
 */
export function clearSharedState() {
	for (const crcInstance of crcInstances.values()) {
		cleanupCRCInstace(crcInstance);
	}
	crcInstances.clear();
	anonElementNames = new WeakMap<any, string>();
	clearTempState();
}

function cleanupCRCInstace(crcInstance: CRCInstance) {
	crcInstance.abortController.abort();
}

function clearTempState() {
	_unseenIds = undefined;
	_canvas = undefined;
	_renderContext = undefined;
	clearComponentState();
}

function clearComponentState() {
	_componentRefs = undefined;
	_componentIsMounting = false;
	_compnentHookIndex = 0;
}

////////////////////////////////////////////////////////////////////////////////////////
// Core
////////////////////////////////////////////////////////////////////////////////////////

/**
 * Mounts or updates a canvas render component on a given HTMLCanvasElement
 * @param canvas The canvas to render on
 * @param element The CRC element to render
 */
export function crc<P>(
	canvas: HTMLCanvasElement,
	element: CompEl<P>,
	config?: { signal?: AbortSignal },
) {
	if (!crcInstances.has(canvas)) {
		const ac = new AbortController();
		const signal = config?.signal;

		const cleanup = () => {
			crcInstances.delete(canvas);
			ac.abort();
		};

		if (signal) {
			config.signal.addEventListener('abort', cleanup, {
				once: true,
				signal: ac.signal,
			});
		}

		const crcInstance: CRCInstance = {
			root: element,
			refs: new Map(),
			animationFrameId: 0,
			renderTimestamp: 0,
			abortController: ac,
		};

		detectElementRemoval(canvas, cleanup, signal);

		crcInstances.set(canvas, crcInstance);
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
function executeRender(canvas: HTMLCanvasElement, renderTimestamp: number) {
	const crcInstance = crcInstances.get(canvas)!;
	crcInstance.animationFrameId = 0;

	if (crcInstance.abortController.signal.aborted) return;

	try {
		_currentCRCInstance = crcInstance;
		_currentCRCInstance.renderTimestamp = renderTimestamp;
		_canvas = canvas;
		const rootElement = _currentCRCInstance.root;
		const ctx = get2dContext(canvas);
		_renderContext = ctx;
		_unseenIds = new Set(_currentCRCInstance.refs.keys());
		const id = 'root';
		_unseenIds.delete(id);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		render(rootElement, id);
		for (const id of _unseenIds) {
			_currentCRCInstance.refs.delete(id);
		}
	} finally {
		clearTempState();
	}
}

/**
 *
 * @param canvas The canvas with CRC mounted on it to update
 * @param element The optional element to update as the root element of that canvas.
 */
export function update<P>(canvas: HTMLCanvasElement, element?: CompEl<P>) {
	const crcInstance = crcInstances.get(canvas)!;

	if (!crcInstance) {
		throw new Error('Canvas does not have CRC mounted.');
	}

	if (element) {
		crcInstance.root = element;
	}

	if (!crcInstance.animationFrameId) {
		crcInstance.animationFrameId = requestAnimationFrame((ts) =>
			executeRender(canvas, ts),
		);
	}
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
		_componentIsMounting = !_currentCRCInstance.refs.has(id);
		if (_componentIsMounting) {
			_currentCRCInstance.refs.set(id, {
				id,
				element,
				refs: [],
			});
		}

		_componentRefs = _currentCRCInstance.refs.get(id)!;
		_compnentHookIndex = 0;

		const ctx = _renderContext!;
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
		clearComponentState();
	}
}

////////////////////////////////////////////////////////////////////////////////////////
// Hooks
////////////////////////////////////////////////////////////////////////////////////////

interface CRCRef<T> {
	current: T | undefined;
}

/**
 * Hook: Creates a reference object, similar to React's useRef.
 * @param init The initial reference value
 * @returns A reference with a `current` property containing the value
 */
export function crcRef<T>(init?: T): CRCRef<T> {
	if (_componentIsMounting) {
		_componentRefs!.refs.push({
			type: 'ref',
			current: init,
		});
	}

	return _componentRefs!.refs[_compnentHookIndex++];
}

export type StateUpdater<T> = (update: T | ((oldValue: T) => T)) => void;

/**
 * Hook: creates a tuple of state and a state setter. Setting the state with the
 * state setter will cause the entire canvas CRC instance to be scheduled for
 * rerender. If you set the state multiple times before the next animation frame,
 * it will only rerender with whatever the most recent state is as of that animation frame.
 * @param init The initial state
 * @returns A tuple with the state, and a setter function
 */
export function crcState<T>(init?: T): readonly [T, StateUpdater<T>] {
	if (_componentIsMounting) {
		const ref = {
			type: 'state',
			value: init,
			setter,
		};

		const canvas = _canvas;

		function setter(newValueOrFactory: T | ((oldValue: T) => T)) {
			ref.value =
				typeof newValueOrFactory === 'function'
					? (newValueOrFactory as any)(ref.value)
					: newValueOrFactory;
			update(canvas!);
		}

		_componentRefs!.refs.push(ref);
	}

	const ref = _componentRefs!.refs[_compnentHookIndex++];
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
	if (_componentIsMounting) {
		const ref = {
			type: 'whenChanged',
			lastDeps: undefined,
			teardown: undefined,
		};

		_componentRefs!.refs.push(ref);
	}

	const hookIndex = _compnentHookIndex++;
	const ref = _componentRefs!.refs[hookIndex];
	if (!ref.lastDeps || !deps || !shallowArrayEquals(deps, ref.lastDeps)) {
		const lastTeardown = ref.teardown;
		const signal = _currentCRCInstance.abortController.signal;
		if (lastTeardown) {
			signal.removeEventListener('abort', lastTeardown);
			lastTeardown();
		}
		ref.lastDeps = deps;
		const newTeardown = callback();
		if (newTeardown) {
			ref.teardown = newTeardown;
			signal.addEventListener('abort', newTeardown, {
				once: true,
			});
		}
	}
}

export interface CRCMouseEvent {
	x: number;
	y: number;
	originalEvent: MouseEvent;
}

function isHit({
	canvas,
	transform,
	path,
	x,
	y,
	fill,
	lineInteractionWidth,
}: {
	canvas: HTMLCanvasElement;
	transform: DOMMatrix;
	path: Path2D;
	x: number;
	y: number;
	fill: boolean;
	lineInteractionWidth: number;
}) {
	const ctx = get2dContext(canvas);
	ctx.setTransform(transform);
	if (fill && ctx.isPointInPath(path, x, y)) {
		return true;
	}
	if (lineInteractionWidth > 0) {
		ctx.lineWidth = lineInteractionWidth;
		if (ctx.isPointInStroke(path, x, y)) {
			return true;
		}
	}
	return false;
}

function crcBasicMouseEvent({
	type,
	path,
	handler,
	fill = false,
	lineInteractionWidth = 0,
}: {
	type: 'click' | 'dblclick' | 'mousemove' | 'contextmenu';
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineInteractionWidth?: number;
}) {
	crcWhenChanged(() => {
		const ac = new AbortController();
		const transform = _renderContext!.getTransform();
		_canvas!.addEventListener(
			type,
			(e) => {
				const canvas = e.target as HTMLCanvasElement;
				const [x, y] = getMouseCoordinates(e);
				if (
					isHit({ canvas, path, x, y, fill, transform, lineInteractionWidth })
				) {
					handler({ x, y, originalEvent: e });
				}
			},
			{ signal: ac.signal },
		);
		return () => {
			ac.abort();
		};
	}, [type, path, handler, fill, lineInteractionWidth]);
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
	lineInteractionWidth?: number;
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
	lineInteractionWidth?: number;
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
	lineInteractionWidth?: number;
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
	lineInteractionWidth?: number;
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
	lineInteractionWidth?: number;
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
	lineInteractionWidth?: number;
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
	lineInteractionWidth = 0,
}: {
	type: 'mouseover' | 'mouseout';
	path: Path2D;
	handler: (e: CRCMouseEvent) => void;
	fill?: boolean;
	lineInteractionWidth?: number;
}) {
	const overRef = crcRef(false);

	crcWhenChanged(() => {
		const ac = new AbortController();
		const transform = _renderContext!.getTransform();

		_canvas!.addEventListener(
			'mousemove',
			(e) => {
				const canvas = e.target as HTMLCanvasElement;
				const [x, y] = getMouseCoordinates(e);

				const isOver = isHit({
					canvas,
					transform,
					path,
					x,
					y,
					fill,
					lineInteractionWidth,
				});

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

		_canvas!.addEventListener(
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
	}, [type, path, handler, fill, lineInteractionWidth]);
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
	lineInteractionWidth = 0,
}: {
	path: Path2D;
	style: string;
	fill?: boolean;
	lineInteractionWidth?: number;
}) {
	crcMouseOver({
		path,
		handler: (e) => {
			const canvas = e.originalEvent.target as HTMLCanvasElement;
			canvas.style.cursor = style;
		},
		fill,
		lineInteractionWidth,
	});

	crcMouseOut({
		path,
		handler: (e) => {
			const canvas = e.originalEvent.target as HTMLCanvasElement;
			canvas.style.removeProperty('cursor');
		},
		fill,
		lineInteractionWidth,
	});
}

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
export function crcLinePath(
	coords: [number, number][],
	config?: { closePath?: boolean },
): Path2D {
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
		if (config?.closePath) {
			path.closePath();
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

////////////////////////////////////////////////////////////////////////////////////////
// Components
////////////////////////////////////////////////////////////////////////////////////////

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
	lineInteractionWidth?: number;
}

function Path(props: PathProps, ctx: CanvasRenderingContext2D) {
	const {
		alpha,
		path,
		fillStyle,
		strokeStyle,
		lineWidth,
		lineInteractionWidth = lineWidth,
	} = props;

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

	const fill = !!fillStyle;

	wireCommonEvents(props, path, fill, lineInteractionWidth);
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

function wireCommonEvents(
	props: CRCBasicMouseEvents & CursorStyleProps,
	path: Path2D,
	fill: boolean,
	lineInteractionWidth: number,
) {
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
			fill,
			lineInteractionWidth,
		});
	}

	if (onContextMenu) {
		crcContextMenu({
			path,
			handler: onContextMenu,
			fill,
			lineInteractionWidth,
		});
	}

	if (onDblClick) {
		crcDblClick({
			path,
			handler: onDblClick,
			fill,
			lineInteractionWidth,
		});
	}

	if (onMouseOver) {
		crcMouseOver({
			path,
			handler: onMouseOver,
			fill,
			lineInteractionWidth,
		});
	}

	if (onMouseMove) {
		crcMouseMove({
			path,
			handler: onMouseMove,
			fill,
			lineInteractionWidth,
		});
	}

	if (onMouseOut) {
		crcMouseOut({
			path,
			handler: onMouseOut,
			fill,
			lineInteractionWidth,
		});
	}

	const { cursor } = props;

	if (cursor) {
		crcCursor({
			path,
			style: cursor,
			fill,
			lineInteractionWidth,
		});
	}
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

export interface LineProps
	extends CRCBasicMouseEvents,
		CursorStyleProps,
		StrokeStyleProps {
	coords: [number, number][];
	lineInteractionWidth?: number;
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
		CursorStyleProps,
		StrokeStyleProps {
	x: number;
	top?: number;
	bottom?: number;
	alignToPixelGrid?: boolean;
	lineInteractionWidth?: number;
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
		? Math.round(initialX) - calculatePixelGridOffset(props.lineWidth)
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
		CursorStyleProps,
		StrokeStyleProps {
	y: number;
	left?: number;
	right?: number;
	alignToPixelGrid?: boolean;
	lineInteractionWidth?: number;
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
		? Math.round(initialY) - calculatePixelGridOffset(props.lineWidth)
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

export interface ImgProps
	extends CRCBasicMouseEvents,
		AlphaProps,
		CursorStyleProps,
		StrokeStyleProps {
	src: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
}

function Img(props: ImgProps, ctx: CanvasRenderingContext2D) {
	let {
		alpha,
		src,
		x,
		y,
		width,
		height,
		lineWidth,
		strokeStyle,
		...otherProps
	} = props;

	if (alpha) {
		ctx.globalAlpha = ctx.globalAlpha * alpha;
	}

	const [image, setImage] = crcState<HTMLImageElement | null>(null);

	crcWhenChanged(() => {
		const img = new Image();
		img.onload = () => {
			setImage(img);
		};
		img.src = src;
	}, [src]);

	width ??= image?.width ?? 0;
	height ??= image?.height ?? 0;

	const imagePath = crcRectPath(x, y, width, height);

	crcCursor({
		path: imagePath,
		style: props.cursor,
		fill: true,
		lineInteractionWidth: props.lineWidth,
	});

	if (image) {
		ctx.drawImage(image, x, y, width, height);
	}

	if (strokeStyle && lineWidth) {
		ctx.strokeStyle = strokeStyle;
		ctx.lineWidth = lineWidth;
		ctx.stroke(imagePath);
	}

	wireCommonEvents(otherProps, imagePath, true, lineWidth);
}

/**
 * Creates a renderable Img component element.
 */
export const img = defineComp(Img);

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
	rotateOrigin?: [number, number];
	x?: number;
	y?: number;
	skewX?: number;
	skewY?: number;
}

function G(props: GProps, ctx: CanvasRenderingContext2D) {
	let transform = new DOMMatrix();

	const { scaleX = 1, scaleY = 1 } = props;
	if (scaleX !== 1 || scaleY !== 1) {
		transform = transform.scale(scaleX, scaleY);
	}

	const { rotate } = props;
	if (rotate) {
		const [rox, roy] = props.rotateOrigin ?? [0, 0];
		transform = transform
			.translate(rox, roy)
			.rotate(rotate)
			.translate(-rox, -roy);
	}

	const { x = 0, y = 0 } = props;
	if (x || y) {
		transform = transform.translate(x, y);
	}

	const { skewX } = props;
	if (skewX) {
		transform = transform.skewX(skewX);
	}

	const { skewY } = props;
	if (skewY) {
		transform = transform.skewY(skewY);
	}

	ctx.setTransform(transform);

	return props.children;
}

export interface TextProps
	extends CRCBasicMouseEvents,
		FillStyleProps,
		StrokeStyleProps,
		AlphaProps,
		CursorStyleProps {
	text: string;
	x: number;
	y: number;
	maxWidth?: number;
	maxHeight?: number;
	lineHeight?: number;
	overflow?: 'clip' | 'ellipsis';
	wordWrap?: boolean;
	font?: string;
	textBaseline?: CanvasTextBaseline;
	textAlign?: CanvasTextAlign;
}

export function Text(props: TextProps, ctx: CanvasRenderingContext2D) {
	const {
		font = '13px sans-serif',
		textBaseline = 'top',
		textAlign = 'left',
	} = props;

	ctx.font = font;
	ctx.textBaseline = textBaseline;
	ctx.textAlign = textAlign;

	const { strokeStyle, lineWidth, fillStyle, x, maxWidth } = props;

	const renderText = (txt: string, y: number) => {
		if (strokeStyle && lineWidth) {
			ctx.strokeStyle = strokeStyle;
			ctx.lineWidth = lineWidth;
			ctx.strokeText(txt, x, y, maxWidth);
		}

		if (fillStyle) {
			ctx.fillStyle = fillStyle;
			ctx.fillText(txt, x, y, maxWidth);
		}
	};

	let textWidth = 0;
	let textHeight = 0;

	const { y, wordWrap } = props;

	if (wordWrap) {
		const words = props.text.split(' ');
		let line = '';
		let lineCount = 0;

		const updateTextBounds = (line: string) => {
			const bounds = ctx.measureText(line);
			textWidth = Math.max(bounds.width);
			textHeight =
				lineCount * lineHeight +
				bounds.actualBoundingBoxDescent -
				bounds.actualBoundingBoxAscent;
		};

		const { maxHeight, lineHeight = 13, overflow = 'clip' } = props;

		while (words.length) {
			const currentYOffset = lineCount * lineHeight;
			const nextYOffset = currentYOffset + lineHeight;
			console.log({
				words: Array.from(words),
				maxHeight,
				nextYOffset,
				lineCount,
				line,
			});
			if (maxHeight < nextYOffset + lineHeight) {
				const remaining = words.join(' ');
				const lastLine =
					overflow === 'ellipsis' && maxWidth
						? getEllipsisText(ctx, remaining, maxWidth)
						: remaining;
				updateTextBounds(lastLine);
				renderText(lastLine, y + currentYOffset);
				break;
			} else {
				if (maxWidth < ctx.measureText(line + words[0]).width) {
					updateTextBounds(line);
					renderText(line, y + currentYOffset);
					line = '';
					lineCount++;
				}
				line += words.shift() + ' ';
			}
		}
	} else {
		const text =
			props.overflow === 'ellipsis' && maxWidth
				? getEllipsisText(ctx, props.text, maxWidth)
				: props.text;

		renderText(text, y);

		const bounds = ctx.measureText(text);
		textWidth = bounds.width;
		textHeight =
			bounds.actualBoundingBoxDescent - bounds.actualBoundingBoxAscent;
	}

	const textPath = crcRectPath(x, y, textWidth, textHeight);

	wireCommonEvents(props, textPath, true, lineWidth);
}

export const text = defineComp(Text);

function getEllipsisText(
	renderContext: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
) {
	const metrics = renderContext.measureText(text);

	if (metrics.width < maxWidth) {
		return text;
	}

	let low = -1;
	let high = text.length;

	while (1 + low < high) {
		const mid = low + ((high - low) >> 1);
		if (
			isTextTooWide(renderContext, text.substring(0, mid) + '...', maxWidth)
		) {
			high = mid;
		} else {
			low = mid;
		}
	}

	const properLength = high - 1;
	return text.substring(0, properLength) + '...';
}

function isTextTooWide(
	renderContext: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
) {
	const metrics = renderContext.measureText(text);
	return maxWidth < metrics.width;
}

/**
 * Creates a group element that can be used to define transformations on a set
 * of related CRC elements.
 */
export const g = defineComp(G);

////////////////////////////////////////////////////////////////////////////////////////
// Utility functions
////////////////////////////////////////////////////////////////////////////////////////

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

function calculatePixelGridOffset(lineWidth?: number) {
	return ((lineWidth ?? 0) / 2) % 1;
}

function detectElementRemoval(
	element: Element,
	handler: () => void,
	signal?: AbortSignal,
) {
	const observer = new MutationObserver(() => {
		if (!document.body.contains(element)) {
			observer.disconnect();
			// @ts-ignore
			element.__crcRemoved = true;
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });

	signal?.addEventListener('abort', () => {
		observer.disconnect();
	});
}
