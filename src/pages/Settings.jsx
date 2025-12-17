import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Trash2, Syringe, Package, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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

export default function Settings() {
  const [procedureModal, setProcedureModal] = useState(false);
  const [materialModal, setMaterialModal] = useState(false);
  const [userModal, setUserModal] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState(null);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteProcedure, setDeleteProcedure] = useState(null);
  const [deleteMaterial, setDeleteMaterial] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const queryClient = useQueryClient();

  // --- QUERIES ---
  const { data: procedures = [] } = useQuery({
    queryKey: ['procedures'],
    queryFn: async () => {
      const { data, error } = await supabase.from('procedures').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: materials = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      const { data, error } = await supabase.from('materials').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // Nota: Assume que existe uma tabela 'users' ou 'profiles' pública para gerenciar roles
      const { data, error } = await supabase.from('users').select('*').order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // --- MUTATIONS PROCEDURES ---
  const createProcedureMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('procedures').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedures'] });
      setProcedureModal(false);
      toast.success('Procedimento cadastrado');
    },
  });

  const updateProcedureMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('procedures').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedures'] });
      setEditingProcedure(null);
      toast.success('Procedimento atualizado');
    },
  });

  const deleteProcedureMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('procedures').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedures'] });
      setDeleteProcedure(null);
      toast.success('Procedimento excluído');
    },
  });

  // --- MUTATIONS MATERIALS ---
  const createMaterialMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('materials').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setMaterialModal(false);
      toast.success('Material cadastrado');
    },
  });

  const updateMaterialMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('materials').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setEditingMaterial(null);
      toast.success('Material atualizado');
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('materials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setDeleteMaterial(null);
      toast.success('Material excluído');
    },
  });

  // --- MUTATIONS USERS ---
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('users').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
      toast.success('Usuário atualizado');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteUser(null);
      toast.success('Usuário excluído');
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6 overflow-hidden">
      <PageHeader
        title="Cadastros"
        subtitle="Procedimentos e materiais"
      />

      <Tabs defaultValue="procedures">
        <TabsList className="bg-stone-100 w-full sm:w-auto">
          <TabsTrigger value="procedures" className="flex-1 sm:flex-none text-xs sm:text-sm">Procedimentos</TabsTrigger>
          <TabsTrigger value="materials" className="flex-1 sm:flex-none text-xs sm:text-sm">Materiais</TabsTrigger>
          <TabsTrigger value="users" className="flex-1 sm:flex-none text-xs sm:text-sm">Usuários</TabsTrigger>
        </TabsList>

        <TabsContent value="procedures" className="mt-3 sm:mt-6">
          <div className="flex justify-end mb-2 sm:mb-4">
            <Button onClick={() => setProcedureModal(true)} className="bg-stone-800 hover:bg-stone-900 h-8 text-xs sm:text-sm px-3">
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">Novo Procedimento</span>
            </Button>
          </div>
          <div className="grid gap-1.5 sm:gap-3">
            {procedures.map((proc) => (
              <Card key={proc.id} className="bg-white border-stone-100">
                <CardContent className="p-2.5 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
                      <div className="p-1.5 sm:p-2 bg-stone-100 rounded-lg flex-shrink-0">
                        <Syringe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-600" />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                       <h3 className="font-medium text-stone-800 text-xs sm:text-sm truncate">{proc.name}</h3>
                       <div className="flex items-center gap-2">
                         <p className="text-[10px] sm:text-xs text-stone-400">
                           {proc.has_variable_price ? 'Valor variável' : `R$ ${(proc.default_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
                         </p>
                         {proc.has_variable_price && (
                           <Badge variant="outline" className="text-[8px] sm:text-[10px] bg-amber-50 border-amber-200 text-amber-700 px-1 py-0">
                             Variável
                           </Badge>
                         )}
                       </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="outline" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => setEditingProcedure(proc)}>
                        <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => setDeleteProcedure(proc)}
                      >
                        <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {procedures.length === 0 && (
              <div className="text-center py-8 sm:py-12 text-stone-400 text-sm">
                Nenhum procedimento cadastrado
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="materials" className="mt-3 sm:mt-6">
          <div className="flex justify-end mb-2 sm:mb-4">
            <Button onClick={() => setMaterialModal(true)} className="bg-stone-800 hover:bg-stone-900 h-8 text-xs sm:text-sm px-3">
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">Novo Material</span>
            </Button>
          </div>
          <div className="grid gap-1.5 sm:gap-3">
            {materials.map((mat) => (
              <Card key={mat.id} className="bg-white border-stone-100">
                <CardContent className="p-2.5 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
                      <div className="p-1.5 sm:p-2 bg-stone-100 rounded-lg flex-shrink-0">
                        <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-600" />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <h3 className="font-medium text-stone-800 text-xs sm:text-sm truncate">{mat.name}</h3>
                        <p className="text-[10px] sm:text-xs text-stone-400">
                          {mat.stock_quantity || 0} {mat.unit || 'un'} • R$ {(mat.cost_per_unit || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="outline" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => setEditingMaterial(mat)}>
                        <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => setDeleteMaterial(mat)}
                      >
                        <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {materials.length === 0 && (
              <div className="text-center py-8 sm:py-12 text-stone-400 text-sm">
                Nenhum material cadastrado
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-3 sm:mt-6">
          <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg mb-3 sm:mb-4">
            <p className="text-xs sm:text-sm text-blue-800">
              <strong>Importante:</strong> Para adicionar novos usuários, convide-os através do painel do Supabase.
              Aqui você pode apenas editar o papel (admin/user) dos usuários já cadastrados.
            </p>
          </div>
          <div className="grid gap-1.5 sm:gap-3">
            {users.map((user) => (
              <Card key={user.id} className="bg-white border-stone-100">
                <CardContent className="p-2.5 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
                      <div className="p-1.5 sm:p-2 bg-stone-100 rounded-lg flex-shrink-0">
                        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-600" />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <h3 className="font-medium text-stone-800 text-xs sm:text-sm truncate">{user.full_name}</h3>
                        <p className="text-[10px] sm:text-xs text-stone-400 truncate">{user.email}</p>
                      </div>
                      <Badge className={user.role === 'admin' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-stone-100 text-stone-700 border-stone-200'}>
                        {user.role === 'admin' ? 'Admin' : 'Usuário'}
                      </Badge>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="outline" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => setEditingUser(user)}>
                        <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => setDeleteUser(user)}
                      >
                        <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {users.length === 0 && (
              <div className="text-center py-8 sm:py-12 text-stone-400 text-sm">
                Nenhum usuário encontrado
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Procedure Modal */}
      <ProcedureModal
        open={procedureModal || !!editingProcedure}
        onClose={() => {
          setProcedureModal(false);
          setEditingProcedure(null);
        }}
        procedure={editingProcedure}
        onSave={(data) => {
          if (editingProcedure) {
            updateProcedureMutation.mutate({ id: editingProcedure.id, data });
          } else {
            createProcedureMutation.mutate(data);
          }
        }}
        isLoading={createProcedureMutation.isPending || updateProcedureMutation.isPending}
      />

      {/* Material Modal */}
      <MaterialModal
        open={materialModal || !!editingMaterial}
        onClose={() => {
          setMaterialModal(false);
          setEditingMaterial(null);
        }}
        material={editingMaterial}
        onSave={(data) => {
          if (editingMaterial) {
            updateMaterialMutation.mutate({ id: editingMaterial.id, data });
          } else {
            createMaterialMutation.mutate(data);
          }
        }}
        isLoading={createMaterialMutation.isPending || updateMaterialMutation.isPending}
      />

      {/* Delete Procedure Confirmation */}
      <AlertDialog open={!!deleteProcedure} onOpenChange={() => setDeleteProcedure(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Procedimento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteProcedure?.name}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProcedureMutation.mutate(deleteProcedure.id)}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Material Confirmation */}
      <AlertDialog open={!!deleteMaterial} onOpenChange={() => setDeleteMaterial(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Material</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteMaterial?.name}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMaterialMutation.mutate(deleteMaterial.id)}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Modal */}
      <UserModal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        onSave={(data) => updateUserMutation.mutate({ id: editingUser.id, data })}
        isLoading={updateUserMutation.isPending}
      />

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteUser?.full_name}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserMutation.mutate(deleteUser.id)}
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

function ProcedureModal({ open, onClose, procedure, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    has_variable_price: false,
    default_price: '',
    duration_minutes: '',
  });

  React.useEffect(() => {
    if (procedure) {
      setFormData({
        name: procedure.name || '',
        description: procedure.description || '',
        has_variable_price: procedure.has_variable_price || false,
        default_price: procedure.default_price || '',
        duration_minutes: procedure.duration_minutes || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        has_variable_price: false,
        default_price: '',
        duration_minutes: '',
      });
    }
  }, [procedure, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      default_price: formData.has_variable_price ? 0 : (parseFloat(formData.default_price) || 0),
      duration_minutes: parseInt(formData.duration_minutes) || null,
      is_active: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{procedure ? 'Editar Procedimento' : 'Novo Procedimento'}</DialogTitle>
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
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex items-center space-x-2 p-3 bg-stone-50 rounded-lg">
            <Checkbox
              id="variable-price"
              checked={formData.has_variable_price}
              onCheckedChange={(checked) => setFormData({ ...formData, has_variable_price: checked })}
            />
            <label
              htmlFor="variable-price"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Este procedimento tem valor variável
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {!formData.has_variable_price && (
              <div>
                <Label>Preço Padrão *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.default_price}
                  onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
                  required={!formData.has_variable_price}
                />
              </div>
            )}
            <div className={formData.has_variable_price ? 'col-span-2' : ''}>
              <Label>Duração (minutos)</Label>
              <Input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-stone-800 hover:bg-stone-900">
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaterialModal({ open, onClose, material, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unit: '',
    cost_per_unit: '',
    stock_quantity: '',
  });

  React.useEffect(() => {
    if (material) {
      setFormData({
        name: material.name || '',
        description: material.description || '',
        unit: material.unit || '',
        cost_per_unit: material.cost_per_unit || '',
        stock_quantity: material.stock_quantity || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        unit: 'ml',
        cost_per_unit: '',
        stock_quantity: '',
      });
    }
  }, [material, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
      stock_quantity: parseFloat(formData.stock_quantity) || 0,
      is_active: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{material ? 'Editar Material' : 'Novo Material'}</DialogTitle>
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
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Unidade</Label>
              <Input
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="ml, un, etc"
              />
            </div>
            <div>
              <Label>Custo por Unidade *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.cost_per_unit}
                onChange={(e) => setFormData({ ...formData, cost_per_unit: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Estoque</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.stock_quantity}
                onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-stone-800 hover:bg-stone-900">
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserModal({ open, onClose, user, onSave, isLoading }) {
  const [role, setRole] = useState('user');

  React.useEffect(() => {
    if (user) {
      setRole(user.role || 'user');
    } else {
      setRole('user');
    }
  }, [user, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ role });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={user?.full_name || ''} disabled />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input value={user?.email || ''} disabled />
          </div>
          <div>
            <Label>Papel *</Label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  value="user"
                  checked={role === 'user'}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Usuário</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={role === 'admin'}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Administrador</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-stone-800 hover:bg-stone-900">
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}