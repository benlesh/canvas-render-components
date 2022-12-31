import { Story, Meta } from '@storybook/html';
import { crc, CRCMouseEvent, crcState, defineComp, rect, text } from '../index';

export default {
	title: 'Example/custom-components',
} as Meta;

const Template: Story<{}> = (args) => {
	const canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 500;
	crc(canvas, counterComponent(args));
	return canvas;
};

export const CounterComponentExample: Story<{}> = Template.bind({});

CounterComponentExample.args = {};

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

const customButton = defineComp(CustomButton);

function CounterComponent() {
	const [count, setCount] = crcState(0);

	return customButton({
		x: 10,
		y: 10,
		width: 100,
		height: 40,
		label: count.toString(),
		onClick: () => setCount(count + 1),
	});
}

const counterComponent = defineComp(CounterComponent);
