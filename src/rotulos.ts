import type { ColunaId, Status, SubtipoFonte, TipoFonte } from './tipos';

/** O nome de cada coluna na tela. Os ids não mudam com estes rótulos: `aberto`,
 *  `fazendo` e companhia são o que está gravado no disco e nas preferências, e
 *  renomear dado por causa de rótulo quebraria histórico que já existe.
 *
 *  Nenhum destes nomes pressupõe time. Os anteriores pressupunham — "Ninguém
 *  pegou" e "Concluído por outros" não querem dizer nada numa conversa de duas
 *  pessoas, e por isso havia um caso especial que trocava os dois. Com "Backlog"
 *  e "Done" o caso especial deixou de ter razão de existir.
 *
 *  Os seis são em inglês, e só eles: é o vocabulário de quadro que o time já lê
 *  sem traduzir. O que você cria fica com o nome que você escrever. */
export function rotuloDaColuna(status: ColunaId): string {
  if (status === 'meu') return 'Done by me';
  if (status === 'ignorada') return 'Out of scope';
  if (status === 'fazendo') return 'In progress';
  if (status === 'interagido') return 'In review';
  if (status === 'feito') return 'Done';
  return 'Backlog';
}

export function rotuloDoTipo(tipo: TipoFonte, subtipo: SubtipoFonte): string {
  if (tipo === 'canal') return 'canal';
  return { oneOnOne: 'conversa', meeting: 'reunião', group: 'grupo' }[
    subtipo as 'oneOnOne' | 'meeting' | 'group'
  ] ?? 'chat';
}

export const CORES_DE_STATUS: Record<ColunaId, string> = {
  aberto: 'var(--marca-aberto)',
  fazendo: 'var(--marca-fazendo)',
  interagido: 'var(--marca-interagido)',
  feito: 'var(--marca-feito)',
  meu: 'var(--marca-meu)',
  ignorada: 'var(--marca-ignorada)',
};

/** Os três status do Teams. Usados onde a lista precisa ser só de status. */
export const STATUS: Status[] = ['aberto', 'fazendo', 'interagido', 'feito'];

export const COLUNAS: ColunaId[] = [
  'aberto', 'fazendo', 'interagido', 'feito', 'meu', 'ignorada',
];

export function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return 'hoje ' + d.toTimeString().slice(0, 5);
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Cabeçalho de cada grupo da coluna "Done by me". Na daily você fala do
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

/** A hora de uma mensagem dentro da rajada. O dia já está no rodapé do card:
 *  aqui o que importa é a distância entre uma mensagem e a seguinte. */
export function horaCurta(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

/** Os painéis falam em dia local (ano-mês-dia), não em instante: é assim que o
 *  servidor recorta sprint e daily. Estas duas leem esse formato. */
export function diaParaData(dia: string): Date {
  const [ano, mes, d] = dia.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, d || 1);
}

export function rotuloDoDiaISO(dia: string): string {
  return rotuloDoDia(diaParaData(dia).toISOString());
}

export function dataDoDiaISO(dia: string): string {
  return diaParaData(dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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
