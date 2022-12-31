import { CompEl, crc } from '../index';
import { Story } from '@storybook/html';

export function createTemplate<P>(comp: (props: P) => CompEl<P>) {
	const Template = function (args: P) {
		const canvas = document.createElement('canvas');
		canvas.width = 500;
		canvas.height = 500;
		crc(canvas, comp(args));
		return canvas;
	};

	return (args: P) => {
		const boundTemplate: Story<P> = Template.bind({});
		boundTemplate.args = args;
		return boundTemplate;
	};
}
