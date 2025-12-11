import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea'; // Importando Textarea
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Calendar, User, FileText, ChevronDown, ChevronUp, History, CreditCard, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const STATUS_OPTIONS = ['Agendado', 'Confirmado', 'Realizado', 'Cancelado'];
const TYPE_OPTIONS = ['Novo', 'Recorrente'];

const PAYMENT_METHOD_OPTIONS = [
  'Dinheiro', 'Pix', 'Débito PJ', 'Débito PF', 
  'Cartão de Crédito PJ', 'Cartão de Crédito PF', 
  'Parceria', 'Troca em Procedimento'
];

const DISCOUNT_ALLOWED_METHODS = ['Dinheiro', 'Pix', 'Débito PJ', 'Débito PF'];
const INSTALLMENT_ALLOWED_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];

export default function Appointments() {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [expandedPatientId, setExpandedPatientId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patients(*)')
        .order('date', { ascending: false })
        .order('time', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const groupedAppointments = useMemo(() => {
    const groups = {};
    appointments.forEach(app => {
        const pId = app.patient_id || 'unknown';
        const pName = app.patients?.full_name || 'Desconhecido';
        if (search && !pName.toLowerCase().includes(search.toLowerCase())) return;
        if (!groups[pId]) { 
            groups[pId] = { 
                patient: app.patients || { id: 'unknown', full_name: 'Paciente Excluído' }, 
                history: [] 
            }; 
        }
        groups[pId].history.push(app);
    });
    return Object.values(groups);
  }, [appointments, search]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
        const { id, returns_to_create, ...rawData } = data;
        
        const payload = {
            patient_id: rawData.patient_id,
            date: rawData.date,
            time: rawData.time,
            status: rawData.status,
            type: rawData.type,
            notes: rawData.notes,
            payment_methods_json: rawData.payment_methods, 
            procedures_json: rawData.procedures_json,
            materials_json: rawData.materials_json,
            total_amount: Number(rawData.total_amount) || 0,
            cost_amount: Number(rawData.cost_amount) || 0,
            profit_amount: Number(rawData.profit_amount) || 0,
            discount_percent: Number(rawData.discount_percent) || 0
        };

        let appointmentId = id;

        if (id) {
            const { data: updated, error } = await supabase.from('appointments').update(payload).eq('id', id).select().single();
            if (error) throw error;
            appointmentId = updated.id;
        } else {
            const { data: newApp, error } = await supabase.from('appointments').insert([payload]).select().single();
            if (error) throw error;
            appointmentId = newApp.id;
        }

        if (payload.status === 'Realizado') {
            await supabase.from('stock_movements').delete().eq('appointment_id', appointmentId);
            await supabase.from('installments').delete().eq('appointment_id', appointmentId);

            if (rawData.materials_json && rawData.materials_json.length > 0) {
                const { data: dbMaterials } = await supabase.from('materials').select('id, name, stock_quantity, cost_per_unit');
                const movementsPayload = [];
                for (const matItem of rawData.materials_json) {
                    const dbMat = dbMaterials?.find(m => m.name === matItem.name);
                    if (dbMat) {
                        const qty = 1; 
                        const currentStock = Number(dbMat.stock_quantity) || 0;
                        const newStock = currentStock - qty;
                        
                        await supabase.from('materials').update({ stock_quantity: newStock }).eq('id', dbMat.id);
                        
                        movementsPayload.push({
                            material_id: dbMat.id,
                            appointment_id: appointmentId,
                            type: 'saida',
                            quantity: qty,
                            previous_stock: currentStock,
                            new_stock: newStock,
                            cost_per_unit: Number(dbMat.cost_per_unit)||0,
                            total_cost: Number(matItem.cost) || 0,
                            reason: 'Uso em atendimento',
                            date: payload.date,
                            material_name: dbMat.name,
                            patient_name: rawData.patient_name_ref 
                        });
                    }
                }
                if (movementsPayload.length > 0) {
                    await supabase.from('stock_movements').insert(movementsPayload);
                }
            }

            if (rawData.payment_methods && rawData.payment_methods.length > 0) {
                const installmentsPayload = [];
                rawData.payment_methods.forEach(pm => {
                    const isCredit = pm.method && pm.method.includes('Crédito');

                    if (isCredit) {
                        const totalVal = Number(pm.value) || 0;
                        const numInstallments = Number(pm.installments) || 1;
                        const valPerInst = totalVal / numInstallments;
                        
                        for (let i = 1; i <= numInstallments; i++) {
                            // CORREÇÃO: i - 1 garante que a 1ª parcela seja no mês atual (Data + 0 meses)
                            const dueDate = addMonths(parseISO(payload.date), i - 1);
                            
                            installmentsPayload.push({
                                appointment_id: appointmentId,
                                patient_name: rawData.patient_name_ref || 'Paciente',
                                installment_number: i,
                                total_installments: numInstallments,
                                value: valPerInst,
                                due_date: format(dueDate, 'yyyy-MM-dd'),
                                is_received: false,
                                received_date: null
                            });
                        }
                    }
                });
                if (installmentsPayload.length > 0) {
                    await supabase.from('installments').insert(installmentsPayload);
                }
            }
        }

        if (returns_to_create && returns_to_create.length > 0) {
            const returnsPayload = returns_to_create.map(ret => ({
                patient_id: payload.patient_id,
                date: ret.date,
                notes: `Retorno Automático: ${ret.note || ''}`,
                status: 'Agendado',
                type: 'Recorrente'
            }));
            await supabase.from('appointments').insert(returnsPayload);
        }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments_list'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });     
      queryClient.invalidateQueries({ queryKey: ['installments'] }); 
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      setIsModalOpen(false);
      setEditingAppointment(null);
      toast.success('Salvo e sincronizado!');
    },
    onError: (e) => toast.error('Erro ao salvar: ' + e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { 
        await supabase.from('stock_movements').delete().eq('appointment_id', id);
        await supabase.from('installments').delete().eq('appointment_id', id);
        await supabase.from('appointments').delete().eq('id', id); 
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['appointments_list'] });
        setDeleteId(null);
        setIsModalOpen(false);
        toast.success('Excluído!');
    }
  });

  return (
    <div className="space-y-6 p-4 animate-in fade-in duration-500">
      <PageHeader title="Atendimentos" subtitle="Histórico agrupado por paciente" action={<Button onClick={() => { setEditingAppointment(null); setIsModalOpen(true); }} className="bg-stone-900 text-white hover:bg-stone-800 shadow-md"><Plus className="w-4 h-4 mr-2"/> Novo Atendimento</Button>}/>
      <div className="relative max-w-lg mx-auto md:mx-0"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400 w-4 h-4" /><Input placeholder="Buscar paciente..." className="pl-10 bg-white border-stone-200 rounded-full shadow-sm" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
      <div className="space-y-4">
        {isLoading ? <p className="text-center text-stone-400 py-10">Carregando...</p> : 
         groupedAppointments.length > 0 ? groupedAppointments.map(group => (
            <Card key={group.patient?.id || Math.random()} className="border-stone-100 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50" onClick={() => setExpandedPatientId(expandedPatientId === group.patient?.id ? null : group.patient?.id)}>
                    <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-serif font-bold text-lg border border-stone-200">{group.patient?.full_name?.charAt(0).toUpperCase()}</div><div><h3 className="font-bold text-stone-800 text-lg">{group.patient?.full_name}</h3><p className="text-xs text-stone-500">{group.history.length} atendimentos</p></div></div>
                    <Button variant="ghost" size="icon">{expandedPatientId === group.patient?.id ? <ChevronUp className="w-5 h-5 text-stone-400"/> : <ChevronDown className="w-5 h-5 text-stone-400"/>}</Button>
                </div>
                {expandedPatientId === group.patient?.id && (
                    <div className="border-t border-stone-100 bg-stone-50/50 p-4 space-y-3">
                        {group.history.map(app => (
                            <div key={app.id} className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-stone-300">
                                <div className="flex items-center gap-4 flex-1 w-full"><Badge variant="outline" className={`w-24 justify-center ${app.type === 'Recorrente' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{app.type}</Badge><div><div className="flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-stone-400"/><span className="text-sm font-bold text-stone-800">{format(parseISO(app.date), "dd 'de' MMM, yyyy", { locale: ptBR })}</span></div><p className="text-xs text-stone-500 line-clamp-1">{app.notes || 'Sem observações'}</p></div></div>
                                <div className="flex items-center gap-4"><Badge className="bg-stone-800">{app.status}</Badge><span className="text-sm font-bold text-stone-700 min-w-[80px] text-right">R$ {app.profit_amount?.toFixed(2)}</span><Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingAppointment(app); setIsModalOpen(true); }}><FileText className="w-4 h-4 text-stone-500"/></Button></div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
         )) : <div className="text-center py-20 text-stone-400 border-2 border-dashed border-stone-200 rounded-xl bg-stone-50"><p>Nenhum atendimento.</p></div>
        }
      </div>
      <AppointmentModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        initialData={editingAppointment} 
        onSave={saveMutation.mutate} 
        onDelete={(id) => setDeleteId(id)}
        isSaving={saveMutation.isPending}
      />
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Essa ação é irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

export function AppointmentModal({ open, onOpenChange, initialData, onSave, onDelete, isSaving }) {
    const { data: patientsList = [] } = useQuery({ queryKey: ['patients_select'], queryFn: async () => { const { data } = await supabase.from('patients').select('id, full_name').order('full_name'); return data || []; }, enabled: !!open });
    const { data: proceduresList = [] } = useQuery({ queryKey: ['procedures_select'], queryFn: async () => { const { data } = await supabase.from('procedures').select('*').order('name'); return data || []; }, enabled: !!open });
    const { data: materialsList = [] } = useQuery({ queryKey: ['materials_select'], queryFn: async () => { const { data } = await supabase.from('materials').select('*').order('name'); return data || []; }, enabled: !!open });

    const [formData, setFormData] = useState({ patient_id: '', date: '', time: '', status: 'Agendado', type: 'Novo', notes: '' });
    const [procedures, setProcedures] = useState([{ name: '', value: 0 }]);
    const [materials, setMaterials] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [returnsList, setReturnsList] = useState([]);
    const [newReturnDate, setNewReturnDate] = useState('');
    const [newReturnNote, setNewReturnNote] = useState('');
    const [patientHistory, setPatientHistory] = useState([]);

    useEffect(() => {
        if (formData.patient_id) {
            supabase.from('appointments').select('*').eq('patient_id', formData.patient_id).order('date', { ascending: false }).limit(5).then(({ data }) => setPatientHistory(data || []));
        } else {
            setPatientHistory([]);
        }
    }, [formData.patient_id]);

    useEffect(() => {
        if (open) {
            if (initialData) {
                setFormData({
                    patient_id: initialData.patient_id?.toString() || '',
                    date: initialData.date || format(new Date(), 'yyyy-MM-dd'),
                    time: initialData.time || '',
                    status: initialData.status || 'Agendado',
                    type: initialData.type || 'Recorrente',
                    notes: initialData.notes || ''
                });
                setProcedures(Array.isArray(initialData.procedures_json) ? initialData.procedures_json : [{ name: '', value: 0 }]);
                setMaterials(Array.isArray(initialData.materials_json) ? initialData.materials_json : []);
                setPaymentMethods(Array.isArray(initialData.payment_methods_json) ? initialData.payment_methods_json : []);
                setReturnsList([]);
            } else {
                setFormData({ patient_id: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', status: 'Agendado', type: 'Novo', notes: '' });
                setProcedures([{ name: '', value: 0 }]);
                setMaterials([]);
                setPaymentMethods([]);
                setReturnsList([]);
            }
        }
    }, [initialData, open]);

    const financials = useMemo(() => {
        const totalService = procedures.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        const totalMaterials = materials.reduce((acc, curr) => acc + (Number(curr.cost) || 0), 0);
        let totalPaidReal = 0;
        let totalDiscounts = 0;
        paymentMethods.forEach(pm => {
            const rawValue = Number(pm.value) || 0;
            const discPercent = Number(pm.discount_percent) || 0;
            const discountValue = rawValue * (discPercent / 100);
            totalDiscounts += discountValue;
            totalPaidReal += (rawValue - discountValue);
        });
        const profit = totalPaidReal - totalMaterials;
        return { totalService, totalMaterials, totalDiscounts, totalPaidReal, profit };
    }, [procedures, materials, paymentMethods]);

    const handleSubmit = () => {
        if (!formData.patient_id) return toast.error("Selecione um paciente.");
        const patientObj = patientsList.find(p => p.id?.toString() === formData.patient_id);
        const patientName = patientObj ? patientObj.full_name : 'Paciente';

        onSave({
            ...formData,
            id: initialData?.id,
            patient_name_ref: patientName,
            procedures_json: procedures,
            materials_json: materials,
            payment_methods: paymentMethods,
            total_amount: financials.totalService, 
            cost_amount: financials.totalMaterials,
            profit_amount: financials.profit,
            discount_percent: 0, 
            returns_to_create: returnsList
        });
    };

    const handleAddReturn = () => { if (!newReturnDate) return toast.error("Selecione data"); setReturnsList([...returnsList, { date: newReturnDate, note: newReturnNote }]); setNewReturnDate(''); setNewReturnNote(''); };
    const handleAddPayment = () => { setPaymentMethods([...paymentMethods, { method: 'Pix', value: 0, installments: 1, discount_percent: 0 }]); };
    const updatePayment = (index, field, value) => { const newMethods = [...paymentMethods]; newMethods[index][field] = value; setPaymentMethods(newMethods); };
    const removePayment = (index) => { setPaymentMethods(paymentMethods.filter((_, i) => i !== index)); };
    const handleSelectProcedure = (index, procName) => {
        const selected = proceduresList.find(p => p.name === procName);
        const newProcs = [...procedures]; newProcs[index].name = procName; 
        if (selected) newProcs[index].value = selected.default_price || 0;
        setProcedures(newProcs);
    };
    const safeClose = () => { if(typeof onOpenChange === 'function') onOpenChange(false); };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0 gap-0 bg-stone-50 overflow-hidden">
                <DialogHeader className="p-6 pb-4 bg-white border-b border-stone-200 shadow-sm z-10">
                    <DialogTitle className="text-2xl font-serif text-stone-900">{initialData ? 'Editar Atendimento' : 'Novo Atendimento'}</DialogTitle>
                    <DialogDescription>Preencha os dados clínicos e financeiros.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-1 overflow-hidden">
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6">
                            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex gap-2"><User className="w-4 h-4"/> Dados do Agendamento</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <Label>Paciente *</Label>
                                        <Select value={formData.patient_id} onValueChange={v => setFormData({...formData, patient_id: v})}>
                                            <SelectTrigger><SelectValue placeholder="Busque paciente..."/></SelectTrigger>
                                            <SelectContent>{patientsList.map(p => <SelectItem key={p.id} value={p.id?.toString()}>{p.full_name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label>Data</Label><Input type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})}/></div>
                                        <div><Label>Hora</Label><Input type="time" value={formData.time || ''} onChange={e => setFormData({...formData, time: e.target.value})}/></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label>Tipo</Label><Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TYPE_OPTIONS.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                                        <div><Label>Status</Label><Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                                    </div>
                                </div>
                            </div>

                            {/* NOVA ÁREA DE DESCRIÇÃO E PLANEJAMENTO */}
                            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex gap-2"><FileText className="w-4 h-4"/> Planejamento e Descrição</h4>
                                <Textarea 
                                    className="min-h-[120px] bg-stone-50/50" 
                                    placeholder="Descreva aqui o planejamento do procedimento, produtos utilizados, áreas de aplicação e observações clínicas detalhadas..."
                                    value={formData.notes}
                                    onChange={e => setFormData({...formData, notes: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                    <div className="flex justify-between"><Label className="font-bold uppercase text-xs text-stone-500">Procedimentos</Label><Button variant="ghost" size="sm" onClick={()=>setProcedures([...procedures, {name:'', value:0}])} className="text-xs text-blue-600">+ Adicionar</Button></div>
                                    {procedures.map((p, i) => (
                                        <div key={i} className="flex gap-2 items-center">
                                            <div className="flex-1">
                                                <div className="relative">
                                                    <Select value={p.name} onValueChange={(val) => handleSelectProcedure(i, val)}>
                                                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..."/></SelectTrigger>
                                                        <SelectContent>
                                                            {proceduresList.map(proc => <SelectItem key={proc.id} value={proc.name}>{proc.name}</SelectItem>)}
                                                            <SelectItem value="Outro">Outro (Digitar)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    {p.name === 'Outro' && <Input className="mt-1 h-8 text-xs" placeholder="Nome" onChange={e => { const n = [...procedures]; n[i].name = e.target.value; setProcedures(n); }} />}
                                                </div>
                                            </div>
                                            <div className="w-24"><Input className="pl-2 h-9" type="number" placeholder="R$" value={p.value || 0} onChange={e=>{const n=[...procedures]; n[i].value=e.target.value; setProcedures(n)}}/></div>
                                            <X className="w-4 h-4 cursor-pointer text-stone-400 hover:text-red-500" onClick={()=>setProcedures(procedures.filter((_,ix)=>ix!==i))}/>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                    <div className="flex justify-between"><Label className="font-bold uppercase text-xs text-stone-500">Custos</Label></div>
                                    {materialsList.length > 0 && <Select onValueChange={(v)=>{ const m=materialsList.find(x=>x.name===v); if(m) setMaterials([...materials, {name:m.name, cost:m.cost_per_unit||0}]) }}><SelectTrigger className="h-8 mb-2"><SelectValue placeholder="+ Selecionar Material"/></SelectTrigger><SelectContent>{materialsList.map(m=><SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select>}
                                    {materials.length === 0 && <p className="text-xs text-stone-400 italic">Nenhum custo lançado.</p>}
                                    {materials.map((m,i)=><div key={i} className="flex gap-2 mb-1"><Input value={m.name || ''} className="h-8 flex-1" readOnly/><Input value={m.cost || 0} type="number" className="h-8 w-20" onChange={e=>{const n=[...materials]; n[i].cost=e.target.value; setMaterials(n)}}/><X className="w-4 h-4 cursor-pointer mt-2 text-stone-400 hover:text-red-500" onClick={()=>setMaterials(materials.filter((_,ix)=>ix!==i))}/></div>)}
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                <div className="flex justify-between items-center"><h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex gap-2"><CreditCard className="w-4 h-4"/> Pagamentos</h4><Button size="sm" variant="outline" onClick={handleAddPayment} className="text-xs h-7">+ Adicionar Pagamento</Button></div>
                                {paymentMethods.map((pm, i) => (
                                    <div key={i} className="flex flex-wrap gap-2 items-center bg-stone-50 p-2 rounded border border-stone-100">
                                        <Select value={pm.method} onValueChange={v => updatePayment(i, 'method', v)}><SelectTrigger className="w-40 h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent>{PAYMENT_METHOD_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
                                        <div className="relative w-28"><span className="absolute left-2 top-2 text-xs text-stone-400">R$</span><Input type="number" className="pl-6 h-8 text-xs" placeholder="Valor" value={pm.value} onChange={e => updatePayment(i, 'value', e.target.value)} /></div>
                                        {DISCOUNT_ALLOWED_METHODS.includes(pm.method) && (<div className="relative w-20"><Input type="number" className="h-8 text-xs pr-6" placeholder="Desc" value={pm.discount_percent || ''} onChange={e => updatePayment(i, 'discount_percent', e.target.value)} /><span className="absolute right-2 top-2 text-xs text-stone-400">%</span></div>)}
                                        {INSTALLMENT_ALLOWED_METHODS.includes(pm.method) && (<Select value={pm.installments?.toString()} onValueChange={v => updatePayment(i, 'installments', v)}><SelectTrigger className="w-16 h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent>{[1,2,3,4,5,6,10,12].map(n => <SelectItem key={n} value={n.toString()}>{n}x</SelectItem>)}</SelectContent></Select>)}
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 ml-auto" onClick={() => removePayment(i)}><Trash2 className="w-4 h-4"/></Button>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center pt-2 border-t border-stone-100 text-sm"><span className="text-stone-500">Valor Serviço: <strong>R$ {financials.totalService.toFixed(2)}</strong></span><span className="text-emerald-600">Recebido (Liq): <strong>R$ {financials.totalPaidReal.toFixed(2)}</strong></span></div>
                            </div>

                            <div className="bg-stone-100 p-4 rounded-xl border border-dashed border-stone-300">
                                <Label className="font-bold flex items-center gap-2 mb-3 text-stone-600"><Calendar className="w-4 h-4"/> Criar Retornos</Label>
                                <div className="flex gap-2 items-end mb-2"><div className="w-1/3"><Input type="date" className="bg-white h-9" value={newReturnDate} onChange={e => setNewReturnDate(e.target.value)}/></div><div className="flex-1"><Input placeholder="Obs..." className="bg-white h-9" value={newReturnNote} onChange={e => setNewReturnNote(e.target.value)}/></div><Button size="sm" className="bg-stone-800 h-9" onClick={handleAddReturn}><Plus className="w-4 h-4 mr-1"/> Adicionar</Button></div>
                                <div className="space-y-1">{returnsList.map((r,idx)=><div key={idx} className="text-xs p-2 bg-white rounded border border-stone-200 flex justify-between items-center shadow-sm"><span><strong>{format(parseISO(r.date), 'dd/MM')}</strong> - {r.note}</span><X className="w-3 h-3 cursor-pointer text-red-400" onClick={()=>setReturnsList(returnsList.filter((_,ix)=>ix!==idx))}/></div>)}</div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-stone-200 text-center"><span className="text-[10px] font-bold text-stone-400 uppercase block">Receita Real</span><span className="text-xl font-light text-stone-800">R$ {financials.totalPaidReal.toFixed(2)}</span></div>
                                <div className="bg-white p-4 rounded-xl border border-stone-200 text-center"><span className="text-[10px] font-bold text-stone-400 uppercase block">Custo</span><span className="text-xl font-light text-red-600">- R$ {financials.totalMaterials.toFixed(2)}</span></div>
                                <div className={`p-4 rounded-xl border text-center ${financials.profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><span className={`text-[10px] font-bold uppercase block ${financials.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Lucro</span><span className={`text-xl font-bold ${financials.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>R$ {financials.profit.toFixed(2)}</span></div>
                            </div>
                        </div>
                    </ScrollArea>

                    <div className="w-80 bg-stone-50 border-l border-stone-200 p-6 overflow-y-auto hidden lg:block">
                        <h4 className="font-bold text-stone-500 text-xs uppercase tracking-widest mb-4 flex items-center gap-2"><History className="w-4 h-4"/> Histórico Recente</h4>
                        <div className="space-y-4">
                            {patientHistory.length > 0 ? patientHistory.map(h => (
                                <div key={h.id} className="group relative pl-4 border-l-2 border-stone-200 hover:border-stone-400 transition-colors pb-4 last:pb-0">
                                    <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-stone-300 group-hover:bg-stone-500 transition-colors border-2 border-white"></div>
                                    <div className="text-xs font-bold text-stone-800 mb-1">{format(parseISO(h.date), 'dd/MM/yyyy')}</div>
                                    <p className="text-xs text-stone-500 italic line-clamp-2 mb-1">"{h.notes || 'Sem notas'}"</p>
                                    <Badge variant="secondary" className="text-[10px] h-5 bg-stone-200 text-stone-600 hover:bg-stone-300">{h.type}</Badge>
                                </div>
                            )) : <div className="text-center py-10 text-stone-300 text-xs italic">Selecione um paciente para ver o histórico.</div>}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-white border-t border-stone-200 flex justify-between items-center z-10">
                    <div>{initialData && onDelete && <Button variant="ghost" onClick={() => onDelete(initialData.id)} className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4 mr-2"/> Excluir</Button>}</div>
                    <div className="flex gap-3"><Button variant="outline" onClick={safeClose}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={isSaving} className="bg-stone-900 text-white min-w-[140px]">{isSaving ? 'Salvando...' : 'Salvar'}</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}