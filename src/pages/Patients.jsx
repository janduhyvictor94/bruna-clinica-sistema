import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Trash2, Phone, Mail, Calendar, MapPin, X, MessageCircle, ClipboardList, History, StickyNote } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useSearchParams } from 'react-router-dom';

const ORIGINS = ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'Indicação', 'Google', 'Campanha', 'Post', 'Video', 'Outro'];
const GENDERS = ['Feminino', 'Masculino', 'Outro'];

const formatDateDisplay = (dateString) => {
  if (!dateString) return '';
  return format(new Date(dateString + 'T12:00:00'), 'dd/MM');
};

export default function Patients() {
  const [isOpen, setIsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [editingPatient, setEditingPatient] = useState(null);
  const [deletePatient, setDeletePatient] = useState(null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: patients = [] } = useQuery({ 
    queryKey: ['patients'], 
    queryFn: async () => { 
      const { data } = await supabase.from('patients').select('*').order('created_at', { ascending: false }); 
      return data || []; 
    } 
  });

  const { data: appointments = [] } = useQuery({ 
    queryKey: ['appointments'], 
    queryFn: async () => { 
        const { data } = await supabase.from('appointments').select('*').order('date', { ascending: false }); 
        return data || []; 
    } 
  });

  useEffect(() => {
    const action = searchParams.get('action');
    const patientId = searchParams.get('id');

    if (patients.length > 0) {
      if (action === 'new') {
        setIsOpen(true);
        setSearchParams({});
      } else if (patientId) {
        const found = patients.find(p => p.id === parseInt(patientId));
        if (found) {
          setEditingPatient(found);
          setIsOpen(true);
        }
      }
    }
  }, [patients, searchParams, setSearchParams]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
        const { id, ...rest } = data;
        
        // --- CORREÇÃO: Limpeza de dados ---
        // Transforma campos vazios ("") em null para evitar erros no banco
        // E permite salvar mesmo com campos faltando
        const payload = {};
        Object.keys(rest).forEach(key => {
            const value = rest[key];
            if (typeof value === 'string' && value.trim() === '') {
                payload[key] = null;
            } else {
                payload[key] = value;
            }
        });
        
        if (id) await supabase.from('patients').update(payload).eq('id', id);
        else await supabase.from('patients').insert([payload]);
    },
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['patients'] }); 
        setIsOpen(false); 
        setEditingPatient(null); 
        toast.success('Salvo com sucesso!'); 
    },
    onError: (err) => toast.error('Erro ao salvar: ' + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => await supabase.from('patients').delete().eq('id', id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['patients'] }); setDeletePatient(null); toast.success('Excluído'); }
  });

  const filteredPatients = patients.filter(p => (p.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (p.phone || '').includes(searchTerm));

  const openHistory = (patient) => {
    setSelectedPatientForHistory(patient);
    setHistoryOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Pacientes" subtitle={`${patients.length} cadastrados`} action={<Button onClick={() => { setEditingPatient(null); setIsOpen(true); }} className="bg-stone-800 hover:bg-stone-900"><Plus className="w-4 h-4 sm:mr-2"/> Novo Paciente</Button>} />
      <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400"/><Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-white"/></div>
      
      <div className="grid gap-3">
        {filteredPatients.map((p) => (
          <Card key={p.id} className="bg-white hover:shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 sm:gap-3 mb-1 sm:mb-2">
                    <h3 className="font-medium text-stone-800 text-sm sm:text-base truncate">{p.full_name}</h3>
                    <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">{p.gender}</Badge>
                    <Badge className="text-[10px] bg-stone-100 text-stone-600">{p.origin}</Badge>
                    {p.city && <Badge variant="outline" className="text-[10px] border-stone-300 text-stone-500"><MapPin className="w-2 h-2 mr-1"/>{p.city}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-stone-500">
                    {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3"/> {p.phone}</span>}
                    {p.whatsapp && <span className="flex items-center gap-1 text-green-600"><MessageCircle className="w-3 h-3"/> {p.whatsapp}</span>}
                    {p.email && <span className="flex items-center gap-1 hidden sm:flex"><Mail className="w-3 h-3"/> {p.email}</span>}
                  </div>
                  
                  {/* Visualização de Retornos no Card */}
                  {(p.next_return_date || (p.scheduled_returns && p.scheduled_returns.length > 0)) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {p.next_return_date && <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50"><Calendar className="w-3 h-3 mr-1"/> {formatDateDisplay(p.next_return_date)}</Badge>}
                        {Array.isArray(p.scheduled_returns) && p.scheduled_returns.map((r, i) => (
                           <Badge key={i} variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                             <Calendar className="w-3 h-3 mr-1"/> {formatDateDisplay(r.date)}
                           </Badge>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                  <Button variant="outline" size="icon" className="h-8 w-8 text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100" onClick={() => openHistory(p)} title="Ver Histórico">
                      <ClipboardList className="w-3.5 h-3.5"/>
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setEditingPatient(p); setIsOpen(true); }}><Edit2 className="w-3.5 h-3.5"/></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-rose-600" onClick={() => setDeletePatient(p)}><Trash2 className="w-3.5 h-3.5"/></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PatientModal open={isOpen || !!editingPatient} onClose={() => { setIsOpen(false); setEditingPatient(null); }} patient={editingPatient} onSave={(data) => saveMutation.mutate({ ...data, id: editingPatient?.id })} />
      <PatientHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} patient={selectedPatientForHistory} appointments={appointments} />
      <AlertDialog open={!!deletePatient} onOpenChange={() => setDeletePatient(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deletePatient.id)} className="bg-red-600">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

// Histórico
function PatientHistoryModal({ open, onClose, patient, appointments }) {
    if (!patient) return null;
    const patientAppointments = appointments.filter(a => a.patient_id === patient.id && a.status !== 'Cancelado');
    const flatHistory = [];

    patientAppointments.forEach(apt => {
        let notesList = [];
        if (Array.isArray(apt.notes)) notesList = apt.notes;
        else if (typeof apt.notes === 'string' && apt.notes) {
            try {
                const parsed = JSON.parse(apt.notes);
                if (Array.isArray(parsed)) notesList = parsed;
                else notesList = [{ date: apt.date, text: apt.notes }];
            } catch (e) {
                notesList = [{ date: apt.date, text: apt.notes }];
            }
        }
        notesList.forEach(note => {
            flatHistory.push({ date: note.date || apt.date, text: note.text });
        });
    });
    flatHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto bg-stone-50/50">
                <DialogHeader className="pb-4 border-b border-stone-100">
                    <DialogTitle className="flex items-center gap-2">Histórico de Procedimentos</DialogTitle>
                    <DialogDescription>Paciente: {patient.full_name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-6">
                    {flatHistory.length > 0 ? flatHistory.map((item, idx) => (
                        <div key={idx} className="flex gap-4">
                            <div className="flex flex-col items-center w-24 shrink-0 pt-1">
                                <div className="text-xs font-bold text-stone-700">{format(new Date(item.date + 'T12:00:00'), 'dd/MM/yyyy')}</div>
                                <div className="h-full w-[1px] bg-stone-200 my-1"></div>
                            </div>
                            <Card className="flex-1 border-stone-100 shadow-sm relative top-0 bg-stone-50">
                                <CardContent className="p-3">
                                    <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{item.text}</p>
                                </CardContent>
                            </Card>
                        </div>
                    )) : <div className="text-center py-10 text-stone-400">Nenhum histórico registrado.</div>}
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// PatientModal
function PatientModal({ open, onClose, patient, onSave }) {
  const [formData, setFormData] = useState({ full_name: '', phone: '', whatsapp: '', email: '', birth_date: '', gender: '', cpf: '', address: '', city: '', origin: '', protocol: '', notes: '' });

  useEffect(() => { 
      if (patient) {
        setFormData({ 
            full_name: patient.full_name || '', 
            phone: patient.phone || '', 
            whatsapp: patient.whatsapp || '', 
            email: patient.email || '', 
            birth_date: patient.birth_date || '', 
            gender: patient.gender || '', 
            cpf: patient.cpf || '', 
            address: patient.address || '', 
            city: patient.city || '', 
            origin: patient.origin || '', 
            protocol: patient.protocol || '', 
            notes: patient.notes || ''
        });
      } else {
        setFormData({ full_name: '', phone: '', whatsapp: '', email: '', birth_date: '', gender: '', cpf: '', address: '', city: '', origin: '', protocol: '', notes: '' }); 
      }
  }, [patient, open]);
  
  const handleSubmit = (e) => { 
      e.preventDefault(); 
      // Validação simples: Nome obrigatório
      if (!formData.full_name || formData.full_name.trim() === "") {
          toast.error("O nome do paciente é obrigatório.");
          return;
      }
      onSave(formData); 
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{patient ? 'Editar' : 'Novo'} Paciente</DialogTitle><DialogDescription className="hidden">Formulário</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome *</Label><Input value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} required/></div>
            <div><Label>Telefone</Label><Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
            <div><Label>Whatsapp</Label><Input value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} placeholder="(00) 00000-0000" /></div>
            <div><Label>Email</Label><Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}/></div>
            <div><Label>Nascimento</Label><Input type="date" value={formData.birth_date} onChange={e => setFormData({...formData, birth_date: e.target.value})}/></div>
            <div><Label>Gênero</Label><Select value={formData.gender} onValueChange={v => setFormData({...formData, gender: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Origem</Label><Select value={formData.origin} onValueChange={v => setFormData({...formData, origin: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
            <div className="col-span-2 grid grid-cols-3 gap-4">
                <div className="col-span-2"><Label>Endereço</Label><Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})}/></div>
                <div><Label>Cidade</Label><Input value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="Ex: São Paulo"/></div>
            </div>
            <div className="col-span-2"><Label>CPF</Label><Input value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})}/></div>
            <div className="col-span-2"><Label>Protocolo</Label><Textarea value={formData.protocol} onChange={e => setFormData({...formData, protocol: e.target.value})}/></div>
            <div className="col-span-2"><Label>Notas (Gerais)</Label><Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}/></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}