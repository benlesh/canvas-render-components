import { Meta } from '@storybook/html';
import {
	defineComp,
	RenderingContext2D,
	rect,
	text,
	crcRef,
	crcState,
	layer,
	crcMemo,
} from '../../index';
import { createTemplate } from '../util';

export default {
	title: 'Components/layer',
} as Meta;

function SimpleButton(
	{
		x,
		y,
		width,
		height,
		label,
		onClick,
		fillStyle,
	}: {
		x: number;
		y: number;
		width: number;
		height: number;
		label: string;
		onClick: () => void;
		fillStyle: string;
	},
	ctx: RenderingContext2D,
) {
	return [
		rect({
			x,
			y,
			width,
			height,
			onClick,
			cursor: 'pointer',
			fillStyle,
		}),
		text({
			x: x + width / 2,
			y: y + height / 2,
			text: label,
			textAlign: 'center',
			textBaseline: 'middle',
			fillStyle: 'black',
		}),
	];
}

const simpleButton = defineComp(SimpleButton);

function MyLayer(
	{
		y,
		name,
		onUpdateParent,
	}: { y: number; name: string; onUpdateParent: () => void },
	ctx: RenderingContext2D,
) {
	const [value, setValue] = crcState(0);

	const renderCountRef = crcRef(0);
	const renderCount = ++renderCountRef.current;

	return [
		text({
			x: 10,
			y: y + 10,
			text: `Layer ${name} render count: ${renderCount}`,
			fillStyle: 'black',
		}),
		simpleButton({
			x: 10,
			y: y + 40,
			width: 100,
			height: 30,
			label: `Update ${name}`,
			onClick: () => {
				setValue(value + 1);
			},
			fillStyle: 'rgba(220, 220, 220, 1)',
		}),
		simpleButton({
			x: 10,
			y: y + 80,
			width: 100,
			height: 30,
			label: `Update parent of ${name}`,
			onClick: onUpdateParent,
			fillStyle: 'rgba(220, 220, 220, 1)',
		}),
	];
}

const myLayer = defineComp(MyLayer);

function LayerDemo({}: any, ctx: RenderingContext2D) {
	const [value, setValue] = crcState(0);

	const renderCountRef = crcRef(0);
	const renderCount = ++renderCountRef.current;

	const handleUpdateParent = crcMemo(
		() => () => {
			setValue(value + 1);
		},
		[],
	);

	return [
		text({
			x: 10,
			y: 10,
			text: `Parent render count: ${renderCount}`,
			fillStyle: 'black',
		}),
		layer({
			key: 'Layer A',
			render: myLayer({
				y: 30,
				name: 'A',
				onUpdateParent: handleUpdateParent,
			}),
		}),
		layer({
			key: 'Layer B',
			render: myLayer({
				y: 200,
				name: 'B',
				onUpdateParent: handleUpdateParent,
			}),
		}),
	];
}

const layerDemo = defineComp(LayerDemo);

const template = createTemplate(layerDemo);

export const BasicProperties = template({
	x: 100,
	lineWidth: 1,
	strokeStyle: 'blue',
	cursor: 'pointer',
	lineInteractionWidth: 20,
	alignToPixelGrid: 'round',
});
