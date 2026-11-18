import type { Preview } from '@storybook/react-vite';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/manrope';
import '../src/styles.css';
import '../src/features.css';
const preview: Preview = { parameters: { layout: 'padded', controls: { expanded: true } } };
export default preview;
