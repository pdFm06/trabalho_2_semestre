import hashlib # Usada para calcular hashes
# Importa váris elementos do FastAPI como erros HTTP, codigos HTTP, ler cabeçalhos HTTP
from fastapi import APIRouter, UploadFile, File as FastAPIFile, Depends, HTTPException, status, Form, Header
# Importa a sessão da base de dados
from sqlalchemy.orm import Session
# Necessário para fazer pedidos HTTP
from urllib import request, error
# Não está a ser usado
import io
# Importa a biblioteca responsável por devolver dados em streaming, para enviar o ficheiro por partes no download
from fastapi.responses import StreamingResponse
# Importar as configurações globais da aplicação, como o número de partes em que o ficheiro será dividido, o URL interno do keyserver   
from app.core.config import settings

# Importar o método de obter a base de dados
from app.db.database import get_db
# Importa o crud para fazer operações crud na bd
from app.db import crud
# Importa o modelo do Utilizador
from app.db.models import User
# Importa schemas Pydantic relacionadas com ficheiros e pastas
from app.schema.file_schema import FileResponse, File_Create, FolderCreate, FolderResponse, DriveResponse, FileMoveRequest
# Importa a função responsável por verificar o utilizador autenticado
from app.services.auth_service import get_current_user
# Importa a função que irá dividir o ficheiro por partes
from app.services.split_service import split_file
# Importa os métodos necessários para integrar com o MinIO
from app.storage.minio_client import upload_part, download_part, delete_part
# Importa a biblioteca para criar identificadores únicos
import uuid

# Criação do router e organiza na tag files para o Swagger UI
router = APIRouter(tags=["files"])

# Endpoint de upload
# A resposta deve seguir o schema FileResponse criada no ficheiro file_schema-py
@router.post("/upload", response_model=FileResponse)
# Função assincrona
async def upload_file(
    # Ficheiro enviado pelo frontend
    file: UploadFile = FastAPIFile(...),
    # IV usado na cifragem do ficheiro
    file_iv: str = Form(...),
    # Tamanho original antes da cifragem 
    original_file_size: int = Form(...),
    # Recebe a identificação da pasta do ficheiro, se for None é porque está na raíz
    folder_id: int | None = Form(default=None),
    # Recebe a sessão atual da bd
    db: Session = Depends(get_db),
    # Injeta o utilizador autenticado, desta forma apenas o utilizador autenticado pode enviar o ficheiro
    current_user: User = Depends(get_current_user),
):
    # Recebe um ficheiro já cifrado, divide-o em partes e guarda-as nas instâncias MinIO.
    # Lê o ficheiro
    data = await file.read()

    # Se não existir, emite um erro
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O ficheiro está vazio.",
        )

    # Se o tamanho for inferior a 0 é inválido
    if original_file_size < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tamanho original inválido.",
        )

    # Se o utilizador não tiver espaço, aparece um erro
    if (current_user.storage_used or 0) + len(data) > (current_user.storage_quota or 1_073_741_824):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Espaço de armazenamento insuficiente. Elimina ficheiros para libertar espaço.",
        )

    # Verifica se a paste de destino existe e pertence ao utilizador. Se não pertencer dá erro
    if folder_id is not None and not crud.get_folder_by_id_and_owner(db, folder_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pasta de destino não encontrada.",
        )

    # Calcular o hash do ficheiro cifrado
    file_hash = hashlib.sha256(data).hexdigest()

    # Gera um identificador único para o ficheiro no sistema de armazenamento
    file_storage_id = str(uuid.uuid4())

    # Divide o ficheiro em pedaçõs conforme o que foi estabelecido nas settings
    chunks = split_file(data, parts=settings.FILE_PARTS)

    # Cria um array para guardar as informações de cada parte enviada para o MinIO
    stored_parts = []

    # Preenche o array para cada pedaço preenchendo os metadados especificados
    for index, chunk in enumerate(chunks):
        part_info = upload_part(
            node_index=index,
            user_id=current_user.id,
            storage_id=file_storage_id,
            part_number=index,
            data=chunk,
            original_filename=file.filename or "ficheiro-sem-nome",
        )

        # Adiciona no array
        stored_parts.append(part_info)

    # Cria um objeto com os metadados necessários para registar o ficheiro na base de dados
    file_data = File_Create(
        # Nome do ficheiro
        filename=file.filename or "ficheiro-sem-nome",
        owner_id=current_user.id,
        folder_id=folder_id,
        parts=stored_parts, 
        encryption_mode="client-side-aes-256-gcm",
        file_iv=file_iv,
        file_size=len(data),
        original_file_size=original_file_size,
        file_hash=file_hash,
    )

    # Cria o registo na base de dados e devolve o resultado. Será feito segundo o schema FileResponse
    return crud.create_file(db=db, file_data=file_data)

