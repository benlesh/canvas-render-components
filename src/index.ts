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

type FalsyNodes = undefined | false | null | '' | 0;

export type CRCNode = CompEl | void | FalsyNodes;

export type Canvas = HTMLCanvasElement | OffscreenCanvas;
export type RenderingContext2D =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

export type CompFn<P> = (
	props: P,
	ctx: RenderingContext2D,
) => CRCNode[] | CRCNode | void;

interface CompRefs<P> {
	id: string;
	parent: CompRefs<any> | undefined;
	element: CompEl<P>;
	refs: any[];
	teardowns: Teardowns;
	onAfterRender: (() => void) | undefined;
}

export type CRCMouseEventListener = (e: CRCMouseEvent) => void;

interface CRCEventRegistry {
	click: Set<(e: MouseEvent) => void>;
	dblclick: Set<(e: MouseEvent) => void>;
	mousemove: Set<(e: MouseEvent) => void>;
	mouseover: Set<(e: MouseEvent) => void>;
	mouseout: Set<(e: MouseEvent) => void>;
	mousedown: Set<(e: MouseEvent) => void>;
	mouseup: Set<(e: MouseEvent) => void>;
	contextmenu: Set<(e: MouseEvent) => void>;
}

interface CRCInstance {
	root: CompEl<any>;
	refs: Map<string, CompRefs<any>>;
	animationFrameId: number;
	renderTimestamp: number;
	mainTeardowns: Teardowns;
	events: CRCEventRegistry;
	parent: Canvas | undefined;
}

export type PixelGridAlignment = 'none' | 'round' | 'ceil' | 'floor';

////////////////////////////////////////////////////////////////////////////////////////
// Shared State
////////////////////////////////////////////////////////////////////////////////////////

let crcInstances = new Map<Canvas, CRCInstance>();
let _currentCRCInstance: CRCInstance | undefined = undefined;
let _componentRefs: CompRefs<any> | undefined = undefined;
let _canvas: Canvas | undefined = undefined;
let _componentIsMounting = false;
let _componentHookIndex = 0;
let _renderContext: RenderingContext2D | undefined = undefined;
let _unseenIds: Set<string> | undefined = undefined;
let _seenIds: Set<string> | undefined = undefined;
let _mouseTransform: DOMMatrix | undefined = undefined;
let clippingStack: {
	path: Path2D;
	fillRule: CanvasFillRule;
	transform: DOMMatrix;
}[] = [];

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
		cleanupCRCInstance(crcInstance);
	}
	crcInstances.clear();
	clippingStack = [];
	anonElementNames = new WeakMap<any, string>();
	clearTempState();
}

function cleanupCRCInstance(crcInstance: CRCInstance) {
	crcInstance.mainTeardowns.execute();
}

function clearTempState() {
	_unseenIds = undefined;
	_seenIds = undefined;
	_canvas = undefined;
	_renderContext = undefined;
	clearComponentState();
}

function clearComponentState() {
	_componentRefs = undefined;
	_componentIsMounting = false;
	_componentHookIndex = 0;
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
		mountCRC<P>(canvas, element, config);
	}

	update(canvas, element);
}

function mountCRC<P>(
	canvas: Canvas,
	element: CompEl<P>,
	config?: { signal?: AbortSignal; parent?: Canvas },
) {
	const mainTeardowns = new Teardowns();

	const signal = config?.signal;

	const cleanup = () => {
		crcInstances.delete(canvas);
		mainTeardowns.execute();
	};

	if (signal) {
		signal.addEventListener('abort', cleanup, {
			once: true,
		});
		mainTeardowns.add(() => {
			signal.removeEventListener('abort', cleanup);
		});
	}

	const parent = config?.parent;

	const crcInstance: CRCInstance = {
		root: element,
		refs: new Map(),
		animationFrameId: 0,
		renderTimestamp: 0,
		mainTeardowns,
		events: {
			click: new Set(),
			dblclick: new Set(),
			mousemove: new Set(),
			mouseover: new Set(),
			mouseout: new Set(),
			mousedown: new Set(),
			mouseup: new Set(),
			contextmenu: new Set(),
		},
		parent,
	};

	if (parent) {
		const parentCRCInstance = crcInstances.get(parent);

		for (const [type, handlers] of Object.entries(crcInstance.events)) {
			const handler = (e: MouseEvent) => {
				_mouseTransform = createMouseEventTransform(
					e.target as HTMLCanvasElement,
				);
				for (const handler of handlers) {
					try {
						handler(e);
					} catch (err) {
						reportError(err);
					}
				}
				_mouseTransform = undefined;
			};

			parentCRCInstance.events[type].add(handler);

			mainTeardowns.add(() => {
				parentCRCInstance.events[type].delete(handler);
			});
		}
	} else {
		// Only the parent canvas wires up events.
		for (const [type, handlers] of Object.entries(crcInstance.events)) {
			canvas.addEventListener(
				type,
				(e) => {
					_mouseTransform = createMouseEventTransform(
						canvas as HTMLCanvasElement,
					);
					for (const handler of handlers) {
						try {
							handler(e);
						} catch (err) {
							reportError(err);
						}
					}
					_mouseTransform = undefined;
				},
				{ signal },
			);
		}
	}

	crcInstances.set(canvas, crcInstance);
}

