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

export type CanvasMouseEventHandler = (e: MouseEvent) => void;

export type CanvasCompRenderer = (
	ctx: CanvasRenderingContext2D,
	eventRegistry: EventRegistry,
	parentId: string,
) => void;

export interface CanvasMouseEventConfig {
	id: string;
	include?: 'stroke' | 'fill' | 'all';
	lineWidth?: number;
}

export interface EventRegistry {
	onClick: (
		path: Path2D,
		handler: CanvasMouseEventHandler,
		config: CanvasMouseEventConfig,
	) => void;
	onDblClick: (
		path: Path2D,
		handler: CanvasMouseEventHandler,
		config: CanvasMouseEventConfig,
	) => void;
	onContextMenu: (
		path: Path2D,
		handler: CanvasMouseEventHandler,
		config: CanvasMouseEventConfig,
	) => void;
	onMouseOver: (
		path: Path2D,
		handler: CanvasMouseEventHandler,
		config: CanvasMouseEventConfig,
	) => void;
	onMouseOut: (
		path: Path2D,
		handler: CanvasMouseEventHandler,
		config: CanvasMouseEventConfig,
	) => void;
	onMouseMove: (
		path: Path2D,
		handler: CanvasMouseEventHandler,
		config: CanvasMouseEventConfig,
	) => void;
}

interface EventRegistrant {
	path: Path2D;
	transform: DOMMatrix;
	config: CanvasMouseEventConfig;
	handler: CanvasMouseEventHandler;
}

// Global during render.
let _trackId: (id: string) => void;

