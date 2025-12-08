import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Edit2, Trash2, Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle, History, Box, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const CATEGORIES = ['Medicamento', 'Insumo', 'Equipamento', 'Descartável', 'Cosmético', 'Outro'];

export default function Stock() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const queryClient = useQueryClient();

  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: async () => { const { data } = await supabase.from('materials').select('*').order('name'); return data || []; } });
  const { data: movements = [] } = useQuery({ queryKey: ['stock_movements'], queryFn: async () => { const { data } = await supabase.from('stock_movements').select('*').order('created_at', { ascending: false }); return data || []; } });

  const saveMaterialMutation = useMutation({
    mutationFn: async (data) => { const { id, ...rest } = data; if (id) await supabase.from('materials').update(rest).eq('id', id); else await supabase.from('materials').insert([rest]); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['materials'] }); setIsProductModalOpen(false); setEditingProduct(null); toast.success('Salvo!'); }
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (id) => await supabase.from('materials').delete().eq('id', id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['materials'] }); setDeleteProduct(null); toast.success('Excluído'); }
  });

  const createMovementMutation = useMutation({
    mutationFn: async (data) => {
      const material = materials.find(m => m.id === data.material_id);
      let newStock = material?.stock_quantity || 0;
      const qty = parseFloat(data.quantity);
      if (data.type === 'entrada') newStock += qty; else if (data.type === 'saida') newStock -= qty; else newStock = qty;
      await supabase.from('stock_movements').insert([{ ...data, material_name: material?.name, previous_stock: material?.stock_quantity, new_stock: newStock, date: new Date() }]);
      await supabase.from('materials').update({ stock_quantity: newStock }).eq('id', data.material_id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['materials'] }); queryClient.invalidateQueries({ queryKey: ['stock_movements'] }); setIsMovementModalOpen(false); setSelectedMaterial(null); toast.success('Registrado!'); }
  });

  const filteredMaterials = materials.filter(m => (m.name?.toLowerCase().includes(searchTerm.toLowerCase())) && (categoryFilter === 'all' || m.category === categoryFilter));
  const lowStock = materials.filter(m => m.minimum_stock && m.stock_quantity <= m.minimum_stock);
  const totalValue = materials.reduce((sum, m) => sum + ((m.stock_quantity || 0) * (m.cost_per_unit || 0)), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Gestão de Estoque" subtitle="Controle de materiais" action={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setIsMovementModalOpen(true)}><History className="w-4 h-4 mr-2"/> Movimentação</Button><Button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2"/> Novo Produto</Button></div>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Card className="bg-white border-stone-100"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 bg-blue-50 rounded"><Box className="w-5 h-5 text-blue-600"/></div><div><p className="text-xs text-gray-500">Total Produtos</p><p className="text-xl font-light">{materials.length}</p></div></CardContent></Card><Card className="bg-white border-stone-100"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 bg-amber-50 rounded"><AlertTriangle className="w-5 h-5 text-amber-600"/></div><div><p className="text-xs text-gray-500">Estoque Baixo</p><p className="text-xl font-light text-amber-600">{lowStock.length}</p></div></CardContent></Card><Card className="bg-white border-stone-100"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 bg-emerald-50 rounded"><Package className="w-5 h-5 text-emerald-600"/></div><div><p className="text-xs text-gray-500">Valor Total</p><p className="text-xl font-light">R$ {totalValue.toLocaleString('pt-BR', {minimumFractionDigits: 0})}</p></div></CardContent></Card><Card className="bg-white border-stone-100"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 bg-purple-50 rounded"><History className="w-5 h-5 text-purple-600"/></div><div><p className="text-xs text-gray-500">Movimentações</p><p className="text-xl font-light">{movements.length}</p></div></CardContent></Card></div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-stone-100"><TabsTrigger value="inventory">Inventário</TabsTrigger><TabsTrigger value="movements">Movimentações</TabsTrigger></TabsList>
        <TabsContent value="inventory" className="space-y-4 mt-4">
          <div className="flex gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"/><Input placeholder="Buscar..." className="pl-10 bg-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></div><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-40 bg-white"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-3">{filteredMaterials.map(m => (<Card key={m.id} className={`bg-white border-stone-100 ${m.stock_quantity <= m.minimum_stock ? 'border-l-4 border-l-amber-400' : ''}`}><CardContent className="p-4 flex justify-between items-center"><div><h3 className="font-medium text-stone-800">{m.name}</h3><div className="flex gap-2 text-sm text-gray-500"><Badge variant="outline">{m.category}</Badge><span>Estoque: <strong>{m.stock_quantity}</strong> {m.unit}</span></div></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => { setSelectedMaterial(m); setIsMovementModalOpen(true); }}><ArrowUpCircle className="w-4 h-4 text-blue-600"/></Button><Button variant="outline" size="icon" onClick={() => { setEditingProduct(m); setIsProductModalOpen(true); }}><Edit2 className="w-4 h-4"/></Button><Button variant="outline" size="icon" className="text-red-500" onClick={() => setDeleteProduct(m)}><Trash2 className="w-4 h-4"/></Button></div></CardContent></Card>))}</div>
        </TabsContent>
        <TabsContent value="movements" className="mt-4"><div className="space-y-2">{movements.map(m => (<Card key={m.id} className="bg-white"><CardContent className="p-3 flex justify-between items-center"><div><p className="font-medium">{m.material_name}</p><p className="text-xs text-gray-500">{format(new Date(m.created_at || m.date), 'dd/MM/yyyy')} - {m.reason}</p></div><Badge variant="outline" className={m.type === 'entrada' ? 'text-green-600' : 'text-red-600'}>{m.type === 'entrada' ? '+' : '-'}{m.quantity}</Badge></CardContent></Card>))}</div></TabsContent>
      </Tabs>
      <ProductModal open={isProductModalOpen || !!editingProduct} onClose={() => { setIsProductModalOpen(false); setEditingProduct(null); }} product={editingProduct} onSave={(data) => saveMaterialMutation.mutate({ ...data, id: editingProduct?.id })}/>
      <MovementModal open={isMovementModalOpen} onClose={() => setIsMovementModalOpen(false)} materials={materials} selectedMaterial={selectedMaterial} onSave={(data) => createMovementMutation.mutate(data)}/>
      <AlertDialog open={!!deleteProduct} onOpenChange={() => setDeleteProduct(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMaterialMutation.mutate(deleteProduct.id)} className="bg-red-600">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function ProductModal({ open, onClose, product, onSave }) {
  const [formData, setFormData] = useState({});
  React.useEffect(() => { if (product) setFormData(product); else setFormData({ name: '', description: '', unit: 'un', cost_per_unit: '', stock_quantity: 0, minimum_stock: 5, category: '', supplier: '' }); }, [product, open]);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent><DialogHeader><DialogTitle>{product ? 'Editar' : 'Novo'} Produto</DialogTitle><DialogDescription className="hidden">Dados do produto</DialogDescription></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); onSave({...formData, cost_per_unit: parseFloat(formData.cost_per_unit), stock_quantity: parseFloat(formData.stock_quantity)}); }} className="space-y-4">
          <div><Label>Nome</Label><Input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} required/></div>
          <div className="grid grid-cols-2 gap-4"><div><Label>Categoria</Label><Select value={formData.category} onValueChange={v => setFormData({...formData, category: v})}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div><Label>Unidade</Label><Input value={formData.unit || ''} onChange={e => setFormData({...formData, unit: e.target.value})}/></div></div>
          <div className="grid grid-cols-3 gap-4"><div><Label>Custo</Label><Input type="number" step="0.01" value={formData.cost_per_unit || ''} onChange={e => setFormData({...formData, cost_per_unit: e.target.value})} required/></div><div><Label>Estoque</Label><Input type="number" value={formData.stock_quantity || ''} onChange={e => setFormData({...formData, stock_quantity: e.target.value})}/></div><div><Label>Mínimo</Label><Input type="number" value={formData.minimum_stock || ''} onChange={e => setFormData({...formData, minimum_stock: e.target.value})}/></div></div><div><Label>Fornecedor</Label><Input value={formData.supplier || ''} onChange={e => setFormData({...formData, supplier: e.target.value})}/></div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
      </form>
      </DialogContent>
    </Dialog>
  );
}