/**
 * Creates a simple structure representing a component to be rendered.
 * DOES NOT RENDER.
 * @param comp The render function for a component
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

function createMouseEventTransform(canvas: HTMLCanvasElement) {
	const { width, height } = canvas;
	const bounds = canvas.getBoundingClientRect();
	const xScale = width / bounds.width;
	const yScale = height / bounds.height;
	if (xScale !== 1 || yScale !== 1) {
		return new DOMMatrix().scale(xScale, yScale);
	}
}

/**
 * Gets the root element for a canvas and renders it. This is the
 * entry point for rendering the entire tree.
 * @param canvas The canvas to render on
 */
function executeRender(
	canvas: Canvas,
	renderTimestamp: number,
	updatedRoot?: CompEl,
	updateParents = false,
) {
	if (!canvas) {
		throw new Error('No canvas element provided');
	}

	const crcInstance = crcInstances.get(canvas);

	if (!crcInstance) {
		throw new Error('CRC is not mounted on this element');
	}

	crcInstance.animationFrameId = 0;

	if (crcInstance.mainTeardowns.closed) return;

	const prevCurrentCRCInstance = _currentCRCInstance;
	const prevCanvas = _canvas;
	const prevRenderContext = _renderContext;
	const prevMouseTransform = _mouseTransform;
	const prevSeenIds = _seenIds;
	const prevUnseendIds = _unseenIds;
	const prevComponentRefs = _componentRefs;
	try {
		_currentCRCInstance = crcInstance;
		_currentCRCInstance.renderTimestamp = renderTimestamp;
		_canvas = canvas;
		const rootElement = updatedRoot ?? _currentCRCInstance.root;
		_currentCRCInstance.root = rootElement;
		const ctx = get2dContext(canvas);
		_renderContext = ctx;

		_unseenIds = new Set(_currentCRCInstance.refs.keys());
		_seenIds = new Set();
		const id = 'root';
		_unseenIds.delete(id);
		_seenIds.add(id);
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		render(rootElement, id, undefined);

		for (const id of _unseenIds) {
			// HACK: I want to be more efficient here, but this is fine for now
			_currentCRCInstance.refs.get(id)?.teardowns.execute();
			_currentCRCInstance.refs.delete(id);
		}
	} finally {
		const { parent } = _currentCRCInstance;
		clearTempState();
		if (updateParents) {
			if (parent) {
				executeRender(parent, renderTimestamp);
			}
		}
		_currentCRCInstance = prevCurrentCRCInstance;
		_canvas = prevCanvas;
		_renderContext = prevRenderContext;
		_mouseTransform = prevMouseTransform;
		_seenIds = prevSeenIds;
		_unseenIds = prevUnseendIds;
		_componentRefs = prevComponentRefs;
	}
}

/**
 *
 * @param canvas The canvas with CRC mounted on it to update
 * @param element The optional element to update as the root element of that canvas.
 */
function update(canvas: Canvas, rootElement?: CompEl, updateParents = false) {
	const crcInstance = crcInstances.get(canvas)!;

	if (!crcInstance) {
		throw new Error('Canvas does not have CRC mounted.');
	}

	if (crcInstance.animationFrameId) {
		cancelAnimationFrame(crcInstance.animationFrameId);
	}

	crcInstance.animationFrameId = requestAnimationFrame((ts) =>
		executeRender(canvas, ts, rootElement, updateParents),
	);
}

function getElementTypeName(element: CompEl): string {
	return (
		element.props.key || element.type.name || getAnonElemName(element.type)
	);
}

