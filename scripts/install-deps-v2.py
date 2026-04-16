import subprocess
import sys
import os

print("[v0] Iniciando instalação de dependências...")
print(f"[v0] Diretório de trabalho: {os.getcwd()}")

try:
    # Executar npm ci para instalar as dependências exatas do package-lock.json
    result = subprocess.run(
        ["npm", "ci"],
        cwd="/vercel/share/v0-project",
        capture_output=True,
        text=True,
        timeout=300
    )
    
    print("[v0] STDOUT:")
    print(result.stdout)
    
    if result.stderr:
        print("[v0] STDERR:")
        print(result.stderr)
    
    print(f"[v0] Código de saída: {result.returncode}")
    
    if result.returncode == 0:
        print("[v0] Dependências instaladas com sucesso!")
    else:
        print("[v0] Erro na instalação!")
        sys.exit(1)
        
except Exception as e:
    print(f"[v0] Erro: {str(e)}")
    sys.exit(1)
