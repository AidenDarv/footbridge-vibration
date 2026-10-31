// UI entry point (SPEC §3).
import './ui/styles.css';
import { mountApp } from './ui/app';
import { mountThemeToggle } from './ui/theme';

const root = document.getElementById('app');
if (root) mountApp(root);

const toggle = document.getElementById('theme-toggle');
if (toggle instanceof HTMLButtonElement) mountThemeToggle(toggle);
