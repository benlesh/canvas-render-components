import { Meta } from '@storybook/html';
import { horizontalLine } from '../../index';
import { createTemplate } from './../util';

export default {
	title: 'Components/horizontalLine',
} as Meta;

const template = createTemplate(horizontalLine);

export const BasicProperties = template({
	y: 100,
	lineWidth: 1,
	strokeStyle: 'blue',
	cursor: 'pointer',
	lineInteractionWidth: 20,
	alignToPixelGrid: true,
});