# Endpoint de download
@router.get("/download/{file_id}")
def download_file(
    # ID do ficheiro a descarregar
    file_id: int,
    # Sessão com a base de dados
    db: Session = Depends(get_db),
    # Utilizador atual
    current_user: User = Depends(get_current_user),
):
    # Reconstrói o ficheiro cifrado a partir das partes guardadas e devolve-o ao cliente.
    # Procura o ficheiro na base de dados, garantido que pertence ao utilizador autneticado
    db_file = crud.get_file_by_id_and_owner(db, file_id=file_id, owner_id=current_user.id)

    # Se o ficheiro não existir, mostrar erro
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )

    # Função geradora para devolver os dados progressivamente
    def file_stream_generator():
        """Lê cada parte do ficheiro no MinIO e envia os bytes por streaming."""
        # Percorre a lista das partes guardadas na base de dados
        for part in db_file.parts:
            # Nome do bucket
            bucket = part.get("bucket")
            # Nome do objeto dentro do bucket
            object_name = part.get("object_name")
            # Identificador da instância MinIO onde a parte está guardada
            node_id = part.get("node_id")
            # Núemro da parte (chunk)
            part_number = part.get("part_number")
            # Descarrega a parte do MinIO e envia diretamente para a resposta HTTP
            yield download_part(
                bucket=bucket,
                object_name=object_name,
                node_id=node_id,
                part_number=part_number,
            )

    # Devolve uma resposta em streaming
    return StreamingResponse(
        # Usa a função geradora como fonte de bytes
        file_stream_generator(),
        # Define de conteúdo como binário genérico
        media_type="application/octet-stream",
        # Faz o browser tratar a resposta como anexo descarregável e sugere o nome do ficheiro
        headers={"Content-Disposition": f'attachment; filename="{db_file.filename}"'},
    )


# Endpoint para listar ficheiros
@router.get("/files", response_model=list[FileResponse])
def get_my_files(
    # Recebe a sessão da bd
    db: Session = Depends(get_db),
    # Recebe a sessão do utilizador
    current_user: User = Depends(get_current_user),
):
    # Lista todos os ficheiros pertencentes ao utilizador autenticado.
    return crud.get_files_by_owner(db=db, owner_id=current_user.id)

# Endpoint da drive - Devolve o conteúdo da drive
@router.get("/drive", response_model=DriveResponse)
def get_drive_folder(
    # Identificador da drive (opcional)
    folder_id: int | None = None,
    # Sessão da bd
    db: Session = Depends(get_db),
    # Sessão do utilizador atual
    current_user: User = Depends(get_current_user),
):
    # Devolve o conteúdo da pasta atual da Drive, incluindo breadcrumbs, pastas e ficheiros.
    # Começa na raiz
    current_folder = None
    # Se náo estiver na raíz
    if folder_id is not None:
        # Procruar pasta atual
        current_folder = crud.get_folder_by_id_and_owner(db, folder_id, current_user.id)
        # Se não encontrar,emite um erro
        if not current_folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pasta não encontrada.",
            )

    # Retorna um dicionário que segue o DriveResponse
    return {
        "current_folder": current_folder, #Pasta atual
        # Caminho hierárquico até à pasta atual
        "breadcrumbs": crud.get_folder_breadcrumbs(db, current_folder, current_user.id),
        # Subpastas da pasta atual
        "folders": crud.get_folders_by_owner_and_parent(db, current_user.id, folder_id),
        # Ficheiros da pasta atual
        "files": crud.get_files_by_owner_and_folder(db, current_user.id, folder_id),
    }

# Endpoint para listar pastas, a resposta será uma lista
@router.get("/folders", response_model=list[FolderResponse])
def list_folders(
    # Sessão da BD
    db: Session = Depends(get_db),
    # Sessão do utilizador
    current_user: User = Depends(get_current_user),
):
    # Lista todas as pastas do utilizador autenticado.
    return crud.get_folders_by_owner(db, current_user.id)

