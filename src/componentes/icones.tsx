/** Ícones do [lucide](https://lucide.dev) (licença ISC), copiados como SVG
 *  inline em vez de virar dependência: são dois traçados, e um pacote inteiro
 *  para isso pesaria mais no bundle que o app inteiro pesa hoje.
 *
 *  `currentColor` de propósito — quem posiciona decide a cor pelo CSS, como em
 *  qualquer texto. */

interface Props {
  /** Lado do quadrado, em px. O traçado do lucide é desenhado para 24. */
  tamanho?: number;
}

/** lucide `image` — a moldura com o disco e a montanha, que é o desenho que
 *  todo mundo já leu como "aqui tem uma imagem". */
export function IconeImagem({ tamanho = 15 }: Props) {
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
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}
