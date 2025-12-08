import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Trash2, Syringe, Package, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const DEFAULT_CATEGORIES = ['Medicamento', 'Insumo', 'Equipamento', 'Descartável', 'Cosmético', 'Outro'];

export default function Settings() {
  const [procedureModal, setProcedureModal] = useState(false);
  const [materialModal, setMaterialModal] = useState(false);
  const [userModal, setUserModal] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState(null);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteData, setDeleteData] = useState({ type: null, id: null, name: null });
  const queryClient = useQueryClient();

  const { data: procedures = [] } = useQuery({ queryKey: ['procedures'], queryFn: async () => { const { data } = await supabase.from('procedures').select('*').order('name'); return data || []; } });
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: async () => { const { data } = await supabase.from('materials').select('*').order('name'); return data || []; } });
  const { data: users = [] } = useQuery({ queryKey: ['system_users'], queryFn: async () => { const { data } = await supabase.from('system_users').select('*').order('full_name'); return data || []; } });

  // Categorias dinâmicas
  const availableCategories = useMemo(() => {
    const existing = materials.map(m => m.category).filter(Boolean);
    return [...new Set([...DEFAULT_CATEGORIES, ...existing])].sort();
  }, [materials]);

  const saveMutation = useMutation({
    mutationFn: async ({ table, data }) => { const { id, ...rest } = data; if (id) await supabase.from(table).update(rest).eq('id', id); else await supabase.from(table).insert([rest]); },
    onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: [variables.table === 'system_users' ? 'system_users' : variables.table] }); setProcedureModal(false); setMaterialModal(false); setUserModal(false); toast.success('Salvo!'); }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ table, id }) => await supabase.from(table).delete().eq('id', id),
    onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: [variables.table === 'system_users' ? 'system_users' : variables.table] }); setDeleteData({ type: null, id: null, name: null }); toast.success('Excluído'); }
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Cadastros" subtitle="Procedimentos, materiais e equipe" />
      <Tabs defaultValue="procedures">
        <TabsList className="bg-stone-100"><TabsTrigger value="procedures">Procedimentos</TabsTrigger><TabsTrigger value="materials">Materiais</TabsTrigger><TabsTrigger value="users">Equipe</TabsTrigger></TabsList>
        
        <TabsContent value="procedures" className="mt-6">
          <div className="flex justify-end mb-4"><Button onClick={() => { setEditingProcedure(null); setProcedureModal(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2"/> Novo Procedimento</Button></div>
          <div className="grid gap-3">{procedures.map(p => (<Card key={p.id} className="bg-white"><CardContent className="p-4 flex justify-between items-center"><div className="flex gap-3 items-center"><div className="p-2 bg-stone-100 rounded"><Syringe className="w-4 h-4 text-stone-600"/></div><div><h3 className="font-bold">{p.name}</h3><div className="text-xs text-stone-500">{p.has_variable_price ? <Badge variant="outline">Variável</Badge> : `R$ ${p.default_price}`}</div></div></div><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditingProcedure(p); setProcedureModal(true); }}><Edit2 className="w-4 h-4"/></Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleteData({ type: 'procedures', id: p.id, name: p.name })}><Trash2 className="w-4 h-4"/></Button></div></CardContent></Card>))}</div>
        </TabsContent>

        <TabsContent value="materials" className="mt-6">
          <div className="flex justify-end mb-4"><Button onClick={() => { setEditingMaterial(null); setMaterialModal(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2"/> Novo Material</Button></div>
          <div className="grid gap-3">{materials.map(m => (<Card key={m.id} className="bg-white border-stone-100"><CardContent className="p-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="p-2 bg-stone-100 rounded-lg"><Package className="w-4 h-4 text-stone-600" /></div><div><h3 className="font-medium text-stone-800">{m.name}</h3><p className="text-xs text-stone-500">{m.category} • {m.stock_quantity} {m.unit}</p></div></div><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditingMaterial(m); setMaterialModal(true); }}><Edit2 className="w-4 h-4"/></Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleteData({ type: 'materials', id: m.id, name: m.name })}><Trash2 className="w-4 h-4"/></Button></div></CardContent></Card>))}</div>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <div className="flex justify-end mb-4"><Button onClick={() => { setEditingUser(null); setUserModal(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2"/> Novo Usuário</Button></div>
          <div className="grid gap-3">{users.map(u => (<Card key={u.id} className="bg-white border-stone-100"><CardContent className="p-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="p-2 bg-stone-100 rounded-lg"><Users className="w-4 h-4 text-stone-600"/></div><div><h3 className="font-medium text-stone-800">{u.full_name}</h3><p className="text-xs text-stone-500">{u.email}</p></div></div><div className="flex items-center gap-2"><Badge variant="outline">{u.role}</Badge><Button variant="ghost" size="sm" onClick={() => { setEditingUser(u); setUserModal(true); }}><Edit2 className="w-4 h-4"/></Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleteData({ type: 'system_users', id: u.id, name: u.full_name })}><Trash2 className="w-4 h-4"/></Button></div></CardContent></Card>))}</div>
        </TabsContent>
      </Tabs>

      <ProcedureModal open={procedureModal} onClose={() => setProcedureModal(false)} procedure={editingProcedure} onSave={(data) => saveMutation.mutate({ table: 'procedures', data })} />
      
      {/* PASSANDO CATEGORIAS DINÂMICAS */}
      <MaterialModal open={materialModal} onClose={() => setMaterialModal(false)} material={editingMaterial} categories={availableCategories} onSave={(data) => saveMutation.mutate({ table: 'materials', data })} />
      
      <UserModal open={userModal} onClose={() => setUserModal(false)} user={editingUser} onSave={(data) => saveMutation.mutate({ table: 'system_users', data })} />
      <AlertDialog open={!!deleteData.id} onOpenChange={() => setDeleteData({ type: null, id: null, name: null })}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-600" onClick={() => deleteMutation.mutate({ table: deleteData.type, id: deleteData.id })}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function ProcedureModal({ open, onClose, procedure, onSave }) {
  const [formData, setFormData] = useState({});
  React.useEffect(() => { if (procedure) setFormData(procedure); else setFormData({ name: '', description: '', has_variable_price: false, default_price: '', duration_minutes: '' }); }, [procedure, open]);
  const handleSubmit = (e) => { e.preventDefault(); onSave({...formData, default_price: formData.has_variable_price ? 0 : parseFloat(formData.default_price), duration_minutes: parseInt(formData.duration_minutes)}); };
  return (
    <Dialog open={open} onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>{procedure ? 'Editar' : 'Novo'} Procedimento</DialogTitle><DialogDescription className="hidden">Form</DialogDescription></DialogHeader><form onSubmit={handleSubmit} className="space-y-4"><div><Label>Nome</Label><Input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} required/></div><div><Label>Descrição</Label><Textarea value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})}/></div><div className="flex items-center gap-2 bg-stone-50 p-3 rounded"><Checkbox checked={formData.has_variable_price} onCheckedChange={c => setFormData({...formData, has_variable_price: c})}/><Label>Preço Variável</Label></div>{!formData.has_variable_price && <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={formData.default_price || ''} onChange={e => setFormData({...formData, default_price: e.target.value})} required/></div>}<div><Label>Duração (min)</Label><Input type="number" value={formData.duration_minutes || ''} onChange={e => setFormData({...formData, duration_minutes: e.target.value})}/></div><DialogFooter><Button variant="outline" type="button" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter></form></DialogContent></Dialog>
  );
}

function MaterialModal({ open, onClose, material, categories, onSave }) {
  const [formData, setFormData] = useState({});
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  React.useEffect(() => { 
    if (material) { setFormData(material); setIsCustomCategory(false); }
    else { setFormData({ name: '', category: '', unit: 'un', cost_per_unit: '', stock_quantity: 0, minimum_stock: 5, supplier: '' }); setIsCustomCategory(false); }
  }, [material, open]);

  const handleSubmit = (e) => { e.preventDefault(); onSave({...formData, cost_per_unit: parseFloat(formData.cost_per_unit), stock_quantity: parseFloat(formData.stock_quantity), minimum_stock: parseFloat(formData.minimum_stock)}); };

  return (
    <Dialog open={open} onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>{material ? 'Editar' : 'Novo'} Material</DialogTitle><DialogDescription className="hidden">Form</DialogDescription></DialogHeader><form onSubmit={handleSubmit} className="space-y-4">
      <div><Label>Nome</Label><Input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} required/></div>
      <div className="grid grid-cols-2 gap-4">
         <div>
            <Label>Categoria</Label>
            {isCustomCategory ? (
                <div className="flex gap-2"><Input value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="Nova Categoria" autoFocus /><Button type="button" variant="ghost" size="icon" onClick={() => setIsCustomCategory(false)}><X className="w-4 h-4"/></Button></div>
            ) : (
                <Select value={formData.category} onValueChange={v => { if(v==='custom_new'){setIsCustomCategory(true);setFormData({...formData,category:''})}else{setFormData({...formData,category:v})} }}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}<SelectItem value="custom_new" className="font-bold text-blue-600">+ Nova Categoria</SelectItem></SelectContent></Select>
            )}
         </div>
         <div><Label>Unidade</Label><Input value={formData.unit || ''} onChange={e => setFormData({...formData, unit: e.target.value})}/></div>
      </div>
      <div className="grid grid-cols-3 gap-4"><div><Label>Custo</Label><Input type="number" step="0.01" value={formData.cost_per_unit || ''} onChange={e => setFormData({...formData, cost_per_unit: e.target.value})} required/></div><div><Label>Estoque</Label><Input type="number" value={formData.stock_quantity || ''} onChange={e => setFormData({...formData, stock_quantity: e.target.value})}/></div><div><Label>Mínimo</Label><Input type="number" value={formData.minimum_stock || ''} onChange={e => setFormData({...formData, minimum_stock: e.target.value})}/></div></div><div><Label>Fornecedor</Label><Input value={formData.supplier || ''} onChange={e => setFormData({...formData, supplier: e.target.value})}/></div>
      <DialogFooter><Button variant="outline" type="button" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
    </form></DialogContent></Dialog>
  );
}

function UserModal({ open, onClose, user, onSave }) {
  const [formData, setFormData] = useState({});
  React.useEffect(() => { if (user) setFormData(user); else setFormData({ full_name: '', email: '', role: 'user' }); }, [user, open]);
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };
  return (
    <Dialog open={open} onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>{user ? 'Editar' : 'Novo'} Usuário</DialogTitle><DialogDescription className="hidden">Form</DialogDescription></DialogHeader><form onSubmit={handleSubmit} className="space-y-4"><div><Label>Nome Completo</Label><Input value={formData.full_name || ''} onChange={e => setFormData({...formData, full_name: e.target.value})} required/></div><div><Label>Email</Label><Input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})}/></div><div><Label>Função</Label><Select value={formData.role} onValueChange={v => setFormData({...formData, role: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="user">Usuário Comum</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent></Select></div><DialogFooter><Button variant="outline" type="button" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter></form></DialogContent></Dialog>
  );
}