export function createRenderingContext(canvas: HTMLCanvasElement) {
	const actualContext = canvas.getContext('2d');

	if (!actualContext) {
		throw new TypeError('Unable to create 2d context');
	}

	const transformStack: DOMMatrix[] = [actualContext.getTransform()];
	const saveStack: DOMMatrix[] = [actualContext.getTransform()];

	const getCurrentTransform = () => transformStack[transformStack.length - 1];

	const isInPath = (
		path: Path2D,
		transform: DOMMatrix,
		x: number,
		y: number,
		config?: CanvasMouseEventConfig,
	) => {
		actualContext.save();
		actualContext.setTransform(transform);

		const include = config?.include ?? 'fill';

		let result = false;

		if (include === 'all' || include === 'fill') {
			result = result || actualContext.isPointInPath(path, x, y);
		}

		if (include === 'all' || include === 'stroke') {
			actualContext.lineWidth = config?.lineWidth ?? 0;
			result = result || actualContext.isPointInStroke(path, x, y);
		}

		actualContext.restore();
		return result;
	};

	const clickHandlers: EventRegistrant[] = [];

	const dblclickHandlers: EventRegistrant[] = [];

	const contextMenuHandlers: EventRegistrant[] = [];

	const mouseOverHandlers: EventRegistrant[] = [];

	const mouseOutHandlers: EventRegistrant[] = [];

	const mouseMoveHandlers: EventRegistrant[] = [];

	const clearEventRegistry = () => {
		clickHandlers.length = 0;
		dblclickHandlers.length = 0;
		contextMenuHandlers.length = 0;
		mouseOverHandlers.length = 0;
		mouseOutHandlers.length = 0;
		mouseMoveHandlers.length = 0;
	};

	const onClick: EventRegistry['onClick'] = (path, handler, config) => {
		clickHandlers.push({
			path,
			transform: getCurrentTransform(),
			handler,
			config,
		});
	};

	const onDblClick: EventRegistry['onDblClick'] = (path, handler, config) => {
		dblclickHandlers.push({
			path,
			transform: getCurrentTransform(),
			handler,
			config,
		});
	};

	const onContextMenu: EventRegistry['onContextMenu'] = (
		path,
		handler,
		config,
	) => {
		contextMenuHandlers.push({
			path,
			transform: getCurrentTransform(),
			handler,
			config,
		});
	};

	const onMouseOver: EventRegistry['onMouseOver'] = (path, handler, config) => {
		mouseOverHandlers.push({
			path,
			transform: getCurrentTransform(),
			handler,
			config,
		});
	};

	const onMouseOut: EventRegistry['onMouseOut'] = (path, handler, config) => {
		mouseOutHandlers.push({
			path,
			transform: getCurrentTransform(),
			handler,
			config,
		});
	};

	const onMouseMove: EventRegistry['onMouseMove'] = (path, handler, config) => {
		mouseMoveHandlers.push({
			path,
			transform: getCurrentTransform(),
			handler,
			config,
		});
	};

	const eventRegistry: EventRegistry = {
		onClick,
		onDblClick,
		onContextMenu,
		onMouseOver,
		onMouseOut,
		onMouseMove,
	};

	const ac = new AbortController();

	const subscription = {
		unsubscribe() {
			if (!ac.signal.aborted) {
				clearEventRegistry();
				ac.abort();
			}
		},
	};

	canvas.addEventListener(
		'click',
		(e) => {
			const [x, y] = getMousePosition(e);
			for (const { path, transform, handler, config } of clickHandlers) {
				if (isInPath(path, transform, x, y, config)) {
					try {
						handler(e);
					} catch (err) {
						reportError(err);
					}
				}
			}
		},
		{ signal: ac.signal },
	);

	canvas.addEventListener(
		'dblclick',
		(e) => {
			const [x, y] = getMousePosition(e);
			for (const { path, transform, handler, config } of dblclickHandlers) {
				if (isInPath(path, transform, x, y, config)) {
					try {
						handler(e);
					} catch (err) {
						reportError(err);
					}
				}
			}
		},
		{ signal: ac.signal },
	);

	canvas.addEventListener(
		'contextmenu',
		(e) => {
			const [x, y] = getMousePosition(e);
			for (const { path, transform, handler, config } of contextMenuHandlers) {
				if (isInPath(path, transform, x, y, config)) {
					try {
						handler(e);
					} catch (err) {
						reportError(err);
					}
				}
			}
		},
		{ signal: ac.signal },
	);

	const trackedMouseOutPaths = new Set<string>();
	const trackedMouseOverPaths = new Set<string>();

	let maybeDelete = new Set<string>();

	const beginRender = () => {
		clearEventRegistry();
		maybeDelete = new Set([...trackedMouseOutPaths, ...trackedMouseOverPaths]);
		_trackId = (id: string) => {
			maybeDelete.delete(id);
		};
	};

	const endRender = () => {
		for (const id of maybeDelete) {
			trackedMouseOutPaths.delete(id);
			trackedMouseOverPaths.delete(id);
		}
	};

	canvas.addEventListener('mousemove', (e) => {
		const [x, y] = getMousePosition(e);
		for (const { path, transform, handler, config } of mouseMoveHandlers) {
			if (isInPath(path, transform, x, y, config)) {
				try {
					handler(e);
				} catch (err) {
					reportError(err);
				}
			}
		}

		for (const { path, transform, handler, config } of mouseOutHandlers) {
			if (isInPath(path, transform, x, y, config)) {
				trackedMouseOutPaths.add(config.id);
			} else if (trackedMouseOutPaths.has(config.id)) {
				trackedMouseOutPaths.delete(config.id);
				try {
					handler(e);
				} catch (err) {
					reportError(err);
				}
			}
		}

		for (const { path, transform, handler, config } of mouseOverHandlers) {
			if (isInPath(path, transform, x, y, config)) {
				trackedMouseOverPaths.delete(config.id);
				try {
					handler(e);
				} catch (err) {
					reportError(err);
				}
			} else if (trackedMouseOverPaths.has(config.id)) {
				trackedMouseOverPaths.add(config.id);
			}
		}
	});

	const renderContext = new Proxy(actualContext, {
		set(target, prop, reciever) {
			return Reflect.set(target, prop, reciever);
		},
		get(target, prop) {
			switch (prop) {
				case 'rotate':
				case 'translate':
				case 'scale':
				case 'transform':
				case 'setTransform':
					return (...args: unknown[]) => {
						const result = (target[prop] as any)(...args);
						transformStack.push(target.getTransform());
						return result;
					};

				case 'save':
					return () => {
						const result = target[prop]();
						saveStack.push(transformStack[transformStack.length - 1]);
						return result;
					};

				case 'restore':
					return function () {
						const result = target[prop]();
						const jumpTo = saveStack.pop();
						while (transformStack[transformStack.length - 1] !== jumpTo) {
							transformStack.pop();
						}
						return result;
					};
				case 'resetTransform':
					return () => {
						const result = target[prop]();
						transformStack.length = 1;
						saveStack.length = 1;
						return result;
					};
			}

			const result = (target as any)[prop];

			if (typeof result === 'function') {
				return (...args: any[]) => (target as any)[prop](...args);
			}
			return result;
		},
	});

	return {
		renderContext,
		eventRegistry,
		subscription,
		beginRender,
		endRender,
	} as const;
}

