// UI entry point (SPEC §3).
import './ui/styles.css';
import { mountApp, mountThemeToggle } from './ui/app';

const root = document.getElementById('app');
if (root) mountApp(root);

const toggle = document.getElementById('theme-toggle');
if (toggle instanceof HTMLButtonElement) mountThemeToggle(toggle);
