import { Story, Meta } from '@storybook/html';
import { crc, line, LineProps } from '../index';

export default {
	title: 'Example/line',
} as Meta;

const Template: Story<LineProps> = (args) => {
	const canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 500;
	crc(canvas, line(args));
	return canvas;
};

export const BasicProperties = Template.bind({});
// More on args: https://storybook.js.org/docs/html/writing-stories/args
BasicProperties.args = {
	coords: [
		[0, 0],
		[100, 100],
		[200, 0],
		[300, 100],
		[400, 0],
		[500, 100],
	],
	lineWidth: 2,
	strokeStyle: 'blue',
	cursor: 'pointer',
	lineInteractionWidth: 100,
};