export function createRenderer(canvas: HTMLCanvasElement) {
	const {
		renderContext: ctx,
		eventRegistry,
		subscription,
		beginRender,
		endRender,
	} = createRenderingContext(canvas);

	const render = (comp: CanvasCompRenderer) => {
		beginRender();
		ctx.save();
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		_trackId('#root');
		comp(ctx, eventRegistry, '#root');
		ctx.restore();
		endRender();
	};

	return {
		render,
		remove() {
			subscription.unsubscribe();
		},
	};
}

export function getMousePosition(e: MouseEvent): [number, number] {
	const bounds = (e.target as HTMLElement).getBoundingClientRect();
	const x = e.clientX - bounds.left;
	const y = e.clientY - bounds.top;
	return [x, y];
}

type FillStyle = CanvasRenderingContext2D['fillStyle'];
type StrokeStyle = CanvasRenderingContext2D['strokeStyle'];

interface LineStyle {
	strokeStyle?: StrokeStyle;
	lineWidth?: number;
}

interface PathStyle {
	fillStyle?: FillStyle;
	strokeStyle?: StrokeStyle;
	lineWidth?: number;
	cursor?: string;
}

interface PathEvents {
	onClick?: (e: MouseEvent) => void;
	onDblClick?: (e: MouseEvent) => void;
	onContextMenu?: (e: MouseEvent) => void;
	onMouseOver?: (e: MouseEvent) => void;
	onMouseOut?: (e: MouseEvent) => void;
	onMouseMove?: (e: MouseEvent) => void;
}

function handleCursorStyle(
	ctx: CanvasRenderingContext2D,
	eventRegistry: EventRegistry,
	path: Path2D,
	cursor: string,
	eventConfig: CanvasMouseEventConfig,
) {
	const canvas = ctx.canvas;
	eventRegistry.onMouseOver(
		path,
		() => {
			canvas.style.cursor = cursor;
		},
		eventConfig,
	);
	eventRegistry.onMouseOut(
		path,
		() => {
			canvas.style.removeProperty('cursor');
		},
		eventConfig,
	);
}

export function rect(props: {
	x: number;
	y: number;
	width: number;
	height: number;
	style?: PathStyle;
	events?: PathEvents;
}): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		const { x, y, width, height, style, events } = props;

		const fillStyle = style?.fillStyle;
		if (fillStyle) {
			ctx.fillStyle = fillStyle;
			ctx.fillRect(x, y, width, height);
		}

		const { strokeStyle, lineWidth } = style ?? {};
		if (strokeStyle && lineWidth) {
			ctx.strokeStyle = strokeStyle;
			ctx.lineWidth = lineWidth;
			ctx.strokeRect(x, y, width, height);
		}

		const path = new Path2D();
		path.rect(x, y, width, height);

		const id = `${parentId}:rect`;
		_trackId(id);

		const eventConfig: CanvasMouseEventConfig = {
			id,
			include: 'all',
			lineWidth: style?.lineWidth ?? 0,
		};

		if (events) {
			manageEvents(events, eventRegistry, path, eventConfig);
		}

		if (style?.cursor) {
			handleCursorStyle(ctx, eventRegistry, path, style?.cursor, eventConfig);
		}

		ctx.restore();
	};
}

