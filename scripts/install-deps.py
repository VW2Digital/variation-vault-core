import subprocess
import os
import sys

# Definir o diretório do projeto
project_dir = '/vercel/share/v0-project'

print(f'[v0] Diretório do projeto: {project_dir}')
print(f'[v0] Verificando se package.json existe...')

if not os.path.exists(os.path.join(project_dir, 'package.json')):
    print('[v0] Erro: package.json não encontrado!')
    sys.exit(1)

print('[v0] package.json encontrado!')
print('[v0] Alterando para o diretório do projeto...')

os.chdir(project_dir)

print('[v0] Executando: npm ci')
print('[v0] Isso pode levar alguns minutos...')

try:
    # Executar npm ci
    result = subprocess.run(['npm', 'ci'], capture_output=False, text=True)
    
    if result.returncode == 0:
        print('\n[v0] ✓ Todas as dependências foram instaladas com sucesso!')
        
        # Verificar node_modules
        if os.path.exists(os.path.join(project_dir, 'node_modules')):
            print('[v0] ✓ node_modules criado e verificado!')
            
            # Contar pacotes
            node_modules_count = len(os.listdir(os.path.join(project_dir, 'node_modules')))
            print(f'[v0] Total de pacotes instalados: {node_modules_count}')
    else:
        print('[v0] Erro: npm ci falhou!')
        sys.exit(1)
        
except Exception as e:
    print(f'[v0] Erro durante a instalação: {str(e)}')
    sys.exit(1)
