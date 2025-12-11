import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, Search, Edit2, Trash2, Package, AlertTriangle, 
  ArrowUpCircle, ArrowDownCircle, History, TrendingDown,
  Box, Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

  const { data: materials = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      const { data, error } = await supabase.from('materials').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ['stock-movements'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_movements').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('materials').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setIsProductModalOpen(false);
      toast.success('Produto cadastrado');
    },
  });

  const updateMaterialMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('materials').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setEditingProduct(null);
      toast.success('Produto atualizado');
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('materials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setDeleteProduct(null);
      toast.success('Produto excluído');
    },
  });

  const createMovementMutation = useMutation({
    mutationFn: async (data) => {
      const material = materials.find(m => m.id === data.material_id);
      const previousStock = material?.stock_quantity || 0;
      let newStock = previousStock;
      
      if (data.type === 'entrada') {
        newStock = previousStock + data.quantity;
      } else if (data.type === 'saida') {
        newStock = previousStock - data.quantity;
      } else {
        newStock = data.quantity; // ajuste
      }

      const { error: moveError } = await supabase.from('stock_movements').insert([{
        ...data,
        material_name: material?.name,
        previous_stock: previousStock,
        new_stock: newStock,
        cost_per_unit: material?.cost_per_unit || 0,
        total_cost: (material?.cost_per_unit || 0) * data.quantity,
      }]);
      if (moveError) throw moveError;

      const { error: updateError } = await supabase.from('materials').update({
        stock_quantity: newStock,
      }).eq('id', data.material_id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      setIsMovementModalOpen(false);
      setSelectedMaterial(null);
      toast.success('Movimentação registrada');
    },
  });

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || m.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const lowStockMaterials = materials.filter(m => 
    m.minimum_stock && m.stock_quantity <= m.minimum_stock
  );

  const totalStockValue = materials.reduce((sum, m) => 
    sum + ((m.stock_quantity || 0) * (m.cost_per_unit || 0)), 0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Estoque"
        subtitle="Controle de materiais e medicamentos"
        action={
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsMovementModalOpen(true)}
              className="hidden sm:flex"
            >
              <History className="w-4 h-4 mr-2" />
              Nova Movimentação
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setIsMovementModalOpen(true)}
              className="sm:hidden"
            >
              <History className="w-4 h-4" />
            </Button>
            <Button onClick={() => setIsProductModalOpen(true)} className="bg-stone-800 hover:bg-stone-900" size="sm">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Novo Produto</span>
            </Button>
          </div>
        }
      />

      {lowStockMaterials.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-amber-800 flex items-center gap-2 text-sm sm:text-base">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
              Alertas de Reposição ({lowStockMaterials.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {lowStockMaterials.map(m => (
                <Badge key={m.id} variant="outline" className="bg-white border-amber-300 text-amber-800 text-[10px] sm:text-xs">
                  {m.name}: {m.stock_quantity} <span className="hidden sm:inline">{m.unit || 'un'} (mín: {m.minimum_stock})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-white border-stone-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-50 rounded-lg">
                <Box className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-stone-500 truncate">Total Produtos</p>
                <p className="text-lg sm:text-xl font-light text-stone-800">{materials.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-stone-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-amber-50 rounded-lg">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-stone-500 truncate">Estoque Baixo</p>
                <p className="text-lg sm:text-xl font-light text-amber-600">{lowStockMaterials.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-stone-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-emerald-50 rounded-lg">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-stone-500 truncate">Valor Estoque</p>
                <p className="text-sm sm:text-xl font-light text-stone-800">
                  R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-stone-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-50 rounded-lg">
                <History className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-stone-500 truncate">Movimentações</p>
                <p className="text-lg sm:text-xl font-light text-stone-800">{movements.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-stone-100">
          <TabsTrigger value="inventory">Inventário</TabsTrigger>
          <TabsTrigger value="movements">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input
                placeholder="Buscar produto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white text-sm"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-40 bg-white text-sm">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:gap-3">
            {filteredMaterials.map((material) => {
              const isLowStock = material.minimum_stock && material.stock_quantity <= material.minimum_stock;
              return (
                <Card key={material.id} className={`bg-white border-stone-100 ${isLowStock ? 'border-l-4 border-l-amber-400' : ''}`}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                          <h3 className="font-medium text-stone-800 text-sm sm:text-base truncate">{material.name}</h3>
                          {material.category && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs hidden sm:inline-flex">{material.category}</Badge>
                          )}
                          {isLowStock && (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px] sm:text-xs">
                              <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                              <span className="hidden sm:inline">Estoque Baixo</span>
                              <span className="sm:hidden">Baixo</span>
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-stone-500">
                          <span>
                            <span className="hidden sm:inline">Estoque: </span>
                            <strong className={isLowStock ? 'text-amber-600' : 'text-stone-700'}>{material.stock_quantity || 0}</strong> {material.unit || 'un'}
                          </span>
                          <span className="hidden sm:inline">Mín: {material.minimum_stock || 0} {material.unit || 'un'}</span>
                          <span>R$ {(material.cost_per_unit || 0).toFixed(2)}<span className="hidden sm:inline">/{material.unit || 'un'}</span></span>
                        </div>
                      </div>
                      <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 sm:h-9 sm:w-9 text-blue-600"
                          onClick={() => {
                            setSelectedMaterial(material);
                            setIsMovementModalOpen(true);
                          }}
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setEditingProduct(material)}>
                          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 sm:h-9 sm:w-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => setDeleteProduct(material)}
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {filteredMaterials.length === 0 && (
              <div className="text-center py-12 text-stone-400">
                Nenhum produto encontrado
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="movements" className="space-y-2 sm:space-y-4">
          <div className="grid gap-2 sm:gap-3">
            {movements.slice(0, 50).map((mov) => (
              <Card key={mov.id} className="bg-white border-stone-100">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start sm:items-center gap-2 sm:gap-4">
                    <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${
                      mov.type === 'entrada' ? 'bg-emerald-50' : 
                      mov.type === 'saida' ? 'bg-rose-50' : 'bg-blue-50'
                    }`}>
                      {mov.type === 'entrada' ? (
                        <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                      ) : mov.type === 'saida' ? (
                        <ArrowDownCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />
                      ) : (
                        <History className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                        <span className="font-medium text-stone-800 text-sm sm:text-base truncate">{mov.material_name}</span>
                        <Badge variant="outline" className={`text-[10px] sm:text-xs ${
                          mov.type === 'entrada' ? 'text-emerald-600 border-emerald-200' :
                          mov.type === 'saida' ? 'text-rose-600 border-rose-200' :
                          'text-blue-600 border-blue-200'
                        }`}>
                          {mov.type === 'entrada' ? '+' : mov.type === 'saida' ? '-' : '='}{mov.quantity}
                        </Badge>
                      </div>
                      <div className="text-xs sm:text-sm text-stone-500 truncate">
                        {format(new Date(mov.date), 'dd/MM/yyyy')}
                        {mov.patient_name && <span className="hidden sm:inline"> • Paciente: {mov.patient_name}</span>}
                        {mov.reason && <span className="hidden sm:inline"> • {mov.reason}</span>}
                      </div>
                      <div className="sm:hidden text-xs text-stone-400 mt-0.5 truncate">
                        {mov.patient_name && <span>{mov.patient_name}</span>}
                        {mov.reason && <span> • {mov.reason}</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs sm:text-sm flex-shrink-0">
                      <p className="text-stone-500">{mov.previous_stock} → {mov.new_stock}</p>
                      {mov.total_cost > 0 && (
                        <p className="text-stone-600 font-medium">R$ {mov.total_cost.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {movements.length === 0 && (
              <div className="text-center py-12 text-stone-400">
                Nenhuma movimentação registrada
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ProductModal
        open={isProductModalOpen || !!editingProduct}
        onClose={() => {
          setIsProductModalOpen(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        onSave={(data) => {
          if (editingProduct) {
            updateMaterialMutation.mutate({ id: editingProduct.id, data });
          } else {
            createMaterialMutation.mutate(data);
          }
        }}
        isLoading={createMaterialMutation.isPending || updateMaterialMutation.isPending}
      />

      <MovementModal
        open={isMovementModalOpen}
        onClose={() => {
          setIsMovementModalOpen(false);
          setSelectedMaterial(null);
        }}
        materials={materials}
        selectedMaterial={selectedMaterial}
        onSave={(data) => createMovementMutation.mutate(data)}
        isLoading={createMovementMutation.isPending}
      />

      <AlertDialog open={!!deleteProduct} onOpenChange={() => setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteProduct?.name}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMaterialMutation.mutate(deleteProduct.id)}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductModal({ open, onClose, product, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unit: '',
    cost_per_unit: '',
    stock_quantity: '',
    minimum_stock: '',
    category: '',
    supplier: '',
  });

  React.useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        description: product.description || '',
        unit: product.unit || '',
        cost_per_unit: product.cost_per_unit || '',
        stock_quantity: product.stock_quantity || '',
        minimum_stock: product.minimum_stock || '',
        category: product.category || '',
        supplier: product.supplier || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        unit: 'ml',
        cost_per_unit: '',
        stock_quantity: 0,
        minimum_stock: '',
        category: '',
        supplier: '',
      });
    }
  }, [product, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
      stock_quantity: parseFloat(formData.stock_quantity) || 0,
      minimum_stock: parseFloat(formData.minimum_stock) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          <DialogDescription>
            Insira as informações do produto ou material abaixo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="un">unidade</SelectItem>
                  <SelectItem value="g">grama</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="cx">caixa</SelectItem>
                  <SelectItem value="amp">ampola</SelectItem>
                  <SelectItem value="fr">frasco</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Custo/Unidade *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.cost_per_unit}
                onChange={(e) => setFormData({ ...formData, cost_per_unit: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Estoque Atual</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.stock_quantity}
                onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
              />
            </div>
            <div>
              <Label>Estoque Mínimo</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.minimum_stock}
                onChange={(e) => setFormData({ ...formData, minimum_stock: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input
              value={formData.supplier}
              onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
            />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isLoading} className="bg-stone-800 hover:bg-stone-900">
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MovementModal({ open, onClose, materials, selectedMaterial, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    material_id: '',
    type: 'entrada',
    quantity: '',
    reason: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  React.useEffect(() => {
    if (selectedMaterial) {
      setFormData(prev => ({ ...prev, material_id: selectedMaterial.id }));
    } else {
      setFormData({
        material_id: '',
        type: 'entrada',
        quantity: '',
        reason: '',
        date: format(new Date(), 'yyyy-MM-dd'),
      });
    }
  }, [selectedMaterial, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      quantity: parseFloat(formData.quantity) || 0,
    });
  };

  const selected = materials.find(m => m.id === formData.material_id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Movimentação de Estoque</DialogTitle>
          <DialogDescription>
            Registre entradas ou saídas manuais do estoque.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Produto *</Label>
            <Select value={formData.material_id} onValueChange={(v) => setFormData({ ...formData, material_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o produto" />
              </SelectTrigger>
              <SelectContent>
                {materials.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} (Estoque: {m.stock_quantity || 0} {m.unit || 'un'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo *</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="ajuste">Ajuste (define valor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade *</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label>Data</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Ex: Compra, Perda, Ajuste de inventário..."
            />
          </div>
          {selected && formData.quantity && (
            <div className="p-3 bg-stone-50 rounded-lg text-sm">
              <p className="text-stone-600">
                Estoque atual: <strong>{selected.stock_quantity || 0}</strong> {selected.unit || 'un'}
              </p>
              <p className="text-stone-600">
                Novo estoque: <strong className={
                  formData.type === 'entrada' ? 'text-emerald-600' :
                  formData.type === 'saida' ? 'text-rose-600' : 'text-blue-600'
                }>
                  {formData.type === 'entrada' 
                    ? (selected.stock_quantity || 0) + parseFloat(formData.quantity || 0)
                    : formData.type === 'saida'
                    ? (selected.stock_quantity || 0) - parseFloat(formData.quantity || 0)
                    : parseFloat(formData.quantity || 0)
                  }
                </strong> {selected.unit || 'un'}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isLoading} className="bg-stone-800 hover:bg-stone-900">
              {isLoading ? 'Salvando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}