function manageEvents(
	events: PathEvents,
	eventRegistry: EventRegistry,
	path: Path2D,
	config: CanvasMouseEventConfig,
) {
	for (const [eventKey, handler] of Object.entries(events)) {
		(eventRegistry as any)[eventKey](path, handler, config);
	}
}

export function line(props: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	style?: LineStyle & { cursor?: string };
	hitPadding?: number;
	events?: PathEvents;
}): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		const { x1, y1, x2, y2, style, hitPadding = 5, events } = props;

		const { lineWidth = 1, strokeStyle } = style ?? {};

		const path = new Path2D();
		path.moveTo(x1, y1);
		path.lineTo(x2, y2);

		if (strokeStyle) {
			ctx.strokeStyle = strokeStyle;
			ctx.lineWidth = lineWidth;
			ctx.stroke(path);
		}

		const id = `${parentId}:line`;
		_trackId(id);

		const eventConfig: CanvasMouseEventConfig = {
			id,
			include: 'all',
			lineWidth: (style?.lineWidth ?? 0) + hitPadding,
		};

		if (events) {
			manageEvents(events, eventRegistry, path, eventConfig);
		}

		if (style?.cursor) {
			handleCursorStyle(ctx, eventRegistry, path, style.cursor, eventConfig);
		}

		ctx.restore();
	};
}

export function verticalLine(props: {
	x: number;
	y1?: number;
	y2?: number;
	style?: LineStyle;
	hitPadding?: number;
	events?: PathEvents;
}): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		const { x, y1 = 0, y2 = ctx.canvas.height, ...rest } = props;
		return line({ ...rest, x1: x, x2: x, y1, y2 })(
			ctx,
			eventRegistry,
			parentId,
		);
	};
}

export function horizontalLine(props: {
	y: number;
	x1?: number;
	x2?: number;
	style?: LineStyle;
	hitPadding?: number;
	events?: PathEvents;
}): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		const { y, x1 = 0, x2 = ctx.canvas.width, ...rest } = props;
		return line({ ...rest, x1, x2, y1: y, y2: y })(
			ctx,
			eventRegistry,
			parentId,
		);
	};
}

export function img(props: {
	img: HTMLImageElement;
	x: number;
	y: number;
	width?: number;
	height?: number;
	style?: LineStyle & { cursor?: string };
	events?: PathEvents;
}): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		const {
			img,
			x,
			y,
			width = img.width,
			height = img.height,
			style,
			events,
		} = props;
		ctx.drawImage(img, x, y, width, height);

		const { lineWidth, strokeStyle } = style ?? {};

		if (lineWidth && strokeStyle) {
			ctx.strokeStyle = strokeStyle;
			ctx.lineWidth = lineWidth;
			ctx.strokeRect(x, y, width, height);
		}

		const path = new Path2D();
		path.rect(x, y, width, height);

		const id = `${parentId}:img`;
		_trackId(id);

		const eventConfig: CanvasMouseEventConfig = {
			id,
			include: lineWidth ? 'all' : 'fill',
			lineWidth: lineWidth,
		};

		if (events) {
			manageEvents(events, eventRegistry, path, eventConfig);
		}

		if (style?.cursor) {
			handleCursorStyle(ctx, eventRegistry, path, style.cursor, eventConfig);
		}

		ctx.restore();
	};
}

export function group(children: CanvasCompRenderer[]): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			ctx.save();
			const id = `${parentId}:${i}`;
			_trackId(id);
			child(ctx, eventRegistry, id);
			ctx.restore();
		}
	};
}

export function scale(
	scale: number | [number, number],
	renderer: CanvasCompRenderer,
): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		const [x, y] = Array.isArray(scale) ? scale : [scale, scale];
		ctx.scale(x, y);
		const id = `${parentId}:scale`;
		_trackId(id);
		renderer(ctx, eventRegistry, id);
		ctx.restore();
	};
}

