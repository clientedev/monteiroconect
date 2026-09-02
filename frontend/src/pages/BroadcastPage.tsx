import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, contactApi, conversationApi, whatsappApi } from '../lib/api';
import {
  Check,
  CheckCircle2,
  FileAudio,
  FileText,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Search,
  Send,
  Users,
  Video,
  XCircle,
} from 'lucide-react';

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
  return accounts.filter(account => account && typeof account === 'object' && typeof (account as { id?: unknown }).id === 'string');
}

function normalizeContacts(value: unknown): Contact[] {
  const contacts = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { contacts?: unknown }).contacts)
      ? (value as { contacts: unknown[] }).contacts
      : [];
  return contacts.filter(contact => contact && typeof contact === 'object' && typeof (contact as { id?: unknown }).id === 'string') as Contact[];
}

export default function BroadcastPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const selectedAccount = accounts.find(account => account.id === accountId);
  const connected = selectedAccount?.status === 'CONNECTED';
  const visibleIds = useMemo(() => contacts.map(contact => contact.id), [contacts]);
  const selectedContacts = useMemo(
    () => contacts.filter(contact => selectedIds.has(contact.id) && !!contact.phone?.trim()),
    [contacts, selectedIds],
  );

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
      setAccountId(current => nextAccounts.some(account => account.id === current) ? current : (nextAccounts[0]?.id || ''));
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
    setSelectedIds(new Set());
    setResult(null);
  }, [accountId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const toggleContact = (id: string) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds(current => {
      const next = new Set(current);
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => next.has(id));
      visibleIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

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

  const handleSend = async () => {
    if (!accountId || !connected || selectedContacts.length === 0 || (!message.trim() && !attachment)) return;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const response = await conversationApi.broadcast(
        accountId,
        selectedContacts
          .map(contact => contact.phone)
          .filter((phone): phone is string => !!phone?.trim()),
        attachment?.type === 'document' ? (message.trim() || attachment.originalName) : message.trim(),
        attachment?.type || 'text',
        attachment?.url,
        attachment?.mimetype,
        attachment?.originalName,
      );
      setResult(response);
      if (response.failed === 0) {
        setMessage('');
        setAttachment(null);
        setSelectedIds(new Set());
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível realizar o disparo');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-monte-terracota/15 text-monte-terracota flex items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="section-title">Disparo para contatos</h2>
            <p className="text-sm text-monte-sereno mt-1">Envie a mesma mensagem para vários contatos de uma vez.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button type="button" className="ml-auto underline" onClick={() => setError('')}>Fechar</button>
        </div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <section className="card-static overflow-hidden">
          <div className="p-4 border-b border-monte-sereno/15 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              {loadingAccounts ? (
                <div className="input-rect sm:max-w-xs flex items-center gap-2 text-monte-sereno">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando WhatsApps...
                </div>
              ) : (
                <select className="input-rect sm:max-w-xs" value={accountId} onChange={event => setAccountId(event.target.value)}>
                  {accounts.length === 0 && <option value="">Nenhum WhatsApp configurado</option>}
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} — {account.status === 'CONNECTED' ? 'conectado' : 'desconectado'}
                    </option>
                  ))}
                </select>
              )}
              <span className={`text-xs font-semibold ${connected ? 'text-emerald-700' : 'text-amber-700'}`}>
                {connected ? 'Pronto para enviar' : 'Conecte o WhatsApp para disparar'}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
              <input
                type="search"
                className="input-rect pl-10"
                placeholder="Filtrar contatos..."
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-monte-sereno">
               <span>{selectedContacts.length} selecionado(s) de {contacts.length}</span>
              <button type="button" className="font-semibold text-monte-verde hover:underline" onClick={toggleVisible} disabled={!contacts.length}>
                {visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id)) ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
              </button>
            </div>
          </div>

          <div className="max-h-[min(58vh,620px)] overflow-y-auto divide-y divide-monte-sereno/10">
            {loadingContacts ? (
              <div className="p-12 text-center text-monte-sereno"><Loader2 className="w-6 h-6 animate-spin mx-auto" /><p className="text-sm mt-2">Carregando contatos...</p></div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center text-monte-sereno">
                <Users className="w-9 h-9 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum contato encontrado.</p>
              </div>
            ) : contacts.map(contact => {
              const checked = selectedIds.has(contact.id);
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => toggleContact(contact.id)}
                  className={`w-full flex items-center gap-3 p-3.5 text-left transition-colors ${checked ? 'bg-monte-verde/8' : 'hover:bg-monte-areiaSecao/60'}`}
                >
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-monte-verde border-monte-verde text-white' : 'border-monte-sereno/40'}`}>
                    {checked && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-monte-verde to-monte-azul text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(displayContact(contact)[0] || '?').toUpperCase()}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-monte-azul truncate">{displayContact(contact)}</span>
                     <span className="block text-xs text-monte-sereno truncate">{contact.phone || 'Telefone indisponível'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card-static p-5 space-y-4 xl:sticky xl:top-5">
          <div>
            <h3 className="font-display font-semibold text-monte-azul">Mensagem</h3>
            <p className="text-xs text-monte-sereno mt-1">O WhatsApp enviará os contatos um por vez.</p>
          </div>
          <textarea
            className="input-rect min-h-[150px] resize-y"
            placeholder="Digite a mensagem do disparo..."
            value={message}
            onChange={event => setMessage(event.target.value)}
            disabled={sending}
          />

          {attachment && (
            <div className="rounded-2xl border border-monte-verde/20 bg-monte-verde/5 p-3 flex items-center gap-3">
               {attachment.type === 'image'
                 ? <ImageIcon className="w-5 h-5 text-monte-verde" />
                 : attachment.type === 'audio'
                   ? <FileAudio className="w-5 h-5 text-monte-verde" />
                   : attachment.type === 'video'
                     ? <Video className="w-5 h-5 text-monte-verde" />
                     : <FileText className="w-5 h-5 text-monte-verde" />}
              <span className="text-sm text-monte-azul truncate flex-1">{attachment.originalName}</span>
              <button type="button" title="Remover anexo" onClick={() => setAttachment(null)} className="text-monte-sereno hover:text-monte-terracota">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="btn-secondary flex-1 text-center cursor-pointer">
               {uploading ? 'Enviando anexo...' : 'Adicionar imagem, vídeo, documento ou áudio'}
              <input type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" onChange={handleAttachment} disabled={uploading || sending} />
            </label>
          </div>

          <div className="rounded-2xl bg-monte-areiaSecao p-3 text-xs text-monte-sereno">
             <p><strong className="text-monte-azul">{selectedContacts.length}</strong> contato(s) receberão esta mensagem.</p>
            {!message.trim() && !attachment && <p className="mt-1 text-amber-700">Digite uma mensagem ou adicione um arquivo.</p>}
          </div>

          <button
            type="button"
            className="btn-primary w-full flex items-center justify-center gap-2"
            onClick={handleSend}
             disabled={!connected || selectedContacts.length === 0 || (!message.trim() && !attachment) || uploading || sending}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Enviando disparo...' : 'Enviar para selecionados'}
          </button>

           {accounts.length === 0 && !loadingAccounts && (
             <button type="button" className="btn-secondary w-full" onClick={loadAccounts}>
               Tentar carregar novamente
             </button>
           )}

          {result && (
            <div className={`rounded-2xl border p-3 text-sm ${result.failed ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-monte-azul">
                {result.failed ? <XCircle className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                {result.sent} enviado(s) · {result.failed} falha(s)
              </div>
              {result.failed > 0 && (
                <div className="mt-2 space-y-1 text-xs text-amber-800">
                  {result.results.filter((item: any) => !item.ok).map((item: any) => (
                    <p key={item.to}>{item.to}: {item.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}