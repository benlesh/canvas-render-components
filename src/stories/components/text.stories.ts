import { Meta } from '@storybook/html';
import { text } from '../../index';
import { createTemplate } from './../util';

export default {
	title: 'Components/text',
} as Meta;

const template = createTemplate(text);

export const BasicProperties = template({
	x: 10,
	y: 10,
	maxWidth: 400,
	maxHeight: 250,
	text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
	font: '20px Arial',
	lineHeight: 30,
	fillStyle: 'black',
	lineWidth: 2,
	strokeStyle: 'purple',
	cursor: 'pointer',
	overflow: 'ellipsis',
	wordWrap: true,
});
