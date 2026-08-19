import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import './estilos.css';
import { Home } from './paginas/Home';
import { Onboarding } from './paginas/Onboarding';
import { Painel } from './paginas/Painel';
import { Quadro } from './paginas/Quadro';

// Tema segue o sistema operacional, sem controle na tela. O CSS depende do
// atributo data-color-mode, entao ele e mantido em dia aqui — inclusive se o
// SO trocar de tema com a pagina aberta.
const preferenciaEscura = window.matchMedia('(prefers-color-scheme: dark)');
const aplicarTema = () =>
  document.documentElement.setAttribute(
    'data-color-mode',
    preferenciaEscura.matches ? 'dark' : 'light',
  );
aplicarTema();
preferenciaEscura.addEventListener('change', aplicarTema);

const rotas = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/m/:muralId', element: <Quadro /> },
  { path: '/m/:muralId/painel', element: <Painel /> },
]);

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <RouterProvider router={rotas} />
  </StrictMode>,
);
