import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, Edit2, Trash2, DollarSign, TrendingUp, TrendingDown, 
  CheckCircle2, CreditCard, ChevronLeft, ChevronRight, Filter, Calendar as CalendarIcon, ArrowDownCircle, ArrowUpCircle 
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const EXPENSE_CATEGORIES = ['Aluguel', 'Energia', 'Água', 'Internet', 'Telefone', 'Materiais', 'Equipamentos', 'Marketing', 'Funcionários', 'Impostos', 'Outros'];
const CREDIT_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];
const COLORS = ['#c4a47c', '#78716c', '#d6d3d1', '#a8a29e', '#57534e', '#44403c']; 
const EXPENSE_COLORS = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#7f1d1d']; 

export default function Financial() {
  const [activeTab, setActiveTab] = useState('overview');
  const [filterType, setFilterType] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false); 
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteExpense, setDeleteExpense] = useState(null);
  const [onlyInstallments, setOnlyInstallments] = useState(false); 

  const queryClient = useQueryClient();
  
  // --- FUNÇÕES AUXILIARES ---
  
  const parseAmount = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleanStr = String(val).replace(',', '.');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
  };

  const isDateInSelectedPeriod = (dateStr) => {
    if (!dateStr) return false;
    const parts = dateStr.split('-');
    if(parts.length < 3) return false;
    const itemYear = parseInt(parts[0]);
    const itemMonth = parseInt(parts[1]) - 1; 

    if (filterType === 'month') {
        return itemMonth === selectedMonth && itemYear === selectedYear;
    } else {
        return itemYear === selectedYear;
    }
  };
  
  // FETCH DATA
  const { data: allInstallments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*').order('due_date', { ascending: true }); return data; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*').order('due_date', { ascending: true }); return data; } });
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*'); return data; } });

  // CONTROLES DE DATA
  const handlePrevMonth = () => { if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else { setSelectedMonth(selectedMonth - 1); } };
  const handleNextMonth = () => { if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else { setSelectedMonth(selectedMonth + 1); } };

  // --- CÁLCULOS ---

  const receivedInstallments = useMemo(() => {
    return allInstallments.filter(i => {
        if (!i.is_received) return false;
        const dateToCheck = i.received_date || i.due_date;
        return isDateInSelectedPeriod(dateToCheck);
    });
  }, [allInstallments, selectedMonth, selectedYear, filterType]);

  const totalRevenueFromAppointments = appointments
    .filter(a => a.status && a.status.includes('Realizado') && isDateInSelectedPeriod(a.date))
    .reduce((sum, a) => {
        const methods = a.payment_methods_json || [];
        const cashPart = methods
            .filter(m => {
                const method = m.method || '';
                const isInstallmentStarter = CREDIT_METHODS.includes(method) || method === 'Agendamento de Pagamento';
                return !isInstallmentStarter;
            })
            .reduce((s, m) => {
                const rawValue = parseAmount(m.value);
                const discPercent = parseAmount(m.discount_percent);
                return s + (rawValue - (rawValue * (discPercent / 100)));
            }, 0);
        return sum + cashPart;
  }, 0);

  const totalRevenue = totalRevenueFromAppointments + receivedInstallments.reduce((sum, i) => sum + parseAmount(i.value), 0);

  const totalMaterialCost = appointments
      .filter(a => a.status && a.status.includes('Realizado') && isDateInSelectedPeriod(a.date))
      .reduce((sum, a) => sum + parseAmount(a.cost_amount), 0);

  const expensesList = expenses.filter(e => isDateInSelectedPeriod(e.due_date));

  const totalExpensesPaid = expenses
    .filter(e => e.is_paid && isDateInSelectedPeriod(e.due_date)) 
    .reduce((sum, e) => sum + parseAmount(e.amount), 0);
  
  const profit = totalRevenue - totalExpensesPaid - totalMaterialCost;
  
  const pendingInstallmentsValue = allInstallments
    .filter(i => !i.is_received && isDateInSelectedPeriod(i.due_date))
    .reduce((sum, i) => sum + parseAmount(i.value), 0);

  const pieChartData = [
    { name: 'Receita (Real)', value: totalRevenue },
    { name: 'Despesas (Pagas)', value: totalExpensesPaid },
    { name: 'Custos Mat.', value: totalMaterialCost }
  ].filter(item => item.value > 0);

  const paymentStats = useMemo(() => {
    const stats = {};
    const periodAppointments = appointments.filter(a => a.status && a.status.includes('Realizado') && isDateInSelectedPeriod(a.date));
    
    periodAppointments.forEach(app => {
        const methods = app.payment_methods_json || [];
        methods.forEach(m => {
            const name = m.method || 'Outro';
            if(!stats[name]) stats[name] = { count: 0, total: 0, installmentsCount: 0, creditCount: 0 };
            
            // CORREÇÃO: Calcula o valor líquido (pago) considerando o desconto
            const rawValue = parseAmount(m.value);
            const discountPercent = parseAmount(m.discount_percent);
            const paidValue = rawValue - (rawValue * (discountPercent / 100));

            stats[name].count += 1;
            stats[name].total += paidValue; // Usa o valor pago, não o bruto
            
            if(name.includes('Crédito') || name.includes('Parcelamento')) {
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
  }, [appointments, selectedMonth, selectedYear, filterType]);

  const paymentPieData = paymentStats.map(stat => ({ name: stat.name, value: stat.total }));

  const expenseStats = useMemo(() => {
      const stats = {};
      const periodExpenses = expenses.filter(e => e.is_paid && isDateInSelectedPeriod(e.due_date));
      
      periodExpenses.forEach(e => {
          const category = e.category || 'Outros';
          if (!stats[category]) stats[category] = { count: 0, total: 0 };
          stats[category].count += 1;
          stats[category].total += parseAmount(e.amount);
      });

      return Object.entries(stats).map(([name, data]) => ({
          name,
          count: data.count,
          total: data.total
      })).sort((a,b) => b.total - a.total);
  }, [expenses, selectedMonth, selectedYear, filterType]);

  const expensePieData = expenseStats.map(stat => ({ name: stat.name, value: stat.total }));

  const allReceivedItems = useMemo(() => {
    const items = [];
    receivedInstallments.forEach(i => {
        items.push({
            id: `inst-${i.id}`,
            patient_name: i.patient_name,
            value: i.value,
            date: i.received_date,
            description: `Parcela ${i.installment_number}/${i.total_installments}`,
            type: 'PARCELA'
        });
    });
    appointments.filter(a => a.status && a.status.includes('Realizado') && isDateInSelectedPeriod(a.date)).forEach(app => {
        const methods = app.payment_methods_json || [];
        methods.forEach((m, idx) => {
            const method = m.method || '';
            if (!CREDIT_METHODS.includes(method) && method !== 'Agendamento de Pagamento') { 
                const rawValue = parseAmount(m.value);
                const paidValue = rawValue - (rawValue * (parseAmount(m.discount_percent) / 100));
                items.push({
                    id: `app-${app.id}-${idx}`,
                    patient_name: app.patient_name_ref || 'N/A', 
                    value: paidValue,
                    date: app.date, 
                    description: `Pagamento à Vista (${method})`,
                    type: 'À VISTA'
                });
            }
        });
    });
    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [receivedInstallments, appointments, selectedMonth, selectedYear, filterType]);

  // --- MUTAÇÕES ---

  const updateInstallmentMutation = useMutation({
    mutationFn: async (installment) => {
      if (installment.type === 'À VISTA') return; 
      const { error } = await supabase.from('installments').update({ 
            is_received: !installment.is_received, 
            received_date: !installment.is_received ? format(new Date(), 'yyyy-MM-dd') : null
        }).eq('id', installment.id.replace('inst-', ''));
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['installments'] }); toast.success('Status atualizado!'); },
    onError: (e) => toast.error('Erro: ' + e.message)
  });

  const createMutation = useMutation({ 
    mutationFn: async (data) => { 
        const payload = {
            description: data.description || 'Despesa',
            category: data.category || 'Outros',
            amount: parseAmount(data.amount),
            due_date: data.due_date || format(new Date(), 'yyyy-MM-dd'),
            is_paid: data.is_paid === true
        };
        const { error } = await supabase.from('expenses').insert([payload]); 
        if(error) throw error;
    }, 
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['expenses'] }); 
        setIsExpenseModalOpen(false); 
        toast.success('Despesa cadastrada'); 
    },
    onError: (e) => toast.error('Erro ao cadastrar: ' + e.message)
  });

  const updateMutation = useMutation({ 
    mutationFn: async ({ id, data }) => { 
        const payload = {
            description: data.description,
            category: data.category,
            amount: parseAmount(data.amount),
            due_date: data.due_date,
            is_paid: data.is_paid === true
        };
        const { error } = await supabase.from('expenses').update(payload).eq('id', id); 
        if(error) throw error;
    }, 
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setEditingExpense(null); toast.success('Despesa atualizada'); },
    onError: (e) => toast.error('Erro ao atualizar: ' + e.message)
  });

  const deleteMutation = useMutation({ 
    mutationFn: async (id) => { const { error } = await supabase.from('expenses').delete().eq('id', id); if(error) throw error; }, 
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setDeleteExpense(null); toast.success('Despesa excluída'); },
    onError: (e) => toast.error('Erro: ' + e.message)
  });

  const togglePaid = (expense) => { 
    updateMutation.mutate({ 
        id: expense.id, 
        data: { ...expense, is_paid: !expense.is_paid } 
    }); 
  };

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = [2024, 2025, 2026]; 
  
  const liquidCardClass = profit >= 0 
    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100' 
    : 'bg-rose-50 border-rose-200 dark:bg-rose-950 dark:border-rose-800 text-rose-900 dark:text-rose-100';

  return (
    <div className="h-[calc(100vh-100px)] overflow-y-auto w-full p-2 pb-40 px-4 md:px-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <PageHeader title="Financeiro" subtitle="Fluxo de caixa (Regime de Caixa)" action={<Button onClick={() => setIsExpenseModalOpen(true)} className="bg-stone-900"><Plus className="w-4 h-4 mr-2"/> Nova Despesa</Button>}/>
        
        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-xl border border-stone-200 shadow-sm items-center justify-between">
          <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full sm:w-32"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="month">Mês</SelectItem><SelectItem value="year">Ano</SelectItem></SelectContent>
              </Select>
          </div>
          {filterType === 'month' && (
              <div className="flex items-center gap-2 bg-stone-50 p-1 rounded-lg border border-stone-200 dark:bg-stone-800 dark:border-stone-700">
                  <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8 hover:bg-white dark:hover:bg-stone-700"><ChevronLeft className="w-4 h-4"/></Button>
                  <div className="flex gap-2">
                      <Select value={selectedMonth.toString()} onValueChange={v=>setSelectedMonth(parseInt(v))}><SelectTrigger className="w-32 h-8 border-none bg-transparent shadow-none focus:ring-0 font-medium"><SelectValue/></SelectTrigger><SelectContent>{months.map((m,i)=><SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select>
                      <Select value={selectedYear.toString()} onValueChange={v=>setSelectedYear(parseInt(v))}><SelectTrigger className="w-20 h-8 border-none bg-transparent shadow-none focus:ring-0 font-medium"><SelectValue/></SelectTrigger><SelectContent>{years.map(y=><SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8 hover:bg-white dark:hover:bg-stone-700"><ChevronRight className="w-4 h-4"/></Button>
              </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard title="Entradas (Caixa)" value={<span className="text-xl font-bold tracking-tight">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={DollarSign} />
          <StatCard title="A Receber (Previsto)" value={<span className="text-xl font-bold tracking-tight">R$ {pendingInstallmentsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={CreditCard} />
          <StatCard title="Despesas (Pagas)" value={<span className="text-xl font-bold tracking-tight">R$ {totalExpensesPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingDown} />
          <StatCard title="Custo Mat." value={<span className="text-xl font-bold tracking-tight">R$ {totalMaterialCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingDown} />
          <StatCard title="Líquido (Caixa)" value={<span className="text-xl font-bold tracking-tight">R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingUp} className={liquidCardClass} />
        </div>

        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-stone-100 w-full sm:w-auto flex flex-wrap h-auto justify-start p-1 gap-1">
              <TabsTrigger value="overview" className="flex-1 sm:flex-none min-w-[100px]">Visão Geral</TabsTrigger>
              <TabsTrigger value="installments" className="flex-1 sm:flex-none min-w-[100px]">Recebidos</TabsTrigger>
              <TabsTrigger value="expenses" className="flex-1 sm:flex-none min-w-[100px]">Despesas</TabsTrigger>
              <TabsTrigger value="payments" className="flex-1 sm:flex-none min-w-[100px]">Relatórios</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="mt-6">
            <Card>
              <CardHeader><CardTitle>Entradas x Saídas (Período)</CardTitle></CardHeader>
              <CardContent className="h-80 min-w-0">
                {pieChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
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
              <div className="flex items-center space-x-2 p-3 bg-stone-50 rounded-lg border border-stone-100">
                  <Checkbox id="only-installments" checked={onlyInstallments} onCheckedChange={setOnlyInstallments}/>
                  <label htmlFor="only-installments" className="text-sm font-medium leading-none cursor-pointer text-stone-700 flex items-center gap-1"><Filter className="w-4 h-4 text-stone-500"/> Mostrar apenas parcelas &gt; 1x</label>
              </div>
              {allReceivedItems.length === 0 && <p className="text-center text-stone-400 py-10">Nenhum recebimento.</p>}
              <div className="grid grid-cols-1 gap-4">
                  {allReceivedItems.map(i=>(
                      <Card key={i.id}>
                          <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                              <div className="flex gap-4 items-center min-w-0 flex-1">
                                  {i.type === 'PARCELA' && (<button onClick={()=>updateInstallmentMutation.mutate(i)} className="transition-transform active:scale-95 flex-shrink-0"><CheckCircle2 className={`w-6 h-6 text-emerald-600 fill-emerald-50`}/></button>)}
                                  {i.type === 'À VISTA' && (<CalendarIcon className="w-6 h-6 text-stone-400 flex-shrink-0"/>)}
                                  <div className="min-w-0">
                                      <h3 className="font-bold text-stone-800 dark:text-stone-200 truncate">{i.patient_name}</h3>
                                      <div className="flex items-center gap-2 text-xs text-stone-500 flex-wrap">
                                          <span className={`px-2 py-0.5 rounded text-[10px] ${i.type === 'À VISTA' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>{i.description}</span>
                                          <span className="whitespace-nowrap">Data: {i.date ? format(new Date(i.date), 'dd/MM/yyyy') : 'N/A'}</span>
                                      </div>
                                  </div>
                              </div>
                              <span className="font-bold text-stone-700 dark:text-stone-300 whitespace-nowrap">R$ {Number(i.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </CardContent>
                      </Card>
                  ))}
              </div>
          </TabsContent>
          <TabsContent value="expenses" className="mt-6 space-y-4">
              {expensesList.length === 0 && <p className="text-center text-stone-400 py-10">Nenhuma despesa encontrada neste período.</p>}
              <div className="grid grid-cols-1 gap-4">
                  {expensesList.map(e=>(
                      <ExpenseCard key={e.id} expense={e} onEdit={()=>setEditingExpense(e)} onDelete={()=>setDeleteExpense(e)} onTogglePaid={()=>togglePaid(e)}/>
                  ))}
              </div>
          </TabsContent>
          
          <TabsContent value="payments" className="mt-6 space-y-10">
              <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-700 border-b border-emerald-100 pb-2">
                      <ArrowUpCircle className="w-5 h-5"/>
                      <h3 className="font-bold text-lg">Entradas por Método</h3>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card>
                          <CardHeader><CardTitle>Gráfico de Entradas</CardTitle></CardHeader>
                          <CardContent className="h-64 min-w-0">
                              {paymentPieData.length > 0 ? (
                                  <ResponsiveContainer width="100%" height="100%">
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
                          <CardHeader><CardTitle>Detalhamento de Entradas</CardTitle></CardHeader>
                          <CardContent>
                              <div className="overflow-x-auto">
                                  <table className="w-full text-sm text-left min-w-[300px]">
                                      <thead className="text-xs text-stone-500 uppercase bg-stone-50"><tr><th className="px-4 py-2">Método</th><th className="px-4 py-2 text-center">Qtd</th><th className="px-4 py-2 text-right">Total Pago</th></tr></thead>
                                      <tbody>{paymentStats.map((stat, index) => (<tr key={index} className="border-b border-stone-100 hover:bg-stone-50"><td className="px-4 py-3 font-medium truncate max-w-[150px]">{stat.name}</td><td className="px-4 py-3 text-center">{stat.count}</td><td className="px-4 py-3 text-right">R$ {stat.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>))}</tbody>
                                  </table>
                              </div>
                          </CardContent>
                      </Card>
                  </div>
              </div>

              <div className="space-y-4">
                  <div className="flex items-center gap-2 text-rose-700 border-b border-rose-100 pb-2">
                      <ArrowDownCircle className="w-5 h-5"/>
                      <h3 className="font-bold text-lg">Saídas por Categoria</h3>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card>
                          <CardHeader><CardTitle>Gráfico de Despesas (Pagas)</CardTitle></CardHeader>
                          <CardContent className="h-64 min-w-0">
                              {expensePieData.length > 0 ? (
                                  <ResponsiveContainer width="100%" height="100%">
                                      <PieChart>
                                          <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                                              {expensePieData.map((entry, index) => (<Cell key={`cell-exp-${index}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />))}
                                          </Pie>
                                          <Tooltip formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                                      </PieChart>
                                  </ResponsiveContainer>
                              ) : <div className="flex items-center justify-center h-full text-stone-400">Sem despesas pagas</div>}
                          </CardContent>
                      </Card>
                      <Card>
                          <CardHeader><CardTitle>Detalhamento de Despesas</CardTitle></CardHeader>
                          <CardContent>
                              <div className="overflow-x-auto">
                                  <table className="w-full text-sm text-left min-w-[300px]">
                                      <thead className="text-xs text-stone-500 uppercase bg-stone-50"><tr><th className="px-4 py-2">Categoria</th><th className="px-4 py-2 text-center">Qtd</th><th className="px-4 py-2 text-right">Total Pago</th></tr></thead>
                                      <tbody>{expenseStats.map((stat, index) => (<tr key={index} className="border-b border-stone-100 hover:bg-stone-50"><td className="px-4 py-3 font-medium truncate max-w-[150px]">{stat.name}</td><td className="px-4 py-3 text-center">{stat.count}</td><td className="px-4 py-3 text-right">R$ {stat.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>))}</tbody>
                                  </table>
                              </div>
                          </CardContent>
                      </Card>
                  </div>
              </div>
          </TabsContent>
        </Tabs>

        <ExpenseModal 
          open={isExpenseModalOpen||!!editingExpense} 
          onClose={()=>{setIsExpenseModalOpen(false);setEditingExpense(null)}} 
          expense={editingExpense} 
          onSave={d=>{editingExpense?updateMutation.mutate({id:editingExpense.id,data:d}):createMutation.mutate(d)}}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
        <AlertDialog open={!!deleteExpense} onOpenChange={()=>setDeleteExpense(null)}><AlertDialogContent><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogFooter><AlertDialogCancel>Não</AlertDialogCancel><AlertDialogAction onClick={()=>deleteMutation.mutate(deleteExpense.id)}>Sim</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </div>
    </div>
  );
}

function ExpenseCard({ expense, onEdit, onDelete, onTogglePaid }) { 
    const isPaid = expense.is_paid;
    const dateString = expense.due_date || format(new Date(), 'yyyy-MM-dd');
    const [y, m, d] = dateString.split('-').map(Number);
    const displayDate = (!isNaN(y)) ? `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}` : 'N/A';
    const isOverdue = !isPaid && new Date(dateString) < new Date() && dateString !== format(new Date(), 'yyyy-MM-dd');

    return (
        <Card className={`bg-white border-stone-100 hover:shadow-sm transition-shadow ${isOverdue ? 'border-l-4 border-l-rose-400' : isPaid ? 'border-l-4 border-l-stone-400' : 'border-l-4 border-l-amber-400'}`}>
            <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex gap-4 items-center flex-1 min-w-0">
                    <button onClick={onTogglePaid} title={isPaid ? "Desmarcar" : "Pagar"} className="flex-shrink-0">
                        <CheckCircle2 className={`w-6 h-6 ${isPaid?'text-emerald-600 fill-emerald-50':'text-stone-300 hover:text-emerald-400'}`}/>
                    </button>
                    <div className="min-w-0">
                        <h3 className="font-bold text-stone-800 dark:text-stone-200 truncate">{expense.description}</h3>
                        <div className="flex items-center gap-2 text-xs text-stone-500 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{expense.category}</Badge>
                            <span className={isOverdue ? 'text-rose-600 font-bold whitespace-nowrap' : 'text-stone-500 whitespace-nowrap'}>
                                {isPaid ? 'Pago' : `Venc: ${displayDate}`}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-4 items-center w-full sm:w-auto justify-between sm:justify-end">
                    <span className={`font-bold ${isPaid ? 'text-stone-700' : 'text-stone-400'} dark:text-stone-300 whitespace-nowrap`}>R$ {Number(expense.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <div className="flex gap-2"><Button size="sm" variant="outline" onClick={onEdit}><Edit2 className="w-4 h-4"/></Button><Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button></div>
                </div>
            </CardContent>
        </Card>
    ); 
}

function ExpenseModal({ open, onClose, expense, onSave, isSaving }) { 
  const [form, setForm] = useState({description:'',category:'',amount:'',due_date:format(new Date(),'yyyy-MM-dd'),is_paid:false}); 
  
  React.useEffect(()=>{
    if(expense) {
        setForm({
            description: expense.description || '',
            category: expense.category || '',
            amount: expense.amount || '',
            due_date: expense.due_date || format(new Date(),'yyyy-MM-dd'),
            is_paid: expense.is_paid || false,
        });
    } else {
        setForm({description:'',category:'',amount:'',due_date:format(new Date(),'yyyy-MM-dd'),is_paid:false})
    }
  },[expense,open]); 
  
  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2">
                <DialogTitle>{expense ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
                <DialogDescription>Preencha os dados da despesa abaixo.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-2">
                <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
                    <div><Label>Descrição *</Label><Input placeholder="Descrição" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><Label>Categoria *</Label>
                        <Select value={form.category} onValueChange={v=>setForm({...form,category:v})} required>
                            <SelectTrigger><SelectValue placeholder="Categoria"/></SelectTrigger>
                            <SelectContent className="max-h-[200px]">
                                {EXPENSE_CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        </div>
                        <div><Label>Valor *</Label><Input type="number" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/></div>
                    </div>
                    <div><Label>Vencimento *</Label><Input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} required/></div>
                    <div className="flex items-center space-x-2 bg-stone-50 p-3 rounded border border-stone-100">
                        <Checkbox checked={form.is_paid} onCheckedChange={checked => setForm({...form, is_paid: checked})} id="is_paid_checkbox"/>
                        <label htmlFor="is_paid_checkbox" className="text-sm font-medium leading-none cursor-pointer">Despesa Paga</label>
                    </div>
                </form>
            </div>
            <div className="p-6 pt-2 flex justify-end gap-3 bg-white border-t border-stone-100">
                <Button variant="outline" onClick={onClose} type="button">Cancelar</Button>
                <Button type="submit" form="expense-form" disabled={isSaving} className="bg-stone-900 text-white">{isSaving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
        </DialogContent>
    </Dialog>
  ); 
}