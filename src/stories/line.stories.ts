import { Meta } from '@storybook/html';
import { line } from '../index';
import { createTemplate } from './util';

export default {
	title: 'Example/line',
} as Meta;

const template = createTemplate(line);

export const BasicProperties = template({
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
});
