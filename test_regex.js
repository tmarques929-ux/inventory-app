const fs = require("fs");
const text = fs.readFileSync("src/pages/dashboard/ReportsTab.jsx", "utf8");
const regex = /    autoTable\(doc, \{\r?\n      startY: 160,\r?\n      head: \[\["Código", "Componente", "Quantidade", "Preço unitário", "Lead time \(dias\)"\]\],\r?\n      body: \(order\.itens \?\? \[\]\)\.map\(\(item\) => \[\r?\n        item\.item\?\.code \?\? "-",\r?\n        item\.item\?\.nome \?\? "Componente",\r?\n        Number\(item\.quantidade \?\? 0\)\.toLocaleString\("pt-BR"\),\r?\n        item\.precoUnitario !== null \? formatCurrency\(item\.precoUnitario\) : "-",\r?\n        item\.leadTimeDias \?\? "-",\r?\n      ]\),\r?\n    }\);/;
console.log('match autoTable:', regex.test(text));
