import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { quotesAPI } from '../services/api';

import Step1OrderData from '../components/forms/quote/Step1OrderData';
import Step2Materials from '../components/forms/quote/Step2Materials';
import Step3Processes from '../components/forms/quote/Step3Processes';
import Step4Pricing from '../components/forms/quote/Step4Pricing';
import Step5Summary from '../components/forms/quote/Step5Summary';

const STEPS = [
  { id: 1, label: 'Pedido', shortLabel: '1' },
  { id: 2, label: 'Matéria-Prima', shortLabel: '2' },
  { id: 3, label: 'Processos', shortLabel: '3' },
  { id: 4, label: 'Precificação', shortLabel: '4' },
  { id: 5, label: 'Resumo', shortLabel: '5' },
];

export default function NewQuotePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    // Step 1 — dados do pedido
    clientId:       null,
    clientName:     '',
    clientSegment:  '',
    clientCnpj:     null,
    reference:      '',
    productName:    '',
    itemType:       '',
    quantity:       1,
    urgent:         false,
    orderType:      'RETAIL',
    sizes:          [],
    erpProductData: null,
    erpMarkup:         null,
    markupCoeficiente: null,
    markupSource:      'MANUAL',
    erpSalePrice:      null,
    hasStale:          false,

    // Step 2 — matéria-prima (populado ao buscar produto no ERP)
    materials: [],

    // Step 3 — processos (fabricação do ERP + bordado + estampa)
    fabricationItems:    [],
    embroideryPoints:    0,
    embroideryPricePerK: 0.9,
    embroideryCost:      0,
    embroideryStatus:    'NOT_APPLICABLE',
    embroideryJobId:     null,
    hasPrint:            false,
    printType:           null,
    printWidthCm:        0,
    printHeightCm:       0,
    printColors:         1,
    printCost:           0,
    printCostPerPiece:   0,

    // Step 4 — precificação
    markup:        65,
    markupSource:  'MANUAL',
    discount:      0,

    notes: '',
  });

  const update = (fields) => setFormData((prev) => ({ ...prev, ...fields }));

  const handleNext = () => setStep((s) => Math.min(s + 1, 5));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const { data } = await quotesAPI.create(formData);
      toast.success(`Rascunho ${data.quote.number} salvo!`);
      navigate(`/quotes/${data.quote.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar rascunho.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    setSaving(true);
    try {
      const { data: createdData } = await quotesAPI.create(formData);
      await quotesAPI.submit(createdData.quote.id);
      toast.success(`Orçamento ${createdData.quote.number} enviado para aprovação!`);
      navigate('/quotes');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao submeter orçamento.');
    } finally {
      setSaving(false);
    }
  };

  const stepProps = { data: formData, update, onNext: handleNext, onBack: handleBack };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Novo Orçamento</h1>
        <p className="text-sm text-gray-500 mt-0.5">Preencha as informações em {STEPS.length} etapas</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => step > s.id && setStep(s.id)}
              className={`flex items-center gap-2 ${step > s.id ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                step === s.id
                  ? 'bg-orange-600 text-white'
                  : step > s.id
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {step > s.id ? '✓' : s.id}
              </div>
              <span className={`text-sm font-medium hidden sm:block ${
                step === s.id ? 'text-orange-600' : 'text-gray-500'
              }`}>
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 ${step > s.id ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="card p-6">
        {step === 1 && <Step1OrderData {...stepProps} />}
        {step === 2 && <Step2Materials {...stepProps} />}
        {step === 3 && <Step3Processes {...stepProps} />}
        {step === 4 && <Step4Pricing {...stepProps} />}
        {step === 5 && (
          <Step5Summary
            {...stepProps}
            saving={saving}
            onSaveDraft={handleSaveDraft}
            onSubmit={handleSubmitForApproval}
          />
        )}
      </div>
    </div>
  );
}
