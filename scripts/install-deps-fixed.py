#!/usr/bin/env python3
import os
import subprocess
import sys

# Diretório correto do projeto
project_dir = "/vercel/share/v0-project"

print(f"[v0] Iniciando instalação de dependências...")
print(f"[v0] Diretório do projeto: {project_dir}")

# Verificar se o package.json existe
package_json = os.path.join(project_dir, "package.json")
if not os.path.exists(package_json):
    print(f"[v0] Erro: package.json não encontrado em {project_dir}")
    sys.exit(1)

print(f"[v0] package.json encontrado: {package_json}")

# Mudar para o diretório do projeto
os.chdir(project_dir)
print(f"[v0] Diretório atual: {os.getcwd()}")

# Executar npm ci
print(f"[v0] Executando 'npm ci' para instalar dependências...")
result = subprocess.run(["npm", "ci"], cwd=project_dir)

if result.returncode == 0:
    print(f"[v0] Dependências instaladas com sucesso!")
    sys.exit(0)
else:
    print(f"[v0] Erro ao instalar dependências (código: {result.returncode})")
    sys.exit(1)
