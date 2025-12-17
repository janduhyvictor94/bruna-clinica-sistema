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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, Edit2, Trash2, DollarSign, TrendingUp, TrendingDown, 
  CheckCircle2, CreditCard, ChevronLeft, ChevronRight, Filter, Calendar as CalendarIcon 
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, endOfYear, getMonth } from 'date-fns';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const EXPENSE_CATEGORIES = ['Aluguel', 'Energia', 'Água', 'Internet', 'Telefone', 'Materiais', 'Equipamentos', 'Marketing', 'Funcionários', 'Impostos', 'Outros'];
const CREDIT_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];
const DISCOUNT_ALLOWED_METHODS = ['Dinheiro', 'Pix PF', 'Pix PJ', 'Débito PJ', 'Débito PF'];
const COLORS = ['#c4a47c', '#78716c', '#d6d3d1', '#a8a29e', '#57534e', '#44403c'];

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
  
  // Fetch data
  const { data: allInstallments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*').order('due_date', { ascending: true }); return data; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*').order('due_date', { ascending: true }); return data; } });
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*'); return data; } });

  // Date Range
  const handlePrevMonth = () => { if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else { setSelectedMonth(selectedMonth - 1); } };
  const handleNextMonth = () => { if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else { setSelectedMonth(selectedMonth + 1); } };
  const getDateRange = () => {
    if (filterType === 'month') return { start: startOfMonth(new Date(selectedYear, selectedMonth)), end: endOfMonth(new Date(selectedYear, selectedMonth)) };
    if (filterType === 'year') return { start: startOfYear(new Date(selectedYear, 0)), end: endOfYear(new Date(selectedYear, 0)) };
    return { start: new Date(0), end: new Date() };
  };
  const { start, end } = getDateRange();

  // Recebimentos (Regime de Caixa)
  const receivedInstallments = useMemo(() => {
    return allInstallments.filter(i => {
        if (!i.is_received) return false;
        
        // Prioriza received_date (competência), mas usa due_date se nulo
        const dateToCheck = i.received_date ? parseISO(i.received_date) : parseISO(i.due_date);
        
        return !isNaN(dateToCheck.getTime()) && isWithinInterval(dateToCheck, { start, end });
    });
  }, [allInstallments, start, end]);

  // Appointments (para custo de material e faturamento manual)
  const filteredAppointments = appointments.filter(a => { 
      if(!a.date) return false; 
      const date = parseISO(a.date);
      return isWithinInterval(date, { start, end }) && a.status === 'Realizado'; 
  });


  // Despesas Pagas (Regime de Caixa)
  const paidExpenses = useMemo(() => {
    return expenses.filter(e => 
        e.is_paid && 
        e.paid_date &&
        isWithinInterval(parseISO(e.paid_date), { start, end })
    );
  }, [expenses, start, end]);

  // General Stats
  const totalRevenueFromAppointments = filteredAppointments.reduce((sum, a) => {
    const methods = a.payment_methods_json || [];
    const cashPart = methods
        .filter(m => {
            const method = m.method || '';
            // EXCLUI: Cartão de Crédito E Agendamento de Pagamento
            const isInstallmentStarter = CREDIT_METHODS.includes(method) || method === 'Agendamento de Pagamento';
            
            // Inclui se NÃO for um método que gera parcelas futuras (apenas Pix, Dinheiro, Débito)
            return !isInstallmentStarter;
        })
        .reduce((s, m) => {
            const rawValue = Number(m.value) || 0;
            const discPercent = Number(m.discount_percent) || 0;
            const discountValue = rawValue * (discPercent / 100);
            return s + (rawValue - discountValue);
        }, 0);
    return sum + cashPart;
  }, 0);

  const totalRevenue = totalRevenueFromAppointments + receivedInstallments.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
  const totalMaterialCost = filteredAppointments.reduce((sum, a) => sum + (Number(a.cost_amount) || 0), 0);
  const totalExpenses = paidExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  
  const profit = totalRevenue - totalExpenses - totalMaterialCost;
  
  const pendingInstallmentsValue = allInstallments
    .filter(i => !i.is_received && i.due_date && isWithinInterval(parseISO(i.due_date), { start, end }))
    .reduce((sum, i) => sum + (Number(i.value) || 0), 0);

  const pieChartData = [
    { name: 'Receita (Real)', value: totalRevenue },
    { name: 'Despesas Fixas', value: totalExpenses },
    { name: 'Custos Variáveis', value: totalMaterialCost }
  ].filter(item => item.value > 0);

  // Stats para Relatório de Pagamento
  const paymentStats = useMemo(() => {
    const stats = {};
    filteredAppointments.forEach(app => {
        const methods = app.payment_methods_json || [];
        methods.forEach(m => {
            const name = m.method || 'Outro';
            if(!stats[name]) stats[name] = { count: 0, total: 0, installmentsCount: 0, creditCount: 0 };
            
            stats[name].count += 1;
            stats[name].total += Number(m.value) || 0;
            
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
  }, [filteredAppointments]);

  const paymentPieData = paymentStats.map(stat => ({ name: stat.name, value: stat.total }));

  // --- LÓGICA DE CONSOLIDAÇÃO DE RECEBIMENTOS PARA A ABA "RECEBIDOS" ---
  const allReceivedItems = useMemo(() => {
    const items = [];
    
    // 1. Adicionar Recebimentos à Prazo (da tabela installments)
    receivedInstallments.forEach(i => {
        items.push({
            id: `inst-${i.id}`,
            patient_name: i.patient_name,
            value: i.value,
            date: i.received_date,
            description: `Parcela ${i.installment_number}/${i.total_installments} (Comp. ${format(parseISO(i.due_date), 'dd/MM')})`,
            type: 'PARCELA'
        });
    });

    // 2. Adicionar Recebimentos à Vista (do payment_methods_json em appointments)
    filteredAppointments.forEach(app => {
        const methods = app.payment_methods_json || [];
        methods.forEach((m, idx) => {
            const method = m.method || '';
            const isCreditCard = CREDIT_METHODS.includes(method);
            const isScheduled = method === 'Agendamento de Pagamento';
            
            // Incluir APENAS se for método à vista (não Cartão e não Agendado)
            if (!isScheduled && !isCreditCard) { 
                const rawValue = Number(m.value) || 0;
                const discPercent = Number(m.discount_percent) || 0;
                const paidValue = rawValue - (rawValue * (discPercent / 100));

                items.push({
                    id: `app-${app.id}-${idx}`,
                    patient_name: app.patient_name_ref || 'N/A', // Assumindo que você tem o nome no appointment ou pode buscar
                    value: paidValue,
                    date: app.date, // Data do atendimento é a data do recebimento para estes métodos
                    description: `Pagamento à Vista (${method})`,
                    type: 'À VISTA'
                });
            }
        });
    });

    // Ordenar por data (mais recente primeiro)
    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [receivedInstallments, filteredAppointments]);

  // FIM LÓGICA DE CONSOLIDAÇÃO

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = [2024, 2025, 2026]; 
  
  const liquidCardClass = profit >= 0 
    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100' 
    : 'bg-rose-50 border-rose-200 dark:bg-rose-950 dark:border-rose-800 text-rose-900 dark:text-rose-100';


  // Filtered Lists for Tabs
  const installmentsList = useMemo(() => {
      // Aplicar filtro de parcelamento apenas na lista de parcelas (para manter a compatibilidade)
      if (onlyInstallments) {
          return allInstallments.filter(i => 
              i.is_received && 
              Number(i.total_installments) > 1 && 
              isWithinInterval(parseISO(i.received_date || i.due_date), { start, end })
          ).sort((a, b) => new Date(b.received_date || b.due_date) - new Date(a.received_date || a.due_date));
      }
      // Se o filtro 'onlyInstallments' for falso, a lista 'allReceivedItems' será usada diretamente no JSX.
      return []; 
  }, [allInstallments, start, end, onlyInstallments]);


  const expensesList = expenses.filter(e => {
    // Despesas a Pagar (Filtra pelo due_date)
    if (activeTab === 'expenses') { 
        if (e.is_paid) return false;
        if (!e.due_date) return false;
        const date = parseISO(e.due_date);
        return !isNaN(date.getTime()) && isWithinInterval(date, { start, end });
    } 
    
    // Se estiver em outra aba, filtra pagas no período
    const dateString = e.is_paid && e.paid_date ? e.paid_date : e.due_date;
    const date = parseISO(dateString);

    if (isNaN(date.getTime())) return false; 

    // Se estiver na aba 'overview' (ou outras), mostra despesas no período.
    return isWithinInterval(date, { start, end });
    
  }).sort((a,b) => {
    const dateA = new Date(b.due_date);
    const dateB = new Date(a.due_date);
    if (isNaN(dateA.getTime())) return -1;
    if (isNaN(dateB.getTime())) return 1;
    return dateA - dateB;
  }); 

  // Mutação para dar baixa na parcela (Mark as received)
  const updateInstallmentMutation = useMutation({
    mutationFn: async (installment) => {
      // Se for um item consolidado (à vista), não faz nada. 
      if (installment.type === 'À VISTA') return; 
        
      const { error } = await supabase
        .from('installments')
        .update({ 
            is_received: !installment.is_received, 
            received_date: !installment.is_received ? format(new Date(), 'yyyy-MM-dd') : null
        })
        .eq('id', installment.id.replace('inst-', '')); // Remove prefixo para pegar ID real
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      toast.success('Status da parcela atualizado!');
    },
    onError: (e) => toast.error('Erro ao atualizar parcela: ' + e.message)
  });

  // Mutação para dar baixa na despesa (Mark as paid)
  const togglePaid = (expense) => { 
    updateMutation.mutate({ 
        id: expense.id, 
        data: { 
            ...expense, 
            is_paid: !expense.is_paid, 
            paid_date: !expense.is_paid ? format(new Date(), 'yyyy-MM-dd') : null 
        } 
    }); 
  };
  
  const createMutation = useMutation({ mutationFn: async (data) => { await supabase.from('expenses').insert([data]); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setIsExpenseModalOpen(false); toast.success('Despesa cadastrada'); } });
  const updateMutation = useMutation({ mutationFn: async ({ id, data }) => { await supabase.from('expenses').update(data).eq('id', id); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setEditingExpense(null); toast.success('Despesa atualizada'); } });
  const deleteMutation = useMutation({ mutationFn: async (id) => { await supabase.from('expenses').delete().eq('id', id); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setDeleteExpense(null); toast.success('Despesa excluída'); } });

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Entradas (Caixa)" value={<span className="text-xl font-bold tracking-tight">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={DollarSign} />
        <StatCard title="A Receber (Previsto)" value={<span className="text-xl font-bold tracking-tight">R$ {pendingInstallmentsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={CreditCard} />
        <StatCard title="Despesas" value={<span className="text-xl font-bold tracking-tight">R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingDown} />
        <StatCard title="Custo Mat." value={<span className="text-xl font-bold tracking-tight">R$ {totalMaterialCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingDown} />
        <StatCard title="Líquido (Caixa)" value={<span className="text-xl font-bold tracking-tight">R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingUp} className={liquidCardClass} />
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-stone-100 w-full sm:w-auto grid grid-cols-4 sm:flex">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="installments">Recebidos</TabsTrigger>
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
            <TabsTrigger value="payments">Relatório Pagamentos</TabsTrigger>
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
            {/* NOVO FILTRO DE PARCELAMENTO */}
            <div className="flex items-center space-x-2 p-3 bg-stone-50 rounded-lg border border-stone-100">
                <Checkbox
                    id="only-installments"
                    checked={onlyInstallments}
                    onCheckedChange={setOnlyInstallments}
                />
                <label
                    htmlFor="only-installments"
                    className="text-sm font-medium leading-none cursor-pointer text-stone-700 flex items-center gap-1"
                >
                    <Filter className="w-4 h-4 text-stone-500"/> Mostrar apenas parcelas de pagamentos divididos (&gt; 1x)
                </label>
            </div>
            {/* FIM NOVO FILTRO */}
            
            {allReceivedItems.length === 0 && <p className="text-center text-stone-400 py-10">Nenhum recebimento confirmado neste período.</p>}
            {allReceivedItems.map(i=>(
                <Card key={i.id}>
                    <CardContent className="p-4 flex justify-between items-center">
                        <div className="flex gap-4 items-center">
                            {/* Apenas itens do tipo 'PARCELA' podem ter o status de recebimento alterado manualmente aqui */}
                            {i.type === 'PARCELA' && (
                                <button onClick={()=>updateInstallmentMutation.mutate(i)} className="transition-transform active:scale-95">
                                    <CheckCircle2 className={`w-6 h-6 text-emerald-600 fill-emerald-50`}/>
                                </button>
                            )}
                            {i.type === 'À VISTA' && (
                                <CalendarIcon className="w-6 h-6 text-stone-400"/>
                            )}

                            <div>
                                <h3 className="font-bold text-stone-800 dark:text-stone-200">{i.patient_name}</h3>
                                <div className="flex items-center gap-2 text-xs text-stone-500">
                                    <span className={`px-2 py-0.5 rounded text-[10px] ${i.type === 'À VISTA' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                                        {i.description}
                                    </span>
                                    <span>Data: {i.date ? format(new Date(i.date), 'dd/MM/yyyy') : 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                        <span className="font-bold text-stone-700 dark:text-stone-300">R$ {Number(i.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </CardContent>
                </Card>
            ))}
        </TabsContent>
        <TabsContent value="expenses" className="mt-6 space-y-4">
            {expensesList.length === 0 && <p className="text-center text-stone-400 py-10">Nenhuma despesa encontrada neste período.</p>}
            {expensesList.map(e=>(
                <ExpenseCard 
                    key={e.id} 
                    expense={e} 
                    onEdit={()=>setEditingExpense(e)} 
                    onDelete={()=>setDeleteExpense(e)} 
                    onTogglePaid={()=>togglePaid(e)}
                />
            ))}
        </TabsContent>
        <TabsContent value="payments" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Distribuição por Método (Total Faturado)</CardTitle></CardHeader>
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
                                <thead className="text-xs text-stone-500 uppercase bg-stone-50"><tr><th className="px-4 py-2">Método</th><th className="px-4 py-2 text-center">Qtd</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Méd. Parcelas</th></tr></thead>
                                <tbody>{paymentStats.map((stat, index) => (<tr key={index} className="border-b border-stone-100 dark:border-stone-800 last:border-0 hover:bg-stone-50 dark:hover:bg-stone-800/50"><td className="px-4 py-3 font-medium">{stat.name}</td><td className="px-4 py-3 text-center">{stat.count}</td><td className="px-4 py-3 text-right">R$ {stat.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td className="px-4 py-3 text-right text-stone-500">{stat.avgInstallments}</td></tr>))}</tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
      </Tabs>

      {/* MODAIS */}
      <ExpenseModal open={isExpenseModalOpen||!!editingExpense} onClose={()=>{setIsExpenseModalOpen(false);setEditingExpense(null)}} expense={editingExpense} onSave={d=>{editingExpense?updateMutation.mutate({id:editingExpense.id,data:d}):createMutation.mutate(d)}}/>
      <AlertDialog open={!!deleteExpense} onOpenChange={()=>setDeleteExpense(null)}><AlertDialogContent><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogFooter><AlertDialogCancel>Não</AlertDialogCancel><AlertDialogAction onClick={()=>deleteMutation.mutate(deleteExpense.id)}>Sim</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

// --- COMPONENTES AUXILIARES (mantidos) ---

function ExpenseCard({ expense, onEdit, onDelete, onTogglePaid }) { 
    const isPaid = expense.is_paid;
    
    // CORREÇÃO: Garante que a data é válida antes de tentar parsear e usar.
    const dateString = isPaid && expense.paid_date ? expense.paid_date : (expense.due_date || format(new Date(), 'yyyy-MM-dd'));
    const date = parseISO(dateString);
    
    const isValidDate = !isNaN(date.getTime());
    const isOverdue = isValidDate && !isPaid && date < new Date();
    
    // Se a data for inválida, exibe 'N/A'
    const displayDate = isValidDate ? format(date, 'dd/MM/yyyy') : 'N/A';

    return (
        <Card className={`bg-white border-stone-100 hover:shadow-sm transition-shadow ${isOverdue ? 'border-l-4 border-l-rose-400' : isPaid ? 'border-l-4 border-l-stone-400' : 'border-l-4 border-l-amber-400'}`}>
            <CardContent className="p-4 flex justify-between items-center">
                <div className="flex gap-4 items-center">
                    <button onClick={onTogglePaid}>
                        <CheckCircle2 className={`w-6 h-6 ${isPaid?'text-emerald-600 fill-emerald-50':'text-stone-300'}`}/>
                    </button>
                    <div>
                        <h3 className="font-bold text-stone-800 dark:text-stone-200">{expense.description}</h3>
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Badge variant="outline" className="text-[10px]">{expense.category}</Badge>
                            <span className={isOverdue ? 'text-rose-600' : 'text-stone-500'}>
                                {isPaid ? `Pago: ${displayDate}` : `Venc: ${displayDate}`}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    <span className="font-bold text-stone-700 dark:text-stone-300">R$ {Number(expense.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={onEdit}><Edit2 className="w-4 h-4"/></Button>
                        <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    ); 
}

function ExpenseModal({ open, onClose, expense, onSave }) { 
  const [form, setForm] = useState({description:'',category:'',amount:'',due_date:format(new Date(),'yyyy-MM-dd'),is_paid:false, paid_date: null}); 
  
  React.useEffect(()=>{
    if(expense) {
        setForm({
            description: expense.description || '',
            category: expense.category || '',
            amount: expense.amount || '',
            due_date: expense.due_date || format(new Date(),'yyyy-MM-dd'),
            is_paid: expense.is_paid || false,
            paid_date: expense.paid_date || null
        });
    } else {
        setForm({description:'',category:'',amount:'',due_date:format(new Date(),'yyyy-MM-dd'),is_paid:false, paid_date: null})
    }
  },[expense,open]); 
  
  const handleSubmit = e => {
    e.preventDefault();
    onSave({ 
        ...form, 
        amount: parseFloat(form.amount) || 0,
        paid_date: form.is_paid ? form.paid_date || format(new Date(), 'yyyy-MM-dd') : null
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
            <DialogHeader><DialogTitle>{expense ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><Label>Descrição *</Label><Input placeholder="Descrição" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><Label>Categoria *</Label><Select value={form.category} onValueChange={v=>setForm({...form,category:v})} required><SelectTrigger><SelectValue placeholder="Categoria"/></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Valor *</Label><Input type="number" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/></div>
                </div>
                <div><Label>Vencimento *</Label><Input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} required/></div>
                
                <div className="flex items-center space-x-2">
                    <Checkbox
                        checked={form.is_paid}
                        onCheckedChange={checked => setForm({...form, is_paid: checked, paid_date: checked ? form.paid_date || format(new Date(), 'yyyy-MM-dd') : null})}
                        id="is_paid_checkbox"
                    />
                    <label htmlFor="is_paid_checkbox" className="text-sm font-medium leading-none cursor-pointer">Despesa Paga</label>
                </div>

                {form.is_paid && (
                    <div>
                        <Label>Data do Pagamento *</Label>
                        <Input type="date" value={form.paid_date || ''} onChange={e=>setForm({...form,paid_date:e.target.value})} required/>
                    </div>
                )}
                
                <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={onClose} type="button">Cancelar</Button>
                    <Button type="submit" className="bg-stone-900">Salvar</Button>
                </div>
            </form>
        </DialogContent>
    </Dialog>
  ); 
}