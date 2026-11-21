import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
const app = createRoot(root);
if (import.meta.env.DEV && new URLSearchParams(location.search).has('audioLab')) {
  void import('./ui/AudioLab.tsx').then(({ AudioLab }) => app.render(<AudioLab />));
} else app.render(<App />);
