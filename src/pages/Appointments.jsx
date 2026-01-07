import React, { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Calendar, User, FileText, ChevronDown, ChevronUp, History, CreditCard, X, Trash2, Syringe, Package, Stethoscope, Check, Filter, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, addMonths, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// ATUALIZAÇÃO: Status renomeado para "Realizado"
const STATUS_OPTIONS = [
  'Agendado', 
  'Confirmado', 
  'Realizado', // Antigo "Realizado Pagamento em Atendimento"
  'Realizado Pago', 
  'Realizado a Pagar', 
  'Cancelado'
];

const TYPE_OPTIONS = ['Novo', 'Recorrente'];

const PAYMENT_METHOD_OPTIONS = [
  'Dinheiro', 'Pix PF', 'Pix PJ', 'Débito PJ', 'Débito PF', 
  'Cartão de Crédito PJ', 'Cartão de Crédito PF', 
  'Parceria', 'Troca em Procedimento', 'Agendamento de Pagamento'
];

const DISCOUNT_ALLOWED_METHODS = ['Dinheiro', 'Pix PF', 'Pix PJ', 'Débito PJ', 'Débito PF'];
const CREDIT_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];

export default function Appointments() {
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  
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
        const pId = app.patient_id;
        const pName = app.patients?.full_name || 'Desconhecido';
        if (search && !pName.toLowerCase().includes(search.toLowerCase())) return;
        if (filterDate && app.date !== filterDate) return;

        if (!groups[pId]) { 
            groups[pId] = { 
                patient: app.patients || { id: pId, full_name: 'Paciente Excluído', phone: '' }, 
                history: [] 
            }; 
        }
        groups[pId].history.push(app);
    });
    return Object.values(groups);
  }, [appointments, search, filterDate]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
        const { id, returns_to_create, ...rawData } = data;
        
        const payload = {
            patient_id: rawData.patient_id,
            date: rawData.date,
            time: rawData.time,
            status: rawData.status,
            type: rawData.type,
            service_type_custom: rawData.service_type_custom,
            notes: rawData.notes,
            payment_methods_json: rawData.payment_methods, 
            procedures_json: rawData.procedures_json,
            materials_json: rawData.materials_json,
            total_amount: Number(rawData.total_amount) || 0,
            cost_amount: Number(rawData.cost_amount) || 0,
            profit_amount: Number(rawData.profit_amount) || 0,
            discount_percent: Number(rawData.discount_percent) || 0
        };

        let appointmentId;

        if (id) {
            const idToUpdate = Number(id);
            if (isNaN(idToUpdate)) throw new Error("ID de agendamento inválido.");
            
            const { error } = await supabase.from('appointments').update(payload).eq('id', idToUpdate);
            if (error) throw error;
            appointmentId = idToUpdate;
        } else {
            const { data: newApp, error } = await supabase.from('appointments').insert([payload]).select().single();
            if (error) throw error;
            appointmentId = newApp.id;
        }

        const apptId = Number(appointmentId);
        
        if (payload.status.includes('Realizado')) {
            await supabase.from('stock_movements').delete().eq('appointment_id', apptId);
            await supabase.from('installments').delete().eq('appointment_id', apptId);

            if (rawData.materials_json && rawData.materials_json.length > 0) {
                const { data: dbMaterials } = await supabase.from('materials').select('id, name, stock_quantity, cost_per_unit');
                const movementsPayload = [];
                for (const matItem of rawData.materials_json) {
                    const dbMat = dbMaterials?.find(m => m.name === matItem.name);
                    if (dbMat) {
                        const qty = Number(matItem.quantity) || 1; 
                        const currentStock = Number(dbMat.stock_quantity) || 0;
                        const newStock = currentStock - qty;
                        
                        await supabase.from('materials').update({ stock_quantity: newStock }).eq('id', dbMat.id);
                        
                        movementsPayload.push({
                            material_id: dbMat.id,
                            appointment_id: apptId,
                            type: 'saida',
                            quantity: qty,
                            previous_stock: currentStock,
                            new_stock: newStock,
                            cost_per_unit: Number(dbMat.cost_per_unit)||0,
                            total_cost: (Number(dbMat.cost_per_unit)||0) * qty,
                            reason: 'Uso em atendimento',
                            date: payload.date,
                            material_name: rawData.patient_name_ref 
                        });
                    }
                }
                if (movementsPayload.length > 0) {
                    await supabase.from('stock_movements').insert(movementsPayload);
                }
            }

            const installmentsPayload = [];
            
            if (rawData.payment_methods && rawData.payment_methods.length > 0) {
                rawData.payment_methods.forEach(pm => {
                    const totalVal = Number(pm.value) || 0;
                    const isCreditCard = CREDIT_METHODS.includes(pm.method);
                    const isScheduled = pm.method === 'Agendamento de Pagamento';
                    const numInstallments = Number(pm.installments) || 1;
                    
                    if (isScheduled) {
                        if (!pm.scheduled_date) {
                            throw new Error(`Selecione a data de vencimento para o Agendamento de Pagamento de R$ ${totalVal.toFixed(2).replace('.', ',')}.`);
                        }
                        
                        installmentsPayload.push({
                            appointment_id: apptId,
                            patient_name: rawData.patient_name_ref || 'Paciente',
                            installment_number: 1, 
                            total_installments: numInstallments, 
                            value: totalVal, 
                            due_date: pm.scheduled_date, 
                            is_received: false, 
                            received_date: null
                        });
                    }
                    else if (isCreditCard) {
                        const valPerInst = totalVal / numInstallments;
                        const appointmentDateParsed = parseISO(payload.date);
                        const firstInstallmentDate = addMonths(appointmentDateParsed, 1);
                        
                        for (let i = 1; i <= numInstallments; i++) {
                            const dueDate = addMonths(firstInstallmentDate, i - 1); 
                            const formattedDueDate = format(dueDate, 'yyyy-MM-dd');

                            installmentsPayload.push({
                                appointment_id: apptId,
                                patient_name: rawData.patient_name_ref || 'Paciente',
                                installment_number: i,
                                total_installments: numInstallments,
                                value: valPerInst,
                                due_date: formattedDueDate,
                                is_received: true, 
                                received_date: formattedDueDate 
                            });
                        }
                    } 
                });
            }
            
            if (installmentsPayload.length > 0) {
                const { error: instError } = await supabase.from('installments').insert(installmentsPayload);
                if (instError) throw instError;
            }
        } else if (id) {
            await supabase.from('stock_movements').delete().eq('appointment_id', apptId);
            await supabase.from('installments').delete().eq('appointment_id', apptId);
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
      queryClient.invalidateQueries();
      setIsModalOpen(false);
      setEditingAppointment(null);
      toast.success('Salvo e sincronizado!');
    },
    onError: (e) => toast.error('Erro ao salvar: ' + e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { 
        const idToDelete = Number(id);
        if (isNaN(idToDelete)) throw new Error("ID de agendamento inválido para exclusão.");
        
        await supabase.from('stock_movements').delete().eq('appointment_id', idToDelete);
        await supabase.from('installments').delete().eq('appointment_id', idToDelete);
        await supabase.from('appointments').delete().eq('id', idToDelete); 
    },
    onSuccess: () => {
        queryClient.invalidateQueries();
        setDeleteId(null);
        setIsModalOpen(false);
        toast.success('Excluído!');
    }
  });

  return (
    <div className="space-y-6 p-4 animate-in fade-in duration-500">
      <PageHeader title="Atendimentos" subtitle="Histórico agrupado por paciente" action={<Button onClick={() => { setEditingAppointment(null); setIsModalOpen(true); }} className="bg-stone-900 text-white hover:bg-stone-800 shadow-md"><Plus className="w-4 h-4 mr-2"/> Novo Atendimento</Button>}/>
      
      <div className="flex flex-col sm:flex-row gap-4 max-w-4xl">
          <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400 w-4 h-4" />
              <Input placeholder="Buscar paciente..." className="pl-10 bg-white border-stone-200 rounded-full shadow-sm" value={search} onChange={(e) => setSearch(e.target.value)}/>
          </div>
          
          <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-full px-3 py-1 shadow-sm w-full sm:w-auto">
              <Filter className="w-4 h-4 text-stone-400" />
              <Input type="date" className="border-none bg-transparent h-8 w-full sm:w-36 focus-visible:ring-0 px-0 text-sm text-stone-600" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} title="Filtrar por dia específico" />
              {filterDate && (<Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-stone-100" onClick={() => setFilterDate('')} title="Limpar filtro de data"><X className="w-3 h-3 text-stone-400"/></Button>)}
          </div>
      </div>

      <div className="space-y-4">
        {isLoading ? <p className="text-center text-stone-400 py-10">Carregando...</p> : 
         groupedAppointments.length > 0 ? groupedAppointments.map(group => (
            <Card key={group.patient?.id || Math.random()} className="border-stone-100 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50" onClick={() => setExpandedPatientId(expandedPatientId === group.patient?.id ? null : group.patient?.id)}>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-serif font-bold text-lg border border-stone-200">{group.patient?.full_name?.charAt(0).toUpperCase()}</div>
                        <div>
                            <h3 className="font-bold text-stone-800 text-lg">{group.patient?.full_name}</h3>
                            {/* ATUALIZAÇÃO: Exibição do WhatsApp */}
                            {group.patient?.phone && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <Phone className="w-3 h-3 text-stone-400" />
                                    <span className="text-xs text-stone-500 font-medium">{group.patient.phone}</span>
                                </div>
                            )}
                            <p className="text-xs text-stone-400 mt-0.5">
                                {filterDate ? `Atendimento em ${format(parseISO(filterDate), 'dd/MM/yyyy')}` : `${group.history.length} atendimentos totais`}
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon">{expandedPatientId === group.patient?.id ? <ChevronUp className="w-5 h-5 text-stone-400"/> : <ChevronDown className="w-5 h-5 text-stone-400"/>}</Button>
                </div>
                {(expandedPatientId === group.patient?.id || filterDate) && (
                    <div className="border-t border-stone-100 bg-stone-50/50 p-4 space-y-3">
                        {group.history.map(app => (
                            <div key={app.id} className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-border-300">
                                <div className="flex items-center gap-4 flex-1 w-full"><Badge variant="outline" className={`w-24 justify-center ${app.type === 'Recorrente' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{app.type}</Badge><div><div className="flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-stone-400"/><span className="text-sm font-bold text-stone-800">{format(parseISO(app.date), "dd 'de' MMM, yyyy", { locale: ptBR })}</span></div><p className="text-xs text-stone-500 line-clamp-1">{app.service_type_custom ? <strong>{app.service_type_custom} - </strong> : ''}{app.notes || 'Sem observações'}</p></div></div>
                                <div className="flex items-center gap-4"><Badge className="bg-stone-800">{app.status}</Badge><span className="text-sm font-bold text-stone-700 min-w-[80px] text-right">R$ {app.total_amount?.toFixed(2)}</span><Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingAppointment(app); setIsModalOpen(true); }}><FileText className="w-4 h-4 text-stone-500"/></Button></div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
         )) : (
            <div className="text-center py-20 text-stone-400 border-2 border-dashed border-stone-200 rounded-xl bg-stone-50">
                {filterDate ? <p>Nenhum atendimento encontrado na data {format(parseISO(filterDate), 'dd/MM/yyyy')}.</p> : <p>Nenhum atendimento.</p>}
            </div>
         )
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

    const [formData, setFormData] = useState({ patient_id: '', date: '', time: '', status: 'Agendado', type: 'Novo', service_type_custom: '', notes: '' });
    const [procedures, setProcedures] = useState([{ name: '', value: 0 }]);
    const [materials, setMaterials] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [returnsList, setReturnsList] = useState([]);
    const [newReturnDate, setNewReturnDate] = useState('');
    const [newReturnNote, setNewReturnNote] = useState('');
    
    // STATES PARA CAMPO DE BUSCA DE PACIENTE
    const [patientSearch, setPatientSearch] = useState('');
    const [showPatientList, setShowPatientList] = useState(false);
    const [isConsultationMode, setIsConsultationMode] = useState(false);

    const { data: patientHistory = [] } = useQuery({
        queryKey: ['patient_history_sidebar', formData.patient_id],
        queryFn: async () => {
            if (!formData.patient_id) return [];
            const { data } = await supabase.from('appointments').select('*').eq('patient_id', formData.patient_id).order('date', { ascending: false }).limit(5);
            return data || [];
        },
        enabled: !!formData.patient_id
    });

    const filteredPatients = useMemo(() => {
        if (!patientSearch) return patientsList.slice(0, 10); 
        return patientsList.filter(p => p.full_name.toLowerCase().includes(patientSearch.toLowerCase()));
    }, [patientsList, patientSearch]);

    useEffect(() => {
        if (open) {
            if (initialData) {
                const initialPatientId = initialData.patient_id ? Number(initialData.patient_id) : '';
                
                setFormData({
                    patient_id: isNaN(initialPatientId) ? '' : initialPatientId,
                    date: initialData.date || format(new Date(), 'yyyy-MM-dd'),
                    time: initialData.time || '',
                    status: initialData.status || 'Agendado',
                    type: initialData.type || 'Recorrente',
                    service_type_custom: initialData.service_type_custom || '',
                    notes: initialData.notes || ''
                });
                
                const loadedProcedures = Array.isArray(initialData.procedures_json) ? initialData.procedures_json : [{ name: '', value: 0 }];
                if (loadedProcedures.length === 1 && loadedProcedures[0].name === 'Consulta') {
                    setIsConsultationMode(true);
                } else {
                    setIsConsultationMode(false);
                }
                setProcedures(loadedProcedures);
                
                const loadedMaterials = Array.isArray(initialData.materials_json) ? initialData.materials_json.map(m => ({...m, quantity: m.quantity || 1})) : [];
                setMaterials(loadedMaterials);
                
                const loadedMethods = Array.isArray(initialData.payment_methods_json) ? initialData.payment_methods_json : [];
                setPaymentMethods(loadedMethods);
                
                setReturnsList([]);

                if (initialData.patients) {
                    setPatientSearch(initialData.patients.full_name);
                } else if (initialPatientId && patientsList.length > 0) {
                     const p = patientsList.find(x => x.id === initialPatientId);
                     if(p) setPatientSearch(p.full_name);
                }

            } else {
                setFormData({ patient_id: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', status: 'Agendado', type: 'Novo', service_type_custom: '', notes: '' });
                setProcedures([{ name: '', value: 0 }]);
                setMaterials([]);
                setPaymentMethods([]);
                setReturnsList([]);
                setIsConsultationMode(false);
                setPatientSearch('');
            }
            setNewReturnDate('');
            setNewReturnNote('');
            setShowPatientList(false);
        }
    }, [initialData, open, patientsList]); 

    const toggleConsultationMode = (enabled) => {
        setIsConsultationMode(enabled);
        if (enabled) {
            setProcedures([{ name: 'Consulta', value: 0 }]);
        }
    };

    const formatMoneyDisplay = (value) => {
        if (value === undefined || value === null) return '';
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value);
    };

    const handleMoneyChange = (value, setter, index, field, list) => {
        const rawValue = value.replace(/\D/g, ""); 
        const floatValue = Number(rawValue) / 100; 
        if (list) { const newList = [...list]; newList[index][field] = floatValue; setter(newList); } else { setter(floatValue); }
    };

    const financials = useMemo(() => {
        const totalService = procedures.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        const totalMaterials = materials.reduce((acc, curr) => acc + ((Number(curr.cost) || 0) * (Number(curr.quantity) || 1)), 0);
        let totalPaidReal = 0;
        
        paymentMethods.forEach(pm => {
            const isCreditCard = CREDIT_METHODS.includes(pm.method);
            const isScheduled = pm.method === 'Agendamento de Pagamento';
            
            if (!isScheduled && !isCreditCard) { 
                const rawValue = Number(pm.value) || 0;
                const discPercent = Number(pm.discount_percent) || 0;
                const discountValue = rawValue * (discPercent / 100);
                totalPaidReal += (rawValue - discountValue);
            }
        });
        
        const profit = totalPaidReal - totalMaterials;
        return { totalService, totalMaterials, totalPaidReal, profit };
    }, [procedures, materials, paymentMethods]);

    const handleSubmit = () => {
        if (!formData.patient_id) return toast.error("Selecione um paciente.");
        const patientObj = patientsList.find(p => p.id === formData.patient_id);
        const patientName = patientObj ? patientObj.full_name : 'Paciente';
        
        const hasInvalidScheduled = paymentMethods.some(pm => pm.method === 'Agendamento de Pagamento' && (!pm.scheduled_date || pm.scheduled_date === ''));
        if(hasInvalidScheduled) {
            return toast.error("A data de Vencimento é obrigatória para Agendamento de Pagamento.");
        }

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
    const handleAddPayment = () => { setPaymentMethods([...paymentMethods, { method: 'Pix PF', value: 0, installments: 1, discount_percent: 0, scheduled_date: '' }]); };
    const updatePayment = (index, field, value) => { 
        const newMethods = [...paymentMethods]; 
        
        if (field === 'method' && value === 'Agendamento de Pagamento') {
             newMethods[index]['installments'] = 1; 
             const initialDate = format(new Date(), 'yyyy-MM-dd');
             newMethods[index]['scheduled_date'] = format(addMonths(parseISO(formData.date || initialDate), 1), 'yyyy-MM-dd'); 
        } else if (field === 'method' && !CREDIT_METHODS.includes(value)) {
            newMethods[index]['installments'] = 1; 
        }
        
        newMethods[index][field] = value; 
        setPaymentMethods(newMethods); 
    };
    const removePayment = (index) => { setPaymentMethods(paymentMethods.filter((_, i) => i !== index)); };
    
    const handleSelectProcedure = (index, procName) => {
        const selected = proceduresList.find(p => p.name === procName);
        const newProcs = [...procedures]; newProcs[index].name = procName; 
        if (selected) newProcs[index].value = selected.default_price || 0;
        setProcedures(newProcs);
    };

    const handleAddMaterial = (val) => { const m = materialsList.find(x => x.name === val); if (m) setMaterials([...materials, { name: m.name, cost: m.cost_per_unit || 0, quantity: 1 }]); };
    const safeClose = () => { if(typeof onOpenChange === 'function') onOpenChange(false); };

    const handleSelectPatient = (patient) => {
        setFormData({...formData, patient_id: patient.id});
        setPatientSearch(patient.full_name);
        setShowPatientList(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0 gap-0 bg-stone-50 overflow-hidden">
                <DialogHeader className="p-6 pb-4 bg-white border-b border-stone-200 shadow-sm z-10 flex flex-row justify-between items-center space-y-0">
                    <div><DialogTitle className="text-2xl font-serif text-stone-900">{initialData ? 'Editar Atendimento' : 'Novo Atendimento'}</DialogTitle><DialogDescription>Preencha os dados clínicos e financeiros.</DialogDescription></div>
                </DialogHeader>
                <div className="flex flex-1 overflow-hidden">
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6">
                            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex gap-2"><User className="w-4 h-4"/> Dados do Agendamento</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2 relative">
                                        <Label>Paciente *</Label>
                                        <Input 
                                            placeholder="Digite o nome do paciente..."
                                            value={patientSearch}
                                            onChange={(e) => {
                                                setPatientSearch(e.target.value);
                                                setFormData({...formData, patient_id: ''}); 
                                                setShowPatientList(true);
                                            }}
                                            onFocus={() => setShowPatientList(true)}
                                            className="mt-1"
                                        />
                                        
                                        {showPatientList && (
                                            <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowPatientList(false)}></div>
                                            <div className="absolute z-50 w-full bg-white border border-stone-200 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                                                {filteredPatients.length > 0 ? filteredPatients.map(p => (
                                                    <div
                                                        key={p.id}
                                                        className="p-3 hover:bg-stone-50 cursor-pointer text-sm flex justify-between items-center border-b border-stone-50 last:border-0"
                                                        onClick={() => handleSelectPatient(p)}
                                                    >
                                                        <span className="font-medium text-stone-700">{p.full_name}</span>
                                                        {formData.patient_id === p.id && <Check className="w-4 h-4 text-emerald-600"/>}
                                                    </div>
                                                )) : (
                                                    <div className="p-3 text-sm text-stone-400 text-center">Nenhum paciente encontrado.</div>
                                                )}
                                            </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4"><div><Label>Data</Label><Input type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})}/></div><div><Label>Hora</Label><Input type="time" value={formData.time || ''} onChange={e => setFormData({...formData, time: e.target.value})}/></div></div>
                                    <div className="grid grid-cols-2 gap-4"><div><Label>Tipo</Label><Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{TYPE_OPTIONS.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div><Label>Status</Label><Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>
                                    <div className="md:col-span-2">
                                        <Label>Tipo de Atendimento (Detalhe)</Label>
                                        <Input 
                                            placeholder="Ex: Retorno 15 dias, Retoque, Avaliação..." 
                                            value={formData.service_type_custom} 
                                            onChange={e => setFormData({...formData, service_type_custom: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex gap-2"><FileText className="w-4 h-4"/> Planejamento e Descrição</h4>
                                <Textarea className="min-h-[120px] bg-stone-50/50" placeholder="Descreva aqui o planejamento..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}/>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                    <div className="flex justify-between items-center">
                                        <Label className="font-bold uppercase text-xs text-stone-500 flex gap-2 items-center"><Syringe className="w-3 h-3"/> Procedimentos</Label>
                                        <div className="flex gap-2">
                                            {!isConsultationMode && <Button variant="ghost" size="sm" onClick={()=>setProcedures([...procedures, {name:'', value:0}])} className="text-xs text-blue-600">+ Adicionar</Button>}
                                            {isConsultationMode ? (
                                                <Button size="sm" onClick={() => toggleConsultationMode(false)} className="bg-stone-900 text-white hover:bg-stone-800 text-xs gap-1">
                                                    <Plus className="w-3 h-3" /> Iniciar Procedimento
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" onClick={() => toggleConsultationMode(true)} className="text-xs gap-1 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                                                    <Stethoscope className="w-3 h-3" /> Modo Consulta
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-5 gap-2 text-[10px] uppercase font-bold text-stone-400 mb-1 px-1"><span className="col-span-3">Nome</span><span className="col-span-2">Valor (R$)</span></div>
                                    
                                    {procedures.map((p, i) => {
                                        const isCustom = p.name === 'Outro' || (p.name && p.name.trim() !== '' && !proceduresList.some(item => item.name === p.name));
                                        const selectValue = isCustom ? 'Outro' : p.name;

                                        return (
                                        <div key={i} className="flex gap-2 items-center">
                                            <div className="col-span-3 flex-1">
                                                <div className="relative">
                                                    {isConsultationMode && p.name === 'Consulta' ? (
                                                        <Input className="h-9 bg-stone-100 font-medium" value="Consulta" disabled />
                                                    ) : (
                                                        <>
                                                            <Select value={selectValue} onValueChange={(val) => handleSelectProcedure(i, val)}>
                                                                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..."/></SelectTrigger>
                                                                <SelectContent>{proceduresList.map(proc => <SelectItem key={proc.id} value={proc.name}>{proc.name}</SelectItem>)}<SelectItem value="Outro">Outro (Digitar)</SelectItem></SelectContent>
                                                            </Select>
                                                            {isCustom && <Input className="mt-1 h-8 text-xs" placeholder="Digite o nome..." value={p.name === 'Outro' ? '' : p.name} onChange={e => { const n = [...procedures]; n[i].name = e.target.value; setProcedures(n); }} />}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-24">
                                                <Input className="pl-2 h-9" type="text" placeholder="0,00" value={formatMoneyDisplay(p.value)} onChange={e => handleMoneyChange(e.target.value, setProcedures, i, 'value', procedures)}/>
                                            </div>
                                            {!isConsultationMode && (
                                                <Button variant="ghost" size="icon" className="h-9 w-9 text-stone-400 hover:text-red-500 hover:bg-red-50" onClick={()=>setProcedures(procedures.filter((_,ix)=>ix!==i))}><Trash2 className="w-4 h-4"/></Button>
                                            )}
                                        </div>
                                    )})}
                                </div>

                                <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                    <div className="flex justify-between"><Label className="font-bold uppercase text-xs text-stone-500 flex gap-2 items-center"><Package className="w-3 h-3"/> Materiais / Custos</Label></div>
                                    {materialsList.length > 0 && <Select onValueChange={handleAddMaterial}><SelectTrigger className="h-9 mb-2"><SelectValue placeholder="+ Adicionar Material do Estoque"/></SelectTrigger><SelectContent>{materialsList.map(m=><SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select>}
                                    <div className="grid grid-cols-6 gap-2 text-[10px] uppercase font-bold text-stone-400 mb-1 px-1 mt-3"><span className="col-span-3">Material</span><span className="col-span-1 text-center">Qtd</span><span className="col-span-2">Custo Unit.</span></div>
                                    {materials.length === 0 && <p className="text-xs text-stone-400 italic py-2 text-center bg-stone-50 rounded">Nenhum custo lançado.</p>}
                                    {materials.map((m,i)=>(<div key={i} className="flex gap-2 mb-1 items-center"><Input value={m.name || ''} className="h-9 flex-1 bg-stone-50" readOnly/><Input type="number" className="h-9 w-16 text-center" value={m.quantity || 1} onChange={e => { const newMaterials = [...materials]; newMaterials[i].quantity = Number(e.target.value); setMaterials(newMaterials); }} min="0.1" step="0.1"/><Input type="text" className="h-9 w-24" value={formatMoneyDisplay(m.cost)} onChange={e => handleMoneyChange(e.target.value, setMaterials, i, 'cost', materials)}/><Button variant="ghost" size="icon" className="h-9 w-9 text-stone-400 hover:text-red-500 hover:bg-red-50" onClick={()=>setMaterials(materials.filter((_,ix)=>ix!==i))}><Trash2 className="w-4 h-4"/></Button></div>))}
                                    {materials.length > 0 && <div className="text-right text-xs text-stone-500 pt-2 border-t border-stone-100">Total Custo: <strong>R$ {financials.totalMaterials.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></div>}
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                                <div className="flex justify-between items-center"><h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex gap-2"><CreditCard className="w-4 h-4"/> Pagamentos</h4><Button size="sm" variant="outline" onClick={handleAddPayment} className="text-xs h-7">+ Adicionar Pagamento</Button></div>
                                {paymentMethods.map((pm, i) => (
                                    <div key={i} className="flex flex-wrap gap-2 items-center bg-stone-50 p-2 rounded border border-stone-100">
                                        <Select value={pm.method} onValueChange={v => updatePayment(i, 'method', v)}><SelectTrigger className="w-44 h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent>{PAYMENT_METHOD_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
                                        <div className="relative w-28"><span className="absolute left-2 top-2 text-xs text-stone-400">R$</span><Input type="text" className="pl-6 h-8 text-xs" placeholder="0,00" value={formatMoneyDisplay(pm.value)} onChange={e => handleMoneyChange(e.target.value, setPaymentMethods, i, 'value', paymentMethods)}/></div>
                                        
                                        {DISCOUNT_ALLOWED_METHODS.includes(pm.method) && (<div className="relative w-20"><Input type="number" className="h-8 text-xs pr-6" placeholder="Desc" value={pm.discount_percent || ''} onChange={e => updatePayment(i, 'discount_percent', e.target.value)} /><span className="absolute right-2 top-2 text-xs text-stone-400">%</span></div>)}
                                        
                                        {CREDIT_METHODS.includes(pm.method) && (
                                            <Select value={pm.installments?.toString()} onValueChange={v => updatePayment(i, 'installments', v)}>
                                                <SelectTrigger className="w-16 h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent>{[1,2,3,4,5,6,10,12].map(n => <SelectItem key={n} value={n.toString()}>{n}x</SelectItem>)}</SelectContent></Select>
                                        )}
                                        
                                        {pm.method === 'Agendamento de Pagamento' && (
                                            <div className="flex items-center gap-1">
                                                <Label className="text-[10px] text-stone-500 uppercase font-bold">Vencimento *:</Label>
                                                <Input type="date" className="h-8 w-32 text-xs" value={pm.scheduled_date || ''} onChange={e => updatePayment(i, 'scheduled_date', e.target.value)} required />
                                            </div>
                                        )}
                                        
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
                                <div className="bg-white p-4 rounded-xl border border-stone-200 text-center"><span className="text-[10px] font-bold text-stone-400 uppercase block">Receita Real</span><span className="text-xl font-light text-stone-800">R$ {financials.totalPaidReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                <div className="bg-white p-4 rounded-xl border border-stone-200 text-center"><span className="text-[10px] font-bold text-stone-400 uppercase block">Custo</span><span className="text-xl font-light text-red-600">- R$ {financials.totalMaterials.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                <div className={`p-4 rounded-xl border text-center ${financials.profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><span className={`text-[10px] font-bold uppercase block ${financials.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Lucro</span><span className={`text-xl font-bold ${financials.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>R$ {financials.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
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