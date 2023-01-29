import { CompEl, crc } from '../index';
import { Story } from '@storybook/html';

export function createTemplate<P>(comp: (props: P) => CompEl<P>) {
	const Template: Story<P> = function (args: P) {
		const canvas = document.createElement('canvas');
		canvas.width = 1000;
		canvas.height = 700;
		crc(canvas, comp(args));
		return canvas;
	};

	Template.parameters = {};

	return (args: P) => {
		const boundTemplate: Story<P> = Template.bind({});
		boundTemplate.args = args;
		return boundTemplate;
	};
}