function render<P>(
	element: CompEl<P>,
	parentId: string,
	parent: CompRefs<any> | undefined,
): void {
	try {
		const typeName = getElementTypeName(element);
		let id = ensureUniqueId(parentId, typeName);
		_unseenIds!.delete(id);
		_seenIds!.add(id);
		_componentIsMounting = !_currentCRCInstance!.refs.has(id);
		if (_componentIsMounting) {
			const teardowns = new Teardowns();
			teardowns.follow(_currentCRCInstance!.mainTeardowns);
			_currentCRCInstance!.refs.set(id, {
				id,
				parent,
				element,
				refs: [],
				teardowns,
				onAfterRender: undefined,
			});
		}

		_componentRefs = _currentCRCInstance!.refs.get(id)!;
		_componentHookIndex = 0;

		_componentRefs.element = element;

		const ctx = _renderContext!;
		ctx.save();
		const result = _componentRefs.element.type(
			_componentRefs.element.props,
			ctx,
		);

		const onAfterRender = _componentRefs.onAfterRender;
		_componentRefs.onAfterRender = undefined;

		if (result) {
			if (Array.isArray(result)) {
				for (let i = 0; i < result.length; i++) {
					const child = result[i];
					if (child) {
						ctx.save();
						render(child, id, _componentRefs);
						ctx.restore();
					}
				}
			} else {
				ctx.save();
				render(result, id, _componentRefs);
				ctx.restore();
			}
		}

		onAfterRender?.();

		ctx.restore();
	} finally {
		clearComponentState();
	}
}

export interface ClipProps {
	path: Path2D;
	fillRule?: CanvasFillRule;
	children: CRCNode[];
}

export function Clip(props: ClipProps, ctx: RenderingContext2D) {
	const { path, fillRule = 'nonzero' } = props;

	_componentRefs!.onAfterRender = () => {
		clippingStack.pop();
	};

	clippingStack.push({ path, fillRule, transform: ctx.getTransform() });
	ctx.clip(path, fillRule);

	return props.children;
}

export const clip = defineComp(Clip);

////////////////////////////////////////////////////////////////////////////////////////
// Hooks
////////////////////////////////////////////////////////////////////////////////////////

interface CRCRef<T> {
	current: T | undefined;
}

function ensureUniqueId(parentId: string, typeName: string) {
	let id = parentId + '/' + typeName;
	let n = 1;
	while (_seenIds!.has(id)) {
		id = parentId + '/' + typeName + '_' + n++;
	}
	return id;
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

	return _componentRefs!.refs[_componentHookIndex++];
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
			update(canvas!, undefined, true);
		}

		_componentRefs!.refs.push(ref);
	}

	const ref = _componentRefs!.refs[_componentHookIndex++];
	return [ref.value, ref.setter] as const;
}

/**
 * Hook: creates a memoized value, similar to React's `useMemo`.
 * @param create The factory to create the memoized value.
 * @param deps The deps to check to see if the memoized value needs to be updated.
 * @returns The memoized value
 */
export function crcMemo<T>(create: () => T, deps: any[]): T {
	const componentRefs = _componentRefs!;
	const hookIndex = _componentHookIndex++;
	const refs = componentRefs.refs;

	if (_componentIsMounting) {
		refs[hookIndex] = { value: create(), deps };
	} else {
		const { deps: lastDeps } = refs[hookIndex];
		if (!deps || !shallowArrayEquals(deps, lastDeps)) {
			refs[hookIndex].value = create();
			refs[hookIndex].deps = deps;
		}
	}

	return refs[hookIndex].value;
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
			lastDeps: undefined,
			teardown: undefined,
		};

		_componentRefs!.refs.push(ref);
	}

	const hookIndex = _componentHookIndex++;
	const ref = _componentRefs!.refs[hookIndex];
	if (!ref.lastDeps || !deps || !shallowArrayEquals(deps, ref.lastDeps)) {
		const lastTeardown = ref.teardown;
		const mainTeardowns = _currentCRCInstance!.mainTeardowns;
		if (lastTeardown) {
			mainTeardowns.add(lastTeardown);
			_componentRefs!.teardowns.remove(lastTeardown);
			lastTeardown();
		}
		ref.lastDeps = deps;
		const newTeardown = callback();
		if (newTeardown) {
			ref.teardown = newTeardown;
			mainTeardowns.add(newTeardown);
			_componentRefs!.teardowns.add(newTeardown);
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
	currentClippingStack,
}: {
	canvas: HTMLCanvasElement;
	transform: DOMMatrix;
	path: Path2D;
	x: number;
	y: number;
	fill: boolean;
	lineInteractionWidth: number;
	currentClippingStack: typeof clippingStack;
}) {
	const ctx = get2dContext(canvas);
	ctx.save();
	try {
		if (_mouseTransform) {
			({ x, y } = _mouseTransform.transformPoint({ x, y }));
		}

		if (isInAtLeastOneClippingPath(currentClippingStack, x, y, ctx)) {
			if (!transform.isIdentity) {
				ctx.setTransform(transform);
			}

			if (fill && ctx.isPointInPath(path, x, y)) {
				return true;
			}
			if (lineInteractionWidth > 0) {
				ctx.lineWidth = lineInteractionWidth;
				if (ctx.isPointInStroke(path, x, y)) {
					return true;
				}
			}
		}
		return false;
	} finally {
		ctx.restore();
	}
}

