import { Story, Meta } from '@storybook/html';
import { crc, horizontalLine, HorizontalLineProps } from '../index';

export default {
	title: 'Example/horizontalLine',
} as Meta;

const Template: Story<HorizontalLineProps> = (args) => {
	const canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 500;
	crc(canvas, horizontalLine(args));
	return canvas;
};

export const BasicProperties = Template.bind({});
// More on args: https://storybook.js.org/docs/html/writing-stories/args
BasicProperties.args = {
	y: 100,
	lineWidth: 1,
	strokeStyle: 'blue',
	cursor: 'pointer',
	lineInteractionWidth: 20,
	alignToPixelGrid: true,
};
