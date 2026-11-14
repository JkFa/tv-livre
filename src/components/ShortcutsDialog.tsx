import { Sheet } from './Sheet.tsx';

const ROWS: [string[], string][] = [
  [['←', '→'], 'Canal anterior / próximo'],
  [['↑', '↓'], 'Canal anterior / próximo'],
  [['0–9', 'Enter'], 'Digitar o número do canal'],
  [['Z'], 'Zapear: sortear um canal no ar'],
  [['/'], 'Buscar canal'],
  [['F'], 'Tela cheia'],
  [['M'], 'Mudo (volta ao volume de antes)'],
  [['Tab', '←', '→'], 'Volume: foque o controle e use as setas'],
  [['P'], 'Imagem sobre imagem'],
  [['Espaço'], 'Pausar e continuar'],
  [['S'], 'Compartilhar o canal'],
  [['C'], 'Controlar pelo celular'],
  [['R'], 'Modo Rádio (só áudio)'],
  [['T'], 'Ligar ou sair do Modo TV'],
  [['Esc'], 'Sair do Modo TV (no navegador)'],
  [['?'], 'Mostrar esta lista'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet id="atalhos" open={open} onClose={onClose} title="Atalhos do teclado" variant="modal">
      <dl className="keys">
        {ROWS.map(([keys, label]) => (
          <div key={label + keys.join()}>
            <dt>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
