import fs from 'fs';
import path from 'path';

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });

  return arrayOfFiles;
}

const srcDir = path.resolve('src');
const files = getAllFiles(srcDir);

files.forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    let content = fs.readFileSync(file, 'utf8');
    const relativeDir = path.relative(path.dirname(file), srcDir);
    const prefix = relativeDir === '' ? '.' : relativeDir.replace(/\\/g, '/');
    
    // Replace @/ with relative path
    // We need to be careful with @/ appearing in strings that are not imports, 
    // but usually in this project @/ is used for aliases.
    const newContent = content.replace(/from "@\//g, `from "${prefix}/`)
                              .replace(/import\("@\//g, `import("${prefix}/`);
    
    if (content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log(`Updated: ${file}`);
    }
  }
});
