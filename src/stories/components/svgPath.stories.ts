import { Meta } from '@storybook/html';
import { svgPath } from '../../index';
import { createTemplate } from './../util';

export default {
	title: 'Components/svgPath',
} as Meta;

const template = createTemplate(svgPath);

const pathData =
	'M160 0C71.6 0 0 71.6 0 160c0 70.8 45.8 130.6 109.4 151.8 8 1.4 11-3.4 11-7.6 0-3.8-.2-16.4-.2-29.8-40.2 7.4-50.6-9.8-53.8-18.8-1.8-4.6-9.6-18.8-16.4-22.6-5.6-3-13.6-10.4-.2-10.6 12.6-.2 21.6 11.6 24.6 16.4 14.4 24.2 37.4 17.4 46.6 13.2 1.4-10.4 5.6-17.4 10.2-21.4-35.6-4-72.8-17.8-72.8-79 0-17.4 6.2-31.8 16.4-43-1.6-4-7.2-20.4 1.6-42.4 0 0 13.4-4.2 44 16.4 12.8-3.6 26.4-5.4 40-5.4 13.6 0 27.2 1.8 40 5.4 30.6-20.8 44-16.4 44-16.4 8.8 22 3.2 38.4 1.6 42.4 10.2 11.2 16.4 25.4 16.4 43 0 61.4-37.4 75-73 79 5.8 5 10.8 14.6 10.8 29.6 0 21.4-.2 38.6-.2 44 0 4.2 3 9.2 11 7.6C274.2 290.6 320 230.6 320 160 320 71.6 248.4 0 160 0z';

export const BasicProperties = template({
	d: pathData,
	fillStyle: 'black',
	lineWidth: 2,
	strokeStyle: 'lime',
	cursor: 'pointer',
});