export function translate(
	x: number,
	y: number,
	renderer: CanvasCompRenderer,
): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		ctx.translate(x, y);
		const id = `${parentId}:translate`;
		_trackId(id);
		renderer(ctx, eventRegistry, id);
		ctx.restore();
	};
}

export function rotate(
	angle: number,
	renderer: CanvasCompRenderer,
): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		ctx.rotate(angle);
		const id = `${parentId}:rotate`;
		_trackId(id);
		renderer(ctx, eventRegistry, id);
		ctx.restore();
	};
}

export function transform(
	matrix: DOMMatrix,
	renderer: CanvasCompRenderer,
): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		ctx.setTransform(matrix);
		renderer(ctx, eventRegistry, `${parentId}:${matrix}`);
		ctx.restore();
	};
}

export function clipRect(
	rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	},
	renderer: CanvasCompRenderer,
) {
	const path = new Path2D();
	path.rect(rect.x, rect.y, rect.width, rect.height);
	return clip(path, renderer);
}

export function clip(
	path: Path2D,
	renderer: CanvasCompRenderer,
): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		ctx.clip(path);
		const id = parentId + ':clip';
		_trackId(id);
		renderer(ctx, eventRegistry, id);
		ctx.restore();
	};
}

export function text(props: {
	text: string;
	x: number;
	y: number;
	style: PathStyle & {
		textAlign?: CanvasTextAlign;
		textBaseline?: CanvasTextBaseline;
		overflow?: 'visible' | 'ellipsis';
		maxWidth?: number;
		maxHeight?: number;
		wordWrap?: boolean;
		font?: string;
		lineHeight?: number;
	};
	events?: PathEvents;
}): CanvasCompRenderer {
	return (ctx, eventRegistry, parentId) => {
		ctx.save();
		const { x, y, style, events } = props;

		const {
			strokeStyle,
			fillStyle,
			lineWidth,
			textAlign,
			textBaseline,
			font,
			maxWidth = Infinity,
			maxHeight = Infinity,
			lineHeight = 20,
			overflow,
			wordWrap = false,
		} = style;

		ctx.font = font ?? '13px sans-serif';
		ctx.textBaseline = textBaseline ?? 'top';
		ctx.textAlign = textAlign ?? 'left';

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

		if (wordWrap) {
			const words = props.text.split(' ');
			let line = '';
			let lineCount = 0;

			while (words.length) {
				if (maxHeight < y + lineCount * lineHeight + lineHeight) {
					const remaining = words.join(' ');
					const lastLine =
						overflow === 'ellipsis' && maxWidth
							? getEllipsisText(ctx, remaining, maxWidth)
							: remaining;

					renderText(lastLine, y + lineCount * lineHeight);
				} else {
					if (maxWidth < ctx.measureText(line + words[0]).width) {
						const bounds = ctx.measureText(line);
						textWidth = Math.max(bounds.width);
						textHeight =
							lineCount * lineHeight +
							bounds.actualBoundingBoxDescent -
							bounds.actualBoundingBoxAscent;
						renderText(line, y + lineCount * lineHeight);
						line = '';
						lineCount++;
					}
					line += words.shift() + ' ';
				}
			}
		} else {
			const text =
				overflow === 'ellipsis' && maxWidth
					? getEllipsisText(ctx, props.text, maxWidth)
					: props.text;

			renderText(text, y);

			const bounds = ctx.measureText(text);
			textWidth = bounds.width;
			textHeight =
				bounds.actualBoundingBoxDescent - bounds.actualBoundingBoxAscent;
		}

		if (events || style.cursor) {
			const id = `${parentId}:text`;
			_trackId(id);
			const path = new Path2D();
			path.rect(x, y, textWidth, textHeight);

			const eventConfig: CanvasMouseEventConfig = {
				id,
				include: lineWidth ? 'all' : 'fill',
				lineWidth: lineWidth,
			};

			if (events) {
				manageEvents(events, eventRegistry, path, eventConfig);
			}

			if (style.cursor) {
				handleCursorStyle(ctx, eventRegistry, path, style.cursor, eventConfig);
			}
		}

		ctx.restore();
	};
}

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
