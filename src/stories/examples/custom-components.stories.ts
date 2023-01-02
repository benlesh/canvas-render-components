import { Meta } from '@storybook/html';
import {
	CRCMouseEvent,
	crcState,
	defineComp,
	rect,
	RectProps,
	text,
} from '../../index';
import { createTemplate } from '../util';

export default {
	title: 'Example/custom-components',
} as Meta;

const customButton = defineComp(CustomButton);
const counterComponent = defineComp<{}>(CounterComponent);

const template = createTemplate(counterComponent);

export const CounterComponentExample = template({});

interface CustomButtonProps {
	x: number;
	y: number;
	width: number;
	height: number;
	label: string;
	onClick?: (e: CRCMouseEvent) => void;
}

function CustomButton(props: CustomButtonProps) {
	const { x, y, width, height } = props;

	const [state, setState] = crcState<'idle' | 'hover'>('idle');

	const fillStyle = state === 'idle' ? 'gray' : 'blue';
	const lineWidth = 2;
	const strokeStyle = state === 'idle' ? 'black' : 'white';

	return [
		rect({
			x,
			y,
			width,
			height,
			fillStyle,
			lineWidth,
			strokeStyle,
			cursor: 'pointer',
			onClick: props.onClick,
			onMouseOver: () => setState('hover'),
			onMouseOut: () => setState('idle'),
		}),
		text({
			x: x + width / 2,
			y: y + height / 2,
			text: props.label,
			textAlign: 'center',
			textBaseline: 'middle',
			fillStyle: strokeStyle,
			font: '20px Arial',
		}),
	];
}

function CounterComponent() {
	const [count, setCount] = crcState(0);

	return customButton({
		x: 10,
		y: 10,
		width: 100,
		height: 40,
		label: count.toString(),
		onClick: () => {
			setCount((c) => c + 1);
		},
	});
}