function isInAtLeastOneClippingPath(
	currentClippingStack: typeof clippingStack,
	x: number,
	y: number,
	ctx: RenderingContext2D,
) {
	if (currentClippingStack.length === 0) {
		return true;
	}

	for (const { path, fillRule, transform } of currentClippingStack) {
		if (!transform.isIdentity) {
			ctx.save();
			ctx.setTransform(transform);
		}
		try {
			if (ctx.isPointInPath(path, x, y, fillRule)) {
				return true;
			}
		} finally {
			if (!transform.isIdentity) {
				ctx.restore();
			}
		}
	}

	return false;
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
	path?: Path2D;
	style?: string;
	fill?: boolean;
	lineInteractionWidth?: number;
}) {
	crcEvent(
		'mousemove',
		style
			? (e) => {
					const canvas = e.originalEvent.target as HTMLCanvasElement;
					if (!canvas.style.cursor) {
						// If something has already set it, don't confuse it.
						canvas.style.cursor = style;
					}
			  }
			: undefined,
		path,
		fill,
		lineInteractionWidth,
	);

	crcEvent(
		'mouseout',
		style
			? (e) => {
					const canvas = e.originalEvent.target as HTMLCanvasElement;
					canvas.style.removeProperty('cursor');
			  }
			: undefined,
		path,
		fill,
		lineInteractionWidth,
	);
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
	config?: { alignToPixelGrid?: PixelGridAlignment; lineWidth?: number },
): Path2D {
	const alignToPixelGrid = config?.alignToPixelGrid;

	if (alignToPixelGrid) {
		({ x, y, width, height } = adjustRectangleToPixelGrid(
			config?.lineWidth ?? 0,
			x,
			y,
			width,
			height,
			alignToPixelGrid,
		));
	}

	return crcMemo(() => {
		const path = new Path2D();
		path.rect(x, y, width, height);
		return path;
	}, [x, y, width, height]);
}

function adjustRectangleToPixelGrid(
	lineWidth: number,
	x: number,
	y: number,
	width: number,
	height: number,
	alignment: PixelGridAlignment,
) {
	x = adjustForPixelGrid(x, lineWidth, alignment);
	y = adjustForPixelGrid(y, lineWidth, alignment);
	const right = x + width;
	const adjustedRight = adjustForPixelGrid(right, lineWidth, alignment) + 1;
	width = adjustedRight - x;
	const bottom = y + height;
	const adjustedBottom = adjustForPixelGrid(bottom, lineWidth, alignment) + 1;
	height = adjustedBottom - y;
	return { x, y, width, height };
}

/**
 * Creates a memoized Path2D for a set of line coordinates.
 * @returns A memoized Path2D
 */
export function crcLinePath(
	coords: [number, number][],
	config?: { closePath?: boolean },
): Path2D {
	return crcMemo(() => createLinePath(coords, config), coords.flat());
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
	onMouseDown?: (e: CRCMouseEvent) => void;
	onMouseUp?: (e: CRCMouseEvent) => void;
}

export type FillStyle = CanvasRenderingContext2D['fillStyle'];
export type StrokeStyle = CanvasRenderingContext2D['strokeStyle'];

interface IntrinsicProps {
	key?: string;
}

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
	extends IntrinsicProps,
		CRCBasicMouseEvents,
		FillStyleProps,
		StrokeStyleProps,
		CursorStyleProps,
		AlphaProps {
	path: Path2D;
	lineInteractionWidth?: number;
}

