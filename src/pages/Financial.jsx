import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, Edit2, Trash2, DollarSign, TrendingUp, TrendingDown, 
  CheckCircle2, CreditCard, ChevronLeft, ChevronRight,
  PieChart as PieIcon
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const EXPENSE_CATEGORIES = ['Aluguel', 'Energia', 'Água', 'Internet', 'Telefone', 'Materiais', 'Equipamentos', 'Marketing', 'Funcionários', 'Impostos', 'Outros'];
const COLORS = ['#c4a47c', '#78716c', '#d6d3d1', '#a8a29e', '#57534e', '#44403c'];

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

  const urlParams = new URLSearchParams(window.location.search);
  const defaultTab = urlParams.get('tab') || 'overview';

  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*'); return data; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*').order('due_date', { ascending: false }); return data; } });
  const { data: installments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*').order('due_date', { ascending: false }); return data; } });

  const createMutation = useMutation({ mutationFn: async (data) => { await supabase.from('expenses').insert([data]); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setIsOpen(false); toast.success('Despesa cadastrada'); } });
  const updateMutation = useMutation({ mutationFn: async ({ id, data }) => { await supabase.from('expenses').update(data).eq('id', id); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setEditingExpense(null); toast.success('Despesa atualizada'); } });
  const deleteMutation = useMutation({ mutationFn: async (id) => { await supabase.from('expenses').delete().eq('id', id); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setDeleteExpense(null); toast.success('Despesa excluída'); } });
  const updateInstallmentMutation = useMutation({ mutationFn: async ({ id, data }) => { await supabase.from('installments').update(data).eq('id', id); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['installments'] }); toast.success('Parcela atualizada'); } });

  const togglePaid = (expense) => { updateMutation.mutate({ id: expense.id, data: { ...expense, is_paid: !expense.is_paid, payment_date: !expense.is_paid ? format(new Date(), 'yyyy-MM-dd') : null } }); };
  const toggleInstallmentReceived = (installment) => { updateInstallmentMutation.mutate({ id: installment.id, data: { ...installment, is_received: !installment.is_received, received_date: !installment.is_received ? format(new Date(), 'yyyy-MM-dd') : null } }); };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else { setSelectedMonth(selectedMonth - 1); }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else { setSelectedMonth(selectedMonth + 1); }
  };

  const getDateRange = () => {
    if (filterType === 'month') return { start: startOfMonth(new Date(selectedYear, selectedMonth)), end: endOfMonth(new Date(selectedYear, selectedMonth)) };
    if (filterType === 'year') return { start: startOfYear(new Date(selectedYear, 0)), end: endOfYear(new Date(selectedYear, 0)) };
    if (filterType === 'custom' && startDate && endDate) return { start: parseISO(startDate), end: parseISO(endDate) };
    return { start: new Date(0), end: new Date() };
  };
  const { start, end } = getDateRange();

  const filteredAppointments = appointments.filter(a => {
    if(!a.date) return false;
    const date = new Date(a.date);
    return isWithinInterval(date, { start, end }) && a.status === 'Realizado';
  });

  const filteredExpenses = expenses.filter(e => { if(!e.due_date) return false; return isWithinInterval(new Date(e.due_date), { start, end }); });
  const filteredInstallments = installments.filter(i => { if(!i.due_date) return false; return isWithinInterval(new Date(i.due_date), { start, end }); });

  const revenueFromCash = filteredAppointments.reduce((sum, appt) => {
      const methods = appt.payment_methods_json || [];
      const cashPart = methods
        .filter(m => !m.method || !m.method.includes('Crédito'))
        .reduce((s, m) => s + (Number(m.value) || 0), 0);
      return sum + cashPart;
  }, 0);

  const revenueFromInstallments = filteredInstallments.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
  const totalRevenue = revenueFromCash + revenueFromInstallments;
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalMaterialCost = filteredAppointments.reduce((sum, a) => sum + (Number(a.cost_amount) || 0), 0);
  const profit = totalRevenue - totalExpenses - totalMaterialCost;
  const pendingInstallmentsValue = filteredInstallments.filter(i => !i.is_received).reduce((sum, i) => sum + (Number(i.value) || 0), 0);

  const pieChartData = [
    { name: 'Receita (Real)', value: totalRevenue },
    { name: 'Despesas Fixas', value: totalExpenses },
    { name: 'Custos Variáveis', value: totalMaterialCost }
  ].filter(item => item.value > 0);

  // --- NOVA LÓGICA PARA O RELATÓRIO DE PAGAMENTOS ---
  const paymentStats = useMemo(() => {
    const stats = {};
    
    filteredAppointments.forEach(app => {
        const methods = app.payment_methods_json || [];
        methods.forEach(m => {
            const name = m.method || 'Outro';
            if(!stats[name]) stats[name] = { count: 0, total: 0, installmentsCount: 0, creditCount: 0 };
            
            stats[name].count += 1;
            stats[name].total += Number(m.value) || 0;
            
            if(name.includes('Crédito')) {
                stats[name].creditCount += 1;
                stats[name].installmentsCount += Number(m.installments) || 1;
            }
        });
    });

    return Object.entries(stats).map(([name, data]) => ({
        name,
        count: data.count,
        total: data.total,
        avgInstallments: data.creditCount > 0 ? (data.installmentsCount / data.creditCount).toFixed(1) : '-'
    })).sort((a,b) => b.total - a.total);
  }, [filteredAppointments]);

  const paymentPieData = paymentStats.map(stat => ({ name: stat.name, value: stat.total }));

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = [2024, 2025, 2026];

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" subtitle="Fluxo de caixa" action={<Button onClick={() => setIsOpen(true)} className="bg-stone-900"><Plus className="w-4 h-4 mr-2"/> Nova Despesa</Button>}/>
      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-xl border border-stone-200 shadow-sm items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-32"><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="month">Mês</SelectItem><SelectItem value="year">Ano</SelectItem></SelectContent>
            </Select>
        </div>

        {filterType === 'month' && (
            <div className="flex items-center gap-2 bg-stone-50 p-1 rounded-lg border border-stone-200">
                <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8 hover:bg-white"><ChevronLeft className="w-4 h-4"/></Button>
                <div className="flex gap-2">
                    <Select value={selectedMonth.toString()} onValueChange={v=>setSelectedMonth(parseInt(v))}>
                        <SelectTrigger className="w-32 h-8 border-none bg-transparent shadow-none focus:ring-0 font-medium"><SelectValue/></SelectTrigger>
                        <SelectContent>{months.map((m,i)=><SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={selectedYear.toString()} onValueChange={v=>setSelectedYear(parseInt(v))}>
                        <SelectTrigger className="w-20 h-8 border-none bg-transparent shadow-none focus:ring-0 font-medium"><SelectValue/></SelectTrigger>
                        <SelectContent>{years.map(y=><SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8 hover:bg-white"><ChevronRight className="w-4 h-4"/></Button>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Entradas (Caixa)" value={<span className="text-xl sm:text-2xl font-bold">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={DollarSign} />
        <StatCard title="A Receber (Mês)" value={<span className="text-xl sm:text-2xl font-bold">R$ {pendingInstallmentsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={CreditCard} />
        <StatCard title="Despesas" value={<span className="text-xl sm:text-2xl font-bold">R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingDown} />
        <StatCard title="Custo Mat." value={<span className="text-xl sm:text-2xl font-bold">R$ {totalMaterialCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingDown} />
        <StatCard title="Líquido Mensal" value={<span className="text-xl sm:text-2xl font-bold">R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingUp} className={profit>=0?'bg-emerald-50 border-emerald-100':'bg-rose-50 border-rose-100'} />
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="bg-stone-100 w-full sm:w-auto grid grid-cols-4 sm:flex">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="installments">Parcelas (Crédito)</TabsTrigger>
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
            <TabsTrigger value="payments">Relatório Pagamentos</TabsTrigger> {/* NOVA ABA */}
        </TabsList>
        
        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Entradas x Saídas (Período)</CardTitle></CardHeader>
            <CardContent className="h-80">
              {pieChartData.length > 0 ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                      {pieChartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-full text-stone-400">Sem dados neste período</div>}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="installments" className="mt-6 space-y-4">
            {filteredInstallments.length > 0 ? filteredInstallments.map(i=>(
                <Card key={i.id}><CardContent className="p-4 flex justify-between items-center"><div className="flex gap-4 items-center"><button onClick={()=>toggleInstallmentReceived(i)} className="transition-transform active:scale-95"><CheckCircle2 className={`w-6 h-6 ${i.is_received?'text-emerald-600 fill-emerald-50':'text-stone-300'}`}/></button><div><h3 className="font-bold text-stone-800">{i.patient_name}</h3><div className="flex items-center gap-2 text-xs text-stone-500"><span className="bg-stone-100 px-2 py-0.5 rounded">Parc. {i.installment_number}/{i.total_installments}</span><span>Venc: {format(new Date(i.due_date),'dd/MM/yyyy')}</span></div></div></div><span className="font-bold text-stone-700">R$ {Number(i.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></CardContent></Card>
            )) : <div className="text-center py-10 text-stone-400">Nenhuma parcela para este mês.</div>}
        </TabsContent>
        
        <TabsContent value="expenses" className="mt-6 space-y-4">
            {filteredExpenses.length > 0 ? filteredExpenses.map(e=>(
                <ExpenseCard key={e.id} expense={e} onEdit={()=>setEditingExpense(e)} onDelete={()=>setDeleteExpense(e)} onTogglePaid={()=>togglePaid(e)}/>
            )) : <div className="text-center py-10 text-stone-400">Nenhuma despesa neste mês.</div>}
        </TabsContent>

        {/* NOVA ABA: RELATÓRIO DE PAGAMENTOS */}
        <TabsContent value="payments" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Distribuição por Método</CardTitle></CardHeader>
                    <CardContent className="h-64">
                        {paymentPieData.length > 0 ? (
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={paymentPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                                        {paymentPieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <div className="flex items-center justify-center h-full text-stone-400">Sem dados</div>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Detalhamento</CardTitle></CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-stone-500 uppercase bg-stone-50">
                                    <tr>
                                        <th className="px-4 py-2">Método</th>
                                        <th className="px-4 py-2 text-center">Qtd</th>
                                        <th className="px-4 py-2 text-right">Total</th>
                                        <th className="px-4 py-2 text-right">Méd. Parcelas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paymentStats.map((stat, index) => (
                                        <tr key={index} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                                            <td className="px-4 py-3 font-medium">{stat.name}</td>
                                            <td className="px-4 py-3 text-center">{stat.count}</td>
                                            <td className="px-4 py-3 text-right">R$ {stat.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-4 py-3 text-right text-stone-500">{stat.avgInstallments}</td>
                                        </tr>
                                    ))}
                                    {paymentStats.length === 0 && <tr><td colSpan="4" className="text-center py-4 text-stone-400">Nenhum pagamento registrado.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
      </Tabs>

      <ExpenseModal open={isOpen||!!editingExpense} onClose={()=>{setIsOpen(false);setEditingExpense(null)}} expense={editingExpense} onSave={d=>{editingExpense?updateMutation.mutate({id:editingExpense.id,data:d}):createMutation.mutate(d)}}/>
      <AlertDialog open={!!deleteExpense} onOpenChange={()=>setDeleteExpense(null)}><AlertDialogContent><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogFooter><AlertDialogCancel>Não</AlertDialogCancel><AlertDialogAction onClick={()=>deleteMutation.mutate(deleteExpense.id)}>Sim</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function ExpenseCard({ expense, onEdit, onDelete, onTogglePaid }) { return (<Card><CardContent className="p-4 flex justify-between items-center"><div className="flex gap-4"><button onClick={onTogglePaid}><CheckCircle2 className={expense.is_paid?'text-green-600':'text-gray-300'}/></button><div><h3>{expense.description}</h3><Badge variant="outline">{expense.category}</Badge></div></div><div className="flex gap-4"><span>R$ {Number(expense.amount).toFixed(2)}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={onEdit}><Edit2 className="w-4 h-4"/></Button><Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button></div></div></CardContent></Card>); }
function ExpenseModal({ open, onClose, expense, onSave }) { const [form,setForm]=useState({description:'',category:'',amount:'',due_date:format(new Date(),'yyyy-MM-dd'),is_paid:false}); React.useEffect(()=>{if(expense)setForm(expense);else setForm({description:'',category:'',amount:'',due_date:format(new Date(),'yyyy-MM-dd'),is_paid:false})},[expense,open]); return (<Dialog open={open} onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>Despesa</DialogTitle></DialogHeader><form onSubmit={e=>{e.preventDefault();onSave(form)}} className="space-y-4"><Input placeholder="Descrição" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><div className="grid grid-cols-2 gap-4"><Select value={form.category} onValueChange={v=>setForm({...form,category:v})}><SelectTrigger><SelectValue placeholder="Categoria"/></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Input type="number" placeholder="Valor" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div><Input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/><div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" className="bg-stone-900">Salvar</Button></div></form></DialogContent></Dialog>); }