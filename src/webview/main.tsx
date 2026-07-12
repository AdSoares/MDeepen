import { render } from 'preact';
import { App } from './App';
import theme from './styles/theme.css';

const style = document.createElement('style');
style.textContent = theme;
document.head.appendChild(style);

render(<App />, document.getElementById('app')!);
