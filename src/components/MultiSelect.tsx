import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  options: string[];
  value: string[];           // array vazio = nenhum filtro (todos)
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Texto do botão quando nada está selecionado. Default "Todos". */
  allLabel?: string;
  /** Mostrar input de busca no popover. Default true. */
  searchable?: boolean;
  /** Single select mode: clicar troca o valor (não acumula) e fecha o popover. */
  singleSelect?: boolean;
}

/**
 * Multi-select dropdown com checkboxes.
 * Convenção: value = [] significa "todos" (sem filtro aplicado).
 */
export function MultiSelect({ options, value, onChange, placeholder, allLabel = 'Todos', searchable = true, singleSelect = false }: Props) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popWidth = 280;
      const spaceRight = window.innerWidth - rect.left;
      setAlign(spaceRight < popWidth ? 'right' : 'left');
    }
    if (searchable) {
      // focar no input ao abrir
      setTimeout(() => searchRef.current?.focus(), 30);
    }
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, searchable]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    if (!q) return options;
    return options.filter((o) => o.toLocaleLowerCase('pt-BR').includes(q));
  }, [options, search]);

  function toggleOption(opt: string) {
    if (singleSelect) {
      if (value[0] === opt) onChange([]);
      else onChange([opt]);
      setOpen(false);
      return;
    }
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt));
    else onChange([...value, opt]);
  }

  const isAll = value.length === 0;
  const label = isAll
    ? allLabel
    : value.length === 1
      ? value[0]
      : `${value.length} selecionados`;

  return (
    <div className="ms" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`ms__trigger ${!isAll ? 'ms__trigger--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={placeholder}
      >
        <span className="ms__label">{label}</span>
        <span className="ms__caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className={`ms__pop ${align === 'right' ? 'ms__pop--right' : ''}`}>
          {searchable && options.length > 5 && (
            <div className="ms__pop-search">
              <input
                ref={searchRef}
                type="text"
                placeholder="Buscar…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="ms__clear-search" onClick={() => setSearch('')} title="Limpar busca">✕</button>
              )}
            </div>
          )}
          {!singleSelect && (
            <div className="ms__pop-actions">
              <button className="ms__action" onClick={() => onChange([])} disabled={isAll}>
                Limpar
              </button>
              <button
                className="ms__action"
                onClick={() => {
                  if (search.trim()) {
                    const next = Array.from(new Set([...value, ...filteredOptions]));
                    onChange(next);
                  } else {
                    onChange([...options]);
                  }
                }}
                disabled={value.length === options.length}
              >
                {search.trim() ? 'Marcar visíveis' : 'Todos'}
              </button>
            </div>
          )}
          {singleSelect && value.length > 0 && (
            <div className="ms__pop-actions">
              <button className="ms__action" onClick={() => { onChange([]); setOpen(false); }}>
                Limpar seleção
              </button>
            </div>
          )}
          <div className="ms__pop-list">
            {filteredOptions.length === 0 && (
              <div className="ms__empty">{search ? 'Sem resultados' : 'Sem opções'}</div>
            )}
            {filteredOptions.map((opt) => {
              const checked = value.includes(opt);
              if (singleSelect) {
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`ms__item ${checked ? 'ms__item--on' : ''}`}
                    onClick={() => toggleOption(opt)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <span className="ms__item-radio" data-on={checked} />
                    <span className="ms__item-label">{opt}</span>
                  </button>
                );
              }
              return (
                <label key={opt} className={`ms__item ${checked ? 'ms__item--on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOption(opt)}
                  />
                  <span className="ms__item-label">{opt}</span>
                </label>
              );
            })}
          </div>
          {options.length > 0 && filteredOptions.length < options.length && (
            <div className="ms__pop-footer">
              {filteredOptions.length} de {options.length} visíveis
            </div>
          )}
        </div>
      )}

      <style>{`
        .ms {
          position: relative;
          display: inline-block;
        }
        .ms__trigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 500;
          color: var(--text);
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          font-family: var(--font-sans);
          transition: border-color 0.15s;
          min-width: 100px;
        }
        .ms__trigger:hover { border-color: var(--brand-blue); }
        .ms__trigger--active {
          border-color: var(--brand-blue);
          color: var(--brand-blue-d);
          font-weight: 700;
        }
        .ms__label {
          flex: 1;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .ms__caret {
          font-size: 9px;
          color: var(--text-3);
        }

        .ms__pop {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          z-index: 90;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
          min-width: 220px;
          max-width: 320px;
        }
        .ms__pop--right { left: auto; right: 0; }

        .ms__pop-search {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
          border-radius: var(--r-md) var(--r-md) 0 0;
        }
        .ms__pop-search input {
          flex: 1;
          padding: 5px 8px;
          font-size: 11px;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          outline: none;
          font-family: var(--font-sans);
        }
        .ms__pop-search input:focus { border-color: var(--brand-blue); }
        .ms__clear-search {
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-2);
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
        }
        .ms__clear-search:hover { color: var(--brand-blue); border-color: var(--brand-blue); }

        .ms__pop-actions {
          display: flex;
          gap: 6px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
        }
        .ms__pop-search + .ms__pop-actions {
          border-radius: 0;
        }
        .ms__pop > .ms__pop-actions:first-child {
          border-radius: var(--r-md) var(--r-md) 0 0;
        }
        .ms__pop-footer {
          padding: 6px 12px;
          font-size: 10px;
          color: var(--text-3);
          border-top: 1px solid var(--border);
          background: var(--surface-2);
          border-radius: 0 0 var(--r-md) var(--r-md);
          text-align: center;
        }
        .ms__action {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-2);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          padding: 3px 10px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .ms__action:not(:disabled):hover {
          color: var(--brand-blue);
          border-color: var(--brand-blue);
        }
        .ms__action:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .ms__pop-list {
          max-height: 280px;
          overflow-y: auto;
          padding: 6px 0;
        }
        .ms__empty {
          padding: 12px;
          text-align: center;
          color: var(--text-3);
          font-size: 11px;
        }
        .ms__item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          font-size: 12px;
          color: var(--text);
          cursor: pointer;
          user-select: none;
        }
        .ms__item:hover {
          background: var(--surface-2);
        }
        .ms__item--on {
          background: var(--brand-blue-l);
          color: var(--brand-blue-d);
          font-weight: 600;
        }
        .ms__item--on:hover {
          background: var(--brand-blue-l);
        }
        .ms__item input {
          accent-color: var(--brand-blue);
          width: 14px;
          height: 14px;
          cursor: pointer;
        }
        .ms__item-radio {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 1.5px solid var(--border-2);
          flex-shrink: 0;
          position: relative;
        }
        .ms__item-radio[data-on="true"] {
          border-color: var(--brand-blue);
        }
        .ms__item-radio[data-on="true"]::after {
          content: '';
          position: absolute;
          inset: 3px;
          border-radius: 50%;
          background: var(--brand-blue);
        }
        .ms__item-label {
          flex: 1;
        }
      `}</style>
    </div>
  );
}
