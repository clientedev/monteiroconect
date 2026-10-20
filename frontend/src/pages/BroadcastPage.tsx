import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, contactApi, conversationApi, quickMessageApi, whatsappApi, type QuickMessage } from '../lib/api';
import { playNotificationTone } from '../lib/sound';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bold,
  Check,
  CheckCheck,
  CheckCircle2,
  ClipboardPaste,
  Clock,
  Edit3,
  Eye,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Italic,
  Layers,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  Paperclip,
  Phone,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Smile,
  Sparkles,
  Strikethrough,
  Trash2,
  UploadCloud,
  Users,
  Video,
  Volume2,
  XCircle,
} from 'lucide-react';

const MAX_BATCH_SIZE = 10;

interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  conversationId: string | null;
}

interface Attachment {
  url: string;
  originalName: string;
  mimetype: string;
  type: 'image' | 'video' | 'audio' | 'document';
}

interface ImportedRecipient {
  id: string;
  raw: string;
  name?: string;
  phone: string; // Dígitos normalizados com 55 (ex: 5511999998888)
  displayPhone: string; // Formatado para exibição: +55 (11) 99999-8888
  valid: boolean;
  error?: string;
}

function attachmentType(file: File): Attachment['type'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

function displayContact(contact: Contact) {
  return contact.name || contact.phone || 'Contato';
}

function normalizeAccounts(value: unknown): any[] {
  const accounts = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { accounts?: unknown }).accounts)
      ? (value as { accounts: unknown[] }).accounts
      : [];
  return accounts
    .filter(account => account && typeof account === 'object' && typeof (account as { id?: unknown }).id === 'string')
    .sort((a: any, b: any) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }) ||
      (a.name || '').localeCompare(b.name || '', 'pt-BR')
    );
}

function normalizeContacts(value: unknown): Contact[] {
  const contacts = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { contacts?: unknown }).contacts)
      ? (value as { contacts: unknown[] }).contacts
      : [];
  return contacts.filter(contact => contact && typeof contact === 'object' && typeof (contact as { id?: unknown }).id === 'string') as Contact[];
}

/** Normaliza um número de telefone colado do Excel ou digitado */
function parsePhone(rawToken: string): { phone: string; displayPhone: string; valid: boolean; error?: string } {
  let digits = rawToken.replace(/\D/g, '');
  if (!digits) {
    return { phone: '', displayPhone: rawToken, valid: false, error: 'Sem dígitos válidos' };
  }

  // Remove zeros à esquerda (ex: 011999998888 -> 11999998888)
  if (digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '');
  }

  // Se tem 10 ou 11 dígitos, é número brasileiro sem o DDI 55 -> adiciona 55
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  // Formatação amigável
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const p1 = digits.slice(4, 9);
    const p2 = digits.slice(9);
    return { phone: digits, displayPhone: `+55 (${ddd}) ${p1}-${p2}`, valid: true };
  }

  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const p1 = digits.slice(4, 8);
    const p2 = digits.slice(8);
    return { phone: digits, displayPhone: `+55 (${ddd}) ${p1}-${p2}`, valid: true };
  }

  // Números internacionais (10 a 15 dígitos)
  if (digits.length >= 10 && digits.length <= 15) {
    return { phone: digits, displayPhone: `+${digits}`, valid: true };
  }

  return {
    phone: digits,
    displayPhone: rawToken,
    valid: false,
    error: digits.length < 10 ? 'Número muito curto (falta o DDD)' : 'Número inválido',
  };
}

/** Processa o texto copiado de uma coluna ou tabela do Excel */
function parseExcelContent(text: string): {
  recipients: ImportedRecipient[];
  totalLines: number;
  duplicateCount: number;
  invalidCount: number;
} {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const recipients: ImportedRecipient[] = [];
  const seenPhones = new Set<string>();
  let duplicateCount = 0;
  let invalidCount = 0;

  lines.forEach((line, index) => {
    // Ignora cabeçalhos comuns do Excel
    const lower = line.toLowerCase();
    const isHeader =
      (lower.includes('telefone') ||
        lower.includes('whatsapp') ||
        lower.includes('celular') ||
        lower.includes('contato') ||
        lower.includes('fone') ||
        lower.includes('nome')) &&
      !/\d{5,}/.test(line);

    if (isHeader) return;

    // Se a linha foi copiada com múltiplas colunas (ex: Nome \t Telefone)
    const tokens = line.split(/[\t;,]+/).map(t => t.trim()).filter(Boolean);
    let phoneToken = tokens[0] || '';
    let nameToken: string | undefined = undefined;

    if (tokens.length > 1) {
      let bestIdx = 0;
      let maxDigits = 0;
      tokens.forEach((t, i) => {
        const dCount = (t.match(/\d/g) || []).length;
        if (dCount >= 8 && dCount > maxDigits) {
          maxDigits = dCount;
          bestIdx = i;
        }
      });
      phoneToken = tokens[bestIdx];
      const nameParts = tokens.filter((_, i) => i !== bestIdx);
      nameToken = nameParts.join(' ').trim() || undefined;
    }

    const { phone, displayPhone, valid, error } = parsePhone(phoneToken);

    if (!valid) {
      invalidCount++;
      return;
    }

    if (seenPhones.has(phone)) {
      duplicateCount++;
      return;
    }

    seenPhones.add(phone);
    recipients.push({
      id: `imported-${index}-${phone}`,
      raw: line,
      name: nameToken,
      phone,
      displayPhone,
      valid: true,
      error,
    });
  });

  return {
    recipients,
    totalLines: lines.length,
    duplicateCount,
    invalidCount,
  };
}

/** Renderiza a formatação de WhatsApp (negrito, itálico, tachado, quebras de linha e {nome}) */
function renderWhatsAppFormatted(rawText: string, sampleName?: string) {
  if (!rawText.trim()) return null;

  // Substitui {nome} pelo nome do contato de prévia
  const textWithVars = rawText.replace(/\{nome\}/gi, sampleName || 'João Silva');
  const lines = textWithVars.split('\n');

  return (
    <div className="space-y-1 text-sm leading-relaxed whitespace-pre-wrap break-words">
      {lines.map((line, lIdx) => {
        if (!line.trim()) return <div key={lIdx} className="h-2" />;

        // Regex para capturar *negrito*, _itálico_ e ~tachado~
        const parts: React.ReactNode[] = [];
        const regex = /(\*[^*]+\*|_[^_]+_|~[^~]+~)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(line)) !== null) {
          if (match.index > lastIndex) {
            parts.push(line.slice(lastIndex, match.index));
          }
          const token = match[0];
          if (token.startsWith('*') && token.endsWith('*')) {
            parts.push(
              <strong key={match.index} className="font-bold text-monte-azul">
                {token.slice(1, -1)}
              </strong>
            );
          } else if (token.startsWith('_') && token.endsWith('_')) {
            parts.push(
              <em key={match.index} className="italic">
                {token.slice(1, -1)}
              </em>
            );
          } else if (token.startsWith('~') && token.endsWith('~')) {
            parts.push(
              <del key={match.index} className="line-through opacity-70">
                {token.slice(1, -1)}
              </del>
            );
          }
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < line.length) {
          parts.push(line.slice(lastIndex));
        }

        return <div key={lIdx}>{parts.length > 0 ? parts : line}</div>;
      })}
    </div>
  );
}

