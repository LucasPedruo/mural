/** Ícones do [lucide](https://lucide.dev) (licença ISC), copiados como SVG
 *  inline em vez de virar dependência: são poucos traçados, e o pacote inteiro
 *  pesaria mais no bundle que o app pesa hoje.
 *
 *  Todos herdam `currentColor` e o tamanho vem por prop — quem posiciona decide
 *  a cor pelo CSS, como em qualquer texto. O traçado do lucide é desenhado para
 *  uma caixa de 24, então mudar `tamanho` nunca engorda a linha.
 *
 *  Nenhum ícone tem significado sozinho: todos vão acompanhados de rótulo ou de
 *  `title` em quem os usa. */

import type { ReactNode } from 'react';

interface Props {
  /** Lado do quadrado, em px. */
  tamanho?: number;
}

function Icone({ tamanho = 15, children }: Props & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** lucide `image` — a moldura com o disco e a montanha, que é o desenho que
 *  todo mundo já leu como "aqui tem uma imagem". */
export function IconeImagem(p: Props) {
  return (
    <Icone {...p}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Icone>
  );
}

/** lucide `check` */
export function IconeFeito(p: Props) {
  return (
    <Icone {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Icone>
  );
}

/** lucide `pencil` */
export function IconeEditar(p: Props) {
  return (
    <Icone {...p}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </Icone>
  );
}

/** lucide `undo-2` */
export function IconeDesfazer(p: Props) {
  return (
    <Icone {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
    </Icone>
  );
}

/** lucide `tag` */
export function IconeEtiqueta(p: Props) {
  return (
    <Icone {...p}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </Icone>
  );
}

/** lucide `ban` — o círculo cortado. "Não é pra mim" não é lixo, é recusa. */
export function IconeIgnorar(p: Props) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </Icone>
  );
}

/** lucide `trash-2` */
export function IconeApagar(p: Props) {
  return (
    <Icone {...p}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icone>
  );
}

/** lucide `external-link` */
export function IconeAbrirFora(p: Props) {
  return (
    <Icone {...p}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icone>
  );
}

/** lucide `ellipsis` — o menu de tudo o que se faz num card. */
export function IconeMais(p: Props) {
  return (
    <Icone {...p}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </Icone>
  );
}

/** lucide `merge` */
export function IconeJuntar(p: Props) {
  return (
    <Icone {...p}>
      <path d="m8 6 4-4 4 4" />
      <path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22" />
      <path d="m20 22-5-5" />
    </Icone>
  );
}

/** lucide `split` */
export function IconeSeparar(p: Props) {
  return (
    <Icone {...p}>
      <path d="M16 3h5v5" />
      <path d="M8 3H3v5" />
      <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
      <path d="m15 9 6-6" />
    </Icone>
  );
}

/** lucide `chevron-down` */
export function IconeAbaixo(p: Props) {
  return (
    <Icone {...p}>
      <path d="m6 9 6 6 6-6" />
    </Icone>
  );
}

/** lucide `chevron-up` */
export function IconeAcima(p: Props) {
  return (
    <Icone {...p}>
      <path d="m18 15-6-6-6 6" />
    </Icone>
  );
}

/** lucide `chevrons-left` — colapsar a coluna. Duplo, para não ser confundido
 *  com "voltar". */
export function IconeColapsar(p: Props) {
  return (
    <Icone {...p}>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </Icone>
  );
}

/** lucide `arrow-left` */
export function IconeVoltar(p: Props) {
  return (
    <Icone {...p}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </Icone>
  );
}

/** lucide `x` */
export function IconeFechar(p: Props) {
  return (
    <Icone {...p}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icone>
  );
}

/** lucide `user` — o filtro por quem pediu. */
export function IconePessoa(p: Props) {
  return (
    <Icone {...p}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icone>
  );
}

/** lucide `grip-vertical` — a alça de pegar. Aparece onde existe um gesto de
 *  arrastar que não é óbvio, como o cabeçalho da coluna. */
export function IconePegar(p: Props) {
  return (
    <Icone {...p}>
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </Icone>
  );
}

/** lucide `bell` */
export function IconeSino(p: Props) {
  return (
    <Icone {...p}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </Icone>
  );
}
