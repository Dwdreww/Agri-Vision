import App from './App.jsx';
import { WorkspaceServices } from './services.jsx';

export default function WorkspaceApp() {
  return <WorkspaceServices><App /></WorkspaceServices>;
}
