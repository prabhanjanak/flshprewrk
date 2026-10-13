const fs = require('fs');
const content = fs.readFileSync('src/pages/ApplicationFormsPage.tsx', 'utf8');
const index = 4052;
const lines = content.substring(0, index).split('\n');
console.log(`Line: ${lines.length}, Column: ${lines[lines.length - 1].length}`);
console.log('Snippet around index:');
console.log(content.substring(index - 50, index + 50));
