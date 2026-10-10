import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { WorkspaceServices } from './services';
import './styles.css';
import './field-journal.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><WorkspaceServices><App /></WorkspaceServices></React.StrictMode>);
