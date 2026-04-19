#!/usr/bin/env python3
import subprocess
import sys
import os

print("[v0] Iniciando instalação de dependências...")
print("[v0] Diretório de trabalho atual:", os.getcwd())

# Listar arquivos no diretório atual
files = os.listdir('.')
print("[v0] Arquivos no diretório:", files[:10])  # Mostrar primeiro 10

# Verificar se package.json existe no diretório atual
if os.path.exists('package.json'):
    print("[v0] package.json encontrado!")
    print("[v0] Executando npm ci...")
    
    # Executar npm ci
    result = subprocess.run(['npm', 'ci'], capture_output=True, text=True)
    
    print("[v0] STDOUT:", result.stdout[:500])
    if result.stderr:
        print("[v0] STDERR:", result.stderr[:500])
    
    if result.returncode == 0:
        print("[v0] Dependências instaladas com sucesso!")
    else:
        print("[v0] Erro na instalação:", result.returncode)
else:
    print("[v0] package.json NÃO encontrado no diretório atual")
    print("[v0] Procurando package.json...")
    
    # Procurar recursivamente
    for root, dirs, files in os.walk('.'):
        if 'package.json' in files:
            print(f"[v0] Encontrado em: {root}")
            os.chdir(root)
            print(f"[v0] Mudando para: {os.getcwd()}")
            result = subprocess.run(['npm', 'ci'], capture_output=True, text=True)
            print("[v0] Instalação concluída")
            break
