import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import PatientModal from './PatientModal'; // Certifique-se que o import está certo

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Controle do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState(null);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setLoading(true);
    try {
      // Busca TODOS os campos (*) para evitar erro de coluna faltando
      const { data, error } = await supabase
        .from('patients')
        .select('*') 
        .order('full_name', { ascending: true });

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Erro ao buscar pacientes:', error);
      alert('Erro ao carregar lista.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este paciente?')) return;

    try {
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchPatients(); // Atualiza a lista
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir paciente.');
    }
  };

  const handleEdit = (patient) => {
    setPatientToEdit(patient);
    setIsModalOpen(true);
  };

  const handleNewPatient = () => {
    setPatientToEdit(null);
    setIsModalOpen(true);
  };

  // Função para calcular idade
  const calculateAge = (birthDateString) => {
    if (!birthDateString) return '-';
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age + ' anos';
  };

  // Filtragem (Busca)
  const filteredPatients = patients.filter(patient =>
    patient.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (patient.cpf && patient.cpf.includes(searchTerm)) ||
    (patient.phone && patient.phone.includes(searchTerm))
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Pacientes</h1>
        <button
          onClick={handleNewPatient}
          className="bg-pink-600 text-white px-6 py-2 rounded-lg hover:bg-pink-700 transition shadow-md"
        >
          + Novo Paciente
        </button>
      </div>

      {/* Barra de Busca */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Buscar por nome, CPF ou telefone..."
          className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-pink-500 outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-10 text-gray-500">Carregando pacientes...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-4 text-sm font-semibold text-gray-600">Nome</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Idade</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Telefone</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Cidade</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPatients.length > 0 ? (
                filteredPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 font-medium text-gray-800">{patient.full_name}</td>
                    <td className="p-4 text-gray-600">{calculateAge(patient.birth_date)}</td>
                    <td className="p-4 text-gray-600">{patient.phone || '-'}</td>
                    <td className="p-4 text-gray-600">{patient.city || '-'}</td>
                    <td className="p-4 flex gap-2">
                      <button
                        onClick={() => handleEdit(patient)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(patient.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-semibold"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-gray-500">
                    Nenhum paciente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Cadastro/Edição */}
      <PatientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={() => {
          fetchPatients(); // Recarrega a lista após salvar
          // O modal fecha sozinho pelo onClose interno ou podemos forçar aqui se precisar
        }}
        patientToEdit={patientToEdit}
      />
    </div>
  );
}