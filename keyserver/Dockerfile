# Define a imagem base usada pelo container.
FROM python:3.12-slim

# Define a diretoria de trabalho dentro do container.
WORKDIR /app

# Copia a lista de dependências Python.
COPY requirements.txt .

# Instala as dependências da aplicação.
RUN pip install --no-cache-dir -r requirements.txt

# Copia ficheiros da aplicação para a imagem.
COPY . .

# Arranca o serviço principal do container.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
