import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../api';
import {
  IconeApagar,
  IconeEditar,
  IconeFechar,
  IconeMais,
  IconeVoltar,
} from '../componentes/icones';
import type {
  DadosItemPessoal,
  ItemPessoal,
  PrioridadePessoal,
  QuadroPessoal as QuadroPessoalTipo,
  TipoQuadroPessoal,
} from '../tipos';
import './pessoal.css';

const TIPOS_VALIDOS: TipoQuadroPessoal[] = ['diarias', 'publicidade'];

const VAZIO: DadosItemPessoal = {
  titulo: '',
  descricao: '',
  prioridade: 'media',
  prazo: '',
  parceiro: '',
  valor: '',
  canal: '',
};

function tipoValido(valor: string | undefined): TipoQuadroPessoal {
  return TIPOS_VALIDOS.includes(valor as TipoQuadroPessoal)
    ? (valor as TipoQuadroPessoal)
    : 'diarias';
}

function dadosDoItem(item: ItemPessoal | null): DadosItemPessoal {
  if (!item) return VAZIO;
  return {
    titulo: item.titulo,
    descricao: item.descricao,
    prioridade: item.prioridade,
    prazo: item.prazo,
    parceiro: item.parceiro,
    valor: item.valor,
    canal: item.canal,
  };
}

function rotuloPrioridade(p: PrioridadePessoal): string {
  if (p === 'alta') return 'Alta';
  if (p === 'baixa') return 'Baixa';
  return 'Media';
}

function dataCurta(iso: string): string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return ano && mes && dia ? `${dia}/${mes}` : iso;
}

interface EditorProps {
  tipo: TipoQuadroPessoal;
  item: ItemPessoal | null;
  aoSalvar: (dados: DadosItemPessoal) => void;
  aoFechar: () => void;
}