# Endpoint para criar pastas, a resposta será segundo a schema FolderResponse, o código de sucesso será 201
@router.post("/folders", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(
    # Recebe o corpo do pedido com os dados da pasta
    folder_data: FolderCreate,
    # Recebe a sessão da bd
    db: Session = Depends(get_db),
    # Recebe a sessão do utilizador
    current_user: User = Depends(get_current_user),
):
    # Cria uma nova pasta para o utilizador autenticado.
    # Se uma pasta tiver uma pasta-pai, verifica se essa pasta pai existe e pertence ao utilizador
    if folder_data.parent_id is not None and not crud.get_folder_by_id_and_owner(db, folder_data.parent_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pasta pai não encontrada.",
        )

    try:
        # Chama a função crud, responsável por criar a pasta na bd
        return crud.create_folder(
            # Recebe a sessão da bd
            db=db,
            # O ID do dono
            owner_id=current_user.id,
            # Nome da pasta
            name=folder_data.name,
            # Pasta pai
            parent_id=folder_data.parent_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

# Endpoint para apagar pasta
@router.delete("/folders/{folder_id}")
def delete_folder(
    # Recebe o id da pasta
    folder_id: int,
    # Recebe a sessão da bd
    db: Session = Depends(get_db),
    # Recebe a sessão do utilizador
    current_user: User = Depends(get_current_user),
):
    # Elimina uma pasta vazia pertencente ao utilizador autenticado.
    # Procurar a pasta e verifica se só pertence ao utilziador
    folder = crud.get_folder_by_id_and_owner(db, folder_id, current_user.id)
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pasta não encontrada.",
        )

    # Se a pasta tiver pastas filha ou ficheiros, então não apaga
    if crud.folder_has_children(db, current_user.id, folder_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pasta não está vazia. Apague ou mova primeiro os ficheiros e subpastas.",
        )

    # Apaga a pasta da bd
    deleted = crud.delete_folder(db, current_user.id, folder_id)
    # Devolve a resposta de confirmação
    return {"message": f"Pasta '{deleted.name}' eliminada com sucesso."}

# Endpoint para mover ficheiro, vai usar o file response como modelo
@router.patch("/files/{file_id}/move", response_model=FileResponse)
def move_file(
    # Recebe o id do ficheiro
    file_id: int,
    # Recebe os dados do pedido
    move_data: FileMoveRequest,
    # Sessão da bd
    db: Session = Depends(get_db),
    # Sessão do utilizador
    current_user: User = Depends(get_current_user),
):
    # Move um ficheiro para outra pasta ou para a raiz da Drive.
    try:
        # Chama o crud para mover o ficheiro na bd
        db_file = crud.move_file_to_folder(
            db=db,
            file_id=file_id,
            owner_id=current_user.id,
            folder_id=move_data.folder_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    # Se o ficheiro não for encontrado
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )

    return db_file

# Endpoint para marcar/desmarcar como favorito, usa fileresponse schema
@router.patch("/files/{file_id}/favorite", response_model=FileResponse)
def toggle_favorite(
    # Recebe o id do ficheiro
    file_id: int,
    # Recebe a sessão da bd
    db: Session = Depends(get_db),
    # Recebe o utilizador atual
    current_user: User = Depends(get_current_user),
):
    # Alterna o estado de favorito de um ficheiro do utilizador.
    # Procrua o ficheiro e altera o estado
    db_file = crud.toggle_favorite(db, file_id=file_id, owner_id=current_user.id)
    # Se não existir -> erro
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )
    return db_file

# Função auxiliar para apagar chave no keyserver
def _delete_file_key_from_keyserver(file_id: int, authorization_header: str | None) -> bool:
    # Pede ao keyserver para remover a chave cifrada associada a um ficheiro apagado.
    # Se não houver autorização, retorna false
    if not authorization_header:
        return False

    # URL interno para apagar a chave
    # Remove uma barra adicional para prevenir erros
    url = f"{settings.KEYSERVER_INTERNAL_URL.rstrip('/')}/keys/{file_id}"
    # Cria uma requisição autorizada, com o URL anterior
    req = request.Request(
        url=url,
        method="DELETE",
        headers={"Authorization": authorization_header},
    )

    # Iniciar pedido de eliminição
    try:
        with request.urlopen(req, timeout=3) as response:
            return 200 <= response.status < 300
    except error.HTTPError as exc:
        return exc.code == status.HTTP_404_NOT_FOUND
    except Exception:
        return False

# Endpoint para apagar ficheiros
@router.delete("/delete")
def delete_file(
    file_id: int,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Apaga um ficheiro, remove as suas partes no MinIO e tenta apagar a chave no keyserver.
    # Obter o ficheiro pretendido
    db_file = crud.get_file_by_id_and_owner(db, file_id=file_id, owner_id=current_user.id)

    # Se nao existir, erro
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro não encontrado.",
        )

    # Fazer cópia das partes para apagar
    parts_to_delete = list(db_file.parts or [])
    # Nome do ficheiro
    filename = db_file.filename

    # APaga o registo do ficheiro na bd
    crud.delete_file(db, file_id=file_id, owner_id=current_user.id)

    # Lista de erros que possam surgir
    minio_errors = []
    
    # Apagar partes do MinIO
    for part in parts_to_delete:
        bucket = part.get("bucket")
        object_name = part.get("object_name")
        if bucket and object_name:
            try:
                delete_part(
                    bucket=bucket,
                    object_name=object_name,
                    node_id=part.get("node_id"),
                    part_number=part.get("part_number"),
                )
            except Exception as exc:
                minio_errors.append(f"{bucket}/{object_name}: {exc}")

    # Apagar a chave associada ao ficheiro
    key_deleted = _delete_file_key_from_keyserver(file_id, authorization)
    
    return {
        "message": f"Ficheiro '{filename}' eliminado com sucesso.",
        "keyserver_key_deleted": key_deleted,
        "minio_parts_deleted": len(parts_to_delete) - len(minio_errors),
        "minio_errors": minio_errors if minio_errors else None,
    }
