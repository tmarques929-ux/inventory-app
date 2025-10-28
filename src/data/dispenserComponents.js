const DEFAULT_STORAGE = '';

const baseComponents = [
  { quantityPerAssembly: 3, value: 'B5817WS-TP', package: 'SOD-323', description: 'Diodo Schottky 20V 1A', includeInProject: false },
  { quantityPerAssembly: 1, value: 'MCP1700T-3302E/TT', package: 'SOT-23-5', description: 'Regulador LDO 250mA', includeInProject: false },
  { quantityPerAssembly: 1, value: 'PIC12F1571-I/SN', package: 'SOIC-8', description: 'Microcontrolador PIC12F1571', includeInProject: false },
  { quantityPerAssembly: 1, value: 'IQS127D-000000TSR', package: 'TSOT-23-6', description: 'Sensor capacitivo IQS127D', includeInProject: false },
  { quantityPerAssembly: 2, value: 'MMZ1608R102A', package: '0603', description: 'Ferrite bead 1k ohm @100MHz', includeInProject: false },
  { quantityPerAssembly: 2, value: 'BSS806N', package: 'SOT-23', description: 'MOSFET N-Channel', includeInProject: false },
  { quantityPerAssembly: 1, value: 'MMBZ10VAL', package: 'SOT-23', description: 'Diodo TVS 10V', includeInProject: false },
  { quantityPerAssembly: 1, value: 'CC, 1 uF 0805', package: 'C0805', description: 'Capacitor ceramico 1 uF 50V', includeInProject: false },
  { quantityPerAssembly: 4, value: 'CC, 100 pF 0805', package: 'C0805', description: 'Capacitor ceramico 100 pF 50V', includeInProject: false },
  { quantityPerAssembly: 1, value: 'CC, 100 nF 0805', package: 'C0805', description: 'Capacitor ceramico 100 nF 50V', includeInProject: false },
  { quantityPerAssembly: 1, value: '3k3 5% 0805', package: 'R0805', description: 'Resistor 3k3 5% 0805', includeInProject: false },
  { quantityPerAssembly: 5, value: '10k 5% 0805', package: 'R0805', description: 'Resistor 10k 5% 0805', includeInProject: false },
  { quantityPerAssembly: 1, value: '100k 5% 0805', package: 'R0805', description: 'Resistor 100k 5% 0805', includeInProject: false },
  { quantityPerAssembly: 1, value: '390k 5% 0805', package: 'R0805', description: 'Resistor 390k 5% 0805', includeInProject: false },
  { quantityPerAssembly: 1, value: '5k6 5% 0805', package: 'R0805', description: 'Resistor 5k6 5% 0805', includeInProject: false },
  { quantityPerAssembly: 4, value: '470R 5% 0805', package: 'R0805', description: 'Resistor 470 ohm 5% 0805', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Led vermelho 3mm alto brilho', description: 'LED 3mm vermelho alto brilho', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Chave tatil 6x6x9.5mm 90 graus 4 terminais', description: 'Chave tatil 90 graus 4 terminais', includeInProject: false },
  { quantityPerAssembly: 0.2, value: 'Barra de pinos 1x40 90 graus 10mm', description: 'Barra de pinos 1x40 90 graus 10mm', notes: 'Consumo estimado por placa', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Placa de Circuito Dispenser de Papel', description: 'PCB Dispenser de Papel', includeInProject: false },
  { quantityPerAssembly: 1, value: 'CC, 20 pF 0805', package: 'C0805', description: 'Capacitor ceramico 20 pF 0805', includeInProject: false },
  { quantityPerAssembly: 2, value: '6k8 5% 0805', package: 'R0805', description: 'Resistor 6k8 5% 0805', includeInProject: false },
  { quantityPerAssembly: 1, value: 'IQS227B-000400008-TSR', package: 'TSOT-23-6', description: 'Sensor capacitivo IQS227B', includeInProject: true },
  { quantityPerAssembly: 5, value: 'CC, 1 uF 0603', package: 'C0603', description: 'Capacitor ceramico 1 uF 0603', includeInProject: true },
  { quantityPerAssembly: 4, value: 'CC, 100 pF 0603', package: 'C0603', description: 'Capacitor ceramico 100 pF 0603', includeInProject: true },
  { quantityPerAssembly: 4, value: 'CC, 100 nF 0603', package: 'C0603', description: 'Capacitor ceramico 100 nF 0603', includeInProject: true },
  { quantityPerAssembly: 5, value: 'CC, 10 nF 0603', package: 'C0603', description: 'Capacitor ceramico 10 nF 0603', includeInProject: true },
  { quantityPerAssembly: 1, value: '3k3 5% 0603', package: 'R0603', description: 'Resistor 3k3 5% 0603', includeInProject: true },
  { quantityPerAssembly: 2, value: '10k 5% 0603', package: 'R0603', description: 'Resistor 10k 5% 0603', includeInProject: true },
  { quantityPerAssembly: 1, value: '150k 5% 0603', package: 'R0603', description: 'Resistor 150k 5% 0603', includeInProject: true },
  { quantityPerAssembly: 1, value: '390k 5% 0603', package: 'R0603', description: 'Resistor 390k 5% 0603', includeInProject: true },
  { quantityPerAssembly: 1, value: '470R 5% 0603', package: 'R0603', description: 'Resistor 470 ohm 5% 0603', includeInProject: true },
  { quantityPerAssembly: 2, value: '6k8 5% 0603', package: 'R0603', description: 'Resistor 6k8 5% 0603', includeInProject: true },
  { quantityPerAssembly: 1, value: 'PIC18F26Q10T-I/SS', package: 'SSOP-28', description: 'Microcontrolador PIC18F26Q10', includeInProject: false },
  { quantityPerAssembly: 1, value: 'HDSP-433G', description: 'Display 7 segmentos verde', includeInProject: false },
  { quantityPerAssembly: 1, value: 'PEC11H-4120F-S0020', description: 'Encoder rotativo PEC11H-4120F-S0020', includeInProject: false },
  { quantityPerAssembly: 1, value: 'LM22677TJ-ADJ/NOPB', description: 'Regulador LM22677 ajustavel', includeInProject: false },
  { quantityPerAssembly: 1, value: 'LM321LVIDBVR', package: 'SOT-23-5', description: 'Amplificador operacional LM321', includeInProject: false },
  { quantityPerAssembly: 1, value: 'TPS560430X3FDBVR', package: 'SOT-23-6', description: 'Conversor buck TPS560430', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Indutor 0.22 uH', description: 'Indutor 0.22 uH', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Indutor 10 uH SNR6045', description: 'Indutor SNR6045 10 uH', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Indutor 15 uH', description: 'Indutor 15 uH', includeInProject: false },
  { quantityPerAssembly: 1, value: 'B540C-13-F', description: 'Diodo Schottky B540C', includeInProject: false },
  { quantityPerAssembly: 1, value: 'SZ1SMB24AT3G', description: 'Diodo TVS 24V', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor 4.7 uF', description: 'Capacitor 4.7 uF', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor 15 uF', description: 'Capacitor 15 uF', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor 22 uF', description: 'Capacitor 22 uF', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor eletrolitico 39 uF', description: 'Capacitor eletrolitico 39 uF', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor eletrolitico 270 uF polimero', description: 'Capacitor eletrolitico 270 uF polimero', includeInProject: false },
  { quantityPerAssembly: 1, value: 'BC847BLT1G', description: 'Transistor BC847', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Resistor 0.22 ohm 1% 0603', package: 'R0603', description: 'Resistor 0.22 ohm 1% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '470k 5% 0603', package: 'R0603', description: 'Resistor 470k 5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '220k 5% 0603', package: 'R0603', description: 'Resistor 220k 5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '180k 5% 0603', package: 'R0603', description: 'Resistor 180k 5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '1k 5% 0603', package: 'R0603', description: 'Resistor 1k 5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '83.5 ohm 0.5% 0603', package: 'R0603', description: 'Resistor 83.5 ohm 0.5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '96.5 ohm 0.5% 0603', package: 'R0603', description: 'Resistor 96.5 ohm 0.5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '10 ohm 1% 0603', package: 'R0603', description: 'Resistor 10 ohm 1% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '1.5k 5% 0603', package: 'R0603', description: 'Resistor 1.5k 5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '100 ohm 5% 0603', package: 'R0603', description: 'Resistor 100 ohm 5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: '4.7k 5% 0603', package: 'R0603', description: 'Resistor 4.7k 5% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Conector P8 2.5 mm', description: 'Conector P8 2.5 mm', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Conector P10', description: 'Conector P10', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Placa de Circuito Controladora 222', description: 'PCB Controladora 222', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Resistor 22k 5% 1206', package: 'R1206', description: 'Resistor 22k 5% 1206', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor eletrolitico 220 uF', description: 'Capacitor eletrolitico 220 uF', includeInProject: false },
  { quantityPerAssembly: 1, value: 'PIC18F24Q10-I/SS', package: 'SSOP-28', description: 'Microcontrolador PIC18F24Q10', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Display 7 segmentos 3 digitos vermelho', description: 'Display 7 segmentos vermelho', includeInProject: false },
  { quantityPerAssembly: 1, value: 'LMR14050SDDAR', description: 'Conversor buck LMR14050', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Indutor 1.5 uH', description: 'Indutor 1.5 uH', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Indutor 33 uH', description: 'Indutor 33 uH', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Indutor 100 nH 0603', package: '0603', description: 'Indutor 100 nH 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor 2.2 uF 0603', package: 'C0603', description: 'Capacitor ceramico 2.2 uF 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Resistor 24k 1% 0603', package: 'R0603', description: 'Resistor 24k 1% 0603', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Fusivel 0.5A', description: 'Fusivel 0.5 A', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Fusivel 10A', description: 'Fusivel 10 A', includeInProject: false },
  { quantityPerAssembly: 1, value: '1N4007', description: 'Diodo retificador 1N4007', includeInProject: false },
  { quantityPerAssembly: 1, value: '1N4148', description: 'Diodo sinal 1N4148', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Lacre garantia', description: 'Lacre de garantia', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Suporte para 2 pilhas AAA', description: 'Suporte para pilhas AAA', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Pilha AAA', description: 'Pilha AAA', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Placa de Circuito Delay Climatizador', description: 'PCB Circuito Delay Climatizador', includeInProject: false },
  { quantityPerAssembly: 1, value: 'BC547', description: 'Transistor BC547', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Rele 12V', description: 'Rele 12V', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Diodo Zener 1N4742A', description: 'Diodo zener 12V 1W', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor eletrolitico 100 uF 16V', description: 'Capacitor eletrolitico 100 uF 16V', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Resistor 3k3 5% 1/4W', description: 'Resistor 3k3 5% 1/4W', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor eletrolitico 1000 uF 16V', description: 'Capacitor eletrolitico 1000 uF 16V', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Capacitor 1 uF 400V', description: 'Capacitor 1 uF 400V', includeInProject: false },
  { quantityPerAssembly: 1, value: 'Placa de Circuito NTC', description: 'PCB Circuito NTC', includeInProject: false },
  { quantityPerAssembly: 6, value: 'Borne KRE 2 vias', description: 'Borne KRE 2 vias', includeInProject: false },
  { quantityPerAssembly: 8, value: 'BC848-B', description: 'Transistor BC848 SMD', includeInProject: false },
  { quantityPerAssembly: 2, value: 'LM317', description: 'Regulador ajustavel LM317', includeInProject: false },
  { quantityPerAssembly: 4, value: 'Trimpot 10K', description: 'Trimpot 10K', includeInProject: false },
  { quantityPerAssembly: 4, value: 'Rele 5V', description: 'Rele 5V', includeInProject: false },
  { quantityPerAssembly: 4, value: 'Diodo 4148 SMD', description: 'Diodo 1N4148 SMD', includeInProject: false },
];

const makeInventoryName = (component) => component.value;

const buildDescription = (component) => {
  const segments = [
    component.description,
    component.package ? `Pacote: ${component.package}` : null,
    component.notes ? component.notes : null,
  ].filter(Boolean);

  return segments.join(' | ');
};

const numberedComponents = baseComponents.map((component, index) => ({
  ...component,
  code: String(index + 1).padStart(3, '0'),
}));

export const inventorySeedComponents = numberedComponents.map((component) => ({
  ...component,
  inventoryName: makeInventoryName(component),
  inventoryDescription: buildDescription(component),
  initialStock: component.initialStock ?? 0,
  storageLocation: component.storageLocation ?? DEFAULT_STORAGE,
}));

const dispenserProjectValues = [
  'IQS227B-000400008-TSR',
  'CC, 1 uF 0603',
  'CC, 100 pF 0603',
  'CC, 100 nF 0603',
  'CC, 10 nF 0603',
  '3k3 5% 0603',
  '10k 5% 0603',
  '150k 5% 0603',
  '390k 5% 0603',
  '470R 5% 0603',
  '6k8 5% 0603',
];

export const dispenserProjectComponents = dispenserProjectValues
  .map((value) => {
    const component = inventorySeedComponents.find((item) => item.value === value);
    return component ? { ...component } : null;
  })
  .filter(Boolean);

const delayProjectDefinition = [
  { value: 'Placa de Circuito Delay Climatizador', quantityPerAssembly: 1 },
  { value: 'BC547', quantityPerAssembly: 1 },
  { value: 'Rele 12V', quantityPerAssembly: 1 },
  { value: '1N4007', quantityPerAssembly: 6 },
  { value: 'Diodo Zener 1N4742A', quantityPerAssembly: 1 },
  { value: 'Capacitor eletrolitico 100 uF 16V', quantityPerAssembly: 1 },
  { value: 'Resistor 3k3 5% 1/4W', quantityPerAssembly: 1 },
  { value: 'Capacitor eletrolitico 1000 uF 16V', quantityPerAssembly: 1 },
  { value: 'Capacitor 1 uF 400V', quantityPerAssembly: 1 },
];

export const delayProjectComponents = delayProjectDefinition
  .map(({ value, quantityPerAssembly }) => {
    const component = inventorySeedComponents.find((item) => item.value === value);
    return component ? { ...component, quantityPerAssembly } : null;
  })
  .filter(Boolean);

const ntcProjectDefinition = [
  { value: 'Placa de Circuito NTC', quantityPerAssembly: 1 },
  { value: 'Borne KRE 2 vias', quantityPerAssembly: 6 },
  { value: 'BC848-B', quantityPerAssembly: 8 },
  { value: 'LM317', quantityPerAssembly: 2 },
  { value: 'Trimpot 10K', quantityPerAssembly: 4 },
  { value: 'Rele 5V', quantityPerAssembly: 4 },
  { value: 'Diodo 4148 SMD', quantityPerAssembly: 4 },
  { value: '1k 5% 0603', quantityPerAssembly: 2 },
  { value: 'CC, 1 uF 0603', quantityPerAssembly: 4 },
  { value: '4.7k 5% 0603', quantityPerAssembly: 6 },
  { value: 'Led vermelho 3mm alto brilho', quantityPerAssembly: 4 },
];

export const ntcProjectComponents = ntcProjectDefinition
  .map(({ value, quantityPerAssembly }) => {
    const component = inventorySeedComponents.find((item) => item.value === value);
    return component ? { ...component, quantityPerAssembly } : null;
  })
  .filter(Boolean);

export const dispenserProjectMetadata = {
  name: 'Dispenser de Papel',
  customer: 'Empresa Grifit',
  finishedBoardCode: 'WLT-DISP-PRD-001',
  pcbVersion: 'v1.0',
  softwareName: 'Firmware Dispenser',
  softwareFilePath: null,
  gerberName: '',
  gerberFilePath: null,
  notes:
    'Projeto inicial do dispenser de papel. Itens em destaque correspondem a revisao com sensor IQS227B.',
  observation:
    'OBS: Em 10/04/2025 o capacitor de 20 pF 0805 foi substituido pelo capacitor de 100 pF 0603 para corrigir disparos do sensor IQS227B.',
};

export const delayProjectMetadata = {
  name: 'Circuito Delay Climatizador',
  customer: 'Empresa Grifit',
  finishedBoardCode: 'WLT-DELAY-PRD-001',
  pcbVersion: 'v1.0',
  softwareName: 'Firmware Delay',
  softwareFilePath: null,
  gerberName: '',
  gerberFilePath: null,
  notes: 'Projeto de circuito de delay para climatizadores.',
  observation: '',
};

export const ntcProjectMetadata = {
  name: 'Circuito NTC',
  customer: 'NAS Engenharia',
  finishedBoardCode: 'WLT-NTC-PRD-001',
  pcbVersion: 'v1.0',
  softwareName: 'Firmware NTC',
  softwareFilePath: null,
  gerberName: '',
  gerberFilePath: null,
  notes: 'Projeto baseado em sensor NTC com alimentacao e atraso controlado.',
  observation: '',
};

export const projectDefinitions = [
  {
    id: 'dispenser',
    name: dispenserProjectMetadata.name,
    customer: dispenserProjectMetadata.customer,
    finishedBoardCode: dispenserProjectMetadata.finishedBoardCode,
    defaultValue: dispenserProjectMetadata.projectValue?.amount ?? 0,
  },
  {
    id: 'delay',
    name: delayProjectMetadata.name,
    customer: delayProjectMetadata.customer,
    finishedBoardCode: delayProjectMetadata.finishedBoardCode,
    defaultValue: delayProjectMetadata.projectValue?.amount ?? 0,
  },
  {
    id: 'ntc',
    name: ntcProjectMetadata.name,
    customer: ntcProjectMetadata.customer,
    finishedBoardCode: ntcProjectMetadata.finishedBoardCode,
    defaultValue: ntcProjectMetadata.projectValue?.amount ?? 0,
  },
];

export default inventorySeedComponents;


