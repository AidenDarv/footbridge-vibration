// UI entry point (SPEC §3).
import './ui/styles.css';
import { mountApp } from './ui/app';
import { mountShell } from './ui/shell';

mountShell();
const root = document.getElementById('app');
if (root) mountApp(root);