export default function BroadcastPage() {
  const [sourceMode, setSourceMode] = useState<'excel' | 'crm'>('excel');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');

  // CRM Contacts State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedCrmIds, setSelectedCrmIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Excel / Imported Numbers State
  const [excelText, setExcelText] = useState('');
  const [importedRecipients, setImportedRecipients] = useState<ImportedRecipient[]>([]);
  const [importStats, setImportStats] = useState<{ totalLines: number; duplicateCount: number; invalidCount: number } | null>(null);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [sentBatchIndexes, setSentBatchIndexes] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Quick Messages (Modelos Salvos)
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  const [loadingQuickMessages, setLoadingQuickMessages] = useState(false);

  // Message & Attachment State
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [messageViewTab, setMessageViewTab] = useState<'editor' | 'preview'>('editor');

  // Loading & Execution States
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Configurações de Cadência Anti-Bloqueio (Margem de segurança até 45s)
  const [cadencePreset, setCadencePreset] = useState<'safe45' | 'ultra' | 'quick' | 'custom'>('safe45');
  const [minDelay, setMinDelay] = useState<number>(20);
  const [maxDelay, setMaxDelay] = useState<number>(45);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const handleSelectPreset = (preset: 'safe45' | 'ultra' | 'quick' | 'custom') => {
    setCadencePreset(preset);
    if (preset === 'safe45') {
      setMinDelay(20);
      setMaxDelay(45);
    } else if (preset === 'ultra') {
      setMinDelay(35);
      setMaxDelay(60);
    } else if (preset === 'quick') {
      setMinDelay(10);
      setMaxDelay(25);
    }
  };

  const selectedAccount = accounts.find(account => account.id === accountId);
  const connected = selectedAccount?.status === 'CONNECTED';

  // CRM Memo
  const visibleCrmIds = useMemo(() => contacts.map(contact => contact.id), [contacts]);
  const selectedCrmContacts = useMemo(
    () => contacts.filter(contact => selectedCrmIds.has(contact.id) && !!contact.phone?.trim()),
    [contacts, selectedCrmIds],
  );

  // Excel Batches Memo (Lotes de 10)
  const excelBatches = useMemo(() => {
    const valid = importedRecipients.filter(r => r.valid);
    const chunks: ImportedRecipient[][] = [];
    for (let i = 0; i < valid.length; i += MAX_BATCH_SIZE) {
      chunks.push(valid.slice(i, i + MAX_BATCH_SIZE));
    }
    return chunks;
  }, [importedRecipients]);

  const activeBatch = excelBatches[currentBatchIndex] || [];

  // Atualiza seleção padrão do lote ativo
  useEffect(() => {
    if (activeBatch.length > 0) {
      setSelectedBatchIds(new Set(activeBatch.map(item => item.id)));
    } else {
      setSelectedBatchIds(new Set());
    }
    setResult(null);
  }, [currentBatchIndex, importedRecipients]);

  // Destinatários atuais de acordo com a aba ativa
  const currentRecipients = useMemo(() => {
    if (sourceMode === 'crm') {
      return selectedCrmContacts.map(c => ({
        id: c.id,
        name: displayContact(c),
        phone: c.phone || '',
        displayPhone: c.phone || '',
      }));
    }
    return activeBatch
      .filter(item => selectedBatchIds.has(item.id))
      .map(item => ({
        id: item.id,
        name: item.name || 'Contato Excel',
        phone: item.phone,
        displayPhone: item.displayPhone,
      }));
  }, [sourceMode, selectedCrmContacts, activeBatch, selectedBatchIds]);

  // Primeiro contato selecionado para exemplo de prévia realista
  const sampleRecipient = currentRecipients[0] || {
    name: 'João Silva',
    displayPhone: '+55 (11) 98765-4321',
  };

  // Cálculo de tempo estimado para o lote com cadência humanizada
  const estimatedBatchTime = useMemo(() => {
    const count = currentRecipients.length;
    if (count <= 1) return 'Envio imediato (~3s)';
    const avgSec = (minDelay + maxDelay) / 2;
    const totalSec = Math.round(avgSec * (count - 1));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min === 0) return `~${sec} segundos`;
    return `~${min} min e ${sec} seg`;
  }, [currentRecipients.length, minDelay, maxDelay]);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      try {
        await Notification.requestPermission();
      } catch {}
    }
  };

  // Carrega mensagens rápidas para sugestões/templates
  useEffect(() => {
    async function fetchQuickMessages() {
      setLoadingQuickMessages(true);
      try {
        const list = await quickMessageApi.list();
        setQuickMessages(list || []);
      } catch {
        // silencioso
      } finally {
        setLoadingQuickMessages(false);
      }
    }
    fetchQuickMessages();
  }, []);

  const loadContacts = useCallback(async () => {
    if (!accountId) {
      setContacts([]);
      return;
    }
    setLoadingContacts(true);
    try {
      const data = await contactApi.list(accountId, search, 1, 1000);
      setContacts(normalizeContacts(data));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os contatos');
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [accountId, search]);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setError('');
    try {
      const data = await whatsappApi.list();
      const nextAccounts = normalizeAccounts(data);
      setAccounts(nextAccounts);
      setAccountId(current => (nextAccounts.some(account => account.id === current) ? current : nextAccounts[0]?.id || ''));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os WhatsApps');
      setAccounts([]);
      setAccountId('');
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    setSelectedCrmIds(new Set());
    setResult(null);
  }, [accountId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // CRM: Alterna seleção de contato com trava de segurança de 10
  const toggleCrmContact = (id: string) => {
    setSelectedCrmIds(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_BATCH_SIZE) {
          alert(`Trava de segurança: você só pode selecionar até ${MAX_BATCH_SIZE} contatos por disparo.`);
          return current;
        }
        next.add(id);
      }
      return next;
    });
  };

  // CRM: Selecionar visíveis com trava de 10
  const toggleVisibleCrm = () => {
    setSelectedCrmIds(current => {
      const next = new Set(current);
      const allSelected = visibleCrmIds.length > 0 && visibleCrmIds.every(id => next.has(id));

      if (allSelected) {
        visibleCrmIds.forEach(id => next.delete(id));
      } else {
        let addedCount = 0;
        visibleCrmIds.forEach(id => {
          if (!next.has(id) && next.size < MAX_BATCH_SIZE) {
            next.add(id);
            addedCount++;
          }
        });

        if (next.size >= MAX_BATCH_SIZE && addedCount > 0 && visibleCrmIds.length > MAX_BATCH_SIZE) {
          alert(`Trava de segurança: foram selecionados os primeiros ${MAX_BATCH_SIZE} contatos visíveis para respeitar o limite.`);
        }
      }
      return next;
    });
  };

  // Excel: Processar o texto colado
  const handleProcessExcel = (textToProcess?: string) => {
    const text = textToProcess !== undefined ? textToProcess : excelText;
    if (!text.trim()) {
      setError('Cole ou digite os números do Excel no campo antes de processar.');
      return;
    }
    setError('');
    setSuccessNotice('');
    const parsed = parseExcelContent(text);
    if (parsed.recipients.length === 0) {
      setError('Nenhum número válido foi identificado no conteúdo. Verifique se copiou a coluna com DDD.');
      return;
    }
    setImportedRecipients(parsed.recipients);
    setImportStats({
      totalLines: parsed.totalLines,
      duplicateCount: parsed.duplicateCount,
      invalidCount: parsed.invalidCount,
    });
    setCurrentBatchIndex(0);
    setSentBatchIndexes(new Set());
  };

  // Excel: Colar da área de transferência
  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setExcelText(text);
          handleProcessExcel(text);
          return;
        }
      }
      setError('Use o atalho Ctrl+V dentro da caixa de texto para colar os números.');
    } catch {
      setError('Permissão negada pelo navegador. Pressione Ctrl+V diretamente dentro da caixa.');
    }
  };

  // Excel: Ler arquivo CSV ou TXT
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (content) {
        setExcelText(content);
        handleProcessExcel(content);
      }
    };
    reader.onerror = () => {
      setError('Não foi possível ler o arquivo selecionado.');
    };
    reader.readAsText(file);
  };

  // Excel: Alternar contato no lote ativo
  const toggleBatchContact = (id: string) => {
    setSelectedBatchIds(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_BATCH_SIZE) {
          alert(`Trava de segurança: máximo de ${MAX_BATCH_SIZE} contatos por disparo.`);
          return current;
        }
        next.add(id);
      }
      return next;
    });
  };

  // Excel: Limpar lista
  const handleResetImport = () => {
    setImportedRecipients([]);
    setImportStats(null);
    setExcelText('');
    setCurrentBatchIndex(0);
    setSelectedBatchIds(new Set());
    setSentBatchIndexes(new Set());
    setResult(null);
    setSuccessNotice('');
  };

  // Upload de anexo
  const handleAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = await api.upload<{ url: string; originalName: string; mimetype: string }>('/upload', file);
      setAttachment({
        url: uploaded.url,
        originalName: uploaded.originalName,
        mimetype: uploaded.mimetype || file.type || 'application/octet-stream',
        type: attachmentType(file),
      });
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar o anexo');
    } finally {
      setUploading(false);
    }
  };

  // Inserção inteligente de texto / formatação no textarea
  const insertTextAtCursor = (beforeText: string, afterText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessage(prev => prev + beforeText + afterText);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    const selected = currentText.substring(start, end);

    const replacement = beforeText + selected + afterText;
    const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
    setMessage(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + beforeText.length + selected.length + (selected ? afterText.length : 0);
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 10);
  };

  // Envio do disparo com trava rígida de 10
  const handleSend = async () => {
    if (!accountId || !connected) {
      setError('Selecione um WhatsApp conectado antes de disparar.');
      return;
    }

    if (currentRecipients.length === 0) {
      setError('Selecione ao menos 1 contato para disparar.');
      return;
    }

    if (currentRecipients.length > MAX_BATCH_SIZE) {
      setError(`Trava de segurança: você não pode disparar para mais de ${MAX_BATCH_SIZE} contatos por envio.`);
      return;
    }

    if (!message.trim() && !attachment) {
      setError('Digite uma mensagem ou adicione um anexo para disparar.');
      return;
    }

    setSending(true);
    setError('');
    setResult(null);
    setSuccessNotice('');

    try {
      const recipientPhones = currentRecipients.map(r => r.phone);
      const response = await conversationApi.broadcast(
        accountId,
        recipientPhones,
        attachment?.type === 'document' ? (message.trim() || attachment.originalName) : message.trim(),
        attachment?.type || 'text',
        attachment?.url,
        attachment?.mimetype,
        attachment?.originalName,
        minDelay,
        maxDelay,
      );

      setResult(response);

      if (response.sent > 0) {
        if (soundEnabled) {
          playNotificationTone('suave', 0.9);
        }
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Disparo Concluído 📢', {
            body: `${response.sent} mensagem(ns) enviada(s) com proteção anti-bloqueio!`,
            icon: '/favicon.ico',
          });
        }

        if (sourceMode === 'excel') {
          setSentBatchIndexes(prev => new Set(prev).add(currentBatchIndex));
          setSuccessNotice(`Lote ${currentBatchIndex + 1} disparado com sucesso! (${response.sent} enviados com intervalo seguro de até ${maxDelay}s)`);
        } else {
          setSelectedCrmIds(new Set());
          setSuccessNotice(`Disparo realizado com sucesso! (${response.sent} enviados com intervalo seguro de até ${maxDelay}s)`);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível realizar o disparo');
    } finally {
      setSending(false);
    }
  };

  // Estatísticas da mensagem
  const charCount = message.length;
  const lineCount = message ? message.split('\n').length : 0;
  const hasNameVar = /\{nome\}/i.test(message);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-monte-terracota/15 text-monte-terracota flex items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="section-title">Disparo para contatos</h2>
            <p className="text-sm text-monte-sereno mt-1">
              Cole sua lista do Excel, monte a mensagem com prévia em tempo real e envie em lotes seguros com trava de 10 em 10.
            </p>
          </div>
        </div>
      </div>

      {/* AVISO DE SEGURANÇA E TRAVA DE 10 EM 10 */}
      <div className="rounded-3xl border border-amber-200/90 bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50/70 p-4 text-amber-950 shadow-sm flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="text-xs space-y-1.5 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-sm text-amber-950">Aviso de Segurança — Limite e Trava de 10 em 10</h4>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-200/80 text-[11px] font-bold text-amber-900">
              <Lock className="w-3 h-3" /> Trava Ativa (Máx. 10 contatos)
            </span>
          </div>
          <p className="text-amber-800 leading-relaxed text-[12.5px]">
            Para proteger seu WhatsApp contra <strong>bloqueios e banimentos da Meta</strong> por disparo em massa, cada envio é
            estritamente travado a no <strong>máximo 10 números por vez</strong>. Se você tiver dezenas ou centenas de números,
            pode colar toda a coluna do Excel: o sistema dividirá automaticamente em <strong>lotes de 10</strong> para você
            disparar com total controle.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button type="button" className="ml-auto underline font-medium" onClick={() => setError('')}>
            Fechar
          </button>
        </div>
      )}

      {successNotice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{successNotice}</span>
          <button type="button" className="ml-auto underline font-medium" onClick={() => setSuccessNotice('')}>
            Fechar
          </button>
        </div>
      )}

      {/* GRID PRINCIPAL: LADO ESQUERDO (DESTINATÁRIOS) + LADO DIREITO (MONTAR MENSAGEM & PRÉVIA) */}
      <div className="grid xl:grid-cols-[1.05fr_1.15fr] gap-6 items-start">
        
        {/* ETAPA 1: ORIGEM DOS CONTATOS (EXCEL / CRM) */}
        <section className="card-static overflow-hidden">
          <div className="p-4 border-b border-monte-sereno/15 space-y-3 bg-monte-areiaSecao/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-monte-verde text-white flex items-center justify-center text-xs font-bold">1</span>
                <h3 className="font-semibold text-sm text-monte-azul">Destinatários do Disparo</h3>
              </div>
              <span className={`text-xs font-semibold ${connected ? 'text-emerald-700' : 'text-amber-700'}`}>
                {connected ? '● WhatsApp conectado' : '○ Conecte o WhatsApp'}
              </span>
            </div>

            {/* Seletor de WhatsApp */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              {loadingAccounts ? (
                <div className="input-rect sm:max-w-xs flex items-center gap-2 text-monte-sereno">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando WhatsApps...
                </div>
              ) : (
                <select
                  className="input-rect sm:max-w-xs"
                  value={accountId}
                  onChange={event => setAccountId(event.target.value)}
                >
                  {accounts.length === 0 && <option value="">Nenhum WhatsApp configurado</option>}
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} — {account.status === 'CONNECTED' ? 'conectado' : 'desconectado'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* ABAS: COLAR DO EXCEL OU CONTATOS SALVOS */}
            <div className="flex items-center gap-2 pt-1 border-t border-monte-sereno/10">
              <button
                type="button"
                onClick={() => setSourceMode('excel')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  sourceMode === 'excel'
                    ? 'bg-monte-verde text-white shadow-sm'
                    : 'bg-white/60 text-monte-azul hover:bg-white border border-monte-sereno/20'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Colar do Excel / Planilha
                {importedRecipients.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${sourceMode === 'excel' ? 'bg-white/20 text-white' : 'bg-monte-verde/15 text-monte-verde font-bold'}`}>
                    {importedRecipients.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('crm')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  sourceMode === 'crm'
                    ? 'bg-monte-verde text-white shadow-sm'
                    : 'bg-white/60 text-monte-azul hover:bg-white border border-monte-sereno/20'
                }`}
              >
                <Users className="w-4 h-4" />
                Contatos Salvos ({contacts.length})
              </button>
            </div>
          </div>

          {/* CONTEÚDO DA ABA: COLAR DO EXCEL */}
          {sourceMode === 'excel' ? (
            <div className="p-4 space-y-4">
              {importedRecipients.length === 0 ? (
                /* ESTADO 1: Campo para colar coluna do Excel */
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-sm text-monte-azul flex items-center gap-1.5">
                      <ClipboardPaste className="w-4 h-4 text-monte-verde" />
                      Cole a coluna inteira do Excel aqui
                    </h4>
                    <p className="text-xs text-monte-sereno mt-0.5">
                      Copie a coluna de números (Ctrl+C no Excel ou Google Sheets) e cole no campo abaixo.
                    </p>
                  </div>

                  <textarea
                    rows={7}
                    className="input-rect font-mono text-xs w-full resize-y placeholder:text-monte-sereno/60 focus:bg-white"
                    placeholder={`Exemplo de conteúdo copiado do Excel:
(11) 99999-8888
11988887777
5521977776666
João Silva\t11999991234
Maria Santos\t(31) 98888-5555`}
                    value={excelText}
                    onChange={e => setExcelText(e.target.value)}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary flex items-center gap-2 text-xs py-2 px-4"
                      onClick={() => handleProcessExcel()}
                      disabled={!excelText.trim()}
                    >
                      <Layers className="w-4 h-4" />
                      Processar e Dividir em Lotes de 10
                    </button>

                    <button
                      type="button"
                      className="btn-secondary flex items-center gap-2 text-xs py-2 px-3.5"
                      onClick={handlePasteClipboard}
                    >
                      <ClipboardPaste className="w-4 h-4 text-monte-verde" />
                      Colar da Área de Transferência
                    </button>

                    <label className="btn-secondary flex items-center gap-2 text-xs py-2 px-3.5 cursor-pointer">
                      <UploadCloud className="w-4 h-4 text-monte-azul" />
                      Importar .csv ou .txt
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".csv,.txt"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-monte-sereno/20 bg-monte-areiaSecao/40 p-3 text-xs text-monte-sereno space-y-1">
                    <p className="font-semibold text-monte-azul">💡 Formatos aceitos automaticamente:</p>
                    <ul className="list-disc list-inside space-y-0.5 pl-1">
                      <li>Com ou sem parênteses: <code>(11) 99999-8888</code> ou <code>11999998888</code></li>
                      <li>Com ou sem DDI: adiciona <strong>+55</strong> automaticamente se tiver 10 ou 11 dígitos</li>
                      <li>Duas colunas (Nome e Telefone): detecta o nome para usar na variável <code>{'{nome}'}</code></li>
                      <li>Duplicados são removidos e a lista é dividida em <strong>lotes de até 10</strong></li>
                    </ul>
                  </div>
                </div>
              ) : (
                /* ESTADO 2: Números processados em Lotes de 10 */
                <div className="space-y-4">
                  {/* Resumo e Limpar Lista */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-monte-verde/10 border border-monte-verde/20">
                    <div className="text-xs">
                      <span className="font-bold text-monte-azul text-sm">
                        {importedRecipients.length} número(s) válidos
                      </span>
                      <span className="text-monte-sereno ml-2">
                        divididos em <strong>{excelBatches.length} lote(s) de até 10</strong>
                      </span>
                      {importStats && (importStats.duplicateCount > 0 || importStats.invalidCount > 0) && (
                        <div className="text-[11px] text-monte-sereno mt-0.5">
                          {importStats.duplicateCount > 0 && `${importStats.duplicateCount} duplicados removidos `}
                          {importStats.invalidCount > 0 && `· ${importStats.invalidCount} inválidos ignorados`}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleResetImport}
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 hover:text-monte-terracota"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Limpar / Colar outra lista
                    </button>
                  </div>

                  {/* SELETOR DE LOTES DE 10 COM TRAVA */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-monte-azul uppercase tracking-wider flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        Lotes de Disparo (Máx. 10 por lote)
                      </span>
                      <span className="text-xs text-monte-sereno font-medium">
                        Lote {currentBatchIndex + 1} de {excelBatches.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                      {excelBatches.map((batch, idx) => {
                        const isSent = sentBatchIndexes.has(idx);
                        const isActive = currentBatchIndex === idx;
                        const startNum = idx * MAX_BATCH_SIZE + 1;
                        const endNum = startNum + batch.length - 1;

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setCurrentBatchIndex(idx)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                              isActive
                                ? 'bg-monte-verde text-white shadow-sm ring-2 ring-monte-verde/30'
                                : isSent
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-white border border-monte-sereno/20 text-monte-azul hover:bg-monte-areiaSecao'
                            }`}
                          >
                            {isSent ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-monte-sereno/50" />
                            )}
                            Lote {idx + 1} ({startNum}–{endNum})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* BANNER PARA AVANÇAR PRO PRÓXIMO LOTE */}
                  {sentBatchIndexes.has(currentBatchIndex) && currentBatchIndex + 1 < excelBatches.length && (
                    <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-3.5 flex items-center justify-between gap-3 shadow-sm">
                      <div className="text-xs text-emerald-900">
                        <p className="font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Lote {currentBatchIndex + 1} enviado com sucesso!
                        </p>
                        <p className="text-[11.5px] text-emerald-700 mt-0.5">
                          Avançar para disparar os próximos {excelBatches[currentBatchIndex + 1].length} contatos?
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCurrentBatchIndex(currentBatchIndex + 1)}
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800"
                      >
                        Avançar para Lote {currentBatchIndex + 2}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* LISTA DOS CONTATOS DO LOTE ATUAL */}
                  <div className="border border-monte-sereno/15 rounded-2xl overflow-hidden bg-white/60">
                    <div className="px-3 py-2 bg-monte-areiaSecao/50 border-b border-monte-sereno/15 flex items-center justify-between text-xs text-monte-sereno">
                      <span className="font-semibold text-monte-azul">
                        Contatos no Lote {currentBatchIndex + 1} ({selectedBatchIds.size} de {activeBatch.length} selecionados)
                      </span>
                      <button
                        type="button"
                        className="font-semibold text-monte-verde hover:underline"
                        onClick={() => {
                          if (selectedBatchIds.size === activeBatch.length) {
                            setSelectedBatchIds(new Set());
                          } else {
                            setSelectedBatchIds(new Set(activeBatch.map(item => item.id)));
                          }
                        }}
                      >
                        {selectedBatchIds.size === activeBatch.length ? 'Desmarcar lote' : 'Selecionar lote todo'}
                      </button>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto divide-y divide-monte-sereno/10">
                      {activeBatch.map((item, itemIdx) => {
                        const checked = selectedBatchIds.has(item.id);
                        const globalIndex = currentBatchIndex * MAX_BATCH_SIZE + itemIdx + 1;

                        return (
                          <div
                            key={item.id}
                            className={`flex items-center gap-3 p-2.5 transition-colors ${
                              checked ? 'bg-monte-verde/5' : 'hover:bg-monte-areiaSecao/40'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleBatchContact(item.id)}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                                checked ? 'bg-monte-verde border-monte-verde text-white' : 'border-monte-sereno/40'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5" />}
                            </button>

                            <div className="w-6 h-6 rounded-full bg-monte-azul/10 text-monte-azul text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {globalIndex}
                            </div>

                            <div className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold text-monte-azul truncate">
                                {item.name || `Contato #${globalIndex}`}
                              </span>
                              <span className="block text-[11px] font-mono text-monte-sereno truncate">
                                {item.displayPhone}
                              </span>
                            </div>

                            <button
                              type="button"
                              title="Remover este contato"
                              onClick={() => {
                                setImportedRecipients(prev => prev.filter(r => r.id !== item.id));
                              }}
                              className="text-monte-sereno/50 hover:text-monte-terracota p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* CONTEÚDO DA ABA: CONTATOS SALVOS NO CRM */
            <div>
              <div className="p-4 border-b border-monte-sereno/15 space-y-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
                  <input
                    type="search"
                    className="input-rect pl-10"
                    placeholder="Filtrar contatos salvos..."
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-monte-sereno">
                  <span className="font-semibold text-monte-azul">
                    {selectedCrmContacts.length} de {MAX_BATCH_SIZE} selecionado(s)
                    <span className="text-monte-sereno font-normal"> (total: {contacts.length})</span>
                  </span>
                  <button
                    type="button"
                    className="font-semibold text-monte-verde hover:underline"
                    onClick={toggleVisibleCrm}
                    disabled={!contacts.length}
                  >
                    {visibleCrmIds.length > 0 && visibleCrmIds.every(id => selectedCrmIds.has(id))
                      ? 'Desmarcar selecionados'
                      : `Selecionar até ${MAX_BATCH_SIZE}`}
                  </button>
                </div>
              </div>

              <div className="max-h-[min(58vh,480px)] overflow-y-auto divide-y divide-monte-sereno/10">
                {loadingContacts ? (
                  <div className="p-12 text-center text-monte-sereno">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    <p className="text-sm mt-2">Carregando contatos...</p>
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="p-12 text-center text-monte-sereno">
                    <Users className="w-9 h-9 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhum contato encontrado.</p>
                  </div>
                ) : (
                  contacts.map(contact => {
                    const checked = selectedCrmIds.has(contact.id);
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => toggleCrmContact(contact.id)}
                        className={`w-full flex items-center gap-3 p-3.5 text-left transition-colors ${
                          checked ? 'bg-monte-verde/8' : 'hover:bg-monte-areiaSecao/60'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                            checked ? 'bg-monte-verde border-monte-verde text-white' : 'border-monte-sereno/40'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-monte-verde to-monte-azul text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {(displayContact(contact)[0] || '?').toUpperCase()}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-monte-azul truncate">
                            {displayContact(contact)}
                          </span>
                          <span className="block text-xs text-monte-sereno truncate">
                            {contact.phone || 'Telefone indisponível'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>

        {/* ETAPA 2 & 3: MONTAR MENSAGEM DO DISPARO + PRÉVIA REALISTA NO WHATSAPP */}
        <section className="card-static overflow-hidden xl:sticky xl:top-5 shadow-sm">
          {/* Cabeçalho do Composer com Abas de Edição e Prévia */}
          <div className="p-4 border-b border-monte-sereno/15 bg-monte-areiaSecao/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-monte-azul text-white flex items-center justify-center text-xs font-bold">2</span>
                <h3 className="font-semibold text-sm text-monte-azul">Montar Mensagem do Disparo</h3>
              </div>

              {/* Seletor de Modo: Editor vs Prévia Celular */}
              <div className="flex items-center bg-monte-sereno/15 p-0.5 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setMessageViewTab('editor')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                    messageViewTab === 'editor'
                      ? 'bg-white text-monte-azul shadow-sm'
                      : 'text-monte-sereno hover:text-monte-azul'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editor
                </button>
                <button
                  type="button"
                  onClick={() => setMessageViewTab('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                    messageViewTab === 'preview'
                      ? 'bg-monte-verde text-white shadow-sm'
                      : 'text-monte-sereno hover:text-monte-azul'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Prévia no WhatsApp
                </button>
              </div>
            </div>

            {/* BARRA DE FERRAMENTAS INTELIGENTE: FORMATADORES, VARIÁVEL {NOME}, EMOJIS E MODELOS */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {/* Formatação rápida */}
              <div className="flex items-center bg-white/80 border border-monte-sereno/20 rounded-xl p-0.5 shadow-2xs">
                <button
                  type="button"
                  title="Negrito (*texto*)"
                  onClick={() => insertTextAtCursor('*', '*')}
                  className="p-1.5 hover:bg-monte-areiaSecao rounded-lg text-monte-azul hover:text-monte-verde transition-colors"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Itálico (_texto_)"
                  onClick={() => insertTextAtCursor('_', '_')}
                  className="p-1.5 hover:bg-monte-areiaSecao rounded-lg text-monte-azul hover:text-monte-verde transition-colors"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Tachado (~texto~)"
                  onClick={() => insertTextAtCursor('~', '~')}
                  className="p-1.5 hover:bg-monte-areiaSecao rounded-lg text-monte-azul hover:text-monte-verde transition-colors"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Botão de Variável {nome} */}
              <button
                type="button"
                onClick={() => insertTextAtCursor('{nome}')}
                className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 hover:border-monte-verde text-monte-verde font-semibold"
                title="Insere {nome} que será trocado pelo nome real de cada contato no envio"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                + Inserir {'{nome}'}
              </button>

              {/* Botões de Emojis Rápidos */}
              <div className="flex items-center gap-1 bg-white/80 border border-monte-sereno/20 rounded-xl px-1.5 py-0.5">
                <Smile className="w-3.5 h-3.5 text-monte-sereno mr-0.5" />
                {['👋', '🚀', '💬', '📅', '✅', '⚠️', '💰', '👍'].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertTextAtCursor(emoji)}
                    className="hover:scale-125 transition-transform text-xs p-0.5"
                    title={`Inserir ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Dropdown de Modelos / Mensagens Rápidas */}
              {quickMessages.length > 0 && (
                <select
                  className="input-rect py-1 px-2 text-xs max-w-[170px] bg-white cursor-pointer ml-auto"
                  onChange={e => {
                    const qm = quickMessages.find(m => m.id === e.target.value);
                    if (qm) {
                      setMessage(qm.content);
                    }
                    e.target.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    ⚡ Usar Modelo Pronto...
                  </option>
                  {quickMessages.map(qm => (
                    <option key={qm.id} value={qm.id}>
                      {qm.title} ({qm.shortcut})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="p-5 space-y-4">
            {messageViewTab === 'editor' ? (
              /* MODO EDITOR DE MENSAGEM */
              <div className="space-y-3">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    rows={6}
                    className="input-rect min-h-[140px] text-sm leading-relaxed resize-y focus:bg-white placeholder:text-monte-sereno/60 font-sans"
                    placeholder={`Escreva aqui a mensagem do disparo...
Exemplo:
Olá {nome}, tudo bem?
Passando para avisar sobre a novidade especial de hoje! 🚀
Qualquer dúvida me chame aqui.`}
                    value={message}
                    onChange={event => setMessage(event.target.value)}
                    disabled={sending}
                  />

                  {/* Contador de caracteres e tags */}
                  <div className="flex items-center justify-between text-[11px] text-monte-sereno pt-1 px-1">
                    <span className="flex items-center gap-2">
                      <span>{charCount} caracteres</span>
                      <span>·</span>
                      <span>{lineCount} linha(s)</span>
                      {hasNameVar && (
                        <span className="text-monte-verde font-semibold bg-monte-verde/10 px-1.5 py-0.2 rounded-md">
                          ✓ Personalizado com {'{nome}'}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMessageViewTab('preview')}
                      className="text-monte-verde hover:underline font-semibold flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> Ver como fica no WhatsApp
                    </button>
                  </div>
                </div>

                {/* Bloco de Anexo (Foto, Áudio, Vídeo, Documento) */}
                {attachment ? (
                  <div className="rounded-2xl border border-monte-verde/25 bg-monte-verde/5 p-3 flex items-center gap-3 shadow-2xs">
                    {attachment.type === 'image' ? (
                      <div className="w-12 h-12 rounded-xl bg-monte-verde/15 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img src={attachment.url} alt="Anexo" className="w-full h-full object-cover" />
                      </div>
                    ) : attachment.type === 'audio' ? (
                      <div className="w-10 h-10 rounded-xl bg-monte-verde/20 text-monte-verde flex items-center justify-center flex-shrink-0">
                        <FileAudio className="w-5 h-5" />
                      </div>
                    ) : attachment.type === 'video' ? (
                      <div className="w-10 h-10 rounded-xl bg-monte-verde/20 text-monte-verde flex items-center justify-center flex-shrink-0">
                        <Video className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-monte-verde/20 text-monte-verde flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-monte-azul truncate">{attachment.originalName}</p>
                      <span className="text-[11px] text-monte-sereno">
                        Anexo ({attachment.type === 'image' ? 'Imagem' : attachment.type === 'video' ? 'Vídeo' : attachment.type === 'audio' ? 'Áudio' : 'Documento'}) · Será enviado com a mensagem
                      </span>
                    </div>

                    <button
                      type="button"
                      title="Remover anexo"
                      onClick={() => setAttachment(null)}
                      className="text-monte-sereno hover:text-monte-terracota p-1.5 transition-colors"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <label className="btn-secondary w-full text-center cursor-pointer flex items-center justify-center gap-2 py-2.5 text-xs">
                    <Paperclip className="w-4 h-4 text-monte-verde" />
                    {uploading ? 'Enviando arquivo...' : 'Anexar Imagem, Vídeo, Documento ou Áudio'}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                      onChange={handleAttachment}
                      disabled={uploading || sending}
                    />
                  </label>
                )}

                {/* PRÉVIA EMBUTIDA EM TEMPO REAL LOGO ABAIXO DO TEXTO */}
                {(message.trim() || attachment) && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-monte-sereno mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-monte-verde" />
                        Prévia Rápida do Balão:
                      </span>
                      <span className="text-[11px] font-normal text-monte-sereno">
                        Simulando envio para: <strong>{sampleRecipient.name}</strong>
                      </span>
                    </div>

                    {/* Balão de WhatsApp */}
                    <div className="rounded-2xl bg-[#efeae2] p-3.5 border border-[#dfd8cc] shadow-inner">
                      <div className="bg-[#d9fdd3] text-[#111b21] p-3 rounded-2xl rounded-tr-xs shadow-sm max-w-[92%] ml-auto relative">
                        {/* Mídia na prévia */}
                        {attachment && (
                          <div className="mb-2 overflow-hidden rounded-xl bg-black/5">
                            {attachment.type === 'image' ? (
                              <img src={attachment.url} alt="Prévia" className="max-h-48 w-full object-cover rounded-xl" />
                            ) : attachment.type === 'video' ? (
                              <video src={attachment.url} controls className="max-h-48 w-full rounded-xl" />
                            ) : attachment.type === 'audio' ? (
                              <audio src={attachment.url} controls className="w-full my-1" />
                            ) : (
                              <div className="flex items-center gap-2 p-2.5 bg-white/70 rounded-xl">
                                <FileText className="w-5 h-5 text-monte-verde flex-shrink-0" />
                                <span className="text-xs font-semibold text-monte-azul truncate">
                                  {attachment.originalName}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Texto com formatação */}
                        {message.trim() ? (
                          renderWhatsAppFormatted(message, sampleRecipient.name)
                        ) : (
                          <p className="text-xs italic text-gray-500">Sem texto na mensagem.</p>
                        )}

                        {/* Horário e Check Duplo */}
                        <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] mt-1.5 font-mono select-none">
                          <span>15:58</span>
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* MODO SIMULADOR DE CELULAR / PRÉVIA WHATSAPP COMPLETA */
              <div className="space-y-3">
                <div className="rounded-3xl border-2 border-slate-300 bg-slate-900 p-2 shadow-lg max-w-sm mx-auto">
                  {/* Topo do Celular (Câmera) */}
                  <div className="w-24 h-3.5 bg-black rounded-full mx-auto mb-2 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-slate-800" />
                  </div>

                  {/* Tela do WhatsApp */}
                  <div className="rounded-2xl overflow-hidden bg-[#efeae2] border border-slate-700 text-[#111b21] flex flex-col min-h-[360px]">
                    {/* Barra Superior WhatsApp */}
                    <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2.5 shadow-sm">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white uppercase">
                        {(sampleRecipient.name[0] || 'C').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate leading-tight">{sampleRecipient.name}</p>
                        <p className="text-[10px] text-emerald-200 truncate leading-tight">online</p>
                      </div>
                      <Phone className="w-4 h-4 opacity-75" />
                    </div>

                    {/* Área de Conversa com Doodle */}
                    <div className="p-3 flex-1 flex flex-col justify-end space-y-2">
                      <div className="text-center my-1">
                        <span className="bg-white/80 text-[10px] text-gray-600 px-2 py-0.5 rounded-md shadow-2xs font-semibold">
                          HOJE
                        </span>
                      </div>

                      {/* Balão do WhatsApp */}
                      <div className="bg-[#d9fdd3] text-[#111b21] p-3 rounded-2xl rounded-tr-xs shadow-sm max-w-[92%] ml-auto relative">
                        {attachment && (
                          <div className="mb-2 overflow-hidden rounded-xl bg-black/5">
                            {attachment.type === 'image' ? (
                              <img src={attachment.url} alt="Prévia" className="max-h-44 w-full object-cover rounded-xl" />
                            ) : attachment.type === 'video' ? (
                              <video src={attachment.url} controls className="max-h-44 w-full rounded-xl" />
                            ) : attachment.type === 'audio' ? (
                              <audio src={attachment.url} controls className="w-full my-1" />
                            ) : (
                              <div className="flex items-center gap-2 p-2 bg-white/70 rounded-xl">
                                <FileText className="w-5 h-5 text-monte-verde flex-shrink-0" />
                                <span className="text-xs font-semibold text-monte-azul truncate">
                                  {attachment.originalName}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {message.trim() ? (
                          renderWhatsAppFormatted(message, sampleRecipient.name)
                        ) : (
                          <p className="text-xs italic text-gray-500">
                            (Nenhuma mensagem digitada ainda. Volte para a aba &apos;Editor&apos; para escrever).
                          </p>
                        )}

                        <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] mt-1.5 font-mono select-none">
                          <span>15:58</span>
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                        </div>
                      </div>
                    </div>

                    {/* Barra de Digitação Fictícia */}
                    <div className="bg-[#f0f2f5] p-2 flex items-center gap-2 border-t border-gray-300">
                      <div className="bg-white rounded-full px-3 py-1 text-xs text-gray-400 flex-1 truncate">
                        Mensagem
                      </div>
                      <div className="w-7 h-7 rounded-full bg-[#00a884] text-white flex items-center justify-center">
                        <Send className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setMessageViewTab('editor')}
                    className="btn-secondary text-xs py-1.5 px-4 font-semibold inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-monte-azul" />
                    Voltar para o Editor e ajustar texto
                  </button>
                </div>
              </div>
            )}

            {/* PAINEL DE CONTROLE DE CADÊNCIA ANTI-BLOQUEIO META (MARGEM DE SEGURANÇA ATÉ 45s) */}
            <div className="rounded-2xl border border-monte-azul/15 bg-gradient-to-br from-monte-areiaSecao/80 via-white to-monte-areiaSecao/40 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-monte-verde/15 text-monte-verde flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-monte-azul flex items-center gap-1.5">
                      <span>Cadência Anti-Bloqueio Meta</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                        Margem 45s
                      </span>
                    </h4>
                    <p className="text-[11px] text-monte-sereno">
                      Intervalo humanizado aleatório entre envios para evitar banimento da Meta.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSoundEnabled(v => !v)}
                  className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-all ${
                    soundEnabled
                      ? 'bg-monte-verde/10 text-monte-verde border-monte-verde/30'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                  title={soundEnabled ? 'Aviso sonoro ativo' : 'Aviso sonoro mudo'}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold">{soundEnabled ? 'Som Ativo' : 'Mudo'}</span>
                </button>
              </div>

              {/* Botões de Seleção de Preset */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('safe45')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between ${
                    cadencePreset === 'safe45'
                      ? 'bg-monte-verde text-white border-monte-verde shadow-sm'
                      : 'bg-white hover:bg-slate-50 text-monte-azul border-monte-sereno/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>🛡️ Margem 45s</span>
                    {cadencePreset === 'safe45' && <Check className="w-3 h-3" />}
                  </div>
                  <span className={`text-[10px] mt-0.5 ${cadencePreset === 'safe45' ? 'text-emerald-100' : 'text-monte-sereno'}`}>
                    20s a 45s (Recomendado)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('ultra')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between ${
                    cadencePreset === 'ultra'
                      ? 'bg-monte-verde text-white border-monte-verde shadow-sm'
                      : 'bg-white hover:bg-slate-50 text-monte-azul border-monte-sereno/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>🐢 Ultra Seguro</span>
                    {cadencePreset === 'ultra' && <Check className="w-3 h-3" />}
                  </div>
                  <span className={`text-[10px] mt-0.5 ${cadencePreset === 'ultra' ? 'text-emerald-100' : 'text-monte-sereno'}`}>
                    35s a 60s (Chip novo)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('quick')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between ${
                    cadencePreset === 'quick'
                      ? 'bg-monte-verde text-white border-monte-verde shadow-sm'
                      : 'bg-white hover:bg-slate-50 text-monte-azul border-monte-sereno/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>⚡ Rápido</span>
                    {cadencePreset === 'quick' && <Check className="w-3 h-3" />}
                  </div>
                  <span className={`text-[10px] mt-0.5 ${cadencePreset === 'quick' ? 'text-emerald-100' : 'text-monte-sereno'}`}>
                    10s a 25s (Avisos)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('custom')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between ${
                    cadencePreset === 'custom'
                      ? 'bg-monte-verde text-white border-monte-verde shadow-sm'
                      : 'bg-white hover:bg-slate-50 text-monte-azul border-monte-sereno/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>⚙️ Ajustar</span>
                    {cadencePreset === 'custom' && <Check className="w-3 h-3" />}
                  </div>
                  <span className={`text-[10px] mt-0.5 ${cadencePreset === 'custom' ? 'text-emerald-100' : 'text-monte-sereno'}`}>
                    {minDelay}s a {maxDelay}s
                  </span>
                </button>
              </div>

              {/* Controles customizados se preset for custom */}
              {cadencePreset === 'custom' && (
                <div className="p-2.5 bg-white rounded-xl border border-monte-sereno/20 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] font-semibold text-monte-azul block mb-1">
                      Espera Mínima por envio (s):
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={minDelay}
                      onChange={e => setMinDelay(Math.max(5, Number(e.target.value) || 5))}
                      className="input-field py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-monte-azul block mb-1">
                      Espera Máxima por envio (s):
                    </label>
                    <input
                      type="number"
                      min={minDelay}
                      max={180}
                      value={maxDelay}
                      onChange={e => setMaxDelay(Math.max(minDelay, Number(e.target.value) || minDelay))}
                      className="input-field py-1 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Rodapé com tempo estimado do lote */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-monte-sereno/15 text-[11px]">
                <div className="flex items-center gap-1.5 text-monte-azul font-medium">
                  <Clock className="w-3.5 h-3.5 text-monte-verde" />
                  <span>Tempo estimado para este lote ({currentRecipients.length} contatos):</span>
                  <strong className="text-monte-verde font-bold">{estimatedBatchTime}</strong>
                </div>

                {'Notification' in window && Notification.permission !== 'granted' && (
                  <button
                    type="button"
                    onClick={requestNotificationPermission}
                    className="text-[10.5px] text-monte-azul underline font-semibold flex items-center gap-1 hover:text-monte-verde"
                  >
                    <Bell className="w-3 h-3" />
                    Ativar aviso push no navegador
                  </button>
                )}
              </div>
            </div>

            {/* BOX DE CONFERÊNCIA E TRAVA DE 10 */}
            <div className="rounded-2xl bg-monte-areiaSecao p-3.5 text-xs text-monte-sereno space-y-2 border border-monte-sereno/15">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-monte-azul">Destinatários selecionados:</span>
                <span
                  className={`font-bold text-sm ${
                    currentRecipients.length > MAX_BATCH_SIZE
                      ? 'text-red-600'
                      : currentRecipients.length > 0
                        ? 'text-monte-verde'
                        : 'text-monte-sereno'
                  }`}
                >
                  {currentRecipients.length} de {MAX_BATCH_SIZE}
                </span>
              </div>

              {sourceMode === 'excel' && excelBatches.length > 0 && (
                <div className="text-[11.5px] text-monte-azul flex items-center justify-between border-t border-monte-sereno/15 pt-1.5">
                  <span>
                    Disparando <strong>Lote {currentBatchIndex + 1} de {excelBatches.length}</strong>
                  </span>
                  <span className="text-monte-sereno">
                    {sentBatchIndexes.size} de {excelBatches.length} lotes enviados
                  </span>
                </div>
              )}

              {currentRecipients.length > MAX_BATCH_SIZE && (
                <p className="text-red-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Trava de segurança ativa: máximo de {MAX_BATCH_SIZE} contatos por envio.
                </p>
              )}

              {!message.trim() && !attachment && (
                <p className="text-amber-700">Digite uma mensagem ou adicione um arquivo antes de disparar.</p>
              )}
            </div>

            {/* AVISO DE ENVIO EM ANDAMENTO COM CADÊNCIA */}
            {sending && (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-3.5 text-xs text-emerald-900 space-y-2 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-950">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                  <span>Disparo em andamento com cadência humanizada...</span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-emerald-800">
                  As mensagens estão sendo disparadas de forma espaçada (intervalo aleatório entre <strong>{minDelay}s e {maxDelay}s</strong>) para total proteção contra bloqueios da Meta.
                  Você receberá um <strong>aviso sonoro e notificação</strong> assim que o lote for concluído.
                </p>
              </div>
            )}

            {/* BOTÃO PRINCIPAL DE DISPARO */}
            <button
              type="button"
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm font-bold shadow-md hover:shadow-lg transition-all"
              onClick={handleSend}
              disabled={
                !connected ||
                currentRecipients.length === 0 ||
                currentRecipients.length > MAX_BATCH_SIZE ||
                (!message.trim() && !attachment) ||
                uploading ||
                sending
              }
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Disparando com proteção anti-bloqueio ({currentRecipients.length} contatos)...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {sourceMode === 'excel' && excelBatches.length > 1
                    ? `Disparar Lote ${currentBatchIndex + 1} (${currentRecipients.length}/${MAX_BATCH_SIZE})`
                    : `Disparar para selecionados (${currentRecipients.length}/${MAX_BATCH_SIZE})`}
                </>
              )}
            </button>

            <div className="text-[11px] text-monte-sereno text-center flex items-center justify-center gap-1">
              <Lock className="w-3 h-3 text-amber-600" />
              Trava de segurança ativa (máx. 10) · Intervalo seguro de {minDelay}s a {maxDelay}s
            </div>

            {accounts.length === 0 && !loadingAccounts && (
              <button type="button" className="btn-secondary w-full" onClick={loadAccounts}>
                Tentar carregar WhatsApps novamente
              </button>
            )}

            {/* RESULTADO DO DISPARO */}
            {result && (
              <div
                className={`rounded-2xl border p-3.5 text-sm ${
                  result.failed ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-monte-azul">
                  {result.failed ? (
                    <XCircle className="w-4 h-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                  {result.sent} enviado(s) · {result.failed} falha(s)
                </div>
                {result.failed > 0 && (
                  <div className="mt-2 space-y-1 text-xs text-amber-800">
                    {result.results
                      .filter((item: any) => !item.ok)
                      .map((item: any) => (
                        <p key={item.to}>
                          {item.to}: {item.error}
                        </p>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}