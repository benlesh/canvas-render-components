import { Meta } from '@storybook/html';
import { defineComp, rect, RenderingContext2D } from '../../index';
import { createTemplate } from './../util';

export default {
	title: 'Tests/rect',
} as Meta;

const test = defineComp(Test);

const template = createTemplate(test);

export const BasicProperties = template({});

function Test(props: {}, ctx: RenderingContext2D) {
	return [
		rect({
			x: 10,
			y: 10,
			width: 100,
			height: 100,
			fillStyle: 'rgba(200, 200, 200, 1)',
			lineWidth: 1,
			strokeStyle: 'darkblue',
		}),
		rect({
			x: 120,
			y: 10,
			width: 100,
			height: 100,
			fillStyle: 'rgba(200, 200, 200, 1)',
		}),
		rect({
			x: 230,
			y: 10,
			width: 100,
			height: 100,
			strokeStyle: 'darkblue',
			lineWidth: 3,
		}),

		rect({
			x: 10,
			y: 120,
			width: 100,
			height: 100,
			fillStyle: 'rgba(200, 200, 200, 1)',
			lineWidth: 1,
			strokeStyle: 'darkblue',
			alignToPixelGrid: 'ceil',
		}),
		rect({
			x: 120,
			y: 120,
			width: 100,
			height: 100,
			fillStyle: 'rgba(200, 200, 200, 1)',
			alignToPixelGrid: 'ceil',
		}),
		rect({
			x: 230,
			y: 120,
			width: 100,
			height: 100,
			strokeStyle: 'darkblue',
			lineWidth: 3,
			alignToPixelGrid: 'ceil',
		}),

		rect({
			x: 10,
			y: 230,
			width: 100,
			height: 100,
			fillStyle: 'rgba(200, 200, 200, 1)',
			lineWidth: 1,
			strokeStyle: 'darkblue',
			alignToPixelGrid: 'floor',
		}),
		rect({
			x: 120,
			y: 230,
			width: 100,
			height: 100,
			fillStyle: 'rgba(200, 200, 200, 1)',
			alignToPixelGrid: 'floor',
		}),
		rect({
			x: 230,
			y: 230,
			width: 100,
			height: 100,
			strokeStyle: 'darkblue',
			lineWidth: 3,
			alignToPixelGrid: 'floor',
		}),

		rect({
			x: 10,
			y: 340,
			width: 100,
			height: 100,
			fillStyle: 'rgba(200, 200, 200, 1)',
			lineWidth: 1,
			strokeStyle: 'darkblue',
			alignToPixelGrid: 'round',
		}),
		rect({
			x: 120,
			y: 340,
			width: 100,
			height: 100,
			fillStyle: 'rgba(200, 200, 200, 1)',
			alignToPixelGrid: 'round',
		}),
		rect({
			x: 230,
			y: 340,
			width: 100,
			height: 100,
			strokeStyle: 'darkblue',
			lineWidth: 3,
			alignToPixelGrid: 'round',
		}),
	];
}