function Path(props: PathProps, ctx: RenderingContext2D) {
	const {
		alpha,
		path,
		fillStyle,
		strokeStyle,
		lineWidth,
		lineInteractionWidth = lineWidth ?? 0,
	} = props;

	if (alpha) {
		ctx.globalAlpha = ctx.globalAlpha * alpha;
	}

	if (fillStyle && !isTransparent(fillStyle)) {
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
	extends IntrinsicProps,
		CRCBasicMouseEvents,
		FillStyleProps,
		StrokeStyleProps,
		AlphaProps,
		CursorStyleProps {
	x: number;
	y: number;
	width: number;
	height: number;
	alignToPixelGrid?: PixelGridAlignment;
}

export function crcEvent<K extends keyof CRCEventRegistry>(
	type: K,
	handler?: CRCMouseEventListener,
	path?: Path2D,
	fill = false,
	lineInteractionWidth = 0,
) {
	const hookIndex = _componentHookIndex++;
	const componentRefs = _componentRefs!;

	if (!_componentIsMounting) {
		componentRefs.refs[hookIndex]?.cleanup?.();
	}

	if (handler) {
		const transform = _renderContext!.getTransform();
		const currentClippingStack = Array.from(clippingStack);

		if (type === 'mouseover' || type === 'mouseout') {
			if (!componentRefs.refs[hookIndex]) {
				componentRefs.refs[hookIndex] = { isOver: false, cleanup: null };
			}
			const state = componentRefs.refs[hookIndex];

			const mouseMoveHandlers = _currentCRCInstance!.events.mousemove;
			const overOrOutMoveHandler = (e: MouseEvent) => {
				const canvas = e.target as HTMLCanvasElement;
				const wasOver = state.isOver;
				const [x, y] = getMouseCoordinates(e);

				const nowOver =
					!path ||
					isHit({
						canvas,
						path,
						transform,
						x,
						y,
						fill,
						lineInteractionWidth,
						currentClippingStack,
					});
				state.isOver = nowOver;

				if (type === 'mouseover') {
					if (!wasOver && nowOver) {
						handler({ originalEvent: e, x, y });
					}
				} else if (type === 'mouseout') {
					if (wasOver && !nowOver) {
						handler({ originalEvent: e, x, y });
					}
				}
			};

			mouseMoveHandlers.add(overOrOutMoveHandler);

			const mouseOutHandlers = _currentCRCInstance!.events.mouseout;
			const canvasMouseOutHandler = (e: MouseEvent) => {
				const wasOver = state.isOver;
				state.isOver = false;
				if (type === 'mouseout' && wasOver) {
					const [x, y] = getMouseCoordinates(e);
					handler({ originalEvent: e, x, y });
				}
			};

			mouseOutHandlers.add(canvasMouseOutHandler);

			state.cleanup = () => {
				mouseOutHandlers.delete(canvasMouseOutHandler);
				mouseMoveHandlers.delete(overOrOutMoveHandler);
			};

			componentRefs.teardowns.add(() => {
				state.cleanup();
				componentRefs.refs[hookIndex] = null;
			});
		} else {
			const handlers = _currentCRCInstance!.events[type];
			const actualHandler = (e: MouseEvent) => {
				const canvas = e.target as HTMLCanvasElement;
				const [x, y] = getMouseCoordinates(e);
				if (
					!path ||
					isHit({
						canvas,
						path,
						transform,
						x,
						y,
						fill,
						lineInteractionWidth,
						currentClippingStack,
					})
				) {
					handler({ originalEvent: e, x, y });
				}
			};
			handlers.add(actualHandler);

			const cleanup = () => handlers.delete(actualHandler);
			_componentRefs!.refs[hookIndex] = { cleanup };
		}
	} else {
		_componentRefs!.refs[hookIndex] = null;
	}
}

function wireCommonEvents(
	props: CRCBasicMouseEvents & CursorStyleProps,
	path: Path2D | undefined,
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
		onMouseDown,
		onMouseUp,
	} = props;

	crcEvent('click', onClick, path, fill, lineInteractionWidth);
	crcEvent('contextmenu', onContextMenu, path, fill, lineInteractionWidth);
	crcEvent('dblclick', onDblClick, path, fill, lineInteractionWidth);
	crcEvent('mousemove', onMouseMove, path, fill, lineInteractionWidth);
	crcEvent('mousedown', onMouseDown, path, fill, lineInteractionWidth);
	crcEvent('mouseup', onMouseUp, path, fill, lineInteractionWidth);
	crcEvent('mouseover', onMouseOver, path, fill, lineInteractionWidth);
	crcEvent('mouseout', onMouseOut, path, fill, lineInteractionWidth);

	crcCursor({
		path,
		style: props.cursor,
		fill,
		lineInteractionWidth,
	});
}

function Rect(props: RectProps, ctx: RenderingContext2D) {
	let { x, y, width, height, alignToPixelGrid, ...pathProps } = props;

	if (alignToPixelGrid) {
		({ x, y, width, height } = adjustRectangleToPixelGrid(
			props.lineWidth ?? 0,
			x,
			y,
			width,
			height,
			alignToPixelGrid,
		));
	}

	const rectPath = new Path2D();
	rectPath.rect(x, y, width, height);

	Path(
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
	extends IntrinsicProps,
		CRCBasicMouseEvents,
		CursorStyleProps,
		StrokeStyleProps {
	coords: [number, number][];
	lineInteractionWidth?: number;
}

export function Line(props: LineProps, ctx: RenderingContext2D) {
	const { coords, ...pathProps } = props;
	const linePath = createLinePath(coords);

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
	extends IntrinsicProps,
		CRCBasicMouseEvents,
		CursorStyleProps,
		StrokeStyleProps {
	x: number;
	top?: number;
	bottom?: number;
	alignToPixelGrid?: PixelGridAlignment;
	lineInteractionWidth?: number;
}

export function VerticalLine(
	props: VerticalLineProps,
	ctx: RenderingContext2D,
) {
	const {
		x: initialX,
		top = 0,
		bottom = ctx.canvas.height,
		alignToPixelGrid = 'none',
		...lineProps
	} = props;
	const x = adjustForPixelGrid(initialX, props.lineWidth, alignToPixelGrid);
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
	extends IntrinsicProps,
		CRCBasicMouseEvents,
		CursorStyleProps,
		StrokeStyleProps {
	y: number;
	left?: number;
	right?: number;
	alignToPixelGrid?: PixelGridAlignment;
	lineInteractionWidth?: number;
}

export function HorizontalLine(
	props: HorizontalLineProps,
	ctx: RenderingContext2D,
) {
	const {
		y: initialY,
		left = 0,
		right = ctx.canvas.width,
		alignToPixelGrid,
		...lineProps
	} = props;
	const y = alignToPixelGrid
		? adjustForPixelGrid(initialY, props.lineWidth, alignToPixelGrid)
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
	extends IntrinsicProps,
		CRCBasicMouseEvents,
		AlphaProps,
		CursorStyleProps,
		StrokeStyleProps {
	src: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
	alignToPixelGrid?: PixelGridAlignment;
}

function Img(props: ImgProps, ctx: RenderingContext2D) {
	let {
		alpha,
		src,
		x,
		y,
		width,
		height,
		lineWidth,
		strokeStyle,
		alignToPixelGrid,
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

	width = width ?? image?.width ?? 0;
	height = height ?? image?.height ?? 0;

	const imagePath = crcRectPath(x, y, width, height, {
		alignToPixelGrid,
		lineWidth,
	});

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

	wireCommonEvents(otherProps, imagePath, true, lineWidth ?? 0);
}

/**
 * Creates a renderable Img component element.
 */
export const img = defineComp(Img);

export interface SvgPathProps
	extends IntrinsicProps,
		CRCBasicMouseEvents,
		FillStyleProps,
		StrokeStyleProps,
		AlphaProps,
		CursorStyleProps {
	d: string;
}

function SvgPath(props: SvgPathProps, ctx: RenderingContext2D) {
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

export interface GProps extends IntrinsicProps {
	children: CRCNode[];
	scaleX?: number;
	scaleY?: number;
	rotate?: number;
	rotateOrigin?: [number, number];
	x?: number;
	y?: number;
	skewX?: number;
	skewY?: number;
	clipFillRule?: CanvasFillRule;
}

function G(props: GProps, ctx: RenderingContext2D) {
	let transform = ctx.getTransform();

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
	if (x !== 0 || y !== 0) {
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
	extends IntrinsicProps,
		CRCBasicMouseEvents,
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
	overflow?: 'visible' | 'squish' | 'ellipsis' | 'clip';
	wordWrap?: boolean;
	font?: string;
	textBaseline?: CanvasTextBaseline;
	textAlign?: CanvasTextAlign;
}

function checkPropsForEvents(props: CRCBasicMouseEvents) {
	return !!(
		props.onClick ||
		props.onContextMenu ||
		props.onDblClick ||
		props.onMouseDown ||
		props.onMouseMove ||
		props.onMouseOut ||
		props.onMouseOver ||
		props.onMouseUp
	);
}

export function Text(props: TextProps, ctx: RenderingContext2D) {
	const {
		font = '13px sans-serif',
		textBaseline = 'top',
		textAlign = 'left',
		overflow = 'visible',
	} = props;

	ctx.font = font;
	ctx.textBaseline = textBaseline;
	ctx.textAlign = textAlign;

	const {
		strokeStyle,
		lineWidth = 0,
		fillStyle,
		x,
		maxWidth = undefined,
	} = props;

	const renderText = (txt: string, y: number) => {
		const squishMaxWidth = overflow === 'squish' ? maxWidth : undefined;

		if (strokeStyle && lineWidth) {
			ctx.strokeStyle = strokeStyle;
			ctx.lineWidth = lineWidth;
			ctx.strokeText(txt, x, y, squishMaxWidth);
		}

		if (fillStyle) {
			ctx.fillStyle = fillStyle;
			ctx.fillText(txt, x, y, squishMaxWidth);
		}
	};

	const {
		y,
		wordWrap,
		text: inputText,
		lineHeight = 13,
		maxHeight = Infinity,
	} = props;

	const hasAnyEvents = checkPropsForEvents(props);

	let textPath: Path2D | undefined;

	if (wordWrap) {
		const words = inputText.split(' ');
		let line = '';
		let lineCount = 0;

		let textWidth = 0;
		let textHeight = 0;

		const updateTextBounds = (line: string) => {
			const bounds = ctx.measureText(line);
			textWidth = Math.max(bounds.width);
			textHeight =
				lineCount * lineHeight +
				bounds.actualBoundingBoxDescent -
				bounds.actualBoundingBoxAscent;
		};

		if (overflow === 'clip' && maxWidth) {
			const clipPath = new Path2D();
			clipPath.rect(x, y, maxWidth, maxHeight);
			ctx.clip(clipPath);
		}

		while (words.length) {
			const currentYOffset = lineCount * lineHeight;
			const nextYOffset = currentYOffset + lineHeight;
			if (maxHeight < nextYOffset + lineHeight) {
				const remaining = words.join(' ');
				const lastLine =
					overflow === 'ellipsis' && maxWidth
						? getEllipsisText(ctx, remaining, maxWidth)
						: remaining;
				if (hasAnyEvents) {
					updateTextBounds(lastLine);
				}
				renderText(lastLine, y + currentYOffset);
				break;
			} else {
				if ((maxWidth ?? Infinity) < ctx.measureText(line + words[0]).width) {
					if (hasAnyEvents) {
						updateTextBounds(line);
					}
					renderText(line, y + currentYOffset);
					line = '';
					lineCount++;
				}
				line += words.shift() + ' ';
			}
		}

		if (hasAnyEvents) {
			textPath = new Path2D();
			textPath.rect(x, y, textWidth, textHeight);
		}
	} else {
		const text =
			overflow === 'ellipsis' && maxWidth
				? getEllipsisText(ctx, inputText, maxWidth)
				: inputText;

		if (overflow === 'clip' && maxWidth) {
			const clipPath = new Path2D();
			const xd =
				textAlign === 'end' || textAlign === 'right'
					? -1
					: textAlign === 'center'
					? 0.5
					: 1;
			const yd =
				textBaseline === 'bottom' ? -1 : textBaseline === 'middle' ? 0.5 : 1;
			const pw = maxWidth * xd;
			const ph = maxHeight * yd;
			clipPath.rect(x, y, pw, ph);
			ctx.clip(clipPath);
		}

		renderText(text, y);

		if (hasAnyEvents) {
			const bounds = ctx.measureText(text);
			const textWidth = bounds.width;
			const textHeight =
				bounds.actualBoundingBoxDescent - bounds.actualBoundingBoxAscent;

			textPath = new Path2D();
			textPath.rect(x, y, textWidth, textHeight);
		}
	}

	wireCommonEvents(props, textPath, true, lineWidth);
}

export const text = defineComp(Text);

function getEllipsisText(
	renderContext: { measureText(text: string): TextMetrics },
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
	renderContext: { measureText(text: string): TextMetrics },
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

export interface LayerProps extends IntrinsicProps {
	render: CompEl;
}

export function Layer(props: LayerProps, ctx: RenderingContext2D) {
	if (_componentIsMounting) {
		console.log('mounting layer');
		const offscreenCanvas = new OffscreenCanvas(_canvas.width, _canvas.height);
		mountCRC(offscreenCanvas, props.render, { parent: _canvas });
		_componentRefs.refs[0] = offscreenCanvas;
	}

	const offscreenCanvas = _componentRefs.refs[0];
	const layerCRC = crcInstances.get(offscreenCanvas);

	console.log({
		isMounting: _componentIsMounting,
		sizeChanged:
			offscreenCanvas.width !== _canvas.width ||
			offscreenCanvas.height !== _canvas.height,
		propsChanged: !shallowEquals(layerCRC.root.props, props.render.props),
		oldProps: layerCRC.root.props,
		newProps: props.render.props,
	});
	if (
		_componentIsMounting ||
		offscreenCanvas.width !== _canvas.width ||
		offscreenCanvas.height !== _canvas.height ||
		!shallowEquals(layerCRC.root.props, props.render.props)
	) {
		offscreenCanvas.width = _canvas.width;
		offscreenCanvas.height = _canvas.height;
		console.log('rendering');
		executeRender(
			offscreenCanvas,
			_currentCRCInstance.renderTimestamp,
			layerCRC.root,
			false,
		);
	}

	ctx.drawImage(offscreenCanvas, 0, 0);
}

export const layer = defineComp(Layer);

////////////////////////////////////////////////////////////////////////////////////////
// Utility functions
////////////////////////////////////////////////////////////////////////////////////////

function shallowEquals(obj1: any, obj2: any): boolean {
	if (obj1 === obj2) {
		return true;
	}
	const keys1 = Object.keys(obj1);
	const keys2 = Object.keys(obj2);
	if (keys1.length !== keys2.length) {
		return false;
	}
	for (const key of keys1) {
		if (obj1[key] !== obj2[key]) {
			return false;
		}
	}
	return true;
}

const recentCoords = new WeakMap<MouseEvent, readonly [number, number]>();

function getMouseCoordinates(event: MouseEvent): readonly [number, number] {
	if (recentCoords.has(event)) {
		return recentCoords.get(event)!;
	}
	const target = event.target as HTMLElement;
	const bounds = target.getBoundingClientRect();
	const x = event.clientX - bounds.left;
	const y = event.clientY - bounds.top;
	const result = [x, y] as const;
	recentCoords.set(event, result);
	return result;
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

function get2dContext(canvas: Canvas): RenderingContext2D {
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Unable to get 2d context!');
	}
	return ctx as any;
}

function calculatePixelGridOffset(lineWidth: number) {
	return ((lineWidth ?? 0) / 2) % 1;
}

function adjustForPixelGrid(
	value: number,
	lineWidth: number | undefined,
	alignment: undefined | PixelGridAlignment,
) {
	if (!alignment || alignment === 'none') {
		return value;
	}

	return Math[alignment](value) - calculatePixelGridOffset(lineWidth ?? 0);
}

function getScaleMatrix(matrix: DOMMatrix) {
	const { m11, m22 } = matrix;
	return new DOMMatrix([m11, 0, 0, 0, 0, m22, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

const TRANSPARENT_REGEXP = /^(hsla|rgba)\(.*,\s*0\s*\)$/;

function isTransparent(style: string | CanvasGradient | CanvasPattern) {
	return (
		typeof style === 'string' &&
		(style === 'transparent' || TRANSPARENT_REGEXP.test(style))
	);
}

function createLinePath(
	coords: [number, number][],
	config?: { closePath?: boolean },
) {
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
}

/**
 * AbortSignal is SLOW AS A DEAD TURTLE to deal with because of
 * addEventListener and removeEventListener. Strong avoid.
 */
class Teardowns {
	private readonly _teardowns = new Set<() => void>();
	private _closed = false;

	get closed() {
		return this._closed;
	}

	follow(parentTeardown: Teardowns) {
		const handler = () => {
			this.execute();
		};
		parentTeardown.add(handler);
		this.add(() => parentTeardown.remove(handler));
	}

	add(teardown: () => void) {
		if (this._closed) {
			teardown();
		} else {
			this._teardowns.add(teardown);
		}
	}

	remove(teardown: () => void) {
		this._teardowns.delete(teardown);
	}

	execute() {
		if (!this._closed) {
			this._closed = true;
			for (const teardown of this._teardowns) {
				teardown();
			}
			this._teardowns.clear();
		}
	}
}
