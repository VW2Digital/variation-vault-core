import subprocess
import os
import sys

print("[v0] Iniciando instalação de dependências...")

# O diretório atual é onde o package.json está
project_dir = os.getcwd()
print(f"[v0] Diretório do projeto: {project_dir}")

# Verificar se package.json existe
if not os.path.exists(os.path.join(project_dir, 'package.json')):
    print(f"[v0] Erro: package.json não encontrado em {project_dir}")
    sys.exit(1)

print(f"[v0] package.json encontrado em: {project_dir}")

# Executar npm ci para instalar as dependências com as versões exatas
print("[v0] Executando: npm ci")
try:
    result = subprocess.run(['npm', 'ci'], cwd=project_dir, capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print(f"[v0] Stderr: {result.stderr}")
    
    if result.returncode == 0:
        print("[v0] Dependências instaladas com sucesso!")
    else:
        print(f"[v0] Erro na instalação (código: {result.returncode})")
        sys.exit(result.returncode)
except Exception as e:
    print(f"[v0] Erro ao executar npm ci: {e}")
    sys.exit(1)

# Verificar se node_modules foi criado
if os.path.exists(os.path.join(project_dir, 'node_modules')):
    print("[v0] node_modules criado com sucesso!")
    num_dirs = len(os.listdir(os.path.join(project_dir, 'node_modules')))
    print(f"[v0] Total de pacotes instalados: {num_dirs}")
else:
    print("[v0] Aviso: node_modules não foi criado")

print("[v0] Instalação concluída!")
