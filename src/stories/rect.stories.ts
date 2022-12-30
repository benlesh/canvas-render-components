import { Story, Meta } from '@storybook/html';
import { crc, rect, RectProps } from '../index';

export default {
	title: 'Example/rect',
} as Meta;

const Template: Story<RectProps> = (args) => {
	const canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 500;
	crc(canvas, rect(args));
	return canvas;
};

export const BasicProperties = Template.bind({});
// More on args: https://storybook.js.org/docs/html/writing-stories/args
BasicProperties.args = {
	x: 10,
	y: 10,
	width: 100,
	height: 100,
	fillStyle: 'red',
	lineWidth: 2,
	strokeStyle: 'blue',
	cursor: 'pointer',
};
