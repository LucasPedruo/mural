import type { ColunaId, Mural, Status, SubtipoFonte, TipoFonte } from './tipos';

/** "Ninguém pegou" pressupõe um time dividindo trabalho — numa conversa de duas
 *  pessoas isso não quer dizer nada. */
export function rotuloDaColuna(status: ColunaId, fonte?: Pick<Mural, 'tipo' | 'subtipo'>): string {
  if (status === 'meu') return 'Feito por mim';
  if (status === 'interagido') return 'Interagido';
  if (status === 'feito') return 'Concluído';
  return fonte?.tipo === 'chat' && fonte.subtipo === 'oneOnOne' ? 'Sem reação' : 'Ninguém pegou';
}

export function rotuloDoTipo(tipo: TipoFonte, subtipo: SubtipoFonte): string {
  if (tipo === 'canal') return 'canal';
  return { oneOnOne: 'conversa', meeting: 'reunião', group: 'grupo' }[
    subtipo as 'oneOnOne' | 'meeting' | 'group'
  ] ?? 'chat';
}

export const CORES_DE_STATUS: Record<ColunaId, string> = {
  aberto: 'var(--marca-aberto)',
  interagido: 'var(--marca-interagido)',
  feito: 'var(--marca-feito)',
  meu: 'var(--marca-meu)',
};

/** Os três status do Teams. Usados onde a lista precisa ser só de status. */
export const STATUS: Status[] = ['aberto', 'interagido', 'feito'];

export const COLUNAS: ColunaId[] = ['aberto', 'interagido', 'feito', 'meu'];

export function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return 'hoje ' + d.toTimeString().slice(0, 5);
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Cabeçalho de cada grupo da coluna "Feito por mim". Na daily você fala do
 *  que fez ontem, então "Ontem" precisa ser uma palavra e não uma data que
 *  obriga a conferir o calendário. */
export function rotuloDoDia(iso: string): string {
  const dia = new Date(iso);
  dia.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const diferenca = Math.round((hoje.getTime() - dia.getTime()) / 86_400_000);
  if (diferenca === 0) return 'Hoje';
  if (diferenca === 1) return 'Ontem';
  return dia.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** Chave de agrupamento por dia local — a string ISO não serve, porque o
 *  fuso empurraria o fim da tarde para o dia seguinte. */
export function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function tempoRelativo(iso: string | null): string {
  if (!iso) return 'nunca atualizado';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function mmss(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}
