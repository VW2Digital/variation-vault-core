#!/usr/bin/env python3
import subprocess
import os

# Define o diretório correto do projeto
project_dir = "/vercel/share/v0-project"

# Verifica se package.json existe
if not os.path.exists(os.path.join(project_dir, "package.json")):
    print(f"[v0] ERRO: package.json não encontrado em {project_dir}")
    exit(1)

print(f"[v0] Diretório do projeto: {project_dir}")
print(f"[v0] Iniciando instalação de dependências com npm ci...")

try:
    # Muda para o diretório do projeto
    os.chdir(project_dir)
    
    # Executa npm ci
    result = subprocess.run(
        ["npm", "ci"],
        cwd=project_dir,
        capture_output=True,
        text=True,
        timeout=300
    )
    
    if result.returncode == 0:
        print(f"[v0] Dependências instaladas com sucesso!")
        print(f"[v0] Output:\n{result.stdout}")
    else:
        print(f"[v0] ERRO na instalação!")
        print(f"[v0] stdout:\n{result.stdout}")
        print(f"[v0] stderr:\n{result.stderr}")
        exit(result.returncode)

except Exception as e:
    print(f"[v0] ERRO: {str(e)}")
    exit(1)
