import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Trash2, Phone, Mail, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { toast } from 'sonner';
import PatientDetailsModal from '@/components/PatientDetailsModal';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const ORIGINS = ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'Indicação', 'Google', 'Campanha', 'Post', 'Video', 'Outro'];
const GENDERS = ['Feminino', 'Masculino', 'Outro'];

export default function Patients() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPatient, setEditingPatient] = useState(null);
  const [deletePatient, setDeletePatient] = useState(null);
  const [viewingPatientId, setViewingPatientId] = useState(null);
  const queryClient = useQueryClient();

  // CORREÇÃO AQUI: Verifica se existe ID na URL (vindo dos Avisos) e abre o modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const urlPatientId = params.get('id') || params.get('patientId');

    if (action === 'new') {
      setIsOpen(true);
    }
    
    if (urlPatientId) {
      setViewingPatientId(urlPatientId);
      // Opcional: Limpar a URL para não reabrir ao dar F5
      // window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*, appointments(date, status)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const cleanData = { ...data };
      if (!cleanData.birth_date) cleanData.birth_date = null;
      delete cleanData.next_return_date; 
      const { error } = await supabase.from('patients').insert([cleanData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setIsOpen(false);
      toast.success('Paciente cadastrado com sucesso');
    },
    onError: (error) => { toast.error('Erro ao cadastrar: ' + error.message); }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const cleanData = { ...data };
      if (!cleanData.birth_date) cleanData.birth_date = null;
      delete cleanData.next_return_date; 
      
      const { error } = await supabase.from('patients').update(cleanData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setEditingPatient(null);
      toast.success('Paciente atualizado com sucesso');
    },
    onError: (error) => { toast.error('Erro ao atualizar: ' + error.message); }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { 
        // GARANTIR QUE O ID É STRING LIMPA ANTES DE DELETAR RELACIONAMENTOS
        const idAsString = String(id).trim();

        // DELETA AGENDAMENTOS (que deve deletar movimentos/parcelas em cascata)
        await supabase.from('appointments').delete().eq('patient_id', idAsString);
        
        // DELETA O PACIENTE
        const { error } = await supabase.from('patients').delete().eq('id', idAsString); 
        if (error) throw error; 
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDeletePatient(null);
      toast.success('Paciente excluído');
    },
  });

  const filteredPatients = patients.filter(p =>
    p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone?.includes(searchTerm) || // Busca pelo whatsapp/phone
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Pacientes" subtitle={`${patients.length} cadastrados`} action={<Button onClick={() => setIsOpen(true)} className="bg-stone-900 hover:bg-stone-900" size="sm"><Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Novo Paciente</span></Button>} />
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" /><Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 bg-white text-sm" /></div>
      <div className="grid gap-2 sm:gap-4">
        {filteredPatients.map((patient) => {
            const today = startOfDay(new Date());
            const futureReturns = patient.appointments?.filter(appt => {
                if (!appt.date) return false;
                const apptDate = parseISO(appt.date);
                return (isAfter(apptDate, today) || apptDate.getTime() === today.getTime()) && 
                       (appt.status === 'Agendado' || appt.status === 'Confirmado');
            }).sort((a, b) => new Date(a.date) - new Date(b.date)) || [];

            return (
              <Card key={patient.id} className="bg-white border-stone-100 hover:shadow-sm transition-shadow">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1 sm:gap-3 mb-1 sm:mb-2">
                        <h3 className="font-medium text-stone-800 text-sm sm:text-base truncate">{patient.full_name}</h3>
                        <Badge variant="outline" className="text-[10px] sm:text-xs hidden sm:inline-flex">{patient.gender}</Badge>
                        <Badge className="text-[10px] sm:text-xs bg-stone-100 text-stone-600 hover:bg-stone-100">{patient.origin}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-stone-500">
                        {/* ITEM 1: Mostrando apenas o Whatsapp/Phone principal */}
                        {patient.whatsapp && (<span className="flex items-center gap-1"><Phone className="w-3 h-3" />{patient.whatsapp}</span>)}
                        {patient.email && (<span className="flex items-center gap-1 hidden sm:flex"><Mail className="w-3 h-3" />{patient.email}</span>)}
                      </div>
                      
                      {futureReturns.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {futureReturns.map((ret, idx) => (
                              <Badge key={idx} variant="outline" className={`text-[10px] sm:text-xs flex items-center gap-1 ${ret.status === 'Confirmado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {ret.status === 'Confirmado' ? <CheckCircle2 className="w-3 h-3"/> : <Calendar className="w-3 h-3" />}
                                {format(parseISO(ret.date), 'dd/MM')}
                              </Badge>
                          ))}
                        </div>
                      )}

                    </div>
                    <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                      <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 bg-stone-800 text-white hover:bg-stone-900 hover:text-white" onClick={() => setViewingPatientId(patient.id)} title="Ver histórico profissional"><FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setEditingPatient(patient)}><Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => setDeletePatient(patient)}><Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
        })}
        {filteredPatients.length === 0 && !isLoading && (<div className="text-center py-12 text-stone-400">{searchTerm ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}</div>)}
      </div>
      <PatientModal open={isOpen || !!editingPatient} onClose={() => { setIsOpen(false); setEditingPatient(null); }} patient={editingPatient} onSave={(data) => { if (editingPatient) { updateMutation.mutate({ id: editingPatient.id, data }); } else { createMutation.mutate(data); } }} isLoading={createMutation.isPending || updateMutation.isPending} />
      <AlertDialog open={!!deletePatient} onOpenChange={() => setDeletePatient(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir Paciente</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir {deletePatient?.full_name}? Essa ação é irreversível e excluirá todos os atendimentos e dados relacionados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deletePatient.id)} className="bg-rose-600 hover:bg-rose-700">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      
      {/* CORREÇÃO: Passando o ID corretamente para o modal de detalhes */}
      <PatientDetailsModal open={!!viewingPatientId} onClose={() => setViewingPatientId(null)} patientId={viewingPatientId} />
    </div>
  );
}

function PatientModal({ open, onClose, patient, onSave, isLoading }) {
  const [formData, setFormData] = useState({ full_name: '', whatsapp: '', email: '', birth_date: '', gender: '', cpf: '', address: '', origin: '', protocol: '', notes: '' });

  useEffect(() => {
    if (patient) {
      setFormData({
        full_name: patient.full_name || '', 
        whatsapp: patient.whatsapp || patient.phone || '', 
        email: patient.email || '', birth_date: patient.birth_date || '', gender: patient.gender || '',
        cpf: patient.cpf || '', address: patient.address || '', origin: patient.origin || '',
        protocol: patient.protocol || '', notes: patient.notes || '',
      });
    } else {
      setFormData({ full_name: '', whatsapp: '', email: '', birth_date: '', gender: '', cpf: '', address: '', origin: '', protocol: '', notes: '' });
    }
  }, [patient, open]);

  const formatPhone = (value) => {
    return value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{4})\d+?$/, '$1');
  };

  const formatCPF = (value) => {
    return value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
  };

  const handleSubmit = (e) => { 
      e.preventDefault(); 
      onSave({
          ...formData,
          phone: formData.whatsapp 
      }); 
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{patient ? 'Editar Paciente' : 'Novo Paciente'}</DialogTitle><DialogDescription>Preencha os dados do paciente abaixo.</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label>Nome Completo *</Label><Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required /></div>
            <div><Label>WhatsApp / Celular Principal *</Label><Input value={formData.whatsapp} onChange={(e) => setFormData({ ...formData, whatsapp: formatPhone(e.target.value) })} required placeholder="(00) 00000-0000" /></div>
            <div><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
            <div><Label>Data de Nascimento</Label><Input type="date" value={formData.birth_date} onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })} /></div>
            <div><Label>Gênero *</Label><Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{GENDERS.map(g => (<SelectItem key={g} value={g}>{g}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>CPF</Label><Input value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: formatCPF(e.target.value) })} placeholder="000.000.000-00" /></div>
            <div><Label>Como chegou à clínica *</Label><Select value={formData.origin} onValueChange={(v) => setFormData({ ...formData, origin: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{ORIGINS.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></div>
            <div className="sm:col-span-2"><Label>Endereço</Label><Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={isLoading} className="bg-stone-900 hover:bg-stone-900">{isLoading ? 'Salvando...' : 'Salvar'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}