function EditorDeItem({ tipo, item, aoSalvar, aoFechar }: EditorProps) {
  const [dados, setDados] = useState<DadosItemPessoal>(() => dadosDoItem(item));
  const publicidade = tipo === 'publicidade';

  function atualizar<K extends keyof DadosItemPessoal>(campo: K, valor: DadosItemPessoal[K]) {
    setDados((atuais) => ({ ...atuais, [campo]: valor }));
  }

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    aoSalvar(dados);
  }

  return (
    <div className="fundo-modal" onClick={aoFechar} role="presentation">
      <form
        className="modal modal-pessoal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-editor-pessoal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={salvar}
      >
        <div className="cabeca-editor-pessoal">
          <h2 id="titulo-editor-pessoal">{item ? 'Editar card' : 'Novo card'}</h2>
          <button type="button" className="icone" onClick={aoFechar} aria-label="Fechar">
            <IconeFechar />
          </button>
        </div>

        <label className="campo-pessoal">
          <span>Titulo</span>
          <input
            autoFocus
            maxLength={180}
            value={dados.titulo}
            onChange={(e) => atualizar('titulo', e.target.value)}
          />
        </label>

        <div className="linha-campos-pessoal">
          <label className="campo-pessoal">
            <span>Prioridade</span>
            <select
              value={dados.prioridade}
              onChange={(e) => atualizar('prioridade', e.target.value as PrioridadePessoal)}
            >
              <option value="baixa">Baixa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="campo-pessoal">
            <span>Prazo</span>
            <input
              type="date"
              value={dados.prazo}
              onChange={(e) => atualizar('prazo', e.target.value)}
            />
          </label>
        </div>

        {publicidade && (
          <div className="linha-campos-pessoal publicidade">
            <label className="campo-pessoal">
              <span>Parceiro</span>
              <input
                maxLength={120}
                value={dados.parceiro}
                onChange={(e) => atualizar('parceiro', e.target.value)}
              />
            </label>
            <label className="campo-pessoal">
              <span>Valor</span>
              <input
                maxLength={80}
                value={dados.valor}
                onChange={(e) => atualizar('valor', e.target.value)}
              />
            </label>
            <label className="campo-pessoal">
              <span>Canal</span>
              <input
                maxLength={120}
                value={dados.canal}
                onChange={(e) => atualizar('canal', e.target.value)}
              />
            </label>
          </div>
        )}

        <label className="campo-pessoal">
          <span>Descricao</span>
          <textarea
            maxLength={2000}
            rows={6}
            value={dados.descricao}
            onChange={(e) => atualizar('descricao', e.target.value)}
          />
        </label>

        <div className="acoes-modal">
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="primario" type="submit" disabled={!dados.titulo.trim()}>
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

export function QuadroPessoal() {
  const navegar = useNavigate();
  const params = useParams();
  const tipo = tipoValido(params.tipo);
  const [quadro, setQuadro] = useState<QuadroPessoalTipo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<ItemPessoal | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.quadroPessoal(tipo);
      setQuadro(r.quadro);
      setErro(null);
      document.title = `${r.quadro.titulo} · Mural`;
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [tipo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const itensPorColuna = useMemo(() => {
    const mapa = new Map<string, ItemPessoal[]>();
    for (const coluna of quadro?.colunas ?? []) mapa.set(coluna.id, []);
    for (const item of quadro?.itens ?? []) {
      const lista = mapa.get(item.coluna);
      if (lista) lista.push(item);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => {
        const peso = { alta: 0, media: 1, baixa: 2 };
        return (
          peso[a.prioridade] - peso[b.prioridade] ||
          (a.prazo || '9999-99-99').localeCompare(b.prazo || '9999-99-99') ||
          b.atualizadoEm.localeCompare(a.atualizadoEm)
        );
      });
    }
    return mapa;
  }, [quadro]);

  async function salvar(dados: DadosItemPessoal) {
    try {
      const r = editando
        ? await api.atualizarItemPessoal(tipo, editando.id, dados)
        : await api.criarItemPessoal(tipo, dados);
      setQuadro(r.quadro);
      setEditando(null);
      setCriando(false);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function apagar(item: ItemPessoal) {
    if (!window.confirm(`Apagar "${item.titulo}"?`)) return;
    try {
      const r = await api.apagarItemPessoal(tipo, item.id);
      setQuadro(r.quadro);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function aoSoltar(resultado: DropResult) {
    if (!resultado.destination) return;
    const destino = resultado.destination.droppableId;
    if (destino === resultado.source.droppableId) return;
    try {
      const r = await api.moverItemPessoal(tipo, resultado.draggableId, destino);
      setQuadro(r.quadro);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const total = quadro?.itens.length ?? 0;
  const vencendo = (quadro?.itens ?? []).filter((item) => item.prazo && item.coluna !== 'feito' && item.coluna !== 'encerrado').length;

  return (
    <>
      <header className="topo-quadro topo-pessoal">
        <button className="icone" onClick={() => navegar('/')} title="Voltar" aria-label="Voltar">
          <IconeVoltar />
        </button>
        <span className="marca">
          <span className="ponto-marca" />
          <h1>{quadro?.titulo ?? 'Quadro pessoal'}</h1>
        </span>
        <span className="info">{quadro?.subtitulo ?? ''}</span>
        <span className="espaco" />
        <span className="gasto">{total} cards</span>
        {vencendo > 0 && <span className="sprint">{vencendo} com prazo</span>}
        <button className="primario novo-pessoal" onClick={() => setCriando(true)}>
          <IconeMais tamanho={15} />
          Novo card
        </button>
      </header>

      {erro && <p className="aviso erro faixa">{erro}</p>}

      <DragDropContext onDragEnd={(r) => void aoSoltar(r)}>
        <main className="kanban-pessoal">
          {quadro?.colunas.map((coluna) => {
            const itens = itensPorColuna.get(coluna.id) ?? [];
            return (
              <section className="coluna-pessoal" key={coluna.id}>
                <header>
                  <span className="selo-pessoal">
                    <span className="ponto" style={{ background: coluna.cor }} />
                    {coluna.nome}
                  </span>
                  <span className="contagem">{itens.length}</span>
                </header>

                <Droppable droppableId={coluna.id}>
                  {(fornecido, estado) => (
                    <div
                      className={'lista-pessoal' + (estado.isDraggingOver ? ' recebendo' : '')}
                      ref={fornecido.innerRef}
                      {...fornecido.droppableProps}
                    >
                      {itens.length === 0 && <p className="vazio-pessoal">Nada aqui</p>}
                      {itens.map((item, indice) => (
                        <Draggable draggableId={item.id} index={indice} key={item.id}>
                          {(cardFornecido, cardEstado) => (
                            <article
                              className={[
                                'card-pessoal',
                                `prioridade-${item.prioridade}`,
                                cardEstado.isDragging ? 'arrastando' : '',
                              ].filter(Boolean).join(' ')}
                              ref={cardFornecido.innerRef}
                              {...cardFornecido.draggableProps}
                              {...cardFornecido.dragHandleProps}
                            >
                              <div className="cabeca-card-pessoal">
                                <strong>{item.titulo}</strong>
                                <span>{rotuloPrioridade(item.prioridade)}</span>
                              </div>
                              {item.descricao && <p>{item.descricao}</p>}
                              {tipo === 'publicidade' && (item.parceiro || item.valor || item.canal) && (
                                <dl className="meta-publicidade">
                                  {item.parceiro && (
                                    <>
                                      <dt>Parceiro</dt>
                                      <dd>{item.parceiro}</dd>
                                    </>
                                  )}
                                  {item.valor && (
                                    <>
                                      <dt>Valor</dt>
                                      <dd>{item.valor}</dd>
                                    </>
                                  )}
                                  {item.canal && (
                                    <>
                                      <dt>Canal</dt>
                                      <dd>{item.canal}</dd>
                                    </>
                                  )}
                                </dl>
                              )}
                              <footer>
                                <span>{item.prazo ? `Prazo ${dataCurta(item.prazo)}` : 'Sem prazo'}</span>
                                <span className="acoes-card-pessoal">
                                  <button
                                    className="icone"
                                    onClick={() => setEditando(item)}
                                    title="Editar card"
                                    aria-label="Editar card"
                                  >
                                    <IconeEditar />
                                  </button>
                                  <button
                                    className="icone perigo"
                                    onClick={() => void apagar(item)}
                                    title="Apagar card"
                                    aria-label="Apagar card"
                                  >
                                    <IconeApagar />
                                  </button>
                                </span>
                              </footer>
                            </article>
                          )}
                        </Draggable>
                      ))}
                      {fornecido.placeholder}
                    </div>
                  )}
                </Droppable>
              </section>
            );
          })}
        </main>
      </DragDropContext>

      {(criando || editando) && (
        <EditorDeItem
          tipo={tipo}
          item={editando}
          aoSalvar={(dados) => void salvar(dados)}
          aoFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
        />
      )}
    </>
  );
}
