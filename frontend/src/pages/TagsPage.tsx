import { useState, useEffect } from 'react';
import { tagApi } from '../lib/api';
import { Tag as TagIcon, Plus, Trash2, Edit2, X, Save } from 'lucide-react';

export default function TagsPage() {
  const [tags, setTags] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#08454c');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const load = async () => {
    try { setTags(await tagApi.list()); } catch {}
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await tagApi.create(newName.trim(), newColor);
      setNewName('');
      setShowCreate(false);
      load();
    } catch (err: any) { alert(err.message); }
  };

  const handleUpdate = async (id: string) => {
    try {
      await tagApi.update(id, { name: editName, color: editColor });
      setEditingId(null);
      load();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta etiqueta?')) return;
    try { await tagApi.delete(id); load(); } catch {}
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Etiquetas</h2>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova Etiqueta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tags.map(tag => (
          <div key={tag.id} className="card-static p-5 flex items-center gap-3">
            <div className="w-5 h-5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: tag.color }} />
            {editingId === tag.id ? (
              <div className="flex-1 flex gap-2">
                <input type="text" className="input-rect text-sm py-1.5 flex-1" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                <input type="color" className="w-9 h-9 rounded-xl cursor-pointer border-0" value={editColor} onChange={e => setEditColor(e.target.value)} />
                <button onClick={() => handleUpdate(tag.id)} className="text-emerald-600 hover:text-emerald-700"><Save className="w-4 h-4" /></button>
                <button onClick={() => setEditingId(null)} className="text-monte-sereno hover:text-monte-azul"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <>
                <span className="text-sm font-semibold text-monte-azul flex-1">{tag.name}</span>
                <button onClick={() => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); }} className="text-monte-sereno hover:text-monte-verde"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(tag.id)} className="text-monte-sereno hover:text-monte-terracota"><Trash2 className="w-4 h-4" /></button>
              </>
            )}
          </div>
        ))}
      </div>

      {tags.length === 0 && !showCreate && (
        <div className="card-static p-16 text-center text-monte-sereno">
          <TagIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-display font-semibold">Nenhuma etiqueta criada</p>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-monte-azul/30 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-4xl p-8 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold font-display text-monte-azul mb-6">Nova Etiqueta</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-monte-azul mb-2">Nome</label>
                <input type="text" className="input" value={newName} onChange={e => setNewName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-monte-azul mb-2">Cor</label>
                <input type="color" className="w-14 h-10 rounded-xl cursor-pointer" value={newColor} onChange={e => setNewColor(e.target.value)} />
              </div>
              <button onClick={handleCreate} disabled={!newName.trim()} className="btn-primary w-full">Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
