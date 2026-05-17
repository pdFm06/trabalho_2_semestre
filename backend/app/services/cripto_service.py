import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes

# ---------------------------------------------------------------------------
# AES-256 em modo GCM (Galois/Counter Mode)
# ---------------------------------------------------------------------------

KEY_SIZE = 32   # 256 bits → AES-256
IV_SIZE  = 12   # 96 bits  → tamanho recomendado para GCM
TAG_SIZE = 16   # 128 bits → tamanho padrão do tag GCM


def generate_key() -> bytes:
    """
    Gera uma chave AES-256 aleatória.

    os.urandom() usa o gerador de números aleatórios criptograficamente
    seguro do sistema operativo — não é o random() normal do Python,
    que não é seguro para criptografia.

    Devolve 32 bytes aleatórios (256 bits).
    """
    return os.urandom(KEY_SIZE)


def encrypt_file(data: bytes, key: bytes) -> bytes:
    """
    Cifra os dados com AES-256-GCM.
    Devolve os bytes cifrados no formato: [IV (12)] + [tag (16)] + [ciphertext]
    """
    # gsera um IV novo e aleatório para cada ficheiro
    iv = os.urandom(IV_SIZE)

    # cria o objeto de cifra AES-GCM
    cipher = Cipher( #Cipher eh a biblioteca.
        algorithms.AES(key),   # algoritmo AES com a chave fornecida
        modes.GCM(iv),         # modo GCM com o IV gerado
        backend=default_backend() # 
    )

    encryptor = cipher.encryptor() # vai ate o cipher acima e encripta 

    # Cifra os dados
    ciphertext = encryptor.update(data) + encryptor.finalize() # encryptor.update(data)gera basicamente o plaintext cifrado. O encryptor.finalize() eh basicamente a tag gerada 

    # Guardamos tudo junto: IV + tag + dados cifrados
    return iv + encryptor.tag + ciphertext # o encryptor tag serve simplesmente para a gente acessar a tag, a tag n eh encriptada no GCM.


def decrypt_file(encrypted_data: bytes, key: bytes) -> bytes:
    """
    Decifra os dados com AES-256-GCM.

    Devolve os bytes originais do ficheiro.
    """
    # Extrai cada componente pela sua posição conhecida
    iv         = encrypted_data[:IV_SIZE]                        # bytes 0 a 11 ou do inicio ate o 12 
    tag        = encrypted_data[IV_SIZE:IV_SIZE + TAG_SIZE]      # bytes 12 a 28  IV_SIZE: 12 ---- IV_SIZE + TAG_SIZE = 28 
    ciphertext = encrypted_data[IV_SIZE + TAG_SIZE:]             # resto ou seja 28: 

    # Cria o objeto de decifra AES-GCM com o IV e tag extraídos
    cipher = Cipher(
        algorithms.AES(key),
        modes.GCM(iv, tag),    # o tag é passado aqui para verificação automática
        backend=default_backend()
    )

    decryptor = cipher.decryptor() 

    # Decifra e verifica integridade
    return decryptor.update(ciphertext) + decryptor.finalize()

# decryptor.update(ciphertext) - passa os dados cifrados → devolve os dados originais
# decryptor.finalize - termina a operação E verifica o tag


# ---------------------------------------------------------------------------
# RSA-2048 com padding OAEP 
# ---------------------------------------------------------------------------
# RSA é usado para proteger a file_key (chave AES) — nunca o ficheiro inteiro.
# Motivo: RSA só consegue cifrar dados pequenos (menor que o tamanho da chave).
# A file_key tem 32 bytes — perfeito para RSA.
#
# Padding OAEP com SHA256 → o mais seguro para RSA actualmente.
# public_exponent=65537 → valor padrão recomendado (primo de Fermat F4).
# ---------------------------------------------------------------------------

def encrypt_with_rsa(data: bytes, public_key_pem: bytes) -> bytes:
    """
    Cifra dados com RSA-2048 usando padding OAEP com SHA256.

    Usado para cifrar a file_key (32 bytes) com a chave pública do utilizador.
    O resultado só pode ser decifrado com a chave privada correspondente.

    Parâmetros:
        data           → os bytes a cifrar (ex: a file_key de 32 bytes)
        public_key_pem → a chave pública em formato PEM

    Devolve os bytes cifrados.
    """
    # Carrega a chave pública a partir do PEM
    public_key = serialization.load_pem_public_key(
        public_key_pem,
        backend=default_backend()
    )

    # Cifra com OAEP + SHA256 — igual do professor pessoal
    ciphertext = public_key.encrypt(
        data,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )

    return ciphertext


def decrypt_with_rsa(ciphertext: bytes, private_key_pem: bytes) -> bytes: # 
    """
    Decifra dados com RSA-2048 usando padding OAEP com SHA256.

    Usado para recuperar a file_key no download — decifra a encrypted_file_key
    com a chave privada do utilizador.

    Parâmetros:
        ciphertext      → os bytes cifrados com RSA
        private_key_pem → a chave privada em formato PEM

    Devolve os bytes originais (ex: a file_key de 32 bytes).
    """
    # Carrega a chave privada a partir do PEM. 
    private_key = serialization.load_pem_private_key(
        private_key_pem,
        password=None,
        backend=default_backend()
    )

    # Decifra com OAEP + SHA256 — igual ao código do professor
    plaintext = private_key.decrypt(
        ciphertext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )

    return plaintext