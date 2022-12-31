import { Meta } from '@storybook/html';
import { img } from '../index';
import { createTemplate } from './util';

export default {
	title: 'Example/img',
} as Meta;

const template = createTemplate(img);

export const BasicProperties = template({
	src: 'https://rxjs.dev/assets/images/logos/logo.png',
	cursor: 'pointer',
	strokeStyle: 'blue',
	lineWidth: 2,
	x: 10,
	y: 10,
	width: undefined,
	height: undefined,
});
