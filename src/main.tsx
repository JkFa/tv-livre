import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/home.css';
import './styles/tv.css';
import { useRoute } from './lib/router.ts';
import { initTvMode } from './lib/tvmode.ts';

initTvMode();

// O controle do celular é outro "app": carrega sob demanda (chunk próprio) e só nessa rota.
const Controle = lazy(() => import('./components/Controle.tsx'));

function Raiz() {
  const route = useRoute();
  if (route.name === 'remote') {
    return (
      <Suspense fallback={<p className="center muted" role="status">Abrindo o controle…</p>}>
        <Controle />
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
);
