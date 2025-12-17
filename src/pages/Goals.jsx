import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, Edit2, Trash2, Target, Check } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const GOAL_TYPES = ['Faturamento', 'Pacientes', 'Procedimentos', 'Outro'];

export default function Goals() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [deleteGoal, setDeleteGoal] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const queryClient = useQueryClient();

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('*');
      if (error) throw error;
      return data;
    },
  });

  // ITEM 7: Correção do salvamento
  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Remove campos nulos/indefinidos
      const cleanData = { ...data, current_value: 0 };
      const { error } = await supabase.from('goals').insert([cleanData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setIsOpen(false);
      toast.success('Meta criada');
    },
    onError: (e) => toast.error('Erro ao criar meta: ' + e.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('goals').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setEditingGoal(null);
      toast.success('Meta atualizada');
    },
    onError: (e) => toast.error('Erro ao atualizar: ' + e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setDeleteGoal(null);
      toast.success('Meta excluída');
    },
  });

  const filteredGoals = goals.filter(g => g.year === selectedYear);

  const calculateCurrentValue = (goal) => {
    const monthAppointments = appointments.filter(a => {
      const date = new Date(a.date);
      return date.getMonth() + 1 === goal.month && date.getFullYear() === goal.year && a.status === 'Realizado';
    });

    switch (goal.type) {
      case 'Faturamento':
        return monthAppointments.reduce((sum, a) => sum + (a.total_amount || 0), 0); // Ajustado para total_amount
      case 'Pacientes':
        return new Set(monthAppointments.map(a => a.patient_id)).size;
      case 'Procedimentos':
        return monthAppointments.reduce((sum, a) => sum + (a.procedures_json?.length || 0), 0); // Ajustado para procedures_json
      default:
        return goal.current_value || 0;
    }
  };

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);
  const typeColors = { 'Faturamento': 'bg-emerald-100 text-emerald-700', 'Pacientes': 'bg-blue-100 text-blue-700', 'Procedimentos': 'bg-purple-100 text-purple-700', 'Outro': 'bg-stone-100 text-stone-700' };

  const goalsByMonth = filteredGoals.reduce((acc, goal) => {
    const month = goal.month;
    if (!acc[month]) acc[month] = [];
    acc[month].push(goal);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader title="Metas" subtitle="Acompanhe suas metas" action={<div className="flex gap-2"><Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}><SelectTrigger className="w-24 bg-white text-sm"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => (<SelectItem key={y} value={y.toString()}>{y}</SelectItem>))}</SelectContent></Select><Button onClick={() => { setEditingGoal(null); setIsOpen(true); }} className="bg-stone-800 hover:bg-stone-900" size="sm"><Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Nova Meta</span></Button></div>} />
      
      <div className="space-y-4 sm:space-y-6">
        {months.map((monthName, monthIndex) => {
          const monthGoals = goalsByMonth[monthIndex + 1] || [];
          if (monthGoals.length === 0) return null;
          return (
            <div key={monthIndex}>
              <h3 className="text-xs sm:text-sm font-medium text-stone-500 uppercase tracking-wider mb-2 sm:mb-3">{monthName}</h3>
              <div className="grid gap-2 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {monthGoals.map((goal) => {
                  const currentValue = calculateCurrentValue(goal);
                  const progress = Math.min((currentValue / goal.target_value) * 100, 100);
                  const isCompleted = currentValue >= goal.target_value;
                  return (
                    <Card key={goal.id} className={`bg-white border-stone-100 ${isCompleted ? 'ring-2 ring-emerald-200' : ''}`}>
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-start justify-between mb-2 sm:mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 sm:p-2 rounded-lg ${isCompleted ? 'bg-emerald-100' : 'bg-stone-100'}`}>{isCompleted ? <Check className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" /> : <Target className="w-3 h-3 sm:w-4 sm:h-4 text-stone-600" />}</div>
                            <div className="min-w-0"><h4 className="font-medium text-stone-800 text-sm sm:text-base truncate">{goal.title}</h4><Badge className={`${typeColors[goal.type]} text-[10px] sm:text-xs`}>{goal.type}</Badge></div>
                          </div>
                          <div className="flex gap-0.5 sm:gap-1 flex-shrink-0"><Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => { setEditingGoal(goal); setIsOpen(true); }}><Edit2 className="w-3 h-3 sm:w-4 sm:h-4" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-rose-600 hover:text-rose-700" onClick={() => setDeleteGoal(goal)}><Trash2 className="w-3 h-3 sm:w-4 sm:h-4" /></Button></div>
                        </div>
                        {goal.description && <p className="text-xs sm:text-sm text-stone-500 mb-2 sm:mb-3 line-clamp-2">{goal.description}</p>}
                        <div className="space-y-1.5 sm:space-y-2">
                          <div className="flex justify-between text-xs sm:text-sm"><span className="text-stone-500">Progresso</span><span className={`font-medium ${isCompleted ? 'text-emerald-600' : 'text-stone-700'}`}>{progress.toFixed(0)}%</span></div>
                          <Progress value={progress} className="h-1.5 sm:h-2" />
                          <div className="flex justify-between text-[10px] sm:text-xs text-stone-400"><span>{goal.type === 'Faturamento' ? `R$ ${currentValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : currentValue}</span><span>Meta: {goal.type === 'Faturamento' ? `R$ ${goal.target_value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : goal.target_value}</span></div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filteredGoals.length === 0 && <div className="text-center py-16"><div className="p-4 bg-stone-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center"><Target className="w-8 h-8 text-stone-400" /></div><h3 className="text-lg font-medium text-stone-700 mb-2">Nenhuma meta definida</h3><p className="text-stone-500 mb-4">Crie metas para acompanhar seu progresso</p><Button onClick={() => setIsOpen(true)} className="bg-stone-800 hover:bg-stone-900"><Plus className="w-4 h-4 mr-2" />Criar Primeira Meta</Button></div>}
      </div>

      <GoalModal open={isOpen} onClose={() => { setIsOpen(false); setEditingGoal(null); }} goal={editingGoal} onSave={(data) => { if (editingGoal) updateMutation.mutate({ id: editingGoal.id, data }); else createMutation.mutate(data); }} isLoading={createMutation.isPending || updateMutation.isPending} />
      <AlertDialog open={!!deleteGoal} onOpenChange={() => setDeleteGoal(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir Meta</AlertDialogTitle><AlertDialogDescription>Tem certeza?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deleteGoal.id)} className="bg-rose-600 hover:bg-rose-700">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function GoalModal({ open, onClose, goal, onSave, isLoading }) {
  const [formData, setFormData] = useState({ title: '', description: '', type: 'Faturamento', target_value: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  React.useEffect(() => {
    if (goal) {
      setFormData({
        title: goal.title || '',
        description: goal.description || '',
        type: goal.type || 'Faturamento',
        target_value: goal.target_value || '',
        month: goal.month || new Date().getMonth() + 1,
        year: goal.year || new Date().getFullYear(),
      });
    } else {
      setFormData({ title: '', description: '', type: 'Faturamento', target_value: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    }
  }, [goal, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, target_value: parseFloat(formData.target_value) || 0, month: parseInt(formData.month), year: parseInt(formData.year) });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{goal ? 'Editar Meta' : 'Nova Meta'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Título *</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required /></div>
          <div><Label>Descrição</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Tipo</Label><Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{GOAL_TYPES.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>Valor Alvo *</Label><Input type="number" step="0.01" value={formData.target_value} onChange={(e) => setFormData({ ...formData, target_value: e.target.value })} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Mês</Label><Select value={formData.month.toString()} onValueChange={(v) => setFormData({ ...formData, month: parseInt(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{months.map((m, i) => (<SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>Ano</Label><Select value={formData.year.toString()} onValueChange={(v) => setFormData({ ...formData, year: parseInt(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{years.map(y => (<SelectItem key={y} value={y.toString()}>{y}</SelectItem>))}</SelectContent></Select></div>
          </div>
          <div className="flex justify-end gap-3 pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={isLoading} className="bg-stone-900 hover:bg-stone-900">{isLoading ? 'Salvando...' : 'Salvar'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}