function MovementModal({ open, onClose, materials, selectedMaterial, onSave }) {
  const [formData, setFormData] = useState({ material_id: '', type: 'entrada', quantity: '', reason: '', date: format(new Date(), 'yyyy-MM-dd') });
  React.useEffect(() => { if (selectedMaterial) setFormData(prev => ({ ...prev, material_id: selectedMaterial.id })); }, [selectedMaterial, open]);
  const selected = materials.find(m => m.id === formData.material_id);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent><DialogHeader><DialogTitle>Movimentação</DialogTitle><DialogDescription className="hidden">Registrar entrada/saída</DialogDescription></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); onSave({...formData, quantity: parseFloat(formData.quantity)}); }} className="space-y-4">
          <div><Label>Produto</Label><Select value={formData.material_id?.toString()} onValueChange={v => setFormData({...formData, material_id: parseInt(v)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-4"><div><Label>Tipo</Label><Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="entrada">Entrada</SelectItem><SelectItem value="saida">Saída</SelectItem><SelectItem value="ajuste">Ajuste</SelectItem></SelectContent></Select></div><div><Label>Qtd</Label><Input type="number" step="0.1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} required/></div></div><div><Label>Motivo</Label><Input value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})}/></div>{selected && <div className="p-3 bg-stone-50 rounded text-sm"><p>Atual: {selected.stock_quantity}</p></div>}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Registrar</Button>
          </DialogFooter>
      </form>
      </DialogContent>
    </Dialog>
  );
}