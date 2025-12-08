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

  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: async () => { const { data } = await supabase.from('goals').select('*'); return data || []; } });
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*'); return data || []; } });

  const saveMutation = useMutation({
    mutationFn: async (data) => { const { id, ...rest } = data; if (id) await supabase.from('goals').update(rest).eq('id', id); else await supabase.from('goals').insert([rest]); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goals'] }); setIsOpen(false); setEditingGoal(null); toast.success('Salvo!'); }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => await supabase.from('goals').delete().eq('id', id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goals'] }); setDeleteGoal(null); toast.success('Excluído'); }
  });

  const calculateCurrentValue = (goal) => {
    const monthApps = appointments.filter(a => { const d = new Date(a.date); return d.getMonth() + 1 === goal.month && d.getFullYear() === goal.year && a.status === 'Realizado'; });
    if (goal.type === 'Faturamento') return monthApps.reduce((s, a) => s + (a.final_value || 0), 0);
    if (goal.type === 'Pacientes') return new Set(monthApps.map(a => a.patient_id)).size;
    return goal.current_amount || 0;
  };

  const filteredGoals = goals.filter(g => g.year === selectedYear);
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  return (
    <div className="space-y-6">
      <PageHeader title="Metas" subtitle="Acompanhe seus objetivos" action={<div className="flex gap-2"><Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-24 bg-white"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:10},(_,i)=>new Date().getFullYear()-5+i).map(y=><SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select><Button onClick={() => { setEditingGoal(null); setIsOpen(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2"/> Nova Meta</Button></div>} />
      <div className="space-y-6">{months.map((monthName, i) => {
          const monthGoals = filteredGoals.filter(g => g.month === i + 1);
          if (monthGoals.length === 0) return null;
          return (<div key={i}><h3 className="text-sm font-medium text-stone-500 uppercase mb-3">{monthName}</h3><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{monthGoals.map(goal => {
              const current = calculateCurrentValue(goal);
              const progress = Math.min((current / goal.target_value) * 100, 100);
              const isCompleted = current >= goal.target_value;
              return (<Card key={goal.id} className="bg-white"><CardContent className="p-4"><div className="flex justify-between mb-3"><div className="flex gap-3 items-center"><div className={`p-2 rounded ${isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-600'}`}>{isCompleted ? <Check size={16}/> : <Target size={16}/>}</div><div><h4 className="font-bold text-sm">{goal.title}</h4><Badge variant="outline">{goal.type}</Badge></div></div><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditingGoal(goal); setIsOpen(true); }}><Edit2 size={16}/></Button><Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteGoal(goal)}><Trash2 size={16}/></Button></div></div><div className="space-y-2"><div className="flex justify-between text-xs text-stone-500"><span>Progresso</span><span>{progress.toFixed(0)}%</span></div><Progress value={progress} className="h-2"/><div className="flex justify-between text-xs text-stone-400"><span>Atual: {current}</span><span>Meta: {goal.target_value}</span></div></div></CardContent></Card>);
          })}</div></div>);
      })}</div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}><DialogContent><DialogHeader><DialogTitle>{editingGoal ? 'Editar' : 'Novo'}</DialogTitle></DialogHeader><form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target); saveMutation.mutate({ ...Object.fromEntries(fd), id: editingGoal?.id, month: parseInt(fd.get('month')), year: parseInt(fd.get('year')), target_value: parseFloat(fd.get('target_value')) }); }} className="space-y-4"><div><Label>Título</Label><Input name="title" defaultValue={editingGoal?.title} required/></div><div className="grid grid-cols-2 gap-4"><div><Label>Tipo</Label><Select name="type" defaultValue={editingGoal?.type || 'Faturamento'}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{GOAL_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div><Label>Alvo</Label><Input name="target_value" type="number" defaultValue={editingGoal?.target_value} required/></div></div><div className="grid grid-cols-2 gap-4"><div><Label>Mês</Label><Select name="month" defaultValue={editingGoal?.month?.toString()}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{months.map((m,i)=><SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>)}</SelectContent></Select></div><div><Label>Ano</Label><Select name="year" defaultValue={editingGoal?.year?.toString()}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:10},(_,i)=>new Date().getFullYear()-5+i).map(y=><SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div></div><Button type="submit" className="w-full">Salvar</Button></form></DialogContent></Dialog>
      <AlertDialog open={!!deleteGoal} onOpenChange={() => setDeleteGoal(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deleteGoal.id)} className="bg-red-600">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}