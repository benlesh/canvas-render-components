import { Story, Meta } from '@storybook/html';
import { crc, g, rect, img, GProps } from '../index';

export default {
	title: 'Example/g',
} as Meta;

const Template: Story<GProps> = (args) => {
	const canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 500;
	crc(
		canvas,
		g({
			...args,
			children: [
				img({
					x: 0,
					y: 0,
					src: 'https://rxjs.dev/assets/images/logos/logo.png',
				}),
				rect({
					x: 100,
					y: 100,
					width: 100,
					height: 100,
					fillStyle: 'purple',
				}),
			],
		}),
	);
	return canvas;
};

export const BasicProperties: Story<GProps> = Template.bind({});
// More on args: https://storybook.js.org/docs/html/writing-stories/args
BasicProperties.args = {
	x: 100,
	y: 100,
	rotate: 20,
	rotateOrigin: [0, 0],
	scaleX: 1,
	scaleY: 1,
	skewX: 5,
	skewY: 5,
};
