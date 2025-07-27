import type { Meta, StoryObj } from '@storybook/react';

import ColorSelector from '../../src/components/ColorSelector';
import ColorValue from '../../src/models/ColorValue';

const meta: Meta<typeof ColorSelector> = {
  title: 'Components/ColorSelector',
  component: ColorSelector,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A color picker component with predefined color palettes that allows users to select colors for backgrounds and foregrounds.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    color: {
      description: 'Current selected color',
      control: false, // We'll use predefined colors
    },
    shape: {
      description: 'Shape of the color selector button',
      control: { type: 'radio' },
      options: ['circle', 'rectangle'],
    },
    callback: {
      description: 'Callback function called when a color is selected',
      action: 'color-selected',
    },
  },
  args: {
    callback: (background: ColorValue, foreground: ColorValue) => {
      console.log('Color selected:', { background: background.toHex(), foreground: foreground.toHex() });
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Story with circle shape and white color (default)
export const CircleWhite: Story = {
  args: {
    color: ColorValue.WHITE,
    shape: 'circle',
  },
};

// Story with circle shape and black color
export const CircleBlack: Story = {
  args: {
    color: ColorValue.BLACK,
    shape: 'circle',
  },
};

// Story with circle shape and red color
export const CircleRed: Story = {
  args: {
    color: new ColorValue({ red: 244, green: 67, blue: 54 }),
    shape: 'circle',
  },
};

// Story with circle shape and blue color
export const CircleBlue: Story = {
  args: {
    color: new ColorValue({ red: 33, green: 150, blue: 243 }),
    shape: 'circle',
  },
};

// Story with rectangle shape and white color
export const RectangleWhite: Story = {
  args: {
    color: ColorValue.WHITE,
    shape: 'rectangle',
  },
};

// Story with rectangle shape and black color
export const RectangleBlack: Story = {
  args: {
    color: ColorValue.BLACK,
    shape: 'rectangle',
  },
};

// Story with rectangle shape and green color
export const RectangleGreen: Story = {
  args: {
    color: new ColorValue({ red: 76, green: 175, blue: 80 }),
    shape: 'rectangle',
  },
};

// Story with rectangle shape and purple color
export const RectanglePurple: Story = {
  args: {
    color: new ColorValue({ red: 156, green: 39, blue: 176 }),
    shape: 'rectangle',
  },
};