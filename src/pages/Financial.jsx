import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Trash2, DollarSign, TrendingDown, TrendingUp, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, endOfYear } from 'date-fns';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const EXPENSE_CATEGORIES = ['Aluguel', 'Energia', 'Água', 'Internet', 'Telefone', 'Materiais', 'Equipamentos', 'Marketing', 'Funcionários', 'Impostos', 'Outros'];

export default function Financial() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteExpense, setDeleteExpense] = useState(null);
  const [filterType, setFilterType] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const queryClient = useQueryClient();

  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*'); return data || []; } });
  const { data: installments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*'); return data || []; } });
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*'); return data || []; } });

  const saveMutation = useMutation({
    mutationFn: async (data) => { const { id, ...rest } = data; if (id) await supabase.from('expenses').update(rest).eq('id', id); else await supabase.from('expenses').insert([rest]); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setIsOpen(false); toast.success('Salvo!'); }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => await supabase.from('expenses').delete().eq('id', id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setDeleteExpense(null); toast.success('Excluído'); }
  });

  const toggleInstallment = async (inst) => { await supabase.from('installments').update({ paid: !inst.paid }).eq('id', inst.id); queryClient.invalidateQueries({ queryKey: ['installments'] }); };
  const toggleExpense = async (exp) => { await supabase.from('expenses').update({ is_paid: !exp.is_paid }).eq('id', exp.id); queryClient.invalidateQueries({ queryKey: ['expenses'] }); };

  const getDateRange = () => {
    if (filterType === 'month') return { start: startOfMonth(new Date(selectedYear, selectedMonth)), end: endOfMonth(new Date(selectedYear, selectedMonth)) };
    if (filterType === 'year') return { start: startOfYear(new Date(selectedYear, 0)), end: endOfYear(new Date(selectedYear, 0)) };
    if (filterType === 'custom' && startDate && endDate) return { start: parseISO(startDate), end: parseISO(endDate) };
    return { start: new Date(0), end: new Date() };
  };
  const { start, end } = getDateRange();

  const filteredExpenses = expenses.filter(e => isWithinInterval(new Date(e.due_date + 'T12:00:00'), { start, end }));
  const filteredInstallments = installments.filter(i => isWithinInterval(new Date(i.due_date + 'T12:00:00'), { start, end }));
  
  const revenueFromInstallments = filteredInstallments.filter(i => i.paid).reduce((sum, i) => sum + (i.value || 0), 0);
  const appointmentsWithInstallments = new Set(installments.map(i => i.appointment_id).filter(Boolean));
  
  const revenueFromSimpleAppointments = appointments
    .filter(a => isWithinInterval(new Date(a.date + 'T12:00:00'), { start, end }) && a.status === 'Realizado' && !appointmentsWithInstallments.has(a.id))
    .reduce((sum, a) => sum + (a.final_value || 0), 0);

  const totalRevenue = revenueFromInstallments + revenueFromSimpleAppointments;
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const profit = totalRevenue - totalExpenses;

  const getChartData = () => {
    const data = [];
    for (let i = 0; i < 12; i++) {
        const mStart = startOfMonth(new Date(selectedYear, i));
        const mEnd = endOfMonth(new Date(selectedYear, i));
        
        const mInst = installments.filter(inst => inst.paid && isWithinInterval(new Date(inst.due_date + 'T12:00:00'), { start: mStart, end: mEnd })).reduce((s, i) => s + i.value, 0);
        
        const mApts = appointments
            .filter(a => isWithinInterval(new Date(a.date + 'T12:00:00'), { start: mStart, end: mEnd }) && a.status === 'Realizado' && !appointmentsWithInstallments.has(a.id))
            .reduce((s, a) => s + (a.final_value || 0), 0);

        const exp = expenses.filter(e => isWithinInterval(new Date(e.due_date + 'T12:00:00'), { start: mStart, end: mEnd })).reduce((s, e) => s + (e.amount || 0), 0);
        data.push({ name: format(mStart, 'MMM'), faturamento: mInst + mApts, despesas: exp });
    }
    return data;
  };

  const changeMonth = (direction) => {
    if (direction === 'prev') {
        if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); }
        else setSelectedMonth(selectedMonth - 1);
    } else {
        if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); }
        else setSelectedMonth(selectedMonth + 1);
    }
  };

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" subtitle="Controle de faturamento e despesas" action={<Button onClick={() => { setEditingExpense(null); setIsOpen(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2" /> Nova Despesa</Button>} />
      
      <div className="flex flex-wrap gap-3 p-4 bg-white rounded-xl border border-stone-100 items-center">
        <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="w-32"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="month">Por Mês</SelectItem><SelectItem value="year">Por Ano</SelectItem></SelectContent></Select>
        
        {filterType === 'month' && (
            <div className="flex items-center gap-2 bg-stone-50 p-1 rounded-lg border border-stone-200">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth('prev')}><ChevronLeft className="w-4 h-4"/></Button>
                
                <Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-32 border-0 bg-transparent shadow-none focus:ring-0"><SelectValue/></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select>
                <div className="w-[1px] h-4 bg-stone-300 mx-1"></div>
                <Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-20 border-0 bg-transparent shadow-none focus:ring-0"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select>
                
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth('next')}><ChevronRight className="w-4 h-4"/></Button>
            </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Faturamento" value={`R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={DollarSign} />
        <StatCard title="Despesas" value={`R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={TrendingDown} />
        <StatCard title="Lucro" value={`R$ ${profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={DollarSign} className={profit >= 0 ? '' : 'border-rose-200'} />
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="bg-stone-100"><TabsTrigger value="overview">Visão Geral</TabsTrigger><TabsTrigger value="expenses">Despesas</TabsTrigger><TabsTrigger value="installments">Entradas (Parcelas/Pagamentos)</TabsTrigger></TabsList>
        <TabsContent value="overview" className="mt-6"><Card className="bg-white"><CardContent className="h-80 pt-6"><ResponsiveContainer width="100%" height="100%"><BarChart data={getChartData()}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/><Bar dataKey="faturamento" fill="#c4a47c" name="Faturamento"/><Bar dataKey="despesas" fill="#78716c" name="Despesas"/></BarChart></ResponsiveContainer></CardContent></Card></TabsContent>
        <TabsContent value="expenses" className="mt-6 space-y-3">{filteredExpenses.map(exp => (<Card key={exp.id} className="bg-white"><CardContent className="p-4 flex justify-between items-center"><div className="flex gap-3 items-center"><button onClick={() => toggleExpense(exp)}><CheckCircle2 className={`w-5 h-5 ${exp.is_paid ? 'text-green-500' : 'text-gray-300'}`}/></button><div><p className="font-medium">{exp.description}</p><p className="text-sm text-gray-500">{exp.category} • Vence {format(new Date(exp.due_date + 'T12:00:00'), 'dd/MM/yyyy')}</p></div></div><div className="flex gap-3 items-center"><span className="font-light text-lg">R$ {exp.amount}</span><Button variant="ghost" size="sm" onClick={() => { setEditingExpense(exp); setIsOpen(true); }}><Edit2 className="w-4 h-4"/></Button><Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteExpense(exp)}><Trash2 className="w-4 h-4"/></Button></div></CardContent></Card>))}</TabsContent>
        <TabsContent value="installments" className="mt-6 space-y-3">{filteredInstallments.map(inst => (<Card key={inst.id} className="bg-white"><CardContent className="p-4 flex justify-between items-center"><div className="flex gap-3 items-center"><button onClick={() => toggleInstallment(inst)}><CheckCircle2 className={`w-5 h-5 ${inst.paid ? 'text-green-500' : 'text-gray-300'}`}/></button><div><p className="font-medium">{inst.description}</p><p className="text-sm text-gray-500">Vence {format(new Date(inst.due_date + 'T12:00:00'), 'dd/MM/yyyy')} • {inst.payment_method}</p></div></div><span className="font-light text-lg">R$ {inst.value.toFixed(2)}</span></CardContent></Card>))}</TabsContent>
      </Tabs>
      <Dialog open={isOpen} onOpenChange={setIsOpen}><DialogContent><DialogHeader><DialogTitle>{editingExpense ? 'Editar' : 'Nova'} Despesa</DialogTitle></DialogHeader><form onSubmit={(e) => { e.preventDefault(); const formData = new FormData(e.target); saveMutation.mutate({ ...Object.fromEntries(formData), id: editingExpense?.id }); }} className="space-y-4"><div><Label>Descrição</Label><Input name="description" defaultValue={editingExpense?.description} required/></div><div className="grid grid-cols-2 gap-4"><div><Label>Categoria</Label><Select name="category" defaultValue={editingExpense?.category}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div><Label>Valor</Label><Input name="amount" type="number" step="0.01" defaultValue={editingExpense?.amount} required/></div></div><div><Label>Vencimento</Label><Input name="due_date" type="date" defaultValue={editingExpense?.due_date} required/></div><Button type="submit" className="w-full">Salvar</Button></form></DialogContent></Dialog>
      <AlertDialog open={!!deleteExpense} onOpenChange={() => setDeleteExpense(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deleteExpense.id)} className="bg-red-600">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}