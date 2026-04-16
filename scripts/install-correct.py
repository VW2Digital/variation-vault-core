#!/usr/bin/env python3
import subprocess
import os
import sys

print("[v0] Iniciando instalação de dependências...")
print(f"[v0] Diretório de trabalho atual: {os.getcwd()}")

# Tentar vários caminhos possíveis
possible_paths = [
    "/vercel/share/v0-project",
    "/app",
    "/workspace",
    os.path.expanduser("~/variation-vault-core"),
]

project_dir = None

# Procurar o diretório com package.json
for path in possible_paths:
    if os.path.exists(path) and os.path.isfile(os.path.join(path, "package.json")):
        project_dir = path
        print(f"[v0] Encontrado package.json em: {project_dir}")
        break

if not project_dir:
    # Procurar recursivamente
    print("[v0] Procurando recursivamente por package.json...")
    for root, dirs, files in os.walk("/"):
        if "package.json" in files and "node_modules" not in root:
            if "variation-vault-core" in root or "v0-project" in root:
                project_dir = root
                print(f"[v0] Encontrado em: {project_dir}")
                break
        # Limitar a busca para não levar muito tempo
        if root.count(os.sep) > 5:
            break

if not project_dir:
    print("[v0] ERRO: package.json não encontrado!")
    sys.exit(1)

# Navegar para o diretório do projeto
os.chdir(project_dir)
print(f"[v0] Navegado para: {os.getcwd()}")

# Verificar se package.json existe
if not os.path.exists("package.json"):
    print("[v0] ERRO: package.json não existe!")
    sys.exit(1)

print("[v0] Iniciando npm ci...")
result = subprocess.run(["npm", "ci", "--legacy-peer-deps"], capture_output=False)

if result.returncode == 0:
    print("[v0] ✓ Dependências instaladas com sucesso!")
else:
    print(f"[v0] ✗ Erro ao instalar dependências (código: {result.returncode})")
    sys.exit(1)
