import { Meta } from '@storybook/html';
import { rect } from '../index';
import { createTemplate } from './util';

export default {
	title: 'Example/rect',
} as Meta;

const template = createTemplate(rect);

export const BasicProperties = template({
	x: 10,
	y: 10,
	width: 100,
	height: 100,
	fillStyle: 'red',
	lineWidth: 2,
	strokeStyle: 'blue',
	cursor: 'pointer',
});
