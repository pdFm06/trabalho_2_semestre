# Inicialização do projeto com Docker

## 1. Pré-requisitos

Antes de iniciar o projeto, garante que tens instalado:

- Docker
- Docker Compose

## 2. Extrair o projeto

```bash
unzip cloud_segura.zip
cd cloud_segura
```

## 3. Configurar variáveis de ambiente

Cria o ficheiro `.env` na raiz do projeto, com base no `example.env`:

```bash
cp example.env .env
```

Depois, edita o ficheiro `.env` e confirma que as variáveis da base de dados, keyserver, MinIO, JWT e SMTP estão preenchidas.

## 4. Construir e iniciar os containers

Na raiz do projeto, executa:

```bash
docker compose up --build
```

Para correr em segundo plano:

```bash
docker compose up --build -d
```

## 5. Aceder à aplicação

Depois dos containers arrancarem, abre no browser:

```text
http://localhost:8080
```

O backend fica disponível em:

```text
http://localhost:8000
```

O keyserver fica disponível em:

```text
http://localhost:9002
```

## 6. Parar o projeto

Para parar os containers:

```bash
docker compose down
```

## 7. Reiniciar tudo do zero

Se alteraste passwords no `.env`, modelos da base de dados ou queres limpar todos os dados, usa:

```bash
docker compose down -v
docker compose up --build
```

Atenção: o comando `-v` apaga os volumes Docker, incluindo bases de dados e dados guardados no MinIO.

## 8. Aceder às bases de dados pelo pgAdmin

Caso seja necessário aceder às bases de dados através do pgAdmin, descomenta temporariamente as portas do serviço `pgadmin` no ficheiro `compose.yaml`.

Depois, inicia novamente os containers e acede ao pgAdmin no browser. Autentica-te com as credenciais definidas no ficheiro `.env`.

Ao adicionar um novo servidor no pgAdmin, na aba **Connection**, usa os seguintes hostnames:

```text
Base de dados principal:
hostname: db

Base de dados do keyserver:
hostname: keydb
```

Depois, preenche os restantes campos com as credenciais definidas no ficheiro `.env`.

Após a ligação, as tabelas da aplicação deverão estar disponíveis.

## 9. Ver logs

Para ver todos os logs:

```bash
docker compose logs -f
```

Para ver logs de um serviço específico:

```bash
docker compose logs -f backend
```

Exemplos:

```bash
docker compose logs -f frontend
docker compose logs -f keyserver
docker compose logs -f db
docker compose logs -f keydb
```

## 10. Comandos úteis

Ver containers ativos:

```bash
docker compose ps
```

Reconstruir sem cache:

```bash
docker compose build --no-cache
```

Atualizar imagens base:

```bash
docker compose pull
docker compose up --build
```
