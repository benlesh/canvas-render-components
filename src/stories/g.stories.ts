import { Meta } from '@storybook/html';
import { g, rect, img, GProps } from '../index';
import { createTemplate } from './util';

export default {
	title: 'Example/g',
} as Meta;

const template = createTemplate(groupExample);

export const BasicProperties = template({
	x: 100,
	y: 100,
	rotate: 20,
	rotateOrigin: [0, 0],
	scaleX: 1,
	scaleY: 1,
	skewX: 5,
	skewY: 5,
});

function groupExample(args: Omit<GProps, 'children'>) {
	return g({
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
	});
}
