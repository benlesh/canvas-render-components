import { Story, Meta } from '@storybook/html';
import { crc, verticalLine, VerticalLineProps } from '../index';

export default {
	title: 'Example/verticalLine',
} as Meta;

const Template: Story<VerticalLineProps> = (args) => {
	const canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 500;
	crc(canvas, verticalLine(args));
	return canvas;
};

export const BasicProperties = Template.bind({});
// More on args: https://storybook.js.org/docs/html/writing-stories/args
BasicProperties.args = {
	x: 100,
	lineWidth: 1,
	strokeStyle: 'blue',
	cursor: 'pointer',
	lineInteractionWidth: 20,
	alignToPixelGrid: true,
};
