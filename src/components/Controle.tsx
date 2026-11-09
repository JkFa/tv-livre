import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Delete, Maximize, Pause, Play, Shuffle, Star, Volume2, VolumeX, X } from 'lucide-react';
import type { Channel } from '../../shared/types.ts';
import { loadCountry } from '../lib/data.ts';
import { EMPTY_FILTERS, filterChannels } from '../lib/filter.ts';
import { useFavorites, useRecents } from '../lib/library.ts';
import { buildNumbers, channelKey, formatNumber } from '../lib/lineup.ts';
import { useWakeLock } from '../lib/media.ts';
import { lerLink, lerPar, limparPar, salvarPar, type Par } from '../lib/remote/celular.ts';
import type { Estado } from '../lib/remote/protocolo.ts';
import { derivarDoCodigo, normalizarCodigo } from '../lib/remote/seguranca.ts';
import { useControlador } from '../lib/remote/useControlador.ts';
import { ChannelLogo } from './ChannelLogo.tsx';
import '../styles/controle.css';

const vibra = () => navigator.vibrate?.(12); // Android; o iPhone ignora

/** Lê o link do QR (e apaga a chave do endereço), ou o pareamento já feito nesta aba. */
function parInicial(): Par | null {
  const doLink = lerLink(window.location.hash);
  if (doLink) {
    salvarPar(doLink);
    // a chave não fica no histórico nem na barra de endereço
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/controle`);
    return doLink;
  }
  return lerPar();
}

export default function Controle() {
  const [par, setPar] = useState<Par | null>(parInicial);
  if (!par) return <Parear onPar={(p) => { salvarPar(p); setPar(p); }} />;
  return <Remoto par={par} onSair={() => { limparPar(); setPar(null); }} />;
}

// ---------------- sem pareamento: digitar o código ----------------
function Parear({ onPar }: { onPar: (p: Par) => void }) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigo = normalizarCodigo(texto);
    if (!codigo) return setErro('O código tem 8 letras e números (sem 0, O, 1 e I). Confira o que aparece no computador.');
    setErro(null);
    setOcupado(true);
    const d = await derivarDoCodigo(codigo); // 200 mil iterações: um instante
    onPar({ sessao: d.sessao, chaveRaw: d.chaveRaw });
  };
  return (
    <main className="remote remote-parear" data-testid="controle-parear">
      <h1>Controle remoto</h1>
      <p>No computador ou na TV, abra o TV Livre, toque em <b>Mais › Controlar pelo celular</b> (ou aperte <b>C</b>) e escaneie o QR code com a câmera do celular.</p>
      <p>Sem câmera? Digite o código de 8 caracteres:</p>
      <form onSubmit={enviar} className="remote-codigo-form">
        <label className="sr-only" htmlFor="codigo">Código de 8 caracteres</label>
        <input id="codigo" value={texto} onChange={(e) => setTexto(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={9} inputMode="text" data-testid="controle-codigo-input" />
        <button type="submit" className="btn btn-accent" disabled={ocupado} data-testid="controle-codigo-ok">{ocupado ? 'Conectando…' : 'Conectar'}</button>
      </form>
      {erro && <p className="remote-erro" role="alert">{erro}</p>}
      <a className="link-btn" href="#/">Voltar ao TV Livre</a>
    </main>
  );
}

// ---------------- controle ----------------
const MENSAGEM: Record<string, string> = {
  conectando: 'Conectando…',
  conectado: 'Conectado',
  reconectando: 'Reconectando…',
  'sem-sinal': 'Sem sinal do computador',
  erro: 'Sem conexão',
  encerrado: 'Controle encerrado',
  desconectado: 'Desconectado',
  limite: 'Computador cheio',
  bloqueado: 'Desconectado',
  versao: 'Versão diferente',
};

function Remoto({ par, onSair }: { par: Par; onSair: () => void }) {
  const { estado, status, enviar, tentarDeNovo } = useControlador(par);
  const [aba, setAba] = useState<'controle' | 'canais'>('controle');
  useWakeLock(true); // o celular fica aceso enquanto o controle está aberto
  const mortos = ['encerrado', 'desconectado', 'limite', 'bloqueado', 'versao'].includes(status.situacao);
  const cmd = useCallback((c: Parameters<typeof enviar>[0]) => { vibra(); enviar(c); }, [enviar]);

  return (
    <main className="remote" data-testid="controle" data-situacao={status.situacao}>
      <Topo estado={estado} onAnterior={() => cmd({ c: 'canal:anterior' })} onProximo={() => cmd({ c: 'canal:proximo' })}
        status={status.situacao} />
      {status.motivo && (
        <div className="remote-aviso" role="alert" data-testid="controle-aviso">
          <p>{status.motivo}</p>
          {status.situacao === 'erro' && <button type="button" className="btn" onClick={tentarDeNovo} data-testid="controle-tentar">Tentar de novo</button>}
          {status.situacao === 'versao' && <button type="button" className="btn" onClick={() => window.location.reload()}>Atualizar a página</button>}
          {mortos && status.situacao !== 'versao' && <button type="button" className="btn" onClick={onSair}>Parear de novo</button>}
        </div>
      )}
      {estado?.erro && (
        <div className="remote-aviso remote-fora" role="alert" data-testid="controle-fora">
          <p><b>Fora do ar no computador.</b> {estado.erro}</p>
          <button type="button" className="btn btn-accent" onClick={() => cmd({ c: 'canal:proximo' })} data-testid="controle-fora-proximo"><ChevronRight size={18} aria-hidden="true" /> Próximo canal</button>
        </div>
      )}
      <div className="seg remote-abas" role="tablist" aria-label="Controle">
        {(['controle', 'canais'] as const).map((a) => (
          <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)} data-testid={`aba-${a}`}>{a === 'controle' ? 'Controle' : 'Canais'}</button>
        ))}
      </div>
      {aba === 'controle'
        ? <Teclas estado={estado} cmd={cmd} />
        : <Canais estado={estado} onEscolher={(c) => { cmd({ c: 'canal:id', id: c.id, pais: c.country }); setAba('controle'); }} />}
      <button type="button" className="link-btn remote-sair" onClick={onSair}>Desparear este celular</button>
    </main>
  );
}

function Topo({ estado, status, onAnterior, onProximo }: { estado: Estado | null; status: string; onAnterior: () => void; onProximo: () => void }) {
  const ini = useRef<{ x: number; y: number } | null>(null);
  const c = estado?.canal;
  return (
    <header
      className="remote-topo"
      onTouchStart={(e) => { const t = e.touches[0]; ini.current = t ? { x: t.clientX, y: t.clientY } : null; }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        const s = ini.current;
        ini.current = null;
        if (!t || !s) return;
        const dx = t.clientX - s.x;
        if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 1.6) (dx < 0 ? onProximo : onAnterior)();
      }}
    >
      <span className="remote-status" data-situacao={status} data-testid="controle-status">{MENSAGEM[status] ?? status}</span>
      {c ? (
        <div className="remote-canal" data-testid="controle-canal">
          <span className="remote-num num" data-testid="controle-numero">{c.numero}</span>
          <span className="remote-nome">{c.nome}</span>
          <ChannelLogo name={c.nome} {...(c.logo ? { src: c.logo } : {})} size={44} />
          {estado?.programaAtual && <span className="remote-prog muted" data-testid="controle-programa">{estado.programaAtual}</span>}
        </div>
      ) : (
        <p className="remote-canal remote-vazio" data-testid="controle-canal">{estado ? 'Nenhum canal sintonizado. Escolha um na aba Canais.' : 'Aguardando o computador…'}</p>
      )}
    </header>
  );
}

function Teclas({ estado, cmd }: { estado: Estado | null; cmd: (c: Parameters<ReturnType<typeof useControlador>['enviar']>[0]) => void }) {
  const [digitos, setDigitos] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const confirmar = (d: string) => {
    clearTimeout(timer.current);
    setDigitos('');
    const n = Number(d);
    if (Number.isInteger(n) && n > 0) cmd({ c: 'canal:numero', n });
  };
  const tecla = (d: string) => {
    vibra();
    const novo = (digitos + d).slice(0, 4);
    setDigitos(novo);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => confirmar(novo), 1600); // como no teclado do computador
  };
  const [volume, setVolume] = useState<number | null>(null);
  const ultimoVol = useRef(0);
  const vol = estado?.volume ?? 1;
  return (
    <div className="remote-teclas">
      <div className="remote-dial" role="group" aria-label="Trocar de canal">
        <button type="button" className="remote-btn remote-grande" onClick={() => cmd({ c: 'canal:anterior' })} aria-label="Canal anterior" data-testid="controle-anterior"><ChevronLeft size={34} aria-hidden="true" /></button>
        <button type="button" className="remote-btn remote-zapear" onClick={() => cmd({ c: 'zapear' })} data-testid="controle-zapear"><Shuffle size={22} aria-hidden="true" /> Zapear</button>
        <button type="button" className="remote-btn remote-grande" onClick={() => cmd({ c: 'canal:proximo' })} aria-label="Próximo canal" data-testid="controle-proximo"><ChevronRight size={34} aria-hidden="true" /></button>
      </div>

      <div className="remote-digitos num" aria-live="polite" data-testid="controle-digitos">{digitos || ' '}</div>
      <div className="remote-pad" role="group" aria-label="Teclado numérico">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" className="remote-btn num" onClick={() => tecla(d)} data-testid={`tecla-${d}`}>{d}</button>)}
        <button type="button" className="remote-btn" onClick={() => { vibra(); setDigitos((x) => x.slice(0, -1)); }} aria-label="Apagar" data-testid="tecla-apagar"><Delete size={22} aria-hidden="true" /></button>
        <button type="button" className="remote-btn num" onClick={() => tecla('0')} data-testid="tecla-0">0</button>
        <button type="button" className="remote-btn remote-enter" onClick={() => { vibra(); confirmar(digitos); }} aria-label="Confirmar número" data-testid="tecla-enter"><Check size={24} aria-hidden="true" /></button>
      </div>

      <div className="remote-linha">
        <button type="button" className="remote-btn" onClick={() => cmd({ c: estado?.tocando ? 'pausa' : 'play' })} aria-label={estado?.tocando ? 'Pausar' : 'Tocar'} data-testid="controle-pausa">{estado?.tocando ? <Pause size={24} aria-hidden="true" /> : <Play size={24} aria-hidden="true" />}</button>
        <button type="button" className="remote-btn" onClick={() => cmd({ c: 'mudo', m: !estado?.mudo })} aria-pressed={!!estado?.mudo} aria-label={estado?.mudo ? 'Ativar o som' : 'Silenciar'} data-testid="controle-mudo">{estado?.mudo ? <VolumeX size={24} aria-hidden="true" /> : <Volume2 size={24} aria-hidden="true" />}</button>
        <button type="button" className="remote-btn" onClick={() => cmd({ c: 'favoritar' })} aria-pressed={!!estado?.favorito} aria-label={estado?.favorito ? 'Remover dos favoritos' : 'Favoritar'} data-testid="controle-favoritar"><Star size={24} fill={estado?.favorito ? 'currentColor' : 'none'} aria-hidden="true" /></button>
        <button type="button" className="remote-btn" onClick={() => cmd({ c: 'tela', cheia: !estado?.modoTV })} aria-pressed={!!estado?.modoTV} aria-label="Tela inteira no computador" data-testid="controle-tela"><Maximize size={24} aria-hidden="true" /></button>
      </div>
      <label className="remote-volume">
        <span>Volume</span>
        <input
          type="range" min={0} max={100} value={Math.round((volume ?? vol) * 100)} aria-label="Volume"
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setVolume(v);
            if (Date.now() - ultimoVol.current > 80) { // não inunda o broker enquanto o dedo arrasta
              ultimoVol.current = Date.now();
              cmd({ c: 'volume', v });
            }
          }}
          onPointerUp={(e) => { const v = Number((e.target as HTMLInputElement).value) / 100; cmd({ c: 'volume', v }); setVolume(null); }}
          onKeyUp={(e) => cmd({ c: 'volume', v: Number((e.target as HTMLInputElement).value) / 100 })}
          data-testid="controle-volume"
        />
      </label>
      <p className="muted small remote-dica">O vídeo toca só no computador ou na TV; este celular só envia comandos.</p>
    </div>
  );
}

function Canais({ estado, onEscolher }: { estado: Estado | null; onEscolher: (c: Channel) => void }) {
  const pais = estado?.canal?.pais ?? 'BR';
  const [lista, setLista] = useState<Channel[] | null>(null);
  const [q, setQ] = useState('');
  const [vista, setVista] = useState<'todos' | 'favoritos' | 'recentes'>('todos');
  const { favorites } = useFavorites();
  const { recents, push } = useRecents();
  useEffect(() => {
    let vivo = true;
    void loadCountry(pais).then((l) => vivo && setLista(l)).catch(() => vivo && setLista([]));
    return () => { vivo = false; };
  }, [pais]);
  const numeros = useMemo(() => buildNumbers({ [pais]: lista ?? [] }), [pais, lista]);
  const base = useMemo(() => {
    if (!lista) return [];
    if (vista === 'todos') return lista;
    const refs = vista === 'favoritos' ? favorites : recents;
    return refs.filter((r) => r.country === pais).map((r) => lista.find((c) => c.id === r.id)).filter((c): c is Channel => !!c);
  }, [lista, vista, favorites, recents, pais]);
  const vistos = useMemo(() => filterChannels(base, { ...EMPTY_FILTERS, query: q }).slice(0, 150), [base, q]);
  return (
    <div className="remote-canais" data-testid="controle-canais">
      <div className="seg" role="tablist" aria-label="Lista">
        {(['todos', 'favoritos', 'recentes'] as const).map((a) => <button key={a} type="button" role="tab" aria-selected={vista === a} onClick={() => setVista(a)}>{a === 'todos' ? 'Todos' : a === 'favoritos' ? 'Favoritos' : 'Recentes'}</button>)}
      </div>
      <label className="remote-busca">
        <span className="sr-only">Buscar canal pelo nome</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar canal pelo nome" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" data-testid="controle-busca" />
        {q && <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="Limpar busca"><X size={18} /></button>}
      </label>
      {lista === null && <p className="muted" role="status">Carregando os canais…</p>}
      <ul className="remote-lista" aria-label={`${vistos.length} canais`}>
        {vistos.map((c) => (
          <li key={channelKey(c)}>
            <button type="button" className="remote-linha-canal" onClick={() => { vibra(); push(c); onEscolher(c); }} data-testid="controle-canal-item" aria-label={`${formatNumber(numeros.get(channelKey(c)))} ${c.name}`}>
              <span className="num remote-num-s" aria-hidden="true">{formatNumber(numeros.get(channelKey(c)))}</span>
              <ChannelLogo name={c.name} {...(c.logo ? { src: c.logo } : {})} size={36} />
              <span className="remote-nome-s">{c.name}</span>
              {estado?.canal?.id === c.id && <span className="remote-atual">no ar</span>}
            </button>
          </li>
        ))}
      </ul>
      {lista && !vistos.length && <p className="muted">Nenhum canal {q ? `com “${q}”` : 'aqui'}.</p>}
    </div>
  );
}
