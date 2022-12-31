import { Meta } from '@storybook/html';
import { verticalLine } from '../index';
import { createTemplate } from './util';

export default {
	title: 'Example/verticalLine',
} as Meta;

const template = createTemplate(verticalLine);

export const BasicProperties = template({
	x: 100,
	lineWidth: 1,
	strokeStyle: 'blue',
	cursor: 'pointer',
	lineInteractionWidth: 20,
	alignToPixelGrid: true,
});
