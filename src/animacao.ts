import gsap from 'gsap';
import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Colapsar e expandir, animados.
 *
 *  O gesto muda o layout de uma vez: a coluna passa de 232px a 46px, o card
 *  perde cinco linhas de texto. Sem transição, o quadro inteiro salta e a pessoa
 *  precisa reencontrar onde estava — o movimento aqui não é enfeite, é o que
 *  liga o antes ao depois.
 *
 *  A medida é sempre do estado FINAL, lido depois do React já ter aplicado a
 *  classe nova, e a animação vai do valor anterior até ele. É o que faz uma
 *  coluna que cresce para dividir a tela chegar na largura real que lhe coube,
 *  em vez de na largura nominal do CSS — e por isso não há número mágico aqui. */

const DURACAO = 0.26;
const CURVA = 'power2.inOut';

/** Quem pediu menos movimento na tela recebe menos movimento na tela: o valor
 *  vai a zero e o GSAP aplica o estado final no mesmo quadro. */
function duracao(): number {
  if (typeof window === 'undefined' || !window.matchMedia) return DURACAO;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DURACAO;
}

/** A largura da coluna. Anima `flex-basis`, e não `width`: dentro de um flex é
 *  a base que manda, e mexer em `width` daria uma animação que o layout ignora.
 *
 *  Durante o percurso a coluna para de crescer (`flex-grow: 0`) para o valor
 *  animado valer de fato; no fim, tudo volta ao CSS. */
export function useLarguraAnimada(ref: RefObject<HTMLElement | null>, colapsada: boolean) {
  const anterior = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const alvo = el.getBoundingClientRect().width;
    const de = anterior.current;
    anterior.current = alvo;

    // Primeira renderização, ou largura que não mudou: não há percurso.
    if (de === null || Math.abs(de - alvo) < 1) return;

    const t = duracao();
    const proxy = { largura: de };
    const limpar = () => {
      el.style.flexBasis = '';
      el.style.flexGrow = '';
      el.style.minWidth = '';
      el.style.maxWidth = '';
    };

    el.style.flexGrow = '0';
    el.style.minWidth = '0';
    el.style.maxWidth = 'none';

    const tween = gsap.to(proxy, {
      largura: alvo,
      duration: t,
      ease: CURVA,
      onUpdate: () => {
        el.style.flexBasis = `${proxy.largura}px`;
      },
      onComplete: limpar,
    });

    return () => {
      tween.kill();
      limpar();
    };
  }, [ref, colapsada]);
}

/** A altura do card. Mesmo desenho da largura, com `overflow: hidden` durante o
 *  percurso — sem isso o texto que está saindo vaza por cima do card de baixo. */
export function useAlturaAnimada(ref: RefObject<HTMLElement | null>, colapsado: boolean) {
  const anterior = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const alvo = el.getBoundingClientRect().height;
    const de = anterior.current;
    anterior.current = alvo;

    if (de === null || Math.abs(de - alvo) < 1) return;

    const limpar = () => {
      el.style.height = '';
      el.style.overflow = '';
    };

    const tween = gsap.fromTo(
      el,
      { height: de, overflow: 'hidden' },
      { height: alvo, duration: duracao(), ease: CURVA, onComplete: limpar },
    );

    return () => {
      tween.kill();
      limpar();
    };
  }, [ref, colapsado]);
}
