import { Story, Meta } from '@storybook/html';
import { crc, img, ImgProps } from '../index';

export default {
	title: 'Example/img',
} as Meta;

const Template = (args) => {
	const canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 500;
	crc(canvas, img(args));
	return canvas;
};

export const BasicProperties: Story<ImgProps> = Template.bind({});
// More on args: https://storybook.js.org/docs/html/writing-stories/args
BasicProperties.args = {
	src: 'https://rxjs.dev/assets/images/logos/logo.png',
	cursor: 'pointer',
	strokeStyle: 'blue',
	lineWidth: 2,
	x: 10,
	y: 10,
	width: undefined,
	height: undefined,
};
